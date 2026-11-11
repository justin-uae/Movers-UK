import { Frame, Text, Kpi, Tag, LabelPill, diagramPalette } from "./kit";

const { INK, MUTED, LINE, PRIMARY } = diagramPalette;

/** Annotated wireframe of Commission management — mirrors CommissionsPage.tsx's KPI row, status tabs, table and the Pipeline/Rates panels below it. */
export function CommissionsDiagram() {
  return (
    <Frame>
      <Text x={20} y={18} size={8} fill={PRIMARY} weight={800} uppercase letterSpacing={0.4}>
        Completed-Job Commission
      </Text>
      <Text x={20} y={37} size={17} weight={800}>
        Commission management
      </Text>
      <Text x={20} y={52} size={9} fill={MUTED}>
        Payable only after the move is completed and final costs approved
      </Text>

      <LabelPill x={660} y={14} h={26} anchor="end" fill="#ffffff" stroke={LINE} textFill={INK} label="?  How this works" size={9} />

      <Tag x={20} y={60} label="KPI SUMMARY" />
      <Kpi x={20} y={76} w={150} label="Pending approval" value="£1.4k" />
      <Kpi x={180} y={76} w={150} label="Approved, unpaid" value="£2.1k" />
      <Kpi x={340} y={76} w={150} label="Paid this month" value="£3.8k" />
      <Kpi x={500} y={76} w={150} label="Estimated pipeline" value="£5.2k" />

      <LabelPill x={20} y={144} h={20} anchor="start" fill={PRIMARY} textFill="#ffffff" label="Pending Approval" size={7.5} padX={9} />
      <LabelPill x={130} y={144} h={20} anchor="start" fill="#f1f5f9" textFill={INK} label="Approved" size={7.5} padX={9} />
      <LabelPill x={196} y={144} h={20} anchor="start" fill="#f1f5f9" textFill={INK} label="Paid" size={7.5} padX={9} />
      <LabelPill x={240} y={144} h={20} anchor="start" fill="#f1f5f9" textFill={INK} label="Reversed" size={7.5} padX={9} />

      <rect x={20} y={182} width={640} height={1} fill={LINE} />
      <Text x={20} y={176} size={7.5} fill={MUTED} weight={700} uppercase>
        Salesperson
      </Text>
      <Text x={150} y={176} size={7.5} fill={MUTED} weight={700} uppercase>
        Job
      </Text>
      <Text x={250} y={176} size={7.5} fill={MUTED} weight={700} uppercase>
        Gross profit
      </Text>
      <Text x={360} y={176} size={7.5} fill={MUTED} weight={700} uppercase>
        Rate
      </Text>
      <Text x={420} y={176} size={7.5} fill={MUTED} weight={700} uppercase>
        Commission
      </Text>
      <Text x={520} y={176} size={7.5} fill={MUTED} weight={700} uppercase>
        Status
      </Text>

      <Text x={20} y={200} size={9} weight={800}>
        Alex Munyam
      </Text>
      <Text x={150} y={200} size={8.5} fill="#475569">
        London
      </Text>
      <Text x={250} y={200} size={8.5} fill="#475569">
        £480
      </Text>
      <Text x={360} y={200} size={8.5} fill="#475569">
        10%
      </Text>
      <Text x={420} y={200} size={9} weight={800} fill={PRIMARY}>
        £48
      </Text>
      <LabelPill x={520} y={192} h={16} anchor="start" fill="#fffbeb" textFill="#b45309" label="Pending" size={7} padX={7} />
      <LabelPill x={660} y={190} h={20} anchor="end" fill={PRIMARY} textFill="#ffffff" label="Approve" size={7.5} padX={9} />

      <rect x={20} y={222} width={640} height={1} fill={LINE} />
      <Text x={20} y={240} size={9} weight={800}>
        Bridget Nossah
      </Text>
      <Text x={150} y={240} size={8.5} fill="#475569">
        Manchester
      </Text>
      <Text x={250} y={240} size={8.5} fill="#475569">
        £900
      </Text>
      <Text x={360} y={240} size={8.5} fill="#475569">
        12%
      </Text>
      <Text x={420} y={240} size={9} weight={800} fill={PRIMARY}>
        £108
      </Text>
      <LabelPill x={520} y={232} h={16} anchor="start" fill="#eff6ff" textFill="#2563eb" label="Approved" size={7} padX={7} />
      <LabelPill x={585} y={230} h={20} anchor="start" fill="#059669" textFill="#ffffff" label="Mark paid" size={7.5} padX={8} />

      <rect x={20} y={262} width={640} height={1} fill={LINE} />

      <Tag x={20} y={278} label="Flow: Pending approval → Approved → Paid (or Reversed)" />

      <rect x={20} y={306} width={310} height={94} rx={14} fill="#f8fafc" />
      <Text x={30} y={324} size={8} weight={800} fill={INK}>
        Pipeline
      </Text>
      <Text x={30} y={338} size={7} fill={MUTED}>
        In-flight jobs not yet completed
      </Text>
      <Text x={30} y={358} size={7.5} fill="#475569">
        London region
      </Text>
      <LabelPill x={200} y={350} h={16} anchor="start" fill="#fffbeb" textFill="#b45309" label="Estimated" size={6.5} padX={6} />
      <Text x={300} y={358} size={7.5} weight={700} anchor="end">
        £320
      </Text>

      <rect x={350} y={306} width={310} height={94} rx={14} fill="#f8fafc" />
      <Text x={360} y={324} size={8} weight={800} fill={INK}>
        Rates
      </Text>
      <Text x={360} y={338} size={7} fill={MUTED}>
        % of gross profit — per-user override
      </Text>
      <Text x={360} y={358} size={7.5} fill="#475569">
        Alex Munyam
      </Text>
      <Text x={630} y={358} size={7.5} weight={700} anchor="end">
        10%
      </Text>

      <Tag x={20} y={408} label="Rates only visible/editable if you manage commissions" />
    </Frame>
  );
}
