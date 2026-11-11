import { Frame, Text, Pill, Card, Tag, LabelPill, measurePillWidth, diagramPalette } from "./kit";

const { INK, MUTED, LINE, PRIMARY } = diagramPalette;

/** Annotated wireframe of Supplier Payments — mirrors SupplierPaymentsPage.tsx's tabs, filter row and payment cards. */
export function SupplierPaymentsDiagram() {
  const exportLabel = "Export CSV";
  const exportW = measurePillWidth(exportLabel, 9, 14);
  const exportRight = 660;
  const helpLabel = "?  How this works";
  const helpRight = exportRight - exportW - 10;

  return (
    <Frame>
      <Text x={20} y={18} size={8} fill={PRIMARY} weight={800} uppercase letterSpacing={0.4}>
        Accounting
      </Text>
      <Text x={20} y={37} size={17} weight={800}>
        Supplier Payments
      </Text>
      <Text x={20} y={52} size={9} fill={MUTED}>
        Invoices forwarded from Dispatch — pay outside the system, then log it here
      </Text>

      <LabelPill x={helpRight} y={14} h={26} anchor="end" fill="#ffffff" stroke={LINE} textFill={INK} label={helpLabel} size={9} />
      <LabelPill x={exportRight} y={14} h={26} anchor="end" fill="#ffffff" stroke={LINE} textFill={INK} label={exportLabel} size={9} />

      <LabelPill x={20} y={68} h={22} anchor="start" fill={PRIMARY} textFill="#ffffff" label="Outstanding (5)" size={8} padX={11} />
      <LabelPill x={130} y={68} h={22} anchor="start" fill="#f1f5f9" textFill={INK} label="Paid History (61)" size={8} padX={11} />

      <Tag x={20} y={98} label="SEARCH + FILTERS" />
      <Pill x={20} y={116} w={180} h={22} fill="#ffffff" stroke={LINE} />
      <Text x={30} y={130} size={7.5} fill={MUTED}>
        Search supplier, quote…
      </Text>
      <Pill x={210} y={116} w={130} h={22} fill="#f8fafc" stroke={LINE} />
      <Text x={220} y={130} size={7.5} fill="#475569">
        All suppliers ▾
      </Text>
      <Pill x={350} y={116} w={100} h={22} fill="#f8fafc" stroke={LINE} />
      <Text x={358} y={130} size={7} fill={MUTED}>
        Forwarded from
      </Text>
      <Pill x={460} y={116} w={100} h={22} fill="#f8fafc" stroke={LINE} />
      <Text x={468} y={130} size={7} fill={MUTED}>
        Forwarded to
      </Text>

      <Card y={154} h={136}>
        <Text x={0} y={8} size={9.5} weight={800}>
          City Removals LLC
        </Text>
        <Text x={0} y={21} size={8} fill={MUTED}>
          Q-2026-0114 · Al Fardan Logistics
        </Text>
        <LabelPill x={608} y={-2} h={18} anchor="end" fill="#fffbeb" textFill="#b45309" label="Partially paid" size={7.5} padX={9} />
        <Text x={0} y={48} size={7} fill={MUTED} weight={700} uppercase>
          Invoice
        </Text>
        <Text x={0} y={62} size={8.5} weight={800}>
          £1,100
        </Text>
        <Text x={140} y={48} size={7} fill={MUTED} weight={700} uppercase>
          Paid so far
        </Text>
        <Text x={140} y={62} size={8.5} weight={800}>
          £400
        </Text>
        <Text x={280} y={48} size={7} fill={MUTED} weight={700} uppercase>
          Balance
        </Text>
        <Text x={280} y={62} size={8.5} weight={800} fill={PRIMARY}>
          £700
        </Text>
        <LabelPill x={608} y={80} h={22} anchor="end" fill={PRIMARY} textFill="#ffffff" label="Record Payment" size={8} padX={10} />
      </Card>

      <Tag x={20} y={298} label="Proof required only when the payment fully settles the invoice" />
      <Tag x={20} y={322} label="Flow: Unpaid → Partially paid → Paid" />

      <Text x={20} y={360} size={8.5} weight={700} fill={INK}>
        Where invoices come from
      </Text>
      <Text x={20} y={376} size={8} fill="#475569">
        Dispatch forwards a supplier's invoice here once a job is confirmed —
      </Text>
      <Text x={20} y={390} size={8} fill="#475569">
        nothing to upload on this page itself.
      </Text>
    </Frame>
  );
}
