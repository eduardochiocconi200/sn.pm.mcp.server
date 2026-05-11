---
name: slow-approvals-analysis
description: "Identifies approval bottlenecks in ServiceNow Process Mining using a multidimensional map with a child Approval entity. Isolates slow approvals, breaks down by catalog item and approval group, and generates AI Agent recommendations. Trigger on: "slow approvals", "approval bottleneck", "why are approvals taking so long", "approval analysis"."
---

# Slow Approvals Analysis

Identifies approval bottlenecks in ServiceNow Process Mining projects using the Approval child entity (`sysapproval_approver`) and transition filters.

---

## ⛔ MANDATORY PRE-FLIGHT — READ BEFORE ANY TOOL CALLS
Before executing **any phase** of this skill, Claude MUST call the `view` tool on all three dependency skills in this order:

1. `/mnt/skills/user/process-miner/SKILL.md` — **required for filterSets payload shapes**. The transition filter payload (Zurich `advancedTransitions` / Australia `transitionChains`) is documented there with working examples. Do NOT attempt to construct a `create_transition_filter` payload from memory.
2. `/mnt/skills/public/docx/SKILL.md` — required before writing any report generation code.
3. `/mnt/skills/user/smart-brevity-docx/SKILL.md` — required before writing any report generation code.

**Do NOT proceed to Phase 1 until all three skills have been read in this session.**

This is not optional. Skipping this step and relying on memory for payload shapes is the most common cause of `create_transition_filter` failures.

---

## Phase 0: Project Discovery & Validation

Before running any analysis, verify the project has the required multidimensional map by calling `get_project_details` and checking `projectDefinition.projectEntities`.

**Required entities:**
1. Root entity (e.g. `sc_req_item`) with an `approval` activity field
2. Child entity named **"Approval"** — table `sysapproval_approver`, activity field `state`

If the Approval child entity is absent, stop and surface this message:

> "This project does not have an Approval child entity configured. The slow-approvals analysis requires a multidimensional map with `sysapproval_approver` as a child entity. Please ask your Process Mining admin to add the Approval entity to the project configuration."

**Key IDs to extract:**

| Entity | ID field | Store as |
|---|---|---|
| Root entity | `entityId` | `ROOT_ENTITY_ID` |
| Approval entity | `entityId` | `APPROVAL_ENTITY_ID` |
| versionId | `version.id` | `VERSION_ID` |

---

## Phase 1: Baseline approval stats

Call `get_project_details` with no filterSets (`{}`).

**From the Approval entity aggregate, extract:**
- `caseCount` — total approval records
- `avgCaseDuration`, `medianDuration` — compute mean/median gap ratio
- `minCaseDuration`, `maxCaseDuration`

**Key signal:** A mean/median gap > 5× is a strong bottleneck indicator. The ProjectA Requested Item project showed a 16.9× gap (6.3d avg vs 0.4d median).

**From edges, find these key approval transitions:**
- Approval Requested → Approved (primary bottleneck edge)
- Approval Requested → Rejected (hidden cost — check total duration)
- Approval Requested → No Longer Required (abandoned approvals = masked demand)

**From the Approval entity breakdowns, extract:**
- `group.assignment_group` — which groups are approving and their avg wait
- `state` — distribution across Approved / Rejected / No Longer Required / Cancelled

---

## Phase 2: Transition filter (canonical filterSet)

Use `get_project_details` (NOT `create_transition_filter` — see Known Bugs) with the following filterSet:

```json
{
  "orderedFilters": [{
    "type": "TRANSITION",
    "advancedTransitions": [{
      "advancedTransitions": [
        {
          "entityId": "<ROOT_ENTITY_ID>",
          "field": "approval",
          "predicate": "EQ",
          "occurrence": "ALWAYS",
          "relation": "FOLLOWED_BY",
          "context": null,
          "values": ["requested"]
        },
        {
          "entityId": "<ROOT_ENTITY_ID>",
          "field": "approval",
          "predicate": "EQ",
          "occurrence": "ALWAYS",
          "relation": "FOLLOWED_BY",
          "context": null,
          "values": ["approved"]
        }
      ],
      "transitionConstraints": [{
        "fromIndex": 0,
        "toIndex": 1,
        "minDuration": 86400,
        "maxDuration": 90000000,
        "fieldConstraint": { "type": "NONE", "field": "" }
      }]
    }]
  }]
}
```

**Critical notes:**
- `occurrence: "ALWAYS"` captures every approval cycle on a case, including re-approvals. This is the canonical value — `"ALL"` and `"ANY"` are invalid on most instances.
- `fieldConstraint: {"type": "NONE", "field": ""}` is **mandatory** — omitting it causes a null pointer crash on the ServiceNow side.
- `minDuration: 86400` = 1 day. `maxDuration: 90000000` ≈ 1,041 days.
- If the response `__typename` is `GlidePromin_ScheduledTask`, the computation is running async. Poll with the same filterSets until `__typename` switches to `GlidePromin_Model`.

**Check filtered population size before clustering:**
From the filtered result, check the Approval entity aggregate `caseCount`. If < 100, do NOT call `cluster_node` — clustering requires a minimum of 100 records. Surface this message:

> "The slow-approval population contains [N] approval records — clustering requires a minimum of 100 records. The dataset is too small to perform cluster analysis at this threshold. Consider widening the filter (lower the minDuration or extend the project date range) before clustering."

**From the filtered result, extract:**
- RITM case count and variant count
- Approval records count (`maxReps` > 1 means some RITMs cycled through approval multiple times)
- Avg/median approval wait on Requested→Approved edge
- Total hours consumed
- No Longer Required count (requesters giving up)
- Catalog item breakdown (top slow items by avg duration and volume)
- Approval group breakdown (`group.assignment_group` — look for unrouted cases with no group)

---

## Phase 3: Cluster analysis

**Important:** Clustering is only supported on the **root entity** — NOT the Approval child entity. Attempting to cluster using an Approval entity node key will return: `"There is no process configuration for sysapproval_approver table."` Use the `approval` field node on the root entity instead.

**Get the correct elementId:**
- From the base (unfiltered) `get_project_details` result
- Find the node where `entityId == ROOT_ENTITY_ID` and `field == "approval"` and `value == "requested"`
- Use the node's `key` field as the `elementId` (NOT `nodeStatsId`)

**Call `cluster_node`:**
```json
{
  "versionId": "<VERSION_ID>",
  "elementId": ["<approval_requested_node_key>"],
  "elementType": "CLUSTERING_NODE",
  "filterSets": {},
  "clusterResultCount": 10,
  "forceSubmit": true
}
```

**`forceSubmit: true` is required** on the first call — without it, some instances return an error even when a process configuration exists. Poll with `forceSubmit: false` until `__typename` is `GlidePromin_ClusteringResult`.

**Interpret clusters — look for:**
- Clusters with slow-approval catalog items that show **"(no group)"** at 100% purity — this is the structural root cause (no approval group configured on the catalog item)
- High-volume clusters with known assignment groups that appear in the slow-approval population — SLA accountability issue
- Clusters linking to high-duration assignment groups (e.g., Client Management Team patterns with abnormal open-state durations)

---

## Phase 4: Recommendations (IMPACT framework)

For each identified issue, structure recommendations as:

- **Identify** — What catalog items / approval groups are affected?
- **Measure** — Total hours consumed, number of cases, avg wait in days
- **Propose** — Specific action (e.g., configure approval group on catalog item, add SLA, set up escalation)
- **Automate** — Can an AI Agent auto-approve based on rules? Can approval reminders be automated?
- **Compare** — Expected improvement (e.g., "removing individual approver routing for Smartsheet could reduce avg wait from 22d to <5d based on managed-group benchmarks in this project")
- **Timeline** — Quick win (catalog config change, ~1 day) vs. strategic (new approval workflow, ~1 sprint)

**Priority ranking:**
1. Catalog items with no approval group (zero routing = no SLA accountability)
2. Approval groups with highest avg wait time
3. High rejection rates (wrong-approver routing)
4. Re-approval loops (maxReps > 1)
5. Abandoned approvals (No Longer Required > 10% of total)

---

## Known Bugs & Workarounds

| Bug | Symptom | Workaround |
|---|---|---|
| `create_transition_filter` EOF at col 12,554 | `Invalid syntax with offending token '<EOF>'` | Use `get_project_details` with `filterSets` parameter instead. *(Observed on the ProjectA Zurich instance — verify on other instances before assuming this applies universally.)* |
| `cluster_node` without `forceSubmit` | `"no process configuration"` error | Always pass `forceSubmit: true` on first call |
| Clustering on child entity | `"There is no process configuration for sysapproval_approver"` | Use root entity approval field node key, not child entity node |
| `fieldConstraint` null pointer | `"Cannot invoke getFieldConstraint().getType()"` | Always include `fieldConstraint: {"type": "NONE", "field": ""}` in transitionConstraints |
| Async transition mining | Response is `GlidePromin_ScheduledTask` instead of `GlidePromin_Model` | Poll `get_project_details` with same filterSets until typename flips |

---

## Confirmed Valid Enum Values

These were validated on the ProjectA instance (ServiceNow Zurich release range). Verify on new instances — values may differ across releases.

**`GlidePromin_AdvTransitionPredicate`:** `EQ`, `IN`

**`GlidePromin_AdvTransitionOccurrence`:** `FIRST`, `LAST`, `ALWAYS`
- `ALL` and `ANY` are **invalid** despite appearing in some documentation

**`GlidePromin_AdvTransitionRelation`:** `FOLLOWED_BY`, `EVENTUALLY_FOLLOWED_BY`

**`GlidePromin_TransitionConstraintType`:** `NONE`
- `DURATION`, `TIME`, `ACTIVITY`, `FIELD` are **invalid** on this release

**`GlidePromin_OrderedFilterType`:** `TRANSITION`, `VARIANT`

---

## Reference: Requested Item project

This skill was developed and validated against the following project. Use as a reference baseline when onboarding to similar projects.

| Field | Value |
|---|---|
| Project name | Requested Item |
| projectId | `ccd390813b1c431036fa2464c3e45a5a` |
| versionId (as of 2026-04-19) | `fec5d956ff544710a0c2f18afc4fd969` |
| Root entity | `sc_req_item` — entityId `00d390813b1c431036fa2464c3e45a61` |
| Approval entity | `sysapproval_approver` — entityId `1f751156ff544710a0c2f18afc4fd9ce` |
| Task SLA entity | `task_sla` — entityId `2f751156ff544710a0c2f18afc4fd9fd` |
| approval=Requested node key | `ade8724b9e0bf9f9768d6c4e6ded6bba` (root entity) |
| Total RITMs | 7,454 · avg 18.7d · median 3.6d |
| Baseline approval mean/median gap | 16.9× (6.3d avg vs 0.4d median) |
| Canonical filter result | 57 RITMs · 88 approval records · avg 23.8d |
| Root cause confirmed | 63/88 approvals (72%) have no approval group — individual routing |

**Top slow-approval items (from ALWAYS >1d filter):**

| Item | Cases | Avg wait | Priority |
|---|---|---|---|
| Adobe Systems | 1 | 146.5d | Critical |
| CaptureIT | 1 | 53.7d | Critical |
| Task Mining | 1 | 47.0d | Critical |
| ERP Access | 2 | 43.7d | Critical |
| ERP Cloud | 3 | 27.3d | High |
| Smartsheet | 11 | 22.0d | High (highest volume) |
| Microsoft Outlook | 4 | 16.8d | High |
| Windsurf | 3 | 8.1d | Medium |
| Catalog Access Item | 11 | 3.4d | Medium (highest volume) |

**Clustering insight (cluster #11, Smartsheet, 56 cases, 100% quality):**
No assignment group at 100% purity — confirmed zero routing on this catalog item. Same pattern for Teams (#30) and Visual Studio (#26). All three require approval group configuration in the catalog item definition.