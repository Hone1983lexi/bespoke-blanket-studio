import { auth, clerkClient } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

type Stitch = "Single Crochet" | "Half Double Crochet" | "Double Crochet";
type PatternStyle = "Plain" | "Striped" | "Moss Stitch" | "Granny Stripe" | "Chevron / Ripple" | "Stitch Sampler";
type Terminology = "UK" | "US";

const STITCHES: Stitch[] = ["Single Crochet", "Half Double Crochet", "Double Crochet"];
const STYLES: PatternStyle[] = ["Plain", "Striped", "Moss Stitch", "Granny Stripe", "Chevron / Ripple", "Stitch Sampler"];
const TERMINOLOGIES: Terminology[] = ["UK", "US"];

function valid<T extends string>(value: unknown, values: T[]): value is T {
  return typeof value === "string" && values.includes(value as T);
}

function abbr(stitch: Stitch, terminology: Terminology) {
  if (terminology === "UK") {
    if (stitch === "Single Crochet") return "dc";
    if (stitch === "Half Double Crochet") return "htr";
    return "tr";
  }
  if (stitch === "Single Crochet") return "sc";
  if (stitch === "Half Double Crochet") return "hdc";
  return "dc";
}

function nameOf(stitch: Stitch, terminology: Terminology) {
  if (terminology === "UK") {
    if (stitch === "Single Crochet") return "double crochet";
    if (stitch === "Half Double Crochet") return "half treble";
    return "treble";
  }
  if (stitch === "Single Crochet") return "single crochet";
  if (stitch === "Half Double Crochet") return "half double crochet";
  return "double crochet";
}

function startingChainFor(stitches: number, stitch: Stitch) {
  if (stitch === "Single Crochet") return stitches + 1;
  return stitches + 2;
}

function blueprintFor(width: number, length: number, stitchGauge: number, rowGauge: number, style: PatternStyle, stitch: Stitch) {
  const target = Math.max(4, Math.round(width * stitchGauge / 4));
  const rows = Math.max(1, Math.round(length * rowGauge / 4));
  if (style === "Moss Stitch") {
    const chain = target % 2 === 0 ? target : target + 1;
    return { startingChain: Math.max(4, chain), totalRows: rows, workingStitches: Math.ceil(chain / 2) };
  }
  if (style === "Granny Stripe") {
    const groups = Math.max(1, Math.round((target - 2) / 3));
    const chain = groups * 3 + 2;
    return { startingChain: chain, totalRows: rows, workingStitches: chain - 1 };
  }
  if (style === "Chevron / Ripple") {
    const repeats = Math.max(1, Math.round(target / 16));
    const stitches = repeats * 16;
    return { startingChain: stitches + 1, totalRows: rows, workingStitches: stitches };
  }
  return { startingChain: startingChainFor(target, stitch), totalRows: rows, workingStitches: target };
}

function colour(palette: string, row: number) {
  const names: Record<string, string[]> = {
    "Warm Neutral": ["Colour 1", "Colour 2", "Colour 3", "Colour 4"],
    Sunset: ["Colour 1", "Colour 2", "Colour 3", "Colour 4"],
    Ocean: ["Colour 1", "Colour 2", "Colour 3", "Colour 4"],
    Pastel: ["Colour 1", "Colour 2", "Colour 3", "Colour 4"],
    Rainbow: ["Colour 1", "Colour 2", "Colour 3", "Colour 4"],
    Forest: ["Colour 1", "Colour 2", "Colour 3", "Colour 4"],
  };
  const list = names[palette] || names["Warm Neutral"];
  return list[row % list.length];
}

function plainRow(stitch: Stitch, terminology: Terminology, chain: number, stitches: number, row: number) {
  const a = abbr(stitch, terminology);
  const n = nameOf(stitch, terminology);
  if (row === 1) {
    if (stitch === "Single Crochet") return "Ch " + chain + ". Work 1 " + n + " (" + a + ") in the 2nd chain from the hook and in each chain across. Turn. (" + stitches + " " + a + ")";
    if (stitch === "Half Double Crochet") return "Ch " + chain + ". Work 1 " + n + " (" + a + ") in the 3rd chain from the hook and in each chain across. Turn. (" + stitches + " " + a + ")";
    return "Ch " + chain + ". The first 3 chains count as the first " + a + ". Work 1 " + a + " in the 4th chain from the hook and in each chain across. Turn. (" + stitches + " " + a + ")";
  }
  const turn = stitch === "Single Crochet" ? "Ch 1" : stitch === "Half Double Crochet" ? "Ch 2" : "Ch 3";
  return turn + " and turn. Work 1 " + a + " in each stitch across, including the final stitch. Turn. (" + stitches + " " + a + ")";
}

function buildRows(style: PatternStyle, stitch: Stitch, terminology: Terminology, chain: number, rows: number, stitches: number, palette: string) {
  const result: Array<{ rowNumber: number; instruction: string; stitchCount: number; countLabel?: string }> = [];
  if (style === "Moss Stitch") {
    const sc = terminology === "UK" ? "dc" : "sc";
    const count = Math.ceil(chain / 2);
    for (let r = 1; r <= rows; r++) {
      const c = colour(palette, Math.floor((r - 1) / 2));
      if (r === 1) result.push({ rowNumber: r, instruction: "With " + c + ", ch " + chain + ". 1 " + sc + " in 2nd ch from hook, *ch 1, skip 1 ch, 1 " + sc + " in next ch; repeat across, ending with 1 " + sc + " in last ch. Turn.", stitchCount: count, countLabel: count + " " + sc + " + chain-1 spaces" });
      else result.push({ rowNumber: r, instruction: ((r - 1) % 2 === 0 ? "Change to " + c + ". " : "") + "Ch 1 and turn. 1 " + sc + " in first ch-1 space, *ch 1, skip the next stitch, 1 " + sc + " in next ch-1 space; repeat across, ending with 1 " + sc + " in the last ch-1 space. Turn.", stitchCount: count, countLabel: count + " " + sc + " + chain-1 spaces" });
    }
    return result;
  }
  if (style === "Granny Stripe") {
    const dc = terminology === "UK" ? "tr" : "dc";
    const first = terminology === "UK" ? "dc" : "sc";
    const groups = Math.max(1, Math.round((chain - 2) / 3));
    for (let r = 1; r <= rows; r++) {
      const c = colour(palette, Math.floor((r - 1) / 2));
      if (r === 1) result.push({ rowNumber: r, instruction: "With " + c + ", ch " + chain + ". Work 1 " + first + " in 2nd ch from hook and in each ch across. Turn.", stitchCount: chain - 1, countLabel: (chain - 1) + " " + first });
      else if (r % 2 === 0) result.push({ rowNumber: r, instruction: (r > 2 ? "Change to " + c + ". " : "") + "Ch 3 and turn. 1 " + dc + " in first stitch, *skip 2 stitches, 3 " + dc + " in next stitch; repeat across until 3 stitches remain, skip 2 stitches, 2 " + dc + " in final stitch. Turn.", stitchCount: chain - 1, countLabel: groups + " granny clusters + edge stitches" });
      else result.push({ rowNumber: r, instruction: "Ch 3 and turn. Work 3 " + dc + " in each space between clusters across. Finish with 1 " + dc + " in the top of the turning chain. Turn.", stitchCount: chain - 1, countLabel: groups + " granny clusters + edge stitch" });
    }
    return result;
  }
  if (style === "Chevron / Ripple") {
    const sc = terminology === "UK" ? "dc" : "sc";
    const repeats = stitches / 16;
    for (let r = 1; r <= rows; r++) {
      const c = colour(palette, r - 1);
      if (r === 1) result.push({ rowNumber: r, instruction: "With " + c + ", ch " + chain + ". Work 1 " + sc + " in 2nd ch from hook and in each ch across. Turn.", stitchCount: stitches, countLabel: stitches + " " + sc });
      else result.push({ rowNumber: r, instruction: "Change to " + c + ". Ch 1 and turn. Repeat " + repeats + " times: 2 " + sc + " in next stitch, 1 " + sc + " in each of next 5 stitches, " + sc + "2tog twice, 1 " + sc + " in each of next 5 stitches, 2 " + sc + " in next stitch. Turn.", stitchCount: stitches, countLabel: stitches + " " + sc + " — " + repeats + " ripple repeats" });
    }
    return result;
  }
  if (style === "Stitch Sampler") {
    const sequence: Stitch[] = ["Single Crochet", "Half Double Crochet", "Double Crochet", stitch];
    for (let r = 1; r <= rows; r++) {
      const rowStitch = sequence[(r - 1) % sequence.length];
      const rowChain = startingChainForStitch(stitches, rowStitch);
      const a = abbr(rowStitch, terminology);
      const c = colour(palette, Math.floor((r - 1) / 2));
      result.push({ rowNumber: r, instruction: (r === 1 ? "With " + c + ", " : (r % 2 === 1 ? "Change to " + c + ". " : "")) + plainRow(rowStitch, terminology, rowChain, stitches, 1).replace(/^Ch [0-9]+\\. /, "Ch " + rowChain + ". "), stitchCount: stitches, countLabel: stitches + " " + a });
    }
    return result;
  }
  for (let r = 1; r <= rows; r++) {
    const c = colour(palette, r - 1);
    const text = plainRow(stitch, terminology, chain, stitches, r);
    result.push({ rowNumber: r, instruction: style === "Striped" ? (r === 1 ? "With " + c + ", " + text : "Change to " + c + ". " + text) : text, stitchCount: stitches, countLabel: stitches + " " + abbr(stitch, terminology) });
  }
  return result;
}

function startingChainForStitch(stitches: number, stitch: Stitch) {
  return stitch === "Single Crochet" ? stitches + 1 : stitches + 2;
}

async function hasActiveProSubscription(userId: string) {
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
  patternStyle: string,
  terminology: string
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
    metadata.terminology !== terminology ||
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
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : null;

    let stitchGauge = Number(body.stitchGauge);
    let rowGauge = Number(body.rowGauge);
    let width = Number(body.width);
    let length = Number(body.length);
    let selectedStitch = body.selectedStitch as Stitch;
    let patternStyle = body.patternStyle as PatternStyle;
    let terminology = body.terminology as Terminology;
    let palette = typeof body.palette === "string" ? body.palette : "Warm Neutral";

    if (sessionId) {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      const metadata = session.metadata ?? {};
      stitchGauge = Number(metadata.stitchGauge);
      rowGauge = Number(metadata.rowGauge);
      width = Number(metadata.width);
      length = Number(metadata.length);
      selectedStitch = metadata.selectedStitch as Stitch;
      patternStyle = metadata.patternStyle as PatternStyle;
      terminology = (metadata.terminology as Terminology) || "UK";
      palette = metadata.palette || "Warm Neutral";
    }

    if (
      !Number.isFinite(stitchGauge) || stitchGauge <= 0 ||
      !Number.isFinite(rowGauge) || rowGauge <= 0 ||
      !Number.isFinite(width) || width <= 0 ||
      !Number.isFinite(length) || length <= 0 ||
      !valid(selectedStitch, STITCHES) ||
      !valid(patternStyle, STYLES) ||
      !valid(terminology, TERMINOLOGIES)
    ) {
      return NextResponse.json({ error: "Please check your measurements, stitch, style and terminology." }, { status: 400 });
    }

    const blueprint = blueprintFor(width, length, stitchGauge, rowGauge, patternStyle, selectedStitch);
    if (blueprint.startingChain > 1000 || blueprint.totalRows > 1000) {
      return NextResponse.json({ error: "The requested blanket is too large for this generator." }, { status: 400 });
    }

    const { userId } = await auth();
    const hasPro = userId ? await hasActiveProSubscription(userId) : false;
    let paidGrant = false;

    if (!hasPro && sessionId) {
      paidGrant = await verifyPaidCheckoutGrant(
        sessionId,
        userId,
        blueprint.startingChain,
        blueprint.totalRows,
        selectedStitch,
        patternStyle,
        terminology,
      );
    }

    if (!hasPro && !paidGrant) {
      return NextResponse.json({ error: "Pattern generation requires an active Pro Membership or a successful £2.99 pattern unlock." }, { status: 402 });
    }

    const rows = buildRows(
      patternStyle,
      selectedStitch,
      terminology,
      blueprint.startingChain,
      blueprint.totalRows,
      blueprint.workingStitches,
      palette,
    );

    const pattern = {
      title: patternStyle + " Blanket Pattern",
      stitch: selectedStitch,
      style: patternStyle,
      terminology,
      palette,
      startingChain: blueprint.startingChain,
      totalRows: blueprint.totalRows,
      rows,
      notes: [
        "Written in " + terminology + " crochet terminology.",
        "Target finished size: " + width + "\" × " + length + "\".",
        "Gauge/tension entered: " + stitchGauge + " stitches and " + rowGauge + " rows per 4\".",
        "Make a tension swatch before starting the blanket and adjust hook size if necessary.",
        "Check the stitch count at the end of every row before continuing.",
      ],
    };

    if (paidGrant && sessionId) {
      await stripe.checkout.sessions.update(sessionId, {
        metadata: { grantUsed: "true", grantUsedAt: new Date().toISOString() },
      });
    }

    return NextResponse.json({ success: true, pattern });
  } catch (error) {
    console.error("Pattern generation error:", error);
    return NextResponse.json({ error: "Unable to generate the crochet pattern." }, { status: 500 });
  }
}
