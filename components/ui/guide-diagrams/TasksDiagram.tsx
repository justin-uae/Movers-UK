import { Frame, Text, Card, Kpi, Tag, LabelPill, measurePillWidth, diagramPalette } from "./kit";

const { INK, MUTED, LINE, PRIMARY, FAINT } = diagramPalette;

const COLS = [
  { x: 20, label: "To Do", count: 3 },
  { x: 238, label: "In Progress", count: 2 },
  { x: 456, label: "Done", count: 5 },
];
const COL_W = 202;
const COL_TOP = 200;
const COL_H = 190;

/** Annotated wireframe of the Tasks board — mirrors TasksPage.tsx's KPI row, view tabs and 3-column kanban layout. */
export function TasksDiagram() {
  const newLabel = "+ New task";
  const newW = measurePillWidth(newLabel, 9, 14);
  const newRight = 660;
  const helpLabel = "?  How this works";
  const helpRight = newRight - newW - 10;

  return (
    <Frame>
      <Text x={20} y={18} size={8} fill={PRIMARY} weight={800} uppercase letterSpacing={0.4}>
        Operations
      </Text>
      <Text x={20} y={37} size={17} weight={800}>
        Tasks
      </Text>
      <Text x={20} y={52} size={9} fill={MUTED}>
        Personal &amp; team to-dos — board view, checklists, optional links
      </Text>

      <LabelPill x={helpRight} y={14} h={26} anchor="end" fill="#ffffff" stroke={LINE} textFill={INK} label={helpLabel} size={9} />
      <LabelPill x={newRight} y={14} h={26} anchor="end" fill={PRIMARY} textFill="#ffffff" label={newLabel} size={9} />

      <Kpi x={20} y={70} w={200} label="My open tasks" value="4" />
      <Kpi x={240} y={70} w={200} label="Overdue" value="1" />
      <Kpi x={460} y={70} w={200} label="Due this week" value="3" />

      <LabelPill x={20} y={148} h={20} anchor="start" fill={PRIMARY} textFill="#ffffff" label="My Tasks" size={8} padX={10} />
      <LabelPill x={92} y={148} h={20} anchor="start" fill="#f1f5f9" textFill={INK} label="Team Tasks" size={8} padX={10} />
      <LabelPill x={180} y={148} h={20} anchor="start" fill="#f1f5f9" textFill={INK} label="All" size={8} padX={10} />
      <Tag x={660} y={148} label="Drag not required — change status from the card" align="end" />

      {COLS.map((col) => (
        <g key={col.label}>
          <Text x={col.x + 2} y={COL_TOP - 6} size={8.5} weight={800} fill="#334155">
            {col.label}
          </Text>
          <LabelPill x={col.x + COL_W - 4} y={COL_TOP - 18} h={15} anchor="end" fill="#f1f5f9" textFill={MUTED} label={String(col.count)} size={7} padX={6} />
          <rect x={col.x} y={COL_TOP} width={COL_W} height={COL_H} rx={14} fill={FAINT} />
        </g>
      ))}

      {/* Sample task card — To Do column, overdue */}
      <Card x={COLS[0]!.x + 8} y={COL_TOP + 10} w={COL_W - 16} h={78} pad={10}>
        <Text x={0} y={8} size={8.5} weight={700}>
          Confirm supplier for RAK transfer
        </Text>
        <LabelPill x={COL_W - 36} y={-6} h={14} anchor="end" fill="#fef2f2" textFill="#dc2626" label="High" size={6.5} padX={6} />
        <Text x={0} y={38} size={7.5} fill="#dc2626" weight={700}>
          12 Sep — overdue
        </Text>
        <Text x={0} y={50} size={7.5} fill={MUTED}>
          2/3 checklist done
        </Text>
      </Card>

      {/* Sample task card — In Progress column */}
      <Card x={COLS[1]!.x + 8} y={COL_TOP + 10} w={COL_W - 16} h={78} pad={10}>
        <Text x={0} y={8} size={8.5} weight={700}>
          Chase driver licence renewal
        </Text>
        <LabelPill x={COL_W - 36} y={-6} h={14} anchor="end" fill="#fffbeb" textFill="#b45309" label="Med" size={6.5} padX={6} />
        <Text x={0} y={38} size={7.5} fill={MUTED}>
          Linked: City Transfers LLC
        </Text>
        <Text x={0} y={50} size={7.5} fill={MUTED}>
          18 Sep
        </Text>
      </Card>

      <Tag x={20} y={COL_TOP + COL_H + 12} label="Auto badge = created by an automation, not a person" />
    </Frame>
  );
}
