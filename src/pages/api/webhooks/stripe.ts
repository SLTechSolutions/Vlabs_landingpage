import type { APIRoute } from "astro";
import type Stripe from "stripe";
import { jsonResponse } from "../../../lib/server/api";
import { upsertGhlContact } from "../../../lib/server/ghl";
import { createStripeClient } from "../../../lib/server/stripe";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const STRIPE_SECRET_KEY =
    process.env.STRIPE_SECRET_KEY ?? import.meta.env.STRIPE_SECRET_KEY;
  const STRIPE_WEBHOOK_SECRET =
    process.env.STRIPE_WEBHOOK_SECRET ?? import.meta.env.STRIPE_WEBHOOK_SECRET;
  const GHL_API_KEY = process.env.GHL_API_KEY ?? import.meta.env.GHL_API_KEY;
  const GHL_LOCATION_ID =
    process.env.GHL_LOCATION_ID ?? import.meta.env.GHL_LOCATION_ID;

  if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
    console.error("Stripe webhook integration is not configured.");
    return jsonResponse(
      { success: false, error: "Unable to process webhook." },
      500,
    );
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return jsonResponse(
      { success: false, error: "Missing Stripe signature." },
      400,
    );
  }

  try {
    const stripe = createStripeClient(STRIPE_SECRET_KEY);
    let event: Stripe.Event;
    try {
      // Signature verification requires the unchanged raw body, not parsed JSON.
      const body = await request.text();
      event = stripe.webhooks.constructEvent(
        body,
        signature,
        STRIPE_WEBHOOK_SECRET,
      );
    } catch {
      console.error("Stripe webhook signature verification failed.");
      return jsonResponse(
        { success: false, error: "Invalid Stripe webhook." },
        400,
      );
    }

    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
    ) {
      const session = event.data.object as Stripe.Checkout.Session;
      // A completed session can still be unpaid; never tag it as a paid customer.
      if (session.payment_status === "paid") {
        const customerEmail =
          session.customer_details?.email || session.customer_email;
        if (
          typeof customerEmail === "string" &&
          customerEmail.trim() &&
          GHL_API_KEY &&
          GHL_LOCATION_ID
        ) {
          const amountTotal = session.amount_total ?? 0;
          if (!Number.isSafeInteger(amountTotal) || amountTotal < 0) {
            throw new Error("Invalid checkout amount.");
          }
          const pricePaid = (amountTotal / 100).toString();
          try {
            await upsertGhlContact(GHL_API_KEY, {
              locationId: GHL_LOCATION_ID,
              email: customerEmail.trim(),
              tags: ["paid-customer"],
              // Preserve the configured GHL custom-field key.
              customFields: [{ key: "price", field_value: `$${pricePaid}` }],
            });
          } catch {
            console.error("Paid customer tracking failed.");
            // Do not acknowledge failed delivery: Stripe must be able to retry.
            return jsonResponse(
              { success: false, error: "Unable to process webhook." },
              502,
            );
          }
        }
      }
    }

    return jsonResponse({ received: true });
  } catch {
    console.error("Stripe webhook processing failed.");
    return jsonResponse(
      { success: false, error: "Unable to process webhook." },
      500,
    );
  }
};
