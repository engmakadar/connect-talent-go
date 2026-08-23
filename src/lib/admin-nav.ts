import {
  LayoutDashboard, Users, Building2, UserCheck,
  ClipboardCheck, FileText, Tags, Sparkles,
  FileCode2, CreditCard, Receipt, Megaphone, Wrench,
  History, Lock, Palette, Plus,
} from "lucide-react";


export type AdminPageKey =
  | "dashboard" | "reports"
  | "all_users" | "employers" | "candidates" | "user_verification"
  | "job_approval" | "job_moderation" | "post_job" | "applicants" | "fraud_detection" | "categories"
  | "ai_matching" | "recommendations" | "cv_parsing"
  | "skill_workers"
  | "subscription_plans" | "subscriptions_list" | "transactions" | "revenue_analytics"
  | "announcements" | "notifications" | "messaging_center"
  | "audit_logs" | "permissions" | "roles_rbac" | "security_settings"
  | "apis_integrations" | "email_sms" | "branding_settings"
  | "my_resume" | "my_billing" | "matched_jobs";

export interface AdminNavItem {
  key: AdminPageKey;
  label: string;
  to?: string;
  icon: typeof LayoutDashboard;
  soon?: boolean;
}

export interface AdminNavSection {
  title: string;
  items: AdminNavItem[];
}

export const ADMIN_NAV: AdminNavSection[] = [
  {
    title: "Main",
    items: [
      { key: "dashboard", label: "Dashboard & Analytics", to: "/admin/dashboard", icon: LayoutDashboard },
    ],
  },
  {
    title: "User Management",
    items: [
      { key: "all_users", label: "All Users", to: "/admin/users", icon: Users },
      { key: "employers", label: "Employers (Companies)", to: "/admin/companies", icon: Building2 },
      { key: "candidates", label: "Candidates", to: "/admin/candidates", icon: Users },
    ],
  },
  {
    title: "Job Management",
    items: [
      { key: "post_job", label: "Post a Job / Tender", to: "/admin/post-job", icon: Plus },
      { key: "categories", label: "Categories", to: "/admin/categories", icon: Tags },
    ],
  },
  {
    title: "Review",
    items: [
      { key: "job_approval", label: "Job Approval", to: "/admin/review", icon: ClipboardCheck },
      { key: "applicants", label: "Applicants & ATS", to: "/company/applicants", icon: UserCheck },
      { key: "job_moderation", label: "Job Moderation", to: "/admin/jobs", icon: FileText },
    ],
  },

  {
    title: "Services",
    items: [
      { key: "skill_workers", label: "Skill Worker Registration", to: "/admin/skill-workers", icon: Wrench },
    ],
  },
  {
    title: "AI Management",
    items: [
      { key: "cv_parsing", label: "CV Parsing Models", to: "/resume", icon: FileCode2 },
    ],
  },
  {
    title: "Billing & Revenue",
    items: [
      { key: "subscription_plans", label: "Subscription Plans", to: "/admin/plans", icon: CreditCard },
      { key: "subscriptions_list", label: "Subscriptions List", to: "/admin/subscriptions", icon: Receipt },
      { key: "transactions", label: "Transactions & Invoices", to: "/admin/transactions", icon: Receipt },
    ],
  },
  {
    title: "Communication",
    items: [
      { key: "announcements", label: "Announcements", to: "/admin/announcements", icon: Megaphone },
    ],
  },
  {
    title: "Security",
    items: [
      { key: "audit_logs", label: "Audit Logs", to: "/admin/audit-logs", icon: History },
      { key: "roles_rbac", label: "Roles & RBAC", to: "/admin/roles", icon: Lock },
    ],
  },
  {
    title: "System Settings",
    items: [
      { key: "branding_settings", label: "Brand Settings", to: "/admin/branding", icon: Palette },
    ],
  },
  {
    title: "User Tools",
    items: [
      { key: "my_resume", label: "My Resume", to: "/resume", icon: FileText },
      { key: "matched_jobs", label: "Matched Jobs", to: "/matches", icon: Sparkles },
    ],
  },
];


export const ALL_PAGE_KEYS: AdminPageKey[] = ADMIN_NAV.flatMap((s) => s.items.map((i) => i.key));

export function findNavItem(key: AdminPageKey) {
  for (const s of ADMIN_NAV) {
    const i = s.items.find((x) => x.key === key);
    if (i) return i;
  }
  return null;
}

/** First accessible admin page for a user given the page keys they hold. */
export function firstAccessiblePath(canKeys: (key: AdminPageKey) => boolean): string {
  for (const section of ADMIN_NAV) {
    for (const item of section.items) {
      if (item.to && !item.soon && canKeys(item.key)) return item.to;
    }
  }
  return "/jobs";
}
