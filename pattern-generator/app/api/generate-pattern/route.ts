import { auth, clerkClient } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { STITCH_LIBRARY, type Terminology, type StitchRecipe } from "../../lib/stitch-library";
import { blueprintFor, buildRows } from "../../lib/stitch-engine";
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
      terminology,
      blueprint.startingChain,
      blueprint.totalRows,
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
