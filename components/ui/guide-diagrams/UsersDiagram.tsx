import { Frame, Text, LabelPill, Tag, diagramPalette } from "./kit";
import { BRAND } from "@/lib/brandConfig";

const { INK, MUTED, LINE, PRIMARY } = diagramPalette;

/** Annotated wireframe of Settings → Users — mirrors settings/users/page.tsx's search, invite button and user table. */
export function UsersDiagram() {
  return (
    <Frame>
      <Text x={20} y={18} size={8} fill={PRIMARY} weight={800} uppercase letterSpacing={0.4}>
        Administration
      </Text>
      <Text x={20} y={37} size={17} weight={800}>
        Users
      </Text>
      <Text x={20} y={52} size={9} fill={MUTED}>
        Invite, assign roles and manage account status for everyone in your organisation
      </Text>

      <LabelPill x={470} y={14} h={26} anchor="end" fill="#ffffff" stroke={LINE} textFill={INK} label="?  How this works" size={9} />
      <LabelPill x={660} y={14} h={26} anchor="end" fill={PRIMARY} textFill="#ffffff" label="+ Invite user" size={9} />

      <rect x={20} y={70} width={230} height={22} rx={11} fill="#ffffff" stroke={LINE} />
      <Text x={32} y={84} size={8} fill={MUTED}>
        Search users by name or email…
      </Text>

      <rect x={20} y={110} width={640} height={1} fill={LINE} />
      <Text x={20} y={104} size={7.5} fill={MUTED} weight={700} uppercase>
        User
      </Text>
      <Text x={190} y={104} size={7.5} fill={MUTED} weight={700} uppercase>
        Brand
      </Text>
      <Text x={280} y={104} size={7.5} fill={MUTED} weight={700} uppercase>
        Region
      </Text>
      <Text x={370} y={104} size={7.5} fill={MUTED} weight={700} uppercase>
        Role
      </Text>
      <Text x={450} y={104} size={7.5} fill={MUTED} weight={700} uppercase>
        Status
      </Text>
      <Text x={520} y={104} size={7.5} fill={MUTED} weight={700} uppercase>
        Mailbox
      </Text>
      <Text x={660} y={104} size={7.5} fill={MUTED} weight={700} uppercase anchor="end">
        Actions
      </Text>

      <Text x={20} y={140} size={9.5} weight={800}>
        Priya Nair
      </Text>
      <Text x={20} y={153} size={7.5} fill={MUTED}>
        priya@{BRAND.emailDomain} · Sales Lead
      </Text>
      <Text x={190} y={140} size={8.5} fill="#475569">
        {BRAND.companyName}
      </Text>
      <Text x={280} y={140} size={8.5} fill="#475569">
        London
      </Text>
      <Text x={370} y={140} size={8.5} fill="#475569">
        Sales User
      </Text>
      <LabelPill x={450} y={132} h={16} anchor="start" fill="#f0fdf4" textFill="#16a34a" label="Active" size={7} padX={7} />
      <LabelPill x={520} y={132} h={16} anchor="start" fill="#f0fdf4" textFill="#16a34a" label="Connected" size={7} padX={7} />
      <LabelPill x={660} y={130} h={20} anchor="end" fill="#ffffff" stroke={LINE} textFill={INK} label="Edit ▾" size={7.5} padX={9} />
      <rect x={20} y={168} width={640} height={1} fill={LINE} />

      <Text x={20} y={192} size={9.5} weight={800}>
        Omar Khalid
      </Text>
      <Text x={20} y={205} size={7.5} fill={MUTED}>
        omar@{BRAND.emailDomain} · Dispatch
      </Text>
      <Text x={190} y={192} size={8.5} fill="#475569">
        {BRAND.companyName}
      </Text>
      <Text x={280} y={192} size={8.5} fill="#475569">
        Manchester
      </Text>
      <Text x={370} y={192} size={8.5} fill="#475569">
        Ops User
      </Text>
      <LabelPill x={450} y={184} h={16} anchor="start" fill="#fef2f2" textFill="#dc2626" label="Suspended" size={7} padX={7} />
      <LabelPill x={520} y={184} h={16} anchor="start" fill="#f1f5f9" textFill="#64748b" label="Not connected" size={7} padX={7} />
      <LabelPill x={660} y={182} h={20} anchor="end" fill="#ffffff" stroke={LINE} textFill={INK} label="Edit ▾" size={7.5} padX={9} />

      <Tag x={20} y={230} label="Edit ▾ = role, brand/region, status, and connect a personal mailbox" />
      <Tag x={20} y={254} label="A suspended user can't sign in, but their history stays intact" />
    </Frame>
  );
}
