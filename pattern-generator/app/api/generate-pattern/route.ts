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

export async function POST(request: Request) {\n  try {\n    const body = await request.json();\n    const sessionId = typeof body.sessionId === "string" ? body.sessionId : null;\n\n    let stitchGauge = Number(body.stitchGauge);\n    let rowGauge = Number(body.rowGauge);\n    let width = Number(body.width);\n    let length = Number(body.length);\n    let selectedStitch = body.selectedStitch as Stitch;\n    let patternStyle = body.patternStyle as PatternStyle;\n    let terminology = body.terminology as Terminology;\n    let palette = typeof body.palette === "string" ? body.palette : "Warm Neutral";\n\n    if (sessionId) {\n      const session = await stripe.checkout.sessions.retrieve(sessionId);\n      const metadata = session.metadata ?? {};\n      stitchGauge = Number(metadata.stitchGauge);\n      rowGauge = Number(metadata.rowGauge);\n      width = Number(metadata.width);\n      length = Number(metadata.length);\n      selectedStitch = metadata.selectedStitch as Stitch;\n      patternStyle = metadata.patternStyle as PatternStyle;\n      terminology = (metadata.terminology as Terminology) || "UK";\n      palette = metadata.palette || "Warm Neutral";\n    }\n\n    if (\n      !Number.isFinite(stitchGauge) || stitchGauge <= 0 ||\n      !Number.isFinite(rowGauge) || rowGauge <= 0 ||\n      !Number.isFinite(width) || width <= 0 ||\n      !Number.isFinite(length) || length <= 0 ||\n      !valid(selectedStitch, STITCHES) ||\n      !valid(patternStyle, STYLES) ||\n      !valid(terminology, TERMINOLOGIES)\n    ) {\n      return NextResponse.json({ error: "Please check your measurements, stitch, style and terminology." }, { status: 400 });\n    }\n\n    const blueprint = blueprintFor(width, length, stitchGauge, rowGauge, patternStyle, selectedStitch);\n    if (blueprint.startingChain > 1000 || blueprint.totalRows > 1000) {\n      return NextResponse.json({ error: "The requested blanket is too large for this generator." }, { status: 400 });\n    }\n\n    const { userId } = await auth();\n    const hasPro = userId ? await hasActiveProSubscription(userId) : false;\n    let paidGrant = false;\n\n    if (!hasPro && sessionId) {\n      paidGrant = await verifyPaidCheckoutGrant(\n        sessionId,\n        userId,\n        blueprint.startingChain,\n        blueprint.totalRows,\n        selectedStitch,\n        patternStyle,\n        terminology,\n      );\n    }\n\n    if (!hasPro && !paidGrant) {\n      return NextResponse.json({ error: "Pattern generation requires an active Pro Membership or a successful £2.99 pattern unlock." }, { status: 402 });\n    }\n\n    const rows = buildRows(\n      patternStyle,\n      selectedStitch,\n      terminology,\n      blueprint.startingChain,\n      blueprint.totalRows,\n      blueprint.workingStitches,\n      palette,\n    );\n\n    const pattern = {\n      title: patternStyle + " Blanket Pattern",\n      stitch: selectedStitch,\n      style: patternStyle,\n      terminology,\n      palette,\n      startingChain: blueprint.startingChain,\n      totalRows: blueprint.totalRows,\n      rows,\n      notes: [\n        "Written in " + terminology + " crochet terminology.",\n        "Target finished size: " + width + "\" × " + length + "\".",\n        "Gauge/tension entered: " + stitchGauge + " stitches and " + rowGauge + " rows per 4\".",\n        "Make a tension swatch before starting the blanket and adjust hook size if necessary.",\n        "Check the stitch count at the end of every row before continuing.",\n      ],\n    };\n\n    if (paidGrant && sessionId) {\n      await stripe.checkout.sessions.update(sessionId, {\n        metadata: { grantUsed: "true", grantUsedAt: new Date().toISOString() },\n      });\n    }\n\n    return NextResponse.json({ success: true, pattern });\n  } catch (error) {\n    console.error("Pattern generation error:", error);\n    return NextResponse.json({ error: "Unable to generate the crochet pattern." }, { status: 500 });\n  }\n}\n