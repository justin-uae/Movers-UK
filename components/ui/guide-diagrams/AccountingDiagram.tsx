import { Frame, Text, Kpi, Tag, LabelPill, diagramPalette } from "./kit";

const { INK, MUTED, LINE, PRIMARY } = diagramPalette;

/** Annotated wireframe of Accounting & payment control — mirrors AccountingPage.tsx's KPI row, bank-transfer queue and receivables ageing chart. */
export function AccountingDiagram() {
  return (
    <Frame>
      <Text x={20} y={18} size={8} fill={PRIMARY} weight={800} uppercase letterSpacing={0.4}>
        Finance Suite
      </Text>
      <Text x={20} y={37} size={17} weight={800}>
        Accounting &amp; payment control
      </Text>
      <Text x={20} y={52} size={9} fill={MUTED}>
        Invoices, bank transfers, supplier costs, reconciliation and group reporting
      </Text>

      <LabelPill x={660} y={14} h={26} anchor="end" fill="#ffffff" stroke={LINE} textFill={INK} label="?  How this works" size={9} />

      <Tag x={20} y={60} label="KPI SUMMARY" />
      <Kpi x={20} y={76} w={150} label="Collected revenue" value="£25.7k" />
      <Kpi x={180} y={76} w={150} label="Outstanding" value="£8.4k" />
      <Kpi x={340} y={76} w={150} label="Gross profit" value="£6.1k" />
      <Kpi x={500} y={76} w={150} label="Supplier payable" value="£4.9k" />

      {/* Left — bank transfer verification queue */}
      <rect x={20} y={144} width={380} height={272} rx={16} fill="#ffffff" stroke={LINE} />
      <Tag x={30} y={154} label="BANK TRANSFER QUEUE" />
      <rect x={30} y={176} width={360} height={64} rx={12} fill="#fffbeb" stroke="#fde68a" />
      <Text x={42} y={196} size={8} weight={800}>
        Al Fardan Logistics
      </Text>
      <Text x={42} y={209} size={7} fill={MUTED}>
        Q-2026-0114 · Awaiting payment
      </Text>
      <Text x={280} y={196} size={8.5} weight={800}>
        £1,250
      </Text>
      <LabelPill x={378} y={208} h={20} anchor="end" fill="#059669" textFill="#ffffff" label="Review & record" size={7} padX={8} />
      <rect x={30} y={250} width={360} height={64} rx={12} fill="#fffbeb" stroke="#fde68a" />
      <Text x={42} y={270} size={8} weight={800}>
        Continental Freight
      </Text>
      <Text x={42} y={283} size={7} fill={MUTED}>
        Q-2026-0109 · Awaiting payment
      </Text>
      <Text x={280} y={270} size={8.5} weight={800}>
        £3,600
      </Text>
      <LabelPill x={378} y={282} h={20} anchor="end" fill="#059669" textFill="#ffffff" label="Review & record" size={7} padX={8} />
      <Tag x={30} y={330} label="Approving here books the payment" />

      {/* Right — receivables ageing */}
      <rect x={412} y={144} width={248} height={272} rx={16} fill="#ffffff" stroke={LINE} />
      <Tag x={422} y={154} label="RECEIVABLES AGEING" />
      <Text x={422} y={186} size={7.5} weight={700} fill="#334155">
        Click a bar to see the quotes
      </Text>
      {(
        [
          ["Current", 40, "#86efac"],
          ["1–30d", 70, "#fde68a"],
          ["31–60d", 100, "#fdba74"],
          ["61+d", 55, "#fca5a5"],
        ] as const
      ).map(([label, h, color], i) => {
        const barX = 434 + i * 52;
        const baseY = 350;
        return (
          <g key={label}>
            <rect x={barX} y={baseY - h} width={34} height={h} rx={5} fill={color} />
            <text x={barX + 17} y={baseY + 14} fontSize={6.5} fill={MUTED} textAnchor="middle">
              {label}
            </text>
          </g>
        );
      })}
      <rect x={422} y={352} width={228} height={1} fill={LINE} />
    </Frame>
  );
}
