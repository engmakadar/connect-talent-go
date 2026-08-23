/**
 * Hand-skill service platform — shared lifecycle + matching constants.
 *
 * Job lifecycle:
 *   requested → matched → accepted → confirmed → in_progress
 *     → completed → customer_confirmed → rated → closed
 *   (cancelled / disputed can branch off at any active stage)
 *
 * Matching score weights (configurable — must mirror match_service_workers SQL):
 *   skills 40 · distance-within-radius 25 · rating 15 · availability 10 · experience 10
 */

export const SERVICE_STATUSES = [
  "requested", "matched", "accepted", "confirmed", "in_progress",
  "completed", "customer_confirmed", "rated", "closed", "cancelled", "disputed",
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

/** Matching engine weights (documented + mirrored in match_service_workers). */
export const MATCH_WEIGHTS = {
  skills: 40,
  distance: 25,
  rating: 15,
  availability: 10,
  experience: 10,
} as const;
