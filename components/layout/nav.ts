import {
  LayoutDashboard,
  Users,
  FileText,
  CalendarDays,
  CalendarX2,
  CalendarCheck2,
  Bus,
  Building2,
  Mail,
  MessageCircle,
  Phone,
  WalletCards,
  BadgeDollarSign,
  Clock3,
  BarChart3,
  FolderKanban,
  Target,
  Wallet,
  MessagesSquare,
  ListTodo,
  Star,
  Truck,
  MessageSquareWarning,
  TriangleAlert,
  Settings,
  CreditCard,
  type LucideIcon,
} from "lucide-react";
import { PERMISSIONS, type PermissionKey } from "@/lib/permissionKeys";

/**
 * UI-NAV-01 — the sidebar is grouped into these 7 sections (plus Control
 * Centre, pinned above every group as the one ungrouped item — it's a
 * dashboard home, not a member of any single section). Order here is the
 * order groups render in.
 */
export type NavGroupKey = "sales" | "operations" | "communications" | "finance" | "people" | "insights" | "administration";

export const NAV_GROUP_ORDER: NavGroupKey[] = [
  "sales",
  "operations",
  "communications",
  "finance",
  "people",
  "insights",
  "administration",
];

export const NAV_GROUP_LABELS: Record<NavGroupKey, string> = {
  sales: "Sales",
  operations: "Operations",
  communications: "Communications",
  finance: "Finance",
  people: "People",
  insights: "Insights",
  administration: "Administration",
};

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /**
   * Shown if the user holds ANY of these permission keys. Omitted entirely
   * (undefined) means universally visible. Every role holds
   * general.workspace_access except Finance Manager (whose access is
   * deliberately scoped to exactly the Accounting pages), so "universal"
   * items use that key rather than being left ungated.
   */
  anyOf?: PermissionKey[];
  /**
   * Hidden from everyone but Master Admin, full stop — checked independently
   * of anyOf. Master Admin's permission bypass (getGrantedPermissions
   * returns every key) means anyOf alone can never express "Master Admin
   * only": any key picked to gate it would also have to never be granted to
   * any role, which is fragile and non-obvious. Used sparingly, for tooling
   * that's genuinely Master-Admin-specific rather than permission-gated.
   */
  masterAdminOnly?: boolean;
  /** Which sidebar group this renders under. Omitted only for Control Centre, which is pinned above every group. */
  group?: NavGroupKey;
}

const WORKSPACE = [PERMISSIONS.GENERAL_WORKSPACE_ACCESS];

export const NAV: NavItem[] = [
  { label: "Control Centre", href: "/dashboard", icon: LayoutDashboard, anyOf: WORKSPACE },
  {
    label: "Customer Leads",
    href: "/leads",
    icon: Users,
    group: "sales",
    anyOf: [
      PERMISSIONS.ENQUIRIES_VIEW_OWN,
      PERMISSIONS.ENQUIRIES_VIEW_TEAM,
      PERMISSIONS.ENQUIRIES_VIEW_ALL,
      PERMISSIONS.ENQUIRIES_ADD,
      PERMISSIONS.ENQUIRIES_CLAIM_OPEN_LEADS,
    ],
  },
  {
    label: "Pending Quotes",
    href: "/quotes",
    icon: FileText,
    group: "sales",
    anyOf: [PERMISSIONS.QUOTES_CREATE, PERMISSIONS.QUOTES_VIEW_SELLING_PRICE],
  },
  {
    label: "Partially Paid",
    href: "/quotes/partially-paid",
    icon: Wallet,
    group: "sales",
    // Same gate as Pending Quotes — RLS (can_view_assignment) already scopes
    // the actual rows to "mine" for a plain Sales User vs "everyone's" for
    // enquiries.view_all (Master Admin, Sales Manager), no separate
    // permission needed for the nav item itself.
    anyOf: [PERMISSIONS.QUOTES_CREATE, PERMISSIONS.QUOTES_VIEW_SELLING_PRICE],
  },
  {
    label: "Customers",
    href: "/customers",
    icon: Building2,
    group: "sales",
    anyOf: [
      PERMISSIONS.ENQUIRIES_VIEW_OWN,
      PERMISSIONS.ENQUIRIES_VIEW_TEAM,
      PERMISSIONS.ENQUIRIES_VIEW_ALL,
      PERMISSIONS.BOOKINGS_VIEW,
    ],
  },
  {
    label: "Confirmed Booking",
    href: "/bookings",
    icon: CalendarDays,
    group: "operations",
    anyOf: [PERMISSIONS.BOOKINGS_VIEW, PERMISSIONS.BOOKINGS_VIEW_OWN],
  },
  {
    label: "Lost Booking",
    href: "/bookings/lost",
    icon: CalendarX2,
    group: "operations",
    anyOf: [PERMISSIONS.BOOKINGS_VIEW, PERMISSIONS.BOOKINGS_VIEW_OWN],
  },
  {
    label: "Completed Booking",
    href: "/bookings/completed",
    icon: CalendarCheck2,
    group: "operations",
    anyOf: [PERMISSIONS.BOOKINGS_VIEW, PERMISSIONS.BOOKINGS_VIEW_OWN],
  },
  {
    label: "Dispatch",
    href: "/dispatch",
    icon: Bus,
    group: "operations",
    // Sales roles can also always dispatch a job they personally created
    // (see canDispatch() in app/(staff)/dispatch/actions.ts) — quotes.create
    // is the marker for "this role can end up owning a paid job", so it
    // keeps the nav item consistent with that ownership bypass. bookings.view
    // is here too so Read-Only (and anyone else who can see the Booking
    // tabs) gets a real sidebar match when they click "View job" — read-only
    // visibility into job detail, no write capability (offer/withdraw/
    // transfer stay separately gated at the action layer).
    anyOf: [
      PERMISSIONS.DISPATCH_SEND_MANUAL,
      PERMISSIONS.DISPATCH_USE_ASSISTED,
      PERMISSIONS.DISPATCH_USE_AUTOMATIC,
      PERMISSIONS.QUOTES_CREATE,
      PERMISSIONS.BOOKINGS_VIEW,
    ],
  },
  {
    label: "Suppliers",
    href: "/suppliers",
    icon: Truck,
    group: "operations",
    anyOf: [PERMISSIONS.SUPPLIERS_ADD, PERMISSIONS.SUPPLIERS_VIEW_PERFORMANCE, PERMISSIONS.SUPPLIERS_SEND_JOBS],
  },
  { label: "Documents", href: "/documents", icon: FolderKanban, group: "operations", anyOf: WORKSPACE },
  { label: "Tasks", href: "/tasks", icon: ListTodo, group: "operations", anyOf: WORKSPACE },
  { label: "Customer Experience", href: "/customer-experience", icon: Star, group: "operations", anyOf: WORKSPACE },
  { label: "Complaints", href: "/complaints", icon: MessageSquareWarning, group: "operations", anyOf: WORKSPACE },
  { label: "Incidents", href: "/incidents", icon: TriangleAlert, group: "operations", anyOf: WORKSPACE },
  { label: "Email Centre", href: "/email", icon: Mail, group: "communications", anyOf: WORKSPACE },
  // Sales users see only their own chats (0113_whatsapp_sales_takeover.sql).
  { label: "WhatsApp", href: "/whatsapp", icon: MessageCircle, group: "communications", anyOf: [PERMISSIONS.ENQUIRIES_CLAIM_OPEN_LEADS] },
  { label: "Calls", href: "/calls", icon: Phone, group: "communications", anyOf: WORKSPACE },
  { label: "Team Chat", href: "/team-chat", icon: MessagesSquare, group: "communications", anyOf: WORKSPACE },
  { label: "Accounting", href: "/accounting", icon: WalletCards, group: "finance", anyOf: [PERMISSIONS.FINANCE_VIEW_INVOICES] },
  {
    label: "Customer Payments",
    href: "/accounting/customer-payments",
    icon: WalletCards,
    group: "finance",
    anyOf: [PERMISSIONS.FINANCE_RECORD_PAYMENTS],
  },
  {
    label: "Supplier Payments",
    href: "/accounting/supplier-payments",
    icon: WalletCards,
    group: "finance",
    anyOf: [PERMISSIONS.FINANCE_PAY_SUPPLIERS],
  },
  {
    label: "Commissions",
    href: "/commissions",
    icon: BadgeDollarSign,
    group: "finance",
    anyOf: [PERMISSIONS.FINANCE_VIEW_COMMISSIONS],
  },
  {
    label: "Card Payment Requests",
    href: "/card-payment-requests",
    icon: CreditCard,
    group: "finance",
    // A recurring, time-sensitive action inbox (a customer may be waiting
    // to pay), not one-time configuration — lives in the sidebar rather
    // than buried in Settings, where Master Admin wouldn't think to check
    // it regularly. See the pending-count badge, rendered in Sidebar.tsx.
    // Master Admin only even though it sits under Finance — Finance
    // Manager etc. see the rest of the group but never this item.
    masterAdminOnly: true,
  },
  { label: "Attendance", href: "/attendance", icon: Clock3, group: "people", anyOf: WORKSPACE },
  { label: "KPIs & Targets", href: "/kpis", icon: Target, group: "people", anyOf: WORKSPACE },
  {
    label: "Business Intelligence",
    href: "/business-intelligence",
    icon: BarChart3,
    group: "insights",
    anyOf: [PERMISSIONS.FINANCE_VIEW_PROFIT],
  },
  // AI Optimisation — hidden from the sidebar for now (not ready), route/page left in place for when
  // it's finished. Restore by re-adding the entry below (group: "insights") and importing Bot again:
  // { label: "AI Optimisation", href: "/ai-optimisation", icon: Bot, group: "insights", anyOf: WORKSPACE },
];

/**
 * Settings lives outside NAV/computeVisibleHrefs on purpose — it's gated by
 * ADMIN_SURFACE_PERMISSIONS (a different shape of check than anyOf, see
 * app/(staff)/layout.tsx) and must never become someone's "first visible
 * item" landing page (see defaultLandingHref below). Sidebar renders it as
 * an ordinary Administration-group item using this shared definition rather
 * than a separate footer special-case.
 */
export const SETTINGS_NAV_ITEM: Omit<NavItem, "anyOf"> & { group: "administration" } = {
  label: "Settings",
  href: "/settings",
  icon: Settings,
  group: "administration",
};

export interface NavGroup {
  key: NavGroupKey;
  label: string;
  items: NavItem[];
}

/** Buckets visible items into their groups, in NAV_GROUP_ORDER, dropping any group with nothing visible in it — satisfies "show only items the current role may access" at the group level too, not just per-item. */
export function groupNavItems(items: NavItem[]): NavGroup[] {
  return NAV_GROUP_ORDER.map((key) => ({
    key,
    label: NAV_GROUP_LABELS[key],
    items: items.filter((item) => item.group === key),
  })).filter((group) => group.items.length > 0);
}

/** Every nav href the given permission set unlocks, in NAV order. */
export function computeVisibleHrefs(granted: Set<PermissionKey>, isMasterAdmin = false): string[] {
  return NAV.filter((item) => {
    if (item.masterAdminOnly && !isMasterAdmin) return false;
    return !item.anyOf || item.anyOf.some((key) => granted.has(key));
  }).map((item) => item.href);
}

/** Where to land a signed-in user with no more specific destination in mind — the first nav item they can actually see. */
export function defaultLandingHref(granted: Set<PermissionKey>, isMasterAdmin = false): string {
  return computeVisibleHrefs(granted, isMasterAdmin)[0] ?? "/dashboard";
}

/**
 * A couple of roles have a deliberately different "home" than whatever's
 * first in NAV order — Sales User works out of Leads day-to-day, and
 * Finance Manager's first visible item would be Accounting anyway (nothing
 * before it in NAV is visible to them), but pinning it here keeps that
 * explicit rather than incidental to array order.
 */
const ROLE_LANDING_OVERRIDE: Record<string, string> = {
  "Sales User": "/leads",
  "Finance Manager": "/accounting",
  // AI Created Quotes (a standalone page) was folded back into Pending
  // Quotes — every quote it creates already shows there (or in whichever
  // Bookings tab it's since moved to) with an "AI" badge instead of living
  // on its own list.
  "AI": "/quotes",
};

/** Full landing-page decision: role-specific override (for anyone but Master Admin) falling back to the first visible nav item. */
export function landingHref(roleName: string | null, isMasterAdmin: boolean, granted: Set<PermissionKey>): string {
  if (!isMasterAdmin && roleName && ROLE_LANDING_OVERRIDE[roleName]) {
    return ROLE_LANDING_OVERRIDE[roleName];
  }
  return defaultLandingHref(granted, isMasterAdmin);
}
