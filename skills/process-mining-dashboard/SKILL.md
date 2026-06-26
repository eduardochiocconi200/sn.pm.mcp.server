---
name: process-mining-dashboard
description: "Generate Process Mining Executive Overview dashboards (HTML) and PowerPoint decks from ServiceNow Process Mining data. Produces branded 5-tab HTML dashboards (Key Findings, Root Cause Analysis, AI Agent Opportunities, Impact Projection, Roadmap) plus matching PPTX decks. Trigger when user asks to create a dashboard, executive overview, briefing, deck, or presentation from Process Mining data — 'create a dashboard', 'build an executive overview', 'generate a PM report', 'make a presentation', 'create deliverables for [customer]', 'turn this analysis into a dashboard'. Also trigger after a process-miner analysis when user wants polished client-facing artifacts, or says 'make it look nice' or 'package this up'. Depends on process-miner skill for MCP tools and html-artifact-brand-skill-v1 for ServiceNow branding."
---

# Process Mining Executive Dashboard Skill

## Overview

Generates polished, executive-ready deliverables from ServiceNow Process Mining project data:

1. **HTML Dashboard** — A self-contained, ServiceNow-branded interactive dashboard with 5 tabs
2. **PowerPoint Deck** — A matching 16–21 slide presentation built with pptxgenjs

Both deliverables follow identical data, narrative structure, and branding.

**Prerequisites:**
- Process Mining data — either from a completed analysis via the `process-miner` skill, or raw data
  from `get_project_details` stored at `/mnt/user-data/tool_results/`
- RCA records — ideally from `query_table` calls against the underlying ServiceNow table
- Customer name and process name — for headers and branding

If the user hasn't yet run the analysis, direct them to the `process-miner` skill first.

---

## Critical: Calendar Years for All Time Metrics

**All time-based metrics MUST use calendar years (8,760 hrs/year = 365.25 × 24)** to match the
Process Mining workbench. Using working-hour person-years (2,080 hrs/yr) creates a 4.21× inflation.

```
Calendar years = totalDuration_seconds / (365.25 × 24 × 3600)
Cost at $75/hr  = (totalDuration_seconds / 3600) × 75
```

**Table column headers:** Use "Time consumed" — not "Person-years", "Cal. years", or "FTE-years".

---

## Step 1 — Extract Data from Process Model

Parse the `get_project_details` response (stored at `/mnt/user-data/tool_results/`):

```python
import json
with open('/mnt/user-data/tool_results/{filename}.json') as f:
    raw = json.load(f)
parsed = json.loads(raw[0]['text'])
model = parsed['GlidePromin_Query']['scheduleModel']
```

**Extract:**

| Data | Source | Used In |
|---|---|---|
| Key metrics (cases, variants, avg duration) | `model['aggregates'][0]['model']` | Hero stats |
| Nodes (state dwell, group bottlenecks) | `model['nodes']` | Bottleneck ranking, dwell bars |
| Edges (transitions, volumes, durations) | `model['edges']` | Intersection table, process maps |
| Findings (rework, outliers, extremes) | `model['findings']` | Findings table, RCA callouts |

Build a label map: `key_to_label = {n['key']: n['label'] for n in model['nodes']}`

---

## Step 2 — Classify Nodes and Edges

Separate state nodes from assignment group nodes. State names vary by process:
- **Incident:** New, In Progress, On Hold, Resolved, Closed, Canceled
- **RITM:** Open, Work in Progress, Pending, Closed Complete, Closed Incomplete, Closed Cancelled
- **Change:** New, Assess, Authorize, Scheduled, Implement, Review, Closed, Canceled

Classify edges as: State→State, Group→State, State→Group, Group→Group.

---

## Step 3 — Query Actual Records for RCA Evidence

Query the underlying ServiceNow table for the top bottleneck cases:
- Sort by `reassignment_countDESC` for incidents
- Sort by longest-running items for RITMs and changes
- Extract: `number`, `short_description`, `assignment_group`, `close_notes`, `priority`

Cross-reference record data with process model findings to identify root cause patterns. Every RCA
finding must cite actual record numbers — not just model statistics.

---

## Step 4 — Calculate All Metrics

Convert all durations using calendar years:
```python
calendar_years = seconds / (365.25 * 24 * 3600)
cost_usd = (seconds / 3600) * 75
cost_per_quarter = cost_usd / 4
```

Verify key values against the PM workbench before proceeding.

---

## Step 5 — Generate HTML Dashboard

Read `/mnt/skills/organization/html-artifact-brand-skill-v1/SKILL.md` for full branding guidelines.

Build a fully self-contained single-file HTML dashboard. All CSS and JS must be inline — no external
CDN dependencies. Save to `/mnt/user-data/outputs/{Customer}_{Process}_Process_Mining_Dashboard.html`.

### Tab 1: Key Findings
- Findings table — all findings ranked by cost impact. Columns: Finding, Category, Cases, Time
  consumed, Cost/qtr, Severity (badge)
- Bottleneck ranking table — top 8–10 nodes by totalDuration
- Three summary cards — the three highest-impact patterns with bar visualisations
- State × assignment group intersection table (if applicable)
- State dwell time bars — horizontal bars showing where cases spend the most time

### Tab 2: Root Cause Analysis
- Two RCA clusters — each in a glass card with a header badge showing total time consumed and
  cost/quarter, plus 3 sub-findings each with a colour-coded left border and inline cost callout
  (e.g., "— $1.1M/qtr") citing specific record numbers from Step 3
- Total cost impact summary — three stat cards + green-bordered total bar
- Methodology callout — data source, date mined, scope, activity definitions

### Tab 3: AI Agent Opportunities
- Three prioritised AI Agent cards — each with opportunity number, title, badge (Quick win /
  High impact / Strategic), description linking to the root cause addressed, and three metrics:
  Cases/Reduction target, Time recovered, Timeline

### Tab 4: Impact Projection
- Two hero stat boxes — projected quarterly savings (years) and annualised cost avoidance ($)
- Impact table — each AI Agent opportunity with Time saved/qtr, Annual value, Timeline
- Total row highlighted in green
- Comparison callout — how this process compares to others analysed

### Tab 5: Roadmap
- 5-phase timeline — week ranges with milestone titles and descriptions
- Data source callout — mining date, scope, filters, activity definitions

**Brand colours:**
```css
--infinite-blue: #032D42;    /* Background */
--wasabi-green: #63DF4E;     /* Accent, positive values */
--white: #FFFFFF;             /* Primary text */
--gray-400: #9CA3AF;         /* Secondary text */
--err: #F87171;               /* Critical severity */
--warn: #FBBF24;              /* High severity */
--bright-blue: #52B8FF;       /* Medium severity / info */
--bright-indigo: #7661FF;     /* Tertiary accent */
```

---

## Step 6 — Generate PowerPoint Deck

Read `/mnt/skills/public/pptx/SKILL.md` before writing code. Use `pptxgenjs`.

Save to `/mnt/user-data/outputs/{Customer}_{Process}_Process_Mining.pptx`.

**Slide structure (16–21 slides):**
1. Cover — Customer name, process name, "Process Mining Executive Overview", date, case count
2. Executive Summary — top-level narrative + key metrics
3. Process at a Glance — stat boxes matching dashboard hero stats
4. Divider: Key Findings
5. Findings Table
6. State × Group Intersection (or Bottleneck Ranking)
7. State Dwell Time Bars
8. Divider: Root Cause Analysis
9. RCA Cluster 1 (with cost callouts citing record numbers)
10. RCA Cluster 2 (with cost callouts citing record numbers)
11. RCA Automation / Quick-touch candidates
12. Total Cost Impact Summary
13. Divider: Process Maps (optional)
14. Process Map: State Lifecycle
15. Assignment Group Bottleneck Ranking
16. Divider: AI Agent Opportunities
17. Prioritised Opportunities
18. Impact Projection
19. Divider: Roadmap
20. 12-Week Roadmap
21. Thank You / Data Source

**PPTX colour scheme:**
```javascript
const IB = "032D42";   // Infinite Blue
const WG = "63DF4E";   // Wasabi Green
const WH = "FFFFFF";   // White
const G4 = "9CA3AF";   // Gray 400
const GL = "0A3D54";   // Glass container fill
const ER = "F87171";   // Critical
const WN = "FBBF24";   // Warning
const BL = "52B8FF";   // Info
```

---

## Step 7 — Verify and Present

Before presenting, check:
- Zero "person-year" references — all time should be in "Time consumed" column header
- All RCA findings cite actual record numbers (not just model stats)
- Key values validated against PM workbench
- Both files named correctly

Present both files to the user via `present_files`.

---

## Naming Conventions

- Dashboard header: **"[Customer] IT [Process Name]"** (e.g., "Principal Financial IT Incident
  Management")
- Subtitle: **"Process Mining Executive Overview"** — NOT "CIO Executive Briefing"
- HTML filename: `{Customer}_{Process}_Process_Mining_Dashboard.html`
- PPTX filename: `{Customer}_{Process}_Process_Mining.pptx`

---

## Process-Specific Patterns

### Incident Management
- **Primary pattern:** Rework and reassignment churn
- **Key metrics:** Reassignment tax, rework loops, reopen rate
- **AI Agent opportunities:** Auto-resolution, intelligent triage, resolution quality gates
- **RCA focus:** Hardware lifecycle bottlenecks, cross-domain ownership gaps, premature closures

### Service Request Fulfillment (RITM)
- **Primary pattern:** Dwell time in stale queues
- **Key metrics:** Extreme Open→Closed durations, fulfillment group dwell times
- **AI Agent opportunities:** Security provisioning auto-fulfillment, stale request management
- **RCA focus:** Investment/specialised platform bottlenecks, identity management chains

### Change Management
- **Primary pattern:** Change window scheduling and approval bottlenecks
- **Key metrics:** Scheduled state dwell, Authorize state dwell, auto-close rate
- **AI Agent opportunities:** Change window scheduling optimizer, auto-approval for low-risk changes
- **RCA focus:** Scheduling delays, approval friction, PIR stalls

---

## Common Pitfalls

| Pitfall | Prevention |
|---|---|
| Using person-years (2,080 hrs/yr) instead of calendar years | Always divide seconds by 31,557,600 |
| Calling it "CIO Executive Briefing" | Use "Process Mining Executive Overview" |
| Missing cost callouts on RCA findings | Every RCA sub-finding needs an inline "— $X/qtr" |
| Forgetting to cross-reference with query_table | RCA must cite actual record numbers |
| Inconsistent table headers | Always use "Time consumed" column header |
| `cluster_node` API failing | Fall back to `query_table` for RCA |
| `intent_and_activity_analysis` unavailable | Plan workarounds upfront — not on all instances |
