/**
 * Hand-skill service platform — shared lifecycle + matching constants.
 *
 * Job lifecycle (controlled status flow):
 *   requested → matched → accepted → confirmed → in_progress
 *     → completed → customer_confirmed → rated → closed
 *   Alternative paths:
 *     cancelled (cancelled_by + cancel_reason record the actor and why)
 *     expired   (auto-expired after 7 days without worker acceptance)
 *     disputed  (→ resolved via the dispute workflow)
 *
 * Matching score weights (configurable — must mirror match_service_workers SQL):
 *   skills 40 · distance-within-radius 25 · rating 15 · workload 10 · experience 10
 */

export const SERVICE_STATUSES = [
  "requested", "matched", "accepted", "confirmed", "in_progress",
  "completed", "customer_confirmed", "rated", "closed", "cancelled", "expired", "disputed",
] as const;

export type ServiceStatus = (typeof SERVICE_STATUSES)[number];

export const SERVICE_STATUS_LABEL: Record<string, string> = {
  requested: "Requested",
  matched: "Matched",
  accepted: "Accepted",
  confirmed: "Confirmed",
  in_progress: "In progress",
  completed: "Completed",
  customer_confirmed: "Customer confirmed",
  rated: "Rated",
  closed: "Closed",
  cancelled: "Cancelled",
  expired: "Expired",
  disputed: "Disputed",
};

/** Statuses where the job is still live (not finished/cancelled). */
export const SERVICE_ACTIVE = new Set([
  "requested", "matched", "accepted", "confirmed", "in_progress",
]);

/** Statuses a customer may raise a dispute from. */
export const SERVICE_DISPUTABLE = new Set([
  "accepted", "confirmed", "in_progress", "completed", "customer_confirmed",
]);

export const DISPUTE_STATUSES = ["dispute_created", "admin_review", "decision", "resolved"] as const;

export const DISPUTE_STATUS_LABEL: Record<string, string> = {
  dispute_created: "Dispute created",
  admin_review: "Admin review",
  decision: "Decision issued",
  resolved: "Resolved",
};

/** Urgency levels a customer picks when requesting a service. */
export const URGENCY_LEVELS = ["low", "normal", "urgent", "emergency"] as const;
export type Urgency = (typeof URGENCY_LEVELS)[number];

export const URGENCY_LABEL: Record<string, string> = {
  low: "Flexible timing",
  normal: "Normal",
  urgent: "Urgent",
  emergency: "Emergency",
};

export const URGENCY_STYLE: Record<string, string> = {
  low: "bg-muted text-muted-foreground border-0",
  normal: "bg-sky-100 text-sky-800 border-0",
  urgent: "bg-amber-100 text-amber-800 border-0",
  emergency: "bg-red-100 text-red-800 border-0",
};

/** Matching engine weights (documented + mirrored in match_service_workers). */
export const MATCH_WEIGHTS = {
  skills: 40,
  distance: 25,
  rating: 15,
  workload: 10,
  experience: 10,
} as const;
