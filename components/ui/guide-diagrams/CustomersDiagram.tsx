import { Frame, Text, Pill, Tag, LabelPill, measurePillWidth, diagramPalette } from "./kit";

const { INK, MUTED, LINE, PRIMARY, PRIMARY_SOFT } = diagramPalette;

const ROW_TOP = [140, 184, 228];
const ROW_H = 44;

/** Annotated wireframe of the Customers page — mirrors app/(staff)/customers/page.tsx's header, search and table layout. */
export function CustomersDiagram() {
  const newLabel = "+ New";
  const newW = measurePillWidth(newLabel, 9, 14);
  const newRight = 660;
  const helpLabel = "?  How this works";
  const helpRight = newRight - newW - 10;

  return (
    <Frame>
      <Text x={20} y={18} size={8} fill={PRIMARY} weight={800} uppercase letterSpacing={0.4}>
        Sales Workspace
      </Text>
      <Text x={20} y={37} size={17} weight={800}>
        Customers
      </Text>
      <Text x={20} y={52} size={9} fill={MUTED}>
        Every company &amp; contact your team has quoted or booked for
      </Text>

      <LabelPill x={helpRight} y={14} h={26} anchor="end" fill="#ffffff" stroke={LINE} textFill={INK} label={helpLabel} size={9} />
      <LabelPill x={newRight} y={14} h={26} anchor="end" fill={PRIMARY} textFill="#ffffff" label={newLabel} size={9} />

      <Tag x={20} y={60} label="SEARCH" />
      <Pill x={20} y={80} w={320} h={24} fill="#ffffff" stroke={LINE} />
      <Text x={32} y={96} size={8.5} fill={MUTED}>
        Search by name, company, email or phone…
      </Text>

      <Tag x={660} y={104} label="Click any row to open" align="end" />
      <rect x={20} y={140} width={640} height={1} fill={LINE} />
      <Text x={20} y={134} size={7.5} fill={MUTED} weight={700} uppercase>
        Customer
      </Text>
      <Text x={220} y={134} size={7.5} fill={MUTED} weight={700} uppercase>
        Email
      </Text>
      <Text x={370} y={134} size={7.5} fill={MUTED} weight={700} uppercase>
        Phone
      </Text>
      <Text x={470} y={134} size={7.5} fill={MUTED} weight={700} uppercase>
        Country
      </Text>
      <Text x={540} y={134} size={7.5} fill={MUTED} weight={700} uppercase>
        Account manager
      </Text>

      {/* Row 1 */}
      <Text x={20} y={158} size={9} weight={800}>
        Al Fardan Logistics
      </Text>
      <Text x={20} y={171} size={8} fill={MUTED}>
        Yusuf Al Fardan
      </Text>
      <Text x={220} y={166} size={8.5} fill="#475569">
        ops@alfardan.example
      </Text>
      <Text x={370} y={166} size={8.5} fill="#475569">
        +44 7700 900123
      </Text>
      <Text x={470} y={166} size={8.5} fill="#475569">
        UK
      </Text>
      <Text x={540} y={166} size={8.5} fill="#475569">
        Sara K.
      </Text>
      <LabelPill x={660} y={152} h={24} anchor="end" fill="#ffffff" stroke={PRIMARY_SOFT} textFill="#c2410c" label="View" size={8.5} padX={12} />

      {/* Row 2 */}
      <rect x={20} y={ROW_TOP[1]} width={640} height={1} fill={LINE} />
      <Text x={20} y={202} size={9} weight={800}>
        Continental Freight
      </Text>
      <Text x={20} y={215} size={8} fill={MUTED}>
        Meera Nair
      </Text>
      <Text x={220} y={210} size={8.5} fill="#475569">
        meera@continental.example
      </Text>
      <Text x={370} y={210} size={8.5} fill="#475569">
        +44 7700 900456
      </Text>
      <Text x={470} y={210} size={8.5} fill="#475569">
        UK
      </Text>
      <Text x={540} y={210} size={8.5} fill="#475569">
        James P.
      </Text>
      <LabelPill x={660} y={196} h={24} anchor="end" fill="#ffffff" stroke={LINE} textFill="#475569" label="View" size={8.5} padX={12} />

      {/* Row 3 — individual, no company name */}
      <rect x={20} y={ROW_TOP[2]} width={640} height={1} fill={LINE} />
      <Text x={20} y={246} size={9} weight={800}>
        Priya Chandran
      </Text>
      <Text x={220} y={246} size={8.5} fill="#475569">
        priya.c@example.com
      </Text>
      <Text x={370} y={246} size={8.5} fill="#475569">
        +44 7700 900789
      </Text>
      <Text x={470} y={246} size={8.5} fill="#475569">
        India
      </Text>
      <Text x={540} y={246} size={8.5} fill="#94a3b8">
        —
      </Text>
      <LabelPill x={660} y={234} h={24} anchor="end" fill="#ffffff" stroke={LINE} textFill="#475569" label="View" size={8.5} padX={12} />
      <rect x={20} y={272} width={640} height={1} fill={LINE} />

      <Tag x={20} y={288} label="New Customer = manual add — most records are auto-created from leads" />
    </Frame>
  );
}
