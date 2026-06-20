# Implementation Plan

This is a sizable change touching auth flow, admin nav, super-admin tools, schema, and a new CV parser. I'll group it into 5 work areas. Please confirm or adjust before I start.

## 1. Company Registration & Approval Workflow

- Add `companies.approval_status` (`pending` | `approved` | `rejected` | `flagged_fraud`) and `flagged_reason` text.
- On company signup → status = `pending`. Super-admin gets it in a new **Company Approvals** queue (reuse `/admin/review` pattern, new tab "Companies").
- **Default company admin nav** (gated by status & subscription):
  - Always: Dashboard, Job Management, Billing & Revenue (Subscriptions List hidden), Audit Log (scoped to own company), Brand Settings.
  - Hide "Admin Console" / advanced sections until an active subscription exists (`has_active_subscription`).
- **Job publishing rule**:
  - Active subscription + approved company → new jobs auto-`approved`.
  - Otherwise → `pending` (existing flow).
- **Fraud detection**: simple heuristic on job create (suspicious URL regex, or company `flagged_fraud`) → status = `flagged_fraud`, surfaced in a new **Fraud Detection** tab on `/admin/review`.

## 2. Super Admin — Subscriptions / Trial Controls

Extend `/admin/subscriptions`:
- New tab **"No Subscription"** listing companies with no subscription row.
- "Grant Trial" action → inserts subscription row (plan = free trial, `trial_ends_at = now + 14d`, `active = true`).
- "Extend / Override" action on existing rows → editable `valid_until` and `active`.

## 3. Category Page — Employment Types

- New table `employment_types` (name, slug, active).
- Admin Category page (`/admin/categories`) gets a second section "Employment Types" with table + add/edit/delete.
- Job form's employment type field switches from enum/free-text to lookup from this table (kept backward-compatible).

## 4. Jobseeker — My Resume Gating

- In jobseeker nav/sidebar, hide "My Resume" route unless `has_active_subscription(auth.uid())`.
- Route-level guard redirects to pricing if accessed directly.

## 5. Profile Builder — CV Parsing

- "Upload Resume (PDF/DOCX)" button on profile builder.
- File uploaded to `resumes` bucket (private), then sent to a `createServerFn` that:
  - Extracts text (pdf → `pdf-parse` style; docx → `mammoth`).
  - Calls Lovable AI Gateway (`google/gemini-2.5-flash`) with structured-output schema: `{full_name, headline, email, phone, skills[], experience[], education[]}`.
  - Returns parsed JSON; client pre-fills profile fields (user reviews before save).

## Technical Notes

- Migrations needed for: `companies.approval_status`, `employment_types` table (+ GRANTs + RLS), optional `jobs.fraud_flag` (or reuse status enum value).
- New server fns: `submitCompanyApproval`, `approveCompany`, `rejectCompany`, `grantTrial`, `parseResume`.
- RLS: company users see only own audit logs (already enforced via `user_in_company`); verify policies.
- No new external API keys — CV parsing uses existing `LOVABLE_API_KEY`.

## Open Questions

1. **Free trial length** when super-admin grants one — 14 days OK, or different?
2. **Suspicious link heuristic** — start with simple blocklist (bit.ly, tinyurl, non-https, IP URLs), or do you have a specific list?
3. **CV parser** — pre-fill and let user save, or auto-save and let them edit after?
4. **Employment Type migration** — keep existing string values on jobs, or migrate to FK?

Reply with answers (or "go with defaults") and I'll implement.
