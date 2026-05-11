# ServiceNow Process Mining MCP Server

A Model Context Protocol (MCP) server that exposes ServiceNow Process Mining GraphQL APIs as tools for Claude and other MCP clients.

---

# ServiceNow Process Mining — MCP Tools Inventory

---

## Instance & Project Setup
| Tool | Description |
|---|---|
| `get_servicenow_version` | Detects the ServiceNow release version (e.g. `zurich`, `australia`) |
| `list_projects` | Lists all Process Mining projects on the instance |
| `mine_project` | Triggers a preview or full mine on a project |
| `get_scheduled_tasks` | Polls async job status (progress, state) |

## Process Model Retrieval
| Tool | Description |
|---|---|
| `get_project_details` | Returns the full process model — nodes, edges, aggregates, findings, breakdowns |
| `get_breakdowns` | Retrieves breakdown stats for a specific field |
| `get_variants` | Retrieves process variants with pagination and sorting |

## Filter Management
| Tool | Description |
|---|---|
| `list_filters` | Lists all saved filter sets for a version |
| `get_filter_details` | Returns details of a saved filter set |
| `create_transition_filter` | Creates a filter isolating cases by state transition and duration |
| `create_variant_filter` | Creates a filter scoped to specific variants |
| `create_breakdown_filter` | Creates a filter scoped to a breakdown value |
| `create_rule_filter` | Creates a rule-based filter using workflow attributes |
| `delete_filters` | Deletes filter sets by ID |

## Analysis & AI
| Tool | Description |
|---|---|
| `cluster_node` | Runs ML clustering on a process node to identify behavioral segments (async) |
| `transition_work_notes_analysis` | Analyzes work notes on a transition between two nodes (async) |
| `intent_and_activity_analysis` | Analyzes agent intent and activity at a node — Australia and later only (async) |

## Record Retrieval
| Tool | Description |
|---|---|
| `show_records` | Retrieves case records for a process element (async) |
| `show_records_http` | HTTP retrieval of `show_records` results by identifier |

## ServiceNow Table Access
| Tool | Description |
|---|---|
| `query_table` | Queries any ServiceNow table via the REST Table API |
| `table_stats` | Returns aggregate statistics for a table with optional grouping |

## Output & Actions
| Tool | Description |
|---|---|
| `create_report_record` | Creates a report record in `sys_report` scoped to specific sys_ids |
| `create_automation_request` | Creates an AI Agent automation request record from process mining findings |


## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Build

```bash
npm run build
```

### 3. Configure environment variables

```bash
export SN_INSTANCE_URL="https://yourinstance.service-now.com"
export SN_USERNAME="your_username"
export SN_PASSWORD="your_password"
```

### 4. Run

```bash
npm start
```

---

## Claude Desktop Configuration

This step is needed to make Claude aware of the ServiceNow Local MCP Server.
In this mode, you do not need to manually start the MCP Server locally via 'npm start'. If properly configured in the `claude_desktop_config.json`, it will be started automatically.

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "servicenow-promin": {
      "command": "node",
      "args": ["/absolute/path/to/servicenow-promin-mcp/dist/index.js"],
      "env": {
        "SN_INSTANCE_URL": "https://yourinstance.service-now.com",
        "SN_USERNAME": "your_username",
        "SN_PASSWORD": "your_password"
      }
    }
  }
}
```

Config file locations:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

---

## Skills

In addition to all MCP tools available in this local MCP Server that granularly allow performing actions on an already created Process Mining project, there are skills which may lead different automated analysis for a given workflow. These Process Mining skills are structured and packaged like this:
- process-miner: This is the base skill including details about all MCP tools, with their descriptions and other important payload details.
- automation-analysis: This skill focuses on running an analysis on the workflow looking for low hanging opportunities such as tasks that complete between 2 and 15 mins which can be easily automated with AI Agents.
- reopened-cases-analysis: This skill focuses on running an analysis looking for workflows that reach the end and are reopened. It includes the analysis of worknotes with the intent to identify the requestor's reopened details.
- multi-hop-ping-pong-analysis: This skill focuses on running an analysis looking for situations where workflows hop across too many groups slowing down the start and processing of any given request. This also implies a bad triaging implementation.
- slow-approvals-analysis: This skill focuses on running an analysis on the ServiceNow request workflow that analysis approvals and tasks as connected entities, looking for approvals with long cycle times that are slowing down the end-to-end processing of the self-service requested transaction.

You can import them into Claude Desktop, or you can also install them into the user's home folder as needed.
