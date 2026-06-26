---
name: reopened-cases-analysis
description: 'Analyzes why cases are being reopened in ServiceNow Process Mining. Scopes the full analysis pipeline — clustering, variant analysis, reassignment tax, work notes — to the reopened population and delivers a Word report. Trigger on: "reopened cases", "why are cases bouncing back", "Resolved to Open", "reopen analysis", "resolution failure".'
---

# Reopened Cases Analyzer

## Overview

Runs a complete process mining analysis scoped to cases that were reopened (Resolved → Open/Work In
Progress). Isolates the reopened population, then performs full bottleneck analysis (Theory of
Constraints), clustering, variant analysis, reassignment tax, category and team performance, and work
notes analysis — all scoped to the filtered reopened population. Output is a comprehensive Word report.

**Prerequisites:**
- A mined project (state: AVAILABLE, progress: 100%)
- The project must track `state` as a control flow activity
- The project must have cases that transitioned through a "Resolved" state

**Terminology note:** Always use **"Triaging"** for the AI Agent that routes cases to the correct
assignment group at creation — never "Smart routing". When user asks to exclude the Resolved→Closed
step, exclude that edge from all bottleneck analysis and duration calculations.

---

## ⛔ MANDATORY PRE-FLIGHT

Before executing any step, Claude MUST read these three skills in order:

1. `/mnt/skills/user/process-miner/SKILL.md` — required for filterSets payload shapes
2. `/mnt/skills/public/docx/SKILL.md` — required before writing any report code
3. `/mnt/skills/user/smart-brevity-docx/SKILL.md` — required before writing any report code

**Do NOT proceed to Step 1 until all three have been read in this session.**

---

## Step 1 — Detect Instance Version

Call `get_servicenow_version`. Store `version` — governs payload shapes for all downstream tools.

| Version | `list_projects` permissionType | Transition filter shape |
|---|---|---|
| `zurich` | `ALL_PROJECTS` | `advancedTransitions` + `transitionConstraints` |
| `australia` or later | `ALL` | `transitionChains` + `nodeToNodeConstraints` |

---

## Step 2 — Identify and Validate Project

Call `list_projects` using the correct `projectPermissionType` from Step 1. Do NOT pass a `query`
parameter — list all and filter locally.

**Extract and store:**
- `version.id` — for all downstream tool calls
- `projectDefinition.projectId` — for mining if needed
- `projectEntities[].entityId` — for filterSets
- `activities[].id` where `field == "state"` — the **state activity ID** for the VIEW filter

Check `state == "AVAILABLE"` and `progress == 100`. If not, offer `mine_project` and poll until
complete.

---

## Step 3 — Retrieve Baseline State-Only Model

**Always use the VIEW filter.** Projects with both `state` and `assignment_group` activities produce
interleaved models where assignment group nodes sit between state nodes, hiding Resolved → reopen
edges. The VIEW filter collapses these into a clean state-to-state model.

Call `get_project_details` with this filterSet:

```json
{
  "adIntentFilter": "", "breakdowns": [], "dataFilter": [{"entityId": "<entityId>", "query": ""}],
  "findingFilter": "",
  "orderedFilters": [{
    "type": "VIEW",
    "viewFilter": { "activities": ["<state_activity_id>"], "entityId": "<entityId>" }
  }]
}
```

**Important:** `viewFilter` uses `activities` (plural, array) — not `activityId`. Poll if first
response is `GlidePromin_ScheduledTask`. May take 3–5 minutes.

**Extract and store as baseline:**
- All `nodes[]` — build `node_map = {n['key']: n for n in nodes}`
- `aggregates[]` — baseline case count, avg/median/stdDev duration
- `breakdowns[]` — channel, category, priority, assignment group distributions
- `findings[]` — REWORK, PINGPONG, EXTRA_STEP findings
- `edges[]` — identify the **reopen edge**: Resolved → Open (or Resolved → In Progress)

**Identify and store:**
- `resolved_node_key` — key of the Resolved node
- `open_node_key` — key of the Open (or In Progress) node that reopened cases flow into

---

## Step 4 — Create Reopen Transition Filter

Build the filterSet isolating cases that transitioned Resolved → Open/In Progress. Use the payload
shape for your instance version from the process-miner skill's filterSets Payload Reference.

Key values:
- `start_state_value` = value of the Resolved state node (e.g., `"6"`)
- `end_state_value` = value of the Open/In Progress node (e.g., `"1"` or `"2"`)
- No duration constraint — reopens can happen at any interval

Call `create_transition_filter` (or `get_project_details` with filterSets if `create_transition_filter`
has bugs on this instance). Poll until `GlidePromin_Model` is returned.

**Extract the reopened population:**
- `caseCount` — total reopened cases
- `variantCount` — number of distinct reopen paths
- `avgCaseDuration`, `medianDuration`, `stdDeviation`
- All nodes and edges in the filtered model
- Breakdowns by category, channel, priority, assignment group

**Calculate:** reopen rate = filtered caseCount / baseline caseCount × 100

---

## Step 5 — Analyse Bottleneck Nodes (Theory of Constraints)

From the filtered model, rank all nodes by total duration impact (caseFreq × avgDuration). Exclude
Resolved, Closed, Completed, and Created nodes — focus on active work states and assignment groups.

**For the top 2 bottleneck nodes:**
- Node label, cases, avg duration, total impact
- maxReps (rework indicator)
- Inbound and outbound edge analysis

**Apply Theory of Constraints:**
1. **IDENTIFY** — the top bottleneck node
2. **EXPLOIT** — cluster it (Step 6) to understand why cases pile up here
3. **SUBORDINATE** — examine upstream edges for batching or delay patterns
4. **ELEVATE** — propose automation or staffing recommendations
5. **REPEAT** — identify the next constraint

---

## Step 6 — Cluster Top Bottleneck Nodes *(skip if population < 100 cases)*

Check the reopened population `caseCount` from Step 4. If < 100, note the limitation and skip.

For each of the top 2 bottleneck nodes from Step 5, call `cluster_node`:
- `elementType`: `"CLUSTERING_NODE"`
- `elementId`: `[node_key]` — use `key`, NOT `nodeStatsId`
- `filterSets`: `{}`
- `forceSubmit`: `true`

Wait 90–120 seconds. When `GlidePromin_ClusteringResult` is returned, interpret:
- Top 3 clusters by size AND top 3 by quality (may overlap)
- For each: size, quality %, concept keywords, category purity, assignment group purity
- Quality >90% → auto-resolution candidate; quality 100% → "deployable with zero exception handling"

---

## Step 7 — Reassignment Tax Analysis

From the `reassignment_count` breakdown in the filtered model, compare avg case duration across
reassignment buckets (0, 1, 2, 3+). Calculate the tax per additional hop.

Report: zero-reassignment %, multi-hop %, avg duration by hop count, total hours lost to unnecessary
reassignments in the reopened population.

---

## Step 8 — Category Performance Analysis

From the category breakdown in the filtered model, for each category:
- Cases in reopened population
- Avg duration (days)
- Total case-days consumed
- Reopened % vs overall baseline %
- Delta in percentage points (over/under-represented)
- Automation verdict

Rank by total case-days descending. Flag categories where reopened % significantly exceeds baseline
% — these are disproportionate contributors to the reopen problem.

---

## Step 9 — Team Performance Analysis

From the assignment group breakdown in the filtered model, for each team:
- Cases in reopened population vs overall baseline
- Avg duration, consistency (stdDev)
- Variant count (higher = more complex cases)
- Reopened % vs overall %
- Verdict (performing well / needs attention / red flag)

Call out best performers and red flags explicitly.

---

## Step 10 — Variant Analysis of Reopened Population

Call `get_variants` with `versionId`, `entityId`, `variantsLimit: 50`, `variantsOrderByDesc: true`,
scoped to the reopen filterSets.

For each variant, build the step sequence using `node_map`. Classify:
- Clean single-touch (one assignment group, no Pending, no additional rework)
- With Pending detour
- With additional rework loops
- Multi-hop (2+ assignment groups)

Display top 20 variants. Report: % clean, % with Pending, % with rework, % multi-hop.

---

## Step 11 — Work Notes Analysis: Reopen Transition

Call `transition_work_notes_analysis`:
- `elementType`: `"WORK_NOTE_ANALYZER"`
- `elementId`: `[resolved_node_key, open_node_key]` (both node keys from Step 3, NOT an edge ID)
- `filterSets`: `{}`

Poll until `GlidePromin_WorkNoteAnalyzerResult` is returned.

Report: empty work note %, cluster summaries (if any), root cause classification. If >50% empty,
flag as documentation gap — the gap itself is an actionable finding, not just a data quality issue.
Always recommend a mandatory resolution notes field if empty work notes are prevalent.

---

## Step 12 — Work Notes Analysis: Top 5 Group Transfers

From the filtered model edges, identify the top 5 edges where both `from` and `to` nodes have
`field == "assignment_group"`. Sort by `caseFreq` descending.

For each, call `transition_work_notes_analysis` with `[from_node_key, to_node_key]`. Submit all
simultaneously, wait 120 seconds, then retrieve all results.

For each transfer: direction, case count, avg duration, empty %, clusters, AI Agent opportunity.

---

## Step 13 — Generate Word Report

Read `docx` and `smart-brevity-docx` skills before writing code.

**Report structure (all sections required):**

1. Title — headline with the key number (e.g., "623 Cases Getting a Second Life They Don't Deserve")
2. Executive summary — AI Agent recommendations + total projected savings. 60-second read.
3. Numbers at a glance — reopened cases, variants, avg/median duration vs baseline, reopen rate
4. Where reopened cases get stuck — bottleneck nodes from Step 5 + clustering from Step 6
5. The reassignment tax — full table from Step 7
6. What's eating the most time — category impact table from Step 8 (top 10–15 categories)
7. How reopened cases travel — variant analysis from Step 10 (top 20 paths, % classification)
8. Team performance — full table from Step 9 (all teams, best performers, red flags)
9. Why cases are being transferred — work notes per top 5 transfers from Step 12
10. Why cases are being reopened — work notes from Step 11 with documentation gap assessment
11. AI Agent recommendations — implementation table: agent name, phase, weeks, annual savings,
    cases targeted, priority, effort
12. Next steps — 5–6 numbered actions

**Voice:** Business-friendly. Imagine the reader skipped statistics class. Lead with the story, back
with numbers. Cut the jargon. Use "Triaging" not "Smart routing".

---

## Key Technical Gotchas

| Issue | Solution |
|---|---|
| Multiple activity definitions hide reopen transitions | Always use the VIEW filter in Step 3 |
| VIEW filter field name is `activities` (plural, array) | Not `activityId` — will throw `ValidationError` |
| VIEW filter returns `ScheduledTask` first | Re-call after 60–120 seconds, poll until `Model` |
| `transition_work_notes_analysis` elementType | Use `"WORK_NOTE_ANALYZER"` (undocumented but works) |
| Work notes requires two node keys | Pass `[from_key, to_key]`, never an edge ID |
| Clustering uses `key` not `nodeStatsId` | Always use `key` from nodes array |
| Large `get_project_details` saves to file | Parse with `json.load(f)` then `json.loads(raw[0]['text'])` |
| Clustering and work notes are async | Submit, wait 90–120s, re-call to poll |
| Empty work notes are common on reopen transitions | Report empty % as a finding — the gap is itself actionable |
| State values must be numeric strings in transition filters | Extract from `controlFlowValueMapping` or `nodes[].value` |
