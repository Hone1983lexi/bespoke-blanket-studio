"use client";

import { SignInButton, UserButton, useUser } from "@clerk/nextjs";
import { useEffect, useMemo, useState } from "react";
import { STITCH_CATEGORIES, STITCH_LIBRARY, type StitchRecipe } from "../lib/stitch-library";

type Stitch = StitchRecipe["name"];
type PatternStyle = Stitch;
type CheckoutMode = "payment" | "subscription";

const STITCH_OPTIONS = STITCH_LIBRARY;

const PALETTES = [
  { name: "Warm Neutral", colors: ["#ead8c8", "#c7a98a", "#9b7659", "#6d5547"] },
  { name: "Sunset", colors: ["#f2d0b7", "#d98f72", "#b85f55", "#6d4141"] },
  { name: "Ocean", colors: ["#d6e5e5", "#8db7bd", "#4f808b", "#315766"] },
  { name: "Pastel", colors: ["#f2dce0", "#d8c8e7", "#b8d8d0", "#e8d6b8"] },
  { name: "Rainbow", colors: ["#e68b8b", "#e5b66d", "#c9d17e", "#7fb4a7"] },
  { name: "Forest", colors: ["#d8d7c2", "#a7b28a", "#71836c", "#46564b"] },
] as const;

type GeneratedPattern = {
  title: string;
  stitch: Stitch;
  style?: PatternStyle;
  startingChain: number;
  totalRows: number;
  rows: Array<{
    rowNumber: number;
    instruction: string;
    stitchCount: number;
    countLabel?: string;
  }>;
  terminology: "UK" | "US";
  palette?: string;
  notes?: string[];
};

type PreviewRow = {
  rowNumber: number;
  label: string;
  text: string;
};

export default function PatternForm() {
  const { isLoaded, isSignedIn, user } = useUser();
  const [stitchGauge, setStitchGauge] = useState("");
  const [rowGauge, setRowGauge] = useState("");
  const [width, setWidth] = useState("");
  const [length, setLength] = useState("");
  const [selectedStitch, setSelectedStitch] = useState<Stitch>("Plain");
  const [terminology, setTerminology] = useState<"UK" | "US">("UK");
  const [selectedStyle, setSelectedStyle] = useState<PatternStyle>("Plain");
  const [selectedPalette, setSelectedPalette] = useState("Warm Neutral");
  const [pattern, setPattern] = useState<GeneratedPattern | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");
  const [checkoutMessage, setCheckoutMessage] = useState("");
  const [completedRows, setCompletedRows] = useState<number[]>([]);

  const isPro = user?.publicMetadata?.subscriptionStatus === "active";

  const counterKey = pattern
    ? "bespoke-crochet-row-counter:" +
      pattern.title +
      ":" +
      pattern.stitch +
      ":" +
      (pattern.style || "Plain") +
      ":" +
      (pattern.terminology || "UK") +
      ":" +
      pattern.startingChain +
      ":" +
      pattern.totalRows
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
        Array.isArray(parsed)
          ? parsed.filter((n: unknown) => Number.isInteger(n))
          : [],
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

  const blueprint = useMemo(() => {
    const gauge = Number(stitchGauge);
    const rows = Number(rowGauge);
    const desiredWidth = Number(width);
    const desiredLength = Number(length);

    if (!gauge || !rows || !desiredWidth || !desiredLength) return null;
    if (gauge <= 0 || rows <= 0 || desiredWidth <= 0 || desiredLength <= 0) {
      return null;
    }

    return calculateBlueprint(desiredWidth, desiredLength, gauge, rows, selectedStyle, selectedStitch);
  }, [stitchGauge, rowGauge, width, length, selectedStitch, selectedStyle]);

  useEffect(() => {
    setError("");
  }, [stitchGauge, rowGauge, width, length, selectedStitch, selectedStyle, terminology]);

  const previewRows = useMemo(
    () =>
      blueprint
        ? buildPreviewRows(blueprint.startingChain, blueprint.workingStitches, selectedStitch, selectedStyle, terminology)
        : [],
    [blueprint, selectedStitch, selectedStyle, terminology],
  );

  async function generateFromCheckout(sessionId: string, attempt = 0) {
    setIsGenerating(true);
    setError("");
    setCheckoutMessage(
      attempt === 0
        ? "Payment complete. Confirming your unlock and preparing the full pattern..."
        : "Payment received. Waiting for secure confirmation...",
    );

    try {
      const response = await fetch("/api/generate-pattern", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });

      const data = await response.json();

      if (response.ok) {
        setPattern(data.pattern);
        setCheckoutMessage("");
        setIsGenerating(false);
        window.history.replaceState({}, "", window.location.pathname);
        return;
      }

      if (response.status === 402 && attempt < 8) {
        window.setTimeout(
          () => void generateFromCheckout(sessionId, attempt + 1),
          1500,
        );
        return;
      }

      throw new Error(
        data.error || "Unable to unlock your pattern after payment.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setCheckoutMessage("");
      setIsGenerating(false);
    }
  }

  useEffect(() => {
    const sessionId = new URLSearchParams(window.location.search).get(
      "session_id",
    );

    if (!sessionId) return;

    void generateFromCheckout(sessionId);
  }, []);

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

  async function startCheckout(mode: CheckoutMode) {
    if (!blueprint) return;

    setIsGenerating(true);
    setError("");
    setCheckoutMessage("");
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
          patternStyle: selectedStyle,
          terminology,
          palette: selectedPalette,
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
    setCheckoutMessage("");
    setPattern(null);

    try {
      const response = await fetch("/api/generate-pattern", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startingChain: blueprint.startingChain,
          totalRows: blueprint.totalRows,
          selectedStitch,
          patternStyle: selectedStyle,
          terminology,
          palette: selectedPalette,
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
              <span className="mb-2 flex items-center gap-2 text-sm font-medium text-[#46392f]">
                {label as string}
                {(id === "stitch-gauge" || id === "row-gauge") && (
                  <span className="group relative inline-flex">
                    <button type="button" aria-label={"What is " + (label as string) + "?"} className="flex h-5 w-5 items-center justify-center rounded-full border border-[#b99b84] bg-[#f7eee4] text-[11px] font-bold text-[#72513d]">?</button>
                    <span className="pointer-events-none absolute left-0 top-7 z-30 hidden w-72 rounded-xl border border-[#cdbca9] bg-[#302b27] p-3 text-xs font-normal leading-5 text-white shadow-xl group-hover:block group-focus-within:block">
                      {id === "stitch-gauge" ? "Stitch gauge is how many stitches you make across 4 inches (10 cm). It controls the blanket width." : "Row gauge is how many rows you make in 4 inches (10 cm). It controls the blanket length."}
                    </span>
                  </span>
                )}
              </span>
              <div className="flex">
                <input
                  id={id as string}
                  type="number"
                  min="1"
                  step="0.5"
                  value={value as string}
                  onChange={(e) =>
                    (setter as (value: string) => void)(e.target.value)
                  }
                  className="min-w-0 flex-1 rounded-l-xl border border-[#cdbca9] bg-[#f5ece2] px-4 py-3 outline-none focus:border-[#8a7564] focus:ring-2 focus:ring-[#d8c8b8]"
                />
                <span className="flex items-center rounded-r-xl border border-l-0 border-[#cdbca9] bg-[#e3d4c5] px-3 text-xs text-[#78695d]">
                  {unit as string}
                </span>
              </div>
            </label>
          ))}

          <section className="sm:col-span-2">
            <div className="flex items-end justify-between gap-3">
              <div>
                <span className="mb-2 block text-sm font-medium text-[#46392f]">Stitch Pattern</span>
                <p className="text-xs text-[#78695d]">Choose a real stitch construction. Every option below has its own foundation rule, turning chain and pattern recipe.</p>
              </div>
              <span className="rounded-full border border-[#d2c0ad] bg-[#eee2d6] px-3 py-1 text-[11px] font-semibold text-[#72513d]">{selectedStitch}</span>
            </div>
            <div className="mt-4 space-y-5">
              {STITCH_CATEGORIES.map((category) => {
                const options = STITCH_OPTIONS.filter((option) => option.category === category);
                if (!options.length) return null;
                return (
                  <div key={category}>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#78695d]">{category}</h3>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {options.map((option) => (
                        <button key={option.id} type="button" onClick={() => { setSelectedStitch(option.name); setSelectedStyle(option.name); }} aria-pressed={selectedStitch === option.name}
                          className={"overflow-hidden rounded-2xl border text-left transition-all " + (selectedStitch === option.name ? "border-[#9b6d52] bg-[#f2e2d5] ring-2 ring-[#d9bca5]" : "border-[#d2c0ad] bg-[#fbf6ef] hover:border-[#b99b84]")}>
                          <div className="h-24 border-b border-[#d2c0ad] bg-[#ead8c8]">
                            <PatternStylePreview style={option.name} colors={PALETTES.find((p) => p.name === selectedPalette)?.colors ?? PALETTES[0].colors} />
                          </div>
                          <div className="p-3">
                            <div className="flex items-center justify-between gap-2"><strong className="text-sm text-[#302b27]">{option.name}</strong><span className="text-[10px] font-semibold text-[#78695d]">{option.difficulty}</span></div>
                            <p className="mt-1 text-xs leading-5 text-[#78695d]">{option.description}</p>
                            <p className="mt-2 text-[11px] font-medium text-[#72513d]">{option.name === "Plain" ? "dc · chain multiple 1 + 2" : option.name === "Moss / Linen" ? "sc · chain multiple 2 + 1" : `${terminology === "UK" ? option.uk : option.us} · chain multiple ${option.foundation.multiple} + ${option.foundation.add}`}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="sm:col-span-2">
            <div className="rounded-2xl border border-[#d2c0ad] bg-[#eee2d6] p-4">
              <p className="text-sm font-semibold text-[#302b27]">Pattern terminology</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {(["UK","US"] as const).map((option) => (
                  <button key={option} type="button" onClick={() => setTerminology(option)} className={"rounded-xl border px-4 py-3 text-sm font-semibold " + (terminology === option ? "border-[#9b6d52] bg-[#f2e2d5]" : "border-[#d2c0ad] bg-[#f7eee4]")}>{option === "UK" ? "UK crochet terms" : "US crochet terms"}</button>
                ))}
              </div>
              <p className="mt-3 text-xs leading-5 text-[#78695d]">UK: dc = US sc · htr = US hdc · tr = US dc. The selected stitch shows its correct terminology above.</p>
            </div>
          </section>

          <section className="sm:col-span-2">
            <div className="rounded-2xl border border-[#d2c0ad] bg-[#eee2d6] p-4">
              <p className="text-sm font-semibold text-[#302b27]">Colour palette</p>
              <p className="mt-1 text-xs text-[#78695d]">Choose the colours used by the generated pattern.</p>
              <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
                {PALETTES.map((palette) => <button key={palette.name} type="button" onClick={() => setSelectedPalette(palette.name)} className={"rounded-xl border p-2 " + (selectedPalette === palette.name ? "border-[#9b6d52] bg-[#f7eee4]" : "border-transparent hover:border-[#d2c0ad]")}><span className="flex h-9 overflow-hidden rounded-lg border border-[#d2c0ad]">{palette.colors.map((color) => <span key={color} className="flex-1" style={{backgroundColor:color}} />)}</span><span className="mt-1 block truncate text-[10px] text-[#66594f]">{palette.name}</span></button>)}
              </div>
            </div>
          </section>
            <div className="mt-4 overflow-hidden rounded-2xl border border-[#d2c0ad] bg-[#fbf6ef]">
              <div className="flex items-center justify-between gap-3 border-b border-[#d2c0ad] px-4 py-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#78695d]">Live stitch preview</p>
                  <p className="mt-1 text-sm font-semibold text-[#302b27]">{selectedStitch} · Striped Chart Repeat</p>
                </div>
                <span className="text-xs text-[#78695d]">{selectedPalette}</span>
              </div>
              <div className="p-3 sm:p-4">
                <PatternStylePreview
                  style={selectedStyle}
                  colors={PALETTES.find((p) => p.name === selectedPalette)?.colors ?? PALETTES[0].colors}
                  large
                  widthUnits={blueprint?.startingChain}
                  rowUnits={blueprint?.totalRows}
                />
              </div>
            </div>
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
              <BlueprintCard
                label="Foundation Chain"
                value={blueprint.startingChain}
                suffix="chains"
              />
              <BlueprintCard
                label="Total Rows"
                value={blueprint.totalRows}
                suffix="rows"
              />
              <BlueprintCard label="Stitch" value={selectedStitch} />
            </div>
          )}
        </section>

        {error && (
          <div className="mt-6 rounded-xl border border-[#d8aaa0] bg-[#f3ddd6] p-4 text-sm text-[#925247]">
            {error}
          </div>
        )}

        {checkoutMessage && (
          <div className="mt-6 rounded-xl border border-[#cbb69f] bg-[#eee2d6] p-4 text-center text-sm font-medium text-[#5f4b3b]">
            {checkoutMessage}
          </div>
        )}

        {blueprint && !pattern && (
          <PatternPreviewWall
            blueprint={blueprint}
            selectedStitch={selectedStitch}
            selectedStyle={selectedStyle}
            paletteColors={PALETTES.find((p) => p.name === selectedPalette)?.colors ?? PALETTES[0].colors}
            previewRows={previewRows}
            isGenerating={isGenerating}
            onUnlock={() => void startCheckout("payment")}
          />
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
                Pattern Unlocked
              </p>
              <h2 className="mt-2 font-serif text-2xl text-[#302b27]">
                {pattern.title}
              </h2>
              <p className="mt-2 text-sm text-[#66594f]">
                {pattern.style} · {pattern.terminology} terms · {pattern.startingChain} foundation chains · {pattern.totalRows} rows
              </p>
            </div>

            <div className="border-b border-[#d2c0ad] bg-[#eee2d6] p-5 sm:p-6">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#78695d]">
                    Interactive Row Counter
                  </p>
                  <p className="mt-2 text-lg font-semibold text-[#302b27] transition-all duration-200">
                    {completedRows.length} of {pattern.totalRows} rows complete
                  </p>
                  <p className="mt-1 text-sm text-[#66594f]">
                    Tap a row when you finish it. Your progress is saved on this device.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={resetRowCounter}
                  disabled={completedRows.length === 0}
                  className="rounded-lg border border-[#c4ad98] bg-[#f7eee4] px-3 py-2 text-xs font-semibold text-[#5f4b3b] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Reset counter
                </button>
              </div>

              <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#d7c5b3]">
                <div
                  className="h-full rounded-full bg-[#72513d] transition-all"
                  style={{
                    width:
                      (completedRows.length / pattern.totalRows) * 100 + "%",
                  }}
                />
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {pattern.rows.map((row) => {
                  const complete = completedRows.includes(row.rowNumber);
                  return (
                    <button
                      key={"counter-" + row.rowNumber}
                      type="button"
                      onClick={() => toggleRow(row.rowNumber)}
                      aria-pressed={complete}
                      className={
                        "flex h-10 min-w-10 items-center justify-center rounded-lg border px-3 text-sm font-semibold transition-all duration-200 active:scale-95 " +
                        (complete
                          ? "border-[#6f8b73] bg-[#6f8b73] text-white shadow-sm"
                          : "border-[#cdbca9] bg-[#f7eee4] text-[#46392f] hover:-translate-y-0.5 hover:bg-[#e8d9ca]")
                      }
                    >
                      {complete ? "✓ " : ""}
                      {row.rowNumber}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="divide-y divide-[#d2c0ad]">
              <article className="bg-[#f7eee4] p-5 sm:p-6">
                <div className="flex items-center justify-between gap-4">
                  <h3 className="font-semibold text-[#302b27]">Foundation Chain</h3>
                  <span className="text-xs text-[#78695d]">
                    {pattern.startingChain} chains
                  </span>
                </div>
                <p className="mt-2 text-sm leading-6 text-[#46392f]">
                  Chain {pattern.startingChain} to begin your project.
                </p>
              </article>

              {pattern.rows.map((row) => {
                const complete = completedRows.includes(row.rowNumber);
                return (
                  <article
                    key={row.rowNumber}
                    className={
                      "p-5 transition-colors sm:p-6 " +
                      (complete ? "bg-[#e7efe7]" : "bg-[#f7eee4]")
                    }
                  >
                    <button
                      type="button"
                      onClick={() => toggleRow(row.rowNumber)}
                      className="flex w-full items-center justify-between gap-4 text-left transition-transform duration-200 active:scale-[0.99]"
                      aria-pressed={complete}
                    >
                      <span className="flex items-center gap-3">
                        <span
                          className={
                            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-bold " +
                            (complete
                              ? "border-[#6f8b73] bg-[#6f8b73] text-white shadow-sm"
                              : "border-[#cdbca9] bg-[#f7eee4] text-[#72513d]")
                          }
                        >
                          {complete ? "✓" : row.rowNumber}
                        </span>
                        <span>
                          <span
                            className={
                              "block font-semibold transition-all duration-200 " +
                              (complete
                                ? "text-[#607565] line-through decoration-[#6f8b73] decoration-2"
                                : "text-[#302b27]")
                            }
                          >
                            Row {row.rowNumber}
                          </span>
                          <span className="mt-1 block text-xs text-[#78695d]">
                            {row.countLabel || row.stitchCount + " stitches"} · tap to{" "}
                            {complete ? "uncheck" : "mark complete"}
                          </span>
                        </span>
                      </span>
                      <span className="text-xs text-[#78695d]">
                        {complete ? "Complete" : "Open"}
                      </span>
                    </button>
                    <p
                      className={
                        "mt-3 pl-11 text-sm leading-6 " +
                        (complete ? "text-[#78695d]" : "text-stone-700")
                      }
                    >
                      {row.instruction}
                    </p>
                  </article>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function PatternPreviewWall({
  blueprint,
  selectedStitch,
  selectedStyle,
  paletteColors,
  previewRows,
  isGenerating,
  onUnlock,
}: {
  blueprint: { startingChain: number; totalRows: number };
  selectedStitch: Stitch;
  selectedStyle: PatternStyle;
  paletteColors: readonly string[];
  previewRows: PreviewRow[];
  isGenerating: boolean;
  onUnlock: () => void;
}) {
  const lockedRows = Math.max(0, blueprint.totalRows - 3);

  return (
    <section className="mt-8 overflow-visible rounded-2xl border border-[#d2c0ad] bg-[#f7eee4]">
      <div className="border-b border-[#d2c0ad] p-5 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#78695d]">
          Pattern Preview
        </p>
        <h2 className="mt-2 font-serif text-2xl text-[#302b27]">
          See your custom pattern before you unlock it
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#66594f]">
          The first three pattern steps are shown clearly. The remaining rows are
          protected until checkout, so you can see exactly how the finished pattern
          will be laid out before you buy.
        </p>
      </div>

      <div className="border-b border-[#d2c0ad] bg-[#eee2d6] p-4 sm:p-6">
        <div className="rounded-2xl border border-[#d2c0ad] bg-[#f7eee4] p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#78695d]">
                Visual pattern
              </p>
              <p className="mt-1 text-sm text-[#66594f]">
                A tactile preview of your {selectedStitch.toLowerCase()} fabric
              </p>
            </div>
            <span className="rounded-full border border-[#d2c0ad] bg-[#eee2d6] px-3 py-1 text-xs font-medium text-[#72513d]">
              {blueprint.startingChain} × {blueprint.totalRows}
            </span>
          </div>

          <div className="mt-4 overflow-hidden rounded-2xl border border-[#cdb9a5] bg-[#d9bea0] p-2">
            <div className="rounded-xl border border-[#c7a98a] bg-[#e7ceb2] p-3 shadow-[inset_0_2px_8px_rgba(114,81,61,0.12)]">
              <PatternStylePreview
                style={selectedStyle}
                colors={paletteColors}
                large
                widthUnits={blueprint.startingChain}
                rowUnits={blueprint.totalRows}
                protectedAfter={3}
              />
            </div>
            <div className="mt-3 flex items-center justify-between text-[11px] font-medium text-[#78695d]">
              <span>Rows 1–3 visible</span>
              <span>{Math.max(0, blueprint.totalRows - 3)} rows protected</span>
            </div>
          </div>

        </div>
      </div>

      <div className="divide-y divide-[#d2c0ad]">
        <PreviewRowCard
          title="Foundation Chain"
          meta={blueprint.startingChain + " chains"}
          text={"Chain " + blueprint.startingChain + " to begin your project."}
        />

        {previewRows.map((row) => (
          <PreviewRowCard
            key={row.rowNumber}
            title={"Row " + row.rowNumber}
            meta={blueprint.startingChain + " stitches"}
            text={row.text}
          />
        ))}
      </div>

      {lockedRows > 0 && (
        <div className="relative border-t border-[#d2c0ad] bg-[#eee2d6] p-4 sm:p-6">
          <div className="sticky top-4 z-20 mx-auto mb-5 max-w-xl rounded-2xl border border-[#bda58f] bg-[#f7eee4] p-5 text-center shadow-lg">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#78695d]">
              Unlock the full pattern
            </p>
            <h3 className="mt-2 text-xl font-semibold text-[#302b27]">
              Foundation + {blueprint.totalRows} complete rows
            </h3>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#66594f]">
              Unlock everything, including the complete row-by-row instructions and
              the interactive row counter that saves your progress on this device.
            </p>
            <button
              type="button"
              disabled={isGenerating}
              onClick={onUnlock}
              className="mt-4 w-full rounded-xl bg-[#72513d] px-5 py-4 text-base font-semibold text-white shadow-sm transition hover:bg-[#5e4030] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isGenerating
                ? "Opening secure checkout..."
                : "Unlock This Pattern Only (£2.99)"}
            </button>
            <p className="mt-2 text-xs text-[#78695d]">
              One-time payment · no membership required
            </p>
          </div>

          <div
            className="select-none space-y-3"
            onCopy={(event) => event.preventDefault()}
            onCut={(event) => event.preventDefault()}
            onContextMenu={(event) => event.preventDefault()}
            aria-label="Locked pattern preview"
          >
            {Array.from(
              { length: Math.min(lockedRows, 6) },
              (_, index) => index + 4,
            ).map((rowNumber) => (
              <article
                key={"locked-preview-" + rowNumber}
                className="select-none rounded-xl border border-[#d2c0ad] bg-[#f7eee4] p-5 blur-sm opacity-40 sm:p-6"
              >
                <div className="flex items-center justify-between gap-4">
                  <h3 className="font-semibold text-[#302b27]">
                    Row {rowNumber}
                  </h3>
                  <span className="text-xs text-[#78695d]">
                    {blueprint.startingChain} stitches
                  </span>
                </div>
                <p className="mt-2 select-none text-sm leading-6 text-[#46392f]">
                  {lockedRowText(selectedStitch, blueprint.startingChain)}
                </p>
              </article>
            ))}

            {lockedRows > 6 && (
              <div className="rounded-xl border border-dashed border-[#c4ad98] bg-[#f7eee4] p-5 text-center text-sm font-medium text-[#78695d] select-none">
                + {lockedRows - 6} more rows protected
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function PatternStylePreview({
  style,
  colors,
  large = false,
  widthUnits,
  rowUnits,
}: {
  style: PatternStyle;
  colors: readonly string[];
  large?: boolean;
  widthUnits?: number;
  rowUnits?: number;
  protectedAfter?: number;
}) {
  const recipe = STITCH_OPTIONS.find((item) => item.name === style);
  const gridColumns = large ? 28 : 18;
  const gridRows = large ? 12 : 8;
  const leftAxis = large ? 30 : 24;
  const bottomAxis = large ? 25 : 20;
  const width = large ? 700 : 420;
  const height = large ? 250 : 150;
  const chartX = leftAxis;
  const chartY = 8;
  const chartWidth = width - leftAxis - 8;
  const chartHeight = height - chartY - bottomAxis;
  const cellW = chartWidth / gridColumns;
  const cellH = chartHeight / gridRows;
  const actualStitches = Math.max(1, widthUnits ?? gridColumns);
  const actualRows = Math.max(1, rowUnits ?? gridRows);
  const labelEvery = actualStitches >= 50 ? 10 : 5;
  const rowLabelEvery = actualRows >= 50 ? 10 : 5;

  const palette = colors.length ? colors : ["#d9e8ea"];
  const stitchKind = recipe?.preview ?? "plain";

  // Keep the chart crisp and chart-like: every cell is a discrete colourwork square.
  const cellColour = (row: number, col: number) => {
    // Plain crochet is represented as a continuous fabric block rather than colourwork.
    if (stitchKind === "plain") return palette[0];

    // Moss/Linen: offset each row to suggest the alternating stitch / chain-space structure.
    if (stitchKind === "moss") {
      const offset = row % 2;
      return palette[(Math.floor(col / 2) + offset) % palette.length];
    }

    // Lemon Peel keeps a distinct alternating stitch rhythm.
    if (style === "Lemon Peel") {
      return palette[(col + row) % palette.length];
    }

    const stripe = Math.floor(row / (stitchKind === "granny" ? 2 : 1));
    let index = (row + col + stripe) % palette.length;

    if (stitchKind === "v") index = (col % 3 === 1 ? row + 1 : row + col) % palette.length;
    if (stitchKind === "shell") index = (Math.floor(col / 3) + row) % palette.length;
    if (stitchKind === "waffle") index = (Math.floor(col / 3) + Math.floor(row / 2)) % palette.length;
    if (stitchKind === "block") index = (Math.floor(col / 3) + Math.floor(row / 2)) % palette.length;
    if (stitchKind === "granny") index = (Math.floor(col / 3) + Math.floor(row / 2)) % palette.length;

    return palette[index % palette.length];
  };

  const xLabels = Array.from(
    { length: Math.floor(actualStitches / labelEvery) },
    (_, i) => (i + 1) * labelEvery,
  ).filter((n) => n <= actualStitches);

  const yLabels = Array.from(
    { length: Math.floor(actualRows / rowLabelEvery) },
    (_, i) => (i + 1) * rowLabelEvery,
  ).filter((n) => n <= actualRows);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-full min-h-[110px] w-full"
      role="img"
      aria-label={`${style} colourwork chart preview, ${actualStitches} stitches by ${actualRows} rows`}
    >
      <rect width={width} height={height} rx="14" fill="#f7eee4" />

      {/* Y-axis */}
      <line x1={leftAxis - 5} y1={chartY} x2={leftAxis - 5} y2={chartY + chartHeight} stroke="#8b7a6b" strokeWidth="1" />
      {yLabels.map((label) => {
        const y = chartY + chartHeight - (label / actualRows) * chartHeight;
        return (
          <g key={`y-${label}`}>
            <line x1={leftAxis - 8} y1={y} x2={leftAxis - 2} y2={y} stroke="#8b7a6b" strokeWidth="1" />
            <text x={leftAxis - 11} y={y + 3} textAnchor="end" fontSize={large ? "9" : "7"} fill="#78695d">
              {label}
            </text>
          </g>
        );
      })}

      {/* Filled stitch cells with a sharp graph-paper grid. */}
      <g shapeRendering="crispEdges">
        {Array.from({ length: gridRows }, (_, visualRow) =>
          Array.from({ length: gridColumns }, (_, col) => {
            const colour = cellColour(visualRow, col);
            const x = chartX + col * cellW;
            const y = chartY + visualRow * cellH;
            return (
              <rect
                key={`${visualRow}-${col}`}
                x={x}
                y={y}
                width={cellW + 0.2}
                height={cellH + 0.2}
                fill={colour}
                stroke="#ffffff"
                strokeWidth="1"
                className={protectedAfter && visualRow + 1 > protectedAfter ? "opacity-30" : undefined}
              />
            );
          }),
        )}
        <rect
          x={chartX}
          y={chartY}
          width={chartWidth}
          height={chartHeight}
          fill="none"
          stroke="#9b8a7b"
          strokeWidth="1.25"
        />
      </g>

      {/* X-axis */}
      <line x1={chartX} y1={chartY + chartHeight + 5} x2={chartX + chartWidth} y2={chartY + chartHeight + 5} stroke="#8b7a6b" strokeWidth="1" />
      {xLabels.map((label) => {
        const x = chartX + (label / actualStitches) * chartWidth;
        return (
          <g key={`x-${label}`}>
            <line x1={x} y1={chartY + chartHeight + 2} x2={x} y2={chartY + chartHeight + 8} stroke="#8b7a6b" strokeWidth="1" />
            <text x={x} y={height - 5} textAnchor="middle" fontSize={large ? "9" : "7"} fill="#78695d">
              {label}
            </text>
          </g>
        );
      })}

      <text x={chartX + chartWidth / 2} y={height - 5} textAnchor="middle" fontSize={large ? "8" : "6"} fill="#78695d" opacity=".65">
        stitches
      </text>
    </svg>
  );
}
function PreviewRowCard({
  title,
  meta,
  text,
}: {
  title: string;
  meta: string;
  text: string;
}) {
  return (
    <article className="bg-[#f7eee4] p-5 sm:p-6">
      <div className="flex items-center justify-between gap-4">
        <h3 className="font-semibold text-[#302b27]">{title}</h3>
        <span className="text-xs text-[#78695d]">{meta}</span>
      </div>
      <p className="mt-2 text-sm leading-6 text-[#46392f]">{text}</p>
    </article>
  );
}

function buildPreviewRows(startingChain:number, workingStitches:number, stitch:Stitch, style:PatternStyle, terminology:"UK"|"US"):PreviewRow[] {
  const recipe=STITCH_OPTIONS.find((item)=>item.name===stitch) ?? STITCH_OPTIONS[0];
  const abbr=terminology==="UK"?recipe.uk.split("/")[0]:recipe.us.split("/")[0];
  return [1,2,3].map((rowNumber)=>({
    rowNumber,
    label:"Row "+rowNumber,
    text: rowNumber===1
      ? "Ch "+startingChain+". Work 1 "+abbr+" across. Turn. ("+workingStitches+" stitches)"
      : "Ch "+recipe.turningChain+", turn. Work "+abbr+" across the row, following the "+style+" repeat. Turn. ("+workingStitches+" stitches)"
  }));
}
function lockedRowText(stitch: Stitch, stitchCount: number) {
  const recipe=STITCH_OPTIONS.find((item)=>item.name===stitch) ?? STITCH_OPTIONS[0];
  return "Continue with "+(recipe.uk.split("/")[0])+" across the row, following the complete "+recipe.name+" instructions and stitch count...";
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
  const symbol =
    stitch === "Single Crochet"
      ? "sc"
      : stitch === "Half Double Crochet"
        ? "hdc"
        : "dc";

  return (
    <div className="h-full min-h-[150px] rounded-xl border border-[#d6c3ae] bg-[#e7d5c1] p-2 shadow-inner">
      <svg
        viewBox="0 0 420 190"
        className="h-full min-h-[142px] w-full"
        role="img"
        aria-label={stitch + " crochet stitch symbol preview"}
      >
        <rect
          x="8"
          y="8"
          width="404"
          height="174"
          rx="18"
          fill="#f0dfcc"
          stroke="#d6c3ae"
          strokeWidth="2"
        />

        <g
          fill="none"
          stroke="#72513d"
          strokeWidth="10"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {symbol === "sc" && (
            <>
              <path d="M150 95 H270" />
              <path d="M210 35 V155" />
            </>
          )}

          {symbol === "hdc" && (
            <>
              <path d="M145 55 H275" />
              <path d="M210 55 V150" />
            </>
          )}

          {symbol === "dc" && (
            <>
              <path d="M145 55 H275" />
              <path d="M210 55 V150" />
              <path d="M182 95 L238 67" />
            </>
          )}
        </g>

        <text
          x="210"
          y="174"
          textAnchor="middle"
          fontSize="14"
          fontWeight="600"
          letterSpacing="2"
          fill="#78695d"
        >
          {symbol.toUpperCase()}
        </text>
      </svg>
    </div>
  );
}

function calculateBlueprint(width: number, length: number, stitchGauge: number, rowGauge: number, style: PatternStyle, _stitch: Stitch) {
  const recipe = STITCH_OPTIONS.find((item) => item.name === style) ?? STITCH_OPTIONS[0];
  const target = Math.max(4, Math.round(width * stitchGauge / 4));
  const totalRows = Math.max(1, Math.round(length * rowGauge / 4));
  const chain = Math.ceil(Math.max(1, target - recipe.foundation.add) / recipe.foundation.multiple) * recipe.foundation.multiple + recipe.foundation.add;
  return { startingChain: chain, totalRows, workingStitches: Math.max(1, chain - 1) };
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
