import { Frame, Text, Tag, LabelPill, measurePillWidth, diagramPalette } from "./kit";

const { INK, MUTED, LINE, PRIMARY } = diagramPalette;

const ROW_TOP = [140, 184, 228];

/** Annotated wireframe of the Complaints page — mirrors ComplaintsPage.tsx's status filter row and complaints table. */
export function ComplaintsDiagram() {
  const fileLabel = "+ File Complaint";
  const fileW = measurePillWidth(fileLabel, 9, 14);
  const fileRight = 660;
  const helpLabel = "?  How this works";
  const helpRight = fileRight - fileW - 10;

  return (
    <Frame>
      <Text x={20} y={18} size={8} fill={PRIMARY} weight={800} uppercase letterSpacing={0.4}>
        Service Ops
      </Text>
      <Text x={20} y={37} size={17} weight={800}>
        Complaints
      </Text>
      <Text x={20} y={52} size={9} fill={MUTED}>
        Customer complaints — logged, tracked and resolved
      </Text>

      <LabelPill x={helpRight} y={14} h={26} anchor="end" fill="#ffffff" stroke={LINE} textFill={INK} label={helpLabel} size={9} />
      <LabelPill x={fileRight} y={14} h={26} anchor="end" fill={PRIMARY} textFill="#ffffff" label={fileLabel} size={9} />

      <Tag x={20} y={60} label="STATUS FILTER" />
      <LabelPill x={20} y={80} h={22} anchor="start" fill={PRIMARY} textFill="#ffffff" label="All" size={8.5} padX={11} />
      <LabelPill x={64} y={80} h={22} anchor="start" fill="#f1f5f9" textFill={INK} label="Open" size={8.5} padX={11} />
      <LabelPill x={120} y={80} h={22} anchor="start" fill="#f1f5f9" textFill={INK} label="Investigating" size={8.5} padX={11} />
      <LabelPill x={232} y={80} h={22} anchor="start" fill="#f1f5f9" textFill={INK} label="Resolved" size={8.5} padX={11} />
      <LabelPill x={316} y={80} h={22} anchor="start" fill="#f1f5f9" textFill={INK} label="Closed" size={8.5} padX={11} />

      <Tag x={660} y={104} label="Click a row to open, reassign, resolve" align="end" />
      <rect x={20} y={140} width={640} height={1} fill={LINE} />
      <Text x={20} y={134} size={7.5} fill={MUTED} weight={700} uppercase>
        Complaint
      </Text>
      <Text x={260} y={134} size={7.5} fill={MUTED} weight={700} uppercase>
        Customer
      </Text>
      <Text x={400} y={134} size={7.5} fill={MUTED} weight={700} uppercase>
        Severity
      </Text>
      <Text x={480} y={134} size={7.5} fill={MUTED} weight={700} uppercase>
        Status
      </Text>
      <Text x={560} y={134} size={7.5} fill={MUTED} weight={700} uppercase>
        Assigned
      </Text>

      {/* Row 1 — open, high severity */}
      <rect x={20} y={140} width={640} height={38} fill="#fef2f2" opacity={0.4} />
      <Text x={20} y={158} size={9} weight={800}>
        Driver behaviour
      </Text>
      <Text x={20} y={171} size={8} fill={MUTED}>
        "Driver was rude and drove aggressively"
      </Text>
      <Text x={260} y={162} size={8.5} fill="#475569">
        Al Fardan Logistics
      </Text>
      <LabelPill x={400} y={154} h={16} anchor="start" fill="#fef2f2" textFill="#dc2626" label="High" size={7} padX={7} />
      <LabelPill x={480} y={154} h={16} anchor="start" fill="#fef2f2" textFill="#dc2626" label="Open" size={7} padX={7} />
      <Text x={560} y={162} size={8.5} fill="#94a3b8">
        Unassigned
      </Text>

      {/* Row 2 — investigating */}
      <rect x={20} y={ROW_TOP[1]} width={640} height={1} fill={LINE} />
      <Text x={20} y={202} size={9} weight={800}>
        Billing
      </Text>
      <Text x={20} y={215} size={8} fill={MUTED}>
        "Charged twice for the same trip"
      </Text>
      <Text x={260} y={206} size={8.5} fill="#475569">
        Continental Freight
      </Text>
      <LabelPill x={400} y={198} h={16} anchor="start" fill="#fffbeb" textFill="#b45309" label="Medium" size={7} padX={7} />
      <LabelPill x={480} y={198} h={16} anchor="start" fill="#fffbeb" textFill="#b45309" label="Investigating" size={7} padX={7} />
      <Text x={560} y={206} size={8.5} fill="#475569">
        James P.
      </Text>

      {/* Row 3 — resolved */}
      <rect x={20} y={ROW_TOP[2]} width={640} height={1} fill={LINE} />
      <Text x={20} y={246} size={9} weight={800}>
        Vehicle condition
      </Text>
      <Text x={20} y={259} size={8} fill={MUTED}>
        "Interior wasn't clean"
      </Text>
      <Text x={260} y={250} size={8.5} fill="#475569">
        Marina Events Co.
      </Text>
      <LabelPill x={400} y={242} h={16} anchor="start" fill="#f1f5f9" textFill="#475569" label="Low" size={7} padX={7} />
      <LabelPill x={480} y={242} h={16} anchor="start" fill="#f0fdf4" textFill="#16a34a" label="Resolved" size={7} padX={7} />
      <Text x={560} y={250} size={8.5} fill="#475569">
        Sara K.
      </Text>
      <rect x={20} y={272} width={640} height={1} fill={LINE} />

      <Tag x={20} y={288} label="File Complaint links a customer/quote and assigns an owner" />
    </Frame>
  );
}
