---
name: reopened-cases-analysis
description: "Analyzes why cases are being reopened in ServiceNow Process Mining. Scopes the full analysis pipeline — clustering, variant analysis, reassignment tax, work notes — to the reopened population and delivers a Word report. Trigger on: "reopened cases", "why are cases bouncing back", "Resolved to Open", "reopen analysis", "resolution failure"."
---

# Reopened Cases Analyzer

## Overview

This skill runs a **complete process mining analysis** on the subset of cases that were reopened (Resolved → Open/Work In Progress). It first isolates the reopened population using a transition filter, then performs the full analysis workflow — bottleneck analysis with Theory of Constraints, clustering on bottleneck nodes, variant analysis, reassignment tax calculation, category and team performance analysis, work notes analysis on group transfers — all scoped to the filtered reopened population. The output is a comprehensive Word report matching the depth of a full process mining analysis but focused on the reopen problem.

The skill uses ServiceNow Process Mining MCP tools connected via GraphQL APIs. Multiple instances may be available (e.g., `servicenow-zurich`, `servicenow-australia`). Ask the user which instance to target, or infer from context.

## Prerequisites

- A mined Process Mining project (state: AVAILABLE, progress: 100%)
- The project must track `state` as a control flow activity
- The project must have cases that transitioned through a "Resolved" state

## Important Terminology

When referring to the AI Agent that routes cases to the correct assignment group at creation, always use **"Triaging"** — never "Smart routing".

When user asks to ignore the step from "Resolved" to "Closed", exclude the Resolved → Closed edge from all bottleneck analysis, duration calculations, and report content.

---

## ⛔ MANDATORY PRE-FLIGHT — READ BEFORE ANY TOOL CALLS

Before executing **any phase** of this skill, Claude MUST call the `view` tool on all three dependency skills in this order:

1. `/mnt/skills/user/process-miner/SKILL.md` — **required for filterSets payload shapes**. The transition filter payload (Zurich `advancedTransitions` / Australia `transitionChains`) is documented there with working examples. Do NOT attempt to construct a `create_transition_filter` payload from memory.
2. `/mnt/skills/public/docx/SKILL.md` — required before writing any report generation code.
3. `/mnt/skills/user/smart-brevity-docx/SKILL.md` — required before writing any report generation code.

**Do NOT proceed to Phase 0 until all three skills have been read in this session.**

This is not optional. Skipping this step and relying on memory for payload shapes is the most common cause of `create_transition_filter` failures.
---

## Phase 0: Instance & Version Detection

### Step 0.1 — Detect instance version
Call `get_servicenow_version` on the target instance. Store the `version` field — it governs payload shapes for all downstream tools:

| Version | `create_transition_filter` shape | `list_projects` permissionType |
|---|---|---|
| `zurich` | `advancedTransitions` + `transitionConstraints` | `ALL_PROJECTS` |
| `australia` or later | `transitionChains` + `nodeToNodeConstraints` + `conditionType: "SINGLE"` | `ALL` |

> ⚠️ The MCP connection label (e.g., `servicenow-zurich`) does NOT reliably indicate the ServiceNow version. Always call `get_servicenow_version` first.

---

## Phase 1: Project Discovery & Validation

### Step 1.1 — Identify the project
Call `list_projects` using the correct `projectPermissionType` for the detected version (see Phase 0 table). Do NOT pass a `query` parameter — list all and filter locally.

Extract and store these IDs for downstream use:
- `version.id` → for get_project_details, clustering, filters
- `projectDefinition.projectId` → for mining if needed
- `projectEntities[].entityId` → for entity-specific queries and filter construction
- **`activities[].id` where `field == "state"`** → the state activity ID, needed for the VIEW filter

### Step 1.2 — Validate the project
Check `state == "AVAILABLE"` and `progress == 100`. If not mined or stale, offer to trigger a mine via `mine_project` and poll `list_projects` until complete.

### Step 1.3 — Pull full project details using STATE-ONLY VIEW filter (UNFILTERED baseline)

**CRITICAL: Always use the VIEW filter to retrieve a state-only process model.** Projects with multiple activity definitions (e.g., `state` + `assignment_group`) produce interleaved models where assignment group nodes sit between state nodes. This masks the true state-to-state transitions and can hide Resolved → Open/In Progress reopen edges behind intermediate assignment group nodes.

**How to apply the VIEW filter:**

Pass the `filterSets` parameter to `get_project_details` with an `orderedFilters` entry of `type: "VIEW"` that restricts to the state activity ID only:

```json
{
  "adIntentFilter": "",
  "breakdowns": [],
  "dataFilter": [
    {"entityId": "<entityId>", "query": ""}
  ],
  "findingFilter": "",
  "orderedFilters": [
    {
      "type": "VIEW",
      "viewFilter": {
        "activities": ["<state_activity_id>"],
        "entityId": "<entityId>"
      }
    }
  ]
}
```

**Important notes on the VIEW filter:**
- `<entityId>` is from `projectEntities[].entityId` — same value in `dataFilter` and `viewFilter`
- `<state_activity_id>` is the activity ID where `field == "state"` — found in `projectEntities[].activities[]`
- The `viewFilter` field uses `activities` (plural, array of activity ID strings), NOT `activityId`
- The `viewFilter` must include BOTH `activities` and `entityId` fields
- The initial response may return as a `ScheduledTask` (type `GlidePromin_ScheduledTask`) — re-call the same `get_project_details` with the same `filterSets` parameters after 60-120 seconds until it returns a `GlidePromin_Model`
- Poll by checking the `__typename` field: `ScheduledTask` means still computing, `Model` means results are ready
- A 200-case project may take 3-5 minutes; larger projects may take longer

**What the state-only model gives you:**
- Clean state-to-state edges (e.g., New → Assigned → In Progress → Resolved) without assignment group nodes in between
- State node durations that absorb the full time spent in that state, including any assignment group transitions that happened while in that state (e.g., the "Assigned" state absorbs L1→L2→L3 routing time)
- Accurate detection of reopen transitions (Resolved → Open/In Progress) that may be invisible in the combined view
- Reduced node/edge count for faster analysis

**Example:** A project with `state` + `assignment_group` activities might show this in the unfiltered view:
```
... → Resolved → Closed → Completed  (no reopen visible)
```
But with assignment group nodes interleaved, the actual path might be:
```
... → L3 → Resolved → L2 → In Progress → ...  (reopen hidden behind L2 node)
```
The VIEW filter collapses this to:
```
... → Resolved → In Progress → ...  (reopen clearly visible)
```

Extract and store as **baseline** for later comparison:
- All `nodes[]` — build a `node_map = {n['key']: n for n in nodes}`
- All `edges[]` — for transition analysis
- `findings[]` — especially REWORK findings on Resolved state
- `breakdowns[]` — baseline distributions for category, priority, assignment group, reassignment count
- `aggregates[]` — baseline case count, avg/median duration, touchpoints
- `version.versionEntityConfigs[].controlFlowValueMapping` — **critical**: maps state labels to numeric values needed for transition filters

---

## Phase 2: Identify the Reopened Transition

### Step 2.1 — Find the Resolved and Open node keys
Search `nodes[]` for state nodes:
```python
state_nodes = [n for n in nodes if n['field'] == 'state']
resolved_node = next((n for n in state_nodes if n['label'] == 'Resolved'), None)
open_node = next((n for n in state_nodes if n['label'] in ('Open', 'Work In Progress', 'In Progress')), None)
```

Record both the `key` (used for work notes, clustering, show_records) and the `value` (used for transition filter construction).

### Step 2.2 — Find the Resolved → Open edge
```python
reopen_edge = next((e for e in edges if e['from'] == resolved_node['key'] and e['to'] == open_node['key']), None)
```

If this edge exists, record: `caseFreq`, `absoluteFreq`, `avgDuration`, `totalDuration`, `maxReps`.
Calculate: `reopen_rate = reopen_edge['caseFreq'] / resolved_node['caseFreq'] * 100`

If no such edge exists, inform the user that no cases were reopened in this dataset and stop.

### Step 2.3 — Also check Resolved → New
Some cases get pushed all the way back to New state (resolution rejected). Check for this edge too and report it separately.

---

## Phase 3: Create Transition Filter to Isolate Reopened Cases

### Step 3.1 — Build and submit the transition filter
The `create_transition_filter` tool accepts a `filterSets` parameter with this exact structure:

```json
{
  "dataFilter": [
    {"entityId": "<entityId>", "query": ""}
  ],
  "breakdowns": [],
  "findingFilter": "",
  "adIntentFilter": "",
  "orderedFilters": [
    {
      "type": "TRANSITION",
      "advancedTransitions": [
        {
          "advancedTransitions": [
            {
              "entityId": "<entityId>",
              "field": "state",
              "predicate": "EQ",
              "occurrence": "ALWAYS",
              "relation": "FOLLOWED_BY",
              "context": null,
              "values": ["<resolved_numeric_value>"]
            },
            {
              "entityId": "<entityId>",
              "field": "state",
              "predicate": "EQ",
              "occurrence": "ALWAYS",
              "relation": "FOLLOWED_BY",
              "context": null,
              "values": ["<open_numeric_value>"]
            }
          ],
          "transitionConstraints": []
        }
      ]
    }
  ]
}
```

**Important notes:**
- `entityId` is from `projectEntities[].entityId` — same value in all three places
- `values` must be arrays of **numeric state value strings** (e.g., `["6"]` not `["Resolved"]`)
- Both entries use `"relation": "FOLLOWED_BY"` (not EVENTUALLY_FOLLOWED_BY)
- The `dataFilter` requires both `entityId` and `query` (can be empty string `""`)
- The response may return as a `ScheduledTask` first — re-call the same tool after 60-120 seconds until it returns a `Model`

### Step 3.2 — Parse the filtered model
The response returns a full filtered process model. Extract and store as the **reopened population** data:
- `aggregates[]` — filtered case count, variant count, avg/median/stdDev duration, touchpoints
- `breakdowns[]` — filtered breakdowns (assignment_group, category, subcategory, priority, reassignment_count)
- `nodes[]` and `edges[]` — the filtered process model (only cases that went Resolved → Open)

---

## Phase 4: Full Process Mining Analysis on Reopened Population

This is where the skill diverges from a simple comparison. Run the COMPLETE process mining analysis on the filtered reopened population, just as you would on an unfiltered project.

### Step 4.1 — Bottleneck analysis (Theory of Constraints)
From the **filtered** model nodes, rank by total duration impact:
```python
impact = node['avgDuration'] * node['absoluteFreq']
```
Skip: Resolved (unless specifically relevant), Closed, Completed, Created nodes.
Identify the top 3-5 bottleneck nodes. For each, report: label, case frequency, average duration, total impact in case-days, max repetitions.

### Step 4.2 — Reassignment tax table
From the **filtered** reassignment_count breakdown, build a table showing:
- Reassignment count (0, 1, 2, 3, 4, 5+)
- Cases at each level
- Average days at each level
- Extra days vs zero reassignments
- Multiplier vs zero reassignments
Determine: what % of reopened cases had zero reassignments? This drives the root cause classification (resolution quality vs routing).

### Step 4.3 — Category impact table
From the **filtered** category breakdown, build a table showing:
- Category name, reopened case count, % of reopened, avg duration, total case-days impact
- Compare each category's % in reopened vs % in overall baseline — flag over/under-represented categories (+/-2pp threshold)
- Sort by total impact (cases × avg duration)
- Include an "Automate?" verdict column based on clustering insights

### Step 4.4 — Priority comparison
From the **filtered** priority breakdown, compare each priority level's representation in reopened vs overall. Flag over-represented priorities (indicates SLA pressure causing premature closure).

### Step 4.5 — Team performance table
From the **filtered** assignment_group breakdown, build a table showing:
- Team name, reopened case count, % of reopened vs % of overall, avg duration, std deviation, variant count
- Consistency assessment based on stdDev relative to avg
- Verdict column: Automate | Needs review | Red flag | Best practice (if under-represented)

### Step 4.6 — Variant analysis
Call `get_variants` with the entity ID, version ID, `variantsLimit: 50`, `variantsOrderByDesc: true`.
Parse each variant's node path using the node_map from the filtered model. Classify each variant:
- Clean single-touch (one assignment group, no Pending, no additional rework beyond the initial reopen)
- With Pending detour
- With additional rework loops
- Multi-hop (2+ assignment groups)

Display top 20 variants with their step sequences (e.g., Created → Open → L1 → Resolved → Open → Resolved).
Calculate summary: % clean, % with pending, % with rework, % multi-hop.

---

## Phase 5: Clustering on Reopened Population's Bottleneck Nodes

### Step 5.1 — Select nodes for clustering
From Phase 4.1, take the top 2 bottleneck nodes (by total duration impact, excluding Resolved/Closed/Completed/Created).

### Step 5.2 — Run clustering
Call `cluster_node` with:
- `elementType`: `"CLUSTERING_NODE"`
- `elementId`: `[node_key]` (use the `key` field from nodes array, NOT `nodeStatsId`)
- `filterSets`: `{}`
- `forceSubmit`: `true`

Wait 90-120 seconds, then re-call to check results. When the response type is `GlidePromin_ClusteringResult`, clustering is complete.

### Step 5.3 — Interpret clusters in detail
For each cluster, record: cluster ID, size, quality score, concept keywords, purity details.
- Report the top 3 clusters by size AND top 3 by quality (may overlap)
- For each cluster: size, quality %, concept keywords, category purity (% and which category), assignment group purity
- Clusters with >90% quality → auto-resolution candidates with specific descriptions
- Clusters with 100% quality → "deployable with zero exception handling"
- Note patterns across clusters (e.g., "3 of the top 5 clusters are pinpad/POS hardware issues")

---

## Phase 6: Work Notes Analysis

### Step 6.1 — Run work notes on the Resolved → Open transition
Call `transition_work_notes_analysis` with:
- `elementType`: `"WORK_NOTE_ANALYZER"` (undocumented enum — works but not listed)
- `elementId`: `[resolved_node_key, open_node_key]` (two node keys, NOT an edge ID)
- `filterSets`: `{}`

Poll by re-calling until `GlidePromin_WorkNoteAnalyzerResult` is returned.

### Step 6.2 — Assess documentation quality
Calculate empty work notes %. Report all stats: empty count, short count, long count, unprocessed count, processed count, total records.
- If >50% empty → flag as documentation gap
- If clusters generated → summarize each cluster's analysis text
- If 0 clusters → note this explicitly

### Step 6.3 — Run work notes on top 5 group-to-group transfers
From the **filtered** model edges, identify top 5 edges where both `from` and `to` nodes have `field == "assignment_group"`. Sort by `caseFreq` descending.

For each, call `transition_work_notes_analysis` with `[from_node_key, to_node_key]`. Submit all simultaneously, wait 120 seconds, then retrieve all results.

For each transfer, summarize in the report:
- Transfer direction (e.g., "L1 → RTS"), case count, avg duration
- Work note stats (empty %, clusters generated)
- Each cluster's analysis text
- Whether the transfer is: legitimate escalation, bounce-back from incomplete info, avoidable routing error, or undocumented
- AI Agent opportunity for each transfer

---

## Phase 7: Generate Detailed Report

### Step 7.1 — Compile all findings
Use the IMPACT framework for each AI Agent recommendation.

### Step 7.2 — Generate Word document
Use `docx` skill, `smart-brevity-docx` skill, and `servicenow-brand-standards` skill.

**Report structure (ALL sections required — this is what makes the report comprehensive):**

1. **Title** — Compelling headline with the key number (e.g., "623 Cases Getting a Second Life They Don't Deserve")

2. **Executive summary** — AI Agent recommendations front and center. Total projected savings. One paragraph with the single most important finding. Then each agent recommendation with its estimated impact. Write like the reader has 60 seconds.

3. **Numbers at a glance** — Summary table: reopened cases, variants, avg duration (reopened vs baseline), median duration (reopened vs baseline), touchpoints, multipliers.

4. **Where reopened cases get stuck** — Bottleneck nodes from Phase 4.1 with full clustering results from Phase 5. For each bottleneck: node label, cases, avg duration, total impact. Then clustering details: total clusters found, top 3 by size with quality/concept/purity, top 3 by quality with size/concept/purity. Specific automation candidates called out.

5. **The reassignment tax** — Full table from Phase 4.2. How each reassignment affects duration. Zero-reassignment percentage and what it means.

6. **What's eating the most time** — Category impact table from Phase 4.3. Top 10-15 categories with cases, avg days, total case-days, reopened % vs overall %, difference in pp, automate? verdict.

7. **How reopened cases travel** — Variant analysis from Phase 4.6. Total variants, coverage %. Top 20 variant paths with step sequences. Summary: % clean, % pending, % rework, % multi-hop. Notable patterns.

8. **Team performance** — Full table from Phase 4.5. All teams with cases, avg days, consistency, variant count, % of reopened vs overall, verdict. Call out best performers and red flags.

9. **Why cases are being transferred** — Work notes from Phase 6.3. Each of the top 5 transfers with full cluster analysis. AI Agent opportunity per transfer.

10. **Why cases are being reopened** — Work notes from Phase 6.1-6.2. Documentation gap %. Cluster summaries. Root cause classification.

11. **AI Agent recommendations** — Implementation table: Agent name, phase, weeks, annual savings, cases targeted, priority, effort.

12. **Next steps** — 5-6 specific numbered actions for the team.

**Voice:** Business-friendly. Imagine the reader skipped statistics class. Lead with the story, back with numbers. Cut the jargon. Use "Triaging" not "Smart routing".

---

## Key Technical Gotchas

| Issue | Solution |
|---|---|
| **Projects with multiple activity definitions (state + assignment_group) hide reopen transitions** | **Always use the VIEW filter** in `get_project_details` to retrieve a state-only model. Pass `orderedFilters: [{type: "VIEW", viewFilter: {activities: ["<state_activity_id>"], entityId: "<entityId>"}}]`. This collapses assignment group nodes and reveals true state-to-state transitions including reopens. |
| VIEW filter field name is `activities` (plural, array) not `activityId` | Use `"viewFilter": {"activities": ["<id>"], "entityId": "<entityId>"}` — `activityId` will throw a GraphQL `ValidationError` |
| VIEW filter returns `ScheduledTask` first | Re-call `get_project_details` with the same `filterSets` after 60-120 seconds. Check `__typename` — `ScheduledTask` = still computing, `Model` = ready. May take 3-5 minutes for small projects, longer for large ones. |
| `get_breakdowns` may fail on some instances (GraphQL schema error) | Extract breakdowns from `get_project_details` response — nested under `scheduleModel.breakdowns[]` |
| `transition_work_notes_analysis` elementType enum | Use `"WORK_NOTE_ANALYZER"` — not listed in tool definition but works |
| Work notes and show_records on edges require node key pairs | Always pass `[from_node_key, to_node_key]`, never an edge ID |
| `show_records` elementType for edges | Use `"RECORD_ARC"` — discovered from `promin_scheduled_task` table |
| `show_records_http` returns HTML login page | Session auth issue via MCP. Use `query_table` on the source table instead |
| State values in transition filters must be numeric strings | Extract from `controlFlowValueMapping` or `nodes[].value` — e.g., `"6"` not `"Resolved"` |
| `list_projects` with `projectPermissionType: "ALL_PROJECTS"` may fail | Retry without the parameter — omitting it returns all accessible projects |
| Clustering uses `key` not `nodeStatsId` | Always use the `key` field from nodes array |
| Large `get_project_details` responses save to file | Parse with `json.load(f)` then `json.loads(raw[0]['text'])` |
| Both advancedTransitions entries use FOLLOWED_BY | Do NOT use EVENTUALLY_FOLLOWED_BY — use FOLLOWED_BY for both entries |
| Clustering and work notes are async | Submit job, wait 90-120 seconds, re-call same tool to check. If still `ScheduledTask`, wait longer |
| Empty work notes are common on reopen transitions (80%+) | Always report the empty % as a finding — the documentation gap itself is actionable |
| Transition filter may return ScheduledTask first | Re-call the same `create_transition_filter` with same parameters after 60-120 seconds until it returns a `Model` |
| `get_variants` needs entityId and versionId | Both required. Use variantsLimit=50, variantsOrderByDesc=true for top variants by frequency |
| Variant node paths are arrays of node keys | Build a node_map from the filtered model to translate keys to labels for display |