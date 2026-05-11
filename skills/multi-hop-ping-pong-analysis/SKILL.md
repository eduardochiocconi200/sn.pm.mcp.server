---
name: multi-hop-ping-pong-analysis
description: "Identifies multi-hop routing and ping-pong patterns in ServiceNow Process Mining. Quantifies reassignment tax, surfaces worst ping-pong group pairs, and delivers AI Agent recommendations in a Word report. Trigger on: "ping-pong analysis", "why are tickets bouncing", "reassignment tax", "routing inefficiency", "who is holding tickets longest"."
---

# Multi-hop & Ping-Pong Analyzer

## Overview

This skill identifies and quantifies **multi-hop routing patterns** and **ping-pong scenarios** in ServiceNow Process Mining projects — cases that bounce between assignment groups before reaching resolution. The methodology comes from Dan Grady's Process Mining Use Case Series on multi-hop analysis.

The core insight: when cases are routed through multiple assignment groups, each additional hop adds delay. Ping-pong patterns (A→B→A or A→B→A→B) are especially costly because they indicate unclear ownership, missing information, skill gaps, or routing logic failures. Process Mining surfaces exactly where these patterns occur, how much time they consume, and which specific team pairs are involved — turning "who's holding on to the tickets?" from finger-pointing into actionable improvement.

**Key analysis dimensions:**
- **Multi-hop identification** — Routes with 3+ assignment group transfers before resolution
- **Ping-pong detection** — Bidirectional edges between the same two groups (A↔B)
- **Reassignment tax** — Quantified time cost per additional hop
- **Dwell time analysis** — Which group in each ping-pong pair is holding tickets longest
- **Root cause via work notes** — Why are transfers happening (skill gaps, miscategorization, missing info)
- **AI Agent recommendations** — Specific triaging, auto-resolution, and routing improvements

The MCP tools connect to ServiceNow instances via GraphQL APIs. Multiple instances may be available (e.g., `servicenow-australia`, `servicenow-zurich`). Ask the user which instance to target, or infer from context.

## Prerequisites

- A mined Process Mining project (state: AVAILABLE, progress: 100%)
- **Ideal:** The project uses **Assignment Group** as its Activity Definition — this is the recommended configuration for multi-hop analysis per Dan Grady's blog. The process map will show groups as nodes and transfers as edges.
- **Alternative:** If the project uses **State** as the Activity Definition, the skill can still extract assignment_group transfer patterns from breakdowns and edges, but the analysis will be less granular. The skill will note this limitation and recommend creating an Assignment Group-based project for deeper analysis.

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
Call `list_projects` using the correct `projectPermissionType` for the detected version (see Phase 0 table). Do NOT pass a `query` parameter — call without it and filter results locally by name if needed.

Extract and store these IDs for downstream use:
- `version.id` → for get_project_details, clustering, filters
- `projectDefinition.projectId` → for mining if needed
- `projectEntities[].entityId` → for entity-specific queries and filter construction

### Step 1.2 — Validate the project
Check `state == "AVAILABLE"` and `progress == 100`. If not mined or stale, offer to trigger a mine via `mine_project` and poll `list_projects` until complete.

### Step 1.3 — Determine the Activity Definition type
Check `projectEntities[].activityDefinitions[]` to determine what field is used:
- If `field == "assignment_group"` → **ideal configuration** for multi-hop analysis. Each node IS an assignment group.
- If `field == "state"` → the process map shows state transitions. Assignment group movement can still be analyzed via breakdowns and edges where `field == "assignment_group"`, but the analysis will be less direct.

Inform the user which configuration was detected. If State-based, note: "For the deepest multi-hop analysis, Dan Grady recommends creating a project with Assignment Group as the Activity Definition. I can still extract reassignment patterns from this project's breakdowns and edges, but a dedicated Assignment Group project gives you the full picture."

### Step 1.4 — Pull full project details
Call `get_project_details` with the version ID. Parse the response:

```python
import json
with open('<filepath>') as f:
    raw = json.load(f)
parsed = json.loads(raw[0]['text'])
model = parsed['GlidePromin_Query']['scheduleModel']
```

Extract and store:
- All `nodes[]` — build `node_map = {n['key']: n for n in nodes}`
- All `edges[]` — for transfer analysis
- `findings[]` — especially PINGPONG and REWORK findings
- `breakdowns[]` — baseline distributions for reassignment_count, category, priority, assignment_group
- `aggregates[]` — baseline case count, avg/median duration
- `version.versionEntityConfigs[].controlFlowValueMapping` — maps labels to values

---

## Phase 2: Multi-hop & Ping-Pong Identification

This is the core analytical phase. The approach differs based on the Activity Definition type.

### For Assignment Group-based projects (ideal)

#### Step 2.1 — Build the transfer matrix
From the edges array, build a complete transfer matrix showing every group-to-group handoff:

```python
# Each edge represents a transfer between two assignment groups
transfers = []
for edge in edges:
    from_node = node_map[edge['from']]
    to_node = node_map[edge['to']]
    transfers.append({
        'from_group': from_node['label'],
        'to_group': to_node['label'],
        'from_key': edge['from'],
        'to_key': edge['to'],
        'case_freq': edge['caseFreq'],
        'absolute_freq': edge['absoluteFreq'],
        'avg_duration': edge['avgDuration'],
        'total_duration': edge.get('totalDuration', edge['avgDuration'] * edge['absoluteFreq']),
        'max_reps': edge.get('maxReps', 1)
    })
```

Sort by `total_duration` descending to identify the costliest transfers.

#### Step 2.2 — Detect ping-pong pairs
A ping-pong pair exists when there are edges in BOTH directions between the same two groups:

```python
ping_pong_pairs = []
edge_lookup = {}
for t in transfers:
    key = (t['from_key'], t['to_key'])
    edge_lookup[key] = t

for t in transfers:
    reverse_key = (t['to_key'], t['from_key'])
    if reverse_key in edge_lookup and t['from_key'] < t['to_key']:  # avoid duplicates
        forward = t
        reverse = edge_lookup[reverse_key]
        ping_pong_pairs.append({
            'group_a': forward['from_group'],
            'group_b': forward['to_group'],
            'a_to_b_cases': forward['case_freq'],
            'b_to_a_cases': reverse['case_freq'],
            'a_to_b_avg_duration': forward['avg_duration'],
            'b_to_a_avg_duration': reverse['avg_duration'],
            'total_impact': forward['total_duration'] + reverse['total_duration'],
            'forward_edge': forward,
            'reverse_edge': reverse
        })
```

Sort ping-pong pairs by `total_impact` descending. The top pairs are the most costly ping-pong patterns.

#### Step 2.3 — Identify the "dwell time leader" in each pair
For each ping-pong pair, determine which group is holding tickets longest:
- Compare `a_to_b_avg_duration` vs `b_to_a_avg_duration`
- The group with the longer outbound duration is the one "holding on to tickets the longest"
- This directly answers the classic question Dan Grady calls "the finger pointing report"

#### Step 2.4 — Analyze multi-hop routes via variants
Call `get_variants` with the entity ID, version ID, `variantsLimit: 50`, `variantsOrderByDesc: true`.

For each variant, parse the node path and classify:
- **Direct resolution** (1 group) — Assigned → Resolved, no transfers
- **Single transfer** (2 groups) — One handoff, may be legitimate escalation
- **Multi-hop** (3+ groups) — Multiple transfers, increasing cost per hop
- **Ping-pong variant** — Contains A→B→A or similar back-and-forth in the path

Calculate key metrics:
- % of cases with 0 transfers (direct resolution)
- % with exactly 1 transfer
- % with 2+ transfers (multi-hop)
- % containing a ping-pong pattern within the variant path
- Average duration for each category

Filter and sort variants:
- **By step count** — Show routes with >3 steps (more than one transfer) to isolate multi-hop patterns (mirrors the blog's filter of >4 steps)
- **By volume** — Only include routes with >10 cases to avoid noise
- **By duration** — Sort by average duration descending to find the slowest multi-hop routes

Present the **top 20 multi-hop variants** with their full step sequences (group names in order).

#### Step 2.5 — Extract automated PINGPONG findings
From the `findings[]` array, filter for `type == "PINGPONG"`:
```python
pingpong_findings = [f for f in findings if f.get('type') == 'PINGPONG']
```

For each finding, extract: nodes involved, frequency, total duration, average duration. These complement the edge-based analysis with the platform's own statistical detection.

### For State-based projects (alternative)

If the Activity Definition is State (not Assignment Group), adapt the analysis:

#### Step 2.1-alt — Extract assignment_group edges
Look for edges where nodes have `field == "assignment_group"`. If the model includes assignment group as a secondary dimension, these will appear in the edges or breakdowns.

#### Step 2.2-alt — Use breakdowns for reassignment count
Extract the `reassignment_count` breakdown from the model:
```python
reassignment_bd = next((b for b in breakdowns if 'reassignment' in b.get('field', '').lower()), None)
```

This shows the distribution of reassignment counts across cases. Key metrics:
- % of cases with 0 reassignments
- % with 1–2 reassignments
- % with 3+ reassignments (multi-hop)
- Average duration per reassignment count bucket

#### Step 2.3-alt — Use PINGPONG findings
The automated PINGPONG findings work regardless of Activity Definition type. Extract and analyze as in Step 2.5 above.

#### Step 2.4-alt — Recommend Assignment Group project
Inform the user: "For the full multi-hop analysis including specific group-to-group transfer matrices, ping-pong pair identification, and dwell time by group, I recommend creating a Process Mining project with Assignment Group as the Activity Definition. This is the approach Dan Grady recommends for this type of analysis."

---

## Phase 3: Quantify the Reassignment Tax

### Step 3.1 — Calculate per-hop cost
Using the variant data, calculate the average duration increase per additional hop:

```python
# Group variants by hop count, calculate avg duration per group
hop_buckets = {}  # {hop_count: [durations]}
for variant in variants:
    hop_count = len(variant['nodes']) - 1  # transfers = nodes - 1
    hop_buckets.setdefault(hop_count, []).append(variant['avgDuration'])

for hop_count, durations in sorted(hop_buckets.items()):
    avg = sum(durations) / len(durations)
    # The difference between N-hop avg and (N-1)-hop avg is the marginal cost of one more transfer
```

Present a table showing:

| Hops | Cases | Avg Duration | Marginal Cost per Hop |
|------|-------|-------------|----------------------|
| 0 (direct) | X | Y hours | — |
| 1 | X | Y hours | +Z hours |
| 2 | X | Y hours | +Z hours |
| 3+ | X | Y hours | +Z hours |

This is the "reassignment tax" — the quantified cost of each additional transfer.

### Step 3.2 — Calculate total organizational cost
```
total_multi_hop_cases = cases with 2+ transfers
avg_excess_time = avg_duration(multi_hop) - avg_duration(direct)
total_reassignment_tax = total_multi_hop_cases * avg_excess_time
```

Express in business-friendly terms: total hours/month wasted on unnecessary transfers, FTE equivalent if possible.

### Step 3.3 — Headline metrics comparison
Present a summary comparing baseline vs. multi-hop population:

| Metric | All Cases | Direct (0 transfers) | Multi-hop (2+) | Delta |
|--------|-----------|---------------------|----------------|-------|
| Total cases | X | Y | Z | — |
| Avg duration | X | Y | Z | +N% |
| Median duration | X | Y | Z | — |

---

## Phase 4: Deep Dive — Clustering & Root Cause

### Step 4.1 — Cluster the top ping-pong nodes
For each of the top 3 ping-pong groups (by total impact), run clustering:

Call `cluster_node` with:
- `elementType`: `"CLUSTERING_NODE"`
- `elementId`: `[node_key]` (use the `key` field from nodes array, NOT `nodeStatsId`)
- `filterSets`: `{}`
- `forceSubmit`: `true`

Wait 90–120 seconds, then re-call to check results. When the response type changes from `ScheduledTask` to `GlidePromin_ClusteringResult`, clustering is complete.

**Interpret clusters for routing patterns:**
- Clusters with high category purity → cases being routed to the wrong group by category (triaging issue)
- Clusters with high priority concentration → SLA-driven routing failures
- Clusters with high channel concentration → channel-specific routing rules needed
- Report: cluster ID, size, quality %, concept keywords, purity details

### Step 4.2 — Work notes analysis on top ping-pong transitions
For each of the top 5 ping-pong edges (both directions for each pair), call `transition_work_notes_analysis` with:
- `elementType`: `"WORK_NOTE_ANALYZER"`
- `elementId`: `[from_node_key, to_node_key]` (two node keys, NOT an edge ID)
- `filterSets`: `{}`

Poll by re-calling until `GlidePromin_WorkNoteAnalyzerResult` is returned.

**Interpret work notes for transfer reasons:**
- **"Reassigning to correct team"** → Miscategorization or triage failure
- **"Need input from X team"** → Missing information or unclear ownership
- **"Returning — insufficient info"** → Ping-pong trigger, incomplete handoff
- **High empty work notes %** → Transfers happening without documentation (process gap)
- **Short, formulaic notes** → Routine routing, possible automation candidate

**When empty work notes exceed 60% on any transition**, still analyze and make recommendations based on the data that exists, but include a caveat and a standing recommendation in the report:

> **Caveat:** The work notes analysis on this transition is based on a limited sample — over 60% of transfer records had empty work notes. The findings below reflect the patterns visible in the documented cases, but better-quality results can be extrapolated when a higher documentation rate is enforced on comments or work notes during agent transfers.
>
> **Recommendation — Mandatory Work Notes Business Rule:** Implement a business rule on the workflow form (e.g., sn_customerservice_case, incident) that prevents assignment_group changes from saving when the work_notes field is empty. The rule should fire `before` update when `assignment_group` changes, validate that at least one work note entry exists describing the reason for transfer, and present a blocking modal if the field is empty. This captures the valuable context of what human agents are doing as they fulfill and complete tasks — context that is currently invisible to process mining. Enforcing this documentation enables future process mining analyses to produce significantly more accurate root cause insights on transfer patterns.

### Step 4.3 — (Optional) Create a transition filter to isolate multi-hop cases
If deeper analysis is needed, create a transition filter to isolate cases that passed through 3+ groups. Use the `create_transition_filter` with a multi-step sequence targeting specific group transitions.

Alternatively, use `create_rule_filter` with reassignment_count > 2 to isolate the multi-hop population, then re-pull `get_project_details` with the filter to analyze only multi-hop cases.

---

## Phase 5: Recommendations

### Step 5.1 — Classify each ping-pong pattern
For each identified ping-pong pair, classify the root cause:

| Root Cause | Signal | Recommendation |
|-----------|--------|---------------|
| **Miscategorization** | Work notes mention "wrong team", category mismatch in clusters | AI-powered Triaging Agent at creation |
| **Missing information** | Work notes mention "need more info", bounces happen quickly | Auto-prompt for required fields before routing |
| **Skill gap** | One group consistently bounces back, specific subcategories | Knowledge base enhancement, training |
| **Unclear ownership** | Bidirectional flow with similar volumes in both directions | Define escalation paths, update assignment rules |
| **Process design flaw** | High-volume ping-pong on specific categories | Redesign workflow to eliminate unnecessary handoff |

### Step 5.2 — Generate IMPACT recommendations
For each top-10 ping-pong pattern and multi-hop route, apply the IMPACT framework:
- **I**dentify — Which groups are ping-ponging and on what work?
- **M**easure — Cases/month, avg duration per bounce, total hours/month lost
- **P**ropose — Specific routing improvement (triaging AI Agent, assignment rule change, process redesign)
- **A**utomate — ServiceNow mechanism: AI Agent Studio, Flow Designer, assignment rules, catalog-driven routing
- **C**ompare — Expected reduction in transfers, projected time savings
- **T**imeline — Quick win (<2 weeks), Medium (2–6 weeks), Strategic (6+ weeks)

### Step 5.3 — Calculate total routing improvement opportunity
Sum projected savings:
- Total cases/month affected by ping-pong or multi-hop
- Projected % reduction in unnecessary transfers
- FTE hours/month saved
- Estimated annual savings

---

## Phase 6: Report Generation

**Default:** Generate a Word report using `docx`, `smart-brevity-docx`, and `servicenow-brand-standards` skills.
**Alternative:** If user requests inline, present key findings and ranked tables in chat.

### Report Structure (ALL sections required)

1. **Title** — Compelling headline with the key number (e.g., "1,247 Cases Bouncing Between Teams — Here's Where and Why")

2. **Executive summary** — AI Agent recommendations front and center. Total projected savings from routing improvements. One paragraph with the single most important finding. Then top 3 recommendations with estimated impact. Write like the reader has 60 seconds.

3. **The multi-hop problem** — Explain the methodology: Assignment Group as Activity Definition, variant analysis to classify routes by hop count, edge analysis to detect ping-pong pairs. Why multi-hop matters (each transfer adds X hours on average). How many cases are affected.

4. **Numbers at a glance** — Summary table: total cases, % direct resolution, % single-transfer, % multi-hop, avg duration by hop count, reassignment tax in total hours/month.

5. **The worst ping-pong pairs** — Top 10 ping-pong pairs ranked by total impact. For each: Group A, Group B, cases A→B, cases B→A, avg duration each direction, who holds tickets longest, total impact, root cause classification. This is the "finger pointing report" turned into the "opportunity to improve report."

6. **Who's holding on to the tickets the longest** — Dwell time analysis per group. For each assignment group node: cases, avg dwell time, total time, inbound transfers, outbound transfers. Groups ranked by total time consumed. Dan Grady's "finger pointing report" answered with data.

7. **How cases travel** — Variant analysis. Total variants, % by hop count. Top 20 multi-hop routes with full step sequences, case counts, and avg durations. Notable patterns (e.g., "42% of 4+ hop cases pass through Group X, suggesting it's a routing crossroads").

8. **Why transfers are happening** — Work notes analysis from Phase 4.2. For each top ping-pong pair: empty work note %, cluster summaries, dominant transfer reasons. Root cause classification per pair. **If any transition has >60% empty work notes, still present findings from the available data but include a caveat** that better-quality results can be extrapolated when higher documentation rates are enforced, and recommend a mandatory work notes business rule on the workflow form to capture the valuable work agents perform during transfers.

9. **What the clusters reveal** — Clustering results from Phase 4.1. For each clustered group: total clusters, top 3 by size and quality, category/priority purity, specific patterns. Automation candidates called out.

10. **AI Agent recommendations** — Implementation table: Agent name, what it fixes, trigger, action, cases/month impacted, hours saved/month, priority, effort, timeline.

11. **Next steps** — 5–6 specific numbered actions for the team.

**Voice:** Business-friendly. Lead with the story, back with numbers. Use "Triaging" not "Smart routing" for the AI Agent that routes cases at creation.

---

## Key Technical Gotchas

| Issue | Solution |
|---|---|
| Project must use Assignment Group as Activity Definition for full analysis | Check `activityDefinitions[].field` — if it's `state`, note the limitation and recommend a new project |
| `list_projects` with query parameter may fail | Call without `query` parameter and filter results locally |
| Clustering uses `key` not `nodeStatsId` | Always use the `key` field from nodes array |
| `transition_work_notes_analysis` elementType | Use `"WORK_NOTE_ANALYZER"` — not listed in tool definition but works |
| Work notes requires two node keys | Pass `[from_node_key, to_node_key]`, never an edge ID |
| Large `get_project_details` responses save to file | Parse with `json.load(f)` then `json.loads(raw[0]['text'])` |
| Clustering and work notes are async | Submit with `forceSubmit: true`, wait 90–120 sec, re-call to poll |
| `get_variants` needs entityId and versionId | Both required. Use `variantsLimit: 50`, `variantsOrderByDesc: true` |
| Variant node paths are arrays of node keys | Build a `node_map` from the model to translate keys to labels |
| Ping-pong detection from edges | Check for bidirectional edges: if A→B exists AND B→A exists, it's a ping-pong pair |
| `get_breakdowns` may fail on some instances | Extract breakdowns from `get_project_details` response — nested under `scheduleModel.breakdowns[]` |
| Both advancedTransitions entries need `relation` | Both MUST specify the relation type |
| Transition filter may return ScheduledTask first | Re-call the same tool after 60–120 seconds until it returns a `Model` |
| `entityId` must be consistent | Same `entityId` in `dataFilter`, both `advancedTransitions` entries, and `get_breakdowns` calls |

---

## Adapting to Different Workflows

This skill works on any workflow with assignment groups, not just Incident. Common configurations:

| Workflow | Table | Activity Definition | Key Breakdowns |
|----------|-------|--------------------|----|
| Incident | incident | assignment_group | category, priority, reassignment_count, contact_type |
| HR Case | sn_hr_core_case | assignment_group | hr_service, priority, reassignment_count |
| Customer Service Case | sn_customerservice_case | assignment_group | category, priority, channel, reassignment_count |
| Change Request | change_request | assignment_group | type, risk, category |
| Request Item | sc_req_item | assignment_group | cat_item, priority |

The reassignment_count breakdown is especially valuable — add it to any project for instant visibility into the multi-hop distribution.

---

## Key Terminology

- **Multi-hop** — A case that passes through 3 or more assignment groups before resolution
- **Ping-pong** — A case that bounces back and forth between the same two groups (A→B→A)
- **Reassignment tax** — The quantified additional time consumed by each transfer between groups
- **Dwell time** — How long a case sits with a specific assignment group before being transferred or resolved
- **Transfer matrix** — Complete map of all group-to-group handoffs with frequencies and durations
- **Finger pointing report** — Dan Grady's tongue-in-cheek name for "who's holding tickets longest" analysis
- **Activity Definition** — The field used to define process nodes in Process Mining (assignment_group for multi-hop analysis, state for lifecycle analysis)
- **Variant** — A unique sequence of assignment groups that a case follows from creation to closure
- **Bidirectional edge** — When transfers exist in both directions between two groups (ping-pong signal)
- **Triaging** — The AI Agent capability that routes cases to the correct assignment group at creation (never call this "Smart routing")