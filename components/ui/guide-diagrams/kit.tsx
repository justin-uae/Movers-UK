/**
 * Small SVG primitives shared by the per-page guide diagrams in this folder.
 * These are stylised wireframes of the real layout (not screenshots) so they
 * stay cheap to keep in sync and never depend on live data or a login.
 *
 * Sizing note: the diagram is drawn on a 680×440 canvas and rendered inside
 * the guide modal's wide (max-w-4xl) screenshot slot, which scales it up to
 * roughly 1.25× — the font sizes below are picked so that scaled-up result
 * lands around 9.5–20px on screen, not the raw viewBox numbers.
 */

const INK = "#0f172a"; // slate-900
const MUTED = "#94a3b8"; // slate-400
const LINE = "#e2e8f0"; // slate-200
const FAINT = "#f1f5f9"; // slate-100
const PRIMARY = "#f97316"; // primary-500
const PRIMARY_SOFT = "#ffedd5"; // primary-100

export const diagramPalette = { INK, MUTED, LINE, FAINT, PRIMARY, PRIMARY_SOFT };

export const DIAGRAM_W = 680;
export const DIAGRAM_H = 460;

/** Browser-chrome wrapper every diagram renders inside — gives the wireframe a "this is a webpage" frame without pretending to be a specific browser. */
export function Frame({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox={`0 0 ${DIAGRAM_W} ${DIAGRAM_H}`}
      className="w-full rounded-2xl border border-slate-200 bg-white"
      role="img"
    >
      <rect x={0} y={0} width={DIAGRAM_W} height={DIAGRAM_H} rx={16} fill="#ffffff" />
      <rect x={0} y={0} width={DIAGRAM_W} height={30} rx={16} fill={FAINT} />
      <rect x={0} y={15} width={DIAGRAM_W} height={15} fill={FAINT} />
      <circle cx={17} cy={15} r={4} fill="#fca5a5" />
      <circle cx={31} cy={15} r={4} fill="#fcd34d" />
      <circle cx={45} cy={15} r={4} fill="#86efac" />
      <rect x={64} y={9} width={DIAGRAM_W - 86} height={12} rx={6} fill="#e2e8f0" />
      <g transform="translate(0, 30)">{children}</g>
    </svg>
  );
}

export function Text({
  x,
  y,
  children,
  size = 9,
  weight = 400,
  fill = INK,
  anchor = "start",
  uppercase,
  letterSpacing,
}: {
  x: number;
  y: number;
  children: React.ReactNode;
  size?: number;
  weight?: number;
  fill?: string;
  anchor?: "start" | "middle" | "end";
  uppercase?: boolean;
  letterSpacing?: number;
}) {
  return (
    <text
      x={x}
      y={y}
      fontSize={size}
      fontWeight={weight}
      fill={fill}
      textAnchor={anchor}
      letterSpacing={letterSpacing}
      style={uppercase ? { textTransform: "uppercase" } : undefined}
    >
      {children}
    </text>
  );
}

export function Pill({
  x,
  y,
  w,
  h = 18,
  fill,
  stroke,
  rx = 9,
}: {
  x: number;
  y: number;
  w: number;
  h?: number;
  fill: string;
  stroke?: string;
  rx?: number;
}) {
  return <rect x={x} y={y} width={w} height={h} rx={rx} fill={fill} stroke={stroke} strokeWidth={stroke ? 1.25 : 0} />;
}

/** Rough but reliable text-width estimate for bold-ish SVG labels — used to size pills so text never clips. */
export function measurePillWidth(label: string, size = 8, padX = 10) {
  return label.length * size * 0.62 + padX * 2;
}

/** A pill with centered text — the standard shape for status/source badges and row-action buttons, sized to fit its own label so text never clips. */
export function LabelPill({
  x,
  y,
  h = 18,
  fill,
  stroke,
  textFill,
  label,
  size = 8,
  weight = 700,
  padX = 10,
  rx = 9,
  anchor = "middle",
}: {
  x: number;
  y: number;
  h?: number;
  fill: string;
  stroke?: string;
  textFill: string;
  label: string;
  size?: number;
  weight?: number;
  padX?: number;
  rx?: number;
  /** "middle" centers the pill on x; "start" grows the pill rightward from x; "end" grows it leftward so its right edge sits at x. */
  anchor?: "middle" | "start" | "end";
}) {
  const w = measurePillWidth(label, size, padX);
  const rectX = anchor === "middle" ? x - w / 2 : anchor === "end" ? x - w : x;
  return (
    <g>
      <rect x={rectX} y={y} width={w} height={h} rx={rx} fill={fill} stroke={stroke} strokeWidth={stroke ? 1.25 : 0} />
      <text x={rectX + w / 2} y={y + h / 2 + size * 0.35} fontSize={size} fontWeight={weight} fill={textFill} textAnchor="middle">
        {label}
      </text>
    </g>
  );
}

/** A small dark corner tag that labels a region of the wireframe — the annotation layer, standing in for callout numbers so the diagram reads on its own. */
export function Tag({ x, y, label, align = "start" }: { x: number; y: number; label: string; align?: "start" | "end" }) {
  const size = 8;
  const w = label.length * size * 0.58 + 16;
  const rx = align === "end" ? x - w : x;
  return (
    <g>
      <rect x={rx} y={y} width={w} height={17} rx={8.5} fill={INK} opacity={0.92} />
      <text x={rx + w / 2} y={y + 11.8} fontSize={size} fontWeight={700} fill="#ffffff" textAnchor="middle">
        {label}
      </text>
    </g>
  );
}

/**
 * A rounded card block (the "list of cards" pattern used by Bookings,
 * Dispatch, Customer Experience, etc. instead of a table). Children are
 * drawn in a coordinate system local to the card's padded top-left corner,
 * so callers don't have to re-add x/y offsets for every element.
 */
export function Card({
  x = 20,
  y,
  w = 640,
  h = 88,
  pad = 16,
  fill = "#ffffff",
  children,
}: {
  x?: number;
  y: number;
  w?: number;
  h?: number;
  pad?: number;
  fill?: string;
  children: React.ReactNode;
}) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={14} fill={fill} stroke={LINE} />
      <g transform={`translate(${x + pad}, ${y + pad})`}>{children}</g>
    </g>
  );
}

export function Kpi({ x, y, w, label, value }: { x: number; y: number; w: number; label: string; value: string }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={50} rx={11} fill="#ffffff" stroke={LINE} />
      <Text x={x + 12} y={y + 19} size={7.5} fill={MUTED} weight={700} uppercase>
        {label}
      </Text>
      <Text x={x + 12} y={y + 39} size={16} fill={INK} weight={800}>
        {value}
      </Text>
    </g>
  );
}
