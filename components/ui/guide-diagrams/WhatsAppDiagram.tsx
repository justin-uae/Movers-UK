import { Frame, Text, Pill, Tag, LabelPill, diagramPalette } from "./kit";

const { INK, MUTED, LINE, PRIMARY, FAINT } = diagramPalette;

/** Annotated wireframe of the WhatsApp inbox — mirrors WhatsAppInboxPage.tsx's conversation list + thread, including the "not delivered" state added after 360dialog started silently rejecting stale replies. */
export function WhatsAppDiagram() {
  return (
    <Frame>
      <Text x={20} y={18} size={8} fill={PRIMARY} weight={800} uppercase letterSpacing={0.4}>
        Communications
      </Text>
      <Text x={20} y={37} size={17} weight={800}>
        WhatsApp
      </Text>
      <Text x={20} y={52} size={9} fill={MUTED}>
        Conversations synced from your connected WhatsApp number
      </Text>

      <LabelPill x={660} y={14} h={26} anchor="end" fill="#ffffff" stroke={LINE} textFill={INK} label="?  How this works" size={9} />

      <rect x={20} y={72} width={640} height={356} rx={16} fill="#ffffff" stroke={LINE} />

      {/* Conversation list */}
      <Tag x={30} y={82} label="CONVERSATIONS" />
      <rect x={20} y={102} width={210} height={38} fill="#fff7ed" />
      <Text x={30} y={116} size={7.5} weight={800}>
        Farah Al Mansoori
      </Text>
      <Text x={207} y={116} size={6.5} fill={MUTED} anchor="end">
        2:34 PM
      </Text>
      <Text x={30} y={129} size={7} fill="#475569">
        You: Hello
      </Text>
      <rect x={20} y={140} width={210} height={1} fill={LINE} />
      <Text x={30} y={154} size={7.5} weight={700}>
        Heritage Inn
      </Text>
      <Text x={207} y={154} size={6.5} fill={MUTED} anchor="end">
        Sun
      </Text>
      <Text x={30} y={167} size={7} fill="#94a3b8">
        You: And where are you headed…
      </Text>
      <rect x={20} y={178} width={210} height={1} fill={LINE} />
      <Text x={30} y={192} size={7.5} weight={700}>
        Yehia
      </Text>
      <Text x={207} y={192} size={6.5} fill={MUTED} anchor="end">
        Sat
      </Text>
      <Text x={30} y={205} size={7} fill="#94a3b8">
        You: Thanks Yehia! We've got…
      </Text>
      <rect x={240} y={72} width={1} height={356} fill={LINE} />

      {/* Thread pane */}
      <Tag x={250} y={82} label="THREAD" />
      <Text x={250} y={106} size={9.5} weight={800}>
        Farah Al Mansoori
      </Text>
      <Text x={250} y={119} size={7.5} fill={MUTED}>
        971551234567
      </Text>
      <rect x={250} y={130} width={400} height={1} fill={LINE} />

      {/* Inbound bubble */}
      <rect x={250} y={144} width={90} height={26} rx={12} fill={FAINT} />
      <Text x={260} y={161} size={7.5} fill="#475569">
        Hi
      </Text>

      {/* Outbound delivered bubble */}
      <rect x={478} y={144} width={172} height={40} rx={12} fill={PRIMARY} />
      <Text x={488} y={159} size={7} fill="#ffffff">
        Thanks for reaching out! Could
      </Text>
      <Text x={488} y={170} size={7} fill="#ffffff">
        you tell us your name?
      </Text>

      {/* Outbound failed bubble — the new "not delivered" state */}
      <rect x={560} y={194} width={90} height={40} rx={12} fill="#fef2f2" stroke="#fecaca" />
      <Text x={568} y={208} size={7.5} fill="#334155">
        Hello
      </Text>
      <Text x={568} y={220} size={6} weight={800} fill="#dc2626">
        ⚠ Not delivered
      </Text>
      <Tag x={560} y={246} label="24h window expired → needs a template" align="end" />

      <rect x={250} y={378} width={400} height={1} fill={LINE} />
      <Pill x={250} y={390} w={330} h={26} fill={FAINT} />
      <Text x={260} y={406} size={7.5} fill={MUTED}>
        Type a message…
      </Text>
      <LabelPill x={650} y={390} h={26} anchor="end" fill={PRIMARY} textFill="#ffffff" label="➤" size={9} padX={9} />
    </Frame>
  );
}
