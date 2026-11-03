import { Frame, Text, LabelPill, diagramPalette } from "./kit";

const { INK, MUTED, LINE, PRIMARY } = diagramPalette;

/** Annotated wireframe of Time & attendance — mirrors AttendancePage.tsx's clock card, team status table and recent-days history. */
export function AttendanceDiagram() {
  return (
    <Frame>
      <Text x={20} y={18} size={8} fill={PRIMARY} weight={800} uppercase letterSpacing={0.4}>
        People Operations
      </Text>
      <Text x={20} y={37} size={17} weight={800}>
        Time &amp; attendance
      </Text>
      <Text x={20} y={52} size={9} fill={MUTED}>
        Clock in, take breaks and clock out — active time is tracked automatically
      </Text>

      <LabelPill x={660} y={14} h={26} anchor="end" fill="#ffffff" stroke={LINE} textFill={INK} label="?  How this works" size={9} />

      {/* Left — your own clock card */}
      <rect x={20} y={68} width={220} height={190} rx={16} fill="#ffffff" stroke={LINE} />
      <circle cx={130} cy={118} r={30} fill="#f0fdf4" />
      <Text x={130} y={124} size={9} weight={800} fill="#16a34a" anchor="middle">
        Working
      </Text>
      <Text x={130} y={160} size={12} weight={800} anchor="middle">
        Working
      </Text>
      <Text x={130} y={175} size={8} fill={MUTED} anchor="middle">
        3h 12m today
      </Text>
      <LabelPill x={65} y={195} h={22} anchor="start" fill="#f1f5f9" textFill={INK} label="Break" size={7.5} padX={9} />
      <LabelPill x={155} y={195} h={22} anchor="start" fill="#0f172a" textFill="#ffffff" label="Clock out" size={7.5} padX={9} />

      {/* Right — today's team overview */}
      <Text x={260} y={80} size={10} weight={800}>
        Today's attendance overview
      </Text>
      <Text x={260} y={94} size={8} fill={MUTED}>
        Live team status
      </Text>
      <rect x={260} y={108} width={400} height={1} fill={LINE} />
      <Text x={260} y={124} size={7.5} fill={MUTED} weight={700} uppercase>
        User
      </Text>
      <Text x={410} y={124} size={7.5} fill={MUTED} weight={700} uppercase>
        Active time
      </Text>
      <Text x={500} y={124} size={7.5} fill={MUTED} weight={700} uppercase>
        Status
      </Text>

      <Text x={260} y={148} size={9} weight={700}>
        Priya Nair
      </Text>
      <Text x={410} y={148} size={8.5} fill="#475569">
        2h 40m
      </Text>
      <LabelPill x={500} y={138} h={16} anchor="start" fill="#f0fdf4" textFill="#16a34a" label="Working" size={7} padX={7} />
      <rect x={260} y={160} width={400} height={1} fill={LINE} />

      <Text x={260} y={182} size={9} weight={700}>
        Omar Khalid
      </Text>
      <Text x={410} y={182} size={8.5} fill="#475569">
        0h 45m
      </Text>
      <LabelPill x={500} y={172} h={16} anchor="start" fill="#fffbeb" textFill="#b45309" label="On break" size={7} padX={7} />
      <rect x={260} y={194} width={400} height={1} fill={LINE} />

      <Text x={260} y={216} size={9} weight={700}>
        Layla Haddad
      </Text>
      <Text x={410} y={216} size={8.5} fill="#94a3b8">
        —
      </Text>
      <LabelPill x={500} y={206} h={16} anchor="start" fill="#f1f5f9" textFill="#64748b" label="Not clocked in" size={7} padX={7} />

      {/* Recent days */}
      <Text x={20} y={288} size={10} weight={800}>
        Your recent days
      </Text>
      <Text x={20} y={302} size={8} fill={MUTED}>
        Clock-in, clock-out and active time, grouped by day
      </Text>
      <rect x={20} y={316} width={640} height={1} fill={LINE} />
      <Text x={20} y={332} size={7.5} fill={MUTED} weight={700} uppercase>
        Date
      </Text>
      <Text x={200} y={332} size={7.5} fill={MUTED} weight={700} uppercase>
        Clock in
      </Text>
      <Text x={320} y={332} size={7.5} fill={MUTED} weight={700} uppercase>
        Clock out
      </Text>
      <Text x={440} y={332} size={7.5} fill={MUTED} weight={700} uppercase>
        Active time
      </Text>

      <Text x={20} y={356} size={9} weight={700}>
        Mon 14 Sep 2026
      </Text>
      <Text x={200} y={356} size={8.5} fill="#475569">
        08:58
      </Text>
      <Text x={320} y={356} size={8.5} fill="#475569">
        17:32
      </Text>
      <Text x={440} y={356} size={8.5} fill="#475569">
        8h 21m
      </Text>
      <rect x={20} y={368} width={640} height={1} fill={LINE} />

      <Text x={20} y={390} size={9} weight={700}>
        Sun 13 Sep 2026
      </Text>
      <Text x={200} y={390} size={8.5} fill="#475569">
        09:04
      </Text>
      <Text x={320} y={390} size={8.5} fill="#94a3b8">
        —
      </Text>
      <Text x={440} y={390} size={8.5} fill="#dc2626">
        Incomplete
      </Text>
    </Frame>
  );
}
