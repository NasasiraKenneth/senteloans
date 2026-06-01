# Notifications

In-app notifications for staff (institution dashboard) and members (client portal). All notifications live in `senteloans_notifications`. Producers call `notificationService` inside a transaction; consumers read through `/api/{institution,client}/notifications`.

## Data model

| Table | Purpose |
|-------|---------|
| `senteloans_notifications` | One row per notification. `recipient_type` is **`member`** or **`institution_user`**. |
| `senteloans_notification_preferences` | Per-user channel flags (in-app / SMS / email). Read but not yet enforced by producers. |

Schema: `scripts/01-create-schema.sql` (sections 17 & 18). RLS policies: `scripts/02-row-level-security.sql`.

> **Migrations (run in order on DBs that pre-date notifications):**
> 1. `scripts/29-create-notifications-tables.sql` — creates tables + indexes
> 2. `scripts/30-normalize-notification-recipient-type.sql` — backfills legacy `'client'` → `'member'`, tightens CHECK constraints
>
> Or run `npm run db:migrate` (picks up both in numeric order). Safe to re-run.

## Service

`lib/notifications/notification-service.ts` — `create`, `createBulk`, `markAsRead`, `markManyAsRead`, `markAllAsRead`, `getUnreadCount`, `deleteExpired`. Pass a `PoolClient` to join an existing transaction.

`lib/notifications/notification-types.ts` — `RecipientType = 'member' | 'institution_user'`, `NotificationTemplates` per event.

`lib/notifications/admin-recipients.ts` — `getInstitutionAdminRecipients(client, institutionId, opts)` is the single source of truth for "which staff get operational alerts". Use it everywhere — never hand-roll a roles query for notifications.

## Producers (current)

| Trigger | Recipients | Template |
|---------|------------|----------|
| Staff creates loan (`POST /api/institution/loans`) | Admins/managers/loan officers (excluding actor) + member | `pendingLoanApproval`, `loanApplicationSubmitted` |
| Member applies (`POST /api/client/loans`) | Admins/managers/loan officers + member | same |
| Loan status changes (`PUT /api/institution/loans/[id]`) | Member | `loanApproved` / `loanRejected` / `loanDisbursed` |
| Member uploads/replaces KYC (`POST /api/client/kyc-docs[/replace]`) | Admins/managers/loan officers + member | `pendingKycReview`, `kycSubmitted` |
| Staff approves/rejects KYC (`POST /api/institution/members/[id]/kyc/{approve,reject}`) | Member | `kycApproved` / `kycRejected` |
| Loan repayment recorded (`POST /api/institution/loans/[id]/record-payment`) | Member | `paymentReceived` |

> Sacco-loans (`senteloans_institution_loans`) target an organizational `senteloans_clients` row, not a portal user, so they don't notify a member.

## Consumers

| Route | Notes |
|-------|-------|
| `GET /api/institution/notifications` | List + `unreadCount`. `?unread_only=true`, `?limit=N` (max 200). |
| `PATCH /api/institution/notifications/[id]` | Mark a single notification read/unread. |
| `POST /api/institution/notifications/mark-all-read` | Single round-trip "mark all". |
| Same set under `/api/client/notifications` | Member-side. |

UI: `components/notification-bell.tsx` (polls every 30s) + `components/notification-panel.tsx` (uses `mark-all-read` endpoint, no longer N PATCHes).

## Ops

**First-time DB setup:**

```bash
psql "$DATABASE_URL" -f scripts/29-create-notifications-tables.sql
psql "$DATABASE_URL" -f scripts/30-normalize-notification-recipient-type.sql
```

**Daily cleanup** (pick one):

1. `npm run workers` — requires Redis (`REDIS_URL`); boots `notification.worker` and schedules cleanup (default `15 3 * * *` UTC, override with `NOTIFICATION_CLEANUP_CRON`).
2. `npm run notifications:cleanup` — one-shot SQL delete; no Redis; suitable for system cron.

Both delete rows where `expires_at < NOW()` (default TTL 90 days).

## Smoke-test matrix

Run these in order after deploying. Each step asserts an exact visual outcome and the DB row that backs it.

### Setup

1. Create one institution with at least: one **Admin**, one **Manager**, one **Loan Officer**, one **Member** with portal access.
2. Log all four into the same browser using different sessions/profiles.

### A. Pending loan approval (staff creates)

1. As Loan Officer, `POST /api/institution/loans` for the member.
2. **Expected:** Admin and Manager bells +1 (Loan Officer bell unchanged — actor excluded). Member bell +1 ("Loan Application Submitted").
3. Verify: `SELECT recipient_id, recipient_type, type FROM senteloans_notifications ORDER BY created_at DESC LIMIT 4;` — three `pending_loan_approval` rows for staff + one `loan_application_submitted` for the member.

### B. Pending loan approval (member applies)

1. As Member, `POST /api/client/loans`.
2. **Expected:** Admin/Manager/Loan Officer bells +1 each, Member bell +1.

### C. Loan status change

1. As Admin, `PUT /api/institution/loans/[id]` with `{ status: "Approved" }`.
2. **Expected:** Member bell +1, title "Loan Application Approved", action_url `/client-portal/loan-details/[id]`. Clicking marks the row read.

### D. KYC submit / review

1. As Member, `POST /api/client/kyc-docs` with a `national_id_front`.
2. **Expected:** Staff bells +1 (`pending_kyc_review`), Member bell +1 (`kyc_submitted`).
3. As Admin, `POST /api/institution/members/[id]/kyc/approve`.
4. **Expected:** Member bell +1 (`kyc_approved`).

### E. Payment received

1. As Loan Officer, `POST /api/institution/loans/[id]/record-payment` with `{ amount: 100000 }`.
2. **Expected:** Member bell +1 (`payment_received`), action_url to the loan, metadata includes `balance_after`.

### F. Mark all as read

1. With ≥3 unread, open the bell, click **Mark all as read**.
2. **Expected:** Network tab shows a single `POST .../notifications/mark-all-read` (200) — not N PATCHes. Bell badge goes to 0.

### G. Cleanup

1. Insert a row with `expires_at = NOW() - INTERVAL '1 day'`.
2. Run `npm run notifications:cleanup`.
3. **Expected:** Output `removed=1`, row gone.

## Roadmap (not yet implemented)

- Preferences API + producers honoring `in_app_enabled` / `sms_enabled` / `email_enabled`.
- Email channel via `queues/email.queue.ts` triggered on insert when `email_enabled = true`.
- Real-time push (websocket / SSE) to replace the 30s poll.
- `payment_due` / `payment_overdue` daily scan job.
- `loan_overdue_alert` to staff (rolled up).
