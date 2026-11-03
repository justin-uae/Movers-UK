import { Frame, Text, Pill, Tag, Kpi, LabelPill, measurePillWidth, diagramPalette } from "./kit";

const { INK, MUTED, LINE, PRIMARY, PRIMARY_SOFT } = diagramPalette;

type QuoteStatusLabel = "Draft" | "Sent" | "Accepted" | "Expired";

const STATUS_STYLES: Record<QuoteStatusLabel, { bg: string; fg: string }> = {
  Draft: { bg: "#f1f5f9", fg: "#475569" },
  Sent: { bg: "#eff6ff", fg: "#2563eb" },
  Accepted: { bg: "#f0fdf4", fg: "#16a34a" },
  Expired: { bg: "#fef2f2", fg: "#dc2626" },
};

function StatusPill({ x, y, label }: { x: number; y: number; label: QuoteStatusLabel }) {
  const s = STATUS_STYLES[label];
  return <LabelPill x={x} y={y} h={18} anchor="start" fill={s.bg} textFill={s.fg} label={label} size={7.5} padX={9} />;
}

const ROW_TOP = [210, 256, 302, 348];

/** Annotated wireframe of the Pending Quotes page — mirrors QuotesPage.tsx's header, KPI row and quotes table. */
export function QuotesDiagram() {
  const addLabel = "+ Add New Quote";
  const addW = measurePillWidth(addLabel, 9, 14);
  const addRight = 660;
  const helpLabel = "?  How this works";
  const helpRight = addRight - addW - 10;

  return (
    <Frame>
      <Text x={20} y={18} size={8} fill={PRIMARY} weight={800} uppercase letterSpacing={0.4}>
        Sales Workspace
      </Text>
      <Text x={20} y={37} size={17} weight={800}>
        Pending Quotes
      </Text>
      <Text x={20} y={52} size={9} fill={MUTED}>
        Draft → Sent → Accepted → paid, or Rejected/Expired → Lost Booking
      </Text>

      <LabelPill x={helpRight} y={14} h={26} anchor="end" fill="#ffffff" stroke={LINE} textFill={INK} label={helpLabel} size={9} />
      <LabelPill x={addRight} y={14} h={26} anchor="end" fill={PRIMARY} textFill="#ffffff" label={addLabel} size={9} />

      <Tag x={20} y={60} label="KPI SUMMARY" />
      <Kpi x={20} y={80} w={150} label="Draft" value="4" />
      <Kpi x={180} y={80} w={150} label="Awaiting response" value="11" />
      <Kpi x={340} y={80} w={150} label="Accepted — unpaid" value="5" />
      <Kpi x={500} y={80} w={150} label="Total quotes (all time)" value="248" />

      <Pill x={20} y={162} w={230} h={22} fill="#ffffff" stroke={LINE} />
      <Text x={32} y={176} size={8.5} fill={MUTED}>
        Search quotes (number or invoice)
      </Text>

      <Tag x={660} y={188} label="View / Copy Link" align="end" />
      <rect x={20} y={210} width={640} height={1} fill={LINE} />
      <Text x={20} y={204} size={7.5} fill={MUTED} weight={700} uppercase>
        Quote
      </Text>
      <Text x={140} y={204} size={7.5} fill={MUTED} weight={700} uppercase>
        Customer
      </Text>
      <Text x={280} y={204} size={7.5} fill={MUTED} weight={700} uppercase>
        Journey
      </Text>
      <Text x={430} y={204} size={7.5} fill={MUTED} weight={700} uppercase>
        Value
      </Text>
      <Text x={500} y={204} size={7.5} fill={MUTED} weight={700} uppercase>
        Status
      </Text>

      {/* Row 1 — sent, copy-link available */}
      <Text x={20} y={238} size={9} weight={800} fill="#c2410c">
        Q-2026-0114
      </Text>
      <Text x={140} y={238} size={9} weight={700}>
        Al Fardan Logistics
      </Text>
      <Text x={280} y={238} size={8.5} fill="#475569">
        Croydon → Brighton
      </Text>
      <Text x={430} y={238} size={9} weight={800}>
        £1,250
      </Text>
      <StatusPill x={500} y={224} label="Sent" />
      <LabelPill x={660} y={222} h={24} anchor="end" fill="#ffffff" stroke={PRIMARY_SOFT} textFill="#c2410c" label="Copy Link" size={8} padX={11} />

      {/* Row 2 — accepted, awaiting payment */}
      <rect x={20} y={ROW_TOP[1]} width={640} height={1} fill={LINE} />
      <Text x={20} y={284} size={9} weight={800} fill="#c2410c">
        Q-2026-0109
      </Text>
      <Text x={140} y={284} size={9} weight={700}>
        Continental Freight
      </Text>
      <Text x={280} y={284} size={8.5} fill="#475569">
        London → Manchester
      </Text>
      <Text x={430} y={284} size={9} weight={800}>
        £3,600
      </Text>
      <StatusPill x={500} y={270} label="Accepted" />
      <LabelPill x={660} y={268} h={24} anchor="end" fill="#ffffff" stroke={LINE} textFill="#475569" label="View" size={8.5} padX={12} />

      {/* Row 3 — draft */}
      <rect x={20} y={ROW_TOP[2]} width={640} height={1} fill={LINE} />
      <Text x={20} y={330} size={9} weight={800} fill="#c2410c">
        Q-2026-0121
      </Text>
      <Text x={140} y={330} size={9} weight={700}>
        Marina Events Co.
      </Text>
      <Text x={280} y={330} size={8.5} fill="#475569">
        Leeds → York
      </Text>
      <Text x={430} y={330} size={9} weight={800} fill="#94a3b8">
        —
      </Text>
      <StatusPill x={500} y={316} label="Draft" />
      <LabelPill x={660} y={314} h={24} anchor="end" fill="#ffffff" stroke={LINE} textFill="#475569" label="View" size={8.5} padX={12} />

      {/* Row 4 — expired -> lost booking */}
      <rect x={20} y={ROW_TOP[3]} width={640} height={1} fill={LINE} />
      <Text x={20} y={376} size={9} weight={800} fill="#c2410c">
        Q-2026-0098
      </Text>
      <Text x={140} y={376} size={9} weight={700}>
        Desert Rose Tours
      </Text>
      <Text x={280} y={376} size={8.5} fill="#475569">
        Reading → Slough
      </Text>
      <Text x={430} y={376} size={9} weight={800}>
        £890
      </Text>
      <StatusPill x={500} y={362} label="Expired" />
      <LabelPill x={660} y={360} h={24} anchor="end" fill="#ffffff" stroke={LINE} textFill="#475569" label="View" size={8.5} padX={12} />
      <rect x={20} y={394} width={640} height={1} fill={LINE} />

      <Tag x={430} y={408} label="Draft → Sent → Accepted → paid" />
    </Frame>
  );
}
