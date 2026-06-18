import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Check, CreditCard, Smartphone, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { SiteHeader, SiteFooter } from "@/components/site-chrome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription,
} from "@/components/ui/dialog";

import { toast } from "sonner";

export const Route = createFileRoute("/plans")({
  head: () => ({
    meta: [
      { title: "Subscription Plans — SahanJobs" },
      { name: "description", content: "Choose a plan that fits your hiring needs. Pay with card or mobile money." },
      { property: "og:title", content: "Subscription Plans — SahanJobs" },
      { property: "og:description", content: "Transparent pricing for employers and jobseekers." },
    ],
  }),
  component: PlansPage,
});

type Plan = {
  id: string; code: string; name: string; price_cents: number; currency: string;
  billing_interval: string; description: string | null; sort_order: number; audience: string;
};

const PAYMENT_METHODS = [
  { key: "visa", label: "Visa", group: "card", icon: CreditCard },
  { key: "mastercard", label: "Mastercard", group: "card", icon: CreditCard },
  { key: "paypal", label: "PayPal", group: "card", icon: CreditCard },
  { key: "evc", label: "EVC Plus", group: "mobile", icon: Smartphone },
  { key: "zaad", label: "Zaad", group: "mobile", icon: Smartphone },
  { key: "sahal", label: "Sahal", group: "mobile", icon: Smartphone },
  { key: "mpesa", label: "M-Pesa", group: "mobile", icon: Smartphone },
];

function PlansPage() {
  const { isEmployer, isJobseeker, user } = useAuth();
  // Signed-in users are locked to their role. Guests can toggle.
  const lockedAudience: "employer" | "jobseeker" | null = isEmployer
    ? "employer"
    : isJobseeker
    ? "jobseeker"
    : null;
  const [guestAudience, setGuestAudience] = useState<"employer" | "jobseeker">("employer");
  const audience: "employer" | "jobseeker" = lockedAudience ?? guestAudience;

  const { data, isLoading } = useQuery({
    queryKey: ["public-plans", audience],
    queryFn: async (): Promise<Plan[]> => {
      const { data, error } = await supabase
        .from("subscription_plans")
        .select("id, code, name, price_cents, currency, billing_interval, description, sort_order, audience")
        .eq("is_active", true)
        .eq("audience", audience)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data as Plan[];
    },
  });


  return (
    <div className="min-h-screen flex flex-col bg-hero-band/40">
      <SiteHeader />
      <section className="bg-hero-band border-b border-black/5">
        <div className="mx-auto max-w-6xl px-4 md:px-8 py-12 text-center">
          <Badge className="bg-primary/10 text-primary border-0 mb-3">
            <Sparkles className="h-3 w-3 mr-1" /> {audience === "employer" ? "For Employers" : "For Job Seekers"}
          </Badge>
          <h1 className="font-display text-3xl md:text-4xl font-bold text-ink">
            {audience === "employer" ? "Hire smarter with the right plan" : "Stand out and land your next role"}
          </h1>
          <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
            {audience === "employer"
              ? "Post jobs, showcase your brand, and reach top candidates. Pay with card or mobile money — confirmed by our team within 24 hours."
              : "Boost your profile, unlock premium applications, and get noticed faster by employers."}
          </p>
          {!lockedAudience && (
            <div className="mt-6 inline-flex rounded-full bg-white p-1 ring-1 ring-black/10 shadow-sm">
              {(["employer", "jobseeker"] as const).map((a) => (
                <button
                  key={a}
                  onClick={() => setGuestAudience(a)}
                  className={`px-5 py-2 text-sm font-semibold rounded-full transition ${
                    audience === a ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-ink"
                  }`}
                >
                  {a === "employer" ? "Employers" : "Job Seekers"}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>



      <section className="mx-auto w-full max-w-6xl px-4 md:px-8 py-12 flex-1">
        {isLoading ? (
          <div className="grid gap-6 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-96 rounded-2xl bg-white ring-1 ring-black/5 animate-pulse" />
            ))}
          </div>
        ) : !data?.length ? (
          <div className="rounded-2xl bg-white p-16 text-center ring-1 ring-black/5">
            <CreditCard className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground">No plans are available yet. Please check back soon.</p>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-3 lg:grid-cols-3">
            {data.map((p, i) => <PlanCard key={p.id} plan={p} featured={i === 1} />)}
          </div>
        )}
      </section>
      <SiteFooter />
    </div>
  );
}

function PlanCard({ plan, featured }: { plan: Plan; featured?: boolean }) {
  const features = (plan.description ?? "").split(/\r?\n/).filter(Boolean);
  const price = (plan.price_cents / 100).toLocaleString(undefined, { minimumFractionDigits: 0 });
  return (
    <div
      className={`relative rounded-2xl bg-white p-8 ring-1 shadow-sm flex flex-col ${
        featured ? "ring-primary shadow-lg md:scale-[1.03]" : "ring-black/5"
      }`}
    >
      {featured && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-primary-foreground">
          Most popular
        </span>
      )}
      <div>
        <p className="text-xs uppercase tracking-wider font-bold text-muted-foreground">{plan.code}</p>
        <h2 className="font-display text-2xl font-bold text-ink mt-1">{plan.name}</h2>
        <p className="mt-4">
          <span className="text-4xl font-bold text-ink">${price}</span>
          <span className="text-muted-foreground text-sm"> / {plan.billing_interval === "none" ? "one time" : plan.billing_interval}</span>
        </p>
      </div>
      <ul className="mt-6 space-y-2.5 flex-1">
        {features.length === 0 ? (
          <li className="text-sm text-muted-foreground">Full platform access</li>
        ) : features.map((f) => (
          <li key={f} className="flex gap-2 text-sm text-ink">
            <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <SubscribeDialog plan={plan} featured={featured} />
    </div>
  );
}

function SubscribeDialog({ plan, featured }: { plan: Plan; featured?: boolean }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [method, setMethod] = useState(PAYMENT_METHODS[0].key);
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const isFree = plan.price_cents === 0;
  const methodMeta = PAYMENT_METHODS.find((m) => m.key === method)!;

  const reset = () => { setStep(1); setReference(""); setNotes(""); setDone(false); setMethod(PAYMENT_METHODS[0].key); };
  const close = () => { setOpen(false); setTimeout(reset, 200); };

  const submit = async () => {
    if (!user) { toast.error("Please sign in to subscribe."); return; }
    setSaving(true);
    try {
      const { data: prof } = await supabase.from("profiles").select("company_id").eq("id", user.id).maybeSingle();
      const companyId = prof?.company_id ?? null;

      // Free-trial guard: one trial per company. Cannot re-subscribe while a previous trial is still within its month.
      if (isFree) {
        if (!companyId) { toast.error("Link your account to a company before starting a trial."); setSaving(false); return; }
        const { data: existingTrials } = await supabase
          .from("subscriptions")
          .select("trial_ends_at")
          .eq("company_id", companyId)
          .not("trial_ends_at", "is", null)
          .order("trial_ends_at", { ascending: false })
          .limit(1);
        const last = existingTrials?.[0]?.trial_ends_at ? new Date(existingTrials[0].trial_ends_at).getTime() : null;
        if (last && last > Date.now()) {
          toast.error(`A free trial is already active. You can subscribe again after ${new Date(last).toLocaleDateString()}.`);
          setSaving(false);
          return;
        }
        if (last) {
          toast.error("This company has already used its free trial. Please choose a paid plan.");
          setSaving(false);
          return;
        }
      }

      const trialEnds = isFree ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() : null;
      const { error } = await supabase.from("payment_transactions").insert({
        user_id: user.id,
        company_id: companyId,
        plan_id: plan.id,
        amount: plan.price_cents / 100,
        currency: plan.currency,
        method: isFree ? "free_trial" : method,
        reference: reference || null,
        notes: notes || (isFree ? `1-month free trial — ends ${new Date(trialEnds!).toLocaleDateString()}` : null),
        status: isFree ? "approved" : "pending",
      });
      if (error) throw error;
      if (isFree && companyId) {
        await supabase.from("subscriptions").insert({
          company_id: companyId,
          plan: plan.name,
          active: true,
          trial_ends_at: trialEnds,
          valid_until: trialEnds,
        } as never);
      }
      setDone(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to submit");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => v ? setOpen(true) : close()}>
      <DialogTrigger asChild>
        <Button className={`mt-8 w-full h-11 rounded-full font-semibold ${featured ? "bg-primary text-primary-foreground hover:bg-primary/90" : "bg-ink text-white hover:bg-ink/90"}`}>
          {isFree ? "Start free trial" : "Subscribe"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        {done ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Check className="h-5 w-5 text-emerald-600" /> {isFree ? "Trial activated" : "Request submitted"}</DialogTitle>
              <DialogDescription>
                {isFree
                  ? "Your 1-month free trial is active. You can post jobs and add up to 2 team users."
                  : "We received your subscription request. Our team confirms payments within 24 hours."}
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-xl bg-secondary p-4 text-sm space-y-1">
              <p><span className="font-semibold">Plan:</span> {plan.name}</p>
              <p><span className="font-semibold">Amount:</span> ${(plan.price_cents / 100).toFixed(2)} / {plan.billing_interval}</p>
              {!isFree && <p><span className="font-semibold">Method:</span> {methodMeta.label}</p>}
            </div>
            <DialogFooter><Button onClick={close}>Done</Button></DialogFooter>
          </>
        ) : isFree ? (
          <>
            <DialogHeader>
              <DialogTitle>Start your {plan.name} trial</DialogTitle>
              <DialogDescription>1-month free trial. Includes job postings and up to 2 team users.</DialogDescription>
            </DialogHeader>
            <ul className="space-y-2 text-sm py-2">
              <li className="flex gap-2"><Check className="h-4 w-4 text-emerald-600" /> Post jobs immediately</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-emerald-600" /> Add up to 2 internal team users</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-emerald-600" /> Cancel anytime</li>
            </ul>
            <DialogFooter>
              <Button variant="outline" onClick={close}>Cancel</Button>
              <Button onClick={submit} disabled={saving}>{saving ? "Activating…" : "Activate trial"}</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Subscribe to {plan.name}</DialogTitle>
              <DialogDescription>${(plan.price_cents / 100).toFixed(2)} / {plan.billing_interval === "none" ? "one time" : plan.billing_interval}</DialogDescription>
            </DialogHeader>
            <Stepper step={step} steps={["Method", "Details", "Confirm"]} />
            {step === 1 && (
              <div className="space-y-4 py-2">
                <div>
                  <p className="text-xs uppercase tracking-wider font-bold text-muted-foreground mb-2">Card</p>
                  <div className="grid grid-cols-3 gap-2">
                    {PAYMENT_METHODS.filter((m) => m.group === "card").map((m) => <MethodTile key={m.key} m={m} active={method === m.key} onClick={() => setMethod(m.key)} />)}
                  </div>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider font-bold text-muted-foreground mb-2">Mobile money</p>
                  <div className="grid grid-cols-4 gap-2">
                    {PAYMENT_METHODS.filter((m) => m.group === "mobile").map((m) => <MethodTile key={m.key} m={m} active={method === m.key} onClick={() => setMethod(m.key)} />)}
                  </div>
                </div>
              </div>
            )}
            {step === 2 && (
              <div className="space-y-4 py-2">
                <div>
                  <Label>{methodMeta.group === "mobile" ? "Mobile money phone number" : "Card last 4 / PayPal email"}</Label>
                  <Input value={reference} onChange={(e) => setReference(e.target.value)}
                    placeholder={methodMeta.group === "mobile" ? "+252 xxx xxx xxx" : "1234 or your@email.com"} />
                </div>
                <div>
                  <Label>Notes (optional)</Label>
                  <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any reference number or details" />
                </div>
                <p className="text-[11px] text-muted-foreground bg-secondary p-3 rounded-md">
                  Manual confirmation: Our team will contact you within 24 hours to verify payment and activate the plan.
                </p>
              </div>
            )}
            {step === 3 && (
              <div className="space-y-3 py-2">
                <div className="rounded-xl bg-secondary p-4 text-sm space-y-1.5">
                  <Row label="Plan" value={plan.name} />
                  <Row label="Amount" value={`$${(plan.price_cents / 100).toFixed(2)} / ${plan.billing_interval}`} />
                  <Row label="Method" value={methodMeta.label} />
                  {reference && <Row label="Reference" value={reference} />}
                </div>
                <p className="text-xs text-muted-foreground">By submitting, you agree to be contacted for payment verification.</p>
              </div>
            )}
            <DialogFooter>
              {step > 1 && <Button variant="outline" onClick={() => setStep(step - 1)}>Back</Button>}
              {step < 3 && <Button onClick={() => setStep(step + 1)}>Continue</Button>}
              {step === 3 && <Button onClick={submit} disabled={saving}>{saving ? "Submitting…" : "Submit request"}</Button>}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function MethodTile({ m, active, onClick }: { m: typeof PAYMENT_METHODS[number]; active: boolean; onClick: () => void }) {
  const Icon = m.icon;
  return (
    <button onClick={onClick}
      className={`flex flex-col items-center justify-center gap-1.5 rounded-xl p-3 ring-2 transition ${active ? "ring-primary bg-primary/5" : "ring-black/5 hover:ring-black/15 bg-white"}`}>
      <Icon className={`h-5 w-5 ${active ? "text-primary" : "text-muted-foreground"}`} />
      <span className={`text-[11px] font-semibold ${active ? "text-primary" : "text-ink"}`}>{m.label}</span>
    </button>
  );
}

function Stepper({ step, steps }: { step: number; steps: string[] }) {
  return (
    <div className="flex items-center gap-2 my-3">
      {steps.map((s, i) => {
        const idx = i + 1;
        const active = idx === step;
        const done = idx < step;
        return (
          <div key={s} className="flex items-center gap-2 flex-1">
            <div className={`grid h-7 w-7 place-items-center rounded-full text-xs font-bold ${done ? "bg-primary text-primary-foreground" : active ? "bg-primary/15 text-primary ring-2 ring-primary" : "bg-secondary text-muted-foreground"}`}>
              {done ? <Check className="h-3.5 w-3.5" /> : idx}
            </div>
            <span className={`text-xs font-semibold ${active || done ? "text-ink" : "text-muted-foreground"}`}>{s}</span>
            {i < steps.length - 1 && <div className={`h-px flex-1 ${done ? "bg-primary" : "bg-border"}`} />}
          </div>
        );
      })}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-3"><span className="text-muted-foreground">{label}</span><span className="font-medium text-ink">{value}</span></div>;
}
