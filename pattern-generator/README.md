# Bespoke Crochet Pattern Generator

A Next.js App Router prototype for the deterministic crochet blueprint + validated OpenAI pattern-generation flow.

## Run locally

From this directory:

```bash
npm install
cp .env.example .env.local
```

Add your OpenAI API key to `.env.local`, then:

```bash
npm run dev
```

Open http://localhost:3000.

## Flow

1. User enters stitch gauge, row gauge, width and length.
2. The browser deterministically calculates Starting Chain and Total Rows.
3. The Pattern Blueprint is shown before AI generation.
4. The frontend POSTs only the calculated blueprint and selected stitch.
5. The server calls OpenAI using Structured Outputs.
6. The server validates row count, stitch count, stitch type and row numbering.
7. Only a validated pattern is returned to the browser.

## Important

The OpenAI API key is server-side only. Never expose it through `NEXT_PUBLIC_*` environment variables or client-side code.

This prototype lives in `pattern-generator/` so it does not replace the existing Bespoke Blanket Studio static site.
