import { Frame, Text, Pill, Tag, LabelPill, measurePillWidth, diagramPalette } from "./kit";

const { INK, MUTED, LINE, PRIMARY } = diagramPalette;

const ROW_TOP = [140, 184, 228];

/** Annotated wireframe of the Suppliers page — mirrors app/(staff)/suppliers/page.tsx's header, search and table layout. */
export function SuppliersDiagram() {
  const addLabel = "+ Add supplier";
  const addW = measurePillWidth(addLabel, 9, 14);
  const addRight = 660;
  const helpLabel = "?  How this works";
  const helpRight = addRight - addW - 10;

  return (
    <Frame>
      <Text x={20} y={18} size={8} fill={PRIMARY} weight={800} uppercase letterSpacing={0.4}>
        Operations
      </Text>
      <Text x={20} y={37} size={17} weight={800}>
        Suppliers
      </Text>
      <Text x={20} y={52} size={9} fill={MUTED}>
        Invite, verify and approve before they receive jobs
      </Text>

      <LabelPill x={helpRight} y={14} h={26} anchor="end" fill="#ffffff" stroke={LINE} textFill={INK} label={helpLabel} size={9} />
      <LabelPill x={addRight} y={14} h={26} anchor="end" fill={PRIMARY} textFill="#ffffff" label={addLabel} size={9} />

      <Tag x={20} y={60} label="SEARCH" />
      <Pill x={20} y={80} w={320} h={24} fill="#ffffff" stroke={LINE} />
      <Text x={32} y={96} size={8.5} fill={MUTED}>
        Search suppliers by name, region or email…
      </Text>

      <Tag x={660} y={104} label="Review = open the approval flow" align="end" />
      <rect x={20} y={140} width={640} height={1} fill={LINE} />
      <Text x={20} y={134} size={7.5} fill={MUTED} weight={700} uppercase>
        Supplier
      </Text>
      <Text x={280} y={134} size={7.5} fill={MUTED} weight={700} uppercase>
        Type
      </Text>
      <Text x={390} y={134} size={7.5} fill={MUTED} weight={700} uppercase>
        Region
      </Text>
      <Text x={480} y={134} size={7.5} fill={MUTED} weight={700} uppercase>
        Status
      </Text>

      {/* Row 1 — awaiting review */}
      <Text x={20} y={158} size={9} weight={800}>
        City Removals LLC
      </Text>
      <Text x={20} y={171} size={8} fill={MUTED}>
        ops@cityremovals.example
      </Text>
      <Text x={280} y={166} size={8.5} fill="#475569">
        Company
      </Text>
      <Text x={390} y={166} size={8.5} fill="#475569">
        London
      </Text>
      <LabelPill x={480} y={158} h={18} anchor="start" fill="#eff6ff" textFill="#2563eb" label="Submitted" size={7.5} padX={9} />
      <LabelPill x={660} y={152} h={24} anchor="end" fill="#ffffff" stroke={LINE} textFill="#475569" label="Review" size={8.5} padX={12} />

      {/* Row 2 — approved */}
      <rect x={20} y={ROW_TOP[1]} width={640} height={1} fill={LINE} />
      <Text x={20} y={202} size={9} weight={800}>
        Star Van Hire
      </Text>
      <Text x={20} y={215} size={8} fill={MUTED}>
        fleet@gulfstar.example
      </Text>
      <Text x={280} y={210} size={8.5} fill="#475569">
        Company
      </Text>
      <Text x={390} y={210} size={8.5} fill="#475569">
        Manchester
      </Text>
      <LabelPill x={480} y={202} h={18} anchor="start" fill="#f0fdf4" textFill="#16a34a" label="Approved" size={7.5} padX={9} />
      <LabelPill x={660} y={196} h={24} anchor="end" fill="#ffffff" stroke={LINE} textFill="#475569" label="Review" size={8.5} padX={12} />

      {/* Row 3 — individual driver, suspended */}
      <rect x={20} y={ROW_TOP[2]} width={640} height={1} fill={LINE} />
      <Text x={20} y={246} size={9} weight={800}>
        Rashid Al Maktoum
      </Text>
      <Text x={20} y={259} size={8} fill={MUTED}>
        rashid.driver@example.com
      </Text>
      <Text x={280} y={254} size={8.5} fill="#475569">
        Individual
      </Text>
      <Text x={390} y={254} size={8.5} fill="#475569">
        Sharjah
      </Text>
      <LabelPill x={480} y={246} h={18} anchor="start" fill="#fffbeb" textFill="#b45309" label="Suspended" size={7.5} padX={9} />
      <LabelPill x={660} y={240} h={24} anchor="end" fill="#ffffff" stroke={LINE} textFill="#475569" label="Review" size={8.5} padX={12} />
      <rect x={20} y={272} width={640} height={1} fill={LINE} />

      <Tag x={20} y={288} label="Status: Invited → Submitted → Approved (or Rejected / Suspended)" />
    </Frame>
  );
}
