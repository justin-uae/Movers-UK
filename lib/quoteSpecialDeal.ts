/** Statuses a Special Deal can be given on — anything not yet accepted, paid or cancelled. Rejected/expired quotes are re-opened by it (lib/quoteRepricing.ts). */
export const SPECIAL_DEAL_STATUSES: string[] = ["draft", "sent", "viewed", "rejected", "expired"];
