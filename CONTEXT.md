# Vigil — Project Context & Briefing
> Read this before every Claude Code session.
> This is the single source of truth for all architectural and product decisions.
> Last updated: 6 April 2026

---

## What is Vigil

Vigil is a B2B AI-powered asset and contract tracking web app. It allows employees to log purchases, contracts, assets, and milestones conversationally — by simply talking to an AI agent — and then automatically creates workflows, reminders, and notifications downstream without any manual configuration.

**The core promise:** The conversation IS the workflow. Users never touch a settings page, never configure a reminder, never fill a form. They just talk. Everything downstream happens automatically.

**The core value proposition:** Vigil's goal is NOT to make data entry easy — it's to make **tracking** easy. Data can be imported too. The key is that once data is in Vigil, it surfaces what needs attention and when — through reminders, traffic lights, and nudges.

**Target audience:** Internal corporate teams — specifically IT, Contracts/Procurement, and HR departments at companies of 50–200 people who are too big for spreadsheets but don't have enterprise tooling.

**Purpose of this build:** A working demo to showcase to internal stakeholders. The objective is to demonstrate AI capability applied to a real problem, built end to end by one person using AI-assisted development tools.

---

## Tech Stack

| Layer | Tool | Notes |
|---|---|---|
| Framework | Next.js (App Router) | Deployed on Vercel |
| Auth | Clerk | Google SSO + org management (2FA is paid, skipped for demo) |
| Database | Supabase | Postgres + RLS + Storage for receipts |
| AI Agent | Anthropic API | claude-sonnet-4-20250514 |
| Background Jobs | Trigger.dev | Schedules and fires reminders |
| Notifications | Slack Incoming Webhook | Block Kit messages via webhook URL |
| Hosting | Vercel | Auto-deploy from GitHub. Live at vigil-apr-2026.vercel.app |
| DB Management | Supabase MCP | HTTP-based, configured in `.mcp.json` at project root |

---

## Architecture: Domain Tables as Source of Truth

> **Key decision (April 2026):** Domain tables (employees, contracts, assets) are the source of truth. The `items` table is a thin index/registry that links them together and provides a uniform `key_date` for the traffic light dashboard.

### How it works

1. User talks to Vigil → agent extracts structured data
2. API route validates with a **per-type Zod schema** (not one flat schema)
3. Writes a thin record to `items` (id, name, type, department, status, key_date, raw_log, confidence)
4. Writes the full domain record to the appropriate table (employees, contracts, or assets)
5. Dashboard reads from domain tables joined to items

### The `items` table

A lightweight index. Contains:
- `id`, `org_id`, `created_by`, `name`, `type`, `department`, `status`, `key_date`
- `raw_log`, `confidence`, `needs_review`
- `created_at`, `updated_at`
- Legacy columns still present during migration (purchase_price, vendor, dates, metadata) — will be dropped after all departments are migrated

### The `key_date` column

A single denormalized date on `items` used for traffic light status across all types:
- Employees: `probation_end` (active) or `last_working_day` (exiting)
- Contracts: `LEAST(expiry_date, renewal_date)`
- Assets: `warranty_expiry`

Traffic light thresholds: `<= 7 days` = red, `<= 60 days` = amber, `> 60 days` = green, expired = red.

---

## Data Layer Refactor Status

The refactor is being done incrementally, one department at a time:

| Phase | Department | Status |
|-------|-----------|--------|
| Phase 1 | HR / Employees | **Complete & tested** — domain table is source of truth, full E2E pipeline verified |
| Phase 2 | Contracts (incl. subscriptions, software) | **Complete & tested** — domain table, Zod schema, write path, dashboard, CHECK constraints (007 migration) |
| Phase 3 | IT / Assets | **Complete & tested** — domain table, Zod schema, write path, dashboard. Asset creation + reminders verified |
| Phase 4 | Cleanup — drop legacy items columns | Blocked on Phase 2 & 3 testing |

During transition, the API route dual-writes to both `items` (legacy columns) and the domain table, so unmigrated dashboard pages still work.

---

## Employee Domain (Phase 1 — Complete)

### Employees Table Schema

| Column | Type | Required? | Fixed Values |
|--------|------|-----------|-------------|
| employee_name | text | **Always** | — |
| role | text | **Always** | Cascading suggestions by department (see below) |
| joining_date | date | **Always** | — |
| employment_type | text | **Always** | `full_time`, `external_consultant`, `intern` |
| department | text | **Always** | `IT`, `People Functions`, `Sales`, `Engineering`, `Data Analytics`, `Data Science` |
| employment_status | text | **Always (inferred)** | `active`, `notice_period`, `exited` |
| last_working_day | date | **If exiting/exited** | — |
| probation_end | date | No | Follow-up for full_time + intern only, skip for external_consultant. Only ask if joining_date < 6 months ago. |
| manager_name | text | **If exiting/updating** | Required for exits — manager receives offboarding alerts |
| notes | text | No | — |

### Role Suggestions by Department

| Department | Suggested Roles |
|-----------|----------------|
| Engineering | Software Engineer, QA Engineer, DevOps Engineer, Engineering Manager, Tech Lead |
| Data Analytics | Data Analyst, BI Analyst, Analytics Manager |
| Data Science | Data Scientist, ML Engineer, Research Scientist |
| IT | IT Support, Systems Administrator, IT Manager, Security Analyst |
| People Functions | HR Manager, Recruiter, People Partner, L&D Specialist |
| Sales | Account Executive, SDR, Sales Manager, Solutions Consultant |

### Employee Use Cases

1. **New joiner** — collect required fields, follow up on probation if recent full_time/intern
2. **Employee exiting** (record exists) — lookup, update with last_working_day (required)
3. **Employee exiting** (no record) — collect all required fields + last_working_day
4. **General update** — lookup, update only changed fields

### Employee Tracking Automations (suggested post-save)

- New joiner with probation: probation review reminder (2 weeks before), 1-year anniversary
- Employee exiting: offboarding reminder (1 week before LWD), equipment return (on LWD)
- Long-tenured: annual work anniversary

### Dual Slack Alerts for Employee Exits

When a reminder fires for an employee in `notice_period` or `exited` status, **two Slack messages** are sent:
1. **Manager alert** — Owner field shows the employee's manager (from `assigned_to_name`)
2. **HR alert** — Owner field shows "HR Team", message prefixed with `[HR Copy]`

Both alerts come from a single `reminders` row — no duplicate DB records.

### Agent Behaviour for Employees

- **Status is inferred** from context, never asked explicitly
- **Exit flow order**: Agent must check if the record exists FIRST before collecting details. Never collect all fields and then say "record not found" at the end.
- **Manager required for exits**: If user doesn't mention the manager, agent asks: "Who does [name] report to? Their manager will receive offboarding alerts."
- **Update safeguard**: If agent sets `action: "update"` but backend finds no matching record, it returns an error instead of silently creating a duplicate.
- **Probation** is a follow-up only for new full_time/intern with joining_date < 6 months
- **Fuzzy matching**: agent infers closest fixed value from informal language (e.g. "dev" → Software Engineer) and confirms in summary
- **Chips**: fixed-value fields (department, employment_type, role) should be presented as selectable options
- After saving, agent **suggests** tracking automations (doesn't silently create them)

---

## ITEM_DATA & REMINDER_DATA Contracts

### ITEM_DATA — Creating/Updating Records

Used when the agent creates or updates a record. Output format varies by type — see agent prompt for full examples.

### Validation (per-type routing)

Defined in `lib/types.ts`. The `validateItemData()` function routes to the right Zod schema based on `type`:
- `employee` → `EmployeeDataSchema`
- `contract` / `subscription` / `software` → `ContractDataSchema`
- `asset` → `AssetDataSchema`
- `milestone` → `ItemDataSchema` (legacy flat)

### REMINDER_DATA — Adding Reminders to Existing Items

When the user asks to add reminders to a record that was already saved earlier in the conversation, the agent outputs `REMINDER_DATA` instead of a second `ITEM_DATA` block (which would trigger a duplicate error).

```
REMINDER_DATA_START
{
  "item_name": "Priya Sharma — ML Engineer",
  "reminders": [
    { "type": "custom", "message": "30-day check-in", "days_before": null, "fire_at": "2026-05-07" }
  ]
}
REMINDER_DATA_END
```

Rules:
- `ITEM_DATA` = creating or updating a record (fields + reminders together)
- `REMINDER_DATA` = adding reminders to ANY existing record (saved in this conversation or previously existing). The backend does partial name matching.

### Contracts Domain (Phase 2 — Implemented)

Required: `contract_name`, `vendor`, at least one of `expiry_date` or `renewal_date`
Optional: `annual_value`, `currency`, `billing_cycle`, `start_date`, `notice_period_days`, `auto_renews`, `signatory`, `notes`

### Assets Domain (Phase 3 — Implemented)

Required: `asset_name`, `vendor`, `purchase_date`
Optional: `purchase_price`, `currency`, `assigned_to`, `serial_number`, `model`, `condition`, `warranty_months`, `warranty_expiry`, `notes`

---

## Agent Architecture

### Three Agents

**Agent 1 — Intake Agent (user-facing)**
- Lives on the landing page and in the chat drawer
- Handles all conversation — logging new items, answering questions about existing ones
- Outputs structured `ITEM_DATA` JSON when logging is complete (format varies by type)
- Warm, brief, 2–4 sentences per response
- Presents fixed-value fields as selectable chips/options
- Confirms inferred values in summary before saving
- Suggests tracking automations after saving

**Agent 2 — Classification Agent (silent, server-side)** — Not yet implemented
- Runs automatically after every new item is logged
- Enriches the item: infers warranty period, suggests reminder intervals, checks for duplicates

**Agent 3 — Digest Agent (scheduled weekly)** — Not yet implemented
- Reads org-wide data, generates weekly summary email per org

### Agent System Prompt

Located at `lib/agent-prompts.ts` (single file, imported into `/api/chat/route.ts`).

Structured by type with per-type required/optional fields, output format examples, and reminder rules.

---

## Default Reminder Rules (in Agent System Prompt)

```
Contracts:    60 days before renewal, 30 days before renewal, 7 days before renewal
Subscriptions: 7 days before renewal, 3-month ROI check-in
Assets:        30 days before warranty expiry, 3-month ROI check-in
Employees:     2 weeks before probation end, annual work anniversary
               Exiting: 1 week before last working day, equipment return on LWD
Milestones:    Annual anniversary
```

---

## Supabase Schema (Summary)

Core tables:
- `organizations` — one per company, linked to Clerk org ID
- `profiles` — one per user, linked to Clerk user ID
- `items` — thin index/registry table linking all records, has `key_date` for traffic light
- `reminders` — one row per scheduled reminder, FK to items
- `notifications` — audit trail of every notification sent

Domain tables (source of truth for domain-specific data):
- `employees` — HR records with NOT NULL on required fields (employee_name, role, joining_date, employment_type, employment_status)
- `contracts` — contract_name, contract_type, vendor, currency, billing_cycle, start_date, expiry_date, renewal_date, annual_value, notice_period_days, auto_renews, signatory, notes. Constraint: must have expiry_date or renewal_date.
- `assets` — asset_name, vendor, purchase_date, purchase_price, currency, assigned_to, serial_number, model, condition, warranty_months, warranty_expiry, notes
- `asset_assignments` — IT asset assignment tracking
- `employee_equipment` — HR equipment tracking

Notifications table:
- Channel-agnostic: `channel` column (e.g. "slack"), `message`, `body`, `item_id`, `reminder_id`
- `external_id` column (renamed from `resend_message_id`)

Reminders table:
- `sent_at` column added — populated when reminder is actually delivered (separate from `fire_at` which is the scheduled time)

RLS is enabled on all tables. Org isolation enforced via `org_id` from Clerk JWT.
Supabase MCP server connected via HTTP (`.mcp.json` at project root) for direct DB management.

---

## Supabase MCP Integration

**Status: Working** (resolved April 2026)

Configuration in `.mcp.json` at project root:
```json
{
  "mcpServers": {
    "supabase": {
      "type": "http",
      "url": "https://mcp.supabase.com/mcp?project_ref=<PROJECT_REF>",
      "headers": {
        "Authorization": "Bearer <ACCESS_TOKEN>"
      }
    }
  }
}
```

The old npx/stdio approach did not work on Windows. The HTTP-based approach works.

Available tools: `execute_sql`, `apply_migration`, `list_tables`, `list_migrations`, etc.

---

## Trigger.dev + Slack Notification Pipeline

### How it works

1. User creates a record via conversation → reminders written to `reminders` table with `status: "scheduled"` and `fire_at` timestamp
2. Trigger.dev `reminder-scan` cron runs on configurable interval (env var `REMINDER_SCAN_CRON`)
3. Scan picks up reminders where `fire_at <= now` and `status = "scheduled"` (changed from `now + 1 hour` — reminders only fire when their time has actually arrived)
4. Each due reminder triggers the `send-reminder` task (with 3 retries). Tasks run on a named queue (`reminder-alerts`) with `concurrencyLimit: 1` — when multiple reminders fire at once, they visibly queue in the Trigger.dev dashboard (Queued → Executing → Completed)
5. `send-reminder` fetches reminder + item, sends Slack Block Kit message, marks `status: "sent"` with `sent_at`, logs to `notifications` table
6. For employee exits: sends a second Slack message to HR Team (see "Dual Slack Alerts" section)

### Configurable cron interval

Set `REMINDER_SCAN_CRON` in `.env.local`:
- `* * * * *` — every minute (dev/demo, shows reminders firing immediately)
- `0 * * * *` — every hour (normal/production)

### Slack Block Kit message format

- Header with urgency emoji (green/orange/red/siren based on days remaining)
- Item name + department + Owner (responsible person)
- Reminder message (bold)
- Context line with days remaining + key date in IST

Owner field source: employees → manager_name, contracts → signatory, assets → assigned_to

### Test endpoint

`/api/test-reminder` — GET or POST. Bypasses Trigger.dev, directly sends Slack notification for the next due reminder (or a specific reminder by ID). Useful for verifying Slack delivery without waiting for cron.

### Important: Trigger.dev schedule management

- Declarative schedules register on the Trigger.dev cloud when the CLI starts
- Schedules continue queuing jobs even when CLI is stopped
- To reset: delete the schedule from the Trigger.dev dashboard → it recreates on next CLI start
- Deleting a schedule does NOT affect the task code

---

## Demo Departments (3 for MVP)

1. **IT Assets** — laptops, phones, licences, warranty tracking, device assignment
2. **Contracts** — vendor agreements, SaaS tools, renewal dates, auto-renew flags
3. **HR** — employee onboarding/offboarding, probation tracking, work anniversaries

---

## Pre-loaded Demo Seed Data

| Item | Status | Drama |
|---|---|---|
| Salesforce CRM contract, £42k | Expiring in 7 days | Red alert |
| Dell PowerEdge Server warranty | Expiring in 30 days | Amber warning |
| Figma Organisation licence | Renews in 180 days | Healthy |
| iPhone 14 Pro — Sarah Chen | Warranty expired 15 days ago | Already lapsed |
| James Okafor — Software Engineer | Probation ends in 14 days | Action needed |

---

## 3-Day Build Plan

**Day 1 — Core loop** (COMPLETE)
- Next.js project init with Clerk auth
- Supabase schema (run SQL from schema spec)
- `/api/chat` route proxying to Anthropic API
- Intake Agent system prompt
- ITEM_DATA parsed and written to Supabase
- Reminders rows auto-created on item save
- Seed demo data
- Auth-first flow (middleware + onboarding for department/role)
- Dashboard with traffic light status
- Chat drawer persistent across pages
- Department views (IT, Contracts, HR)

**Day 2 — Data layer refactor + workflows** (COMPLETE)
- Domain tables as source of truth for all 3 departments (employees, contracts, assets)
- Per-type Zod validation schemas for all 3 types
- Per-type write paths in api/chat/route.ts (writeEmployee, writeContract, writeAsset)
- Agent prompt rewrite with required/optional fields, output formats, and reminder rules for all types
- REMINDER_DATA output format for adding reminders to already-saved items
- Supabase MCP connected (HTTP-based `.mcp.json`)
- Removed redundant auto-follow-up from ChatDrawer
- Swapped Resend (email) for Slack incoming webhook notifications
- Trigger.dev v3 integration — declarative cron schedule for reminder scanning
- Landing page success banner with auto-redirect and fade transition
- Dashboard pages updated with domain table joins (HR, Contracts, IT)
- ItemCard updated to render contract-specific and asset-specific fields
- Configurable cron interval via REMINDER_SCAN_CRON env var
- 3 new Supabase migrations applied (004, 005, 006)
- Full HR E2E pipeline tested and verified (conversation → DB → Trigger.dev → Slack)

**Day 3 — Polish + demo prep** (COMPLETE)
- Home page chat redesign — centered hero pre-conversation, proper chat container post-conversation
- Editable records — RecordEditor component with two-column grid, type-aware fields, PATCH API
- Reminder bell UI — animated bell icon with count badge, popover with urgency bars
- Response chips — context-aware chip buttons (welcome, confirmation, reminders, probation, follow-up)
- FormattedMessage — renders **bold** markdown in chat bubbles
- Bold bullet style — agent uses • instead of -, reminders use ✅ prefix
- Multiline chat input — textarea with auto-grow, Shift+Enter for new line
- Terminal phrase interception — "That's all for now" etc. handled client-side, no API call
- Smart redirect — router.refresh() when on correct page (no scroll reset)
- Dual Slack alerts for employee exits — manager + HR Team
- Manager required for exits — agent asks "who does [name] report to?"
- Update safeguard — action:update with no matching record returns error instead of creating duplicate
- Exit flow order — agent checks existence first, before collecting all details
- Trigger.dev queue — concurrencyLimit:1 for visible Queued → Executing → Completed in dashboard
- Reminder scan timing — fire_at <= now (not now + 1 hour)
- REMINDER_DATA expanded — works for any existing record, not just current conversation
- Contracts CHECK constraints migration (007) applied
- Contracts + Assets flows tested and verified
- Dynamic suggestion chips on landing page — randomized names/values, 6 complete prompts
- Dark scrollbar styles
- Voice mode (Web Speech API) — full hands-free conversation with persistent listening
- View Transitions API — smooth cross-page navigation with fade animations
- Deployed to Vercel via GitHub (auto-deploy on push)

**Day 3 Session 2 — Voice mode + deploy** (6 April 2026)
- **Voice mode (`useVoiceMode` hook)** — extracted all voice logic into a reusable hook consumed by both `page.tsx` and `ChatDrawer.tsx`. Features:
  - Persistent listening with `continuous: true` + `interimResults: true`
  - 3-second silence detection → auto-send transcript
  - Wake words ("Hi Vigil", "Ok Vigil", "Hey Vigil") — stripped from transcript
  - Sleep words ("stop voice mode", "pause listening") — deactivates without sending to API
  - 60-second inactivity timeout → "Voice paused" message
  - TTS output via `SpeechSynthesis` API (rate 1.25x) with Chrome AudioContext warm-up
  - Mic stops during TTS to prevent self-hearing, resumes 400ms after TTS ends
  - Rapid restart guard (max 3 rapid restarts → stop retrying) + 2s audio start timeout
  - Voice mode persists across page transitions via sessionStorage
- **VoiceButton component** — thin UI shell with 5 states: off (zinc), listening (emerald pulse), active-idle (emerald dim), speaking (emerald + "Tap to skip"), timed out (amber)
- **View Transitions API** — `smoothNavigate()` / `smoothRefresh()` helpers wrap router with `document.startViewTransition()`. CSS fade-out 0.3s / fade-in 0.4s. Falls back on unsupported browsers.
- **TTS-aware navigation** — after item logged, polls `isSpeakingRef` (ref, not state) to wait for TTS to finish before navigating. Cleanup no longer cancels speechSynthesis.
- **Chat scroll fix** — scroll scoped to chat container div (`chatScrollRef.scrollTo`) instead of `scrollIntoView` on whole page
- **Quick-action chips with icons** — "Log a new hire" (person+), "Add a contract" (document), "Track an asset" (laptop), "Update a record" (pencil). Inline SVG, 1.5px stroke, above the dynamic suggestion chips.
- **Agent intro fix** — prompt updated so Vigil only introduces itself on pure greetings with no task. Skips intro when user mentions a task (e.g. "Hi, help me log a contract").
- **Git + GitHub** — repo initialized, pushed to `github.com/akash30thfeb/Vigil-Apr-2026`
- **Vercel deployment** — connected via GitHub for auto-deploy on push

---

## Pending Tasks (carry over to next session)

### Testing
- [x] HR E2E pipeline — conversation → DB → Trigger.dev cron → Slack notification (VERIFIED)
- [x] REMINDER_DATA pipeline — follow-up reminder → DB → cron → Slack (VERIFIED)
- [x] Contracts flow — full conversation + DB write + dashboard rendering (VERIFIED)
- [x] Assets flow — asset creation + reminders + dashboard rendering (VERIFIED)
- [x] Employee exit flow — update existing record, dual Slack alerts (VERIFIED)
- [ ] Employee exit flow re-test — prompt now asks existence first + requires manager. Needs verification.
- [ ] Overview dashboard — hydration safety fix for date-dependent traffic lights

### Data Layer Refactor
- [x] Phase 1: HR / Employees — complete and tested
- [x] Phase 2: Contracts — complete and tested (007 migration: CHECK constraints)
- [x] Phase 3: Assets — complete and tested
- [ ] Phase 4: Drop legacy items columns after all departments tested

### Completed (Day 3 Session 2)
- [x] **Voice mode** — full hands-free conversation with `useVoiceMode` hook
- [x] **View Transitions** — smooth cross-page navigation
- [x] **Deploy to Vercel** — GitHub repo + Vercel auto-deploy on push. Live and verified.

### Remaining Work
- [ ] **Overview dashboard hydration fix** — add mounted state pattern for date-dependent rendering
- [ ] **Auto-scroll on page transition** — scroll still jumps on hero→chat transition (scoped fix applied but transition layout shift still triggers it)
- [ ] **Agent-driven chips** (optional) — have agent return chips as structured data instead of client-side pattern matching
- [ ] **Voice barge-in** — true voice interruption requires server-side STT (Deepgram/Whisper). Not feasible with browser Web APIs alone.
- [ ] **Voice selection UI** — let user pick TTS voice from browser voices. Currently hardcoded preference list.
- [ ] **Cloud TTS upgrade** (optional) — replace browser SpeechSynthesis with ElevenLabs/OpenAI TTS for higher quality, consistent cross-browser voice
- [ ] Classification Agent (stretch — silent server-side enrichment)
- [ ] `purchase_date` NOT NULL migration for assets table (identified but not confirmed)

---

## Testing Results (Session 2 — 4 April 2026)

### HR E2E Pipeline — PASSED
- New employee flow (Priya Sharma, Alex Rivera) — conversation → ITEM_DATA → DB write → reminders created
- REMINDER_DATA flow — follow-up reminder added via separate output format
- Trigger.dev cron — `reminder-scan` runs on schedule, picks up due reminders, triggers `send-reminder`
- Slack notifications — Block Kit messages delivered with urgency emoji, days remaining, department
- sent_at column — properly populated on reminders when notification is delivered
- IST dates — user-facing dates display correctly in IST

### Issues Found & Fixed During Testing (Session 2)
- REMINDER_DATA not used by agent for follow-up reminders → fixed agent prompt with explicit rules
- sent_at not being written to reminders → fixed in both trigger task and test endpoint
- Double follow-up message → fixed by removing hardcoded auto-follow-up from ChatDrawer
- Clerk middleware blocking test endpoint → added `/api/test-reminder` to public routes
- Asia/Kolkata timezone error in Trigger.dev → removed timezone from cron config (plain string)

### Testing Results (Session 3 — 5 April 2026)

#### Contracts E2E — PASSED
- Contract creation with all fields, billing cycle, auto-renew, signatory
- Dashboard rendering with contract-specific fields
- CHECK constraints verified (contract_type, billing_cycle, date_required)

#### Assets E2E — PASSED
- Asset creation via chat with purchase_price, warranty, assigned_to
- Reminders created with correct fire_at dates
- Dashboard rendering on /dashboard/it

#### Employee Exit — PASSED (with fixes applied)
- Dual Slack alerts verified (manager + HR Team) from single reminder row
- Trigger.dev queue visible (Queued → Executing → Completed)

#### Issues Found & Fixed During Testing (Session 3)
- Bell animation never stopped after redirect → fixed by capturing highlight once in state, clearing after 5s
- "That's all for now" chip caused duplicate creation loop → fixed by intercepting terminal phrases client-side
- Response chips showed wrong options on welcome message → fixed detection order (welcome checked first)
- Home page chips clipped by overflow-hidden → fixed with conditional overflow (min-h-screen pre-chat, h-screen+overflow-hidden during chat)
- Reminder scan fired early (fire_at <= now + 1 hour) → changed to fire_at <= now
- assigned_to_name stored employee's own name instead of manager → fixed to use manager_name
- REMINDER_DATA only worked for current-conversation items → expanded to any existing record
- Hydration mismatch on ItemCard dates → fixed with mounted state pattern

---

## UX Decisions

- **Auth-first**: Middleware protects all routes except sign-in, sign-up, onboarding, /api/chat, /api/test-reminder
- **Onboarding**: Collects department and role, saved to Clerk unsafeMetadata
- **Onboarding check**: Done in dashboard layout server component (not middleware, to avoid JWT refresh issues)
- **Chat drawer**: Persistent bottom-right, reads conversation from sessionStorage on mount. Multiline input (textarea with auto-grow, Shift+Enter for new line, Enter to send).
- **Home page chat**: Pre-conversation shows centered hero with input + suggestion chips. Post-conversation shows proper chat container (header, scrollable messages, pinned input). Page is `h-screen overflow-hidden` when chat is active — no page scroll, only chat scrolls.
- **Conversation persistence**: Landing page saves to sessionStorage before redirect, drawer picks it up
- **Landing page transition**: On successful record creation, shows green success banner ("Name logged") with "Redirecting..." message, auto-redirects to dashboard after 3.5s with fade-out transition
- **Toast**: Success toast at bottom-20, auto-dismiss after 4 seconds
- **Vigil logo**: Links to `/` (home/chat page)
- **Traffic light**: Uses `key_date` column for uniform status across all item types
- **IST dates**: All user-facing dates display in IST (Asia/Kolkata). Database stores UTC.
- **Response chips**: Context-aware chip buttons below the last assistant message. Detection order: welcome → confirmation → reminders → probation → employment type → department → follow-up → logged. Welcome message always shows: "Log a new hire", "Add a contract", "Track an asset", "Update a record".
- **Terminal phrases**: "That's all for now", "Done", "Nothing else", "No thanks" are intercepted client-side — they don't hit the API. Prevents duplicate creation loops.
- **Bold text rendering**: Agent uses `**text**` markdown. `FormattedMessage` component renders it as `<strong>` in both ChatDrawer and home page.
- **Bullet style**: Agent uses `•` (bullet character) instead of `-` for all bullet points. Reminders use `✅` prefix.
- **Reminder bell**: ItemCard shows animated bell icon when reminders change (new reminder or status change). Animation stops after 5 seconds. Popover shows all reminders with urgency-colored bars.
- **Record editor**: Two-column grid, expandable from ItemCard click. Supports text, date, number, select, boolean fields. Two-click save (Save → Confirm). Change tracking with amber asterisk.
- **Smart redirect**: Uses `router.refresh()` when already on the correct department page (no scroll reset). Uses `router.push()` only when navigating to a different page.
- **Voice mode**: Persistent hands-free conversation via `useVoiceMode` hook. Continuous recognition with 3s silence detection, wake/sleep keywords, TTS output (1.25x rate), 60s inactivity timeout. Mic pauses during TTS to prevent self-hearing. Voice state persists across page transitions via sessionStorage. VoiceButton has 5 visual states (off, listening, active-idle, speaking, timed out).
- **View Transitions**: Cross-page navigation uses `document.startViewTransition()` for smooth fade. CSS: old page fades out 0.3s, new page fades in 0.4s. Falls back to normal navigation on unsupported browsers.
- **TTS-aware navigation**: After logging an item, navigation polls a ref (`isSpeakingRef`) to wait for TTS to finish before page transition. Cleanup does not cancel speechSynthesis — TTS continues through navigation.
- **Quick-action chips**: 4 static chips with inline SVG icons above the dynamic suggestion chips: "Log a new hire" (person+), "Add a contract" (document), "Track an asset" (laptop), "Update a record" (pencil).
- **Agent intro behaviour**: Vigil only introduces itself on pure greetings with no task mentioned. If the user includes a task (e.g. "Hi, help me log a contract"), the intro is skipped entirely.

---

## File Structure (Actual)

```
vigil/
├── CONTEXT.md                           ← this file
├── .mcp.json                            ← Supabase MCP config
├── middleware.ts                         ← Clerk auth middleware
├── app/
│   ├── layout.tsx                       ← root layout
│   ├── page.tsx                         ← landing page with chat
│   ├── onboarding/page.tsx              ← department/role collection
│   ├── (auth)/
│   │   ├── sign-in/[[...sign-in]]/page.tsx
│   │   └── sign-up/[[...sign-up]]/page.tsx
│   ├── (dashboard)/
│   │   ├── layout.tsx                   ← dashboard layout with nav
│   │   └── dashboard/
│   │       ├── page.tsx                 ← overview dashboard
│   │       ├── it/page.tsx
│   │       ├── contracts/page.tsx
│   │       └── hr/page.tsx
│   └── api/
│       ├── chat/route.ts                ← Anthropic API proxy + DB writes (per-type write paths)
│       ├── items/route.ts               ← REST GET/POST for items
│       ├── items/[id]/route.ts          ← GET/PATCH for record editing from dashboard
│       └── test-reminder/route.ts       ← Manual Slack notification testing (bypasses Trigger.dev)
├── trigger/
│   └── reminders.ts                     ← Trigger.dev cron: reminderScan + sendReminder tasks
├── trigger.config.ts                    ← Trigger.dev project config
├── hooks/
│   └── useVoiceMode.ts                  ← voice mode hook (recognition, TTS, wake/sleep words, timeouts)
├── lib/
│   ├── supabase.ts                      ← supabaseAdmin client
│   ├── types.ts                         ← Zod schemas (per-type validation)
│   ├── agent-prompts.ts                 ← Intake Agent system prompt
│   ├── navigate.ts                      ← View Transitions helpers (smoothNavigate, smoothRefresh)
│   └── slack.ts                         ← Slack incoming webhook helper (Block Kit messages)
├── components/
│   ├── ChatDrawer.tsx                   ← persistent chat drawer (multiline input, voice mode, ResponseChips, FormattedMessage)
│   ├── VoiceButton.tsx                  ← thin UI shell for voice mode (5 visual states)
│   ├── ItemCard.tsx                     ← item card with traffic light + reminder bell + popover
│   ├── ItemList.tsx                     ← client wrapper for ItemCard with expand/collapse for RecordEditor
│   ├── RecordEditor.tsx                 ← two-column inline record editor (text, date, number, select, boolean)
│   ├── ResponseChips.tsx                ← context-aware chip buttons (welcome, confirmation, reminders, etc.)
│   ├── FormattedMessage.tsx             ← renders **bold** markdown in chat bubbles
│   ├── LoggedToast.tsx                  ← success toast
│   └── UserInfo.tsx                     ← user name/role/department display
└── supabase/
    ├── schema.sql                       ← base schema
    ├── seed.sql                         ← demo seed data
    └── migrations/
        ├── 001_employees_full_name.sql  ← (superseded by 002)
        ├── 002_domain_employees.sql     ← employee table refactor (applied via MCP)
        ├── 003_items_key_date.sql       ← key_date column (applied via MCP)
        ├── 004_notifications_slack.sql  ← channel, item_id, message columns; resend_message_id → external_id
        ├── 005_domain_contracts.sql     ← contracts domain table columns + backfill + date constraint
        ├── 006_domain_assets.sql        ← assets domain table columns + backfill
        └── 007_contracts_check_constraints.sql ← contract_type, billing_cycle, date_required CHECK constraints
```

---

## How to Use This File in Claude Code

Start every Claude Code session with:
> "Read CONTEXT.md. We are building Vigil. Today we are working on [specific task]."

Update this file whenever a significant architectural decision is made in a build session.
This file is the bridge between brainstorming (claude.ai) and building (Claude Code).
