import { auth, clerkClient } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { STITCH_LIBRARY, type Terminology, type StitchRecipe } from "../../lib/stitch-library";
import Stripe from "stripe";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

type Stitch = StitchRecipe["name"];
type PatternStyle = Stitch;
const STITCHES = STITCH_LIBRARY.map((recipe) => recipe.name);
const STYLES = STITCHES;
const TERMINOLOGIES: Terminology[] = ["UK", "US"];

function valid<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === "string" && values.includes(value as T);
}

function recipeFor(name: Stitch) {
  return STITCH_LIBRARY.find((recipe) => recipe.name === name)!;
}

function abbr(stitch: Stitch, terminology: Terminology) {
  const recipe = recipeFor(stitch);
  return terminology === "UK" ? recipe.uk : recipe.us;
}

function primaryAbbr(stitch: Stitch, terminology: Terminology) {
  const recipe = recipeFor(stitch);
  return terminology === "UK" ? recipe.uk.split("/")[0] : recipe.us.split("/")[0];
}

function startingChainFor(stitches: number, stitch: Stitch) {
  const rule = recipeFor(stitch).foundation;
  return Math.ceil(Math.max(1, stitches - rule.add) / rule.multiple) * rule.multiple + rule.add;
}

function blueprintFor(width: number, length: number, stitchGauge: number, rowGauge: number, style: PatternStyle) {
  const target = Math.max(4, Math.round(width * stitchGauge / 4));
  const rows = Math.max(1, Math.round(length * rowGauge / 4));
  const chain = startingChainFor(target, style);
  const workingStitches =
    style === "Moss / Linen"
      ? Math.max(1, Math.floor((chain - 1) / 2))
      : Math.max(1, chain - 1);
  return { startingChain: chain, totalRows: rows, workingStitches };
}

function colour(palette: string, row: number) {
  const list = ["Colour 1","Colour 2","Colour 3","Colour 4"];
  return list[row % list.length];
}

function buildRows(style: PatternStyle, stitch: Stitch, terminology: Terminology, chain: number, rows: number, stitches: number, palette: string) {
  const result: Array<{ rowNumber:number; instruction:string; stitchCount:number; countLabel?:string }> = [];
  const a = primaryAbbr(stitch, terminology);
  const full = abbr(stitch, terminology);
  const c = (r:number) => colour(palette, Math.floor((r - 1) / 2));
  const push = (rowNumber:number, instruction:string, stitchCount=stitches, countLabel=stitches+" "+a) => result.push({rowNumber,instruction,stitchCount,countLabel});

  for (let r=1; r<=rows; r++) {
    const colourName = c(r);
    if (style === "Moss / Linen") {
      const dc = terminology === "UK" ? "dc" : "sc";
      const miss = terminology === "UK" ? "miss" : "skip";
      const stitchCount = Math.floor((chain - 1) / 2);

      if (r === 1) {
        push(
          r,
          "With " + colourName + ", ch " + chain + ". 1 " + dc + " in 3rd ch from hook (the 2 missed chains count as 1 " + dc + " and 1 ch). " +
            "Repeat " + (stitchCount - 1) + " times: ch 1, " + miss + " 1 ch, 1 " + dc + " in next ch. Turn your work.",
          stitchCount,
          stitchCount + " " + dc + " + " + (stitchCount - 1) + " ch-1 spaces",
        );
      } else {
        const change = r % 2 === 1 ? "Change to " + colourName + ". " : "";
        push(
          r,
          change +
            "Ch 2 (counts as 1 " + dc + "). 1 " + dc + " in the next ch-1 space. " +
            "Repeat " + (stitchCount - 2) + " times: ch 1, " + miss + " 1 " + dc + ", 1 " + dc + " in the next ch-1 space. " +
            "Turn your work.",
          stitchCount,
          stitchCount + " " + dc + " stitches worked into " + (stitchCount - 1) + " ch-1 spaces",
        );
      }
      continue;
    }
    if (style === "Lemon Peel") {
      const sc = terminology === "UK" ? "dc" : "sc";
      const dc = terminology === "UK" ? "tr" : "dc";
      const change = (r > 1 && r % 2 === 1) ? "Change to " + colourName + ". " : "";

      if (r === 1) {
        push(
          r,
          "With " + colourName + ", ch " + chain + ". 1 " + sc + " in 2nd ch from hook, 1 " + dc +
            " in next ch; repeat this alternating sequence across to the end. Turn your work.",
          stitches,
          stitches + " stitches (alternating " + sc + " and " + dc + ")",
        );
      } else {
        push(
          r,
          change + "Ch 1 (does not count as a stitch). 1 " + sc + " in the first stitch, 1 " + dc +
            " in the next stitch; repeat across, working the " + sc + " into each previous " + dc +
            " and the " + dc + " into each previous " + sc + ". Turn your work.",
          stitches,
          stitches + " stitches",
        );
      }
      continue;
    }

    if (style === "Granny Stripe") {
      const edge = terminology === "UK" ? "dc" : "sc";
      const tr = terminology === "UK" ? "tr" : "dc";
      const change = r > 1 && r % 2 === 1 ? "Change to " + colourName + ". " : "";

      if (r === 1) {
        push(
          r,
          "With " + colourName + ", ch " + chain + ". 1 " + edge + " in 2nd ch from hook and in each ch across. Turn your work.",
          stitches,
          stitches + " stitches",
        );
      } else if (r === 2) {
        push(
          r,
          "Change to " + colourName + ". Ch 3 (counts as 1 " + tr + "). Work 1 " + tr +
            " in the first stitch; *miss 2 stitches, work 3 " + tr + " in the next stitch; repeat from * until 3 stitches remain, miss 2 stitches, work 2 " +
            tr + " in the last stitch. Turn your work.",
          stitches,
          stitches + " stitches including the turning chain",
        );
      } else if (r % 2 === 1) {
        push(
          r,
          change + "Ch 3 (counts as 1 " + tr + "). Miss the next stitch; work 3 " + tr +
            " in each space between clusters across. At the end, work 1 " + tr +
            " in the top of the previous turning chain. Turn your work.",
          stitches,
          stitches + " stitches including the turning chain",
        );
      } else {
        push(
          r,
          change + "Ch 3 (counts as 1 " + tr + "). Work 1 " + tr +
            " in the first space between the edge stitches, then 3 " + tr +
            " in each space between clusters across. Finish with 1 " + tr +
            " in the top of the previous turning chain. Turn your work.",
          stitches,
          stitches + " stitches including the turning chain",
        );
      }
      continue;
    }

    if (style === "Block Stitch") {
      const base = terminology === "UK" ? "htr" : "hdc";
      const tr = terminology === "UK" ? "tr" : "dc";
      const change = r > 1 && r % 2 === 0 ? "Change to " + colourName + ". " : "";

      if (r === 1) {
        push(
          r,
          "With " + colourName + ", ch " + chain + ". 1 " + base + " in 2nd ch from hook; *ch 1, miss 1 ch, 1 " +
            base + " in next ch; repeat from * across. Turn your work.",
          stitches,
          stitches + " stitches and " + Math.max(0, stitches - 1) + " ch-1 spaces",
        );
      } else if (r % 2 === 0) {
        push(
          r,
          change + "Ch 3 (counts as 1 " + tr + "). Work 3 " + tr +
            " in each ch-1 space across, then 1 " + tr + " in the final edge stitch. Turn your work.",
          stitches,
          stitches + " stitches including the turning chain",
        );
      } else {
        push(
          r,
          "Ch 1 (does not count as a stitch). Work 1 " + base +
            " in the first stitch; *ch 1, work 1 " + base +
            " in the space between the next cluster groups; repeat across to the final stitch, then work 1 " +
            base + " in the final stitch. Turn your work.",
          stitches,
          stitches + " stitches and ch-1 spaces",
        );
      }
      continue;
    }

    if (style === "V-Stitch") {
      const stitchName = terminology === "UK" ? "tr" : "dc";
      const change = r > 1 && r % 2 === 1 ? "Change to " + colourName + ". " : "";

      if (r === 1) {
        push(
          r,
          "With " + colourName + ", ch " + chain + ". Miss 3 ch (the turning chain), then work (1 " + stitchName +
            ", ch 1, 1 " + stitchName + ") in the next ch; *miss 2 ch, work (1 " + stitchName +
            ", ch 1, 1 " + stitchName + ") in the next ch; repeat across. Finish with 1 " + stitchName +
            " at the edge as needed for the stated foundation multiple. Turn your work.",
          stitches,
          stitches + " working stitches across the row",
        );
      } else {
        push(
          r,
          change + "Ch 2 (does not count as a stitch). Work (1 " + stitchName + ", ch 1, 1 " + stitchName +
            ") in each V-stitch chain-1 space across. Finish with 1 " + stitchName +
            " in the top of the previous turning chain. Turn your work.",
          stitches,
          stitches + " working stitches across the row",
        );
      }
      continue;
    }

    if (style === "Shell Stitch") {
      const dc = terminology === "UK" ? "dc" : "sc";
      const tr = terminology === "UK" ? "tr" : "dc";
      const miss = terminology === "UK" ? "miss" : "skip";
      const shellCount = Math.floor((stitches - 1) / 6);

      if (r === 1) {
        push(
          r,
          "With " + colourName + ", ch " + chain + ". 1 " + dc + " in 2nd ch from hook. " +
            "Repeat " + shellCount + " times: " + miss + " 2 ch, 5 " + tr +
            " in next ch, " + miss + " 2 ch, 1 " + dc + " in next ch. Turn your work.",
          stitches,
          shellCount + " shells + " + (shellCount + 1) + " " + dc + " anchors = " + stitches + " stitches",
        );
      } else if (r % 2 === 0) {
        const change = r > 2 ? "Change to " + colourName + ". " : "";
        push(
          r,
          change +
            "Ch 3 (counts as 1 " + tr + "). Work 2 " + tr + " in the first stitch. " +
            "Repeat " + Math.max(0, shellCount - 1) + " times: " + miss + " 2 stitches, 1 " + dc +
            " in the next stitch, " + miss + " 2 stitches, 5 " + tr + " in the next " + dc +
            ". Then " + miss + " 2 stitches, 1 " + dc + " in the next stitch, " +
            miss + " 2 stitches, 3 " + tr + " in the last stitch. Turn your work.",
          stitches,
          "Shell repeat balanced to " + stitches + " stitches",
        );
      } else {
        const change = r > 1 ? "Change to " + colourName + ". " : "";
        push(
          r,
          change +
            "Ch 1 (does not count as a stitch). 1 " + dc + " in the first stitch. " +
            "Repeat " + shellCount + " times: " + miss + " 2 stitches, 5 " + tr +
            " in the next " + dc + ", " + miss + " 2 stitches, 1 " + dc +
            " in the next " + tr + ". On the final repeat, work the last " + dc +
            " into the top of the turning chain-3. Turn your work.",
          stitches,
          "Shell repeat balanced to " + stitches + " stitches",
        );
      }
      continue;
    }

    if (style === "Waffle Stitch") {
      const base = terminology === "UK" ? "tr" : "dc";
      const front = terminology === "UK" ? "front post treble (fptr)" : "front post double crochet (fpdc)";
      const back = terminology === "UK" ? "back post treble (bptr)" : "back post double crochet (bpdc)";
      const change = r > 1 && r % 2 === 0 ? "Change to " + colourName + ". " : "";

      if (r === 1) {
        push(
          r,
          "With " + colourName + ", ch " + chain + ". Work 1 " + base + " in 4th ch from hook and in each ch across. Turn your work.",
          stitches,
          stitches + " stitches",
        );
      } else if (r % 2 === 0) {
        push(
          r,
          change + "Ch 2 (counts as 1 " + base + "). Work 1 " + front + " around the next stitch, then 1 " + base +
            " in each of the next 2 stitches; repeat this 3-stitch repeat across. Finish with the edge stitch at the turning chain. Turn your work.",
          stitches,
          stitches + " stitches including the turning chain",
        );
      } else {
        push(
          r,
          "Ch 2 (counts as 1 " + base + "). Work 1 " + base + " in the next stitch, then 1 " + front +
            " around each of the next 2 stitches; repeat across. Finish with the edge stitches as required. Turn your work.",
          stitches,
          stitches + " stitches including the turning chain",
        );
      }
      continue;
    }
    if (style === "Plain") {
      if(r===1) push(r,"With "+colourName+", ch "+chain+". Work 1 "+a+" in 2nd chain from hook and in each chain across. Turn.");
      else push(r,"Ch 3 and turn. Work 1 "+a+" in each stitch across. Turn.");
      continue;
    }
    push(r,(r>1?"Change to "+colourName+". ":"")+"Ch 1 and turn. Work 1 "+a+" in each stitch across. Turn.");
  }
  return result;
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

    const blueprint = blueprintFor(width, length, stitchGauge, rowGauge, patternStyle);
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
