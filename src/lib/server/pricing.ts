import { getEntry } from "astro:content";
import {
  usdPriceToMinor,
  vndPriceToMinor,
  type SupportedCurrency,
} from "../currency";
import { InputError } from "./api";

export type BillingInterval = "month" | "year";
export type PlanId = "starter" | "campus" | "enterprise";

export function isPlanId(value: unknown): value is PlanId {
  return value === "starter" || value === "campus" || value === "enterprise";
}

function validateSelection(
  interval: BillingInterval,
  currency: SupportedCurrency,
) {
  if (interval !== "month" && interval !== "year") {
    throw new InputError(
      "Interval must be month or year.",
      400,
      "invalid_interval",
    );
  }
  if (currency !== "usd" && currency !== "vnd") {
    throw new InputError(
      "Currency must be usd or vnd.",
      400,
      "invalid_currency",
    );
  }
}

async function pricingPlans(currency: SupportedCurrency) {
  // Each currency has its own server-side content authority. Client-submitted
  // document IDs, titles, and prices never choose the source or amount.
  const pricing = await getEntry(
    "pricing",
    currency === "vnd" ? "vi/-index" : "-index",
  );
  if (!pricing || !Array.isArray(pricing.data.plans)) {
    throw new Error("Pricing configuration unavailable.");
  }
  return pricing.data.plans;
}

function planAmount(
  plan: { title: string; price: string; yearly_price: string },
  interval: BillingInterval,
  currency: SupportedCurrency,
) {
  if (typeof plan.title !== "string" || !plan.title.trim()) {
    throw new Error("Invalid pricing configuration.");
  }
  const price = interval === "year" ? plan.yearly_price : plan.price;
  try {
    return currency === "vnd"
      ? vndPriceToMinor(price)
      : usdPriceToMinor(price, "usd");
  } catch {
    throw new Error("Invalid pricing configuration.");
  }
}

export async function resolvePlan(
  planId: PlanId,
  interval: BillingInterval,
  currency: SupportedCurrency,
) {
  if (!isPlanId(planId)) {
    throw new InputError("Unknown plan.", 400, "unknown_plan");
  }
  validateSelection(interval, currency);
  const matches = (await pricingPlans(currency)).filter(
    (plan) => "plan_id" in plan && plan.plan_id === planId,
  );
  if (matches.length === 0) throw new Error("Invalid pricing configuration.");
  if (matches.length !== 1) throw new Error("Ambiguous pricing configuration.");
  const plan = matches[0]!;
  return {
    planId,
    title: plan.title,
    interval,
    currency,
    unitAmount: planAmount(plan, interval, currency),
  };
}

// Preserve the existing title-based USD checkout contract until migration.
export async function checkoutPlan(
  planTitle: string,
  interval: BillingInterval,
) {
  validateSelection(interval, "usd");
  const matches = (await pricingPlans("usd")).filter(
    (plan) => plan.title === planTitle,
  );
  if (matches.length === 0) {
    throw new InputError("Unknown plan.", 400, "unknown_plan");
  }
  if (matches.length !== 1) throw new Error("Ambiguous pricing configuration.");
  const plan = matches[0]!;
  return {
    title: plan.title,
    interval,
    unitAmount: planAmount(plan, interval, "usd"),
  };
}
