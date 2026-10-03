"use client";

import { useEffect, useState } from "react";

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

export default function SuccessPage() {
  const [pattern, setPattern] = useState<GeneratedPattern | null>(null);
  const [message, setMessage] = useState(
    "Confirming your payment and preparing your pattern..."
  );
  const [error, setError] = useState("");

  useEffect(() => {
    const sessionId = new URLSearchParams(window.location.search).get("session_id");

    if (!sessionId) {
      setError("No checkout session was supplied.");
      return;
    }

    let cancelled = false;

    async function generate(attempt = 0): Promise<void> {
      try {
        const response = await fetch("/api/generate-pattern", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });

        const data = await response.json();

        if (response.ok) {
          if (!cancelled) {
            setPattern(data.pattern);
            setMessage("Your pattern is ready.");
          }
          return;
        }

        if (response.status === 402 && attempt < 8) {
          if (!cancelled) {
            setMessage(
              "Payment received. Waiting for the secure payment confirmation..."
            );
          }
          window.setTimeout(() => void generate(attempt + 1), 1500);
          return;
        }

        throw new Error(data.error || "Unable to generate your pattern.");
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Something went wrong."
          );
        }
      }
    }

    void generate();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="min-h-screen px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-4xl">
        <div className="rounded-3xl border border-[#cdb5a5] bg-[#e0c4b2] p-6 shadow-sm sm:p-8">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-stone-500">
            Bespoke Crochet
          </p>
          <h1 className="mt-2 font-serif text-3xl text-stone-900 sm:text-4xl">
            Pattern unlocked
          </h1>
          <p className="mt-3 text-sm leading-6 text-stone-600">{message}</p>

          {error && (
            <div className="mt-6 rounded-xl border border-[#d9aaa0] bg-[#f5dfda] p-4 text-sm text-red-700">
              {error}
            </div>
          )}

          {pattern && (
            <section className="mt-8 rounded-2xl border border-[#cdb5a5] bg-[#f6ebe4]">
              <div className="border-b border-[#cdb5a5] p-5 sm:p-6">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                  Generated Pattern
                </p>
                <h2 className="mt-2 font-serif text-2xl text-stone-900">
                  {pattern.title}
                </h2>
                <p className="mt-2 text-sm text-stone-600">
                  {pattern.stitch} · {pattern.startingChain} sts · {pattern.totalRows} rows
                </p>
              </div>

              <div className="divide-y divide-[#cdb5a5]">
                {pattern.rows.map((row) => (
                  <article key={row.rowNumber} className="p-5 sm:p-6">
                    <div className="flex items-center justify-between gap-4">
                      <h3 className="font-semibold text-stone-900">
                        Row {row.rowNumber}
                      </h3>
                      <span className="text-xs text-stone-500">
                        {row.stitchCount} sts
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-stone-700">
                      {row.instruction}
                    </p>
                  </article>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
