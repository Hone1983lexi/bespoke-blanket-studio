import OpenAI from "openai";
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";

export const runtime = "nodejs";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

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
  selectedStitch: string
) {
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  const metadata = session.metadata ?? {};

  if (session.mode === "subscription") {
    if (!userId || metadata.clerkUserId !== userId) {
      return false;
    }

    const subscriptionId =
      typeof session.subscription === "string"
        ? session.subscription
        : session.subscription?.id;

    if (!subscriptionId) return false;

    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    return (
      (subscription.status === "active" || subscription.status === "trialing") &&
      metadata.plan === "pro"
    );
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
    metadata.blueprintType !== "crochet-pattern"
  ) {
    return false;
  }

  if (metadata.clerkUserId && metadata.clerkUserId !== userId) {
    return false;
  }

  const cookieStore = await cookies();
  const nonce = cookieStore.get("premium_checkout_nonce")?.value;

  return Boolean(nonce && metadata.grantNonce === nonce);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const sessionId =
      typeof body.sessionId === "string" ? body.sessionId : null;

    let startingChain = Number(body.startingChain);
    let totalRows = Number(body.totalRows);
    let selectedStitch = body.selectedStitch;

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
        selectedStitch
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
      "Return only data matching the supplied schema.",
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
