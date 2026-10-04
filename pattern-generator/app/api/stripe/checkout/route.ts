import Stripe from "stripe";
import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import crypto from "node:crypto";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const STITCHES = ["Single Crochet", "Half Double Crochet", "Double Crochet"] as const;
type CheckoutMode = "payment" | "subscription";

function positiveNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const mode = body.mode as CheckoutMode;

    if (mode !== "payment" && mode !== "subscription") {
      return NextResponse.json({ error: "Invalid checkout mode." }, { status: 400 });
    }

    const startingChain = Number(body.startingChain);
    const totalRows = Number(body.totalRows);
    const stitchGauge = positiveNumber(body.stitchGauge);
    const rowGauge = positiveNumber(body.rowGauge);
    const width = positiveNumber(body.width);
    const length = positiveNumber(body.length);
    const selectedStitch = body.selectedStitch;

    if (
      !Number.isInteger(startingChain) ||
      startingChain <= 0 ||
      startingChain > 1000 ||
      !Number.isInteger(totalRows) ||
      totalRows <= 0 ||
      totalRows > 1000
    ) {
      return NextResponse.json({ error: "Invalid pattern blueprint." }, { status: 400 });
    }

    if (
      !stitchGauge ||
      !rowGauge ||
      !width ||
      !length ||
      !STITCHES.includes(selectedStitch)
    ) {
      return NextResponse.json({ error: "Invalid pattern measurements." }, { status: 400 });
    }

    const { userId } = await auth();

    if (mode === "subscription" && !userId) {
      return NextResponse.json(
        { error: "Please sign in before joining Pro Membership." },
        { status: 401 }
      );
    }

    if (mode === "subscription" && userId) {
      const { clerkClient } = await import("@clerk/nextjs/server");
      const client = await clerkClient();
      const user = await client.users.getUser(userId);

      if (user.publicMetadata.subscriptionStatus === "active") {
        return NextResponse.json(
          { error: "Your Pro Membership is already active." },
          { status: 409 }
        );
      }
    }

    const origin =
      process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
    const nonce = crypto.randomBytes(32).toString("hex");

    const metadata = {
      blueprintType: "crochet-pattern",
      startingChain: String(startingChain),
      totalRows: String(totalRows),
      selectedStitch: String(selectedStitch),
      stitchGauge: String(stitchGauge),
      rowGauge: String(rowGauge),
      width: String(width),
      length: String(length),
      grantNonce: nonce,
      ...(userId ? { clerkUserId: userId } : {}),
    };

    const priceId =
      mode === "payment"
        ? process.env.STRIPE_ONE_OFF_PRICE_ID
        : process.env.STRIPE_PRO_PRICE_ID;

    if (!priceId) {
      console.error("Missing Stripe price ID for checkout mode:", mode);
      return NextResponse.json(
        { error: "Stripe pricing is not configured." },
        { status: 500 }
      );
    }

    const session = await stripe.checkout.sessions.create({
      mode,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      ...(mode === "subscription"
        ? {
            subscription_data: {
              metadata: {
                clerkUserId: userId!,
                plan: "pro",
              },
            },
          }
        : {}),
      metadata: {
        ...metadata,
        plan: mode === "subscription" ? "pro" : "one-off",
      },
      success_url: `${origin}/?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?checkout=cancelled`,
      ...(mode === "subscription"
        ? { payment_method_collection: "always" as const }
        : {}),
    });

    const response = NextResponse.json({ success: true, url: session.url });
    const cookieStore = await cookies();

    cookieStore.set("premium_checkout_nonce", nonce, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60,
    });

    return response;
  } catch (error) {
    console.error("Stripe checkout error:", error);
    return NextResponse.json(
      { error: "Unable to start secure checkout." },
      { status: 500 }
    );
  }
}
