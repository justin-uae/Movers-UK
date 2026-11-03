import { Frame, Text, Card, Tag, LabelPill, diagramPalette } from "./kit";

const { INK, MUTED, LINE, PRIMARY } = diagramPalette;

type Tab = "confirmed" | "lost" | "completed";

const TABS: { key: Tab; label: string }[] = [
  { key: "confirmed", label: "Confirmed" },
  { key: "lost", label: "Lost" },
  { key: "completed", label: "Completed" },
];

const COPY: Record<Tab, { eyebrow: string; title: string; subtext: string }> = {
  confirmed: {
    eyebrow: "Bookings",
    title: "Confirmed Booking",
    subtext: "Quotes marked as paid, through to job completion by the supplier",
  },
  lost: {
    eyebrow: "Bookings",
    title: "Lost Booking",
    subtext: "Rejected, expired unanswered, or cancelled by staff",
  },
  completed: {
    eyebrow: "Bookings",
    title: "Completed Booking",
    subtext: "Jobs the supplier has marked done",
  },
};

/** Annotated wireframe shared by all three Bookings tabs — mirrors BookingsConfirmedPage / BookingsLostPage / BookingsCompletedPage, which share one BookingTabs strip and one card layout. */
export function BookingsDiagram({ active }: { active: Tab }) {
  const copy = COPY[active];

  return (
    <Frame>
      <Text x={20} y={18} size={8} fill={PRIMARY} weight={800} uppercase letterSpacing={0.4}>
        {copy.eyebrow}
      </Text>
      <Text x={20} y={37} size={17} weight={800}>
        {copy.title}
      </Text>
      <Text x={20} y={52} size={9} fill={MUTED}>
        {copy.subtext}
      </Text>

      <LabelPill x={660} y={14} h={26} anchor="end" fill="#ffffff" stroke={LINE} textFill={INK} label="?  How this works" size={9} />

      <Tag x={20} y={70} label="ONE PIPELINE, THREE TABS" />
      {(() => {
        let x = 20;
        return TABS.map((t) => {
          const active_ = t.key === active;
          const w = t.label.length * 8.5 * 0.62 + 24;
          const el = (
            <LabelPill key={t.key} x={x} y={90} h={24} anchor="start" fill={active_ ? PRIMARY : "#f1f5f9"} textFill={active_ ? "#ffffff" : INK} label={t.label} size={8.5} padX={12} />
          );
          x += w + 8;
          return el;
        });
      })()}

      {active === "confirmed" && (
        <>
          <Card y={128} h={104}>
            <Text x={0} y={8} size={9.5} weight={800}>
              Al Fardan Logistics
            </Text>
            <Text x={0} y={21} size={8} fill={MUTED}>
              Q-2026-0114 · London
            </Text>
            <LabelPill x={608} y={-4} h={18} anchor="end" fill="#eff6ff" textFill="#2563eb" label="Confirmed with supplier" size={7.5} padX={9} />
            <Text x={0} y={40} size={8.5} fill="#475569">
              Croydon → Brighton · 14 Sep
            </Text>
            <Text x={608} y={40} size={9} weight={800} anchor="end">
              £1,250
            </Text>
            <Text x={0} y={54} size={8} fill={MUTED}>
              Assigned to City Transfers LLC
            </Text>
            <LabelPill x={0} y={62} h={20} anchor="start" fill="#ffffff" stroke={LINE} textFill="#475569" label="View job" size={8} padX={10} />
          </Card>
          <Card y={246} h={104}>
            <Text x={0} y={8} size={9.5} weight={800}>
              Continental Freight
            </Text>
            <Text x={0} y={21} size={8} fill={MUTED}>
              Q-2026-0109 · Manchester
            </Text>
            <LabelPill x={608} y={-4} h={18} anchor="end" fill="#f1f5f9" textFill="#475569" label="Awaiting supplier assignment" size={7.5} padX={9} />
            <Text x={0} y={40} size={8.5} fill="#475569">
              London → Manchester · 16 Sep
            </Text>
            <Text x={608} y={40} size={9} weight={800} anchor="end">
              £3,600
            </Text>
            <Text x={0} y={54} size={8} fill={MUTED}>
              Not yet allocated
            </Text>
            <LabelPill x={0} y={62} h={20} anchor="start" fill="#ffffff" stroke={LINE} textFill="#475569" label="View job" size={8} padX={10} />
          </Card>
          <Tag x={608} y={358} label="Open a job to allocate a supplier" align="end" />
        </>
      )}

      {active === "lost" && (
        <>
          <Card y={128} h={104}>
            <Text x={0} y={8} size={9.5} weight={800}>
              Marina Events Co.
            </Text>
            <Text x={0} y={21} size={8} fill={MUTED}>
              Q-2026-0087
            </Text>
            <LabelPill x={608} y={-4} h={18} anchor="end" fill="#fef2f2" textFill="#dc2626" label="Rejected" size={7.5} padX={9} />
            <Text x={0} y={40} size={8.5} fill="#475569">
              Leeds → York · 3 Sep
            </Text>
            <Text x={608} y={40} size={9} weight={800} anchor="end">
              £890
            </Text>
            <Text x={0} y={54} size={8} fill={MUTED}>
              Price too high — went with a competitor
            </Text>
            <LabelPill x={0} y={62} h={20} anchor="start" fill="#ffffff" stroke={LINE} textFill="#475569" label="View quote" size={8} padX={10} />
          </Card>
          <Card y={246} h={104}>
            <Text x={0} y={8} size={9.5} weight={800}>
              Desert Rose Tours
            </Text>
            <Text x={0} y={21} size={8} fill={MUTED}>
              Q-2026-0098
            </Text>
            <LabelPill x={608} y={-4} h={18} anchor="end" fill="#f1f5f9" textFill="#475569" label="Expired" size={7.5} padX={9} />
            <Text x={0} y={40} size={8.5} fill="#475569">
              Reading → Slough · 9 Sep
            </Text>
            <Text x={608} y={40} size={9} weight={800} anchor="end">
              £890
            </Text>
            <Text x={0} y={54} size={8} fill={MUTED}>
              Expired 10 Sep, 09:00 — never actioned
            </Text>
            <LabelPill x={0} y={62} h={20} anchor="start" fill="#ffffff" stroke={LINE} textFill="#475569" label="View quote" size={8} padX={10} />
          </Card>
          <Tag x={608} y={358} label="Reason shown when the customer gave one" align="end" />
        </>
      )}

      {active === "completed" && (
        <>
          <Card y={128} h={104}>
            <Text x={0} y={8} size={9.5} weight={800}>
              Al Fardan Logistics
            </Text>
            <Text x={0} y={21} size={8} fill={MUTED}>
              Q-2026-0071 · London
            </Text>
            <LabelPill x={608} y={-4} h={18} anchor="end" fill="#f0fdf4" textFill="#16a34a" label="Completed" size={7.5} padX={9} />
            <Text x={0} y={40} size={8.5} fill="#475569">
              Supplier: City Transfers LLC
            </Text>
            <Text x={608} y={40} size={9} weight={800} anchor="end">
              £1,100
            </Text>
            <Text x={0} y={54} size={8} fill={MUTED}>
              Completed 12 Sep, 18:40
            </Text>
            <LabelPill x={0} y={62} h={20} anchor="start" fill="#ffffff" stroke={LINE} textFill="#475569" label="View job" size={8} padX={10} />
          </Card>
          <Card y={246} h={104}>
            <Text x={0} y={8} size={9.5} weight={800}>
              Continental Freight
            </Text>
            <Text x={0} y={21} size={8} fill={MUTED}>
              Q-2026-0065 · Manchester
            </Text>
            <LabelPill x={608} y={-4} h={18} anchor="end" fill="#f0fdf4" textFill="#16a34a" label="Completed" size={7.5} padX={9} />
            <Text x={0} y={40} size={8.5} fill="#475569">
              Supplier: Star Van Hire
            </Text>
            <Text x={608} y={40} size={9} weight={800} anchor="end">
              £2,950
            </Text>
            <Text x={0} y={54} size={8} fill={MUTED}>
              Completed 8 Sep, 21:05
            </Text>
            <LabelPill x={0} y={62} h={20} anchor="start" fill="#ffffff" stroke={LINE} textFill="#475569" label="View job" size={8} padX={10} />
          </Card>
          <Tag x={608} y={358} label="Nothing left to do — history only" align="end" />
        </>
      )}
    </Frame>
  );
}
