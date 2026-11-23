import {
  currencyForLocale,
  formatMinorAmount,
  usdPriceToMinor,
  vndPriceToMinor,
  type Locale,
} from "@/lib/currency";
import type { PlanId, Pricing } from "@/types";

type Plan = Pricing["plans"][number];

export function planById(plans: Plan[], id: PlanId): Plan {
  const matches = plans.filter((plan) => plan.plan_id === id);
  if (matches.length !== 1)
    throw new Error(`Expected exactly one pricing plan: ${id}`);
  return matches[0];
}

export function planAmounts(
  canonicalPlan: Plan,
  localizedPlan: Plan,
  locale: Locale,
) {
  const currency = currencyForLocale(locale);
  if (localizedPlan.plan_id !== canonicalPlan.plan_id) {
    throw new Error("Localized plan must retain its canonical plan ID.");
  }
  const month =
    currency === "vnd"
      ? vndPriceToMinor(localizedPlan.price)
      : usdPriceToMinor(canonicalPlan.price, "usd");
  const year =
    currency === "vnd"
      ? vndPriceToMinor(localizedPlan.yearly_price)
      : usdPriceToMinor(canonicalPlan.yearly_price, "usd");
  return {
    currency,
    month,
    year,
    monthlyDisplay: formatMinorAmount(month, currency, locale),
    yearlyDisplay: formatMinorAmount(year, currency, locale),
  };
}
