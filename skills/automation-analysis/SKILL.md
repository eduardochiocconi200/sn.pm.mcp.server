---
name: automation-analysis
description: 'End-to-end automation candidate analysis for ServiceNow Process Mining. Isolates quick-touch cases via transition filter, runs clustering and work notes analysis, and generates a ranked AI Agent recommendations report plus an interactive HTML dashboard. Optionally generates an executive PowerPoint deck and a detailed implementation specification (user stories backlog) for Build Agent consumption. If the spec is created, also offers to create Automation Request entries in ServiceNow for each AI Agent recommendation. Trigger on: "run the full analysis", "find automation candidates", "what can I automate", "end-to-end pipeline".'
---

# Process Mining — End-to-End Automation Analysis

## Overview

This skill executes a full Process Mining automation analysis pipeline, from instance setup through
all deliverable outputs. It combines state view retrieval, transition filtering, bottleneck and
clustering analysis, work notes investigation, and AI Agent recommendations into a single cohesive
workflow.

The methodology isolates **quick-touch cases** — work that transitions between a start and end state
within a configurable time window (default 2–30 minutes). This window captures routine, manual work
that is ideal for AI Agent automation.

**Depends on:**
- `process-miner` skill — MCP tool reference, filterSets payload shapes, polling patterns
- `docx` + `smart-brevity-docx` skills — Word report generation
- `pptx` skill — PowerPoint deck generation (Step 22, if requested)
- `servicenow-brand-standards-reference` — brand compliance for all outputs

---

## ⛔ MANDATORY PRE-FLIGHT — READ BEFORE ANY TOOL CALLS

Before executing **any step** of this skill, Claude MUST call the `view` tool on all three dependency
skills in this order:

1. `/mnt/skills/user/process-miner/SKILL.md` — **required for filterSets payload shapes**. The
   transition filter payload (Zurich `advancedTransitions` / Australia `transitionChains`) is
   documented there with working examples. Do NOT attempt to construct a `create_transition_filter`
   payload from memory.
2. `/mnt/skills/public/docx/SKILL.md` — required before writing any report generation code.
3. `/mnt/skills/user/smart-brevity-docx/SKILL.md` — required before writing any report generation
   code.

**Do NOT proceed to Step 1 until all three skills have been read in this session.**

---

## Step Sequence at a Glance

| Step | Action | Always / Conditional |
|---|---|---|
| 1 | Detect instance version | Always |
| 2 | List and select project | Always |
| 3 | Validate project readiness | Always |
| 4 | Retrieve state view (process model) | Always |
| 5 | Parse and present the state model | Always |
| 6 | Identify transition pair | Always |
| 7 | Confirm filter parameters with user | Always |
| 8 | Build and submit transition filter | Always |
| 9 | Parse the quick-touch population | Always |
| 10 | Compute headline metrics | Always |
| 11 | Analyse state dwell breakdown | Always |
| 12 | Run breakdown analysis (category / channel / team) | Always |
| 13 | Variant analysis | Always if variantCount > 1 |
| 14 | Version branch — choose ONE path | Always |
| 15 — `[AUSTRALIA+]` | Intent & activity analysis | `australia` or later ONLY — skip on `zurich` |
| 16 — `[ZURICH]` | Clustering | `zurich` ONLY — skip on `australia`+; requires caseCount ≥ 100 |
| 17 — `[ZURICH]` | Work notes analysis | `zurich` ONLY — skip on `australia`+ |
| 18 | Build automation candidate scorecard | Always |
| 19 | Apply IMPACT framework | Always |
| 20 | Calculate total automation opportunity | Always |
| 21 | Generate Word report | Always |
| 22 | Generate interactive HTML dashboard | Always |
| 23 | Prompt: PowerPoint deck + implementation spec? | Always |
| 24 | Generate PowerPoint executive deck | If user selects Yes at Step 23 |
| 25 | Generate implementation specification | If user selects Yes at Step 23 |
| 26 | Prompt: create Automation Request records? | If Step 25 was completed |
| 27 | Create Automation Request records in ServiceNow | If user selects Yes at Step 26 |

**Version prefix convention used throughout this skill:**
- `[AUSTRALIA+]` — step runs on `australia` and all later releases; skip entirely on `zurich`
- `[ZURICH]` — step runs on `zurich` only; skip entirely on `australia` and later

> ⚠️ Steps 15 and 16/17 are mutually exclusive paths. Never attempt Step 15 on a `zurich`
> instance — `intent_and_activity_analysis` does not exist there and will fail.

---

## Step 1 — Detect Instance Version

Call `get_servicenow_version` on the target instance. Store the `version` field — it governs payload
shapes for **all** downstream tools:

| Version | `create_transition_filter` shape | Deep-dive tool (Steps 15–17) |
|---|---|---|
| `zurich` | `advancedTransitions` + `transitionConstraints` | `cluster_node` + `transition_work_notes_analysis` |
| `australia` or later | `transitionChains` + `nodeToNodeConstraints` + `conditionType: "SINGLE"` | `intent_and_activity_analysis` only |

> ⚠️ The MCP connection label (e.g., `servicenow-zurich`) does NOT reliably indicate the ServiceNow
> version. Always call `get_servicenow_version` first.

---

## Step 2 — List and Select Project

Call `list_projects` with the correct `projectPermissionType` for the instance:
- **Zurich**: `ALL_PROJECTS` or `CREATED_BY_ME`
- **Australia / later**: `ALL` or `CREATED_BY_ME`

Do NOT pass a `query` parameter — list all and filter locally.

Present to user: project name, case count, variant count, avg duration, last mined date, state.

**Extract and store:**
- `version.id` → used in all downstream tool calls
- `projectDefinition.projectId` → for mining if needed
- `projectEntities[].entityId` → for all filterSets
- State activity `id` (where `field == "state"`) → **state activity ID** for VIEW filter
- Assignment group activity `id` → available for blended view if needed

---

## Step 3 — Validate Project Readiness

- Confirm `state == "AVAILABLE"` and `progress == 100`
- If not mined or stale → offer `mine_project`, poll `list_projects` until complete before
  proceeding to Step 4

---

## Step 4 — Retrieve State View (Process Model)

Call `get_project_details` with a `filterSets` VIEW filter scoped to the **state activity only**.
This strips assignment group nodes and returns a cleaner, lower-variant process map.

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

> ⚠️ **Polling required.** The first response may be a `GlidePromin_ScheduledTask` (state 0,
> progress 0). Re-call the same tool repeatedly — do not give up within 2 minutes. Continue until
> `GlidePromin_Model` is returned.

---

## Step 5 — Parse and Present the State Model

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

---

## Step 6 — Identify Transition Pair

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

## Step 7 — Confirm Filter Parameters with User

Present the proposed start state, end state, and duration window. Adjust if the user specifies
different states or time bounds before proceeding to Step 8.

---

## Step 8 — Build and Submit Transition Filter

Call `create_transition_filter` combining:
1. **VIEW filter** — same state activity scope as Step 4
2. **TRANSITION filter** — start state `FOLLOWED_BY` end state with duration constraint

Duration values are in **seconds**: 2 min = `120`, 30 min = `1800`.

See the `process-miner` skill's **filterSets Payload Reference** for the correct payload shape per
instance version (Zurich uses `advancedTransitions`; Australia/later uses `transitionChains`).

Name the filter descriptively: e.g., `"In Progress → Resolved (2–30 min)"`.

> ⚠️ **Polling required.** First response is typically a `GlidePromin_ScheduledTask`. Re-call the
> same `create_transition_filter` with identical parameters repeatedly until `GlidePromin_Model` is
> returned.

---

## Step 9 — Parse the Quick-Touch Population

Store as the **quick-touch population**. Extract:
- `aggregates[].model` → filtered caseCount, variantCount, avgCaseDuration, medianDuration, stdDeviation
- `nodes[]` → all state nodes in the filtered population, with their `key` values
- `edges[]` → transitions, especially the qualifying start→end edge
- `breakdowns[]` → channel, category, priority, assignment group breakdown within filtered population

**Calculate:**
```
automation_opportunity_rate = filtered_caseCount / baseline_caseCount × 100
```

**Store node keys** for Steps 16–17:
- `start_node_key` → `nodes[].key` where `value == "<start_state_value>"`
- `end_node_key` → `nodes[].key` where `value == "<end_state_value>"`

---

## Step 10 — Compute Headline Metrics

Compute and present:
- **Automation opportunity rate**: filtered / baseline cases × 100
- **Duration comparison**: baseline avg vs quick-touch avg (absolute and % reduction)
- **Variance signal**: quick-touch stdDev vs baseline stdDev — a large drop confirms a consistent,
  automatable population

---

## Step 11 — Analyse State Dwell Breakdown

For each node in the filtered model, present dwell time in human-readable format (minutes/hours).
Flag the start state dwell — this is the **AI Agent action window**. For incident workflows, the In
Progress dwell should be <10 minutes to qualify as a strong automation candidate.

---

## Step 12 — Run Breakdown Analysis

For each available breakdown dimension (category, channel, priority, assignment_group):
- Compare quick-touch distribution vs baseline distribution
- Calculate over/under-representation index: (QT% − baseline%) = delta pp
- Positive delta → over-represented in quick-touch → higher automation priority
- Negative delta → under-represented → likely complex, deprioritise

---

## Step 13 — Variant Analysis *(skip if variantCount = 1)*

Call `get_variants` scoped to the same filterSets:
- `versionId`, `entityId`, `variantsLimit: 50`, `variantsOrderByDesc: true`
- Identify single-touch variants (straight path, no rework) → highest automation confidence
- Calculate single-touch %: cases in top 1–2 variants / total filtered cases

---

## Step 14 — Version Branch: Choose the Correct Deep-Dive Path

After completing Steps 10–13, check the version stored in Step 1 and follow exactly one path:

**If version = `australia` or any later release → take the `[AUSTRALIA+]` path:**
→ Proceed to **Step 15 `[AUSTRALIA+]`** (Intent & Activity Analysis)
→ **Skip Steps 16 `[ZURICH]` and 17 `[ZURICH]` entirely** — they do not apply to this version

**If version = `zurich` → take the `[ZURICH]` path:**
→ **Skip Step 15 `[AUSTRALIA+]` entirely** — `intent_and_activity_analysis` does not exist on Zurich
→ Check the quick-touch caseCount from Step 9:
  - If caseCount ≥ 100 → proceed to **Step 16 `[ZURICH]`** (Clustering), then **Step 17 `[ZURICH]`** (Work Notes)
  - If caseCount < 100 → **skip Step 16 `[ZURICH]`**, note *"Dataset too small for reliable ML segmentation (N cases < 100 minimum). Skipping clustering."*, proceed to **Step 17 `[ZURICH]`** (Work Notes) only

> ⚠️ This is a hard branch — never attempt a `[AUSTRALIA+]` step on a `zurich` instance or a
> `[ZURICH]` step on an `australia`+ instance.

---

## Step 15 — `[AUSTRALIA+]` Intent & Activity Analysis *(skip entirely on `zurich`)*

> ⛔ **`[ZURICH]` instances: do NOT run this step.** `intent_and_activity_analysis` was introduced
> in the Australia release and does not exist on Zurich. If version = `zurich`, go to Step 16 `[ZURICH]`.

Call `intent_and_activity_analysis` with:
- `elementType`: `"AGENT_ACTIVITY_ANALYZER_NODE"`
- `elementId`: `[start_node_key]`
- `filterSets`: same VIEW + TRANSITION filterSets from Step 8
- `clusterResultCount`: 5–10

This is async — first call submits the job. Re-poll after 90–120 seconds until result returns.

Interpret:
- **Intent descriptions** → each maps to an AI Agent capability
- **Activity clusters** → each represents a distinct AI Agent workflow
- **Resolution patterns** → become the AI Agent's action sequence

After completing Step 15, **skip Steps 16 and 17** — intent analysis replaces both on Australia.
Proceed directly to Step 18.

---

## Step 16 — `[ZURICH]` Clustering *(skip entirely on `australia`+)*

> ⛔ **`[AUSTRALIA+]` instances: do NOT run this step.** Step 15 `[AUSTRALIA+]` already covered
> the deep-dive. This step only runs when version = `zurich` AND caseCount ≥ 100.

Call `cluster_node` with:
- `elementId`: `[start_node_key]` (use `key` field — NOT `nodeStatsId`)
- `elementType`: `"CLUSTERING_NODE"`
- `filterSets`: same VIEW + TRANSITION filterSets from Step 8
- `forceSubmit: false`
- `clusterResultCount`: 10–20

First response is `GlidePromin_ScheduledTask` → poll until `GlidePromin_ClusteringResult`.

Interpret:
- Quality >90% → specific AI Agent candidate, named use case
- Quality 100% → deployable with zero exception handling
- Report: cluster size, quality %, concept keywords, purity by category/assignment group

---

## Step 17 — `[ZURICH]` Work Notes Analysis *(skip entirely on `australia`+)*

> ⛔ **`[AUSTRALIA+]` instances: do NOT run this step.** This step only runs when version = `zurich`.

Call `transition_work_notes_analysis` with:
- `elementType`: `"WORK_NOTE_ANALYZER"`
- `elementId`: `[start_node_key, end_node_key]` — both node keys, NOT an edge ID
- `filterSets`: same VIEW + TRANSITION filterSets from Step 8

Poll until `GlidePromin_WorkNoteAnalyzerResult` returned.

**Interpret and always report as dual finding:**
1. **Automation signal** — empty work notes % > 50% confirms scripted, routine work → strong
   AI Agent signal
2. **Data gap warning** — absence of work notes creates a training data gap; recommend enforcing a
   mandatory resolution notes field (1–2 sentences) at closure to enable richer future intent
   analysis cycles

---

## Step 18 — Build Automation Candidate Scorecard

For each distinct candidate (cluster + category + team combination):

| Dimension | Weight | High | Medium | Low |
|---|---|---|---|---|
| Volume | 30% | >100 cases/month | 50–100 | <50 |
| Speed | 20% | <10 min avg | 10–20 min | 20–30 min |
| Purity | 30% | >90% quality | 70–90% | <70% |
| Simplicity | 20% | >80% single-touch | 50–80% | <50% |

Composite score = weighted average. Rank all candidates descending.

---

## Step 19 — Apply IMPACT Framework

For each top-10 candidate:
- **I**dentify — what specific task pattern?
- **M**easure — cases/month, avg duration, total hours/month saved
- **P**ropose — AI Agent: what it does, trigger, resolution action
- **A**utomate — ServiceNow mechanism (Flow Designer, AI Agent, business rule, assignment rule)
- **C**ompare — projected resolution time improvement, FTE hours saved
- **T**imeline — Quick win (<2 weeks), Medium (2–6 weeks), Strategic (6+ weeks)

---

## Step 20 — Calculate Total Automation Opportunity

- Total cases/month automatable
- Total FTE hours/month saved
- Estimated annual savings

---

## Step 21 — Generate Word Report *(always runs)*

Read `docx`, `smart-brevity-docx`, and `servicenow-brand-standards-reference` skills before
writing any code.

**Report structure (all sections required):**

1. **Title** — compelling headline with the key number (e.g., "48 Cases Resolved in Under 30
   Minutes — Here's What to Automate")
2. **Executive summary** — AI Agent recommendations front and centre; total projected savings; top
   3 agents with estimated impact. 60-second read.
3. **The automation sweet spot** — methodology, filter logic, case count captured, duration
   adjustment explained
4. **Numbers at a glance** — metrics table: baseline vs. quick-touch, including adjusted duration
5. **Where quick-touch cases concentrate** — bottleneck nodes table; clustering results (or skip
   note if <100 cases)
6. **What human agents are actually doing** — work notes / intent analysis findings; dual finding
   if empty work notes
7. **What categories dominate** — breakdown table with over/under-representation vs. baseline
8. **Which teams handle the most quick-touch work** — assignment group analysis
9. **Ranked automation candidates** — full scorecard table
10. **AI Agent recommendations** — implementation table: agent name, trigger, action, cases/month,
    hours saved, priority, timeline
11. **Next steps** — 5–6 numbered actions; always include work notes enforcement step when empty
    work notes found

**Voice:** Business-friendly. Lead with the story, back with numbers. Reader should walk away
knowing exactly what to automate and why.

**Terminology conventions:**
- **"human agents"** — people handling cases (not just "agents")
- **"AI Agent"** (capitalised) — automation recommendations
- **"Triaging"** — AI Agent that routes cases at creation (not "Smart routing")

---

## Step 22 — Generate Interactive HTML Dashboard *(always runs)*

**Run immediately after Step 21 completes, without asking.**

Build a fully self-contained single-file HTML dashboard at
`/mnt/user-data/outputs/<ProjectName>_Dashboard.html` and present to the user via `present_files`.

**Required dashboard structure — 5 tabs:**

**Tab 1 — Overview**
- Headline KPI cards: total cases, quick-touch count, automation rate %, avg duration, variant count
- Automation opportunity donut/ring chart (automatable vs. remaining)
- Duration comparison bar chart (baseline avg vs quick-touch avg vs start-state dwell)
- State dwell breakdown for the quick-touch population (horizontal bars)
- Callout box summarising the key finding in 2–3 sentences

**Tab 2 — Process Map**
- Visual flow diagram of the dominant quick-touch path(s) rendered as connected node boxes
- Transition edge data table: From → To, cases, avg duration, min, max, signal badge
- Zero-rework callout if maxReps = 1 across all quick-touch nodes

**Tab 3 — Breakdown**
- Filter toggle buttons: Category / Channel / Team (default: Category)
- For each breakdown view: horizontal bar chart comparing quick-touch % vs baseline %
- Over/under-representation delta annotations (+Xpp / -Xpp)
- Team table: quick-touch cases, % volume, avg duration, std dev, priority badge

**Tab 4 — AI Agents**
- Summary KPI row: agents recommended, cases/week automatable, hours saved/week, fastest deploy
- Agent cards (one per recommendation): number watermark, priority badge, title, description,
  3 metric chips (cases/week, hours saved, timeline)
- Composite scoring table with all agents ranked

**Tab 5 — Roadmap**
- Phased implementation timeline (week badges + content cards)
- Sprint plan summary
- Key dependency callout (resolution notes enforcement, CMDB requirements, etc.)

**Design requirements:**
- ServiceNow brand palette: Infinite Blue `#032D42` background, Wasabi Green `#63DF4E` accents
- Fully self-contained — no external CDN dependencies, all CSS and JS inline
- Responsive within a standard desktop browser viewport (min 900px)
- Tab switching via pure JavaScript (no frameworks)
- All data hard-coded from the analysis results — no API calls from the browser

---

## Step 23 — Prompt for Optional Deliverables

After both Step 21 (Word report) and Step 22 (HTML dashboard) are complete and files are presented
to the user, Claude MUST ask the following two questions **together in a single message** using
`ask_user_input_v0`:

**Question 1:** "Would you like an executive PowerPoint presentation of these findings?"
Options: `Yes, create the deck` / `No thanks`

**Question 2:** "Would you like a detailed implementation specification (user story backlog) that
can be consumed by a Build Agent for implementation planning?"
Options: `Yes, create the spec` / `No thanks`

**Do not proceed to Steps 24 or 25 without the user's answers.**

---

## Step 24 — Generate PowerPoint Executive Deck *(only if user selects Yes at Step 23 Q1)*

Read `/mnt/skills/public/pptx/SKILL.md` and
`/mnt/skills/organization/servicenow-corporate-pptx/SKILL.md` before writing any code.

Build an 11-slide executive deck using pptxgenjs (LAYOUT_WIDE, 13.33"×7.5") with the ServiceNow
brand palette.

**Required slides:**
1. Cover — split layout, bold headline (key %) left, total cases + automation rate right
2. Agenda — numbered rows (01–05) with section labels
3. Process at a Glance — 4 KPI stat boxes + visual process flow nodes + key finding callout
4. The Automation Sweet Spot — filter methodology card + 4 quick-touch KPI boxes + duration bars
5. Category & Team Breakdown — clustered bar chart + team table + channel bar chart
6. Section divider — "AI Agent Recommendations"
7. AI Agent Cards — two P1 agents with metrics + combined impact callout + P2/P3 summary row
8. Scoring Table — all agents ranked with composite score bars
9. Roadmap — phased week-by-week timeline with colour-coded badges
10. Impact Summary — 3 hero KPIs + full impact table with totals row
11. Closing — 3 numbered actions this week

**Every slide must include presenter notes** with talking points and objection-handling cues.

Run visual QA (convert to PDF → pdftoppm → view images) on slides 1, 3, 5, 7, 9, 11. Fix any
text overflow or overlap before delivering.

---

## Step 25 — Generate Implementation Specification *(only if user selects Yes at Step 23 Q2)*

Read `/mnt/skills/public/docx/SKILL.md` before writing any code.

Generate a formal user story backlog Word document structured as follows:

**Document sections:**

### Cover & Context
- Document title, project, instance, mine date
- Context summary table: quick-touch population, In Progress dwell, total story points, sprint 1
  recommendation

### Story Conventions
- MoSCoW priority definitions (P1 Must Have / P2 Should Have / P3 Nice to Have)
- Story point scale (1 trivial → 13 epic-scale)
- Personas list (Helpdesk Analyst L1/L2/L3, IT Operations Manager, Platform Engineer, Process
  Mining Analyst)

### One Epic per AI Agent Recommendation
For **each AI Agent recommendation** from Step 19, generate a dedicated epic section containing:

**Epic header:**
- Target population (cases/week)
- Key metric baseline (start-state avg dwell)
- Projected hours saved per week
- Epic total (N stories · X story points)

**Stories within each epic (2–4 stories per agent):**

Each story must follow this structure:

```
[Story Card — shaded header box]
Story ID    Title                          Priority badge    Story Points
---------------------------------------------------------------------
As a <persona>, I want to <goal>, so that <benefit>.
Status: Backlog
---------------------------------------------------------------------

Acceptance Criteria
  • GIVEN / WHEN / THEN format, 4–6 criteria per story
  • Include edge cases: confidence thresholds, fallback behaviour, audit trail

Technical Notes
  • ServiceNow implementation path (Flow Designer / Business Rule / API)
  • Custom table names (x_promin_... prefix convention)
  • Configurable System Properties (kill-switch, threshold)

Dependencies
  • Other stories that must precede this one
  • Platform/data prerequisites

Definition of Done (P1 stories only)
  • Test coverage, performance benchmarks, audit trail verification
```

**Story types to include per agent (mix as appropriate):**
- Core resolution story (the main automation action) — always P1, 5–8 pts
- Routing/classification story (if agent requires routing) — P1, 3–5 pts
- Monitoring/reporting story (deflection rate, accuracy tracking) — P2, 3 pts
- Learning/improvement story (feedback loop, template learning) — P2–P3, 3 pts

### Backlog Summary Table
A consolidated table of all stories: Story ID, Title, Epic, Priority, Points, Sprint assignment.

Followed by sprint plan summary:
- Sprint 1 (Weeks 1–2): P1 stories — list IDs, total points, agents going live
- Sprint 2 (Weeks 3–4): P2 core stories — list IDs, total points
- Sprint 3 (Weeks 5–8): P3 and learning stories — list IDs, total points

---

## Step 26 — Prompt for Automation Request Creation *(only after Step 25 completes)*

After the implementation specification Word document is complete and presented, Claude MUST
immediately ask:

> "Would you like to create Automation Request entries in ServiceNow for each AI Agent
> recommendation? This will create one request record per agent, with the Epic details and user
> stories populated from the specification."

Options: `Yes, create the Automation Requests` / `No thanks`

---

## Step 27 — Create Automation Request Records *(only if user selects Yes at Step 26)*

For **each AI Agent recommendation** from Step 19 (one record per agent), call
`create_automation_request` with:

```
description:        Agent title + one-paragraph summary of what it does
short_description:  "AI Agent: <agent name> — <cases/week> cases/week, ~<hours> hrs saved/week"
process_name:       Epic name from the specification
priority:           Map from scoring: P1 → "1", P2 → "2", P3 → "3"
volume_of_transactions: cases/week
actual_time:        In Progress avg dwell in HH:MM:SS format
intake_source:      "web" (required — the process_mining value requires source_table +
                    source_record fields not exposed by the MCP tool schema)
request_type:       "automation"
requested_for:      "admin"
```

> ⚠️ **Note on intake_source:** The `process_mining` value is blocked by a business rule that
> requires `source_table` and `source_record` fields not available in the MCP tool schema. Use
> `web` as the intake_source and include the project name, instance, and versionId in the
> description so the record remains traceable to the source analysis. If the user wants
> `intake_source = process_mining`, advise them to update the records manually in ServiceNow after
> creation and link `source_table = promin_project` / `source_record = <projectId>`.

After all records are created, present a summary table:
- Agent name → Automation Request number → Priority → Status

---

## Key Technical Rules

| Rule | Detail |
|---|---|
| Always call `get_servicenow_version` first (Step 1) | Determines payload shape AND which version path to take at Step 14 |
| **Step 15 is `[AUSTRALIA+]` only** | `intent_and_activity_analysis` does not exist on `zurich` — attempting it will error |
| **Steps 16–17 are `[ZURICH]` only** | Do not run clustering or work notes on `australia`+ — Step 15 `[AUSTRALIA+]` replaces both |
| Steps 15 and 16/17 are mutually exclusive | One version path or the other — never both in the same run |
| Always enforce VIEW filter (Step 4) | Prevents blended state + assignment_group model |
| Poll `ScheduledTask` indefinitely (Steps 4, 8) | Both tools can stall for minutes — keep polling |
| **Skip clustering if < 100 cases (Step 14)** | Fewer than 100 causes server error |
| Duration in seconds (Step 8) | 2 min = 120, 30 min = 1800 — NOT milliseconds |
| Use `key` not `nodeStatsId` (Steps 16, 17) | Clustering and work notes require the `key` field |
| Work notes requires two node keys (Step 17) | Pass `[start_key, end_node_key]` — not an edge ID |
| `conditionType: "SINGLE"` on Zurich (Step 8) | `"EQ"` is not a valid enum value |
| `fieldConstraint` required (Step 8) | Omitting from `transitionConstraints` causes null pointer |
| `dataFilter` must be `[]` with breakdowns | Do not mix dataFilter queries with breakdown filters |
| Breakdowns at top level of filterSets | Not inside `orderedFilters` |
| Australia: intent analysis only (Step 15) | Replaces both clustering and work notes |
| MCP label ≠ ServiceNow version | Always detect version dynamically via Step 1 |
| HTML dashboard — no CDN (Step 22) | All CSS and JS must be inline; no external dependencies |
| Step 23 prompt — always use ask_user_input_v0 | Do not ask as free text |
| Step 26 prompt — ask immediately after Step 25 | Surface the offer proactively |

---

## Deliverable Output Summary

| Deliverable | Step | Condition |
|---|---|---|
| Word report | 21 | Always |
| Interactive HTML dashboard | 22 | Always |
| PowerPoint executive deck | 24 | User selects Yes at Step 23 Q1 |
| Implementation specification | 25 | User selects Yes at Step 23 Q2 |
| Automation Request records | 27 | User selects Yes at Step 26 |

---

## Resuming Mid-Analysis

If a user asks to "continue from step X" or "run from step X", jump directly to that step using
context already in the conversation:
- Confirm which IDs and keys are already known (versionId, entityId, state activity ID, node keys,
  filterSets)
- Re-use the existing transition filterSets exactly — do not recreate the filter
- If node keys are not yet stored, extract them from the most recent `get_project_details` or
  filter result in context

---

## Quick Reference — ID Checklist

Before starting Step 15, confirm you have all of these stored:

| ID | Source | Used In |
|---|---|---|
| `versionId` | Step 2 → `version.id` | All tool calls |
| `entityId` | Step 2 → `projectEntities[].entityId` | All filterSets |
| `state_activity_id` | Step 2 → `activities[].id` where `field=="state"` | VIEW filter (Steps 4, 8) |
| `start_node_key` | Step 9 → `nodes[].key` where `value=="<start_value>"` | Steps 16, 17 |
| `end_node_key` | Step 9 → `nodes[].key` where `value=="<end_value>"` | Step 17 |
| `transition_filterSets` | Full filterSets used in Step 8 | Steps 15, 16, 17 |
