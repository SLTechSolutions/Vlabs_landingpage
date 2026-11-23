import type { APIRoute } from "astro";
import { randomUUID } from "node:crypto";
import config from "../../config/config.json";
import { currencyForLocale, isLocale, type Locale } from "../../lib/currency";
import {
  failureResponse,
  InputError,
  jsonResponse,
  personFields,
  queryLocale,
  readFields,
} from "../../lib/server/api";
import { upsertGhlContact } from "../../lib/server/ghl";
import { isPlanId, resolvePlan } from "../../lib/server/pricing";
import { buildSepayCheckout } from "../../lib/server/sepay";

// This route is server-rendered; integration settings stay request-local.
export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  let locale: Locale = queryLocale(request);
  try {
    const fields = await readFields(request);
    if (!isLocale(fields.locale)) {
      throw new InputError("Locale must be en or vi.", 400, "invalid_locale");
    }
    locale = fields.locale;
    const person = personFields(fields);
    if (!isPlanId(fields.planId)) {
      throw new InputError("Unknown plan.", 400, "unknown_plan");
    }
    if (fields.interval !== "month" && fields.interval !== "year") {
      throw new InputError(
        "Interval must be month or year.",
        400,
        "invalid_interval",
      );
    }

    // Only immutable selection and server content choose currency and amount.
    const currency = currencyForLocale(locale);
    const plan = await resolvePlan(fields.planId, fields.interval, currency);
    const unavailable = () =>
      jsonResponse(
        {
          success: false,
          code: "checkout_unavailable",
          // API and island contract tests pin these translated messages together.
          error:
            locale === "vi"
              ? "Thanh toán trực tuyến chưa khả dụng cho lựa chọn này. Vui lòng liên hệ đội ngũ VLABS."
              : "Online payment is not available for this selection. Please contact the VLABS team.",
        },
        409,
      );
    // PayPal is not configured. Do not track, call, or fall back to a provider.
    if (currency === "usd") return unavailable();

    const SEPAY_MERCHANT_ID =
      process.env.SEPAY_MERCHANT_ID ?? import.meta.env.SEPAY_MERCHANT_ID;
    const SEPAY_API_KEY =
      process.env.SEPAY_API_KEY ?? import.meta.env.SEPAY_API_KEY;
    if (!SEPAY_MERCHANT_ID?.trim() || !SEPAY_API_KEY?.trim()) {
      return unavailable();
    }
    const checkout = buildSepayCheckout({
      merchantId: SEPAY_MERCHANT_ID,
      secretKey: SEPAY_API_KEY,
      unitAmount: plan.unitAmount,
      description: `${plan.title} - ${plan.interval === "year" ? "1 năm" : "1 tháng"} (thanh toán một lần)`,
      orderId: `INV-${randomUUID()}`,
      // Callback authority is server configuration, never Host or client input.
      returnOrigin: config.site.base_url,
    });

    const GHL_API_KEY = process.env.GHL_API_KEY ?? import.meta.env.GHL_API_KEY;
    const GHL_LOCATION_ID =
      process.env.GHL_LOCATION_ID ?? import.meta.env.GHL_LOCATION_ID;
    // Preserve additive, best-effort tracking only for available VI checkout.
    if (GHL_API_KEY && GHL_LOCATION_ID) {
      try {
        await upsertGhlContact(GHL_API_KEY, {
          locationId: GHL_LOCATION_ID,
          ...person,
          tags: ["checkout-initiated", plan.title],
        });
      } catch {
        console.error("Checkout contact tracking failed.");
      }
    }

    // Preparing a signed form or visiting a return URL is not proof of payment.
    return jsonResponse(checkout);
  } catch (error) {
    if (!(error instanceof InputError)) {
      console.error("Checkout request preparation failed.");
    }
    return failureResponse(
      error,
      "Unable to start checkout. Please try again.",
      500,
      locale,
    );
  }
};
