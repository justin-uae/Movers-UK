import { Frame, Text, LabelPill, Tag, diagramPalette } from "./kit";

const { INK, MUTED, LINE, PRIMARY } = diagramPalette;

/** Annotated wireframe of Settings → Audit Log — mirrors AuditLogPage.tsx's Changes/Logins tabs, filters, and the expandable before/after row. */
export function AuditLogDiagram() {
  return (
    <Frame>
      <Text x={20} y={18} size={8} fill={PRIMARY} weight={800} uppercase letterSpacing={0.4}>
        Administration
      </Text>
      <Text x={20} y={37} size={17} weight={800}>
        Audit Log
      </Text>
      <Text x={20} y={52} size={9} fill={MUTED}>
        Every financial, pricing, allocation and user change, plus login activity — append-only
      </Text>

      <LabelPill x={660} y={14} h={26} anchor="end" fill="#ffffff" stroke={LINE} textFill={INK} label="?  How this works" size={9} />

      <LabelPill x={20} y={70} h={22} anchor="start" fill={PRIMARY} textFill="#ffffff" label="Changes" size={8} padX={11} />
      <LabelPill x={90} y={70} h={22} anchor="start" fill="#f1f5f9" textFill={INK} label="Logins" size={8} padX={11} />

      <rect x={20} y={104} width={210} height={22} rx={11} fill="#ffffff" stroke={LINE} />
      <Text x={32} y={118} size={7.5} fill={MUTED}>
        Search action, entity or reason…
      </Text>
      <LabelPill x={250} y={104} h={22} anchor="start" fill="#ffffff" stroke={LINE} textFill={INK} label="All users ▾" size={7.5} padX={9} />

      <rect x={20} y={144} width={640} height={1} fill={LINE} />
      <Text x={38} y={138} size={7.5} fill={MUTED} weight={700} uppercase>
        When
      </Text>
      <Text x={160} y={138} size={7.5} fill={MUTED} weight={700} uppercase>
        Actor
      </Text>
      <Text x={280} y={138} size={7.5} fill={MUTED} weight={700} uppercase>
        Action
      </Text>
      <Text x={420} y={138} size={7.5} fill={MUTED} weight={700} uppercase>
        Entity
      </Text>

      <Text x={38} y={162} size={7.5} fill="#94a3b8">
        ▾
      </Text>
      <Text x={38} y={176} size={8.5} fill="#475569">
        15 Sep, 07:31
      </Text>
      <Text x={160} y={168} size={8.5} weight={700}>
        Admin
      </Text>
      <LabelPill x={280} y={160} h={16} anchor="start" fill="#f1f5f9" textFill={INK} label="booking_amended" size={7} padX={7} />
      <Text x={420} y={168} size={8.5} fill="#475569">
        quote · 6dfc47a3
      </Text>
      <rect x={20} y={186} width={640} height={1} fill={LINE} />

      {/* expanded detail */}
      <rect x={20} y={186} width={640} height={74} fill="#f8fafc" />
      <Text x={38} y={204} size={7} fill={MUTED} weight={700} uppercase>
        Before
      </Text>
      <rect x={38} y={210} width={280} height={40} rx={6} fill="#ffffff" />
      <Text x={46} y={224} size={7} fill="#64748b">
        {`{ "status": "partially_paid" }`}
      </Text>

      <Text x={340} y={204} size={7} fill={MUTED} weight={700} uppercase>
        After
      </Text>
      <rect x={340} y={210} width={280} height={40} rx={6} fill="#ffffff" />
      <Text x={348} y={224} size={7} fill="#64748b">
        {`{ "status": "partially_paid", "changes": {...} }`}
      </Text>

      <rect x={20} y={264} width={640} height={1} fill={LINE} />

      <Tag x={20} y={282} label="Every row is who / what / when — nothing here can be edited or deleted" />
    </Frame>
  );
}
