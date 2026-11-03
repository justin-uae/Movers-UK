import { Frame, Text, Card, Tag, LabelPill, diagramPalette } from "./kit";

const { INK, MUTED, LINE, PRIMARY } = diagramPalette;

/** Annotated wireframe of Customer Payments — mirrors CustomerPaymentsPage.tsx's three tabs and payment cards. */
export function CustomerPaymentsDiagram() {
  return (
    <Frame>
      <Text x={20} y={18} size={8} fill={PRIMARY} weight={800} uppercase letterSpacing={0.4}>
        Accounting
      </Text>
      <Text x={20} y={37} size={17} weight={800}>
        Customer Payments
      </Text>
      <Text x={20} y={52} size={9} fill={MUTED}>
        Record deposits, balances and full payments as bank transfers arrive
      </Text>

      <LabelPill x={660} y={14} h={26} anchor="end" fill="#ffffff" stroke={LINE} textFill={INK} label="?  How this works" size={9} />

      <LabelPill x={20} y={70} h={22} anchor="start" fill={PRIMARY} textFill="#ffffff" label="Awaiting Payment (7)" size={8} padX={11} />
      <LabelPill x={148} y={70} h={22} anchor="start" fill="#f1f5f9" textFill={INK} label="Pending Verification (2)" size={8} padX={11} />
      <LabelPill x={318} y={70} h={22} anchor="start" fill="#f1f5f9" textFill={INK} label="Paid (54)" size={8} padX={11} />

      <Card y={104} h={134}>
        <Text x={0} y={8} size={9.5} weight={800} fill={PRIMARY}>
          Q-2026-0114
        </Text>
        <Text x={0} y={21} size={8} weight={700}>
          Al Fardan Logistics
        </Text>
        <Text x={608} y={8} size={9.5} weight={800} anchor="end">
          £1,250
        </Text>
        <Text x={0} y={40} size={8} fill="#475569">
          Croydon → Brighton
        </Text>
        <LabelPill x={0} y={50} h={16} anchor="start" fill="#fffbeb" textFill="#b45309" label="Bank transfer · £500 · pending verification" size={6.5} padX={7} />
        <LabelPill x={608} y={76} h={22} anchor="end" fill="#059669" textFill="#ffffff" label="Record Payment" size={8} padX={10} />
      </Card>

      <Card y={252} h={110}>
        <Text x={0} y={8} size={9.5} weight={800} fill={PRIMARY}>
          Q-2026-0098
        </Text>
        <Text x={0} y={21} size={8} weight={700}>
          Desert Rose Tours
        </Text>
        <Text x={608} y={8} size={9.5} weight={800} anchor="end">
          £890
        </Text>
        <Text x={0} y={40} size={8} fill="#475569">
          Reading → Slough
        </Text>
        <LabelPill x={608} y={50} h={22} anchor="end" fill="#059669" textFill="#ffffff" label="Mark as Paid" size={8} padX={10} />
      </Card>

      <Tag x={20} y={372} label="Proof of payment is required to record any amount" />
      <Tag x={20} y={396} label="Flow: Accepted → Partially paid → Paid" />
    </Frame>
  );
}
