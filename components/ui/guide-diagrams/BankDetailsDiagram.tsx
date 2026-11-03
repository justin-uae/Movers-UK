import { Frame, Text, LabelPill, Tag, diagramPalette } from "./kit";

const { INK, MUTED, LINE, PRIMARY } = diagramPalette;

/** Annotated wireframe of Settings → Bank Details & Terms — mirrors settings/bank-details/page.tsx's payment-profile list and the Terms & Conditions editor. */
export function BankDetailsDiagram() {
  return (
    <Frame>
      <Text x={20} y={18} size={8} fill={PRIMARY} weight={800} uppercase letterSpacing={0.4}>
        Administration
      </Text>
      <Text x={20} y={37} size={17} weight={800}>
        Bank Details &amp; Terms
      </Text>
      <Text x={20} y={52} size={9} fill={MUTED}>
        Payment profiles and the Terms &amp; Conditions boilerplate shown to customers on quotes and invoices
      </Text>

      <LabelPill x={660} y={14} h={26} anchor="end" fill="#ffffff" stroke={LINE} textFill={INK} label="?  How this works" size={9} />

      <Text x={20} y={78} size={10} weight={800}>
        Payment profiles
      </Text>
      <Text x={20} y={91} size={7.5} fill={MUTED}>
        Shown on the public quote page, invoice and quote PDF — matched to the quote's own currency
      </Text>

      <rect x={20} y={104} width={640} height={54} rx={14} fill="#ffffff" stroke={LINE} />
      <Text x={34} y={124} size={9} weight={800}>
        GBP account
      </Text>
      <LabelPill x={116} y={114} h={14} anchor="start" fill="#f0fdf4" textFill="#16a34a" label="GBP" size={6.5} padX={6} />
      <Text x={34} y={140} size={7.5} fill={MUTED}>
        Emirates NBD · IBAN AE07 0260 0010 •••• •••• 01
      </Text>
      <LabelPill x={648} y={122} h={18} anchor="end" fill="#ffffff" stroke={LINE} textFill={INK} label="Edit" size={7} padX={8} />

      <rect x={20} y={166} width={640} height={54} rx={14} fill="#ffffff" stroke={LINE} />
      <Text x={34} y={186} size={9} weight={800}>
        GBP account
      </Text>
      <LabelPill x={116} y={176} h={14} anchor="start" fill="#eff6ff" textFill="#2563eb" label="GBP" size={6.5} padX={6} />
      <Text x={34} y={202} size={7.5} fill={MUTED}>
        Barclays · IBAN GB29 NWBK •••• •••• •••• 01
      </Text>
      <LabelPill x={648} y={184} h={18} anchor="end" fill="#ffffff" stroke={LINE} textFill={INK} label="Edit" size={7} padX={8} />

      <LabelPill x={20} y={230} h={22} anchor="start" fill="#f1f5f9" textFill={INK} label="+ Add payment profile" size={7.5} padX={9} />

      <rect x={20} y={268} width={640} height={1} fill={LINE} />
      <Text x={20} y={288} size={10} weight={800}>
        Terms &amp; Conditions
      </Text>
      <Text x={20} y={301} size={7.5} fill={MUTED}>
        Fallback shown whenever a quote has no per-quote override
      </Text>
      <rect x={20} y={312} width={640} height={80} rx={12} fill="#f8fafc" stroke={LINE} />
      <Text x={32} y={330} size={7.5} fill="#94a3b8">
        Standard cancellation, liability and payment terms text…
      </Text>
      <LabelPill x={660} y={402} h={24} anchor="end" fill={PRIMARY} textFill="#ffffff" label="Save" size={8} padX={11} />

      <Tag x={20} y={420} label="A specific quote can still override this text per-quote when priced" />
    </Frame>
  );
}
