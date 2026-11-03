import { Frame, Text, LabelPill, Tag, diagramPalette } from "./kit";

const { INK, MUTED, LINE, PRIMARY } = diagramPalette;

function ProgressBar({ x, y, w, pct, label, value }: { x: number; y: number; w: number; pct: number; label: string; value: string }) {
  return (
    <g>
      <Text x={x} y={y} size={9} weight={700}>
        {label}
      </Text>
      <Text x={x + w} y={y} size={8.5} fill={MUTED} anchor="end">
        {value}
      </Text>
      <rect x={x} y={y + 8} width={w} height={7} rx={3.5} fill="#f1f5f9" />
      <rect x={x} y={y + 8} width={w * pct} height={7} rx={3.5} fill={pct >= 1 ? "#16a34a" : PRIMARY} />
    </g>
  );
}

/** Annotated wireframe of KPIs & Targets — mirrors KpisPage.tsx's month switcher, My targets progress bars, Leaderboard table and Manage targets list. */
export function KpisDiagram() {
  return (
    <Frame>
      <Text x={20} y={18} size={8} fill={PRIMARY} weight={800} uppercase letterSpacing={0.4}>
        Performance
      </Text>
      <Text x={20} y={37} size={17} weight={800}>
        KPIs &amp; Targets
      </Text>
      <Text x={20} y={52} size={9} fill={MUTED}>
        Individual monthly targets, tracked against real revenue, profit, quotes and bookings
      </Text>

      <LabelPill x={470} y={14} h={26} anchor="end" fill="#ffffff" stroke={LINE} textFill={INK} label="?  How this works" size={9} />
      <LabelPill x={660} y={14} h={26} anchor="end" fill="#ffffff" stroke={LINE} textFill={INK} label="◂  September 2026  ▸" size={8.5} />

      <Text x={20} y={78} size={10} weight={800}>
        My targets
      </Text>
      <ProgressBar x={20} y={100} w={640} pct={0.72} label="Revenue" value="£18,200 of £25,000" />
      <ProgressBar x={20} y={130} w={640} pct={1} label="Quotes Sent" value="44 of 40" />

      <rect x={20} y={168} width={640} height={1} fill={LINE} />
      <Text x={20} y={188} size={10} weight={800}>
        Leaderboard
      </Text>
      <LabelPill x={660} y={180} h={22} anchor="end" fill="#ffffff" stroke={LINE} textFill={INK} label="Rank by Revenue ▾" size={7.5} padX={9} />

      <rect x={20} y={202} width={640} height={1} fill={LINE} />
      <Text x={20} y={218} size={7.5} fill={MUTED} weight={700} uppercase>
        Person
      </Text>
      <Text x={220} y={218} size={7.5} fill={MUTED} weight={700} uppercase>
        Revenue
      </Text>
      <Text x={340} y={218} size={7.5} fill={MUTED} weight={700} uppercase>
        Quotes Sent
      </Text>
      <Text x={460} y={218} size={7.5} fill={MUTED} weight={700} uppercase>
        Paid Bookings
      </Text>
      <Text x={580} y={218} size={7.5} fill={MUTED} weight={700} uppercase>
        Conversion
      </Text>

      <Text x={20} y={242} size={9} weight={800}>
        #1  Priya Nair
      </Text>
      <Text x={220} y={242} size={8.5} fill="#475569">
        £18,200
      </Text>
      <Text x={340} y={242} size={8.5} fill="#475569">
        44
      </Text>
      <Text x={460} y={242} size={8.5} fill="#475569">
        12
      </Text>
      <Text x={580} y={242} size={8.5} fill={PRIMARY} weight={700}>
        27%
      </Text>
      <rect x={20} y={254} width={640} height={1} fill={LINE} />

      <Text x={20} y={276} size={9} weight={800}>
        #2  Omar Khalid
      </Text>
      <Text x={220} y={276} size={8.5} fill="#475569">
        £11,050
      </Text>
      <Text x={340} y={276} size={8.5} fill="#475569">
        31
      </Text>
      <Text x={460} y={276} size={8.5} fill="#475569">
        8
      </Text>
      <Text x={580} y={276} size={8.5} fill={PRIMARY} weight={700}>
        26%
      </Text>

      <rect x={20} y={310} width={640} height={1} fill={LINE} />
      <Text x={20} y={330} size={10} weight={800}>
        Manage targets
      </Text>
      <LabelPill x={660} y={320} h={24} anchor="end" fill={PRIMARY} textFill="#ffffff" label="+ Set target" size={8} padX={11} />

      <rect x={20} y={344} width={640} height={40} rx={12} fill="#ffffff" stroke={LINE} />
      <Text x={32} y={362} size={9} weight={700}>
        Priya Nair
      </Text>
      <Text x={32} y={375} size={7.5} fill={MUTED}>
        Revenue · £25,000
      </Text>
      <LabelPill x={620} y={354} h={20} anchor="start" fill="#f1f5f9" textFill={INK} label="Edit" size={7.5} padX={8} />

      <Tag x={20} y={400} label="Leaderboard and Manage targets only show if you manage KPIs" />
    </Frame>
  );
}
