---
name: automation-analysis
description: "End-to-end automation candidate analysis for ServiceNow Process Mining. Isolates quick-touch cases via transition filter, runs clustering and work notes analysis, and generates a ranked AI Agent recommendations report. Trigger on: "run the full analysis", "find automation candidates", "what can I automate", "end-to-end pipeline"."
---

# Process Mining — End-to-End Automation Analysis

## Overview

This skill executes a full Process Mining automation analysis pipeline, from instance setup through Word report generation. It combines state view retrieval, transition filtering, bottleneck and clustering analysis, work notes investigation, and AI Agent recommendations into a single cohesive workflow.

The methodology isolates **quick-touch cases** — work that transitions between a start and end state within a configurable time window (default 2–30 minutes). This window captures routine, manual work that is ideal for AI Agent automation.

**Depends on:**
- `process-miner` skill — MCP tool reference, filterSets payload shapes, polling patterns
- `docx` + `smart-brevity-docx` skills — Word report generation
- `servicenow-brand-standards-reference` — brand compliance for output

---

## ⛔ MANDATORY PRE-FLIGHT — READ BEFORE ANY TOOL CALLS

Before executing **any phase** of this skill, Claude MUST call the `view` tool on all three dependency skills in this order:

1. `/mnt/skills/user/process-miner/SKILL.md` — **required for filterSets payload shapes**. The transition filter payload (Zurich `advancedTransitions` / Australia `transitionChains`) is documented there with working examples. Do NOT attempt to construct a `create_transition_filter` payload from memory.
2. `/mnt/skills/public/docx/SKILL.md` — required before writing any report generation code.
3. `/mnt/skills/user/smart-brevity-docx/SKILL.md` — required before writing any report generation code.

**Do NOT proceed to Phase 0 until all three skills have been read in this session.**

This is not optional. Skipping this step and relying on memory for payload shapes is the most common cause of `create_transition_filter` failures.

---

## Phase 0: Instance & Project Setup

### Step 0.1 — Detect instance version
Call `get_servicenow_version` on the target instance. Store the `version` field — it governs payload shapes for **all** downstream tools:

| Version | `create_transition_filter` shape | Deep-dive tool (Phase 4) |
|---|---|---|
| `zurich` | `advancedTransitions` + `transitionConstraints` | `cluster_node` + `transition_work_notes_analysis` |
| `australia` or later | `transitionChains` + `nodeToNodeConstraints` + `conditionType: "SINGLE"` | `intent_and_activity_analysis` only |

> ⚠️ The MCP connection label (e.g., `servicenow-zurich`) does NOT reliably indicate the ServiceNow version. Always call `get_servicenow_version` first.

### Step 0.2 — List and select project
Call `list_projects` with the correct `projectPermissionType` for the instance:
- **Zurich**: `CREATED_BY_ME` (or `SHARED_WITH_ME`)
- **Australia / later**: `ALL` or `CREATED_BY_ME`

Do NOT pass a `query` parameter — list all and filter locally.

Present to user: project name, case count, variant count, avg duration, last mined date, state.

**Extract and store:**
- `version.id` → used in all downstream tool calls
- `projectDefinition.projectId` → for mining if needed
- `projectEntities[].entityId` → for all filterSets
- State activity `id` (where `field == "state"`) → **state activity ID** for VIEW filter
- Assignment group activity `id` → available for blended view if needed

### Step 0.3 — Validate project readiness
- Confirm `state == "AVAILABLE"` and `progress == 100`
- If not mined or stale → offer `mine_project`, poll `list_projects` until complete

---

## Phase 1: State View Retrieval

### Step 1.1 — Retrieve project details with state VIEW filter
Call `get_project_details` with a `filterSets` VIEW filter scoped to the **state activity only**. This strips assignment group nodes and returns a cleaner, lower-variant process map.

```json
{
  "orderedFilters": [
    {
      "type": "VIEW",
      "viewFilter": [{ "entityId": "<entityId>", "activities": ["<state_activity_id>"] }]
    }
  ]
}
```

> ⚠️ **Polling required.** The first response may be a `GlidePromin_ScheduledTask` (state 0, progress 0). Re-call the same tool repeatedly — do not give up within 2 minutes. Continue until `GlidePromin_Model` is returned.

### Step 1.2 — Parse and present the state model
Extract and summarise:

**Aggregates:** case count, variant count, avg/median/stdDev duration

**Nodes** (sorted by total time impact = absoluteFreq × avgDuration):
- Label, caseFreq, absoluteFreq, maxReps, avgDuration, totalDuration
- Flag: high-dwell states (potential bottlenecks), states with maxReps > 1 (rework)

**Edges** (top 20 by caseFreq):
- From → To, caseFreq, avgDuration, medianDuration
- Flag: backward edges (rework), high-volume slow transitions

**Findings:** categorised by type — AUTOMATION, QUALITY, PERFORMANCE, CONFORMANCE

**Breakdowns:** channel, priority, category, assignment group distributions

### Step 1.3 — Identify transition pair
From the state nodes, identify:
- **Start state** — where human agent active work begins (e.g., In Progress, Work In Progress)
- **End state** — where work is marked complete (e.g., Resolved, Closed Complete)
- Note their numeric `value` fields (e.g., `"2"` for In Progress, `"6"` for Resolved)

**Common workflow configurations:**

| Workflow | Start State | End State | Suggested Window |
|---|---|---|---|
| Incident | In Progress | Resolved | 2–30 min |
| HR Case | Work In Progress | Closed Complete | 2–30 min |
| Customer Service | Work In Progress | Resolved | 2–30 min |
| Change Request | Implement | Review | 5–60 min |
| Request Item | Open | Closed Complete | 1–15 min |

---

## Phase 2: Transition Filter Creation

### Step 2.1 — Confirm filter parameters with user
Present proposed start state, end state, and duration window. Adjust if user specifies different states or time bounds.

### Step 2.2 — Build and submit the transition filter
Call `create_transition_filter` combining:
1. **VIEW filter** — same state activity scope as Phase 1
2. **TRANSITION filter** — start state `FOLLOWED_BY` end state with duration constraint

Duration values are in **seconds**: 2 min = `120`, 30 min = `1800`.

See the `process-miner` skill's **filterSets Payload Reference** for the correct payload shape per instance version (Zurich uses `advancedTransitions`; Australia/later uses `transitionChains`).

Name the filter descriptively: e.g., `"In Progress → Resolved (2–30 min)"`.

> ⚠️ **Polling required.** First response is typically a `GlidePromin_ScheduledTask`. Re-call the same `create_transition_filter` with identical parameters repeatedly until `GlidePromin_Model` is returned.

### Step 2.3 — Parse the filtered model
Store as the **quick-touch population**. Extract:
- `aggregates[].model` → filtered caseCount, variantCount, avgCaseDuration, medianDuration, stdDeviation
- `nodes[]` → all state nodes in the filtered population, with their `key` values
- `edges[]` → transitions, especially the qualifying start→end edge
- `breakdowns[]` → channel, category, priority, assignment group breakdown within filtered population

**Calculate:**
```
automation_opportunity_rate = filtered_caseCount / baseline_caseCount × 100
```

**Store node keys** for Phase 4:
- `start_node_key` → `nodes[].key` where `value == "<start_state_value>"`
- `end_node_key` → `nodes[].key` where `value == "<end_state_value>"`

---

## Phase 3: Full Analysis on Quick-Touch Population

### Step 3.1 — Headline metrics
Compute and present:

| Metric | Baseline | Quick-Touch | Delta |
|---|---|---|---|
| Total cases | X | Y (Z%) | — |
| Automation opportunity rate | — | Z% | — |
| Avg case duration | X days | Y days | — |
| Avg duration excl. Res→Close* | X | Y min | — |
| Median duration | X | Y | — |
| In Progress → Resolved avg | — | Y min | — |
| Variants | X | Y | — |
| Avg touchpoints | X | Y | — |

*Adjusted duration: subtract the Resolved→Closed edge `avgDuration` from overall `avgCaseDuration` to reveal true work time. Formula:
```python
res_to_close_avg = next(e['avgDuration'] for e in edges
    if node_map[e['from']]['label'] == 'Resolved'
    and node_map[e['to']]['label'] == 'Closed')
adjusted_duration = avgCaseDuration - res_to_close_avg
```

### Step 3.2 — Bottleneck analysis
From filtered model nodes, rank by total time impact:
- Identify the **start transition node** as the primary automation target
- Flag surrounding wait states (On Hold, Awaiting Caller Info, etc.) — these are eliminated by AI Agent deployment
- Note any nodes with maxReps > 1 (rework loops)

### Step 3.3 — Breakdown analysis
From filtered model `breakdowns[]`, surface dominant segments:
- Top categories/subcategories → become specific AI Agent use cases
- Top assignment groups → become team-specific deployment targets
- Channel distribution → informs AI Agent trigger channel

### Step 3.4 — Variant analysis *(optional, if variantCount > 1)*
Call `get_variants` scoped to the same filterSets:
- `versionId`, `entityId`, `variantsLimit: 50`, `variantsOrderByDesc: true`
- Identify single-touch variants (straight path, no rework) → highest automation confidence
- Calculate single-touch %: cases in top 1–2 variants / total filtered cases

---

## Phase 4: Deep Dive — Clustering & Work Notes

### Step 4.0 — Population size check (MANDATORY before clustering)
> ⚠️ **If filtered caseCount < 100 → skip `cluster_node` entirely.**
> Note: *"Dataset too small for reliable ML segmentation (N cases < 100 minimum). Skipping clustering. Proceeding to work notes analysis."*
> Proceed directly to Step 4.2.

### Step 4.1a — Intent & Activity Analysis *(Australia / later only)*
Call `intent_and_activity_analysis` with:
- `elementType`: `"AGENT_ACTIVITY_ANALYZER_NODE"`
- `elementId`: `[start_node_key]`
- `filterSets`: same VIEW + TRANSITION filterSets from Phase 2
- `clusterResultCount`: 5–10

This is async — first call submits the job. Re-poll after 90–120 seconds until result returns.

Interpret:
- **Intent descriptions** → each maps to an AI Agent capability
- **Activity clusters** → each represents a distinct AI Agent workflow
- **Resolution patterns** → become the AI Agent's action sequence

After Step 4.1a, **skip Step 4.1b and 4.2** — intent analysis replaces both on Australia.

### Step 4.1b — Clustering *(Zurich only, ≥100 cases)*
Call `cluster_node` with:
- `elementId`: `[start_node_key]` (use `key` field — NOT `nodeStatsId`)
- `elementType`: `"CLUSTERING_NODE"`
- `filterSets`: same VIEW + TRANSITION filterSets from Phase 2
- `forceSubmit: false`
- `clusterResultCount`: 10–20

First response is `GlidePromin_ScheduledTask` → poll until `GlidePromin_ClusteringResult`.

Interpret:
- Quality >90% → specific AI Agent candidate, named use case
- Quality 100% → deployable with zero exception handling
- Report: cluster size, quality %, concept keywords, purity by category/assignment group

### Step 4.2 — Work Notes Analysis *(Zurich only)*
Call `transition_work_notes_analysis` with:
- `elementType`: `"WORK_NOTE_ANALYZER"`
- `elementId`: `[start_node_key, end_node_key]` — both node keys, NOT an edge ID
- `filterSets`: same VIEW + TRANSITION filterSets from Phase 2

Poll until `GlidePromin_WorkNoteAnalyzerResult` returned.

**Interpret and always report as dual finding:**
1. **Automation signal** — empty work notes % > 50% confirms scripted, routine work → strong AI Agent signal
2. **Work notes enforcement** — absence of work notes creates a data gap; recommend enforcing a mandatory resolution notes field (1–2 sentences) at incident closure for quick-touch cases to enable richer future intent analysis cycles

---

## Phase 5: Scoring & Recommendations

### Step 5.1 — Build automation candidate scorecard
For each distinct candidate (cluster + category + team combination):

| Dimension | Weight | High | Medium | Low |
|---|---|---|---|---|
| Volume | 30% | >100 cases/month | 50–100 | <50 |
| Speed | 20% | <10 min avg | 10–20 min | 20–30 min |
| Purity | 30% | >90% quality | 70–90% | <70% |
| Simplicity | 20% | >80% single-touch | 50–80% | <50% |

Composite score = weighted average. Rank all candidates descending.

### Step 5.2 — Apply IMPACT framework per top-10 candidate
- **I**dentify — what specific task pattern?
- **M**easure — cases/month, avg duration, total hours/month saved
- **P**ropose — AI Agent: what it does, trigger, resolution action
- **A**utomate — ServiceNow mechanism (Flow Designer, AI Agent, business rule, assignment rule)
- **C**ompare — projected resolution time improvement, FTE hours saved
- **T**imeline — Quick win (<2 weeks), Medium (2–6 weeks), Strategic (6+ weeks)

### Step 5.3 — Calculate total automation opportunity
- Total cases/month automatable
- Total FTE hours/month saved
- Estimated annual savings

---

## Phase 6: Report Generation

Read `docx`, `smart-brevity-docx`, and `servicenow-brand-standards-reference` skills before writing any code.

**Report structure (all sections required):**

1. **Title** — compelling headline with the key number (e.g., "48 Cases Resolved in Under 30 Minutes — Here's What to Automate")
2. **Executive summary** — AI Agent recommendations front and centre; total projected savings; top 3 agents with estimated impact. 60-second read.
3. **The automation sweet spot** — methodology, filter logic, case count captured, duration adjustment explained
4. **Numbers at a glance** — metrics table: baseline vs. quick-touch, including adjusted duration excl. Res→Close
5. **Where quick-touch cases concentrate** — bottleneck nodes table; clustering results (or skip note if <100 cases)
6. **What human agents are actually doing** — work notes / intent analysis findings; dual finding if empty work notes
7. **What categories dominate** — breakdown table with over/under-representation vs. baseline
8. **Which teams handle the most quick-touch work** — assignment group analysis
9. **Ranked automation candidates** — full scorecard table
10. **AI Agent recommendations** — implementation table: agent name, trigger, action, cases/month, hours saved, priority, timeline
11. **Next steps** — 5–6 numbered actions; always include work notes enforcement step when empty work notes found

**Voice:** Business-friendly. Lead with the story, back with numbers. Reader should walk away knowing exactly what to automate and why.

**Terminology conventions:**
- **"human agents"** — people handling cases (not just "agents")
- **"AI Agent"** (capitalised) — automation recommendations
- **"Triaging"** — AI Agent that routes cases at creation (not "Smart routing")

---

## Key Technical Rules

| Rule | Detail |
|---|---|
| Always call `get_servicenow_version` first | Determines payload shape for ALL tools |
| Always enforce VIEW filter | Prevents blended state + assignment_group model |
| Poll `ScheduledTask` indefinitely | Both `get_project_details` and `create_transition_filter` can stall for minutes — keep polling |
| **Skip `cluster_node` if < 100 cases** | Fewer than 100 causes server error; note and proceed to work notes |
| Duration in seconds | 2 min = 120, 30 min = 1800 — NOT milliseconds |
| Use `key` not `nodeStatsId` | Clustering and work notes both require the `key` field from `nodes[]` |
| Work notes requires two node keys | Pass `[start_key, end_node_key]` — not an edge ID |
| `conditionType: "SINGLE"` on Zurich | `"EQ"` is not a valid enum value |
| `fieldConstraint` required | Omitting from `transitionConstraints` causes null pointer error |
| `dataFilter` must be `[]` with breakdowns | Do not mix dataFilter queries with breakdown filters |
| Breakdowns at top level of filterSets | Not inside `orderedFilters` |
| Australia: use intent analysis only | Replaces both clustering and work notes — do not run work notes separately |
| MCP label ≠ ServiceNow version | Always detect version dynamically via `get_servicenow_version` |

---

## Resuming Mid-Analysis

If a user asks to "run phase X onwards" or "continue from phase X", jump directly to that phase using context already available in the conversation:
- Confirm which IDs and keys are already known (versionId, entityId, state activity ID, node keys, filterSets)
- Re-use the existing transition filterSets exactly — do not recreate the filter
- If node keys are not yet stored, extract them from the most recent `get_project_details` or filter result in context

---

## Quick Reference — ID Checklist

Before starting Phase 4, confirm you have all of these stored:

| ID | Source | Used In |
|---|---|---|
| `versionId` | `list_projects` → `version.id` | All tool calls |
| `entityId` | `list_projects` → `projectEntities[].entityId` | All filterSets |
| `state_activity_id` | `list_projects` → `activities[].id` where `field=="state"` | VIEW filter |
| `start_node_key` | Filter model → `nodes[].key` where `value=="<start_value>"` | Clustering, work notes |
| `end_node_key` | Filter model → `nodes[].key` where `value=="<end_value>"` | Work notes |
| `transition_filterSets` | Full filterSets used in Phase 2 | Clustering, work notes, intent analysis |