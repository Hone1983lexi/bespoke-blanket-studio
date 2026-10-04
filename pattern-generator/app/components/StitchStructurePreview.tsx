"use client";

import type { StitchRecipe } from "../lib/stitch-library";

type Stitch = StitchRecipe["name"];

type Props = {
  stitch: Stitch;
  colors: readonly string[];
  large?: boolean;
  compact?: boolean;
  widthUnits?: number;
  rowUnits?: number;
  protectedAfter?: number;
};

const safeId = (value: string) => value.replace(/[^a-z0-9]/gi, "").toLowerCase();

export default function StitchStructurePreview({
  stitch,
  colors,
  large = false,
  compact = false,
  widthUnits,
  rowUnits,
  protectedAfter,
}: Props) {
  const palette = colors.length ? colors : ["#ead8c8", "#c7a98a", "#9b7659", "#6d5547"];
  const yarn = (i: number) => palette[i % palette.length];
  const width = large ? 760 : 600;
  const height = compact ? 190 : large ? 300 : 240;
  const rowCount = compact ? 4 : 5;
  const columns = compact ? 7 : 9;
  const rowGap = height / (rowCount + 1);
  const colGap = width / columns;
  const stroke = compact ? 15 : large ? 18 : 16;
  const mutedOpacity = (row: number) =>
    protectedAfter && row + 1 > protectedAfter ? 0.22 : 1;

  const yarnPath = (
    key: string,
    d: string,
    color: string,
    opacity: number,
    widthPx = stroke,
  ) => (
    <g key={key} opacity={opacity} filter={`url(#yarn-shadow-${safeId(stitch)})`}>
      <path d={d} fill="none" stroke="#6b5548" strokeWidth={widthPx + 7} strokeLinecap="round" strokeLinejoin="round" opacity="0.2" />
      <path d={d} fill="none" stroke={color} strokeWidth={widthPx} strokeLinecap="round" strokeLinejoin="round" />
      <path d={d} fill="none" stroke="#fff8ee" strokeWidth={Math.max(2, widthPx * 0.18)} strokeLinecap="round" strokeLinejoin="round" opacity="0.52" />
      <path d={d} fill="none" stroke="#6f584a" strokeWidth={Math.max(1.5, widthPx * 0.12)} strokeLinecap="round" strokeLinejoin="round" opacity="0.24" strokeDasharray="2 7" />
    </g>
  );

  const rows = Array.from({ length: rowCount }, (_, row) => row);
  const motifs = rows.flatMap((row) => {
    const y = rowGap * (row + 1);
    const opacity = mutedOpacity(row);

    if (stitch === "Plain") {
      return Array.from({ length: columns }, (_, col) => {
        const x = col * colGap + colGap / 2;
        const d = `M${x - 30} ${y + 8} C${x - 18} ${y - 20}, ${x + 18} ${y - 20}, ${x + 30} ${y + 8}`;
        return yarnPath(`plain-${row}-${col}`, d, yarn(row), opacity);
      });
    }

    if (stitch === "Moss / Linen") {
      return Array.from({ length: columns }, (_, col) => {
        const x = col * colGap + colGap / 2 + (row % 2 ? colGap / 2 : 0);
        const d = `M${x - 25} ${y + 8} Q${x - 8} ${y - 24} ${x + 25} ${y + 8}`;
        return yarnPath(`moss-${row}-${col}`, d, yarn(row + col), opacity, stroke - 1);
      });
    }

    if (stitch === "Lemon Peel") {
      return Array.from({ length: columns }, (_, col) => {
        const x = col * colGap + colGap / 2;
        const raised = (row + col) % 2 === 0;
        const d = raised
          ? `M${x - 22} ${y + 12} Q${x} ${y - 28} ${x + 22} ${y + 12}`
          : `M${x - 28} ${y - 4} Q${x} ${y + 28} ${x + 28} ${y - 4}`;
        return yarnPath(`lemon-${row}-${col}`, d, yarn(row + col), opacity, stroke - 1);
      });
    }

    if (stitch === "V-Stitch") {
      return Array.from({ length: columns }, (_, col) => {
        const x = col * colGap + colGap / 2;
        const dLeft = `M${x - 30} ${y - 18} L${x} ${y + 22}`;
        const dRight = `M${x} ${y + 22} L${x + 30} ${y - 18}`;
        return <g key={`v-${row}-${col}`}>{yarnPath(`v-l-${row}-${col}`, dLeft, yarn(row + col), opacity, stroke - 1)}{yarnPath(`v-r-${row}-${col}`, dRight, yarn(row + col), opacity, stroke - 1)}</g>;
        return yarnPath(`v-${row}-${col}`, d, yarn(row + col), opacity, stroke);
      });
    }

    if (stitch === "Shell Stitch") {
      return Array.from({ length: columns }, (_, col) => {
        const x = col * colGap + colGap / 2;
        const arcs = Array.from({ length: 5 }, (_, i) => {
          const sx = x - 34 + i * 17;
          return yarnPath(
            `shell-${row}-${col}-${i}`,
            `M${sx} ${y + 20} Q${sx + 8} ${y - 30} ${sx + 16} ${y + 20}`,
            yarn(row + col + i),
            opacity,
            stroke - 3,
          );
        });
        return <g key={`shell-${row}-${col}`}>{arcs}</g>;
      });
    }

    if (stitch === "Waffle Stitch") {
      return Array.from({ length: columns }, (_, col) => {
        const x = col * colGap + colGap / 2;
        const d1 = `M${x - 30} ${y - 22} L${x - 10} ${y + 18} L${x + 10} ${y - 22} L${x + 30} ${y + 18}`;
        const d2 = `M${x - 30} ${y + 22} L${x - 10} ${y - 18} L${x + 10} ${y + 22} L${x + 30} ${y - 18}`;
        return <g key={`waffle-${row}-${col}`}>{yarnPath(`w1-${row}-${col}`, d1, yarn(row + col), opacity, stroke - 2)}{yarnPath(`w2-${row}-${col}`, d2, yarn(row + col + 1), opacity, stroke - 2)}</g>;
      });
    }

    if (stitch === "Block Stitch") {
      return Array.from({ length: columns }, (_, col) => {
        const x = col * colGap + colGap / 2;
        const d = (row + col) % 2 === 0
          ? `M${x - 30} ${y - 12} Q${x} ${y + 18} ${x + 30} ${y - 12}`
          : `M${x - 28} ${y + 14} Q${x} ${y - 16} ${x + 28} ${y + 14}`;
        return yarnPath(`block-${row}-${col}`, d, yarn(row + col), opacity);
      });
    }

    if (stitch === "Granny Stripe") {
      return Array.from({ length: columns }, (_, col) => {
        const x = col * colGap + colGap / 2;
        const d = `M${x - 28} ${y + 16} Q${x - 14} ${y - 20} ${x} ${y + 16} Q${x + 14} ${y - 20} ${x + 28} ${y + 16}`;
        return yarnPath(`granny-${row}-${col}`, d, yarn(row), opacity, stroke - 1);
      });
    }

    return [];
  });

  const bgId = `fabric-${safeId(stitch)}-${compact ? "compact" : "large"}`;
  const shadowId = `yarn-shadow-${safeId(stitch)}`;

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl bg-[#cbb39b]">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-full min-h-[150px] w-full"
        role="img"
        aria-label={`${stitch} realistic crochet fabric preview`}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id={bgId} x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#f5e8d9" />
            <stop offset="48%" stopColor="#d8bea5" />
            <stop offset="100%" stopColor="#b99b80" />
          </linearGradient>
          <filter id={shadowId} x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="3" stdDeviation="2.5" floodOpacity="0.28" />
          </filter>
          <filter id={`texture-${safeId(stitch)}`} x="-20%" y="-20%" width="140%" height="140%">
            <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="7" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.5" />
          </filter>
        </defs>
        <rect width={width} height={height} fill={`url(#${bgId})`} />
        <g filter={`url(#texture-${safeId(stitch)})`}>{motifs}</g>
        <rect width={width} height={height} fill="none" stroke="#fff7ed" strokeWidth="5" opacity="0.38" />
      </svg>
      {(widthUnits || rowUnits) && (
        <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between rounded-lg bg-[#f7eee4]/90 px-3 py-1.5 text-[10px] font-medium text-[#78695d] backdrop-blur-sm">
          <span>{widthUnits ? widthUnits + " chains" : ""}</span>
          <span>{rowUnits ? rowUnits + " rows" : ""}</span>
        </div>
      )}
    </div>
  );
}
