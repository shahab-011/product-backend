# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Layout

```
NAY/
├── FinalYearProjectBackEnd/    Node.js + Express + MongoDB API
├── FinalYearProjectFrontEnd/   React 19 + Vite SPA
└── docker-compose.yml
```

## Development Commands

### Frontend (`FinalYearProjectFrontEnd/`)
```bash
npm run dev      # Vite dev server → http://localhost:5173
npm run build    # Production build to dist/
npm run lint     # ESLint
```

### Backend (`FinalYearProjectBackEnd/`)
```bash
npm run dev      # Nodemon watch → http://localhost:5000
npm start        # Production (node server.js)
```

### Docker (both services + MongoDB)
```bash
docker-compose up --build   # from repo root
```

## Backend Architecture

**Entry point**: `server.js` — connects MongoDB, configures Socket.io, mounts all 32 route files, applies middleware in order: Helmet → CORS → cookie-parser → Morgan → JSON parser → mongo-sanitize → xss-clean → rate-limiters (tiered: general 100/15min, login 5/15min, register 10/hr, AI 15/15min).

**Response convention**: every route returns `sendSuccess(res, data, message, statusCode)` or `sendError(res, message, statusCode)` from `utils/response.js`. Never call `res.json()` directly.

**Auth pattern**:
- `protect` middleware validates `Authorization: Bearer <token>` JWT, attaches full user to `req.user`.
- `authorize('lawyer', 'admin', ...)` checks role membership.
- `getFirmId = req => req.user.firmId || req.user._id` — all firm-scoped queries use this to support both firm owners (who are their own firmId) and members (who have a separate firmId).

**Soft delete**: use `isDeleted: { $ne: true }` in all queries instead of hard deletes.

**Models** live in `models/`. The core hierarchy:
- `User` — has `firmId` (ref to owner User), `role`, refresh token array, 2FA, plan.
- `Matter` — has `firmId`, `clientId`, `assignedTo[]`, stages, billing type, budget fields, SOL date.
- `Task` → `TaskList` → `Matter`: tasks belong to a list which belongs to a matter. Subtasks and dependencies are embedded arrays. Recurrence is an embedded schema.
- `Document` → `Alert` → `Notification`: cron scans documents for expiry/renewal, creates Alerts, emits socket notifications.
- `TrustAccount` → `TrustTransaction` → `TrustPaymentRequest`: three-way reconciliation flow.
- `Invoice` → `TimeEntry` / `Expense`: billing aggregation.

**Cron jobs** (`services/cron.service.js`): `startCronJobs()` is called at startup. Two jobs:
- `00:00` — `runLifecycleScan()`: expiry/renewal alerts on Documents.
- `08:00` — `runInvoiceReminderScan()` + `runSOLAlertScan()` on Matters.

**AI services**: `services/claude.service.js` (Anthropic, models: Haiku-4.5 for speed, Sonnet-4.6 for quality), `services/gemini.service.js` (Google, used for PDF chunked analysis), `services/ai.service.js` (Groq LLaMA, for fast categorization).

**Email**: `utils/email.js` — `createTransporter()` returns null if `SMTP_HOST` is unset (dev mode logs to console instead of sending). All functions use this pattern so email never breaks dev.

**Socket.io** (configured in `server.js`): JWT auth on handshake, users auto-join `user_${userId}` and `firm_${firmId}` rooms. Document collaboration events: `join-room`, `document-update`, `typing-start/stop`, `cursor-move`. DM events: `join-msg-room`, `send-message`.

## Frontend Architecture

**API layer**: `src/api/axios.js` configures a base Axios instance pointing at `$VITE_API_URL` (defaults to `http://localhost:5000/api`). JWT token is stored in `localStorage` as `nyaya_token` and auto-injected on every request. 401 responses trigger logout except on auth routes. Each feature has its own API module: `tasks.api.js`, `mattersApi.js`, `trust.api.js`, `timeTracking.api.js`, etc.

**Routing** (`src/App.jsx`): React Router 7, ~48 lazy-loaded pages. Three route guard wrappers:
- `<PrivateRoute>` — requires auth
- `<GuestRoute>` — redirects away if already logged in
- `<RoleRoute role="lawyer">` — restricts by role

**State**: Context API only — no Redux. Six contexts: `AuthContext`, `SocketContext`, `NotificationContext`, `AlertContext`, `PrivacyContext`, `MobileMenuContext`. Auth state persists via localStorage token; socket reconnects on auth change.

**Icons**: The custom icon set lives in `src/components/Icons.jsx` as named exports from `I`. **Only use icons that exist in this file.** Known-safe icons include: `Logo, Sparkle, Menu, CheckSquare, DollarSign, Timer, Filter, Kanban, Tag, Doc, DocAI, Scale, Briefcase, Building, Upload, Cloud, Lock, Search, Bell, User, Settings, ArrowRight, ArrowLeft, Check, X, Chevron, ChevronRight, Alert, Info, MapPin, Star, Calendar, Clock, Folder, Receipt, Chart, Users, Mute, Send, Download, Copy, Mail, Plus, Phone, Video, Home, Network, Activity, MessageCircle, Hand, Eye, EyeOff, Target, Shield, PenTool, Globe, Layers, TrendingUp, MessageSquare, UserPlus, Edit, Zap`. Icons **not** in the file (will crash): `Trash, FileText, BarChart2, Save, AlertCircle, AlertTriangle, Grid`.

**Styling**: Inline styles using CSS custom properties (`var(--purple)`, `var(--border)`, `var(--surface)`, `var(--bg)`, `var(--ink)`, `var(--text-muted)`, `var(--elevated)`, `var(--purple-soft)`, `var(--shadow-float)`, `var(--shadow-card)`). Tailwind is present but inline styles are the dominant pattern in practice management pages. Framer Motion is used for all page/modal transitions.

**Matters API response shape**: `r.data.data.matters` (not `r.data.data` — the backend wraps the array in `{ matters, total, page, limit }`). Always destructure correctly: `r.data.data?.matters || []`.

## Practice Management — Complete Reference

All practice management routes are role-gated to `lawyer / admin / owner / attorney / paralegal / staff` via `[protect, authorize(...)]`. All queries are firm-scoped with `getFirmId(req)`.

---

### Matters (`/matters`, `/matters/:id`)

**Frontend**: `src/pages/Matters.jsx` | **API module**: `src/api/matters.api.js`  
**Backend**: `controllers/matters.controller.js` | **Routes**: `routes/matters.routes.js`  
**Model**: `models/Matter.model.js`

**Model key fields**:
- `firmId`, `clientId` (ref Contact), `assignedTo[]` (ref User), `team[]` (userId + role), `coClients[]`
- `matterNumber` (auto-generated unique), `title`, `practiceArea` (enum: Family Law / Criminal / Contract / Property / Immigration / Employment / IP / Personal Injury / Tax / Civil / Corporate / Other)
- `stage` (enum: Intake → Open → In Discovery → Pre-Trial → Trial → Settlement → Closed → Archived)
- `status` (enum: active / pending / on_hold / closed / archived)
- `billingType` (enum: hourly / flat_fee / contingency / retainer / pro_bono), `hourlyRate`, `retainerAmount`, `contingencyPercent`, `estimatedValue`
- `budgetHours`, `budgetFees`, `budgetAlertPercent` (default 80) — cron alerts at threshold
- `solDate`, `solNotes`, `solAlertDays` (default 30) — statute of limitations tracking
- `courtName`, `courtCaseNumber`, `opposingParty`, `opposingCounsel`
- `notes[]` (embedded: text, isPinned, createdBy), `customFields` (Map)
- `isDeleted` (soft delete)

**API response shape**: `r.data.data.matters` — backend wraps list in `{ matters, total, page, limit }`. Always use `r.data.data?.matters || []`.

**Key endpoints**:
- `GET /matters` — list with filters (status, stage, practiceArea, assignedTo, search, page, limit)
- `POST /matters` — create
- `GET /matters/:id` — get single (populated: clientId, assignedTo, team)
- `PUT/PATCH /matters/:id` — update
- `POST /matters/:id/close` — sets status=closed, records closureReason + closureNotes
- `POST /matters/:id/archive` — sets status=archived
- `POST /matters/:id/reopen` — sets status=active
- `GET/POST/PATCH/DELETE /matters/:id/notes/:noteId` — embedded notes CRUD
- `POST /matters/:id/notes/:noteId/pin` — toggle pin
- `POST /matters/:id/contacts/link` — link a Contact to matter
- `DELETE /matters/:id/contacts/:contactId` — unlink
- `POST /matters/:id/apply-template` — apply task list template
- `GET /practice-areas`, `GET /matter-stages`, `GET /task-templates` — static lookup lists (no auth)
- `GET/POST/PATCH/DELETE /custom-fields` — firm-wide custom field definitions

**Bug fixed**: `Field` component in `MatterModal` was defined inside the function body — moved to module scope to prevent input focus loss on every keystroke.

---

### Contacts (`/contacts`, `/contacts/:id`)

**Frontend**: `src/pages/Contacts.jsx` | **API module**: `src/api/contacts.api.js`  
**Backend**: `controllers/contacts.controller.js` | **Routes**: `routes/contacts.routes.js`  
**Model**: `models/Contact.model.js`

**Model key fields**:
- `type` (enum: client / prospect / opposing_party / opposing_counsel / witness / court / expert / vendor / company / other)
- `firstName`, `lastName`, `company`, `jobTitle` — `fullName` virtual joins first+last or falls back to company
- `email`, `alternateEmail`, `phone`, `mobile`, `fax`
- `addresses[]` (label, street, city, state, country, postalCode, isPrimary)
- `preferredContactMethod` (email / phone / text / any), `preferredLanguage`
- `relatedMatters[]`, `linkedCompanyId` (ref self for person→company link)
- `billingRate`, `billingRateOverride` — contact-level rate overrides matter rate
- `ledesClientId`, `taxId`, `barNumber` — billing/legal IDs
- `tags[]`, `customFields` (Map), `importSource` (manual / csv / google / outlook)
- `isDeleted` (soft delete)

**Key endpoints**:
- `GET /contacts` — list with filters (type, search, isActive, page, limit)
- `GET /contacts/conflict-check` — quick search for conflict screening
- `GET /contacts/duplicates` — returns potential duplicate contacts
- `GET /contacts/export` — CSV download
- `POST /contacts/import` — CSV upload (multer, max 5MB)
- `POST /contacts/:id/merge` — merge duplicate contacts
- `GET /contacts/:id/timeline` — activity timeline (matters, notes, comms)
- `GET /contacts/:id/financials` — invoices + trust balance for this contact

---

### Tasks (`/tasks`)

**Frontend**: `src/pages/Tasks.jsx` | **API module**: `src/api/tasks.api.js`  
**Backend**: `controllers/tasks.controller.js` | **Routes**: `routes/tasks.routes.js`  
**Models**: `models/Task.model.js`, `models/TaskList.model.js`

**Task model key fields**:
- `firmId`, `matterId`, `taskListId`, `createdBy`, `assignedTo[]`, `completedBy`
- `status` (enum: to_do / in_progress / in_review / blocked / completed)
- `priority` (enum: urgent / high / medium / low)
- `activityType` (enum: research / drafting / review / court / client_meeting / calls / admin / other)
- `subtasks[]` (embedded: title, isCompleted, completedAt)
- `dependencies[]` (embedded: taskId, type: blocked_by | blocks)
- `recurrence` (embedded: frequency, interval, until) — `until` field, NOT `endDate`
- `tags[]`, `attachments[]`, `estimatedHours`, `dueDate`, `dueTime`, `reminderAt`
- `isDeleted` (soft delete)

**Recurrence auto-generation**: When `PATCH /tasks/:id/complete` is called, if the task has a `recurrence`, the controller creates the next task instance with an advanced `dueDate` (daily/weekly/monthly/yearly × interval), respecting the `until` boundary.

**TaskList model**: belongs to a matter, can be a template (`isTemplate: true`). `triggerStage` field auto-applies the list when a matter reaches that stage.

**Key endpoints**:
- `GET /tasks/my-tasks` — tasks assigned to `req.user._id`
- `GET /tasks/overdue` — past dueDate, not completed
- `PATCH /tasks/reorder` — bulk reorder by drag-drop
- `POST /tasks/bulk` — bulk create tasks
- `PATCH /tasks/:id/complete` — marks complete + generates next recurrence
- `PATCH /tasks/:id/reopen` — resets to to_do
- `POST /task-lists/:id/apply-to-matter` — apply template list to a matter

---

### Calendar (`/cal`)

**Frontend**: `src/pages/CalendarPage.jsx` | **API module**: `src/api/calendar.api.js`  
**Backend**: `controllers/calendar.controller.js` | **Routes**: `routes/calendar.routes.js`  
**Model**: `models/CalendarEvent.model.js`

**Model key fields**:
- `eventType` (enum: court_date / hearing / deposition / client_meeting / filing_deadline / conference_call / appointment / reminder / sol / other)
- `status` (enum: scheduled / completed / cancelled / rescheduled)
- `startDate`, `endDate`, `allDay`
- `location` (embedded: type in_person|virtual, address, virtualUrl)
- `attendees[]` (userId, email, status: accepted|declined|pending)
- `reminders[]` (method: email|sms|push, minutesBefore)
- `recurrence` (embedded: frequency, interval, until, daysOfWeek[]) — `until` field, NOT `endDate`

**Recurring event expansion**: `GET /calendar-events` fetches all firm events then expands recurring ones into virtual occurrences within the requested `from`/`to` window (cap 366 iterations per event). Returns a flat sorted list — virtual occurrences share `_id` with the parent but have computed `startDate`/`endDate`.

**Key endpoints**:
- `GET /calendar-events?from=&to=` — returns expanded recurring occurrences in window
- `POST /calendar-events/from-rules` — generate deadlines from court rules
- `POST /calendar-events/confirm-deadlines` — confirm and save generated deadlines
- `GET /court-rules/jurisdictions`, `GET /court-rules` — public reference lookups
- `GET /booking/:slug`, `POST /booking/:slug/book` — public client booking (no auth)
- `GET/PUT /availability` — lawyer availability settings

---

### Time Tracking (`/time`)

**Frontend**: `src/pages/TimeTracking.jsx` | **API module**: `src/api/timeTracking.api.js`  
**Backend**: `controllers/timeTracking.controller.js` | **Routes**: `routes/timeTracking.routes.js`  
**Models**: `models/TimeEntry.model.js`, `models/Timer.model.js`, `models/Expense.model.js`

**TimeEntry model key fields**:
- `firmId`, `matterId`, `userId`
- `activityType` (enum: research / drafting / court / client_meeting / calls / review / travel / admin / other)
- `hours`, `rate`, `amount` (auto-computed: hours × rate on pre-save hook)
- `isBillable`, `isBilled`, `invoiceId` (populated when added to invoice)
- `taxRate`, `taxAmount` (auto-computed on pre-save)
- `linkedEventId`, `linkedTaskId`, `linkedCommunicationId` — cross-references

**Timer**: start/pause/resume/stop — `POST /timers`, `POST /timers/:id/stop` converts to a TimeEntry.

**Expense model**: category, amount, receipt URL, `isReimbursable`, `isBillable`, `invoiceId`, `approvedBy`.

**Key endpoints**:
- `GET /time-entries` — list with filters (matterId, userId, isBillable, isBilled, from, to)
- `PATCH /time-entries/bulk` — bulk update (e.g., mark billed)
- `POST /timers/:id/stop` — stops timer and creates TimeEntry
- `POST /expenses/:id/approve` — approves expense for billing

---

### Billing (`/billing`)

**Frontend**: `src/pages/Billing.jsx` | **API module**: `src/api/billing.api.js`  
**Backend**: `controllers/billing.controller.js` | **Routes**: `routes/billing.routes.js`  
**Model**: `models/Invoice.model.js`

**Invoice model key fields**:
- `status` (enum: draft / sent / partially_paid / paid / overdue / void)
- `invoiceNumber` (auto-generated)
- `lineItems[]` (type: time_entry|expense|manual|flat_fee, description, quantity, rate, amount, isTaxable)
- `taxLines[]` (name, rate, amount)
- `payments[]` (embedded: amount, date, method, transactionId, notes)
- `installments[]` (payment plan: dueDate, amount, status)
- `discountType` (percent|fixed), `discountValue`
- `amountTotal`, `amountPaid`, `amountOutstanding` (computed)
- `paymentToken` (UUID for public pay link), `paymentLink` (set on send)
- `clientName`, `clientEmail`, `clientAddress`
- Template format: standard | ledes

**Invoice payment flow**:
1. `POST /invoices/:id/send` → sets status=sent, generates `paymentLink = ${FRONTEND_URL}/pay/${paymentToken}`, emails client via `sendInvoiceEmail`
2. Client opens `/pay/:token` (public, no auth) → `InvoicePayPage.jsx`
3. `GET /payments/public/:token` → returns invoice data
4. `POST /payments/public/:token/pay` → records payment, updates `amountPaid` / `amountOutstanding`

**Key endpoints**:
- `POST /invoices/generate` — auto-generate from unbilled time entries on a matter
- `POST /invoices/batch-generate` — generate for multiple matters at once
- `POST /invoices/:id/mark-paid` — manual mark paid (offline payment)
- `POST /invoices/:id/void` — void invoice
- `POST /invoices/:id/write-off` — write off outstanding balance
- `POST /invoices/:id/payment-plan` — create installment schedule
- `POST /invoices/:id/credit-note` — issue credit note
- `GET /credit-notes` — list all credit notes

---

### Trust Accounting (`/billing` → TrustAccounting tab)

**Frontend**: `src/pages/TrustAccounting.jsx` (tab inside Billing page) | **API module**: `src/api/trust.api.js`  
**Backend**: `controllers/trust.controller.js` | **Routes**: `routes/trust.routes.js`  
**Models**: `models/TrustAccount.model.js`, `models/TrustTransaction.model.js`, `models/TrustPaymentRequest.model.js`

**Three-way flow**: TrustAccount (balance ledger) → TrustTransaction (individual entries) → TrustPaymentRequest (client retainer requests)

**TrustAccount fields**: `accountName`, `bankName`, `accountNumber`, `routingNumber`, `balance` (running total), `currency`, `isDefault`, `reconciliations[]` (date, bankBalance, reconciledBalance, isBalanced)

**TrustTransaction types**: deposit / disbursement / transfer / refund — each updates `TrustAccount.balance`.

**Payment request flow**:
1. `POST /trust-accounts/:id/request-payment` → creates TrustPaymentRequest with crypto token, sets `payUrl = ${FRONTEND_URL}/trust-pay/${token}`
2. Client opens `/trust-pay/:token` (public, no auth) → `TrustPayPage.jsx`
3. `GET /trust-pay/:token` → returns request data
4. `POST /trust-pay/:token` → records deposit, updates trust balance

**Key endpoints**:
- `GET /trust-accounts/:id/ledger` — full account ledger
- `GET /trust-accounts/:id/matter-ledger/:matterId` — per-matter trust breakdown
- `GET /trust-accounts/:id/reconciliation-report` — reconciliation data
- `POST /trust-accounts/:id/reconcile` — perform reconciliation
- `PATCH /trust-accounts/:id/transactions/:txId/void` — void a transaction
- `GET /trust-accounts/:id/payment-requests` — list payment requests
- `PATCH /trust-accounts/:id/payment-requests/:reqId/cancel` — cancel request

---

### Reports (`/reports`)

**Frontend**: `src/pages/Reports.jsx` | **API module**: `src/api/reports.api.js`  
**Backend**: `controllers/reports.controller.js` (580 lines) | **Routes**: `routes/reports.routes.js`

**Available report endpoints**:
- `GET /reports/dashboard` — firm dashboard summary (matters, revenue, utilization)
- `GET /reports/summary` — full aggregated summary
- `GET /reports/revenue` — revenue by period/practice area
- `GET /reports/accounts-receivable` — AR aging (0-30 / 31-60 / 61-90 / 90+ days)
- `GET /reports/collections` — collection rates by attorney/matter
- `GET /reports/trust` — trust account summary
- `GET /reports/time` — time entry report (by attorney, matter, period)
- `GET /reports/utilization` — billable vs non-billable hours per attorney
- `GET /reports/wip` — work in progress (unbilled time + expenses)
- `GET /reports/matters` — matter stats (open/closed/by stage/area)
- `GET /reports/pipeline` — lead pipeline funnel
- `GET /reports/lead-sources` — leads by source
- `GET/POST /reports/custom`, `GET/PUT/DELETE /reports/custom/:id` — custom report CRUD
- `POST /reports/custom/:id/schedule` — schedule recurring report
- `GET /reports/custom/:id/export` — export to CSV/PDF

---

### E-Sign (`/esign`)

**Frontend**: `src/pages/ESign.jsx` | **API module**: `src/api/esign.api.js`  
**Public page**: `src/pages/ESignSignPage.jsx` at `/esign/sign/:token`  
**Backend**: `controllers/esign.controller.js` | **Routes**: `routes/esign.routes.js`  
**Model**: `models/ESignRequest.model.js`

**Model key fields**:
- `status` (enum: draft / pending / partially_signed / completed / expired / void)
- `signingMode` (sequential | parallel) — sequential enforces `signingOrder`
- `signatories[]` (name, email, role: client|co_client|attorney|witness|third_party, signingOrder, token (crypto 32 bytes), status: pending|signed|declined, signedAt, signedIp, signedUserAgent, signatureData, declineReason)
- `auditTrail[]` (event, actor, actorEmail, ip, userAgent, time, details) — append-only
- `expiresAt`, `voidedAt`, `voidReason`, `voidedBy`
- `documentHash` (SHA-256 of original), `signedDocumentHash`

**Signing flow**:
1. Create request (draft) → `POST /esign-requests`
2. Send → `POST /esign-requests/:id/send` — sets status=pending, generates `sigUrl = ${FRONTEND_URL}/esign/sign/${token}` per signatory, emails each via `sendESignInviteEmail`
3. Signatory opens `/esign/sign/:token` (public, no auth)
4. `GET /esign/sign/:token` — returns doc info + their signatory record; validates not expired, not already signed, checks sequential order
5. `POST /esign/sign/:token` — records signature (typed name + IP + userAgent + timestamp), advances status to partially_signed or completed
6. `POST /esign/sign/:token/decline` — records decline reason, notifies firm

**Resend**: `POST /esign-requests/:id/resend` — refreshes tokens for pending signatories only, re-emails them.

---

### Doc Automation (`/doc-automation`)

**Frontend**: `src/pages/DocAutomation.jsx` | **API module**: `src/api/templates.api.js`  
**Backend**: `controllers/templates.controller.js` | **Routes**: `routes/templates.routes.js`  
**Model**: `models/DocTemplate.model.js`

**Key endpoints**:
- `GET /doc-templates/categories` — public list of template categories
- `POST /doc-templates/ai-convert` — AI converts uploaded doc to a template with variable placeholders
- `GET /doc-templates/generated` — list of generated (filled) documents
- `POST /doc-templates/:id/generate` — fill template with matter/contact data → creates PracticeDocument
- `GET /doc-templates/:id/versions` — version history
- `POST /doc-templates/:id/restore/:versionId` — restore previous version
- `PATCH /doc-templates/:id/favorite` — toggle favorite
- `GET /court-forms`, `GET /court-forms/:id/fill` — court form library

---

### Lead Pipeline (`/leads`)

**Frontend**: `src/pages/LeadPipeline.jsx` | **API module**: `src/api/leads.api.js`  
**Backend**: `controllers/leads.controller.js` | **Routes**: `routes/leads.routes.js`

**Key endpoints**:
- `GET /stages`, `GET /sources` — static lookup lists (no auth)
- `PATCH /:id/stage` — move lead through pipeline stages
- `POST /:id/convert` — convert lead to Matter + Contact
- `POST /:id/book-consultation` — book a consultation calendar event
- `GET /analytics/pipeline` — funnel analytics
- `GET /analytics/sources` — conversion by lead source

---

### Conflict Checker (`/conflicts`)

**Frontend**: `src/pages/ConflictChecker.jsx` | **API module**: `src/api/conflicts.api.js`  
**Backend**: `controllers/conflicts.controller.js` | **Routes**: `routes/conflicts.routes.js`

**Key endpoints**:
- `POST /check` — run conflict check (searches contacts, matters, opposing parties by name/email)
- `GET /history` — past conflict check reports
- `GET /:id` — full conflict check report
- `PATCH /:id/resolve` — mark conflict resolved with notes
- `POST /:id/waiver` — record a conflict waiver

---

### Communications (`/communications`)

**Frontend**: `src/pages/Communications.jsx` | **API module**: `src/api/communications.api.js`  
**Backend**: `routes/communications.routes.js`

---

### Client Portal (`/client-portal/:token`)

**Frontend**: `src/pages/ClientPortal.jsx` | **API module**: `src/api/portal.api.js`  
**Backend**: `routes/portal.routes.js`  
Token-based, no auth required — client accesses matter documents, invoices, and messages via a secure link.

---

### Firm Settings (`/firm-settings`)

**Frontend**: `src/pages/FirmSettings.jsx` | **API module**: `src/api/firm.api.js`  
**Backend**: `routes/firm.routes.js`

---

### Accounting (`/accounting`) — owner/admin only

**Frontend**: `src/pages/Accounting.jsx` | **API module**: `src/api/accounting.api.js`  
**Backend**: `routes/accounting.routes.js`

---

### Public Portal Pages (no auth, token-based)

| Route | Page | Backend endpoint |
|---|---|---|
| `/pay/:token` | `InvoicePayPage.jsx` | `GET/POST /payments/public/:token` |
| `/trust-pay/:token` | `TrustPayPage.jsx` | `GET/POST /trust-pay/:token` |
| `/esign/sign/:token` | `ESignSignPage.jsx` | `GET/POST /esign/sign/:token`, `POST /esign/sign/:token/decline` |
| `/client-portal/:token` | `ClientPortal.jsx` | `GET /portal/...` |

---

### Cron Jobs (Practice Management)

Defined in `services/cron.service.js`, started at server boot:
- `00:00 daily` — `runLifecycleScan()`: scans Documents for expiry/renewal, creates Alerts, emits socket notifications
- `08:00 daily` — `runInvoiceReminderScan()`: finds overdue invoices, sends reminder emails; `runSOLAlertScan()`: finds matters with SOL date within `solAlertDays`, creates alerts

---

### Frontend API Modules (Practice Management)

Each file in `src/api/` wraps axios calls for one feature:
`matters.api.js`, `contacts.api.js`, `tasks.api.js`, `calendar.api.js`, `timeTracking.api.js`, `billing.api.js`, `trust.api.js`, `esign.api.js`, `templates.api.js`, `leads.api.js`, `conflicts.api.js`, `reports.api.js`, `communications.api.js`, `portal.api.js`, `firm.api.js`, `accounting.api.js`

---

## Key Environment Variables

Backend `.env`:
```
MONGO_URI=mongodb+srv://...
JWT_SECRET=
JWT_REFRESH_SECRET=
ANTHROPIC_API_KEY=
GEMINI_API_KEY=
GROQ_API_KEY=
SMTP_HOST=      # leave blank in dev to log emails to console
SMTP_USER=
SMTP_PASS=
FRONTEND_URL=http://localhost:5173
PORT=5000
```

Frontend `.env`:
```
VITE_API_URL=http://localhost:5000/api
```

## Deployment

- **Frontend**: Netlify (auto-deploy from GitHub, `npm run build`)
- **Backend**: Render (Node.js service, env vars in dashboard)
- **Database**: MongoDB Atlas
- **File storage**: AWS S3 + CloudFront (document uploads)

Git remotes:
- Frontend → `github.com/shahab-011/nay`
- Backend → `github.com/shahab-011/product-backend`
