#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createServer } from "http";

import { QueryConstantsFactory } from "./query_constants_factory.js";

// ── Config from environment ──────────────────────────────────────────────────
const INSTANCE_URL = process.env.SN_INSTANCE_URL ?? ""; // e.g. https://myinstance.service-now.com
const USERNAME = process.env.SN_USERNAME ?? "";
const PASSWORD = process.env.SN_PASSWORD ?? "";
const VERSION = process.env.SN_VERSION?.toLowerCase() ?? ""; // zurich, australia, brazil (all in lowercase).
const GRAPHQL_PATH = "/api/now/graphql";

// OAuth configuration
const AUTH_TYPE = process.env.SN_AUTH_TYPE?.toLowerCase() ?? "basic"; // "basic" or "oauth"
const CLIENT_ID = process.env.SN_CLIENT_ID ?? "";
const CLIENT_SECRET = process.env.SN_CLIENT_SECRET ?? "";
const TOKEN_URL = process.env.SN_TOKEN_URL ?? "oauth_token.do";

// Transport configuration
const TRANSPORT_TYPE = process.env.SN_TRANSPORT_TYPE?.toLowerCase() ?? "stdio"; // "stdio" or "sse"
const PORT = process.env.SN_PORT ? parseInt(process.env.SN_PORT) : 3000;
const HOST = process.env.SN_HOST ?? "localhost";

// ── Query constants using factory pattern ───────────────────────────────────────
const queryConstants = QueryConstantsFactory.getQueriesAuto(INSTANCE_URL, VERSION);

// OAuth token management
interface OAuthToken {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  expires_at?: number;
}

let cachedToken: OAuthToken | null = null;

// OAuth token management functions
async function getOAuthToken(): Promise<string> {
  // Check if we have a valid cached token
  if (cachedToken && cachedToken.expires_at && Date.now() < cachedToken.expires_at) {
    return cachedToken.access_token;
  }

  // Request new token using client credentials flow
  const tokenUrl = `${INSTANCE_URL}/${TOKEN_URL}`;
  const params = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
  });

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OAuth token request failed: HTTP ${response.status} - ${errorText}`);
  }

  const tokenData = (await response.json()) as OAuthToken;
  
  // Cache the token with expiration time
  tokenData.expires_at = Date.now() + (tokenData.expires_in * 1000) - (60000); // Refresh 1 minute early
  cachedToken = tokenData;

  return tokenData.access_token;
}

function isOAuthConfigured(): boolean {
  return AUTH_TYPE === "oauth" && CLIENT_ID.length > 0 && CLIENT_SECRET.length > 0;
}

async function getAuthHeader(): Promise<string> {
  if (isOAuthConfigured()) {
    const token = await getOAuthToken();
    return `Bearer ${token}`;
  } else {
    return "Basic " + Buffer.from(`${USERNAME}:${PASSWORD}`).toString("base64");
  }
}

// Legacy sync function for backward compatibility
function authHeader(): string {
  return "Basic " + Buffer.from(`${USERNAME}:${PASSWORD}`).toString("base64");
}

// SSE transport setup
function setupSSETransport(server: Server) {
  const httpServer = createServer();
  
  // Handle SSE connections
  httpServer.on("request", (req, res) => {
    if (req.url === "/mcp/sse") {
      const transport = new SSEServerTransport("/mcp/sse", res);
      server.connect(transport).catch(console.error);
    } else {
      // Handle other routes or return 404
      res.writeHead(404);
      res.end("Not Found");
    }
  });

  return httpServer;
}

async function graphql(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<unknown> {
  const url = `${INSTANCE_URL}${GRAPHQL_PATH}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: await getAuthHeader(),
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }

  const json = (await res.json()) as { data?: unknown; errors?: unknown[] };
  if (json.errors?.length) {
    throw new Error(`GraphQL errors: ${JSON.stringify(json.errors, null, 2)}. Original Query: ${JSON.stringify({ query, variables })}`);
  }
  return json.data;
}

// ── Tool definitions ─────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: "list_projects",
    description:
      "List all Process Mining projects. Returns project summaries with case counts, variant counts, durations, owners, and permissions.",
    inputSchema: {
      type: "object",
      properties: {
        offset: {
          type: "number",
          description: "Pagination offset (default 0)",
        },
        limit: {
          type: "number",
          description: "Number of results to return (default 100)",
        },
        orderBy: {
          type: "string",
          description: "Sort field, e.g. 'last_mined_time' or 'name'",
        },
        orderByDesc: {
          type: "boolean",
          description: "Sort descending (default true)",
        },
        projectPermissionType: {
          type: "string",
          enum: ["ALL_PROJECTS", "ALL", "CREATED_BY_ME", "SHARED_WITH_ME"],
          description: "Filter by permission type",
        },
        query: {
          type: "string",
          description: "Text search to filter projects by name",
        },
      },
    },
  },
  {
    name: "get_project_details",
    description:
      "Get the full process model for a project version: nodes, edges, aggregates, findings, filter sets, and version metadata.",
    inputSchema: {
      type: "object",
      required: ["versionId"],
      properties: {
        versionId: {
          type: "string",
          description: "sys_id of the process mining version",
        },
        filterSets: {
          type: "object",
          description: "Optional GlidePromin_FilterInput to scope results",
        },
      },
    },
  },
  {
    name: "mine_project",
    description:
      "Trigger full mining (or sample mining) of a process mining project.",
    inputSchema: {
      type: "object",
      required: ["projectId", "preview"],
      properties: {
        projectId: {
          type: "string",
          description: "projectId of the project to mine",
        },
        preview: {
          type: "boolean",
          description: "true for sample mining, false for a full mine",
        },
      },
    },
  },
  {
    name: "cluster_node",
    description:
      "Trigger clustering analysis on a process mining project node. Returns cluster summaries with metrics, quality scores, and purity details.",
    inputSchema: {
      type: "object",
      required: ["versionId", "filterSets", "elementType", "elementId"],
      properties: {
        versionId: {
          type: "string",
          description: "sys_id of the process mining version",
        },
        filterSets: {
          type: "object",
          description:
            "GlidePromin_FilterInput to apply (pass {} for unfiltered)",
        },
        elementType: {
          type: "string",
          enum: ["CLUSTERING_NODE"],
          description: "Type of element to cluster",
        },
        elementId: {
          type: "array",
          items: { type: "string" },
          description: "Array of node element IDs to cluster",
        },
        clusterResultCount: {
          type: "number",
          description: "Number of cluster results to return",
        },
        forceSubmit: {
          type: "boolean",
          description: "Force submit the clustering job",
        },
      },
    },
  },
  {
    name: "create_rule_filter",
    description:
      "Create a rule-based filter for process mining projects using workflow attributes",
    inputSchema: {
      type: "object",
      required: ["versionId"],
      properties: {
        versionId: {
          type: "string",
          description: "sys_id of the process mining version",
        },
        filterSets: {
          type: "object",
          description: "Optional GlidePromin_FilterInput to apply filters",
        },
      },
    },
  },
  {
    name: "create_transition_filter",
    description:
      "Create a transition-based filter for process mining projects using nodes to determine sequence with the ability to add intra node constraints.",
    inputSchema: {
      type: "object",
      required: ["versionId"],
      properties: {
        versionId: {
          type: "string",
          description: "sys_id of the process mining version",
        },
        name: {
          type: "string",
          description: "name is the name or label of the newly created filter",
        },
        filterSets: {
          type: "object",
          description: "Optional GlidePromin_FilterInput to apply filters",
        },
      },
    },
  },
  {
    name: "list_filters",
    description:
      "List filter sets for a process mining version, including filter details and statistics.",
    inputSchema: {
      type: "object",
      required: ["versionId"],
      properties: {
        versionId: {
          type: "string",
          description: "sys_id of the process mining version",
        },
      },
    },
  },
  {
    name: "delete_filters",
    description: "Delete filter sets by their IDs.",
    inputSchema: {
      type: "object",
      required: ["ids"],
      properties: {
        ids: {
          type: "array",
          items: { type: "string" },
          description: "Array of filter IDs to delete",
        },
      },
    },
  },
  {
    name: "get_filter_details",
    description: "Get filter details for a process mining version with applied filters, including nodes, edges, aggregates, and findings.",
    inputSchema: {
      type: "object",
      required: ["versionId"],
      properties: {
        versionId: {
          type: "string",
          description: "sys_id of the process mining version",
        },
        filterSets: {
          type: "object",
          description: "GlidePromin_FilterInput to apply filters",
        },
      },
    },
  },
  {
    name: "get_variants",
    description: "Retrieve process variants for a process mining version with support for filtering, pagination, sorting, and search.",
    inputSchema: {
      type: "object",
      required: ["versionId", "entityId"],
      properties: {
        versionId: {
          type: "string",
          description: "sys_id of the process mining version",
        },
        filterSets: {
          type: "object",
          description: "GlidePromin_FilterInput to apply filters",
        },
        entityId: {
          type: "string",
          description: "Entity ID to filter variants",
        },
        variantsLimit: {
          type: "number",
          description: "Number of variants to return (default varies)",
        },
        variantsOffset: {
          type: "number",
          description: "Offset for pagination (default 0)",
        },
        variantsOrderBy: {
          type: "string",
          description: "Sort field for variants",
        },
        variantsOrderByDesc: {
          type: "boolean",
          description: "Sort descending (default true)",
        },
        variantsQuery: {
          type: "string",
          description: "Text search to filter variants by name or content",
        },
      },
    },
  },
  {
    name: "get_breakdowns",
    description: "Retrieve breakdown statistics for a specific field in a process mining version with optional filtering.",
    inputSchema: {
      type: "object",
      required: ["versionId", "entityId", "field"],
      properties: {
        versionId: {
          type: "string",
          description: "sys_id of the process mining version",
        },
        filterSets: {
          type: "object",
          description: "GlidePromin_FilterInput to apply filters",
        },
        entityId: {
          type: "string",
          description: "Entity ID to get breakdowns for",
        },
        field: {
          type: "string",
          description: "Field name to break down by",
        },
      },
    },
  },
  {
    name: "create_variant_filter",
    description: "Create a variant filter for process mining workbench data, retrieving nodes, edges, aggregates, breakdowns, findings, and filter sets.",
    inputSchema: {
      type: "object",
      required: ["versionId"],
      properties: {
        versionId: {
          type: "string",
          description: "sys_id of the process mining version",
        },
        filterSets: {
          type: "object",
          description: "GlidePromin_FilterInput to apply filters",
        },
      },
    },
  },
  {
    name: "get_scheduled_tasks",
    description: "Retrieve scheduled tasks for a process mining version, including task details, progress, type, state, and applied filters.",
    inputSchema: {
      type: "object",
      required: ["versionId"],
      properties: {
        versionId: {
          type: "string",
          description: "sys_id of the process mining version",
        },
      },
    },
  },
  {
    name: "show_records",
    description: "Schedule a show record operation for process mining elements, returning either a scheduled task or show record result with identifier, case table, and case ID field.",
    inputSchema: {
      type: "object",
      required: ["versionId", "elementType", "elementId"],
      properties: {
        versionId: {
          type: "string",
          description: "sys_id of the process mining version",
        },
        filterSets: {
          type: "object",
          description: "GlidePromin_FilterInput to apply filters",
        },
        elementType: {
          type: "string",
          description: "Type of element to show records for (GlidePromin_ShowRecordType)",
        },
        elementId: {
          type: "array",
          items: { type: "string" },
          description: "Array of element IDs to show records for",
        },
      },
    },
  },
  {
    name: "show_records_http",
    description: "Retrieve show records via HTTP GET request with parameterized query string for identifier, case table, and case ID field.",
    inputSchema: {
      type: "object",
      properties: {
        identifier: {
          type: "string",
          description: "Identifier for the show records request",
        },
        caseTable: {
          type: "string",
          description: "Case table name (e.g., 'incident')",
        },
        caseIdField: {
          type: "string",
          description: "Case ID field name (e.g., 'sys_id')",
        },
      },
    },
  },
  {
    name: "query_table",
    description: "Query ServiceNow tables using the REST Table API with support for filtering, ordering, and field selection.",
    inputSchema: {
      type: "object",
      required: ["tableName"],
      properties: {
        tableName: {
          type: "string",
          description: "Name of the ServiceNow table to query (e.g., 'incident', 'task')",
        },
        sysparm_query: {
          type: "string",
          description: "Encoded query to filter records (e.g., 'active=true^priority=1')",
        },
        sysparm_fields: {
          type: "string",
          description: "Comma-separated list of fields to return (e.g., 'number,short_description,priority')",
        },
        sysparm_limit: {
          type: "number",
          description: "Maximum number of records to return (default: 10)",
        },
        sysparm_offset: {
          type: "number",
          description: "Number of records to skip for pagination (default: 0)",
        },
        sysparm_orderby: {
          type: "string",
          description: "Field to sort by (e.g., 'created_on' or 'created_onDESC')",
        },
        sysparm_display_value: {
          type: "string",
          enum: ["true", "false", "all"],
          description: "Return display values for reference fields (default: 'false')",
        },
      },
    },
  },
  {
    name: "table_stats",
    description: "Retrieve ServiceNow table statistics using the REST Stats API with support for grouping and counting records.",
    inputSchema: {
      type: "object",
      required: ["tableName"],
      properties: {
        tableName: {
          type: "string",
          description: "Name of the ServiceNow table to get stats for (e.g., 'sc_req_item', 'incident', 'task')",
        },
        sysparm_group_by: {
          type: "string",
          description: "Field to group statistics by (e.g., 'cat_item', 'priority', 'state')",
        },
        sysparm_count: {
          type: "boolean",
          description: "Include count in the response (default: true)",
        },
        sysparm_display_value: {
          type: "boolean",
          description: "Return display values for reference fields (default: true)",
        },
      },
    },
  },
  {
    name: "create_report_record",
    description: "Create a report record in sys_report table with baked-in sys_id filters for targeted data retrieval.",
    inputSchema: {
      type: "object",
      required: ["table", "filter", "type", "title"],
      properties: {
        table: {
          type: "string",
          description: "Source table name (e.g., 'incident', 'task')",
        },
        filter: {
          type: "string",
          description: "Encoded query with sys_id IN clause (e.g., 'sys_idINabc123,def456')",
        },
        type: {
          type: "string",
          description: "Report type (e.g., 'list' for simple list reports)",
        },
        title: {
          type: "string",
          description: "Report title or description",
        },
        fields: {
          type: "string",
          description: "Additional fields for sys_report table customization",
        },
      },
    },
  },
  {
    name: "transition_work_notes_analysis",
    description: "Schedule work note analysis for process mining transitions, returning cluster analysis and statistics for work notes.",
    inputSchema: {
      type: "object",
      required: ["versionId", "filterSets", "elementId", "elementType"],
      properties: {
        versionId: {
          type: "string",
          description: "sys_id of the process mining version",
        },
        filterSets: {
          type: "object",
          description: "GlidePromin_FilterInput to apply filters",
        },
        elementId: {
          type: "array",
          items: { type: "string" },
          description: "Array of element IDs to analyze work notes for",
        },
        elementType: {
          type: "string",
          description: "Work note analysis element type (GlidePromin_WorkNoteAnalysisElementType)",
        },
        clusterResultCount: {
          type: "number",
          description: "Number of cluster results to return",
        },
      },
    },
  },
  {
    name: "intent_and_activity_analysis",
    description: "Schedule agent activity analysis for process mining, returning intent descriptions and activity clustering results.",
    inputSchema: {
      type: "object",
      required: ["versionId", "filterSets", "elementId", "elementType"],
      properties: {
        versionId: {
          type: "string",
          description: "sys_id of the process mining version",
        },
        filterSets: {
          type: "object",
          description: "GlidePromin_FilterInput to apply filters",
        },
        elementId: {
          type: "array",
          items: { type: "string" },
          description: "Array of element IDs to analyze agent activities for",
        },
        elementType: {
          type: "string",
          description: "Agent activity analysis element type (GlidePromin_AgentActivityAnalysisElementType)",
        },
        clusterResultCount: {
          type: "number",
          description: "Number of cluster results to return",
        },
      },
    },
  },
  {
    name: "get_servicenow_version",
    description: "Get the ServiceNow instance version by querying the sys_properties table for the glide.war property.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "create_breakdown_filter",
    description: "Create a filter based on a breakdown value and retrieve model data with nodes, edges, aggregates, breakdowns, findings, and version metadata using scheduleModel.",
    inputSchema: {
      type: "object",
      required: ["versionId"],
      properties: {
        versionId: {
          type: "string",
          description: "sys_id of the process mining version",
        },
        filterSets: {
          type: "object",
          description: "Optional GlidePromin_FilterInput to scope results",
        },
      },
    },
  },
  {
    name: "create_automation_request",
    description: "Create a single AI Agent automation request record in ServiceNow based on Incident Analysis 2 process mining findings.",
    inputSchema: {
      type: "object",
      required: ["process_name", "requested_for", "actual_time", "intake_source", "request_type"],
      properties: {
        process_name: {
          type: "string",
          description: "Name of the automation process (e.g., 'Identity & Access Automation — MFA/Okta/2FA Failures')",
        },
        requested_for: {
          type: "string",
          description: "User or group the automation request is for (e.g., 'admin')",
        },
        actual_time: {
          type: "string",
          description: "Actual time for the automation process in HH:MM:SS format (e.g., '00:00:09')",
        },
        intake_source: {
          type: "string",
          description: "Source of the automation request (e.g., 'process_mining')",
        },
        request_type: {
          type: "string",
          description: "Type of request (e.g., 'automation')",
        },
        priority: {
          type: "string",
          description: "Priority level (1-5, where 1 is highest)",
        },
        urgency: {
          type: "string",
          description: "Urgency level (1-3, where 1 is highest)",
        },
        impact: {
          type: "string",
          description: "Impact level (1-3, where 1 is highest)",
        },
        volume_of_transactions: {
          type: "string",
          description: "Number of transactions processed",
        },
        number_of_steps: {
          type: "string",
          description: "Number of steps in the automation process",
        },
        interval_type: {
          type: "string",
          description: "Time interval type (e.g., 'Minutes')",
        },
        description: {
          type: "string",
          description: "Detailed description of the automation request",
        },
        short_description: {
          type: "string",
          description: "Brief summary of the automation request",
        },
      },
    },
  },
];

// ── Server ───────────────────────────────────────────────────────────────────

const server = new Server(
  { name: "servicenow-promin-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  try {
    let data: unknown;

    switch (name) {
      case "list_projects":
        data = await graphql(queryConstants.QUERY_LIST_PROJECTS, args);
        break;

      case "get_project_details":
        data = await graphql(queryConstants.QUERY_GET_PROJECT_DETAILS, {
          versionId: args.versionId,
          filterSets: args.filterSets ?? {},
        });
        break;

      case "mine_project":
        data = await graphql(queryConstants.QUERY_MINE_PROJECT, {
          projectId: args.projectId,
          preview: args.preview,
        });
        break;

      case "cluster_node":
        data = await graphql(queryConstants.QUERY_CLUSTER_NODE, {
          versionId: args.versionId,
          filterSets: args.filterSets,
          elementType: args.elementType,
          elementId: args.elementId,
          clusterResultCount: args.clusterResultCount,
          forceSubmit: args.forceSubmit,
        });
        break;

      case "create_transition_filter":
        data = await graphql(queryConstants.QUERY_CREATE_TRANSITION_FILTER, {
          versionId: args.versionId,
          filterSets: args.filterSets ?? {}
        });
        break;

      case "list_filters":
        data = await graphql(queryConstants.QUERY_LIST_FILTERS, {
          versionId: args.versionId,
        });
        break;

      case "delete_filters":
        data = await graphql(queryConstants.QUERY_DELETE_FILTERS, {
          ids: args.ids,
        });
        break;

      case "get_filter_details":
        data = await graphql(queryConstants.QUERY_GET_FILTER_DETAILS, {
          versionId: args.versionId,
          filterSets: args.filterSets ?? {},
        });
        break;

      case "create_variant_filter":
        data = await graphql(queryConstants.QUERY_CREATE_VARIANT_FILTER, {
          versionId: args.versionId,
          filterSets: args.filterSets ?? {},
        });
        break;

      case "get_variants":
        data = await graphql(queryConstants.QUERY_GET_VARIANTS, {
          versionId: args.versionId,
          filterSets: args.filterSets ?? {},
          entityId: args.entityId,
          variantsLimit: args.variantsLimit,
          variantsOffset: args.variantsOffset,
          variantsOrderBy: args.variantsOrderBy,
          variantsOrderByDesc: args.variantsOrderByDesc,
          variantsQuery: args.variantsQuery,
        });
        break;

      case "get_breakdowns":
        data = await graphql(queryConstants.QUERY_GET_BREAKDOWNS, {
          versionId: args.versionId,
          filterSets: args.filterSets ?? {},
          entityId: args.entityId,
          field: args.field,
        });
        break;

      case "create_rule_filter":
        data = await graphql(queryConstants.QUERY_CREATE_RULE_BASED_FILTER, {
          versionId: args.versionId,
          filterSets: args.filterSets ?? {},
        });
        break;

      case "create_breakdown_filter":
        data = await graphql(queryConstants.QUERY_CREATE_BREAKDOWN_FILTER, {
          versionId: args.versionId,
          filterSets: args.filterSets ?? {},
        });
        break;

      case "get_scheduled_tasks":
        data = await graphql(queryConstants.QUERY_GET_SCHEDULED_TASKS, {
          versionId: args.versionId,
        });
        break;

      case "show_records":
        data = await graphql(queryConstants.QUERY_SHOW_RECORDS, {
          versionId: args.versionId,
          filterSets: args.filterSets ?? {},
          elementType: args.elementType,
          elementId: args.elementId,
        });
        break;

      case "show_records_http":
        const baseUrl = INSTANCE_URL + "/po_show_records.do";
        const params = new URLSearchParams();
        params.append("identifier", String(args.identifier || "40d64596c32f321055cab8ee05013107"));
        params.append("caseTable", String(args.caseTable || "incident"));
        params.append("caseIdField", String(args.caseIdField || "sys_id"));
        const url = `${baseUrl}?${params.toString()}`;
        
        const response = await fetch(url, {
          method: "GET",
          headers: {
            "Authorization": await getAuthHeader(),
            "Content-Type": "application/json",
          },
        });
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        data = await response.text();
        break;

      case "query_table":
        const tableApiUrl = `${INSTANCE_URL}/api/now/table/${args.tableName}`;
        const queryParams = new URLSearchParams();
        
        if (args.sysparm_query) queryParams.append("sysparm_query", String(args.sysparm_query));
        if (args.sysparm_fields) queryParams.append("sysparm_fields", String(args.sysparm_fields));
        if (args.sysparm_limit) queryParams.append("sysparm_limit", String(args.sysparm_limit));
        if (args.sysparm_offset) queryParams.append("sysparm_offset", String(args.sysparm_offset));
        if (args.sysparm_orderby) queryParams.append("sysparm_orderby", String(args.sysparm_orderby));
        if (args.sysparm_display_value) queryParams.append("sysparm_display_value", String(args.sysparm_display_value));
        
        const tableUrl = `${tableApiUrl}?${queryParams.toString()}`;
        
        const tableResponse = await fetch(tableUrl, {
          method: "GET",
          headers: {
            "Authorization": await getAuthHeader(),
            "Accept": "application/json",
            "Content-Type": "application/json",
          },
        });
        
        if (!tableResponse.ok) {
          throw new Error(`HTTP error! status: ${tableResponse.status}`);
        }
        
        data = await tableResponse.json();
        break;

      case "table_stats":
        const statsApiUrl = `${INSTANCE_URL}/api/now/stats/${args.tableName}`;
        const statsParams = new URLSearchParams();
        
        if (args.sysparm_group_by) statsParams.append("sysparm_group_by", String(args.sysparm_group_by));
        if (args.sysparm_count !== undefined) statsParams.append("sysparm_count", String(args.sysparm_count));
        if (args.sysparm_display_value !== undefined) statsParams.append("sysparm_display_value", String(args.sysparm_display_value));
        
        // Set defaults
        if (!statsParams.has("sysparm_count")) statsParams.append("sysparm_count", "true");
        if (!statsParams.has("sysparm_display_value")) statsParams.append("sysparm_display_value", "true");
        
        const statsUrl = `${statsApiUrl}?${statsParams.toString()}`;
        
        const statsResponse = await fetch(statsUrl, {
          method: "GET",
          headers: {
            "Authorization": await getAuthHeader(),
            "Accept": "application/json",
            "Content-Type": "application/json",
          },
        });
        
        if (!statsResponse.ok) {
          throw new Error(`HTTP error! status: ${statsResponse.status}`);
        }
        
        data = await statsResponse.json();
        break;

      case "create_report_record":
        const reportApiUrl = `${INSTANCE_URL}/api/now/table/sys_report`;
        
        // Build report record payload
        const reportPayload: Record<string, string> = {
          table: String(args.table),
          filter: String(args.filter),
          type: String(args.type),
          title: String(args.title),
        };
        
        // Add optional fields if provided
        if (args.fields) {
          reportPayload.fields = String(args.fields);
        }
        
        const reportResponse = await fetch(reportApiUrl, {
          method: "POST",
          headers: {
            "Authorization": await getAuthHeader(),
            "Accept": "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(reportPayload),
        });
        
        if (!reportResponse.ok) {
          throw new Error(`HTTP error! status: ${reportResponse.status}`);
        }
        
        data = await reportResponse.json();
        break;

      case "transition_work_notes_analysis":
        data = await graphql(queryConstants.QUERY_TRANSITION_WORK_NOTES_ANALYSIS, {
          versionId: args.versionId,
          filterSets: args.filterSets ?? {},
          elementId: args.elementId,
          elementType: args.elementType,
          clusterResultCount: args.clusterResultCount,
        });
        break;

      case "intent_and_activity_analysis":
        data = await graphql(queryConstants.QUERY_INTENT_AND_ACTIVITY_ANALYSIS, {
          versionId: args.versionId,
          filterSets: args.filterSets ?? {},
          elementId: args.elementId,
          elementType: args.elementType,
          clusterResultCount: args.clusterResultCount,
        });
        break;

      case "get_servicenow_version":
        const versionApiUrl = `${INSTANCE_URL}/api/now/table/sys_properties`;
        const versionParams = new URLSearchParams();
        versionParams.append("sysparm_query", "name=glide.war");
        versionParams.append("sysparm_fields", "value");
        versionParams.append("sysparm_display_value", "false");
        
        const versionUrl = `${versionApiUrl}?${versionParams.toString()}`;
        
        const versionResponse = await fetch(versionUrl, {
          method: "GET",
          headers: {
            "Authorization": await getAuthHeader(),
            "Accept": "application/xml",
            "Content-Type": "application/xml",
          },
        });
        
        if (!versionResponse.ok) {
          throw new Error(`HTTP error! status: ${versionResponse.status}`);
        }
        
        const versionXmlText = await versionResponse.text();
        
        // Extract the <value> tag content using regex
        const valueMatch = versionXmlText.match(/<value>([^<]+)<\/value>/);
        if (!valueMatch) {
          throw new Error("Could not find <value> tag in the response");
        }
        
        // Detect version from the extracted value
        let detectedVersion = "";
        if (valueMatch[1].includes("australia")) {
          detectedVersion = "australia";
        } else if (valueMatch[1].includes("zurich")) {
          detectedVersion = "zurich";
        } else if (valueMatch[1].includes("brazil")) {
          detectedVersion = "brazil";
        } else {
          // Default fallback if version detection fails
          detectedVersion = "australia";
        }
        
        data = {
          version: detectedVersion,
          fullResponse: versionXmlText
        };
        break;

      case "create_automation_request":
        // Validate required fields
        const requiredFields = ["process_name", "requested_for", "actual_time", "intake_source", "request_type"];
        const missingFields = requiredFields.filter(field => !args[field]);
        
        if (missingFields.length > 0) {
          throw new Error(`Missing required fields: ${missingFields.join(", ")}`);
        }

        const automationApiUrl = `${INSTANCE_URL}/api/now/table/sn_ac_automation_request`;
        
        // Build automation request payload
        const automationPayload: Record<string, string> = {
          process_name: String(args.process_name),
          requested_for: String(args.requested_for),
          actual_time: String(args.actual_time),
          intake_source: String(args.intake_source),
          request_type: String(args.request_type),
        };
        
        // Add optional fields if provided
        const optionalFields = ["priority", "urgency", "impact", "volume_of_transactions", "number_of_steps", "interval_type", "description", "short_description"];
        optionalFields.forEach(field => {
          if (args[field]) {
            automationPayload[field] = String(args[field]);
          }
        });
        
        const automationResponse = await fetch(automationApiUrl, {
          method: "POST",
          headers: {
            "Authorization": await getAuthHeader(),
            "Accept": "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(automationPayload),
        });
        
        if (!automationResponse.ok) {
          const errorText = await automationResponse.text();
          throw new Error(`HTTP error! status: ${automationResponse.status} - ${errorText}`);
        }
        
        data = await automationResponse.json();
        break;

      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true,
    };
  }
});

async function main() {
  // Validate required environment variables based on transport type
  if (TRANSPORT_TYPE === "stdio") {
    if (!INSTANCE_URL || !USERNAME || !PASSWORD) {
      console.error(
        "Missing required env vars for stdio transport: SN_INSTANCE_URL, SN_USERNAME, SN_PASSWORD",
      );
      process.exit(1);
    }
  } else if (TRANSPORT_TYPE === "sse") {
    if (!INSTANCE_URL) {
      console.error(
        "Missing required env var for sse transport: SN_INSTANCE_URL",
      );
      process.exit(1);
    }
    
    // For OAuth, check OAuth credentials
    if (isOAuthConfigured()) {
      console.log("Using OAuth authentication");
    } else if (!USERNAME || !PASSWORD) {
      console.error(
        "Missing authentication credentials: Either OAuth (SN_CLIENT_ID, SN_CLIENT_SECRET) or Basic Auth (SN_USERNAME, SN_PASSWORD) required",
      );
      process.exit(1);
    }
  }

  // Setup transport based on type
  if (TRANSPORT_TYPE === "sse") {
    console.log(`Starting MCP server with SSE transport on ${HOST}:${PORT}`);
    const httpServer = setupSSETransport(server);
    
    httpServer.listen(PORT, HOST, () => {
      console.error(`ServiceNow Process Mining MCP server running on http://${HOST}:${PORT}`);
      console.log(`SSE endpoint available at: http://${HOST}:${PORT}/mcp/sse`);
    });
    
    // Handle graceful shutdown
    process.on("SIGTERM", () => {
      console.log("Received SIGTERM, shutting down gracefully");
      httpServer.close(() => {
        console.log("HTTP server closed");
        process.exit(0);
      });
    });
    
    process.on("SIGINT", () => {
      console.log("Received SIGINT, shutting down gracefully");
      httpServer.close(() => {
        console.log("HTTP server closed");
        process.exit(0);
      });
    });
    
  } else {
    // Default stdio transport
    // console.log("Starting MCP server with stdio transport");
    const transport = new StdioServerTransport();
    await server.connect(transport);
    // console.error("ServiceNow Process Mining MCP server running");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
