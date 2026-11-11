import { Frame, Text, LabelPill, Tag, diagramPalette } from "./kit";
import { BRAND } from "@/lib/brandConfig";

const { INK, MUTED, LINE, PRIMARY, FAINT } = diagramPalette;

/** Annotated wireframe of Settings → Companies & Brands — mirrors settings/brands/page.tsx's company grid above the searchable, paginated brand grid. */
export function BrandsDiagram() {
  return (
    <Frame>
      <Text x={20} y={18} size={8} fill={PRIMARY} weight={800} uppercase letterSpacing={0.4}>
        Administration
      </Text>
      <Text x={20} y={37} size={17} weight={800}>
        Companies &amp; Brands
      </Text>
      <Text x={20} y={52} size={9} fill={MUTED}>
        Legal entities and the trading brands under them — quote, invoice and email identity flow from here
      </Text>

      <LabelPill x={470} y={14} h={26} anchor="end" fill="#ffffff" stroke={LINE} textFill={INK} label="?  How this works" size={9} />
      <LabelPill x={660} y={14} h={26} anchor="end" fill={PRIMARY} textFill="#ffffff" label="+ New company" size={9} />

      <Tag x={20} y={64} label="COMPANIES — legal entities" />
      <rect x={20} y={84} width={300} height={44} rx={12} fill="#ffffff" stroke={LINE} />
      <circle cx={44} cy={106} r={12} fill={FAINT} />
      <Text x={62} y={102} size={8.5} weight={800}>
        {BRAND.legalName}
      </Text>
      <Text x={62} y={114} size={7} fill={MUTED}>
        {BRAND.companyName} · {BRAND.defaultCurrency}
      </Text>

      <rect x={330} y={84} width={300} height={44} rx={12} fill="#ffffff" stroke={LINE} />
      <circle cx={354} cy={106} r={12} fill={FAINT} />
      <Text x={372} y={102} size={8.5} weight={800}>
        City Removals Ltd
      </Text>
      <Text x={372} y={114} size={7} fill={MUTED}>
        City Removals · GBP
      </Text>

      <rect x={20} y={148} width={230} height={22} rx={11} fill="#ffffff" stroke={LINE} />
      <Text x={32} y={162} size={8} fill={MUTED}>
        Search brands by name…
      </Text>

      <Tag x={20} y={186} label="BRANDS — trading identity, one card per website/brand" />

      <rect x={20} y={206} width={300} height={70} rx={14} fill="#ffffff" stroke={LINE} />
      <circle cx={38} cy={224} r={6} fill={PRIMARY} />
      <Text x={52} y={228} size={8.5} weight={800}>
        {BRAND.companyName}
      </Text>
      <Text x={52} y={240} size={7} fill={MUTED}>
        {BRAND.legalName} · {BRAND.defaultCurrency}
      </Text>
      <LabelPill x={32} y={252} h={16} anchor="start" fill="#f1f5f9" textFill={INK} label="Webhook slug + secret" size={6.5} padX={6} />

      <rect x={330} y={206} width={300} height={70} rx={14} fill="#ffffff" stroke={LINE} />
      <circle cx={348} cy={224} r={6} fill="#2563eb" />
      <Text x={362} y={228} size={8.5} weight={800}>
        City Removals
      </Text>
      <Text x={362} y={240} size={7} fill={MUTED}>
        City Removals Ltd · GBP
      </Text>
      <LabelPill x={342} y={252} h={16} anchor="start" fill="#f1f5f9" textFill={INK} label="Webhook slug + secret" size={6.5} padX={6} />

      <Tag x={20} y={300} label="Each brand carries its own colour, currency and invoice numbering" />
      <Tag x={20} y={324} label="+ New brand sits below the grid, tied to a company chosen above" />
    </Frame>
  );
}
