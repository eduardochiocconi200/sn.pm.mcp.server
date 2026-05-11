---
name: process-miner
description: "ServiceNow Process Mining foundation skill. Use for listing projects, triggering mines, retrieving process models, running clustering, variant analysis, and bottleneck analysis. Trigger on: "mine my project", "show me the process map", "analyze my process", "process mining"."
---

# ServiceNow Process Mining Analysis Skill

## Overview

This skill contains guidance for using ServiceNow Process Mining MCP tools to perform end-to-end analysis on process mining projects. It covers project discovery, mining execution, process model interpretation (nodes, edges, variants, findings), clustering, and formal report generation.

MCP tools connect to ServiceNow instances via GraphQL APIs embedded within each instance. Instance names vary (e.g., `australia`, `zurich`, `honeywell`, `prod`) — **always ask the user which instance to target** when multiple are available. If only one instance is connected, default to it without prompting. If the user names a project but not an instance, scan all available instances to locate it.

---

## MCP Tools Reference

Eighteen tools are available per instance. The tool names follow the pattern `servicenow-{instance}:{tool_name}`.

### get_servicenow_version
Queries the `sys_properties` table for the `glide.war` property to determine the ServiceNow instance version.

**Parameters:** None.

**What the response contains:**
- `version` — short version name (e.g., `"zurich"`, `"australia"`)
- `fullResponse` — the raw `glide.war` property value, which includes the full build string (e.g., `glide-zurich-07-01-2025__patch7-...`)

**When to use:**
Call this tool at the start of a session when the instance version is unknown and you need to determine which `projectPermissionType` enum to pass to `list_projects`. The short `version` field is sufficient for that decision:
- `"zurich"` → use `ALL_PROJECTS`
- `"australia"` or any later version → use `ALL`

---

### list_projects
Lists all Process Mining projects on an instance. Returns project summaries including case counts, variant counts, average durations, owners, state, status, entity configurations, and permissions.

**Key parameters:**
- `limit` / `offset` — pagination
- `orderBy` / `orderByDesc` — sort (e.g., `last_mined_time`)
- `projectPermissionType` — valid values depend on the instance version:
  - **Zurich**: `ALL_PROJECTS`, `CREATED_BY_ME`, `SHARED_WITH_ME`
  - **Australia and later**: `ALL`, `CREATED_BY_ME`, `SHARED_WITH_ME`
- `query` — text search by project name (note: some instances reject this; if it errors, list all and filter locally)

**Sample payloads:**

Zurich:
```json
{
  "variables": {
    "offset": 0,
    "limit": 20,
    "orderBy": "last_mined_time",
    "orderByDesc": true,
    "projectPermissionType": "ALL_PROJECTS",
    "query": ""
  }
}
```

Australia and later:
```json
{
  "variables": {
    "offset": 0,
    "limit": 20,
    "orderBy": "last_mined_time",
    "orderByDesc": true,
    "projectPermissionType": "ALL",
    "query": ""
  }
}
```

**What to extract from results:**
- `version.id` — needed for `get_project_details` and `cluster_node`
- `projectDefinition.projectId` — needed for `mine_project`
- `aggregate[].model` — caseCount, variantCount, avgCaseDuration, stdDeviation
- `projectDefinition.state` — AVAILABLE, MINING_DATA, ERROR, NEW
- `projectDefinition.projectEntities` — table, filter, activities, breakdowns

---

### mine_project
Triggers a preview or full mine. Preview mines are faster but sample data; full mines process everything.

**Key parameters:**
- `projectId` (or `sysId` on some instances) — the project sys_id from `projectDefinition.projectId`
- `preview` — `true` for preview mine, `false` for full mine

**Sample payload** (same for Zurich, Australia, and later):
```json
{
  "variables": {
    "sysId": "bb2b507b93d8c75017a3f177dd03d622",
    "preview": false
  }
}
```

**⚠️ Full mine confirmation required:** Before triggering a full mine (`preview: false`), always confirm with the user. Full mines are time-consuming and resource-intensive — in many cases it's better to start with a preview mine to get an initial read on the process before committing to a full run. Suggest the preview mine as the default unless the user explicitly needs full data.

**After triggering:** Poll `list_projects` periodically to check `progress` (0–100) and `state` (MINING_DATA → AVAILABLE). The mine creates a new `version.id`.

---

### get_project_details
Returns the full process model for a mined version: nodes, edges, aggregates, breakdowns, filter sets, findings, and version metadata.

**Key parameters:**
- `versionId` — the version sys_id from `list_projects` results
- `filterSets` — optional GlidePromin_FilterInput to scope results (pass `{}` for unfiltered; see filterSets Payload Reference)

**Sample payload** (same for Zurich, Australia, and later):
```json
{
  "variables": {
    "versionId": "8f775f582ba3ba10c9a1f9b36e91bf5d",
    "filterSets": {}
  }
}
```

**What the response contains:**
- `nodes[]` — process states/activities with frequencies, durations, start/end flags
- `edges[]` — transitions between nodes with frequencies, durations, statistics
- `aggregates[]` — model-level stats (caseCount, variantCount, avg/median/stdDev durations)
- `findings[]` — automated insights (REWORK, EXTRA_STEP, PINGPONG) with frequencies and durations
- `breakdowns[]` — breakdown dimension stats (channel, priority, assignment group, etc.)
- `version.filterSets[]` — saved filter sets
- `version.miningStats.totalRecords` — total records mined

**Handling large results:** The response can be very large. When it's stored to a file, use `python3` with `json.load` to parse and extract specific sections rather than trying to read the raw JSON.

---

### cluster_node
Runs clustering analysis on a specific process node to identify behavioral segments.

**Key parameters:**
- `versionId` — the version sys_id
- `elementId` — array of node key values (from `nodes[].key`)
- `elementType` — always `"CLUSTERING_NODE"`
- `filterSets` — pass `{}` for unfiltered (see filterSets Payload Reference)
- `clusterResultCount` — optional, number of clusters to return
- `forceSubmit` — optional, force-submit even if a job is running

**Sample payloads:**

Zurich:
```json
{
  "variables": {
    "versionId": "8f775f582ba3ba10c9a1f9b36e91bf5d",
    "filterSets": {
      "dataFilter": [],
      "breakdowns": [],
      "findingFilter": "",
      "adIntentFilter": "",
      "orderedFilters": []
    },
    "elementType": "CLUSTERING_NODE",
    "elementId": ["8f21d5a6db4144fea86bcd3344000cbf"],
    "clusterResultCount": 20
  }
}
```

Australia and later:
```json
{
  "variables": {
    "versionId": "f6cb58bb93d8c75017a3f177dd03d6ff",
    "filterSets": {
      "dataFilter": [],
      "breakdowns": [],
      "findingFilter": "",
      "orderedFilters": []
    },
    "elementType": "CLUSTERING_NODE",
    "elementId": ["94bbbfdbcbb0d5bb0550b29aafc4601d"],
    "clusterResultCount": 20
  }
}
```

**What the response contains:** Cluster summaries with quality scores, purity details, and per-metric breakdowns showing which case attributes differentiate the clusters.

---

### get_variants
Retrieves process variants for a mined version with support for filtering, pagination, sorting, and text search.

**Key parameters:**
- `versionId` — the version sys_id
- `entityId` — the entity sys_id to scope variants to (from `projectDefinition.projectEntities[].entityId`)
- `filterSets` — optional, scope to a filtered population (see filterSets Payload Reference)
- `variantsLimit` / `variantsOffset` — pagination
- `variantsOrderBy` / `variantsOrderByDesc` — sort (default: descending)
- `variantsQuery` — optional text search to filter variants by name or content

**Sample payloads:**

Zurich:
```json
{
  "variables": {
    "versionId": "3b106bbb2b3322d0c9a1f9b36e91bf04",
    "entityId": "3b5b3acd9364b110ad66fa4e1dba10cb",
    "filterSets": {
      "dataFilter": [],
      "breakdowns": [],
      "findingFilter": "",
      "adIntentFilter": "",
      "orderedFilters": []
    },
    "variantsLimit": 20,
    "variantsOrderBy": "health_score",
    "variantsOrderByDesc": true,
    "variantsQuery": "",
    "variantsOffset": 0
  }
}
```

Australia and later:
```json
{
  "variables": {
    "versionId": "297acd6f83500fd0f4b57f747daad329",
    "entityId": "55177ea683a33a10f4b57f747daad350",
    "filterSets": {
      "dataFilter": [],
      "breakdowns": [],
      "findingFilter": "",
      "orderedFilters": []
    },
    "variantsLimit": 20,
    "variantsOrderBy": "health_score",
    "variantsOrderByDesc": true,
    "variantsQuery": "",
    "variantsOffset": 0
  }
}
```

**What the response contains:** A list of variants with their IDs, activity sequences, case counts, and average durations. Use variant IDs downstream in `VARIANT` filterSets to scope analysis to specific process paths.

---

### get_breakdowns
Retrieves breakdown statistics for a specific field across all cases in a version, optionally scoped by a filter. Including case counts and percentages per value. Useful for understanding population composition before drilling in with a breakdown filter.

**Key parameters:**
- `versionId` — the version sys_id
- `entityId` — the entity sys_id
- `field` — the field name to break down by (e.g., `contact_type`, `priority`, `assignment_group`)
- `filterSets` — optional, scope to a filtered population (see filterSets Payload Reference)

**Sample payloads:**

Zurich:
```json
{
  "variables": {
    "versionId": "297acd6f83500fd0f4b57f747daad329",
    "filterSets": {
      "dataFilter": [],
      "breakdowns": [],
      "findingFilter": "",
      "adIntentFilter": "",
      "orderedFilters": []
    },
    "entityId": "55177ea683a33a10f4b57f747daad350",
    "field": "subcategory"
  }
}
```

Australia and later:
```json
{
  "variables": {
    "versionId": "297acd6f83500fd0f4b57f747daad329",
    "filterSets": {
      "dataFilter": [],
      "breakdowns": [],
      "findingFilter": "",
      "orderedFilters": []
    },
    "entityId": "55177ea683a33a10f4b57f747daad350",
    "field": "subcategory"
  }
}
```


---

### list_filters
Lists all saved filter sets for a process mining version, including their details and statistics.

**Key parameters:**
- `versionId` — the version sys_id

**What the response contains:** All saved filters with their IDs, names, types, applied filterSets configuration, and case counts. Use the filter IDs to reference or delete existing filters, and to avoid creating duplicates.

---

### create_transition_filter
Creates a transition-based filter scoped to cases that followed a specific state sequence, with optional duration constraints between steps.

**Key parameters:**
- `versionId` — the version sys_id
- `filterSets` — the `filterSets` payload defining the transition conditions (see filterSets Payload Reference)
- `name` — optional label for the saved filter

**What the response contains:** The saved filter ID and the resulting process model (nodes, edges, aggregates, findings) scoped to matched cases. Use the filter ID with `delete_filters` to clean up after analysis.

---

### create_breakdown_filter
Creates a filter scoped to cases matching a specific breakdown dimension value, and returns the full process model for that population.

**Key parameters:**
- `versionId` — the version sys_id
- `filterSets` — the `filterSets` payload with a `breakdowns` condition (see filterSets Payload Reference)

**What the response contains:** The filtered process model via `scheduleModel` — nodes, edges, aggregates, breakdowns, findings, and version metadata for the scoped population.

---

### create_variant_filter
Creates a filter scoped to one or more specific variant IDs, returning the process model for that variant population.

**Key parameters:**
- `versionId` — the version sys_id
- `filterSets` — the `filterSets` payload with a `VARIANT` orderedFilter (see filterSets Payload Reference)

**What the response contains:** The filtered process model (nodes, edges, aggregates, breakdowns, findings) for cases matching the specified variants.

---

### create_rule_filter
Creates a rule-based filter using a GlideRecord-style query string to scope cases by field value.

**Key parameters:**
- `versionId` — the version sys_id
- `filterSets` — the `filterSets` payload with a `dataFilter` rule condition (see filterSets Payload Reference)

**What the response contains:** The filtered process model for cases matching the rule condition.

---

### delete_filters
Deletes one or more saved filter sets by their IDs. Use this to clean up filters created during analysis to avoid accumulation.

**Key parameters:**
- `ids` — array of filter sys_ids to delete (obtained from `list_filters` or from the response of filter creation tools)

**Best practice:** Always delete filters created during an analysis session once they are no longer needed.

---

### get_scheduled_tasks
Retrieves scheduled background tasks for a process mining version — including clustering jobs, show_records requests, and analysis tasks — along with their progress, state, and applied filters.

**Key parameters:**
- `versionId` — the version sys_id

**What the response contains:** Task details including task type, state (PENDING, RUNNING, COMPLETE, ERROR), progress percentage, and associated filter configuration. Use this to poll for completion of async operations like `cluster_node`, `show_records`, `intent_and_activity_analysis`, and `transition_work_notes_analysis`.

---

### show_records
Schedules a "show records" operation for a process mining element (node, edge, or transition), returning the underlying case records that contributed to that element.

**Key parameters:**
- `versionId` — the version sys_id
- `elementId` — array of element IDs (node keys or edge IDs)
- `elementType` — the element type (`GlidePromin_ShowRecordType`, e.g., `NODE`, `EDGE`)
- `filterSets` — optional, scope to a filtered population (see filterSets Payload Reference)

**What the response contains:** Either a scheduled task (poll via `get_scheduled_tasks`) or an immediate result with an `identifier`, `caseTable`, and `caseIdField`. Pass these to `show_records_http` to retrieve the actual case list.

---

### show_records_http
Retrieves the actual case records from a completed `show_records` operation via HTTP GET.

**Key parameters:**
- `identifier` — the identifier returned by `show_records`
- `caseTable` — the case table name (e.g., `incident`) returned by `show_records`
- `caseIdField` — the case ID field name (e.g., `sys_id`) returned by `show_records`

**What the response contains:** The list of case records (sys_ids or display values) that passed through the specified process element. Use this to drill into specific cases for root cause analysis.

**Usage pattern:** Always call `show_records` first → poll `get_scheduled_tasks` until complete → then call `show_records_http` with the returned identifiers.

---

### intent_and_activity_analysis
Schedules an AI-powered agent activity analysis for a process element, clustering work activity by intent and returning natural-language intent descriptions.

**Key parameters:**
- `versionId` — the version sys_id
- `elementId` — array of element IDs to analyze
- `elementType` — the analysis element type (`GlidePromin_AgentActivityAnalysisElementType`)
- `filterSets` — required, scope the analysis population (see filterSets Payload Reference)

**What the response contains:** Intent cluster descriptions and activity clustering results showing patterns in how agents worked on cases passing through the element. Async — poll `get_scheduled_tasks` for completion.

---

### transition_work_notes_analysis
Schedules an NLP-based analysis of work notes on transitions, clustering them by content to reveal patterns in what agents documented at handoff points.

**Key parameters:**
- `versionId` — the version sys_id
- `elementId` — array of element IDs (typically edge/transition IDs)
- `elementType` — work note analysis element type (`GlidePromin_WorkNoteAnalysisElementType`)
- `filterSets` — required, scope the analysis population (see filterSets Payload Reference)

**What the response contains:** Cluster analysis and statistics for work notes associated with the specified transitions — useful for understanding why cases are being handed off or escalated. Async — poll `get_scheduled_tasks` for completion.

---

## filterSets Payload Reference

The `filterSets` parameter is used by many tools — `get_project_details`, `cluster_node`, `get_variants`, `get_breakdowns`, `show_records`, `create_transition_filter`, `create_breakdown_filter`, `create_variant_filter`, `create_rule_filter`, `intent_and_activity_analysis`, and `transition_work_notes_analysis` — to scope results to a subset of cases. Pass `{}` for unfiltered results.

Filters are composable — multiple filter types can be combined in a single `filterSets` payload. When stacking filters, **order matters**: conditions must be added in the correct sequence within the `orderedFilters` array. As a rule, place `VIEW` filters first, followed by `TRANSITION` or `VARIANT` filters.

> ⚠️ **The `filterSets` payload shape differs between Zurich and Australia/later.** Key differences:
> - Zurich uses `advancedTransitions` for transition filters; Australia uses `transitionChains`
> - Australia transition conditions include additional fields: `conditionType`, `nodeConstraints`, and `includePath`
> - Australia omits the `adIntentFilter` field present in Zurich

---

### Zurich filterSets Payloads

#### View Filter
```json
{
  "filterSets": {
    "dataFilter": [],
    "breakdowns": [],
    "findingFilter": "",
    "adIntentFilter": "",
    "orderedFilters": [
      {
        "type": "VIEW",
        "viewFilter": [
          {
            "entityId": "d6b05e9a93906690ad66fa4e1dba1000",
            "activities": ["1eb05e9a93906690ad66fa4e1dba1001"]
          }
        ]
      }
    ]
  }
}
```

#### Transition Filter
Stacks a `TRANSITION` filter after a `VIEW` filter. Uses `advancedTransitions` with `transitionConstraints` for duration bounding.
```json
{
  "filterSets": {
    "dataFilter": [],
    "breakdowns": [],
    "findingFilter": "",
    "adIntentFilter": "",
    "orderedFilters": [
      {
        "type": "VIEW",
        "viewFilter": [
          {
            "entityId": "d6b05e9a93906690ad66fa4e1dba1000",
            "activities": ["1eb05e9a93906690ad66fa4e1dba1001"]
          }
        ]
      },
      {
        "type": "TRANSITION",
        "advancedTransitions": [
          {
            "advancedTransitions": [
              {
                "entityId": "d6b05e9a93906690ad66fa4e1dba1000",
                "field": "state",
                "predicate": "EQ",
                "occurrence": "ALWAYS",
                "relation": "FOLLOWED_BY",
                "context": null,
                "values": ["2"]
              },
              {
                "entityId": "d6b05e9a93906690ad66fa4e1dba1000",
                "field": "state",
                "predicate": "EQ",
                "occurrence": "ALWAYS",
                "relation": "FOLLOWED_BY",
                "context": null,
                "values": ["6"]
              }
            ],
            "transitionConstraints": [
              {
                "fromIndex": 0,
                "toIndex": 1,
                "minDuration": 120,
                "maxDuration": 1800,
                "fieldConstraint": { "type": "NONE", "field": "" }
              }
            ]
          }
        ]
      }
    ]
  }
}
```

#### Rule-based Filter
Uses `dataFilter` with a GlideRecord-style query string to filter cases by field value.
```json
{
  "filterSets": {
    "dataFilter": [
      {
        "entityId": "d6b05e9a93906690ad66fa4e1dba1000",
        "query": "contact_type=email"
      }
    ],
    "breakdowns": [],
    "findingFilter": "",
    "adIntentFilter": "",
    "orderedFilters": [
      {
        "type": "VIEW",
        "viewFilter": [
          {
            "entityId": "d6b05e9a93906690ad66fa4e1dba1000",
            "activities": ["1eb05e9a93906690ad66fa4e1dba1001"]
          }
        ]
      }
    ]
  }
}
```

#### Breakdown Filter
Filters cases by a breakdown dimension (e.g., channel, priority).
```json
{
  "filterSets": {
    "dataFilter": [],
    "breakdowns": [
      {
        "entityId": "d6b05e9a93906690ad66fa4e1dba1000",
        "breakdowns": [{ "field": "contact_type", "values": ["phone"] }]
      }
    ],
    "findingFilter": "",
    "adIntentFilter": "",
    "orderedFilters": [
      {
        "type": "VIEW",
        "viewFilter": [
          {
            "entityId": "d6b05e9a93906690ad66fa4e1dba1000",
            "activities": ["1eb05e9a93906690ad66fa4e1dba1001"]
          }
        ]
      }
    ]
  }
}
```

#### Variant Filter
Scopes results to specific variant IDs, stacked after a `VIEW` filter.
```json
{
  "filterSets": {
    "dataFilter": [],
    "breakdowns": [],
    "findingFilter": "",
    "adIntentFilter": "",
    "orderedFilters": [
      {
        "type": "VIEW",
        "viewFilter": [
          {
            "entityId": "d6b05e9a93906690ad66fa4e1dba1000",
            "activities": ["1eb05e9a93906690ad66fa4e1dba1001"]
          }
        ]
      },
      {
        "type": "VARIANT",
        "variantFilter": [
          {
            "entityId": "d6b05e9a93906690ad66fa4e1dba1000",
            "variantIds": ["8c5ed39324f44dc2ac0d4e860befb530"]
          }
        ]
      }
    ]
  }
}
```

---

### Australia (and later) filterSets Payloads

#### View Filter
```json
{
  "filterSets": {
    "dataFilter": [],
    "breakdowns": [],
    "findingFilter": "",
    "orderedFilters": [
      {
        "type": "VIEW",
        "viewFilter": [
          {
            "entityId": "55177ea683a33a10f4b57f747daad350",
            "activities": ["55177ea683a33a10f4b57f747daad355"]
          }
        ]
      }
    ]
  }
}
```

#### Transition Filter
Uses `transitionChains` instead of `advancedTransitions`. Each condition includes `conditionType` and `nodeConstraints`. Duration constraints use `nodeToNodeConstraints` with a `type: "DURATION"` shape.
```json
{
  "filterSets": {
    "dataFilter": [],
    "breakdowns": [],
    "findingFilter": "",
    "orderedFilters": [
      {
        "type": "VIEW",
        "viewFilter": [
          {
            "entityId": "55177ea683a33a10f4b57f747daad350",
            "activities": ["55177ea683a33a10f4b57f747daad355"]
          }
        ]
      },
      {
        "type": "TRANSITION",
        "transitionChains": [
          {
            "transitionConditions": [
              {
                "entityId": "55177ea683a33a10f4b57f747daad350",
                "field": "state",
                "predicate": "EQ",
                "occurrence": "ALWAYS",
                "relation": "FOLLOWED_BY",
                "context": null,
                "values": ["2"],
                "conditionType": "SINGLE",
                "nodeConstraints": []
              },
              {
                "entityId": "55177ea683a33a10f4b57f747daad350",
                "field": "state",
                "predicate": "EQ",
                "occurrence": "ALWAYS",
                "relation": "FOLLOWED_BY",
                "context": null,
                "values": ["6"],
                "conditionType": "SINGLE",
                "nodeConstraints": []
              }
            ],
            "nodeToNodeConstraints": [
              {
                "fromIndex": 0,
                "toIndex": 1,
                "type": "DURATION",
                "min": 120,
                "max": 1800,
                "field": null
              }
            ],
            "includePath": true
          }
        ]
      }
    ]
  }
}
```

#### Rule-based Filter
```json
{
  "filterSets": {
    "dataFilter": [
      {
        "entityId": "55177ea683a33a10f4b57f747daad350",
        "query": "contact_type=email"
      }
    ],
    "breakdowns": [],
    "findingFilter": "",
    "orderedFilters": [
      {
        "type": "VIEW",
        "viewFilter": [
          {
            "entityId": "55177ea683a33a10f4b57f747daad350",
            "activities": ["55177ea683a33a10f4b57f747daad355"]
          }
        ]
      }
    ]
  }
}
```

#### Breakdown Filter
```json
{
  "filterSets": {
    "dataFilter": [],
    "breakdowns": [
      {
        "entityId": "55177ea683a33a10f4b57f747daad350",
        "breakdowns": [{ "field": "contact_type", "values": ["email"] }]
      }
    ],
    "findingFilter": "",
    "orderedFilters": [
      {
        "type": "VIEW",
        "viewFilter": [
          {
            "entityId": "55177ea683a33a10f4b57f747daad350",
            "activities": ["55177ea683a33a10f4b57f747daad355"]
          }
        ]
      }
    ]
  }
}
```

#### Variant Filter
Multiple variant IDs can be passed in the `variantIds` array.
```json
{
  "filterSets": {
    "dataFilter": [],
    "breakdowns": [],
    "findingFilter": "",
    "orderedFilters": [
      {
        "type": "VIEW",
        "viewFilter": [
          {
            "entityId": "55177ea683a33a10f4b57f747daad350",
            "activities": ["55177ea683a33a10f4b57f747daad355"]
          }
        ]
      },
      {
        "type": "VARIANT",
        "variantFilter": [
          {
            "entityId": "55177ea683a33a10f4b57f747daad350",
            "variantIds": [
              "80842d383722d6ff8bdf7a6251bfc1ab",
              "5a39429e1c80f8d07f64f7b2752b408d",
              "e2e3afd44082f791814d2e340a869541"
            ]
          }
        ]
      }
    ]
  }
}
```

---

## Analysis Workflow

### Phase 1: Project Discovery

1. **List available projects** using `list_projects`. Present a summary to the user showing project name, case count, variant count, average duration, state, and last mined date.
2. **Let the user select** the project to analyze. If the user names a project, match it from the list.
3. **Note key IDs** for downstream use:
   - `projectDefinition.projectId` → for mining
   - `version.id` → for get_project_details and clustering
   - `projectEntities[].entityId` → for entity-specific queries

### Phase 2: Mining (if needed)

If the project needs a fresh mine (stale data, new version needed, or user requests it):

1. **Ask the user** whether they want a preview mine (faster, sampled) or full mine.
2. **Trigger the mine** using `mine_project`.
3. **Poll for completion** by calling `list_projects` periodically. Report progress percentage. When `state` becomes `AVAILABLE` and `progress` is 100, the mine is complete. Note the new `version.id`.

### Phase 3: Process Model Retrieval

1. **Call `get_project_details`** with the version ID.
2. **Parse the response** systematically. Extract and organize:

   **Nodes (process states/activities):**
   - Label, frequency (absolute and case-level), average duration
   - Identify start node (`isStart: true`) and end node (`isEnd: true`)
   - Flag high-frequency nodes (potential bottlenecks) and high-duration nodes (time sinks)
   - Note nodes with unknown labels like `(13001)` — these are unmapped state values

   **Edges (transitions):**
   - From → To labels, frequencies, durations
   - Identify the happy path (highest-frequency path from start to end)
   - Flag backward edges (potential rework) and low-frequency deviations

   **Aggregates:**
   - Total cases, variants, min/max/avg/median case duration, standard deviation
   - High std deviation relative to mean indicates process variability

   **Findings (automated insights):**
   - REWORK — cases revisiting a node they already passed through
   - EXTRA_STEP — unnecessary intermediate steps between two nodes
   - PINGPONG — back-and-forth between two specific nodes
   - Rank findings by total duration impact (totalDuration) to prioritize

   **Breakdowns:**
   - Distribution across dimensions like channel, priority, assignment group, category
   - Useful for segmentation and root cause analysis

### Phase 4: Analysis & Interpretation

Apply these consulting-grade analysis frameworks:

#### 4a. Process Flow Analysis
- Map the **happy path** (most common variant from start to end)
- Identify **deviation points** where cases diverge from the happy path
- Calculate **happy path adherence** — what percentage of cases follow it?
- Quantify the **cost of deviation** in time (compare happy path avg duration vs. overall avg)

#### 4b. Bottleneck Analysis (Theory of Constraints)
Apply Goldratt's Theory of Constraints methodology:

1. **IDENTIFY** the constraint — the node with highest total duration impact (frequency × avgDuration). This is where the most time is consumed across all cases.
2. **EXPLOIT** the constraint — analyze what's happening at this node. Use clustering to understand behavioral segments. Are there specific categories, priorities, or assignment groups that drive the bottleneck?
3. **SUBORDINATE** everything else — examine edges leading into the bottleneck. Are upstream nodes feeding cases efficiently, or is there batching/delay?
4. **ELEVATE** the constraint — propose automation, staffing, or process redesign recommendations.
5. **REPEAT** — identify the next constraint after the first is addressed.

#### 4c. Rework Analysis
For each REWORK finding:
- Calculate the **rework rate** — frequency ÷ total cases passing through that node
- Estimate **rework cost** — totalDuration in business hours
- Identify **rework triggers** — what causes cases to return to this state? Look at the edges and variant patterns.
- Classify rework as **avoidable** (process failure, missing information) vs. **inherent** (legitimate escalation, complex cases)

#### 4d. Ping-Pong Analysis
For each PINGPONG finding:
- Identify the **handoff pattern** — which two nodes are bouncing cases?
- Quantify the **handoff overhead** — average duration per ping-pong cycle
- Root cause — usually indicates unclear ownership, missing information requirements, or inadequate triage

#### 4e. Extra Step Analysis
For each EXTRA_STEP finding:
- Determine if the step is **truly unnecessary** or serves a legitimate governance purpose
- Calculate **time penalty** — avgDuration × frequency
- Recommend whether to eliminate, automate, or optimize the step

#### 4f. Variant Analysis
- Identify the **top 10 variants** by case frequency
- Compare their average durations against the overall average
- Map variant patterns to business scenarios (e.g., simple incidents vs. complex multi-team incidents)

### Phase 5: Clustering (Deep Dive)

When a bottleneck node is identified, run clustering to understand why:

1. **Get the node key** from the nodes array (the `key` field, not `nodeStatsId`)
2. **Call `cluster_node`** with the node key in the `elementId` array
3. **Interpret clusters** — each cluster represents a behavioral segment of cases passing through that node. Look for:
   - Cluster size distribution (are most cases in one cluster?)
   - Distinguishing attributes (which breakdowns differ between clusters?)
   - Duration differences between clusters
   - Actionable segments (e.g., "Cluster 1: high-priority cases from phone channel with avg 48h wait — candidate for fast-track automation")

### Phase 6: Recommendations

Structure recommendations using the **IMPACT framework**:
- **I**dentify — What specific problem was found?
- **M**easure — What's the quantified impact (hours, cases, cost)?
- **P**ropose — What's the recommended action?
- **A**utomate — Can this be addressed with AI/automation (AI Agents, workflow rules)?
- **C**ompare — What's the expected improvement?
- **T**imeline — What's the implementation complexity (quick win vs. strategic initiative)?

Prioritize recommendations by:
1. Total time impact (totalDuration from findings)
2. Feasibility of automation
3. Number of cases affected

### Phase 7: Report Generation

When generating a formal report, use the `docx` and `smart-brevity-docx` skills. Also apply `servicenow-brand-standards` if creating for ServiceNow audiences.

**Report Structure:**
1. **Executive Summary** — One paragraph with the single most important finding and recommended action
2. **Process Overview** — Case count, variant count, average duration, process flow description
3. **Key Findings** — Top 3-5 findings ranked by impact, each with quantified metrics
4. **Bottleneck Analysis** — Theory of Constraints analysis of the primary constraint
5. **Recommendations** — IMPACT framework recommendations, prioritized
6. **Appendix** — Full node/edge statistics, variant details, clustering results if run

---

## Troubleshooting

### Common MCP Errors

**`UnusedFragment` GraphQL validation errors:**
The MCP server's GraphQL query defines fragment definitions that aren't referenced in the main query body. This is a bug in the MCP server code. The fix is to either remove the unused fragment definitions or add the corresponding spread references (e.g., `...FRAGMENT_NAME`) into the appropriate selection sets in the GraphQL query.

**`Invalid query is provided` on list_projects:**
Some instances don't support the `query` parameter for text search. Fall back to listing all projects with a high `limit` and filtering locally by name.

**Mine stuck at low progress:**
Preview mines on small datasets should complete in 1-3 minutes. Full mines on large datasets can take 10+ minutes. Poll `list_projects` every 15-30 seconds. If progress doesn't advance after several minutes, the mine may have errored — check if `state` changes to `ERROR`.

**Tool result too large for context:**
Large `get_project_details` responses get saved to a file. Use bash with python to parse and extract specific sections:
```bash
cat /path/to/result.json | python3 -c "
import json, sys
data = json.load(sys.stdin)
parsed = json.loads(data[0]['text'])
model = parsed['GlidePromin_Query']['scheduleModel']
# Extract what you need from model['nodes'], model['edges'], etc.
"
```

### Instance Selection
If multiple MCP server instances are available, present the options to the user. Key considerations:
- Different instances may have different projects
- Tool availability may vary (some tools may have bugs on certain instances)
- If one instance's tool fails, try the equivalent tool on another instance

---

## Key Terminology

- **Case** — A single process instance (e.g., one incident from creation to closure)
- **Variant** — A unique sequence of activities/states that a case follows
- **Node** — A state or activity in the process (e.g., "In Progress", "Assigned")
- **Edge** — A transition between two nodes
- **Finding** — An automated insight about process inefficiency
- **Rework** — A case revisiting a state it already passed through
- **Ping-Pong** — Repeated back-and-forth handoffs between two states
- **Extra Step** — An intermediate state that may not add value
- **Breakdown** — A case attribute used for segmentation (e.g., priority, channel)
- **Filter Set** — A saved combination of filters applied to the process model
- **Clustering** — ML-based segmentation of cases at a specific node
- **Happy Path** — The most common (or ideal) variant through the process