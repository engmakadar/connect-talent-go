import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Worker accepts a job — atomic in the DB, so two workers can never accept the same job. */
export const acceptServiceBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ bookingId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.rpc("accept_service_booking", {
      _booking_id: data.bookingId,
    });
    if (error) throw new Error(error.message);
    return { ok: true, status: row?.status ?? "accepted" };
  });

/** Advance a booking through its lifecycle. Transitions and actor are enforced server-side. */
export const advanceServiceBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ bookingId: z.string().uuid(), status: z.string().min(1) }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: booking, error } = await supabase
      .from("service_bookings")
      .select("id, worker_id, customer_id, status")
      .eq("id", data.bookingId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!booking) throw new Error("Booking not found.");

    const { data: worker } = await supabase
      .from("skill_workers")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    const isCustomer = booking.customer_id === userId;
    const isWorker = !!worker && worker.id === booking.worker_id;
    if (!isCustomer && !isWorker) throw new Error("Forbidden: you are not a party to this booking.");

    // Allowed transitions per actor (accept goes through acceptServiceBooking for the lock).
    const allowed: Record<string, string[]> = isWorker
      ? {
          requested: ["cancelled"],
          matched: ["cancelled"],
          accepted: ["confirmed", "cancelled"],
          confirmed: ["in_progress", "cancelled"],
          in_progress: ["completed"],
        }
      : {
          requested: ["cancelled"],
          matched: ["cancelled"],
          completed: ["customer_confirmed"],
          customer_confirmed: ["closed"],
          rated: ["closed"],
        };

    if (!(allowed[booking.status] ?? []).includes(data.status)) {
      throw new Error(`Cannot move a booking from "${booking.status}" to "${data.status}".`);
    }

    const { error: updErr } = await supabase
      .from("service_bookings")
      .update({ status: data.status })
      .eq("id", booking.id);
    if (updErr) throw new Error(updErr.message);
    return { ok: true, status: data.status };
  });

/** Customer rates a completed job — one rating per job, enforced here and by a unique index. */
export const rateServiceWorker = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({
      bookingId: z.string().uuid(),
      performance: z.number().int().min(1).max(5),
      behaviour: z.number().int().min(1).max(5),
      comment: z.string().max(1000).optional(),
    }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: booking, error } = await supabase
      .from("service_bookings")
      .select("id, worker_id, customer_id, status")
      .eq("id", data.bookingId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!booking || booking.customer_id !== userId) throw new Error("Forbidden: not your booking.");
    if (booking.status !== "completed" && booking.status !== "customer_confirmed") {
      throw new Error("You can only rate a job once it is completed.");
    }

    const { data: existing } = await supabase
      .from("service_reviews")
      .select("id")
      .eq("booking_id", booking.id)
      .maybeSingle();
    if (existing) throw new Error("This job has already been rated.");

    const { error: insErr } = await supabase.from("service_reviews").insert({
      booking_id: booking.id,
      worker_id: booking.worker_id,
      customer_id: userId,
      performance_rating: data.performance,
      behaviour_rating: data.behaviour,
      comment: data.comment?.trim() || null,
    });
    if (insErr) {
      if (insErr.code === "23505") throw new Error("This job has already been rated.");
      throw new Error(insErr.message);
    }

    const { error: updErr } = await supabase
      .from("service_bookings")
      .update({ status: "rated" })
      .eq("id", booking.id);
    if (updErr) throw new Error(updErr.message);
    return { ok: true };
  });

/** Either party opens a dispute on an active booking. */
export const raiseServiceDispute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ bookingId: z.string().uuid(), reason: z.string().min(10).max(2000) }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: booking, error } = await supabase
      .from("service_bookings")
      .select("id, worker_id, customer_id, status")
      .eq("id", data.bookingId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!booking) throw new Error("Booking not found.");

    const { data: worker } = await supabase
      .from("skill_workers")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    const isParty = booking.customer_id === userId || (!!worker && worker.id === booking.worker_id);
    if (!isParty) throw new Error("Forbidden: you are not a party to this booking.");

    const { data: open } = await supabase
      .from("service_disputes")
      .select("id")
      .eq("booking_id", booking.id)
      .neq("status", "resolved")
      .maybeSingle();
    if (open) throw new Error("A dispute is already open for this booking.");

    const { error: insErr } = await supabase.from("service_disputes").insert({
      booking_id: booking.id,
      raised_by: userId,
      reason: data.reason.trim(),
    });
    if (insErr) throw new Error(insErr.message);

    await supabase.from("service_bookings").update({ status: "disputed" }).eq("id", booking.id);
    return { ok: true };
  });

/** Admin moves a dispute through review → decision → resolved, optionally suspending the worker. */
export const resolveServiceDispute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({
      disputeId: z.string().uuid(),
      status: z.enum(["admin_review", "decision", "resolved"]),
      decision: z.string().max(2000).optional(),
      suspendWorker: z.boolean().optional(),
    }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden: admins only.");

    const { data: dispute, error } = await supabase
      .from("service_disputes")
      .select("id, booking_id, status")
      .eq("id", data.disputeId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!dispute) throw new Error("Dispute not found.");

    const { error: updErr } = await supabase
      .from("service_disputes")
      .update({
        status: data.status,
        decision: data.decision?.trim() || null,
        resolved_by: data.status === "resolved" ? userId : null,
      })
      .eq("id", dispute.id);
    if (updErr) throw new Error(updErr.message);

    if (data.suspendWorker) {
      const { data: booking } = await supabase
        .from("service_bookings")
        .select("worker_id")
        .eq("id", dispute.booking_id)
        .maybeSingle();
      if (booking) {
        await supabase.from("skill_workers").update({ suspended: true }).eq("id", booking.worker_id);
      }
    }
    return { ok: true };
  });
