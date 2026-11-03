import { Frame, Text, LabelPill, Tag, diagramPalette } from "./kit";

const { INK, MUTED, LINE, PRIMARY, FAINT } = diagramPalette;

function RoleRow({ y, name, desc, system }: { y: number; name: string; desc: string; system: boolean }) {
  return (
    <g>
      <rect x={20} y={y} width={640} height={54} rx={14} fill="#ffffff" stroke={LINE} />
      <circle cx={46} cy={y + 27} r={13} fill={FAINT} />
      <Text x={68} y={y + 22} size={9.5} weight={800}>
        {name}
      </Text>
      {system && (
        <LabelPill x={68 + name.length * 5.8 + 10} y={y + 13} h={14} anchor="start" fill="#f1f5f9" textFill="#64748b" label="System" size={6.5} padX={6} />
      )}
      <Text x={68} y={y + 36} size={7.5} fill={MUTED}>
        {desc}
      </Text>
      <Text x={648} y={y + 30} size={11} fill="#cbd5e1" anchor="end">
        ›
      </Text>
    </g>
  );
}

/** Annotated wireframe of Settings → Roles & Permissions — mirrors settings/roles/page.tsx's role list and, inset, the per-role permission grid it links to. */
export function RolesDiagram() {
  return (
    <Frame>
      <Text x={20} y={18} size={8} fill={PRIMARY} weight={800} uppercase letterSpacing={0.4}>
        Administration
      </Text>
      <Text x={20} y={37} size={17} weight={800}>
        Roles &amp; Permissions
      </Text>
      <Text x={20} y={52} size={9} fill={MUTED}>
        Predefined system roles plus any custom roles for your organisation
      </Text>

      <LabelPill x={470} y={14} h={26} anchor="end" fill="#ffffff" stroke={LINE} textFill={INK} label="?  How this works" size={9} />
      <LabelPill x={660} y={14} h={26} anchor="end" fill={PRIMARY} textFill="#ffffff" label="+ New role" size={9} />

      <RoleRow y={70} name="Master Admin" desc="Full access to every page and permission" system />
      <RoleRow y={132} name="Sales User" desc="Leads, quotes and their own bookings" system />
      <RoleRow y={194} name="Regional Manager" desc="Custom — London team oversight" system={false} />

      <Tag x={20} y={262} label="Tap a role to open its permission grid ↓" />

      <rect x={20} y={284} width={640} height={110} rx={14} fill="#ffffff" stroke={LINE} />
      <Text x={34} y={302} size={9} weight={800}>
        Sales User
      </Text>
      <Text x={34} y={314} size={7.5} fill={MUTED}>
        Bookings &amp; Dispatch
      </Text>

      <rect x={34} y={326} width={12} height={12} rx={3} fill={PRIMARY} />
      <Text x={52} y={336} size={7.5} fill="#475569">
        bookings.view — view confirmed/lost/completed bookings
      </Text>

      <rect x={34} y={344} width={12} height={12} rx={3} fill={PRIMARY} />
      <Text x={52} y={354} size={7.5} fill="#475569">
        bookings.amend — edit a booking they own, any stage until completed
      </Text>

      <rect x={34} y={362} width={12} height={12} rx={3} fill="#ffffff" stroke={LINE} />
      <Text x={52} y={372} size={7.5} fill="#94a3b8">
        bookings.cancel — not granted to this role
      </Text>
    </Frame>
  );
}
