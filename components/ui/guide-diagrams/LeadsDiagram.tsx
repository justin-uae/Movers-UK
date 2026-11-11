import { Frame, Text, Pill, Tag, Kpi, LabelPill, measurePillWidth, diagramPalette } from "./kit";

const { INK, MUTED, LINE, PRIMARY, PRIMARY_SOFT } = diagramPalette;

const ROW_TOP = [210, 256, 302, 348];
const ROW_H = 46;

/** Annotated wireframe of the Leads page — mirrors LeadsPage.tsx's real header, KPI row, tabs and table layout. */
export function LeadsDiagram() {
  const addLabel = "+ Add Enquiry";
  const addW = measurePillWidth(addLabel, 9, 14);
  const addRight = 660;
  const helpLabel = "?  How this works";
  const helpRight = addRight - addW - 10;

  return (
    <Frame>
      <Text x={20} y={18} size={8} fill={PRIMARY} weight={800} uppercase letterSpacing={0.4}>
        Omnichannel Lead Centre
      </Text>
      <Text x={20} y={37} size={17} weight={800}>
        Leads &amp; geographic routing
      </Text>
      <Text x={20} y={52} size={9} fill={MUTED}>
        Website, email, WhatsApp, phone &amp; live-chat leads in one workspace
      </Text>

      <LabelPill x={helpRight} y={14} h={26} anchor="end" fill="#ffffff" stroke={LINE} textFill={INK} label={helpLabel} size={9} />
      <LabelPill x={addRight} y={14} h={26} anchor="end" fill={PRIMARY} textFill="#ffffff" label={addLabel} size={9} />

      <Tag x={20} y={60} label="KPI SUMMARY" />
      <Kpi x={20} y={80} w={150} label="My new leads" value="6" />
      <Kpi x={180} y={80} w={150} label="Open pool" value="14" />
      <Kpi x={340} y={80} w={150} label="My open enquiries" value="9" />
      <Kpi x={500} y={80} w={150} label="Awaiting response" value="3" />

      <Tag x={20} y={142} label="FILTER TABS" />
      <LabelPill x={20} y={162} h={22} anchor="start" fill={PRIMARY} textFill="#ffffff" label="My Leads" size={8.5} padX={12} />
      <LabelPill x={98} y={162} h={22} anchor="start" fill="#f1f5f9" textFill={INK} label="Open Pool" size={8.5} padX={12} />
      <LabelPill x={188} y={162} h={22} anchor="start" fill="#f1f5f9" textFill={INK} label="All" size={8.5} padX={12} />
      <Pill x={460} y={162} w={200} h={22} fill="#ffffff" stroke={LINE} />
      <Text x={472} y={176} size={8.5} fill={MUTED}>
        Search leads…
      </Text>

      <Tag x={660} y={188} label="Accept / View" align="end" />
      <rect x={20} y={210} width={640} height={1} fill={LINE} />
      <Text x={20} y={204} size={7.5} fill={MUTED} weight={700} uppercase>
        Customer
      </Text>
      <Text x={220} y={204} size={7.5} fill={MUTED} weight={700} uppercase>
        Move
      </Text>
      <Text x={360} y={204} size={7.5} fill={MUTED} weight={700} uppercase>
        Source
      </Text>
      <Text x={430} y={204} size={7.5} fill={MUTED} weight={700} uppercase>
        Status
      </Text>
      <Text x={490} y={204} size={7.5} fill={MUTED} weight={700} uppercase>
        Age
      </Text>
      <Text x={530} y={204} size={7.5} fill={MUTED} weight={700} uppercase>
        Owner
      </Text>

      {/* Row 1 — claimable open-pool lead */}
      <rect x={20} y={ROW_TOP[0]} width={640} height={ROW_H} fill="#fff7ed" opacity={0.5} />
      <Text x={20} y={238} size={9} weight={800}>
        Al Fardan Logistics
      </Text>
      <LabelPill x={140} y={223} h={16} anchor="start" fill="#fef2f2" textFill="#dc2626" label="HIGH" size={6.5} padX={6} />
      <Text x={220} y={238} size={8.5} fill="#475569">
        Croydon → Brighton
      </Text>
      <LabelPill x={360} y={224} h={18} anchor="start" fill="#f1f5f9" textFill={INK} label="Website" size={7.5} padX={8} />
      <Text x={430} y={238} size={8.5} weight={700} fill={PRIMARY}>
        Open pool
      </Text>
      <Text x={490} y={238} size={8.5} fill="#475569">
        12m
      </Text>
      <Text x={530} y={238} size={8.5} weight={700} fill={PRIMARY}>
        Open pool
      </Text>
      <LabelPill x={660} y={222} h={24} anchor="end" fill={PRIMARY} textFill="#ffffff" label="Accept" size={8.5} padX={12} />

      {/* Row 2 */}
      <rect x={20} y={ROW_TOP[1]} width={640} height={1} fill={LINE} />
      <Text x={20} y={284} size={9} weight={800}>
        Continental Freight
      </Text>
      <Text x={220} y={284} size={8.5} fill="#475569">
        London → Manchester
      </Text>
      <LabelPill x={360} y={270} h={18} anchor="start" fill="#f1f5f9" textFill={INK} label="WhatsApp" size={7.5} padX={8} />
      <Text x={430} y={284} size={8.5} fill="#475569">
        Assigned
      </Text>
      <Text x={490} y={284} size={8.5} fill="#475569">
        2h
      </Text>
      <Text x={530} y={284} size={8.5} fill="#475569">
        Sara K.
      </Text>
      <LabelPill x={660} y={268} h={24} anchor="end" fill="#ffffff" stroke={PRIMARY_SOFT} textFill="#c2410c" label="View" size={8.5} padX={12} />

      {/* Row 3 — general enquiry, no move */}
      <rect x={20} y={ROW_TOP[2]} width={640} height={1} fill={LINE} />
      <Text x={20} y={330} size={9} weight={800} fill="#475569">
        Unassigned enquiry
      </Text>
      <Text x={220} y={330} size={8.5} fill="#94a3b8">
        "Do you cover Fujairah routes?"
      </Text>
      <LabelPill x={360} y={316} h={18} anchor="start" fill="#f1f5f9" textFill={INK} label="Email" size={7.5} padX={8} />
      <Text x={430} y={330} size={8.5} fill="#475569">
        New
      </Text>
      <Text x={490} y={330} size={8.5} fill="#475569">
        40m
      </Text>
      <Text x={530} y={330} size={8.5} fill="#94a3b8">
        —
      </Text>
      <LabelPill x={660} y={314} h={24} anchor="end" fill="#ffffff" stroke={PRIMARY_SOFT} textFill="#c2410c" label="View" size={8.5} padX={12} />

      {/* Row 4 — complex booking */}
      <rect x={20} y={ROW_TOP[3]} width={640} height={1} fill={LINE} />
      <Text x={20} y={376} size={9} weight={800}>
        Marina Events Co.
      </Text>
      <LabelPill x={220} y={362} h={18} anchor="start" fill="#eef2ff" textFill="#4f46e5" label="COMPLEX BOOKING" size={6.5} padX={8} />
      <LabelPill x={360} y={362} h={18} anchor="start" fill="#f1f5f9" textFill={INK} label="Phone" size={7.5} padX={8} />
      <Text x={430} y={376} size={8.5} fill="#475569">
        Contacted
      </Text>
      <Text x={490} y={376} size={8.5} fill="#475569">
        1d
      </Text>
      <Text x={530} y={376} size={8.5} fill="#475569">
        James P.
      </Text>
      <LabelPill x={660} y={360} h={24} anchor="end" fill="#ffffff" stroke={PRIMARY_SOFT} textFill="#c2410c" label="View" size={8.5} padX={12} />
      <rect x={20} y={394} width={640} height={1} fill={LINE} />
    </Frame>
  );
}
