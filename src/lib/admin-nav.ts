import {
  LayoutDashboard, BarChart3, Users, Building2, UserCheck,
  ClipboardCheck, FileText, AlertTriangle, Tags, Sparkles, BookOpen,
  FileCode2, CreditCard, Receipt, FileBarChart, Megaphone, Bell,
  MessageSquare, History, KeyRound, Lock, Settings, Plug, Mail, Palette,
  Plus,
} from "lucide-react";

export type AdminPageKey =
  | "dashboard" | "reports"
  | "all_users" | "employers" | "candidates" | "user_verification"
  | "job_approval" | "job_moderation" | "post_job" | "fraud_detection" | "categories"
  | "ai_matching" | "recommendations" | "cv_parsing"
  | "subscription_plans" | "transactions" | "invoices" | "revenue_analytics"
  | "announcements" | "notifications" | "messaging_center"
  | "audit_logs" | "permissions" | "roles_rbac" | "security_settings"
  | "apis_integrations" | "email_sms" | "branding_settings"
  | "my_resume" | "my_billing" | "my_invoices" | "matched_jobs";

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
      { key: "reports", label: "Reports & Analytics", icon: BarChart3, soon: true },
    ],
  },
  {
    title: "User Management",
    items: [
      { key: "all_users", label: "All Users", to: "/admin/users", icon: Users },
      { key: "employers", label: "Employers (Companies)", to: "/admin/companies", icon: Building2 },
      { key: "candidates", label: "Candidates", to: "/admin/candidates", icon: Users },
      { key: "user_verification", label: "User Verification", icon: UserCheck, soon: true },
    ],
  },
  {
    title: "Job Management",
    items: [
      { key: "post_job", label: "Post a Job / Tender", to: "/admin/post-job", icon: Plus },
      { key: "job_approval", label: "Job Approval", to: "/admin/review", icon: ClipboardCheck },
      { key: "job_moderation", label: "Job Moderation", to: "/admin/jobs", icon: FileText },
      { key: "categories", label: "Categories", to: "/admin/categories", icon: Tags },
      { key: "fraud_detection", label: "Fraud Detection", icon: AlertTriangle, soon: true },
    ],
  },
  {
    title: "AI Management",
    items: [
      { key: "ai_matching", label: "AI Matching Rules", icon: Sparkles, soon: true },
      { key: "recommendations", label: "Recommendations", icon: BookOpen, soon: true },
      { key: "cv_parsing", label: "CV Parsing Models", icon: FileCode2, soon: true },
    ],
  },
  {
    title: "Billing & Revenue",
    items: [
      { key: "subscription_plans", label: "Subscription Plans", to: "/admin/plans", icon: CreditCard },
      { key: "transactions", label: "Transactions", icon: Receipt, soon: true },
      { key: "invoices", label: "Invoices", icon: FileText, soon: true },
      { key: "revenue_analytics", label: "Revenue Analytics", icon: FileBarChart, soon: true },
    ],
  },
  {
    title: "Communication",
    items: [
      { key: "announcements", label: "Announcements", to: "/admin/announcements", icon: Megaphone },
      { key: "notifications", label: "Notifications", icon: Bell, soon: true },
      { key: "messaging_center", label: "Messaging Center", icon: MessageSquare, soon: true },
    ],
  },
  {
    title: "Security",
    items: [
      { key: "audit_logs", label: "Audit Logs", to: "/admin/audit-logs", icon: History },
      { key: "permissions", label: "Permissions", icon: KeyRound, soon: true },
      { key: "roles_rbac", label: "Roles & RBAC", to: "/admin/roles", icon: Lock },
      { key: "security_settings", label: "Security Settings", icon: Settings, soon: true },
    ],
  },
  {
    title: "System Settings",
    items: [
      { key: "apis_integrations", label: "APIs & Integrations", icon: Plug, soon: true },
      { key: "email_sms", label: "Email/SMS Settings", icon: Mail, soon: true },
      { key: "branding_settings", label: "Brand Settings", to: "/admin/branding", icon: Palette },
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
