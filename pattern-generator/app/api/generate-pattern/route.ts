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
      : style === "Waffle Stitch"
        ? Math.max(1, chain - 2)
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
      const short = terminology === "UK" ? "dc" : "sc";
      const tall = terminology === "UK" ? "tr" : "dc";
      const change = r > 1 && r % 2 === 1 ? "Change to " + colourName + ". " : "";
      if (r === 1) {
        push(r, "With " + colourName + ", ch " + chain + ". Work 1 " + short + " in 2nd ch from hook, 1 " + tall +
          " in next ch; repeat this 2-stitch sequence across to the final chain. Turn your work.",
          stitches, stitches + " stitches: alternating " + short + " and " + tall + ".");
      } else {
        push(r, change + "Ch 1 (does not count as a stitch). Work 1 " + tall + " in the first " + short +
          " below, then 1 " + short + " in the next " + tall + " below; repeat this alternating sequence across. Turn your work.",
          stitches, stitches + " stitches.");
      }
      continue;
    }

    if (style === "Granny Stripe") {
      const tr = terminology === "UK" ? "tr" : "dc";
      const dc = terminology === "UK" ? "dc" : "sc";
      const change = r > 1 && r % 2 === 1 ? "Change to " + colourName + ". " : "";
      const clusters = Math.max(1, Math.floor((stitches - 4) / 3));
      if (r === 1) {
        push(r, "With " + colourName + ", ch " + chain + ". 1 " + dc + " in 2nd ch from hook and in each ch across. Turn your work.",
          stitches, stitches + " " + dc + " stitches.");
      } else if (r === 2) {
        push(r, "Change to " + colourName + ". Ch 3 (counts as 1 " + tr + "). Work 1 " + tr +
          " in the stitch at the base of the ch-3. Repeat " + clusters + " times: miss 2 stitches, work 3 " + tr +
          " in the next stitch. Miss 2 stitches, work 2 " + tr + " in the last stitch. Turn your work.",
          stitches, stitches + " stitches.");
      } else if (r % 2 === 1) {
        push(r, change + "Ch 3 (counts as 1 " + tr + "). Work 3 " + tr +
          " in the first space between clusters. Repeat the 3-" + tr +
          " cluster in every remaining space between clusters. Finish with 1 " + tr +
          " in the top of the previous turning chain. Turn your work.",
          stitches, stitches + " stitches.");
      } else {
        push(r, change + "Ch 3 (counts as 1 " + tr + "). Work 1 " + tr +
          " in the first space, then 3 " + tr + " in every space between clusters across. Work 2 " +
          tr + " in the final edge space. Turn your work.", stitches, stitches + " stitches.");
      }
      continue;
    }

    if (style === "Block Stitch") {
      const htr = terminology === "UK" ? "htr" : "hdc";
      const tr = terminology === "UK" ? "tr" : "dc";
      const row1Count = Math.floor(chain / 2);
      const blocks = Math.max(1, row1Count - 1);
      if (r === 1) {
        push(r, "With " + colourName + ", ch " + chain + ". 1 " + htr +
          " in 2nd ch from hook. Repeat: ch 1, miss 1 chain, 1 " + htr + " in next chain, across to the end. Turn your work.",
          row1Count, row1Count + " " + htr + " stitches and " + (row1Count - 1) + " ch-1 spaces.");
      } else if (r % 2 === 0) {
        push(r, "Change to " + colourName + ". Ch 3 (counts as 1 " + tr + "). Work 3 " + tr +
          " in each ch-1 space across. Finish with 1 " + tr + " in the final edge stitch. Turn your work.",
          blocks * 3 + 1, (blocks * 3 + 1) + " stitches.");
      } else {
        push(r, "Change to " + colourName + ". Ch 1 (does not count as a stitch). Work 1 " + htr +
          " in the first stitch. Repeat: ch 1, 1 " + htr +
          " in the space between the groups of three trebles, across. Finish with ch 1 and 1 " + htr +
          " in the last stitch. Turn your work.", row1Count, row1Count + " " + htr + " stitches.");
      }
      continue;
    }

    if (style === "V-Stitch") {
      const tr = terminology === "UK" ? "tr" : "dc";
      const vCount = Math.floor((chain - 4) / 3);
      if (r === 1) {
        push(r, "With " + colourName + ", ch " + chain + ". Work 1 " + tr +
          " in the 5th ch from hook, ch 1, 1 " + tr + " in the same chain to make the first V-stitch. Repeat " +
          Math.max(0, vCount - 1) + " times: miss 2 chains, then work (1 " + tr + ", ch 1, 1 " + tr +
          ") in the next chain. Miss 1 chain and work 1 " + tr + " in the final chain. Turn your work.",
          vCount * 2 + 1, vCount + " V-stitches + 1 edge " + tr + " = " + (vCount * 2 + 1) + " working stitches.");
      } else {
        push(r, "Change to " + colourName + ". Ch 3 (counts as 1 " + tr + "). Work (1 " + tr +
          ", ch 1, 1 " + tr + ") in the ch-1 space of every V-stitch across. Finish with 1 " + tr +
          " in the top of the previous turning chain. Turn your work.",
          vCount * 2 + 2, vCount + " V-stitches + 2 edge " + tr + " stitches.");
      }
      continue;
    }

    if (style === "Shell Stitch") {
      const dc = terminology === "UK" ? "dc" : "sc";
      const tr = terminology === "UK" ? "tr" : "dc";
      const miss = terminology === "UK" ? "miss" : "skip";
      const shells = Math.floor((stitches - 1) / 6);
      if (r === 1) {
        push(r, "With " + colourName + ", ch " + chain + ". 1 " + dc + " in 2nd ch from hook. Repeat " + shells +
          " times: " + miss + " 2 chains, 5 " + tr + " in the next chain, " + miss + " 2 chains, 1 " + dc +
          " in the next chain. Turn your work.", stitches, stitches + " stitches.");
      } else if (r % 2 === 0) {
        push(r, "Change to " + colourName + ". Ch 1 (does not count as a stitch). Work 3 " + tr +
          " in the first " + dc + ". Repeat " + shells + " times: " + miss + " 2 " + tr +
          " stitches, 1 " + dc + " in the middle " + tr + " of the next shell, " + miss +
          " 2 " + tr + " stitches, 5 " + tr + " in the next " + dc + ". Turn your work.",
          stitches + 2, (stitches + 2) + " stitches on the shell row.");
      } else {
        push(r, "Change to " + colourName + ". Ch 1 (does not count as a stitch). Work 1 " + dc +
          " in the first stitch. Repeat " + shells + " times: 5 " + tr + " in the next " + dc +
          ", " + miss + " 2 " + tr + " stitches, 1 " + dc + " in the middle " + tr +
          " of the next shell, " + miss + " 2 " + tr + " stitches. Finish with 1 " + dc +
          " in the final stitch. Turn your work.", stitches, stitches + " stitches.");
      }
      continue;
    }

    if (style === "Waffle Stitch") {
      const tr = terminology === "UK" ? "tr" : "dc";
      const fp = terminology === "UK" ? "front post treble (fptr)" : "front post double crochet (fpdc)";
      const count = chain - 2;
      const repeats = Math.max(1, Math.floor((count - 2) / 3));
      if (r === 1) {
        push(r, "With " + colourName + ", ch " + chain + ". Work 1 " + tr +
          " in the 4th ch from hook (the first 3 chains count as 1 " + tr + "), then 1 " + tr +
          " in each chain across. Turn your work.", count, count + " " + tr + " stitches.");
      } else if (r % 2 === 0) {
        push(r, "Change to " + colourName + ". Ch 3 (counts as 1 " + tr + "). Repeat " + repeats +
          " times: work 1 " + fp + " around the next 2 stitches, then 1 " + tr +
          " in the next stitch. Finish with 1 " + tr + " in the top of the previous turning chain. Turn your work.",
          count, count + " stitches.");
      } else {
        push(r, "Ch 3 (counts as 1 " + tr + "). Work 1 " + tr + " in the next stitch. Repeat " + repeats +
          " times: work 1 " + fp + " around each of the next 2 stitches, then 1 " + tr +
          " in the next stitch. Finish with 1 " + tr + " in the top of the previous turning chain. Turn your work.",
          count, count + " stitches.");
      }
      continue;
    }

    if (style === "Plain") {
      if (r === 1) {
        push(
          r,
          "With " + colourName + ", ch " + chain + ". 1 " + a + " in 2nd ch from hook and in each ch across. Turn your work.",
          stitches,
          stitches + " stitches",
        );
      } else {
        push(
          r,
          "Ch 2 (does not count as a stitch). 1 " + a + " in each stitch across. Turn your work.",
          stitches,
          stitches + " stitches",
        );
      }
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
