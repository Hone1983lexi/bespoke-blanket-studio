import { auth, clerkClient } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

type Stitch = "Single Crochet" | "Half Double Crochet" | "Double Crochet";\ntype PatternStyle = "Plain" | "Striped" | "Moss Stitch" | "Granny Stripe" | "Chevron / Ripple" | "Stitch Sampler";\ntype Terminology = "UK" | "US";\n\nconst STITCHES: Stitch[] = ["Single Crochet", "Half Double Crochet", "Double Crochet"];\nconst STYLES: PatternStyle[] = ["Plain", "Striped", "Moss Stitch", "Granny Stripe", "Chevron / Ripple", "Stitch Sampler"];\nconst TERMINOLOGIES: Terminology[] = ["UK", "US"];\n\nfunction valid<T extends string>(value: unknown, values: T[]): value is T {\n  return typeof value === "string" && values.includes(value as T);\n}\n\nfunction abbr(stitch: Stitch, terminology: Terminology) {\n  if (terminology === "UK") {\n    if (stitch === "Single Crochet") return "dc";\n    if (stitch === "Half Double Crochet") return "htr";\n    return "tr";\n  }\n  if (stitch === "Single Crochet") return "sc";\n  if (stitch === "Half Double Crochet") return "hdc";\n  return "dc";\n}\n\nfunction nameOf(stitch: Stitch, terminology: Terminology) {\n  if (terminology === "UK") {\n    if (stitch === "Single Crochet") return "double crochet";\n    if (stitch === "Half Double Crochet") return "half treble";\n    return "treble";\n  }\n  if (stitch === "Single Crochet") return "single crochet";\n  if (stitch === "Half Double Crochet") return "half double crochet";\n  return "double crochet";\n}\n\nfunction startingChainFor(stitches: number, stitch: Stitch) {\n  if (stitch === "Single Crochet") return stitches + 1;\n  return stitches + 2;\n}\n\nfunction blueprintFor(width: number, length: number, stitchGauge: number, rowGauge: number, style: PatternStyle, stitch: Stitch) {\n  const target = Math.max(4, Math.round(width * stitchGauge / 4));\n  const rows = Math.max(1, Math.round(length * rowGauge / 4));\n  if (style === "Moss Stitch") {\n    const chain = target % 2 === 0 ? target : target + 1;\n    return { startingChain: Math.max(4, chain), totalRows: rows, workingStitches: Math.ceil(chain / 2) };\n  }\n  if (style === "Granny Stripe") {\n    const groups = Math.max(1, Math.round((target - 2) / 3));\n    const chain = groups * 3 + 2;\n    return { startingChain: chain, totalRows: rows, workingStitches: chain - 1 };\n  }\n  if (style === "Chevron / Ripple") {\n    const repeats = Math.max(1, Math.round(target / 16));\n    const stitches = repeats * 16;\n    return { startingChain: stitches + 1, totalRows: rows, workingStitches: stitches };\n  }\n  return { startingChain: startingChainFor(target, stitch), totalRows: rows, workingStitches: target };\n}\n\nfunction colour(palette: string, row: number) {\n  const names: Record<string, string[]> = {\n    "Warm Neutral": ["Colour 1", "Colour 2", "Colour 3", "Colour 4"],\n    Sunset: ["Colour 1", "Colour 2", "Colour 3", "Colour 4"],\n    Ocean: ["Colour 1", "Colour 2", "Colour 3", "Colour 4"],\n    Pastel: ["Colour 1", "Colour 2", "Colour 3", "Colour 4"],\n    Rainbow: ["Colour 1", "Colour 2", "Colour 3", "Colour 4"],\n    Forest: ["Colour 1", "Colour 2", "Colour 3", "Colour 4"],\n  };\n  const list = names[palette] || names["Warm Neutral"];\n  return list[row % list.length];\n}\n\nfunction plainRow(stitch: Stitch, terminology: Terminology, chain: number, stitches: number, row: number) {\n  const a = abbr(stitch, terminology);\n  const n = nameOf(stitch, terminology);\n  if (row === 1) {\n    if (stitch === "Single Crochet") return "Ch " + chain + ". Work 1 " + n + " (" + a + ") in the 2nd chain from the hook and in each chain across. Turn. (" + stitches + " " + a + ")";\n    if (stitch === "Half Double Crochet") return "Ch " + chain + ". Work 1 " + n + " (" + a + ") in the 3rd chain from the hook and in each chain across. Turn. (" + stitches + " " + a + ")";\n    return "Ch " + chain + ". The first 3 chains count as the first " + a + ". Work 1 " + a + " in the 4th chain from the hook and in each chain across. Turn. (" + stitches + " " + a + ")";\n  }\n  const turn = stitch === "Single Crochet" ? "Ch 1" : stitch === "Half Double Crochet" ? "Ch 2" : "Ch 3";\n  return turn + " and turn. Work 1 " + a + " in each stitch across, including the final stitch. Turn. (" + stitches + " " + a + ")";\n}\n\nfunction buildRows(style: PatternStyle, stitch: Stitch, terminology: Terminology, chain: number, rows: number, stitches: number, palette: string) {\n  const result: Array<{ rowNumber: number; instruction: string; stitchCount: number; countLabel?: string }> = [];\n  if (style === "Moss Stitch") {\n    const sc = terminology === "UK" ? "dc" : "sc";\n    const count = Math.ceil(chain / 2);\n    for (let r = 1; r <= rows; r++) {\n      const c = colour(palette, Math.floor((r - 1) / 2));\n      if (r === 1) result.push({ rowNumber: r, instruction: "With " + c + ", ch " + chain + ". 1 " + sc + " in 2nd ch from hook, *ch 1, skip 1 ch, 1 " + sc + " in next ch; repeat across, ending with 1 " + sc + " in last ch. Turn.", stitchCount: count, countLabel: count + " " + sc + " + chain-1 spaces" });\n      else result.push({ rowNumber: r, instruction: ((r - 1) % 2 === 0 ? "Change to " + c + ". " : "") + "Ch 1 and turn. 1 " + sc + " in first ch-1 space, *ch 1, skip the next stitch, 1 " + sc + " in next ch-1 space; repeat across, ending with 1 " + sc + " in the last ch-1 space. Turn.", stitchCount: count, countLabel: count + " " + sc + " + chain-1 spaces" });\n    }\n    return result;\n  }\n  if (style === "Granny Stripe") {\n    const dc = terminology === "UK" ? "tr" : "dc";\n    const first = terminology === "UK" ? "dc" : "sc";\n    const groups = Math.max(1, Math.round((chain - 2) / 3));\n    for (let r = 1; r <= rows; r++) {\n      const c = colour(palette, Math.floor((r - 1) / 2));\n      if (r === 1) result.push({ rowNumber: r, instruction: "With " + c + ", ch " + chain + ". Work 1 " + first + " in 2nd ch from hook and in each ch across. Turn.", stitchCount: chain - 1, countLabel: (chain - 1) + " " + first });\n      else if (r % 2 === 0) result.push({ rowNumber: r, instruction: (r > 2 ? "Change to " + c + ". " : "") + "Ch 3 and turn. 1 " + dc + " in first stitch, *skip 2 stitches, 3 " + dc + " in next stitch; repeat across until 3 stitches remain, skip 2 stitches, 2 " + dc + " in final stitch. Turn.", stitchCount: chain - 1, countLabel: groups + " granny clusters + edge stitches" });\n      else result.push({ rowNumber: r, instruction: "Ch 3 and turn. Work 3 " + dc + " in each space between clusters across. Finish with 1 " + dc + " in the top of the turning chain. Turn.", stitchCount: chain - 1, countLabel: groups + " granny clusters + edge stitch" });\n    }\n    return result;\n  }\n  if (style === "Chevron / Ripple") {\n    const sc = terminology === "UK" ? "dc" : "sc";\n    const repeats = stitches / 16;\n    for (let r = 1; r <= rows; r++) {\n      const c = colour(palette, r - 1);\n      if (r === 1) result.push({ rowNumber: r, instruction: "With " + c + ", ch " + chain + ". Work 1 " + sc + " in 2nd ch from hook and in each ch across. Turn.", stitchCount: stitches, countLabel: stitches + " " + sc });\n      else result.push({ rowNumber: r, instruction: "Change to " + c + ". Ch 1 and turn. Repeat " + repeats + " times: 2 " + sc + " in next stitch, 1 " + sc + " in each of next 5 stitches, " + sc + "2tog twice, 1 " + sc + " in each of next 5 stitches, 2 " + sc + " in next stitch. Turn.", stitchCount: stitches, countLabel: stitches + " " + sc + " — " + repeats + " ripple repeats" });\n    }\n    return result;\n  }\n  if (style === "Stitch Sampler") {\n    const sequence: Stitch[] = ["Single Crochet", "Half Double Crochet", "Double Crochet", stitch];\n    for (let r = 1; r <= rows; r++) {\n      const rowStitch = sequence[(r - 1) % sequence.length];\n      const rowChain = startingChainForStitch(stitches, rowStitch);\n      const a = abbr(rowStitch, terminology);\n      const c = colour(palette, Math.floor((r - 1) / 2));\n      result.push({ rowNumber: r, instruction: (r === 1 ? "With " + c + ", " : (r % 2 === 1 ? "Change to " + c + ". " : "")) + plainRow(rowStitch, terminology, rowChain, stitches, 1).replace(/^Ch [0-9]+\\. /, "Ch " + rowChain + ". "), stitchCount: stitches, countLabel: stitches + " " + a });\n    }\n    return result;\n  }\n  for (let r = 1; r <= rows; r++) {\n    const c = colour(palette, r - 1);\n    const text = plainRow(stitch, terminology, chain, stitches, r);\n    result.push({ rowNumber: r, instruction: style === "Striped" ? (r === 1 ? "With " + c + ", " + text : "Change to " + c + ". " + text) : text, stitchCount: stitches, countLabel: stitches + " " + abbr(stitch, terminology) });\n  }\n  return result;\n}\n\nfunction startingChainForStitch(stitches: number, stitch: Stitch) {\n  return stitch === "Single Crochet" ? stitches + 1 : stitches + 2;\n}\n\nasync function hasActiveProSubscription(userId: string) {
  const client = await clerkClient();
  const user = await client.users.getUser(userId);

  if (user.publicMetadata.subscriptionStatus !== "active") {
    return false;
  }

  const subscriptionId = user.privateMetadata.stripeSubscriptionId;
  if (typeof subscriptionId !== "string") {
    return false;
  }

  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const active =
      subscription.status === "active" || subscription.status === "trialing";

    if (!active) {
      await client.users.updateUserMetadata(userId, {
        publicMetadata: {
          subscriptionStatus: "inactive",
          subscriptionUpdatedAt: new Date().toISOString(),
        },
      });
    }

    return active;
  } catch (error) {
    console.error("Subscription verification failed:", error);
    return false;
  }
}

async function verifyPaidCheckoutGrant(
  sessionId: string,
  userId: string | null,
  startingChain: number,
  totalRows: number,
  selectedStitch: string,
  patternStyle: string
) {
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  const metadata = session.metadata ?? {};

  if (session.mode === "subscription") {
    // The Stripe return can arrive before Clerk's browser session is restored.
    // The Checkout Session itself is a server-issued, high-entropy credential,
    // so verify the subscription directly and only enforce the Clerk-user match
    // when a Clerk user is available on this request.
    if (!metadata.clerkUserId) {
      return false;
    }

    if (userId && metadata.clerkUserId !== userId) {
      return false;
    }

    const subscriptionId =
      typeof session.subscription === "string"
        ? session.subscription
        : session.subscription?.id;

    if (!subscriptionId) return false;

    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const active =
      (subscription.status === "active" || subscription.status === "trialing") &&
      metadata.plan === "pro";

    if (active && userId) {
      try {
        const client = await clerkClient();
        await client.users.updateUserMetadata(userId, {
          publicMetadata: {
            subscriptionStatus: "active",
            subscriptionUpdatedAt: new Date().toISOString(),
          },
          privateMetadata: {
            stripeSubscriptionId: subscriptionId,
          },
        });
      } catch (error) {
        // The Stripe subscription itself remains the source of truth for this
        // immediate unlock; metadata sync can be retried on the next request.
        console.error("Unable to sync Pro membership to Clerk:", error);
      }
    }

    return active;
  }

  if (session.mode !== "payment" || session.payment_status !== "paid") {
    return false;
  }

  if (metadata.paymentGrant !== "paid" || metadata.grantUsed === "true") {
    return false;
  }

  if (
    metadata.startingChain !== String(startingChain) ||
    metadata.totalRows !== String(totalRows) ||
    metadata.selectedStitch !== selectedStitch ||
    metadata.patternStyle !== patternStyle ||
    metadata.blueprintType !== "crochet-pattern"
  ) {
    return false;
  }

  if (metadata.clerkUserId && metadata.clerkUserId !== userId) {
    return false;
  }

  // The Checkout Session ID is already a high-entropy, server-issued secret.
  // Rely on the verified Stripe session metadata instead of a browser cookie,
  // because the Stripe-to-app redirect can cross deployment URLs and make a
  // SameSite cookie unavailable.
  return metadata.paymentGrant === "paid";
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const sessionId =
      typeof body.sessionId === "string" ? body.sessionId : null;

    let startingChain = Number(body.startingChain);
    let totalRows = Number(body.totalRows);
    let selectedStitch = body.selectedStitch;
    let patternStyle = body.patternStyle;

    // After Stripe redirects back to the app, the form inputs are no longer
    // available in the request. Recover the original blueprint from the
    // verified Checkout Session metadata instead.
    if (
      sessionId &&
      (!Number.isInteger(startingChain) ||
        startingChain <= 0 ||
        !Number.isInteger(totalRows) ||
        totalRows <= 0 ||
        !StitchSchema.safeParse(selectedStitch).success)
    ) {
      const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId);
      const metadata = checkoutSession.metadata ?? {};

      startingChain = Number(metadata.startingChain);
      totalRows = Number(metadata.totalRows);
      selectedStitch = metadata.selectedStitch;
      patternStyle = metadata.patternStyle;
    }

    if (!Number.isInteger(startingChain) || startingChain <= 0) {
      return NextResponse.json({ error: "Invalid Starting Chain." }, { status: 400 });
    }

    if (!Number.isInteger(totalRows) || totalRows <= 0) {
      return NextResponse.json({ error: "Invalid Total Rows." }, { status: 400 });
    }

    if (!StitchSchema.safeParse(selectedStitch).success) {
      return NextResponse.json({ error: "Invalid stitch selection." }, { status: 400 });
    }

    if (!PatternStyleSchema.safeParse(patternStyle).success) {
      patternStyle = "Plain";
    }

    if (startingChain > 1000 || totalRows > 1000) {
      return NextResponse.json(
        { error: "The requested pattern is too large." },
        { status: 400 }
      );
    }

    const { userId } = await auth();
    const hasPro = userId ? await hasActiveProSubscription(userId) : false;

    let paidGrant = false;

    if (!hasPro && sessionId) {
      paidGrant = await verifyPaidCheckoutGrant(
        sessionId,
        userId,
        startingChain,
        totalRows,
        selectedStitch,
        patternStyle
      );
    }

    if (!hasPro && !paidGrant) {
      return NextResponse.json(
        {
          error:
            "Pattern generation requires an active Pro Membership or a successful £2.99 pattern unlock.",
        },
        { status: 402 }
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
      "5. Keep the construction rectangular and repeatable from row to row.",
      "6. Use the selected base stitch as the working stitch unless the selected pattern style explicitly calls for a colour change or simple texture variation.",
      "7. Do not use complex shaping that changes the final stitch count.",
      "8. Use standard US abbreviations: ch, sc, hdc, dc, st.",
      "9. Turning chains are not counted as working stitches.",
      "10. Every row must explicitly state its stitch count.",
      "",
      "For Single Crochet use ch 1 as the turning chain.",
      "For Half Double Crochet use ch 2 as the turning chain.",
      "For Double Crochet use ch 3 as the turning chain.",
      "",
      "STYLE GUIDANCE:",
      "Plain = simple even rows.",
      "Moss Stitch = use a simple sc/ch-1 moss texture while keeping the stated working stitch count consistent.",
      "Striped = alternate colour bands by row; describe the colour change without altering stitch count.",
      "Granny Stripe = use simple repeated granny-style clustered texture while maintaining the exact stated working stitch count.",
      "Chevron / Ripple = use a repeatable shallow ripple rhythm while maintaining the exact stated working stitch count.",
      "Floral Granny = use restrained flower-inspired motif language without changing the rectangular stitch count.",
      "Stitch Sampler = vary simple texture treatment between sections while maintaining the exact stitch count.",
      "",
      "Return only data matching the supplied schema.",
    ].join("\n");

    const response = await openai.responses.parse({
      model: process.env.OPENAI_MODEL || "gpt-6-luna",
      instructions: systemPrompt,
      input: [
        `Starting Chain: ${startingChain}`,
        `Total Rows: ${totalRows}`,
        `Selected Stitch: ${selectedStitch}`,
        `Pattern Style: ${patternStyle}`,
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
      pattern.style !== patternStyle ||
      pattern.rows.length !== totalRows
    ) {
      return NextResponse.json(
        { error: "Generated pattern failed blueprint validation." },
        { status: 502 }
      );
    }

    for (let i = 0; i < pattern.rows.length; i++) {
      const row = pattern.rows[i];

      if (row.rowNumber !== i + 1 || row.stitchCount !== startingChain) {
        return NextResponse.json(
          { error: `Generated pattern failed validation at row ${i + 1}.` },
          { status: 502 }
        );
      }
    }

    if (paidGrant && sessionId) {
      await stripe.checkout.sessions.update(sessionId, {
        metadata: {
          grantUsed: "true",
          grantUsedAt: new Date().toISOString(),
        },
      });
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
