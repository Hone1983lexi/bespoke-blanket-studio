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
  return { startingChain: chain, totalRows: rows, workingStitches: Math.max(1, chain - 1) };
}

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
      if (r===1) push(r, "With "+colourName+", ch "+chain+". 1 "+dc+" in 2nd ch from hook, *ch 1, skip 1 ch, 1 "+dc+" in next ch; repeat across. Turn.", Math.ceil(chain/2), Math.ceil(chain/2)+" "+dc+" + chain-1 spaces");
      else push(r, (r%2===1 ? "Change to "+colourName+". " : "")+"Ch 1 and turn. 1 "+dc+" in each ch-1 space across, working 1 dc in the final edge stitch. Turn.", Math.ceil(chain/2), Math.ceil(chain/2)+" "+dc+" + chain-1 spaces");
      continue;
    }
    if (style === "Lemon Peel") {
      const sc=terminology==="UK"?"dc":"sc", dc=terminology==="UK"?"tr":"dc";
      if(r===1) push(r,"With "+colourName+", ch "+chain+". 1 "+sc+" in 2nd ch, 1 "+dc+" in next ch; *1 "+sc+" in next, 1 "+dc+" in next; repeat across. Turn.");
      else push(r,(r%2===1?"Change to "+colourName+". ":"")+"Ch 1 and turn. Work 1 "+sc+" in each "+dc+" and 1 "+dc+" in each "+sc+" across. Turn.");
      continue;
    }
    if (style === "Granny Stripe") {
      const dc=terminology==="UK"?"tr":"dc";
      if(r===1) push(r,"With "+colourName+", ch "+chain+". Work 1 "+(terminology==="UK"?"dc":"sc")+" in 2nd ch and across. Turn.",chain-1,(chain-1)+" edge stitches");
      else push(r,(r%2===0?"Change to "+colourName+". ":"")+"Ch 3 and turn. Work 3 "+dc+" in each space between clusters across, with an edge "+dc+" at each end. Turn.",stitches,"3-"+dc+" clusters + edge stitches");
      continue;
    }
    if (style === "Block Stitch") {
      const dc=terminology==="UK"?"tr":"dc", sc=terminology==="UK"?"dc":"sc";
      if(r===1) push(r,"With "+colourName+", ch "+chain+". Work "+sc+" in 2nd ch and across. Turn.");
      else if(r%2===0) push(r,"Change to "+colourName+". Ch 3 and turn. Work 3 "+dc+" in each chain-1 space across, with "+sc+" between groups. Turn.");
      else push(r,"Ch 1 and turn. Work "+sc+" into each "+dc+" group and each intervening space across. Turn.");
      continue;
    }
    if (style === "V-Stitch") {
      const dc=terminology==="UK"?"tr":"dc";
      if(r===1) push(r,"With "+colourName+", ch "+chain+". Work "+dc+" across. Turn.");
      else push(r,(r%2===0?"Change to "+colourName+". ":"")+"Ch 3 and turn. Work 1 "+dc+", *skip 2 stitches, ("+dc+", ch 1, "+dc+") in next stitch; repeat across, ending with "+dc+" in the final stitch. Turn.");
      continue;
    }
    if (style === "Shell Stitch") {
      const dc=terminology==="UK"?"tr":"dc";
      if(r===1) push(r,"With "+colourName+", ch "+chain+". Work "+(terminology==="UK"?"dc":"sc")+" across. Turn.");
      else push(r,(r%2===0?"Change to "+colourName+". ":"")+"Ch 3 and turn. *Skip 2 stitches, work 5 "+dc+" in next stitch, skip 2 stitches, "+(terminology==="UK"?"dc":"sc")+" in next; repeat across. Turn.");
      continue;
    }
    if (style === "Waffle Stitch") {
      const post=terminology==="UK"?"front post treble (fptr)":"front post double crochet (fpdc)";
      const back=terminology==="UK"?"back post treble (bptr)":"back post double crochet (bpdc)";
      const dc=terminology==="UK"?"tr":"dc";
      if(r===1) push(r,"With "+colourName+", ch "+chain+". Work 1 "+dc+" in 4th ch from hook and in each ch across. Turn.");
      else if(r%2===0) push(r,(r>2?"Change to "+colourName+". ":"")+"Ch 3 and turn. *"+post+" around next "+dc+", "+back+" around next "+dc+", "+post+" around next "+dc+"; repeat across. Turn.");
      else push(r,"Ch 3 and turn. *"+back+" around next "+dc+", "+post+" around next "+dc+", "+back+" around next "+dc+"; repeat across. Turn.");
      continue;
    }
    if (style === "Plain") {
      const turn=stitch==="Plain" ? "Ch 1" : "Ch 1";
      if(r===1) push(r,"With "+colourName+", ch "+chain+". Work 1 "+a+" in 2nd chain from hook and in each chain across. Turn.");
      else push(r,"Ch "+turn.replace("Ch ","")+" and turn. Work 1 "+a+" in each stitch across. Turn.");
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
