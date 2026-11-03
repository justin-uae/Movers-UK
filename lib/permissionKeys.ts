/**
 * Mirrors the `permissions` catalog seeded by
 * supabase/migrations/0001_foundation.sql. Keep in sync with that file —
 * this is only used for typed references in the UI (e.g. gating a button or
 * a sidebar item), the database function `has_permission()` is the actual
 * source of truth enforced by RLS policies.
 *
 * Split out from lib/permissions.ts (which is `server-only`) so
 * Client Components — like components/layout/nav.ts, consumed by the
 * client-rendered Sidebar — can reference permission keys without pulling
 * in server-only code.
 */
export const PERMISSIONS = {
  /** Gate for nav items with no business-data meaning (Dashboard, Attendance, Documents, Email, ...) — every role holds this except Finance Manager, whose access is scoped to exactly the Accounting pages. */
  GENERAL_WORKSPACE_ACCESS: "general.workspace_access",

  ENQUIRIES_VIEW_OWN: "enquiries.view_own",
  ENQUIRIES_VIEW_TEAM: "enquiries.view_team",
  ENQUIRIES_VIEW_ALL: "enquiries.view_all",
  ENQUIRIES_ADD: "enquiries.add",
  ENQUIRIES_EDIT: "enquiries.edit",
  ENQUIRIES_DELETE: "enquiries.delete",
  ENQUIRIES_REASSIGN: "enquiries.reassign",
  ENQUIRIES_CLAIM_OPEN_LEADS: "enquiries.claim_open_leads",
  ENQUIRIES_RETURN_TO_POOL: "enquiries.return_to_pool",

  QUOTES_CREATE: "quotes.create",
  QUOTES_EDIT: "quotes.edit",
  QUOTES_SEND: "quotes.send",
  QUOTES_RESEND: "quotes.resend",
  QUOTES_CANCEL: "quotes.cancel",
  QUOTES_APPLY_DISCOUNTS: "quotes.apply_discounts",
  QUOTES_OVERRIDE_AI_PRICING: "quotes.override_ai_pricing",
  QUOTES_VIEW_SUPPLIER_COST: "quotes.view_supplier_cost",
  QUOTES_VIEW_SELLING_PRICE: "quotes.view_selling_price",
  QUOTES_VIEW_AI_GENERATED: "quotes.view_ai_generated",
  QUOTES_VIEW_MARGIN_ESTIMATED: "quotes.view_margin_estimated",
  QUOTES_VIEW_MARGIN_FINAL: "quotes.view_margin_final",
  QUOTES_APPROVE_LOW_MARGIN: "quotes.approve_low_margin",
  QUOTES_ACCEPT_MANUALLY: "quotes.accept_manually",
  QUOTES_CHANGE_EXPIRY: "quotes.change_expiry",

  BOOKINGS_VIEW: "bookings.view",
  BOOKINGS_VIEW_OWN: "bookings.view_own",
  BOOKINGS_EDIT: "bookings.edit",
  BOOKINGS_CANCEL: "bookings.cancel",
  BOOKINGS_AMEND: "bookings.amend",
  DISPATCH_SEND_MANUAL: "dispatch.send_manual",
  DISPATCH_USE_ASSISTED: "dispatch.use_assisted",
  DISPATCH_USE_AUTOMATIC: "dispatch.use_automatic",
  DISPATCH_OVERRIDE_ALLOCATION: "dispatch.override_allocation",
  DISPATCH_REASSIGN_SUPPLIER: "dispatch.reassign_supplier",
  DISPATCH_REASSIGN_DRIVER: "dispatch.reassign_driver",
  DISPATCH_CONFIRM_COMPLETION: "dispatch.confirm_completion",
  DISPATCH_TRANSFER_SUPPLIER_INVOICE: "dispatch.transfer_supplier_invoice",

  FINANCE_VIEW_INVOICES: "finance.view_invoices",
  FINANCE_CREATE_INVOICES: "finance.create_invoices",
  FINANCE_EDIT_DRAFT_INVOICES: "finance.edit_draft_invoices",
  FINANCE_APPROVE_INVOICES: "finance.approve_invoices",
  FINANCE_VERIFY_BANK_TRANSFERS: "finance.verify_bank_transfers",
  FINANCE_RECORD_PAYMENTS: "finance.record_payments",
  FINANCE_PAY_SUPPLIERS: "finance.pay_suppliers",
  FINANCE_PROCESS_REFUNDS: "finance.process_refunds",
  FINANCE_ISSUE_CREDIT_NOTES: "finance.issue_credit_notes",
  FINANCE_VIEW_BANK_DETAILS: "finance.view_bank_details",
  FINANCE_VIEW_PROFIT: "finance.view_profit",
  FINANCE_VIEW_COMMISSIONS: "finance.view_commissions",
  FINANCE_APPROVE_COMMISSIONS: "finance.approve_commissions",
  FINANCE_EXPORT: "finance.export",

  SUPPLIERS_ADD: "suppliers.add",
  SUPPLIERS_INVITE: "suppliers.invite",
  SUPPLIERS_APPROVE: "suppliers.approve",
  SUPPLIERS_EDIT: "suppliers.edit",
  SUPPLIERS_VIEW_PRICES: "suppliers.view_prices",
  SUPPLIERS_VIEW_PERFORMANCE: "suppliers.view_performance",
  SUPPLIERS_SEND_JOBS: "suppliers.send_jobs",
  SUPPLIERS_SUSPEND: "suppliers.suspend",
  SUPPLIERS_OVERRIDE_EXPIRED_DOCUMENTS: "suppliers.override_expired_documents",

  ADMIN_MANAGE_USERS: "admin.manage_users",
  ADMIN_MANAGE_ROLES: "admin.manage_roles",
  ADMIN_MANAGE_BRANDS: "admin.manage_brands",
  ADMIN_MANAGE_TEMPLATES: "admin.manage_templates",
  ADMIN_MANAGE_ACCOUNTING_SETTINGS: "admin.manage_accounting_settings",
  ADMIN_EXPORT_COMPANY_DATA: "admin.export_company_data",
  ADMIN_VIEW_AUDIT_LOGS: "admin.view_audit_logs",

  COMPLAINTS_MANAGE: "complaints.manage",
  INCIDENTS_MANAGE: "incidents.manage",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/** Any one of these grants entry to /settings — the whole admin surface. */
export const ADMIN_SURFACE_PERMISSIONS: PermissionKey[] = [
  PERMISSIONS.ADMIN_MANAGE_USERS,
  PERMISSIONS.ADMIN_MANAGE_ROLES,
  PERMISSIONS.ADMIN_MANAGE_BRANDS,
  PERMISSIONS.ADMIN_MANAGE_TEMPLATES,
  PERMISSIONS.ADMIN_MANAGE_ACCOUNTING_SETTINGS,
  PERMISSIONS.ADMIN_EXPORT_COMPANY_DATA,
  PERMISSIONS.ADMIN_VIEW_AUDIT_LOGS,
];
