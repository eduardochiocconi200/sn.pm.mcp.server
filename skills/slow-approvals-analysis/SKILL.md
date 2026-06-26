---
name: slow-approvals-analysis
description: 'Identifies approval bottlenecks in ServiceNow Process Mining using a multidimensional map with a child Approval entity. Isolates slow approvals, breaks down by catalog item and approval group, and generates AI Agent recommendations. Trigger on: "slow approvals", "approval bottleneck", "why are approvals taking so long", "approval analysis".'
---

# Slow Approvals Analysis

Identifies approval bottlenecks in ServiceNow Process Mining projects using the Approval child entity
(`sysapproval_approver`) and transition filters.

---

## ⛔ MANDATORY PRE-FLIGHT

Before executing any step of this skill, Claude MUST read these three dependency skills in order:

1. `/mnt/skills/user/process-miner/SKILL.md` — **required for filterSets payload shapes**
2. `/mnt/skills/public/docx/SKILL.md` — required before writing any report code
3. `/mnt/skills/user/smart-brevity-docx/SKILL.md` — required before writing any report code

**Do NOT proceed to Step 1 until all three have been read in this session.**

---

## Step 1 — Verify Multidimensional Map Configuration

Call `get_project_details` with `filterSets: {}` and check `projectDefinition.projectEntities`.

**Required entities:**
1. Root entity (e.g. `sc_req_item`) with an `approval` activity field
2. Child entity named **"Approval"** — table `sysapproval_approver`, activity field `state`

If the Approval child entity is absent, stop and surface:

> "This project does not have an Approval child entity configured. The slow-approvals analysis
> requires a multidimensional map with `sysapproval_approver` as a child entity. Please ask your
> Process Mining admin to add the Approval entity to the project configuration."

**Extract and store:**

| Entity | Field | Store as |
|---|---|---|
| Root entity | `entityId` | `ROOT_ENTITY_ID` |
| Approval entity | `entityId` | `APPROVAL_ENTITY_ID` |
| Version | `version.id` | `VERSION_ID` |

---

## Step 2 — Pull Baseline Approval Statistics

Call `get_project_details` with no filterSets (`{}`).

**From the Approval entity aggregate, extract:**
- `caseCount` — total approval records
- `avgCaseDuration`, `medianDuration` — compute mean/median gap ratio
- `minCaseDuration`, `maxCaseDuration`

**Key signal:** A mean/median gap > 5× is a strong bottleneck indicator. The Requested Item project
showed a 16.9× gap (6.3d avg vs 0.4d median).

**From edges, find key approval transitions:**
- Approval Requested → Approved (primary bottleneck edge)
- Approval Requested → Rejected (hidden cost — check total duration)
- Approval Requested → No Longer Required (abandoned approvals = masked demand)

**From the Approval entity breakdowns, extract:**
- `group.assignment_group` — which groups are approving and their avg wait
- `state` — distribution across Approved / Rejected / No Longer Required / Cancelled

---

## Step 3 — Apply Slow-Approval Transition Filter

Use `get_project_details` with the following filterSet (do NOT use `create_transition_filter` — see
Known Bugs):

```json
{
  "orderedFilters": [{
    "type": "TRANSITION",
    "advancedTransitions": [{
      "advancedTransitions": [
        {
          "entityId": "<ROOT_ENTITY_ID>",
          "field": "approval", "predicate": "EQ",
          "occurrence": "ALWAYS", "relation": "FOLLOWED_BY",
          "context": null, "values": ["requested"]
        },
        {
          "entityId": "<ROOT_ENTITY_ID>",
          "field": "approval", "predicate": "EQ",
          "occurrence": "ALWAYS", "relation": "FOLLOWED_BY",
          "context": null, "values": ["approved"]
        }
      ],
      "transitionConstraints": [{
        "fromIndex": 0, "toIndex": 1,
        "minDuration": 86400, "maxDuration": 90000000,
        "fieldConstraint": { "type": "NONE", "field": "" }
      }]
    }]
  }]
}
```

**Critical notes:**
- `occurrence: "ALWAYS"` captures every approval cycle including re-approvals. `"ALL"` and `"ANY"`
  are invalid on most instances.
- `fieldConstraint: {"type": "NONE", "field": ""}` is **mandatory** — omitting it causes a null
  pointer crash.
- `minDuration: 86400` = 1 day. `maxDuration: 90000000` ≈ 1,041 days.
- If the response is `GlidePromin_ScheduledTask`, re-call with identical parameters after 60–120
  seconds until `GlidePromin_Model` is returned.

**From the filtered result, extract:**
- RITM case count and variant count
- Approval records count (`maxReps` > 1 means some cases cycled through approval multiple times)
- Avg/median approval wait on the Requested→Approved edge
- Total hours consumed
- No Longer Required count (requesters giving up)
- Catalog item breakdown (top slow items by avg duration and volume)
- Approval group breakdown — look for unrouted cases with no group

---

## Step 4 — Population Size Check Before Clustering

Check the Approval entity aggregate `caseCount` from Step 3. If < 100, skip Step 5 and note:

> "The slow-approval population contains [N] approval records — clustering requires a minimum of
> 100 records. Consider widening the filter (lower minDuration or extend the date range) before
> running cluster analysis."

---

## Step 5 — Cluster Analysis on Root Entity *(skip if < 100 cases)*

**Important:** Clustering is only supported on the **root entity** — NOT the Approval child entity.
Using an Approval entity node key returns: `"There is no process configuration for
sysapproval_approver table."`

**Get the correct elementId:**
- From the **unfiltered** `get_project_details` result
- Find the node where `entityId == ROOT_ENTITY_ID`, `field == "approval"`, `value == "requested"`
- Use that node's `key` field as `elementId` (NOT `nodeStatsId`)

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

`forceSubmit: true` is required on first call. Poll with `forceSubmit: false` until
`GlidePromin_ClusteringResult` is returned.

**Interpret clusters — look for:**
- Clusters with `"(no group)"` at 100% purity — confirms no approval group configured on the
  catalog item (structural root cause)
- High-volume clusters with known assignment groups in the slow-approval population (SLA
  accountability issue)
- Clusters linking to high-duration assignment groups

---

## Step 6 — Build Recommendations (IMPACT Framework)

For each identified issue:

- **Identify** — Which catalog items / approval groups are affected?
- **Measure** — Total hours consumed, number of cases, avg wait in days
- **Propose** — Specific action (e.g., configure approval group on catalog item, add SLA, set up
  escalation)
- **Automate** — Can an AI Agent auto-approve based on rules? Can approval reminders be automated?
- **Compare** — Expected improvement (e.g., removing individual approver routing for Smartsheet
  could reduce avg wait from 22d to <5d based on managed-group benchmarks)
- **Timeline** — Quick win (catalog config change, ~1 day) vs. strategic (new approval workflow,
  ~1 sprint)

**Priority ranking:**
1. Catalog items with no approval group (zero routing = no SLA accountability)
2. Approval groups with highest avg wait time
3. High rejection rates (wrong-approver routing)
4. Re-approval loops (maxReps > 1)
5. Abandoned approvals (No Longer Required > 10% of total)

---

## Step 7 — Generate Word Report

Read `docx` and `smart-brevity-docx` skills before writing code.

**Report structure (all sections required):**

1. Title — headline with the key number (e.g., "63% of Approvals Have No Owner — Here's What
   That's Costing")
2. Executive summary — top 3 AI Agent recommendations + projected savings. 60-second read.
3. Baseline approval stats — mean/median gap ratio, total approval records, state distribution
4. Slow-approval population — filtered case count, avg/median wait, total hours, No Longer Required
5. Root cause by catalog item — top slow items ranked by avg duration and volume
6. Approval group analysis — which groups are slowest; which items have no group
7. Clustering findings — from Step 5, or skip note if population < 100
8. AI Agent recommendations — implementation table with agent name, trigger, action, cases/month,
   hours saved, priority, timeline
9. Next steps — 5–6 numbered actions

---

## Known Bugs & Workarounds

| Bug | Symptom | Workaround |
|---|---|---|
| `create_transition_filter` EOF at col 12,554 | `Invalid syntax with offending token '<EOF>'` | Use `get_project_details` with `filterSets` parameter instead |
| `cluster_node` without `forceSubmit` | `"no process configuration"` error | Always pass `forceSubmit: true` on first call |
| Clustering on child entity | `"There is no process configuration for sysapproval_approver"` | Use root entity approval field node key |
| `fieldConstraint` null pointer | `"Cannot invoke getFieldConstraint().getType()"` | Always include `fieldConstraint: {"type": "NONE", "field": ""}` |
| Async response | `GlidePromin_ScheduledTask` instead of `GlidePromin_Model` | Re-call same tool after 60–120 seconds |

---

## Valid Enum Values (Validated on Zurich)

**`GlidePromin_AdvTransitionOccurrence`:** `FIRST`, `LAST`, `ALWAYS`
— `ALL` and `ANY` are **invalid** despite appearing in some documentation

**`GlidePromin_TransitionConstraintType`:** `NONE`
— `DURATION`, `TIME`, `ACTIVITY`, `FIELD` are **invalid** on this release

---

## Reference: Requested Item Project

| Field | Value |
|---|---|
| Project name | Requested Item |
| projectId | `ccd390813b1c431036fa2464c3e45a5a` |
| versionId (as of 2026-04-19) | `fec5d956ff544710a0c2f18afc4fd969` |
| Root entity | `sc_req_item` — entityId `00d390813b1c431036fa2464c3e45a61` |
| Approval entity | `sysapproval_approver` — entityId `1f751156ff544710a0c2f18afc4fd9ce` |
| approval=Requested node key | `ade8724b9e0bf9f9768d6c4e6ded6bba` |
| Total RITMs | 7,454 · avg 18.7d · median 3.6d |
| Baseline approval mean/median gap | 16.9× (6.3d avg vs 0.4d median) |
| Filtered result | 57 RITMs · 88 approval records · avg 23.8d |
| Root cause confirmed | 63/88 approvals (72%) have no approval group |
