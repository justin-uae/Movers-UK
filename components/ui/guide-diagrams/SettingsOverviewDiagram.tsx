import { Frame, Text, LabelPill, Tag, diagramPalette } from "./kit";

const { INK, MUTED, LINE, PRIMARY, FAINT } = diagramPalette;

const TABS = ["Overview", "Users", "Roles & Permissions", "Companies & Brands", "Bank Details & Terms", "Audit Log"];

function Card({ x, y, w, label, text }: { x: number; y: number; w: number; label: string; text: string }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={76} rx={14} fill="#ffffff" stroke={LINE} />
      <circle cx={x + 30} cy={y + 26} r={14} fill={FAINT} />
      <Text x={x + 48} y={y + 22} size={9.5} weight={800}>
        {label}
      </Text>
      <Text x={x + 48} y={y + 36} size={7.5} fill={MUTED}>
        {text}
      </Text>
    </g>
  );
}

/** Annotated wireframe of the Settings overview — mirrors settings/page.tsx's tab strip and card grid, one card per admin area. */
export function SettingsOverviewDiagram() {
  return (
    <Frame>
      <Text x={20} y={18} size={8} fill={PRIMARY} weight={800} uppercase letterSpacing={0.4}>
        Administration
      </Text>
      <Text x={20} y={37} size={17} weight={800}>
        Settings
      </Text>
      <Text x={20} y={52} size={9} fill={MUTED}>
        Configuration for your organisation
      </Text>

      <LabelPill x={660} y={14} h={26} anchor="end" fill="#ffffff" stroke={LINE} textFill={INK} label="?  How this works" size={9} />

      {TABS.map((label, i) => {
        const w = label.length * 5.4 + 26;
        const xPositions = [20, 88, 160, 300, 450, 590];
        return (
          <LabelPill
            key={label}
            x={xPositions[i]!}
            y={70}
            h={24}
            anchor="start"
            fill={i === 0 ? PRIMARY : "#ffffff"}
            stroke={i === 0 ? undefined : LINE}
            textFill={i === 0 ? "#ffffff" : INK}
            label={label}
            size={7.5}
            padX={9}
          />
        );
      })}

      <Card x={20} y={110} w={310} label="Users" text="Invite users, assign a brand and region, manage account status." />
      <Card x={350} y={110} w={310} label="Roles & Permissions" text="Create custom roles and control granular permissions." />
      <Card x={20} y={196} w={310} label="Companies & Brands" text="Manage legal companies, trading brands and numbering." />
      <Card x={350} y={196} w={310} label="Audit Log" text="Review every financial, pricing and user change." />

      <Tag x={20} y={290} label="Bank Details & Terms lives in the tab strip above, not a card" />
    </Frame>
  );
}
