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
  const [selectedStitch, setSelectedStitch] = useState<Stitch>("Single Crochet");
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

    return {
      startingChain: Math.round(desiredWidth * (gauge / 4)),
      totalRows: Math.round(desiredLength * (rows / 4)),
    };
  }, [stitchGauge, rowGauge, width, length]);

  useEffect(() => {
    setError("");
  }, [stitchGauge, rowGauge, width, length, selectedStitch]);

  const previewRows = useMemo(
    () =>
      blueprint
        ? buildPreviewRows(blueprint.startingChain, selectedStitch)
        : [],
    [blueprint, selectedStitch],
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
              <BlueprintCard
                label="Starting Chain"
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
                {pattern.stitch} · {pattern.startingChain} sts · {pattern.totalRows} rows
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
                            {row.stitchCount} stitches · tap to{" "}
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
  previewRows,
  isGenerating,
  onUnlock,
}: {
  blueprint: { startingChain: number; totalRows: number };
  selectedStitch: Stitch;
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
                A tactile preview of your {selectedStitch.toLowerCase()} crochet fabric
              </p>
            </div>
            <span className="rounded-full border border-[#d2c0ad] bg-[#eee2d6] px-3 py-1 text-xs font-medium text-[#72513d]">
              {blueprint.startingChain} × {blueprint.totalRows}
            </span>
          </div>

          <div className="mt-4 overflow-hidden rounded-2xl border border-[#cdb9a5] bg-[#d9bea0] p-2">
            <div
              className="relative overflow-hidden rounded-xl border border-[#c7a98a] bg-[#e7ceb2] p-3 shadow-[inset_0_2px_8px_rgba(114,81,61,0.12)]"
              aria-label={"Visual crochet fabric preview of your " + selectedStitch.toLowerCase() + " blanket pattern"}
            >
              <div className="space-y-[3px]">
                {Array.from({ length: 12 }, (_, rowIndex) => {
                  const previewRow = rowIndex + 1;
                  const locked = previewRow > 3;

                  return (
                    <div
                      key={previewRow}
                      className={
                        "relative flex h-5 items-center justify-center gap-[3px] overflow-hidden rounded-sm px-1 transition-all duration-500 " +
                        (locked ? "blur-[3px] opacity-35" : "opacity-100")
                      }
                    >
                      {Array.from({ length: 28 }, (_, stitchIndex) => {
                        const offset =
                          selectedStitch === "Double Crochet"
                            ? (rowIndex % 2 === 0 ? stitchIndex % 2 : (stitchIndex + 1) % 2)
                            : rowIndex % 2;

                        if (selectedStitch === "Double Crochet") {
                          return (
                            <span
                              key={stitchIndex}
                              className="relative h-5 w-3 shrink-0"
                            >
                              <span className="absolute left-1/2 top-0 h-4 w-[3px] -translate-x-1/2 rounded-full bg-[#8a644c]" />
                              <span className="absolute left-1/2 top-[6px] h-[3px] w-3 -translate-x-1/2 rounded-full bg-[#9a7559]" />
                            </span>
                          );
                        }

                        if (selectedStitch === "Half Double Crochet") {
                          return (
                            <span
                              key={stitchIndex}
                              className="relative h-4 w-[10px] shrink-0"
                            >
                              <span className="absolute inset-x-0 top-1/2 h-[7px] -translate-y-1/2 rounded-[45%] border-2 border-[#8f6b51] bg-[#e1c29f]" />
                            </span>
                          );
                        }

                        return (
                          <span
                            key={stitchIndex}
                            className="relative h-4 w-[11px] shrink-0"
                          >
                            <span
                              className={
                                "absolute left-1/2 top-1/2 h-[7px] w-[10px] -translate-x-1/2 -translate-y-1/2 rounded-[45%] border border-[#936d51] bg-[#e4c7a8] " +
                                (offset ? "rotate-[3deg]" : "-rotate-[3deg]")
                              }
                            />
                            <span className="absolute left-[2px] right-[2px] top-1/2 h-px bg-[#9a7559]/60" />
                          </span>
                        );
                      })}
                    </div>
                  );
                })}
              </div>

              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-b from-transparent to-[#c9aa8a]/45" />
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

function buildPreviewRows(startingChain: number, stitch: Stitch): PreviewRow[] {
  const stitchName =
    stitch === "Single Crochet"
      ? "single crochet"
      : stitch === "Half Double Crochet"
        ? "half double crochet"
        : "double crochet";

  return [1, 2, 3].map((rowNumber) => ({
    rowNumber,
    label: "Row " + rowNumber,
    text:
      rowNumber === 1
        ? "Work " +
          stitchName +
          " stitches across the foundation chain. Turn to begin the next row."
        : "Continue " +
          stitchName +
          " evenly across, maintaining " +
          startingChain +
          " stitches. Turn to begin the next row.",
  }));
}

function lockedRowText(stitch: Stitch, stitchCount: number) {
  const abbreviation =
    stitch === "Single Crochet"
      ? "sc"
      : stitch === "Half Double Crochet"
        ? "hdc"
        : "dc";

  return (
    "Continue with " +
    abbreviation +
    " across the row, following the complete custom instructions and stitch count..."
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
