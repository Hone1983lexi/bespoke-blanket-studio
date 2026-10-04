import Stripe from "stripe";
import { clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

async function updateClerkSubscription(
  userId: string,
  status: string,
  subscriptionId?: string,
  customerId?: string
) {
  const client = await clerkClient();

  await client.users.updateUserMetadata(userId, {
    publicMetadata: {
      subscriptionStatus: status,
      subscriptionUpdatedAt: new Date().toISOString(),
    },
    privateMetadata: {
      ...(subscriptionId ? { stripeSubscriptionId: subscriptionId } : {}),
      ...(customerId ? { stripeCustomerId: customerId } : {}),
    },
  });
}

async function markOneOffPaid(session: Stripe.Checkout.Session) {
  if (session.payment_status !== "paid") return;

  await stripe.checkout.sessions.update(session.id, {
    metadata: {
      paymentGrant: "paid",
      grantPaidAt: new Date().toISOString(),
    },
  });
}

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !secret) {
    return NextResponse.json({ error: "Webhook is not configured." }, { status: 500 });
  }

  let event: Stripe.Event;

  try {
    const rawBody = await request.text();
    event = stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch (error) {
    console.error("Stripe webhook signature verification failed:", error);
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;

        if (session.mode === "payment") {
          await markOneOffPaid(session);
        }

        if (session.mode === "subscription") {
          const userId = session.metadata?.clerkUserId;
          const subscriptionId =
            typeof session.subscription === "string"
              ? session.subscription
              : session.subscription?.id;

          if (userId && subscriptionId && session.payment_status === "paid") {
            const subscription = await stripe.subscriptions.retrieve(subscriptionId);
            const status =
              subscription.status === "active" || subscription.status === "trialing"
                ? "active"
                : "inactive";

            await updateClerkSubscription(
              userId,
              status,
              subscription.id,
              typeof session.customer === "string" ? session.customer : undefined
            );
          }
        }

        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.metadata?.clerkUserId;

        if (!userId) break;

        const status =
          subscription.status === "active" || subscription.status === "trialing"
            ? "active"
            : "inactive";

        await updateClerkSubscription(
          userId,
          status,
          subscription.id,
          typeof subscription.customer === "string"
            ? subscription.customer
            : undefined
        );

        break;
      }

      case "customer.subscription.paused": {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.metadata?.clerkUserId;

        if (userId) {
          await updateClerkSubscription(
            userId,
            "inactive",
            subscription.id,
            typeof subscription.customer === "string"
              ? subscription.customer
              : undefined
          );
        }

        break;
      }

      default:
        break;
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Stripe webhook handling error:", error);
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  }
}
