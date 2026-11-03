import { Frame, Text, Pill, Tag, LabelPill, measurePillWidth, diagramPalette } from "./kit";

const { INK, MUTED, LINE, PRIMARY } = diagramPalette;

const ROW_TOP = [140, 184, 228];

/** Annotated wireframe of the Documents page — mirrors DocumentsPage.tsx's header, filter row and table. */
export function DocumentsDiagram() {
  const uploadLabel = "↑ Upload document";
  const uploadW = measurePillWidth(uploadLabel, 9, 14);
  const uploadRight = 660;
  const helpLabel = "?  How this works";
  const helpRight = uploadRight - uploadW - 10;

  return (
    <Frame>
      <Text x={20} y={18} size={8} fill={PRIMARY} weight={800} uppercase letterSpacing={0.4}>
        Operations
      </Text>
      <Text x={20} y={37} size={17} weight={800}>
        Documents
      </Text>
      <Text x={20} y={52} size={9} fill={MUTED}>
        Contracts, licences, invoices — linkable to a customer, supplier or quote
      </Text>

      <LabelPill x={helpRight} y={14} h={26} anchor="end" fill="#ffffff" stroke={LINE} textFill={INK} label={helpLabel} size={9} />
      <LabelPill x={uploadRight} y={14} h={26} anchor="end" fill={PRIMARY} textFill="#ffffff" label={uploadLabel} size={9} />

      <Tag x={20} y={60} label="SEARCH" />
      <Pill x={20} y={80} w={260} h={24} fill="#ffffff" stroke={LINE} />
      <Text x={32} y={96} size={8.5} fill={MUTED}>
        Search by label or notes…
      </Text>
      <Pill x={296} y={80} w={150} h={24} fill="#f8fafc" stroke={LINE} />
      <Text x={308} y={96} size={8.5} fill="#475569">
        All types ▾
      </Text>
      <Tag x={296} y={68} label="FILTER BY TYPE" />

      <Tag x={660} y={104} label="Download / Delete" align="end" />
      <rect x={20} y={140} width={640} height={1} fill={LINE} />
      <Text x={20} y={134} size={7.5} fill={MUTED} weight={700} uppercase>
        Document
      </Text>
      <Text x={270} y={134} size={7.5} fill={MUTED} weight={700} uppercase>
        Type
      </Text>
      <Text x={370} y={134} size={7.5} fill={MUTED} weight={700} uppercase>
        Linked to
      </Text>
      <Text x={490} y={134} size={7.5} fill={MUTED} weight={700} uppercase>
        Uploaded by
      </Text>

      {/* Row 1 */}
      <Text x={20} y={158} size={9} weight={800}>
        Supplier Insurance Certificate 2026
      </Text>
      <Text x={20} y={171} size={8} fill={MUTED}>
        insurance-2026.pdf
      </Text>
      <LabelPill x={270} y={152} h={18} anchor="start" fill="#f1f5f9" textFill={INK} label="Insurance" size={7.5} padX={9} />
      <Text x={370} y={162} size={8.5} fill="#475569">
        City Transfers LLC
      </Text>
      <Text x={490} y={162} size={8.5} fill="#475569">
        Sara K.
      </Text>
      <LabelPill x={598} y={152} h={22} anchor="start" fill="#ffffff" stroke={LINE} textFill="#475569" label="↓" size={9} padX={9} />
      <LabelPill x={630} y={152} h={22} anchor="start" fill="#ffffff" stroke="#fecaca" textFill="#dc2626" label="🗑" size={9} padX={9} />

      {/* Row 2 */}
      <rect x={20} y={ROW_TOP[1]} width={640} height={1} fill={LINE} />
      <Text x={20} y={202} size={9} weight={800}>
        Q-2026-0114 Invoice
      </Text>
      <Text x={20} y={215} size={8} fill={MUTED}>
        invoice-0114.pdf
      </Text>
      <LabelPill x={270} y={196} h={18} anchor="start" fill="#f1f5f9" textFill={INK} label="Invoice" size={7.5} padX={9} />
      <Text x={370} y={206} size={8.5} fill="#475569">
        Al Fardan Logistics
      </Text>
      <Text x={490} y={206} size={8.5} fill="#475569">
        James P.
      </Text>
      <LabelPill x={598} y={196} h={22} anchor="start" fill="#ffffff" stroke={LINE} textFill="#475569" label="↓" size={9} padX={9} />

      {/* Row 3 */}
      <rect x={20} y={ROW_TOP[2]} width={640} height={1} fill={LINE} />
      <Text x={20} y={246} size={9} weight={800}>
        Driver Licence — R. Al Maktoum
      </Text>
      <Text x={20} y={259} size={8} fill={MUTED}>
        licence-scan.jpg
      </Text>
      <LabelPill x={270} y={240} h={18} anchor="start" fill="#f1f5f9" textFill={INK} label="Driver Licence" size={7.5} padX={9} />
      <Text x={370} y={250} size={8.5} fill="#94a3b8">
        —
      </Text>
      <Text x={490} y={250} size={8.5} fill="#475569">
        Sara K.
      </Text>
      <LabelPill x={598} y={240} h={22} anchor="start" fill="#ffffff" stroke={LINE} textFill="#475569" label="↓" size={9} padX={9} />
      <rect x={20} y={272} width={640} height={1} fill={LINE} />

      <Tag x={20} y={288} label="Delete only shows for documents you're allowed to remove" />
    </Frame>
  );
}
