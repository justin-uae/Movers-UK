// Sample data for modules whose backend lands in a later phase (AI
// Optimisation, BI). Ported from the original design prototype
// (legacy-prototype/src/main.jsx) so the visual system stays identical while
// the schema/API for these modules is built out. Control Centre now renders
// entirely from lib/controlCentreSummary.ts (real data) — its former demo
// arrays (revenueData, channelData, CHANNEL_COLORS, teamPerformance,
// seedLeads/DemoLead) have been removed. Never treat this as production data
// (Part 42).

import { BRAND } from "@/lib/brandConfig";

export const commissionLifecycle = [
  "Job completed",
  "Supplier costs final",
  "Margin calculated",
  "Manager approved",
  "Payroll paid",
];

export const optimisationCards: [string, string, string, "High" | "Medium"][] = [
  ["Revenue opportunity", "Increase London house-removal prices by 4%.", "£42,000 annual impact", "High"],
  ["Lead rescue", "Reassign three high-value leads with no activity.", "£31,500 pipeline", "High"],
  ["Supplier saving", "Shift 18% of London work to two better-value compliant suppliers.", "£67,800 annual saving", "Medium"],
  ["Customer retention", "Contact 14 high-value dormant corporate customers.", "£186,000 potential revenue", "Medium"],
];

export const revenueForecast = [
  { m: "Jan", a: 1.1, f: 1.05 },
  { m: "Feb", a: 1.24, f: 1.2 },
  { m: "Mar", a: 1.38, f: 1.32 },
  { m: "Apr", a: 1.52, f: 1.48 },
  { m: "May", a: 1.69, f: 1.64 },
  { m: "Jun", a: 1.82, f: 1.78 },
  { m: "Jul", a: 1.94, f: 2.02 },
];

export const profitByBrand = [
  { n: BRAND.companyName, v: 186 },
  { n: "Man & Van London", v: 142 },
  { n: "Express Removals", v: 98 },
  { n: "Storage Plus", v: 66 },
];

export const money = new Intl.NumberFormat(BRAND.locale, {
  style: "currency",
  currency: BRAND.defaultCurrency,
  maximumFractionDigits: 0,
});
