import { Frame, Text, LabelPill, Tag, diagramPalette } from "./kit";
import { BRAND } from "@/lib/brandConfig";

const { INK, MUTED, LINE, PRIMARY } = diagramPalette;

/** Annotated wireframe of Business Intelligence — mirrors BusinessIntelligencePage.tsx's refresh timestamp, FX warning banner and the two exportable charts. */
export function BusinessIntelligenceDiagram() {
  return (
    <Frame>
      <Text x={20} y={18} size={8} fill={PRIMARY} weight={800} uppercase letterSpacing={0.4}>
        Business Intelligence
      </Text>
      <Text x={20} y={37} size={17} weight={800}>
        Executive analytics
      </Text>
      <Text x={20} y={52} size={9} fill={MUTED}>
        Interactive group reporting across brands, countries, users and lead channels
      </Text>

      <LabelPill x={660} y={14} h={26} anchor="end" fill="#ffffff" stroke={LINE} textFill={INK} label="?  How this works" size={9} />
      <Text x={20} y={72} size={7.5} fill={MUTED}>
        Data as of 15 Sep 2026, 09:14
      </Text>

      <rect x={20} y={84} width={640} height={26} rx={10} fill="#fffbeb" />
      <Text x={32} y={101} size={8} fill="#b45309" weight={700}>
        ⚠ One or more figures include a currency with no live exchange rate — added at face value, not converted.
      </Text>

      {/* Left chart — monthly revenue */}
      <rect x={20} y={124} width={310} height={200} rx={16} fill="#ffffff" stroke={LINE} />
      <Text x={34} y={144} size={9.5} weight={800}>
        Monthly revenue
      </Text>
      <Text x={34} y={157} size={7.5} fill={MUTED}>
        Paid quotes, by invoice month (GBP)
      </Text>
      <LabelPill x={314} y={134} h={18} anchor="end" fill="#ffffff" stroke={LINE} textFill={INK} label="⬇ Export" size={7} padX={7} />
      <polyline points="40,290 80,270 120,255 160,260 200,230 240,210 280,190 310,180" fill="none" stroke={PRIMARY} strokeWidth={2.5} />
      <rect x={34} y={300} width={282} height={1} fill={LINE} />

      {/* Right chart — profit by brand */}
      <rect x={350} y={124} width={310} height={200} rx={16} fill="#ffffff" stroke={LINE} />
      <Text x={364} y={144} size={9.5} weight={800}>
        Profit by brand
      </Text>
      <Text x={364} y={157} size={7.5} fill={MUTED}>
        Current month, gross profit (GBP)
      </Text>
      <LabelPill x={644} y={134} h={18} anchor="end" fill="#ffffff" stroke={LINE} textFill={INK} label="⬇ Export" size={7} padX={7} />

      <Text x={364} y={182} size={7.5} fill={MUTED}>
        {BRAND.companyName}
      </Text>
      <rect x={440} y={172} width={190} height={12} rx={3} fill={PRIMARY} />

      <Text x={364} y={206} size={7.5} fill={MUTED}>
        City Removals
      </Text>
      <rect x={440} y={196} width={110} height={12} rx={3} fill={PRIMARY} />

      <Text x={364} y={230} size={7.5} fill={MUTED}>
        Desert Tours
      </Text>
      <rect x={440} y={220} width={60} height={12} rx={3} fill={PRIMARY} />

      <Tag x={20} y={338} label="Every figure here is read-only — reporting, not an input to anything else" />
    </Frame>
  );
}
