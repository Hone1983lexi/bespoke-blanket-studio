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
  const rowCount = 5;
  const columns = compact ? 8 : 10;
  const rowGap = height / (rowCount + 1);
  const colGap = width / columns;
  const stroke = compact ? 12 : large ? 14 : 13;
  const mutedOpacity = (row: number) =>
    protectedAfter && row + 1 > protectedAfter ? 0.24 : 0.96;

  const rows = Array.from({ length: rowCount }, (_, row) => row);
  const cols = Array.from({ length: columns + 1 }, (_, col) => col);

  const stitchLayer = rows.flatMap((row) => {
    const y = rowGap * (row + 1);
    const opacity = mutedOpacity(row);

    if (stitch === "Plain") {
      return [
        <path
          key={"plain-" + row}
          d={`M-20 ${y} C70 ${y - 28}, 140 ${y + 28}, 230 ${y} S390 ${y - 28}, 480 ${y} S640 ${y + 28}, 780 ${y}`}
          fill="none"
          stroke={yarn(row)}
          strokeWidth={stroke}
          opacity={opacity}
          strokeLinecap="round"
        />,
      ];
    }

    if (stitch === "Moss / Linen") {
      return cols.map((col) => {
        const x = col * colGap + (row % 2 ? colGap / 2 : 0);
        return (
          <path
            key={`moss-${row}-${col}`}
            d={`M${x - 24} ${y} Q${x} ${y + 22} ${x + 24} ${y}`}
            fill="none"
            stroke={yarn(row + col)}
            strokeWidth={stroke - 1}
            opacity={opacity}
            strokeLinecap="round"
          />
        );
      });
    }

    if (stitch === "Lemon Peel") {
      return cols.slice(0, columns).map((_, col) => {
        const x = col * colGap + colGap / 2;
        const raised = (row + col) % 2 === 0;
        return (
          <path
            key={`lemon-${row}-${col}`}
            d={raised
              ? `M${x - 15} ${y + 17} L${x} ${y - 16} L${x + 15} ${y + 17}`
              : `M${x - 24} ${y - 2} Q${x} ${y + 20} ${x + 24} ${y - 2}`}
            fill="none"
            stroke={yarn(row + col)}
            strokeWidth={stroke - 1}
            opacity={opacity}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      });
    }

    if (stitch === "V-Stitch") {
      return cols.slice(0, columns).map((_, col) => {
        const x = col * colGap + colGap / 2;
        return (
          <path
            key={`v-${row}-${col}`}
            d={`M${x - 25} ${y - 16} L${x} ${y + 18} L${x + 25} ${y - 16}`}
            fill="none"
            stroke={yarn(row + col)}
            strokeWidth={stroke}
            opacity={opacity}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      });
    }

    if (stitch === "Shell Stitch") {
      return cols.slice(0, columns).map((_, col) => {
        const x = col * colGap + colGap / 2;
        return (
          <path
            key={`shell-${row}-${col}`}
            d={`M${x - 34} ${y + 17} Q${x - 25} ${y - 18} ${x - 17} ${y + 10} Q${x - 8} ${y - 24} ${x} ${y + 10} Q${x + 8} ${y - 24} ${x + 17} ${y + 10} Q${x + 25} ${y - 18} ${x + 34} ${y + 17}`}
            fill="none"
            stroke={yarn(row + col)}
            strokeWidth={stroke - 2}
            opacity={opacity}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      });
    }

    if (stitch === "Waffle Stitch") {
      return cols.slice(0, columns).map((_, col) => {
        const x = col * colGap + 7;
        return (
          <g key={`waffle-${row}-${col}`} opacity={opacity}>
            <rect
              x={x - 25}
              y={y - 20}
              width="50"
              height="40"
              rx="8"
              fill="none"
              stroke={yarn(row + col)}
              strokeWidth={stroke - 3}
            />
            <path
              d={`M${x - 19} ${y - 13} H${x + 19} M${x - 19} ${y + 13} H${x + 19}`}
              stroke={yarn(row + col + 1)}
              strokeWidth="5"
              strokeLinecap="round"
            />
          </g>
        );
      });
    }

    if (stitch === "Block Stitch") {
      return cols.slice(0, columns).flatMap((_, col) => {
        const x = col * colGap + 5;
        const isBlock = (col + row) % 2 === 0;
        return isBlock
          ? [
              <g key={`block-${row}-${col}`} opacity={opacity}>
                <path d={`M${x - 25} ${y - 10} H${x + 25}`} stroke={yarn(row)} strokeWidth={stroke} strokeLinecap="round" />
                <path d={`M${x - 18} ${y + 10} H${x + 18}`} stroke={yarn(row)} strokeWidth={stroke - 3} strokeLinecap="round" />
              </g>,
            ]
          : [
              <path
                key={`block-gap-${row}-${col}`}
                d={`M${x - 22} ${y + 8} Q${x} ${y - 18} ${x + 22} ${y + 8}`}
                fill="none"
                stroke={yarn(row + 1)}
                strokeWidth={stroke - 2}
                opacity={opacity}
                strokeLinecap="round"
              />,
            ];
      });
    }

    if (stitch === "Granny Stripe") {
      return Array.from({ length: 5 }, (_, cluster) => {
        const x = cluster * (width / 5) + width / 10;
        return (
          <g key={`granny-${row}-${cluster}`} opacity={opacity}>
            <path
              d={`M${x - 26} ${y + 14} C${x - 18} ${y - 16}, ${x - 8} ${y - 16}, ${x} ${y + 14} C${x + 8} ${y - 16}, ${x + 18} ${y - 16}, ${x + 26} ${y + 14}`}
              fill="none"
              stroke={yarn(row)}
              strokeWidth={stroke - 1}
              strokeLinecap="round"
            />
          </g>
        );
      });
    }

    return [];
  });

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-full min-h-[150px] w-full"
        role="img"
        aria-label={`${stitch} crochet stitch structure preview`}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id={`fabric-${safeId(stitch)}-${compact ? "compact" : "large"}`} x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#f0dfcc" />
            <stop offset="100%" stopColor="#d8bda3" />
          </linearGradient>
        </defs>
        <rect width={width} height={height} fill={`url(#fabric-${safeId(stitch)}-${compact ? "compact" : "large"})`} />
        <g>{stitchLayer}</g>
        <rect x="2" y="2" width={width - 4} height={height - 4} rx="14" fill="none" stroke="#c7a98a" strokeWidth="4" />
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
