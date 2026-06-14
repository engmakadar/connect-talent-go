# System Guide – Company Management & Data Reset

Big batch. I'll ship it in **3 sequential migrations + UI work** to keep things reviewable. Confirm before I start — especially the **destructive data purge** in section 2.

---

## 1. Companies page — "Team" column
- Add a **Team** column to `src/routes/admin.companies.tsx` showing the list of internal teams for each company (chips: team name + member count), pulled from `company_teams` + `company_team_members`.
- Clicking a team chip opens the existing Company Detail page (`admin.companies.$companyId.tsx`) and scrolls to the team panel.
- This replaces the Team field previously removed from All Users.

## 2. Database Reset (DESTRUCTIVE — needs your OK)
A migration that, in order:
1. Deletes from `job_applications`, `job_edit_history`, `jobs`, `payment_transactions`, `subscriptions`, `company_team_members`, `company_teams`, `company_member_roles`, `companies`, `page_permissions`, `user_activity_log`, `user_preferences`, `jobseeker_preferences`, `audit_logs`, `user_roles` (except Super Admin), `profiles` (except Super Admin).
2. Deletes from `auth.users` everyone except `superadmin@demo.com`.
3. Keeps `subscription_plans` and `job_categories` (config data) — say if you want those wiped too.

After: only the Super Admin account exists.

## 3. Company User Management (CRUD)
New route `src/routes/company.users.tsx` (gated: requires `has_company_role` owner/manager for the user's `profiles.company_id`).
- **Create**: invite by email → creates auth user via server fn → links to company + role + optional team.
- **Read**: table with search, role filter, status filter.
- **Update**: edit name/phone/role/team assignment.
- **Delete**: confirm dialog → server fn removes auth user + cascades.
- **Suspend/Deactivate**: toggles `profiles.suspended` / `profiles.deactivated`.
- All ops scoped to the caller's company. Super Admin keeps its global view via `admin.companies.$companyId.tsx`.
- Nav entry shown only to employer users.

## 4. Super Admin password reset
On `admin.users.tsx` row menu, two new actions:
- **Set new password** (preferred): dialog to enter a password → server fn calls `auth.admin.updateUserById`.
- **Send reset email**: server fn calls `auth.admin.generateLink({type:'recovery'})` and emails via existing flow (or returns the link to copy if email isn't configured).
- Both write to `audit_logs` with action `user.password_reset`.

## 5. Subscription plans — modern payment flow + Free trial
- Refresh `src/routes/plans.tsx` `SubscribeDialog` into a **stepper** (Plan → Method → Details → Confirm) with branded tiles for Visa/Mastercard/PayPal and EVC/Zaad/Sahal/Mpesa, summary panel, success state.
- Manual confirmation only (no live gateway) — stored in `payment_transactions` as today.
- **Free plan trial**: when a user subscribes to the Free plan, create a `subscriptions` row with `trial_ends_at = now()+30 days`. Add helper `has_active_subscription(user)` and gate:
  - Job posting (employer): require active sub OR active trial.
  - Company user creation: max **2 users** during trial (counted via `company_member_roles`).
- After expiry the UI shows an "Upgrade" banner and blocks the gated actions.

## 6. Notifications & Announcements
New tables: `notifications` (per-user inbox) and `announcements` (admin broadcasts with channels: in_app / email / sms).
- Bell icon in site header → popover with unread count + list, mark-as-read.
- `admin.announcements.tsx`: create + view announcements; on publish, fan-out into `notifications` for the targeted audience (all / employers / jobseekers / specific company).
- Email/SMS delivery: queued + logged in `notification_deliveries` with status `pending` (actual send wiring stubbed — say if you want me to enable Resend/Twilio now, both need keys).

## 7. Activity log pagination + Excel export
Rework `settings.tsx` Activity tab and add `admin.audit-logs.tsx` improvements:
- Range selector: 1–30, 31–60, 61–90, 91–120, **All**, with prev/next.
- Search box (event_type, IP) + date range filter.
- **Download Excel** button using `xlsx` (SheetJS) — exports current filter result.

---

## Technical details (skip if not interested)

**Migrations (3):**
1. `team_column_support` — view/RPC `get_company_teams_summary(company_id)` for fast list rendering.
2. `data_purge` — destructive deletes scoped to non-superadmin IDs.
3. `notifications_and_trial` — `notifications`, `announcements`, `notification_deliveries` tables with RLS + GRANTs; `subscriptions.trial_ends_at` column; `has_active_subscription` SECURITY DEFINER fn.

**Server functions (new in `src/lib/`):**
- `company-users.functions.ts` — invite/update/delete/suspend (RBAC via `has_company_role`).
- `admin-password.functions.ts` — `setUserPassword`, `sendPasswordReset`.
- `announcements.functions.ts` — `publishAnnouncement` (fan-out).

**Packages to add:** `xlsx` for Excel export.

**Out of scope (will confirm separately if you want them):** real SMS gateway, live Stripe/Paddle, marketing email sends, multi-language announcements.

---

### Please confirm
1. **Run the data purge?** (yes/no — destroys all jobs, users, companies, applications, payments).
2. Keep `subscription_plans` and `job_categories` config rows? (default: yes, keep)
3. Wire Resend for announcement emails now, or stub for later?
