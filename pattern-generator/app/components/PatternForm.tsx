"use client";

import { useMemo, useState } from "react";

type Stitch = "Single Crochet" | "Half Double Crochet" | "Double Crochet";

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
  const [stitchGauge, setStitchGauge] = useState("");
  const [rowGauge, setRowGauge] = useState("");
  const [width, setWidth] = useState("");
  const [length, setLength] = useState("");
  const [selectedStitch, setSelectedStitch] = useState<Stitch>("Single Crochet");
  const [pattern, setPattern] = useState<GeneratedPattern | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");

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

  async function generatePattern() {
    if (!blueprint) return;

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
        throw new Error(data.error || "Unable to generate pattern.");
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
      <div className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-stone-500">
          Bespoke Crochet
        </p>
        <h1 className="mt-2 font-serif text-3xl text-stone-900 sm:text-4xl">
          Pattern Generator
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">
          Enter your gauge and finished size. The deterministic Pattern Blueprint
          is calculated first, then the validated row-by-row pattern is generated.
        </p>

        <div className="mt-8 grid gap-5 sm:grid-cols-2">
          {[
            ["stitch-gauge", "Stitch Gauge", stitchGauge, setStitchGauge, "sts / 4\""],
            ["row-gauge", "Row Gauge", rowGauge, setRowGauge, "rows / 4\""],
            ["desired-width", "Desired Width", width, setWidth, "inches"],
            ["desired-length", "Desired Length", length, setLength, "inches"],
          ].map(([id, label, value, setter, unit]) => (
            <label key={id as string} htmlFor={id as string} className="block">
              <span className="mb-2 block text-sm font-medium text-stone-800">
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
                  className="min-w-0 flex-1 rounded-l-xl border border-stone-300 px-4 py-3 outline-none focus:border-stone-500 focus:ring-2 focus:ring-stone-200"
                />
                <span className="flex items-center rounded-r-xl border border-l-0 border-stone-300 bg-stone-50 px-3 text-xs text-stone-500">
                  {unit as string}
                </span>
              </div>
            </label>
          ))}

          <label htmlFor="selected-stitch" className="block sm:col-span-2">
            <span className="mb-2 block text-sm font-medium text-stone-800">
              Selected Stitch
            </span>
            <select
              id="selected-stitch"
              value={selectedStitch}
              onChange={(e) => setSelectedStitch(e.target.value as Stitch)}
              className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 outline-none focus:border-stone-500 focus:ring-2 focus:ring-stone-200"
            >
              <option>Single Crochet</option>
              <option>Half Double Crochet</option>
              <option>Double Crochet</option>
            </select>
          </label>
        </div>

        <section className="mt-8 rounded-2xl border border-stone-200 bg-stone-50 p-5 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
            Pattern Blueprint
          </p>

          {!blueprint ? (
            <p className="mt-3 text-sm text-stone-600">
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
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            disabled={!blueprint || isGenerating}
            onClick={generatePattern}
            className="rounded-xl bg-stone-900 px-6 py-3 font-medium text-white transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isGenerating ? "Generating Pattern..." : "Generate Crochet Pattern →"}
          </button>
        </div>

        {pattern && (
          <section className="mt-8 rounded-2xl border border-stone-200 bg-white">
            <div className="border-b border-stone-200 p-5 sm:p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                Generated Pattern
              </p>
              <h2 className="mt-2 font-serif text-2xl text-stone-900">{pattern.title}</h2>
              <p className="mt-2 text-sm text-stone-600">
                {pattern.stitch} · {pattern.startingChain} sts · {pattern.totalRows} rows
              </p>
            </div>

            <div className="divide-y divide-stone-200">
              {pattern.rows.map((row) => (
                <article key={row.rowNumber} className="p-5 sm:p-6">
                  <div className="flex items-center justify-between gap-4">
                    <h3 className="font-semibold text-stone-900">Row {row.rowNumber}</h3>
                    <span className="text-xs text-stone-500">{row.stitchCount} sts</span>
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
    <div className="rounded-xl border border-stone-200 bg-white p-5">
      <p className="text-sm text-stone-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-stone-900">{value}</p>
      {suffix && <p className="mt-1 text-xs text-stone-500">{suffix}</p>}
    </div>
  );
}
