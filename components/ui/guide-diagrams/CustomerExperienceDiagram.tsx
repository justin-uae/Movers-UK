import { Frame, Text, Card, Kpi, Tag, LabelPill, diagramPalette } from "./kit";

const { INK, MUTED, LINE, PRIMARY } = diagramPalette;

/** Annotated wireframe of the Customer Experience page — mirrors CustomerExperiencePage.tsx's KPI row, tabs and feedback-card list. */
export function CustomerExperienceDiagram() {
  return (
    <Frame>
      <Text x={20} y={18} size={8} fill={PRIMARY} weight={800} uppercase letterSpacing={0.4}>
        Post-Trip
      </Text>
      <Text x={20} y={37} size={17} weight={800}>
        Customer Experience
      </Text>
      <Text x={20} y={52} size={9} fill={MUTED}>
        One NPS question per completed job, sent automatically
      </Text>

      <LabelPill x={660} y={14} h={26} anchor="end" fill="#ffffff" stroke={LINE} textFill={INK} label="?  How this works" size={9} />

      <Tag x={20} y={60} label="KPI SUMMARY" />
      <Kpi x={20} y={80} w={150} label="NPS Score" value="42" />
      <Kpi x={180} y={80} w={150} label="Response Rate" value="61%" />
      <Kpi x={340} y={80} w={150} label="Complaint Resolution" value="88%" />
      <Kpi x={500} y={80} w={150} label="Repeat Booking" value="34%" />

      <LabelPill x={20} y={148} h={20} anchor="start" fill={PRIMARY} textFill="#ffffff" label="All" size={8} padX={10} />
      <LabelPill x={64} y={148} h={20} anchor="start" fill="#f1f5f9" textFill={INK} label="Happy" size={8} padX={10} />
      <LabelPill x={132} y={148} h={20} anchor="start" fill="#f1f5f9" textFill={INK} label="Neutral" size={8} padX={10} />
      <LabelPill x={210} y={148} h={20} anchor="start" fill="#f1f5f9" textFill={INK} label="Unhappy" size={8} padX={10} />
      <rect x={460} y={148} width={200} height={20} rx={9} fill="#ffffff" stroke={LINE} />
      <Text x={470} y={162} size={8} fill={MUTED}>
        Search by customer or comment…
      </Text>

      <Card y={186} h={92}>
        <Text x={0} y={8} size={9.5} weight={800}>
          Al Fardan Logistics
        </Text>
        <Text x={0} y={21} size={8} fill={MUTED}>
          Q-2026-0114
        </Text>
        <LabelPill x={608} y={-4} h={18} anchor="end" fill="#f0fdf4" textFill="#16a34a" label="9 · Happy" size={7.5} padX={9} />
        <Text x={0} y={40} size={8.5} fill="#475569">
          "Driver was excellent, right on time."
        </Text>
        <Text x={608} y={56} size={7.5} fill={MUTED} anchor="end">
          Requested 3 days ago
        </Text>
      </Card>

      <Card y={294} h={92}>
        <Text x={0} y={8} size={9.5} weight={800}>
          Desert Rose Tours
        </Text>
        <Text x={0} y={21} size={8} fill={MUTED}>
          Q-2026-0098
        </Text>
        <LabelPill x={608} y={-4} h={18} anchor="end" fill="#fef2f2" textFill="#dc2626" label="3 · Unhappy" size={7.5} padX={9} />
        <Text x={0} y={40} size={8.5} fill="#475569">
          "Vehicle arrived 25 minutes late."
        </Text>
        <LabelPill x={0} y={48} h={16} anchor="start" fill="#fef2f2" textFill="#dc2626" label="Follow-up task open" size={7} padX={7} />
      </Card>

      <Tag x={660} y={396} label="Low score → escalates to a follow-up task" align="end" />
    </Frame>
  );
}
