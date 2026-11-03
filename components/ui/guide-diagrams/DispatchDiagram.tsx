import { Frame, Text, Card, Tag, LabelPill, measurePillWidth, diagramPalette } from "./kit";

const { INK, MUTED, LINE, PRIMARY } = diagramPalette;

/** Annotated wireframe of the Dispatch board — mirrors DispatchBoard.tsx's job-card list. */
export function DispatchDiagram() {
  const viewW = measurePillWidth("View", 8, 10);

  return (
    <Frame>
      <Text x={20} y={18} size={8} fill={PRIMARY} weight={800} uppercase letterSpacing={0.4}>
        Operations
      </Text>
      <Text x={20} y={37} size={17} weight={800}>
        Dispatch
      </Text>
      <Text x={20} y={52} size={9} fill={MUTED}>
        Assign paid bookings to one or more approved suppliers
      </Text>

      <LabelPill x={660} y={14} h={26} anchor="end" fill="#ffffff" stroke={LINE} textFill={INK} label="?  How this works" size={9} />

      <Tag x={20} y={76} label="JOB LIST — ONE CARD PER BOOKING" />

      <Card y={96} h={80}>
        <Text x={0} y={8} size={9.5} weight={800}>
          Al Fardan Logistics
        </Text>
        <Text x={0} y={21} size={8} fill={MUTED}>
          Q-2026-0114 · London
        </Text>
        <LabelPill x={608} y={-4} h={18} anchor="end" fill="#fef3c7" textFill="#b45309" label="Accepted by supplier" size={7.5} padX={9} />
        <LabelPill x={608 - measurePillWidth("Accepted by supplier", 7.5, 9) - 8} y={-4} h={18} anchor="end" fill="#ffffff" stroke={LINE} textFill="#475569" label="View" size={8} padX={10} />
        <Text x={0} y={40} size={8.5} fill={MUTED}>
          Assigned to City Transfers LLC
        </Text>
      </Card>

      <Card y={190} h={80}>
        <Text x={0} y={8} size={9.5} weight={800}>
          Continental Freight
        </Text>
        <Text x={0} y={21} size={8} fill={MUTED}>
          Q-2026-0109 · Manchester
        </Text>
        <LabelPill x={608} y={-4} h={18} anchor="end" fill="#f1f5f9" textFill="#475569" label="Unassigned" size={7.5} padX={9} />
        <LabelPill x={608 - measurePillWidth("Unassigned", 7.5, 9) - 8} y={-4} h={18} anchor="end" fill="#ffffff" stroke={LINE} textFill="#475569" label="View" size={8} padX={10} />
        <Text x={0} y={40} size={8.5} fill={MUTED}>
          Not yet allocated — 3 legs need a supplier each
        </Text>
      </Card>

      <Tag x={20} y={286} label="Open a job to allocate legs and offer them to suppliers" />

      <Text x={20} y={330} size={8.5} weight={700} fill={INK}>
        Job status flow
      </Text>
      {(
        [
          ["Unassigned", "#f1f5f9", "#475569"],
          ["Offered", "#eff6ff", "#2563eb"],
          ["Accepted", "#fef3c7", "#b45309"],
          ["Confirmed", "#f0fdf4", "#16a34a"],
        ] as const
      ).map(([label, bg, fg], i) => (
        <g key={label} transform={`translate(${20 + i * 165}, 342)`}>
          <LabelPill x={0} y={0} h={20} anchor="start" fill={bg} textFill={fg} label={label} size={8} padX={10} />
          {i < 3 && (
            <text x={150} y={13} fontSize={11} fill={MUTED}>
              →
            </text>
          )}
        </g>
      ))}
    </Frame>
  );
}
