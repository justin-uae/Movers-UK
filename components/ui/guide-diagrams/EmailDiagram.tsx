import { Frame, Text, Pill, Tag, LabelPill, measurePillWidth, diagramPalette } from "./kit";
import { BRAND } from "@/lib/brandConfig";

const { INK, MUTED, LINE, PRIMARY, PRIMARY_SOFT, FAINT } = diagramPalette;

/** Annotated wireframe of Email Centre — mirrors EmailCentrePage.tsx's tab row plus its folders/list/detail three-pane layout. */
export function EmailDiagram() {
  const composeLabel = "+ Compose";
  const composeW = measurePillWidth(composeLabel, 9, 14);
  const composeRight = 660;
  const helpLabel = "?  How this works";
  const helpRight = composeRight - composeW - 10;

  return (
    <Frame>
      <Text x={20} y={18} size={8} fill={PRIMARY} weight={800} uppercase letterSpacing={0.4}>
        Integrated Communications
      </Text>
      <Text x={20} y={37} size={17} weight={800}>
        Email Centre
      </Text>
      <Text x={20} y={52} size={9} fill={MUTED}>
        Connected as ops@{BRAND.emailDomain}
      </Text>

      <LabelPill x={helpRight} y={14} h={26} anchor="end" fill="#ffffff" stroke={LINE} textFill={INK} label={helpLabel} size={9} />
      <LabelPill x={composeRight} y={14} h={26} anchor="end" fill={PRIMARY} textFill="#ffffff" label={composeLabel} size={9} />

      <LabelPill x={20} y={62} h={20} anchor="start" fill={PRIMARY} textFill="#ffffff" label="Inbox" size={8} padX={10} />
      <LabelPill x={80} y={62} h={20} anchor="start" fill="#f1f5f9" textFill={INK} label="Templates" size={8} padX={10} />
      <LabelPill x={168} y={62} h={20} anchor="start" fill="#f1f5f9" textFill={INK} label="My Signature" size={8} padX={10} />

      {/* Outer 3-pane panel */}
      <rect x={20} y={94} width={640} height={330} rx={16} fill="#ffffff" stroke={LINE} />

      {/* Pane 1 — folders */}
      <Tag x={30} y={104} label="FOLDERS" />
      <LabelPill x={30} y={124} h={20} anchor="start" fill={PRIMARY} textFill="#ffffff" label="+ Compose" size={7.5} padX={9} />
      <Text x={30} y={162} size={8} weight={700} fill={PRIMARY}>
        Inbox
      </Text>
      <Text x={140} y={162} size={7} fill={MUTED}>
        4
      </Text>
      <Text x={30} y={180} size={8} fill="#475569">
        Sent
      </Text>
      <Text x={30} y={198} size={8} fill="#475569">
        Archived
      </Text>
      <rect x={168} y={94} width={1} height={330} fill={LINE} />

      {/* Pane 2 — message list */}
      <Tag x={178} y={104} label="MESSAGE LIST" />
      <rect x={178} y={122} width={170} height={40} fill="#fff7ed" />
      <Text x={186} y={136} size={7.5} weight={800}>
        Al Fardan Logistics
      </Text>
      <Text x={318} y={136} size={6.5} fill={MUTED} anchor="end">
        2h
      </Text>
      <Text x={186} y={149} size={7} fill="#475569">
        Re: Quote Q-2026-0114
      </Text>
      <rect x={178} y={162} width={170} height={1} fill={LINE} />
      <Text x={186} y={176} size={7.5} weight={700}>
        Continental Freight
      </Text>
      <Text x={318} y={176} size={6.5} fill={MUTED} anchor="end">
        1d
      </Text>
      <Text x={186} y={189} size={7} fill="#94a3b8">
        Booking confirmation attached
      </Text>
      <rect x={178} y={202} width={170} height={1} fill={LINE} />
      <Text x={186} y={216} size={7.5} weight={700}>
        Desert Rose Tours
      </Text>
      <Text x={318} y={216} size={6.5} fill={MUTED} anchor="end">
        3d
      </Text>
      <Text x={186} y={229} size={7} fill="#94a3b8">
        Question about invoice
      </Text>
      <rect x={358} y={94} width={1} height={330} fill={LINE} />

      {/* Pane 3 — detail + reply */}
      <Tag x={368} y={104} label="MESSAGE + REPLY" />
      <Text x={368} y={128} size={10} weight={800}>
        Re: Quote Q-2026-0114
      </Text>
      <Text x={368} y={141} size={7} fill={MUTED}>
        Al Fardan Logistics · 2 hours ago
      </Text>
      <LabelPill x={650} y={118} h={16} anchor="end" fill={PRIMARY_SOFT} textFill="#c2410c" label="Customer" size={6.5} padX={7} />
      <rect x={368} y={152} width={282} height={1} fill={LINE} />
      <Text x={368} y={170} size={7.5} fill="#475569">
        Thanks — please confirm pickup time
      </Text>
      <Text x={368} y={183} size={7.5} fill="#475569">
        for the 20th and we'll go ahead.
      </Text>

      <rect x={368} y={370} width={282} height={1} fill={LINE} />
      <Pill x={368} y={382} w={220} h={26} fill={FAINT} />
      <Text x={378} y={398} size={7.5} fill={MUTED}>
        Write a reply…
      </Text>
      <LabelPill x={650} y={382} h={26} anchor="end" fill={PRIMARY} textFill="#ffffff" label="Send" size={8} padX={12} />

      <Tag x={368} y={402} label="Templates tab = reusable replies" />
    </Frame>
  );
}
