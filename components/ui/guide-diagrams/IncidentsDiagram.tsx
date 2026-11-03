import { Frame, Text, Tag, LabelPill, measurePillWidth, diagramPalette } from "./kit";

const { INK, MUTED, LINE, PRIMARY } = diagramPalette;

const ROW_TOP = [140, 184, 228];

/** Annotated wireframe of the Incidents page — mirrors IncidentsPage.tsx's status filter row and incidents table. */
export function IncidentsDiagram() {
  const logLabel = "+ Log Incident";
  const logW = measurePillWidth(logLabel, 9, 14);
  const logRight = 660;
  const helpLabel = "?  How this works";
  const helpRight = logRight - logW - 10;

  return (
    <Frame>
      <Text x={20} y={18} size={8} fill={PRIMARY} weight={800} uppercase letterSpacing={0.4}>
        Service Ops
      </Text>
      <Text x={20} y={37} size={17} weight={800}>
        Incidents
      </Text>
      <Text x={20} y={52} size={9} fill={MUTED}>
        Accidents, breakdowns, delays &amp; safety issues
      </Text>

      <LabelPill x={helpRight} y={14} h={26} anchor="end" fill="#ffffff" stroke={LINE} textFill={INK} label={helpLabel} size={9} />
      <LabelPill x={logRight} y={14} h={26} anchor="end" fill={PRIMARY} textFill="#ffffff" label={logLabel} size={9} />

      <Tag x={20} y={60} label="STATUS FILTER" />
      <LabelPill x={20} y={80} h={22} anchor="start" fill={PRIMARY} textFill="#ffffff" label="All" size={8.5} padX={11} />
      <LabelPill x={64} y={80} h={22} anchor="start" fill="#f1f5f9" textFill={INK} label="Open" size={8.5} padX={11} />
      <LabelPill x={120} y={80} h={22} anchor="start" fill="#f1f5f9" textFill={INK} label="Investigating" size={8.5} padX={11} />
      <LabelPill x={232} y={80} h={22} anchor="start" fill="#f1f5f9" textFill={INK} label="Resolved" size={8.5} padX={11} />
      <LabelPill x={316} y={80} h={22} anchor="start" fill="#f1f5f9" textFill={INK} label="Closed" size={8.5} padX={11} />

      <Tag x={660} y={104} label="Click a row to open, reassign, resolve" align="end" />
      <rect x={20} y={140} width={640} height={1} fill={LINE} />
      <Text x={20} y={134} size={7.5} fill={MUTED} weight={700} uppercase>
        Incident
      </Text>
      <Text x={240} y={134} size={7.5} fill={MUTED} weight={700} uppercase>
        Booking
      </Text>
      <Text x={340} y={134} size={7.5} fill={MUTED} weight={700} uppercase>
        Supplier
      </Text>
      <Text x={460} y={134} size={7.5} fill={MUTED} weight={700} uppercase>
        Severity
      </Text>
      <Text x={540} y={134} size={7.5} fill={MUTED} weight={700} uppercase>
        Status
      </Text>

      {/* Row 1 — critical, open */}
      <rect x={20} y={140} width={640} height={38} fill="#fef2f2" opacity={0.4} />
      <Text x={20} y={158} size={9} weight={800}>
        Accident
      </Text>
      <Text x={20} y={171} size={8} fill={MUTED}>
        "Minor collision at pickup point"
      </Text>
      <Text x={240} y={162} size={8.5} fill="#475569">
        Q-2026-0114
      </Text>
      <Text x={340} y={162} size={8.5} fill="#475569">
        City Transfers LLC
      </Text>
      <LabelPill x={460} y={154} h={16} anchor="start" fill="#fee2e2" textFill="#991b1b" label="Critical" size={7} padX={7} />
      <LabelPill x={540} y={154} h={16} anchor="start" fill="#fef2f2" textFill="#dc2626" label="Open" size={7} padX={7} />

      {/* Row 2 — delay, investigating */}
      <rect x={20} y={ROW_TOP[1]} width={640} height={1} fill={LINE} />
      <Text x={20} y={202} size={9} weight={800}>
        Delay
      </Text>
      <Text x={20} y={215} size={8} fill={MUTED}>
        "Vehicle stuck in traffic, 40 min late"
      </Text>
      <Text x={240} y={206} size={8.5} fill="#475569">
        Q-2026-0109
      </Text>
      <Text x={340} y={206} size={8.5} fill="#475569">
        Star Van Hire
      </Text>
      <LabelPill x={460} y={198} h={16} anchor="start" fill="#fffbeb" textFill="#b45309" label="Medium" size={7} padX={7} />
      <LabelPill x={540} y={198} h={16} anchor="start" fill="#fffbeb" textFill="#b45309" label="Investigating" size={7} padX={7} />

      {/* Row 3 — breakdown, resolved */}
      <rect x={20} y={ROW_TOP[2]} width={640} height={1} fill={LINE} />
      <Text x={20} y={246} size={9} weight={800}>
        Breakdown
      </Text>
      <Text x={20} y={259} size={8} fill={MUTED}>
        "Flat tyre, replacement vehicle sent"
      </Text>
      <Text x={240} y={250} size={8.5} fill="#475569">
        Q-2026-0098
      </Text>
      <Text x={340} y={250} size={8.5} fill="#475569">
        City Transfers LLC
      </Text>
      <LabelPill x={460} y={242} h={16} anchor="start" fill="#f1f5f9" textFill="#475569" label="Low" size={7} padX={7} />
      <LabelPill x={540} y={242} h={16} anchor="start" fill="#f0fdf4" textFill="#16a34a" label="Resolved" size={7} padX={7} />
      <rect x={20} y={272} width={640} height={1} fill={LINE} />

      <Tag x={20} y={288} label="Severity includes Critical here — Complaints tops out at High" />
    </Frame>
  );
}
