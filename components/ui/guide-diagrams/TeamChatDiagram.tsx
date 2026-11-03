import { Frame, Text, Pill, Tag, LabelPill, diagramPalette } from "./kit";

const { INK, MUTED, LINE, PRIMARY, FAINT } = diagramPalette;

/** Annotated wireframe of Team Chat — mirrors ChatSidebar.tsx (channels/DMs/search) plus ChatChannelView.tsx (thread, @mentions, attach/link). Team Chat has no PageHead of its own, so this also shows the compact title + guide button added to its layout. */
export function TeamChatDiagram() {
  return (
    <Frame>
      <Text x={20} y={30} size={16} weight={800}>
        Team Chat
      </Text>
      <LabelPill x={660} y={16} h={24} anchor="end" fill="#ffffff" stroke={LINE} textFill={INK} label="?  How this works" size={8.5} />

      <rect x={20} y={50} width={640} height={378} rx={16} fill="#ffffff" stroke={LINE} />

      {/* Sidebar */}
      <Tag x={30} y={60} label="CHANNELS + DIRECT MESSAGES" />
      <Pill x={20} y={80} w={170} h={22} fill={FAINT} />
      <Text x={30} y={94} size={7.5} fill={MUTED}>
        Search messages…
      </Text>

      <Text x={30} y={122} size={7} weight={800} fill={MUTED} letterSpacing={0.3} uppercase>
        Channels
      </Text>
      <LabelPill x={178} y={112} h={14} anchor="end" fill="#f1f5f9" textFill={INK} label="+" size={8} padX={5} />
      <Text x={30} y={138} size={7.5} weight={700} fill={PRIMARY}>
        # dispatch-ops
      </Text>
      <Text x={30} y={153} size={7.5} fill="#475569">
        # general
      </Text>
      <circle cx={170} cy={150} r={2.5} fill={PRIMARY} />

      <Text x={30} y={178} size={7} weight={800} fill={MUTED} letterSpacing={0.3} uppercase>
        Direct Messages
      </Text>
      <LabelPill x={178} y={168} h={14} anchor="end" fill="#f1f5f9" textFill={INK} label="+" size={8} padX={5} />
      <Text x={30} y={194} size={7.5} fill="#475569">
        Sara K.
      </Text>
      <Text x={30} y={209} size={7.5} fill="#475569">
        James P.
      </Text>

      <rect x={200} y={50} width={1} height={378} fill={LINE} />

      {/* Channel thread */}
      <Text x={216} y={72} size={9.5} weight={800}>
        # dispatch-ops
      </Text>
      <Text x={216} y={85} size={7} fill={MUTED}>
        6 members
      </Text>
      <rect x={216} y={96} width={434} height={1} fill={LINE} />

      <circle cx={228} cy={120} r={11} fill="#eef2ff" />
      <Text x={228} y={123} size={7} weight={800} fill="#4f46e5" anchor="middle">
        SK
      </Text>
      <Text x={246} y={116} size={7.5} weight={800}>
        Sara K.
      </Text>
      <Text x={310} y={116} size={6.5} fill={MUTED}>
        10:02 AM
      </Text>
      <Text x={246} y={129} size={7.5} fill="#475569">
        Can someone check on the Marina Events job?
      </Text>

      <circle cx={228} cy={156} r={11} fill="#fff7ed" />
      <Text x={228} y={159} size={7} weight={800} fill={PRIMARY} anchor="middle">
        JP
      </Text>
      <Text x={246} y={152} size={7.5} weight={800}>
        James P.
      </Text>
      <Text x={306} y={152} size={6.5} fill={MUTED}>
        10:05 AM
      </Text>
      <Text x={246} y={165} size={7.5} fill="#475569">
        On it — checking with
      </Text>
      <Text x={318} y={165} size={7.5} weight={700} fill={PRIMARY}>
        @Sara K.
      </Text>
      <Text x={246} y={178} size={6.5} fill={MUTED}>
        Linked: Q-2026-0114
      </Text>

      <Tag x={650} y={196} label="@mention highlighted · linked record shown under a message" align="end" />

      <rect x={216} y={400} width={434} height={1} fill={LINE} />
      <Text x={220} y={418} size={9} fill={MUTED}>
        📎 🔗
      </Text>
      <Pill x={256} y={406} w={300} h={22} fill={FAINT} />
      <Text x={264} y={420} size={7.5} fill={MUTED}>
        Message # dispatch-ops
      </Text>
      <LabelPill x={650} y={406} h={22} anchor="end" fill={PRIMARY} textFill="#ffffff" label="➤" size={8.5} padX={8} />
    </Frame>
  );
}
