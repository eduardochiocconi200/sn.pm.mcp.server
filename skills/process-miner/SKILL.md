---
name: process-miner
description: 'ServiceNow Process Mining foundation skill. Use for listing projects, triggering mines, retrieving process models, running clustering, variant analysis, and bottleneck analysis. Trigger on: "mine my project", "show me the process map", "analyze my process", "process mining".'
---

# ServiceNow Process Mining Analysis Skill

## Overview

This skill contains guidance for using ServiceNow Process Mining MCP tools to perform end-to-end
analysis on process mining projects. It covers project discovery, mining execution, process model
interpretation (nodes, edges, variants, findings), clustering, and formal report generation.

MCP tools connect to ServiceNow instances via GraphQL APIs embedded within each instance. Instance
names vary (e.g., `australia`, `zurich`, `honeywell`, `prod`) — **always ask the user which instance
to target** when multiple are available. If only one instance is connected, default to it without
prompting. If the user names a project but not an instance, scan all available instances to locate it.

---

## MCP Tools Reference

Tools are available per instance. Tool names follow the pattern `servicenow-{instance}:{tool_name}`.

### get_servicenow_version
Queries the `sys_properties` table for the `glide.war` property to determine the ServiceNow instance
version.

**Parameters:** None.

**What the response contains:**
- `version` — short version name (e.g., `"zurich"`, `"australia"`)
- `fullResponse` — the raw `glide.war` property value

**When to use:** Call at the start of every session. The `version` field determines:
- `"zurich"` → use `ALL_PROJECTS` for `list_projects`, use `advancedTransitions` payload shape
- `"australia"` or later → use `ALL` for `list_projects`, use `transitionChains` payload shape

---

### list_projects
Lists all Process Mining projects. Returns project summaries: case counts, variant counts, average
durations, owners, state, status, entity configurations, and permissions.

**Key parameters:**
- `limit` / `offset` — pagination
- `orderBy` / `orderByDesc` — sort (e.g., `last_mined_time`)
- `projectPermissionType` — version-dependent:
  - **Zurich**: `ALL_PROJECTS`, `CREATED_BY_ME`, `SHARED_WITH_ME`
  - **Australia and later**: `ALL`, `CREATED_BY_ME`, `SHARED_WITH_ME`
- `query` — text search by project name (some instances reject this; if it errors, list all and
  filter locally)

**Sample payload — Zurich:**
```json
{ "offset": 0, "limit": 20, "orderBy": "last_mined_time",
  "orderByDesc": true, "projectPermissionType": "ALL_PROJECTS" }
```

**Sample payload — Australia and later:**
```json
{ "offset": 0, "limit": 20, "orderBy": "last_mined_time",
  "orderByDesc": true, "projectPermissionType": "ALL" }
```

**What to extract from results:**
- `version.id` — needed for `get_project_details` and `cluster_node`
- `projectDefinition.projectId` — needed for `mine_project`
- `aggregate[].model` — caseCount, variantCount, avgCaseDuration, stdDeviation
- `projectDefinition.state` — AVAILABLE, MINING_DATA, ERROR, NEW
- `projectDefinition.projectEntities` — table, filter, activities, breakdowns

---

### mine_project
Triggers a preview or full mine.

**Key parameters:**
- `projectId` (or `sysId` on some instances) — from `projectDefinition.projectId`
- `preview` — `true` for preview mine (faster, sampled), `false` for full mine

**⚠️ Full mine confirmation required.** Always confirm with the user before triggering a full mine.
Suggest preview as the default — full mines are time-consuming and resource-intensive.

**After triggering:** Poll `list_projects` periodically. When `state` becomes `AVAILABLE` and
`progress == 100`, the mine is complete. Note the new `version.id`.

---

### get_project_details
Returns the full process model: nodes, edges, aggregates, breakdowns, filter sets, findings, and
version metadata.

**Key parameters:**
- `versionId` — from `list_projects` results
- `filterSets` — optional GlidePromin_FilterInput (see filterSets Payload Reference below)

**What the response contains:**
- `nodes[]` — process states/activities with frequencies, durations, start/end flags
- `edges[]` — transitions between nodes with frequencies, durations, statistics
- `aggregates[]` — model-level stats (caseCount, variantCount, avg/median/stdDev durations)
- `findings[]` — automated insights (REWORK, EXTRA_STEP, PINGPONG) with frequencies and durations
- `breakdowns[]` — breakdown dimension stats (channel, priority, assignment group, etc.)
- `version.filterSets[]` — saved filter sets
- `version.miningStats.totalRecords` — total records mined

**Handling large results:** The response can be very large. When stored to file, parse with python3:
```bash
cat /path/to/result.json | python3 -c "
import json, sys
data = json.load(sys.stdin)
parsed = json.loads(data[0]['text'])
model = parsed['GlidePromin_Query']['scheduleModel']
# Extract from model['nodes'], model['edges'], etc.
"
```

**⚠️ Polling required.** First response may be `GlidePromin_ScheduledTask` (state 0, progress 0).
Re-call with identical parameters repeatedly until `GlidePromin_Model` is returned.

---

### cluster_node
Runs ML clustering on a specific process node to identify behavioural segments.

**Key parameters:**
- `versionId` — the version sys_id
- `elementId` — array containing one node `key` value (use `key`, NOT `nodeStatsId`)
- `elementType` — always `"CLUSTERING_NODE"`
- `filterSets` — pass the transition filterSets to scope clustering to the filtered population
- `clusterResultCount` — optional, number of clusters to return
- `forceSubmit` — optional, force-submit even if a job is running

**Sample payload — Zurich:**
```json
{
  "versionId": "8f775f582ba3ba10c9a1f9b36e91bf5d",
  "filterSets": {
    "dataFilter": [], "breakdowns": [], "findingFilter": "",
    "adIntentFilter": "", "orderedFilters": []
  },
  "elementType": "CLUSTERING_NODE",
  "elementId": ["8f21d5a6db4144fea86bcd3344000cbf"],
  "clusterResultCount": 20
}
```

**⚠️ First response is `GlidePromin_ScheduledTask`.** Re-call after 90–120 seconds, polling until
`GlidePromin_ClusteringResult` is returned.

**⚠️ Skip if population < 100 cases.** Clustering on fewer than 100 records causes a server error.

---

### intent_and_activity_analysis *(Australia / later only)*
Analyses agent activity at a node to surface intent descriptions and activity clusters.

**Key parameters:**
- `versionId` — the version sys_id
- `elementId` — `[start_node_key]`
- `elementType` — `"AGENT_ACTIVITY_ANALYZER_NODE"`
- `filterSets` — same VIEW + TRANSITION filterSets from the transition filter step
- `clusterResultCount` — 5–10

**⚠️ Async.** First call submits the job. Re-poll after 90–120 seconds until result returns.
This tool replaces both `cluster_node` and `transition_work_notes_analysis` on Australia/later.

---

### transition_work_notes_analysis *(Zurich only)*
Analyses work notes on transitions between two nodes.

**Key parameters:**
- `versionId` — the version sys_id
- `elementId` — `[start_node_key, end_node_key]` — both node keys, NOT an edge ID
- `elementType` — `"WORK_NOTE_ANALYZER"`
- `filterSets` — same filterSets used for the transition filter

**⚠️ Async.** Poll until `GlidePromin_WorkNoteAnalyzerResult` is returned.

---

### create_transition_filter
Creates a filtered model scoped to cases matching a specific state transition within a time window.

**Key parameters:**
- `versionId`
- `name` — descriptive label (e.g., `"In Progress → Resolved (2–30 min)"`)
- `filterSets` — VIEW + TRANSITION combination (see filterSets Payload Reference)

**⚠️ Async.** First response is `GlidePromin_ScheduledTask`. Re-call with identical parameters
until `GlidePromin_Model` is returned.

---

### create_automation_request
Creates an Automation Request record in ServiceNow.

**Key parameters:**
- `process_name` — name of the automation
- `short_description` — brief summary
- `description` — full epic details
- `actual_time` — HH:MM:SS format
- `volume_of_transactions` — cases per week
- `intake_source` — use `"web"` (see note in automation-analysis skill)
- `request_type` — `"automation"`
- `requested_for` — `"admin"` or target user
- `priority` / `impact` / `urgency` — `"1"` (highest) to `"3"`

---

## filterSets Payload Reference

The `filterSets` object is passed to `get_project_details`, `create_transition_filter`,
`cluster_node`, `transition_work_notes_analysis`, and `intent_and_activity_analysis`.

### Unfiltered (baseline model)
```json
{}
```

### VIEW filter only (state-only process map)
Strips assignment group nodes, returns clean state-to-state model:
```json
{
  "breakdowns": [], "dataFilter": [], "findingFilter": "",
  "orderedFilters": [{
    "type": "VIEW",
    "viewFilter": [{ "entityId": "<entityId>", "activities": ["<state_activity_id>"] }]
  }]
}
```

### VIEW + TRANSITION filter — Zurich shape
```json
{
  "adIntentFilter": "", "breakdowns": [], "dataFilter": [], "findingFilter": "",
  "orderedFilters": [
    {
      "type": "VIEW",
      "viewFilter": [{ "activities": ["<state_activity_id>"], "entityId": "<entityId>" }]
    },
    {
      "advancedTransitions": {
        "advancedTransitions": [
          {
            "conditionType": "SINGLE", "context": null, "entityId": "<entityId>",
            "field": "state", "occurrence": "ALWAYS", "predicate": "EQ",
            "relation": "FOLLOWED_BY", "values": ["<start_state_value>"]
          },
          {
            "conditionType": "SINGLE", "context": null, "entityId": "<entityId>",
            "field": "state", "occurrence": "ALWAYS", "predicate": "EQ",
            "relation": "FOLLOWED_BY", "values": ["<end_state_value>"]
          }
        ],
        "transitionConstraints": [{
          "fieldConstraint": { "field": "state", "type": "NONE" },
          "fromIndex": 0, "maxDuration": 1800, "minDuration": 120, "toIndex": 1
        }]
      },
      "type": "TRANSITION"
    }
  ]
}
```

### VIEW + TRANSITION filter — Australia / later shape
```json
{
  "adIntentFilter": "", "breakdowns": [], "dataFilter": [], "findingFilter": "",
  "orderedFilters": [
    {
      "type": "VIEW",
      "viewFilter": [{ "activities": ["<state_activity_id>"], "entityId": "<entityId>" }]
    },
    {
      "transitionChains": [{
        "includePath": true,
        "nodeToNodeConstraints": [{
          "field": null, "fromIndex": 0, "max": 1800, "min": 120,
          "toIndex": 1, "type": "DURATION"
        }],
        "transitionConditions": [
          {
            "conditionType": "SINGLE", "context": null, "entityId": "<entityId>",
            "field": "state", "nodeConstraints": [], "occurrence": "ALWAYS",
            "predicate": "EQ", "relation": "FOLLOWED_BY", "values": ["<start_state_value>"]
          },
          {
            "conditionType": "SINGLE", "context": null, "entityId": "<entityId>",
            "field": "state", "nodeConstraints": [], "occurrence": "ALWAYS",
            "predicate": "EQ", "relation": "FOLLOWED_BY", "values": ["<end_state_value>"]
          }
        ]
      }],
      "type": "TRANSITION"
    }
  ]
}
```

---

## Standard Workflow

### Step 1 — Detect instance version
Call `get_servicenow_version`. Store `version` — governs all payload shapes downstream.

### Step 2 — List and identify project
Call `list_projects`. Store `versionId`, `projectId`, `entityId`, and the state activity ID
(`activities[].id` where `field == "state"`).

### Step 3 — Mine if needed
If project `state != "AVAILABLE"` or data is stale, offer `mine_project`. Poll `list_projects`
until `state == "AVAILABLE"` and `progress == 100`.

### Step 4 — Retrieve process model
Call `get_project_details` with a VIEW filter to get the state-only process map. Poll if the
first response is a `ScheduledTask`.

### Step 5 — Parse and present the model
Extract nodes (sorted by total duration impact), edges (top 20 by caseFreq), aggregates, findings,
and breakdowns. Flag bottlenecks (high dwell), rework (maxReps > 1), and backward edges.

### Step 6 — Deep-dive analysis
Apply Theory of Constraints bottleneck analysis, rework analysis, ping-pong analysis, and variant
analysis as appropriate. Run `cluster_node` on the bottleneck node (skip if < 100 cases).

### Step 7 — Recommendations
Structure each recommendation using the IMPACT framework:
- **I**dentify — what specific problem?
- **M**easure — quantified impact (hours, cases, cost)?
- **P**ropose — recommended action?
- **A**utomate — AI Agent or workflow mechanism?
- **C**ompare — expected improvement?
- **T**imeline — quick win vs. strategic initiative?

### Step 8 — Report generation
When generating a formal report, use the `docx` and `smart-brevity-docx` skills. Apply
`servicenow-brand-standards` for ServiceNow audiences.

**Report structure:**
1. Executive Summary — single most important finding + recommended action
2. Process Overview — case count, variant count, avg duration, flow description
3. Key Findings — top 3–5 findings ranked by impact with quantified metrics
4. Bottleneck Analysis — Theory of Constraints analysis of the primary constraint
5. Recommendations — IMPACT framework, prioritised
6. Appendix — full node/edge statistics, variant details, clustering results

---

## Analysis Frameworks

### Bottleneck Analysis (Theory of Constraints)
1. **IDENTIFY** — node with highest total duration impact (frequency × avgDuration)
2. **EXPLOIT** — cluster it: which categories, priorities, or groups drive the bottleneck?
3. **SUBORDINATE** — examine upstream edges: are they feeding cases efficiently?
4. **ELEVATE** — propose automation, staffing, or process redesign
5. **REPEAT** — identify the next constraint after the first is addressed

### Rework Analysis
For each REWORK finding: calculate rework rate (frequency ÷ cases through that node), estimate
rework cost (totalDuration in business hours), identify rework triggers from edges and variants,
and classify as avoidable vs. inherent.

### Ping-Pong Analysis
For each PINGPONG finding: identify the two bouncing nodes, quantify handoff overhead (avg duration
per cycle), and root-cause (unclear ownership, missing info requirements, or inadequate triage).

### Variant Analysis
Identify top 10 variants by case frequency. Compare avg durations against overall avg. Map variant
patterns to business scenarios.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `UnusedFragment` GraphQL validation error | Fragment definitions not referenced in main query | Remove unused fragments or add spread references |
| `Invalid query is provided` on list_projects | Instance doesn't support `query` parameter | List all with high `limit`, filter locally |
| Mine stuck at low progress | Slow for large datasets | Poll every 15–30s; check if `state` → `ERROR` |
| Tool result too large for context | Large `get_project_details` response saved to file | Parse with `json.load` then `json.loads(raw[0]['text'])` |
| ScheduledTask never resolves | Async job in queue | Keep polling — do not give up within 5 minutes |

---

## Key Terminology

| Term | Definition |
|---|---|
| Case | A single process instance (one incident, one RITM, etc.) |
| Variant | A unique sequence of activities/states a case follows |
| Node | A state or activity in the process (e.g., "In Progress", "Assigned") |
| Edge | A transition between two nodes |
| Finding | An automated insight about process inefficiency |
| Rework | A case revisiting a state it already passed through |
| Ping-Pong | Repeated back-and-forth handoffs between two states |
| Extra Step | An intermediate state that may not add value |
| Breakdown | A case attribute used for segmentation (priority, channel, etc.) |
| Filter Set | A saved combination of filters applied to the process model |
| Clustering | ML-based segmentation of cases at a specific node |
| Happy Path | The most common (or ideal) variant through the process |
