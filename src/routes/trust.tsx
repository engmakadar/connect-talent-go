import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldCheck, Lock, Database, Mail, FileText, UserCheck } from "lucide-react";
import { SiteHeader, SiteFooter } from "@/components/site-chrome";

export const Route = createFileRoute("/trust")({
  component: TrustPage,
  head: () => ({
    meta: [
      { title: "Trust & Security | SahanJob" },
      { name: "description", content: "How SahanJob protects your data, manages access, and handles privacy." },
    ],
  }),
});

function TrustPage() {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <SiteHeader />
      <main className="flex-1">
        <section className="bg-hero-band/40 border-b border-black/5 py-12">
          <div className="mx-auto max-w-4xl px-6">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary mb-4">
              <ShieldCheck className="h-3.5 w-3.5" /> Trust Center
            </div>
            <h1 className="font-serif text-3xl md:text-4xl font-bold tracking-tight text-ink mb-3">
              Security &amp; Privacy at SahanJob
            </h1>
            <p className="text-sm md:text-base text-ink-soft max-w-2xl">
              This page is maintained by SahanJob to answer common security and privacy questions about
              our platform. It describes practices we have enabled today; it is not an independent certification.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-4xl px-6 py-12 space-y-8">
          <Card icon={<Lock className="h-5 w-5" />} title="Authentication & access">
            <p>
              Accounts are protected by email and password or Google sign-in. Sessions are
              stored only in your browser. Administrative actions require an explicit Super Admin role
              and are recorded in an audit log.
            </p>
          </Card>

          <Card icon={<UserCheck className="h-5 w-5" />} title="Who can see what">
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Your profile (email, phone, KYC) is visible only to you, your company co-workers, and platform administrators.</li>
              <li>Company KYC documents, contact details, and registration numbers are never exposed publicly — only verified company name, logo, location, and description appear on public listings.</li>
              <li>Job application emails are shown to signed-in visitors only; anonymous visitors see the in-app apply flow.</li>
              <li>Subscription and billing records are visible only to the account owner and administrators.</li>
            </ul>
          </Card>

          <Card icon={<Database className="h-5 w-5" />} title="Data protection">
            <p>
              Data is stored on the managed SahanJob backend with row-level security enforced on every table.
              Tender documents are kept in a private storage bucket and served only via short-lived signed links to the
              owning company and administrators. Company logos are public assets served via direct URLs.
            </p>
          </Card>

          <Card icon={<FileText className="h-5 w-5" />} title="Data you control">
            <p>
              You can update your profile, resume, and company information at any time from your account settings.
              To request export or deletion of your data, contact us using the address below.
            </p>
          </Card>

          <Card icon={<Mail className="h-5 w-5" />} title="Report a security issue">
            <p>
              If you believe you have found a vulnerability, please email{" "}
              <a href="mailto:security@sahanjob.com" className="text-primary underline font-semibold">
                security@sahanjob.com
              </a>{" "}
              with steps to reproduce. We aim to acknowledge reports within 3 business days.
            </p>
          </Card>

          <div className="rounded-2xl bg-secondary/40 p-6 ring-1 ring-black/5 text-sm text-ink-soft">
            This page is editable content maintained by SahanJob and is not an independent certification.
            See our <Link to="/" className="text-primary underline">homepage</Link> for the latest product information.
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

function Card({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-card p-6 ring-1 ring-black/5">
      <h2 className="font-serif text-lg font-semibold text-ink mb-3 flex items-center gap-3">
        <span className="inline-grid place-items-center h-9 w-9 rounded-full bg-primary-soft text-primary">{icon}</span>
        {title}
      </h2>
      <div className="text-sm text-ink-soft space-y-2 leading-relaxed">{children}</div>
    </div>
  );
}
