// Single source of truth for the business this CRM is branded for — every
// app title, sidebar/login name, email footer, placeholder and locale
// default reads from here instead of hard-coding text. Safe to import from
// both server and client components (no secrets, no server-only imports).
//
// Values marked "TBC" were not published on https://www.cheapmover.co.uk/
// at the time of rebranding — fill them in once confirmed.

export const BRAND = {
  /** Trading name, shown across the UI and on customer emails. */
  companyName: "Cheap Mover",
  shortName: "Cheap Mover",
  /** Browser tab / app title. */
  appName: "Cheap Mover CRM",
  /** Small caption under the name in the sidebar and on the login page. */
  appTagline: "Enterprise CRM",
  appDescription: "CRM for house removals, man and van, office relocation, packing and storage.",
  /** Name used wherever the AI auto-quote assistant is referred to. */
  aiAssistantName: "Cheap Mover AI",

  /** TBC — no legal entity name is published on the website yet. */
  legalName: "Cheap Mover",
  companyNumber: "TBC",
  vatNumber: "TBC",
  /** TBC — the website lists only the trading/contact address below. */
  registeredAddress: "TBC",
  tradingAddress: "Cameron House, West Drayton, UB7 7QG",

  website: "https://www.cheapmover.co.uk",
  websiteDisplay: "www.cheapmover.co.uk",
  /** Bare domain — used for example email addresses in placeholders. */
  emailDomain: "cheapmover.co.uk",
  contactEmail: "contact@cheapmover.co.uk",
  phone: "0330 113 2111",
  phoneInternational: "+44 330 113 2111",
  whatsapp: "+44 330 113 2111",

  /** Footer line on every outbound template email (lib/emailBranding.ts). */
  emailFooterText: "Cheap Mover · Cameron House, West Drayton, UB7 7QG · 0330 113 2111 · contact@cheapmover.co.uk",

  logoPath: "/images/cheapmover-logo.webp",
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
