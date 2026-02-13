# SenteLoans — Feature Backlog & Priorities

This document captures planned features for the multi-tenant financial SaaS, grouped by priority to guide implementation order.

## P0 — Must-Haves (Blockers for GA)
- Authentication & Session
  - Institution admin auth, logout, guarded routes
  - Session bootstrap and tenant config hydration
- Settings (Phase 2 scope)
  - Institution Settings JSON (modules, currency, shares)
  - Admin Profile (name, phone) with client-side validation
  - Password Reset with validation and toasts
- RLS & Multi-tenancy
  - Auth-based helpers (`app.current_institution_id()`, `app.current_role()`)
  - `get_current_institution_id()`/`get_current_user_id()`/`is_system_admin()` auth-based (no GUC)
  - Explicit UPDATE policies with WITH CHECK for critical tables
- Users (Members/Borrowers)
  - Users index with live data columns
  - User detail with core fields and shares section (if enabled)

## P1 — High Priority (Next Up)
- Settings — Additional Essentials
  - Notifications: provider config (Mail/SMS), event toggles, message templates
  - Integrations: Mobile Money (MTN/Airtel) credentials, webhook secrets
  - Client Portal toggles: enable apply loan, statements, mobile money pay
  - Phone number format validation across forms
- Users Index
  - Server-side pagination and search filters (status, KYC)
- Shares & Savings (SACCO/MFI)
  - Shares: min/max enforcement, statements
  - Savings: basic accounts list and balances
- Observability
  - Toast-based error/success pattern app-wide
  - Basic error boundaries

## P2 — Medium Priority (Important, not blocking)
- Loans Configuration
  - Default interest method, grace periods, penalties, rounding
  - Product-level constraints (min/max principal, rates, fees)
- Accounting & Posting
  - Chart of accounts mapping per product
  - Posting policy (real-time vs batch), cut-offs
- KYC & Compliance
  - Per-client-type required docs, expiry reminders
  - Risk limits: exposure caps, DPD thresholds
- Webhooks
  - Event subscriptions: `loan_approved`, `disbursed`, `repayment_posted`, `kyc_verified`

## P3 — Nice-to-Have (Future)
- Localization & Branding
  - Language toggle (English/Luganda/Swahili)
  - Branding (logo/colors) for statements/UI
  - Date/time format and timezone preferences
- Data Import/Export
  - CSV templates for clients, opening balances, shares
  - Exports for statements and GL entries
- RBAC Enhancements
  - Fine-grained permissions per role, custom roles UI
- Billing/Plans (if managed in-app)
  - Plan and usage display (read-only or integrated)

## Cross-Cutting Practices
- Client-side validation for all forms (required, email/phone formats, min lengths)
- RLS-compliant APIs only; immediate session updates after settings saves
- Replace `alert()` with toasts; show contextual save buttons per card

## Notes
- Implement features under `senteloans_institutions.settings` with clear namespaces, e.g. `settings.notifications.*`, `settings.integrations.mobile_money.*`.
- Extend `PUT /api/institution/settings` incrementally with validation for each new section.
