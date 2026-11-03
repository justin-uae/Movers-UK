"use client";

import Link from "next/link";
import { PageGuide } from "@/components/ui/PageGuide";
import { BookingsDiagram } from "@/components/ui/guide-diagrams/BookingsDiagram";

const TABS = [
  { key: "confirmed", href: "/bookings", label: "Confirmed" },
  { key: "lost", href: "/bookings/lost", label: "Lost" },
  { key: "completed", href: "/bookings/completed", label: "Completed" },
] as const;

const BOOKINGS_GUIDE_SECTIONS = [
  {
    heading: "What this pipeline is",
    body: [
      "Confirmed, Lost and Completed Booking are one pipeline shown as three tabs, not three separate lists. A quote lands here the moment a customer's payment is confirmed on Customer Payments.",
    ],
  },
  {
    heading: "How a booking moves through the tabs",
    bullets: true,
    body: [
      "Confirmed Booking — paid and waiting on the supplier, from unassigned through to the job being done.",
      "Lost Booking — the quote was rejected, expired unanswered, or a booking was cancelled by staff before payment. Open-pool leads nobody claimed before their pickup date passed also land here, marked Expired lead.",
      "Completed Booking — the supplier has marked the job done. This is history only, nothing left to action.",
    ],
  },
  {
    heading: "Working from here",
    bullets: true,
    body: [
      "View job / View quote opens the full detail — pricing, supplier allocation and activity.",
      "Supplier assignment itself happens on Dispatch, not here — this list is for tracking status, not allocating.",
      "Edit Booking, on the quote or job detail page, stays available for a Confirmed booking — journey details, a customer charge/credit, or a supplier payout adjustment, always with a reason and logged to Edit history. It closes off once the booking lands here in Completed, matching \"nothing left to action.\"",
    ],
  },
];

const BOOKINGS_GUIDE_TITLE = { confirmed: "Confirmed Booking", lost: "Lost Booking", completed: "Completed Booking" } as const;

/** Shared "How this works" guide for all three Bookings tabs — lives here since BookingTabs is the one file all three pages already import. */
export function BookingsGuideButton({ active }: { active: "confirmed" | "lost" | "completed" }) {
  return (
    <PageGuide
      title={BOOKINGS_GUIDE_TITLE[active]}
      subtitle="One booking pipeline, shown as three tabs by where it currently stands."
      screenshot={<BookingsDiagram active={active} />}
      sections={BOOKINGS_GUIDE_SECTIONS}
    />
  );
}

export function BookingTabs({ active }: { active: "confirmed" | "lost" | "completed" }) {
  return (
    <div className="mb-5 flex gap-2">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={
            "rounded-xl px-3 py-2 text-sm font-bold " +
            (t.key === active ? "bg-primary-500 text-white" : "bg-slate-100 text-slate-600")
          }
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
