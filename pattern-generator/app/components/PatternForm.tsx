"use client";

import { SignInButton, UserButton, useUser } from "@clerk/nextjs";
import { useMemo, useState } from "react";

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

  const isPro = user?.publicMetadata?.subscriptionStatus === "active";

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
