"use client";

import { SignInButton, UserButton, useUser } from "@clerk/nextjs";
import { useEffect, useMemo, useState } from "react";

type Stitch = "Single Crochet" | "Half Double Crochet" | "Double Crochet";
type CheckoutMode = "payment" | "subscription";

type GeneratedPattern = {
  title: string;
  stitch: Stitch;
  startingChain: number;
  totalRows: number;
  rows: Array<{
    rowNumber: number;
    instruction: string;
    stitchCount: number;
  }>;
};

export default function PatternForm() {
  const { isLoaded, isSignedIn, user } = useUser();
  const [stitchGauge, setStitchGauge] = useState("");
  const [rowGauge, setRowGauge] = useState("");
  const [width, setWidth] = useState("");
  const [length, setLength] = useState("");
  const [selectedStitch, setSelectedStitch] = useState<Stitch>("Single Crochet");
  const [pattern, setPattern] = useState<GeneratedPattern | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");
  const [completedRows, setCompletedRows] = useState<number[]>([]);

  const isPro = user?.publicMetadata?.subscriptionStatus === "active";

  const counterKey = pattern
    ? "bespoke-crochet-row-counter:" + pattern.title + ":" + pattern.stitch + ":" + pattern.startingChain + ":" + pattern.totalRows
    : "";

  useEffect(() => {
    if (!pattern || !counterKey) {
      setCompletedRows([]);
      return;
    }
    try {
      const saved = window.localStorage.getItem(counterKey);
      const parsed = saved ? JSON.parse(saved) : [];
      setCompletedRows(
        Array.isArray(parsed) ? parsed.filter((n: unknown) => Number.isInteger(n)) : [],
      );
    } catch {
      setCompletedRows([]);
    }
  }, [pattern, counterKey]);

  useEffect(() => {
    if (!counterKey) return;
    try {
      window.localStorage.setItem(counterKey, JSON.stringify(completedRows));
    } catch {}
  }, [completedRows, counterKey]);

  function toggleRow(rowNumber: number) {
    setCompletedRows((current) =>
      current.includes(rowNumber)
        ? current.filter((row) => row !== rowNumber)
        : [...current, rowNumber].sort((a, b) => a - b),
    );
  }

  function resetRowCounter() {
    setCompletedRows([]);
  }

  const blueprint = useMemo(() => {
    const gauge = Number(stitchGauge);
    const rows = Number(rowGauge);
    const desiredWidth = Number(width);
    const desiredLength = Number(length);

    if (!gauge || !rows || !desiredWidth || !desiredLength) return null;
    if (gauge <= 0 || rows <= 0 || desiredWidth <= 0 || desiredLength <= 0) return null;

    return {
      startingChain: Math.round(desiredWidth * (gauge / 4)),
      totalRows: Math.round(desiredLength * (rows / 4)),
    };
  }, [stitchGauge, rowGauge, width, length]);

  async function startCheckout(mode: CheckoutMode) {
    if (!blueprint) return;

    setIsGenerating(true);
    setError("");
    setPattern(null);

    try {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          startingChain: blueprint.startingChain,
          totalRows: blueprint.totalRows,
          selectedStitch,
          stitchGauge: Number(stitchGauge),
          rowGauge: Number(rowGauge),
          width: Number(width),
          length: Number(length),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to start secure checkout.");
      }

      if (!data.url) {
        throw new Error("Stripe checkout URL was not returned.");
      }

      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setIsGenerating(false);
    }
  }

  async function generateWithPro() {
    if (!blueprint || !isPro) return;

    setIsGenerating(true);
    setError("");
    setPattern(null);

    try {
      const response = await fetch("/api/generate-pattern", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startingChain: blueprint.startingChain,
          totalRows: blueprint.totalRows,
          selectedStitch,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to generate your pattern.");
      }

      setPattern(data.pattern);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl">
      <div className="rounded-3xl border border-[#d2c0ad] bg-[#f7eee4] p-6 shadow-sm sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-[#78695d]">
              Bespoke Crochet
            </p>
            <h1 className="mt-2 font-serif text-3xl text-[#302b27] sm:text-4xl">
              Pattern Generator
            </h1>
          </div>
          {isLoaded && (
            <div className="flex items-center gap-3">
              {isSignedIn ? (
                <>
                  <span className="hidden text-right text-xs text-[#66594f] sm:block">
                    {isPro ? "Pro Membership active" : "Signed in"}
                  </span>
                  <UserButton />
                </>
              ) : (
                <SignInButton mode="modal">
                  <button
                    type="button"
                    className="rounded-xl border border-[#c6b29f] bg-[#f7eee4] px-4 py-2 text-sm font-medium text-[#46392f]"
                  >
                    Sign in
                  </button>
                </SignInButton>
              )}
            </div>
          )}
        </div>

        <p className="mt-3 max-w-2xl text-sm leading-6 text-[#66594f]">
          Enter your gauge and finished size. Your blueprint is calculated first,
          then your paid or Pro generation is validated before AI generation runs.
        </p>

        <div className="mt-8 grid gap-5 sm:grid-cols-2">
          {[
            ["stitch-gauge", "Stitch Gauge", stitchGauge, setStitchGauge, "sts / 4\""],
            ["row-gauge", "Row Gauge", rowGauge, setRowGauge, "rows / 4\""],
            ["desired-width", "Desired Width", width, setWidth, "inches"],
            ["desired-length", "Desired Length", length, setLength, "inches"],
          ].map(([id, label, value, setter, unit]) => (
            <label key={id as string} htmlFor={id as string} className="block">
              <span className="mb-2 block text-sm font-medium text-[#46392f]">
                {label as string}
              </span>
              <div className="flex">
                <input
                  id={id as string}
                  type="number"
                  min="1"
                  step="0.5"
                  value={value as string}
                  onChange={(e) => (setter as (value: string) => void)(e.target.value)}
                  className="min-w-0 flex-1 rounded-l-xl border border-[#cdbca9] bg-[#f5ece2] px-4 py-3 outline-none focus:border-[#8a7564] focus:ring-2 focus:ring-[#d8c8b8]"
                />
                <span className="flex items-center rounded-r-xl border border-l-0 border-[#cdbca9] bg-[#e3d4c5] px-3 text-xs text-[#78695d]">
                  {unit as string}
                </span>
              </div>
            </label>
          ))}

          <label htmlFor="selected-stitch" className="block sm:col-span-2">
            <span className="mb-2 block text-sm font-medium text-[#46392f]">
              Selected Stitch
            </span>
            <select
              id="selected-stitch"
              value={selectedStitch}
              onChange={(e) => setSelectedStitch(e.target.value as Stitch)}
              className="w-full rounded-xl border border-[#b99b84] bg-[#f7eee4] px-4 py-3 outline-none focus:border-[#8a7564] focus:ring-2 focus:ring-[#d8c8b8]"
            >
              <option>Single Crochet</option>
              <option>Half Double Crochet</option>
              <option>Double Crochet</option>
            </select>

            <div className="mt-4 overflow-hidden rounded-2xl border border-[#d2c0ad] bg-[#fbf6ef]">
              <div className="grid gap-0 sm:grid-cols-[180px_1fr]">
                <div className="flex flex-col justify-center border-b border-[#d2c0ad] p-4 sm:border-b-0 sm:border-r">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#78695d]">
                    Stitch Preview
                  </p>
                  <p className="mt-2 text-base font-semibold text-[#302b27]">
                    {selectedStitch}
                  </p>
                  <p className="mt-1 text-sm leading-5 text-[#66594f]">
                    {stitchDescription(selectedStitch)}
                  </p>
                </div>
                <div className="min-h-[150px] p-3 sm:p-4">
                  <StitchPreview stitch={selectedStitch} />
                </div>
              </div>
            </div>
          </label>
        </div>

        <section className="mt-8 rounded-2xl border border-[#d2c0ad] bg-[#eee2d6] p-5 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#78695d]">
            Pattern Blueprint
          </p>

          {!blueprint ? (
            <p className="mt-3 text-sm text-[#66594f]">
              Enter all four measurements to calculate the blueprint.
            </p>
          ) : (
            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              <BlueprintCard label="Starting Chain" value={blueprint.startingChain} suffix="chains" />
              <BlueprintCard label="Total Rows" value={blueprint.totalRows} suffix="rows" />
              <BlueprintCard label="Stitch" value={selectedStitch} />
            </div>
          )}
        </section>

        {error && (
          <div className="mt-6 rounded-xl border border-[#d8aaa0] bg-[#f3ddd6] p-4 text-sm text-[#925247]">
            {error}
          </div>
        )}

        <section className="mt-6 rounded-2xl border border-[#d2c0ad] bg-[#eee2d6] p-5 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <button
              type="button"
              disabled={!blueprint || isGenerating}
              onClick={() => void startCheckout("payment")}
              className="rounded-xl border border-[#c4ad98] bg-[#f7eee4] px-5 py-4 text-left font-semibold text-[#302b27] shadow-sm transition hover:bg-[#e8d9ca] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span className="block">Unlock This Pattern Only (£2.99)</span>
              <span className="mt-1 block text-xs font-normal text-[#66594f]">
                One custom pattern · no membership required
              </span>
            </button>

            {isSignedIn ? (
              <button
                type="button"
                disabled={!blueprint || isGenerating}
                onClick={() =>
                  isPro ? void generateWithPro() : void startCheckout("subscription")
                }
                className="rounded-xl bg-[#72513d] px-5 py-4 text-left font-semibold text-white shadow-sm transition hover:bg-[#5e4030] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span className="block">
                  {isPro
                    ? "Generate with Pro Membership"
                    : "Join Pro Membership (£7.99/mo)"}
                </span>
                <span className="mt-1 block text-xs font-normal text-white/85">
                  {isPro
                    ? "Unlimited generations included"
                    : "Unlimited generations · secure recurring billing"}
                </span>
              </button>
            ) : (
              <SignInButton mode="modal">
                <button
                  type="button"
                  disabled={!blueprint || isGenerating}
                  className="rounded-xl bg-[#72513d] px-5 py-4 text-left font-semibold text-white shadow-sm transition hover:bg-[#5e4030] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <span className="block">Join Pro Membership (£7.99/mo)</span>
                  <span className="mt-1 block text-xs font-normal text-white/85">
                    Sign in to start your Pro membership
                  </span>
                </button>
              </SignInButton>
            )}
          </div>

          <p className="mt-4 text-center text-xs text-[#66594f]">
            Secure payments are handled by Stripe. Pro Membership is managed through
            your authenticated account.
          </p>
        </section>

        {pattern && (
          <section className="mt-8 rounded-2xl border border-[#d2c0ad] bg-[#f7eee4]">
            <div className="border-b border-[#d2c0ad] p-5 sm:p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#78695d]">
                Generated Pattern
              </p>
              <h2 className="mt-2 font-serif text-2xl text-[#302b27]">{pattern.title}</h2>
              <p className="mt-2 text-sm text-[#66594f]">
                {pattern.stitch} · {pattern.startingChain} sts · {pattern.totalRows} rows
              </p>
            </div>

            <div className="divide-y divide-[#d2c0ad]">
              {pattern.rows.map((row) => (
                <article key={row.rowNumber} className="p-5 sm:p-6">
                  <div className="flex items-center justify-between gap-4">
                    <h3 className="font-semibold text-[#302b27]">Row {row.rowNumber}</h3>
                    <span className="text-xs text-[#78695d]">{row.stitchCount} sts</span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-stone-700">{row.instruction}</p>
                </article>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function stitchDescription(stitch: Stitch) {
  switch (stitch) {
    case "Half Double Crochet":
      return "A soft, medium-height fabric with a little more drape.";
    case "Double Crochet":
      return "A taller, open stitch that creates a lighter, more flowing fabric.";
    default:
      return "A neat, dense stitch with a firm, even texture.";
  }
}

function StitchPreview({ stitch }: { stitch: Stitch }) {
  const cols = 9;
  const rows = 6;

  return (
    <div className="h-full min-h-[150px] rounded-xl border border-[#d6c3ae] bg-[#e7d5c1] p-2 shadow-inner">
      <svg
        viewBox="0 0 420 190"
        className="h-full min-h-[142px] w-full"
        role="img"
        aria-label={stitch + " crocheted fabric swatch preview"}
      >
        <defs>
          <linearGradient id="swatch-base" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f0dfcc" />
            <stop offset="100%" stopColor="#dcc2a8" />
          </linearGradient>
          <filter id="yarn-soft" x="-20%" y="-20%" width="140%" height="140%">
            <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="7" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.1" />
          </filter>
          <filter id="yarn-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="1.2" stdDeviation="1.2" floodColor="#704d37" floodOpacity="0.24" />
          </filter>
          <pattern id="fine-yarn" width="5" height="5" patternUnits="userSpaceOnUse">
            <path d="M-1 4 L4 -1 M1 6 L6 1" stroke="#fff7ed" strokeOpacity="0.16" strokeWidth="0.7" />
          </pattern>
        </defs>

        <rect x="8" y="8" width="404" height="174" rx="18" fill="url(#swatch-base)" />
        <rect x="8" y="8" width="404" height="174" rx="18" fill="url(#fine-yarn)" />

        <g filter="url(#yarn-soft)" opacity="0.96">
          {Array.from({ length: rows }).map((_, row) =>
            Array.from({ length: cols }).map((__, col) => {
              const x = 35 + col * 43 + (row % 2 ? 21.5 : 0);
              const y = 30 + row * 25;
              const key = stitch + "-" + row + "-" + col;

              if (stitch === "Double Crochet") {
                return (
                  <g key={key} transform={"translate(" + x + " " + y + ")"} filter="url(#yarn-shadow)">
                    <path d="M0 18 C-1 8 1-1 9-1 C18-1 20 9 17 19" fill="none" stroke="#966f50" strokeWidth="8" strokeLinecap="round" />
                    <path d="M9 1 C8 7 9 13 9 23" fill="none" stroke="#6f4b35" strokeWidth="5" strokeLinecap="round" />
                    <path d="M3 3 C6 0 12 0 15 3" fill="none" stroke="#c19b79" strokeWidth="2" strokeLinecap="round" />
                  </g>
                );
              }

              if (stitch === "Half Double Crochet") {
                return (
                  <g key={key} transform={"translate(" + x + " " + y + ")"} filter="url(#yarn-shadow)">
                    <path d="M0 18 C1 5 5 0 10 0 C16 0 20 7 19 18" fill="none" stroke="#966f50" strokeWidth="9" strokeLinecap="round" />
                    <path d="M10 3 C9 8 9 13 10 21" fill="none" stroke="#704c36" strokeWidth="4.5" strokeLinecap="round" />
                    <path d="M4 4 C8 1 13 1 16 4" fill="none" stroke="#c29b78" strokeWidth="2" strokeLinecap="round" />
                  </g>
                );
              }

              return (
                <g key={key} transform={"translate(" + x + " " + y + ")"} filter="url(#yarn-shadow)">
                  <path d="M0 17 C1 6 5 1 10 1 C16 1 19 7 18 17" fill="none" stroke="#966f50" strokeWidth="9" strokeLinecap="round" />
                  <path d="M9 4 C8 9 9 14 9 20" fill="none" stroke="#704c36" strokeWidth="4.5" strokeLinecap="round" />
                  <path d="M4 5 C8 2 13 2 15 5" fill="none" stroke="#c29b78" strokeWidth="2" strokeLinecap="round" />
                </g>
              );
            }),
          )}
        </g>

        <path
          d="M25 164 C95 171 160 159 225 166 C290 173 340 160 395 166"
          fill="none"
          stroke="#b58d6c"
          strokeOpacity="0.55"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

function BlueprintCard({
  label,
  value,
  suffix,
}: {
  label: string;
  value: string | number;
  suffix?: string;
}) {
  return (
    <div className="rounded-xl border border-[#d2c0ad] bg-[#f7eee4] p-5">
      <p className="text-sm text-[#78695d]">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-[#302b27]">{value}</p>
      {suffix && <p className="mt-1 text-xs text-[#78695d]">{suffix}</p>}
    </div>
  );
}
