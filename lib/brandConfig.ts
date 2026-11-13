// Single source of truth for the business this CRM is branded for — every
// app title, sidebar/login name, email footer, placeholder and locale
// default reads from here instead of hard-coding text. Safe to import from
// both server and client components (no secrets, no server-only imports).
//
// Values marked "TBC" were not published on https://www.moversnationwide.co.uk/
// at the time of rebranding — fill them in once confirmed.

export const BRAND = {
  /** Trading name, shown across the UI and on customer emails. */
  companyName: "Movers Nationwide",
  shortName: "Movers Nationwide",
  /** Browser tab / app title. */
  appName: "Movers Nationwide CRM",
  /** Small caption under the name in the sidebar and on the login page. */
  appTagline: "Enterprise CRM",
  appDescription: "CRM for house removals, man and van, office relocation, packing and storage.",
  /** Name used wherever the AI auto-quote assistant is referred to. */
  aiAssistantName: "Movers Nationwide AI",

  legalName: "Movers Nationwide Ltd",
  /** Registered in England and Wales. */
  companyNumber: "13187418",
  vatNumber: "TBC",
  registeredAddress: "Suite 10 Northlight Parade, Nelson, Lancashire, England, BB9 5EG",
  tradingAddress: "Suite 10 Northlight Parade, Nelson, Lancashire, BB9 5EG",

  website: "https://www.moversnationwide.co.uk",
  websiteDisplay: "www.moversnationwide.co.uk",
  /** Bare domain — used for example email addresses in placeholders. */
  emailDomain: "moversnationwide.co.uk",
  contactEmail: "contact@moversnationwide.co.uk",
  phone: "0330 113 2496",
  phoneInternational: "+44 330 113 2496",
  whatsapp: "+44 7739 533807",

  /** Footer line on every outbound template email (lib/emailBranding.ts). */
  emailFooterText: "Movers Nationwide Ltd · Suite 10 Northlight Parade, Nelson, BB9 5EG · 0330 113 2496 · contact@moversnationwide.co.uk",

  /** Navy + gold horizontal logo from moversnationwide.co.uk (759x160). */
  logoPath: "/images/movers-nationwide-logo.svg",
  colors: {
    primary: "#f97316",
    primaryDark: "#ea580c",
    navy: "#172334",
  },

  defaultCurrency: "GBP",
  timeZone: "Europe/London",
  locale: "en-GB",
  dateFormat: "DD/MM/YYYY",
  /** ISO 3166 code for the phone input's fallback dial code. */
  defaultPhoneCountry: "GB",
  /** Example city used in region placeholders. */
  exampleRegion: "London",
} as const;
