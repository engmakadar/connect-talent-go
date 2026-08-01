## 1. ATS Integration (employer dashboard)

**Data**
- Add `jobs.preferred_skills text[]` (weighted skill list per posting) — the job form gets a "Preferred skills" input.
- Reuse `job_applications.match_score`; add `shortlisted boolean`, `employer_note text`, and allow employers to update status (currently UPDATE is denied on that table).

**Matching logic** (server function `scoreApplication`)
- Score 0–100 from: skills overlap (applicant `jobseeker_preferences.skills` + resume skills vs job `skills`/`preferred_skills`) 55%, experience years vs `jobs.experience_years` 25%, category/location/employment-type preference match 20%.
- Computed at apply time and stored on the application row.

**UI** — new `/company/applicants` page (and an applicants count column on Job Management)
- Per vacancy: applicant count, list of applicants with match %, sortable.
- "Shortlisted" section auto-populated at score ≥ 70 (threshold shown, employer can add/remove manually).

## 2. One-Click Apply

- `applyToJob` server function: takes `job_id`, pulls the signed-in user's profile + resume, computes match score, inserts into `job_applications` (blocks duplicates), notifies the employer.
- Job detail page gets an **Apply with my profile** button (falls back to the existing external URL/email links when the job has no in-platform apply).
- Employer actions on each applicant: **Send regret** and **Invite to interview** (written / oral) — mailto-style composer prefilled with templated copy, application status updated to `rejected` / `interview`, plus an in-app notification to the candidate.

## 3. Hand-Skill Portal

New section at `/services`:
- Tables: `skill_workers` (user, trades, hourly/daily rate, location w/ lat-lng, bio, availability, avg rating), `service_bookings` (customer, worker, description, scheduled date, address, status), `service_reviews` (performance + behaviour ratings, comment).
- Worker onboarding form (`/services/register`), public browse/search by trade + proximity + rating, booking form, worker dashboard with incoming bookings, notification on booking, and a rate-the-worker flow once a booking is marked complete.
- Full RLS: workers manage own profile/bookings, customers manage own bookings/reviews, public read of approved worker profiles and ratings.

## 4. Employer Profile Picture RLS Fix

Cause: the `company-logos` upload policy only allows the company's `created_by` user or an `owner`/`manager` in `company_member_roles`. Employers linked only via `profiles.company_id` are rejected.
- Rewrite the INSERT/UPDATE/DELETE policies to allow: admins, or any user where `user_in_company(auth.uid(), <folder uuid>)`, or the uploader's own uid folder.
- Add a SELECT policy so logos stay readable.
- Super Admin can change any company's logo; each change writes a `company.update` audit log entry.

## 5. User Activation

Already implemented via the admin-only `admin_confirm_user_email` RPC (sets `email_confirmed_at`, clears suspension/pending). I'll re-verify end-to-end and fix anything still blocking, rather than rebuilding it.

## Technical notes

- Migrations: job/application columns, three new hand-skill tables (with GRANTs + RLS), storage policy rewrite.
- New server functions: `applyToJob`, `scoreApplication`, `bookService`, `submitServiceReview`.
- Emails to candidates use in-app notifications + mailto composer (no external mail provider is configured yet — say the word if you want real outbound email via a provider).

## Question

Item 3 is effectively a second marketplace product and is the bulk of this work. Do you want it built in this same pass, or should I ship 1, 2, 4, 5 first and do the hand-skill portal next?
