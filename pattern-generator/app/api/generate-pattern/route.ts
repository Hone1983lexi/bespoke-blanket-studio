import OpenAI from "openai";
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import { NextResponse } from "next/server";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const StitchSchema = z.enum([
  "Single Crochet",
  "Half Double Crochet",
  "Double Crochet",
]);

const PatternSchema = z.object({
  title: z.string(),
  stitch: StitchSchema,
  startingChain: z.number().int().positive(),
  totalRows: z.number().int().positive(),
  rows: z.array(
    z.object({
      rowNumber: z.number().int().positive(),
      instruction: z.string(),
      stitchCount: z.number().int().positive(),
    })
  ),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const startingChain = Number(body.startingChain);
    const totalRows = Number(body.totalRows);
    const selectedStitch = body.selectedStitch;

    if (!Number.isInteger(startingChain) || startingChain <= 0) {
      return NextResponse.json({ error: "Invalid Starting Chain." }, { status: 400 });
    }

    if (!Number.isInteger(totalRows) || totalRows <= 0) {
      return NextResponse.json({ error: "Invalid Total Rows." }, { status: 400 });
    }

    if (!StitchSchema.safeParse(selectedStitch).success) {
      return NextResponse.json({ error: "Invalid stitch selection." }, { status: 400 });
    }

    if (startingChain > 1000 || totalRows > 1000) {
      return NextResponse.json(
        { error: "The requested pattern is too large." },
        { status: 400 }
      );
    }

    const systemPrompt = [
      "You are an expert US crochet pattern writer.",
      "Generate only a technically consistent, row-by-row crochet pattern from the supplied deterministic blueprint.",
      "",
      "NON-NEGOTIABLE RULES:",
      "1. Return exactly totalRows row objects.",
      "2. Row numbers must be sequential from 1 through totalRows.",
      "3. The starting chain must equal startingChain exactly.",
      "4. Every completed row must contain exactly startingChain working stitches.",
      "5. Never invent, omit, increase, or decrease stitches.",
      "6. Do not use clusters, shells, bobbles, increases, decreases, or decorative combinations.",
      "7. Use only the selected stitch.",
      "8. Use standard US abbreviations: ch, sc, hdc, dc, st.",
      "9. Turning chains are not counted as working stitches.",
      "10. Every row must explicitly state its stitch count.",
      "",
      "For Single Crochet use ch 1 as the turning chain.",
      "For Half Double Crochet use ch 2 as the turning chain.",
      "For Double Crochet use ch 3 as the turning chain.",
      "",
      "Use the simplest valid back-and-forth construction. Row 1 works the selected stitch across the foundation chain. Later rows use the selected stitch across the previous row.",
      "Return only data matching the supplied schema."
    ].join("\n");

    const response = await openai.responses.parse({
      model: process.env.OPENAI_MODEL || "gpt-6-luna",
      instructions: systemPrompt,
      input: [
        `Starting Chain: ${startingChain}`,
        `Total Rows: ${totalRows}`,
        `Selected Stitch: ${selectedStitch}`,
      ].join("\n"),
      text: {
        format: zodTextFormat(PatternSchema, "crochet_pattern"),
      },
    });

    const pattern = response.output_parsed;

    if (!pattern) {
      return NextResponse.json({ error: "No valid pattern returned." }, { status: 502 });
    }

    if (
      pattern.startingChain !== startingChain ||
      pattern.totalRows !== totalRows ||
      pattern.stitch !== selectedStitch ||
      pattern.rows.length !== totalRows
    ) {
      return NextResponse.json(
        { error: "Generated pattern failed blueprint validation." },
        { status: 502 }
      );
    }

    for (let i = 0; i < pattern.rows.length; i++) {
      const row = pattern.rows[i];

      if (
        row.rowNumber !== i + 1 ||
        row.stitchCount !== startingChain
      ) {
        return NextResponse.json(
          { error: `Generated pattern failed validation at row ${i + 1}.` },
          { status: 502 }
        );
      }
    }

    return NextResponse.json({ success: true, pattern });
  } catch (error) {
    console.error("Pattern generation error:", error);
    return NextResponse.json(
      { error: "Unable to generate the crochet pattern." },
      { status: 500 }
    );
  }
}
