export type Locale = "en" | "vi";
export type SupportedCurrency = "usd" | "vnd";

export const VND_PER_USD = 26_000;

// A 12-digit general amount ceiling, not the obsolete eight-digit VND limit.
// Payment-provider-specific limits must be validated by the payment integration.
const MAX_PAYMENT_MINOR = 999_999_999_999;

export function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "vi";
}

export function currencyForLocale(locale: Locale): SupportedCurrency {
  if (!isLocale(locale)) throw new Error("Unsupported locale.");
  return locale === "vi" ? "vnd" : "usd";
}

function assertCurrency(currency: SupportedCurrency) {
  if (currency !== "usd" && currency !== "vnd") {
    throw new Error("Unsupported currency.");
  }
}

export function usdPriceToMinor(
  price: string,
  currency: SupportedCurrency,
): number {
  assertCurrency(currency);
  const decimal =
    typeof price === "string"
      ? /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(price.trim())
      : null;
  if (!decimal) throw new Error("Invalid USD price.");

  // Parse the original canonical decimal in cents before applying integer FX.
  const cents =
    Number(decimal[1]) * 100 + Number((decimal[2] ?? "").padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents <= 0) {
    throw new Error("Invalid USD price.");
  }
  const amount = currency === "vnd" ? cents * (VND_PER_USD / 100) : cents;
  if (
    !Number.isSafeInteger(amount) ||
    amount <= 0 ||
    amount > MAX_PAYMENT_MINOR
  ) {
    throw new Error("Invalid USD price.");
  }
  return amount;
}

export function vndPriceToMinor(price: string): number {
  // VND prices are whole dong from Vietnamese content, not USD conversions.
  if (typeof price !== "string" || !/^\d+$/.test(price)) {
    throw new Error("Invalid VND price.");
  }
  const amount = Number(price);
  if (
    !Number.isSafeInteger(amount) ||
    amount <= 0 ||
    amount > MAX_PAYMENT_MINOR
  ) {
    throw new Error("Invalid VND price.");
  }
  return amount;
}

export function formatMinorAmount(
  amount: number,
  currency: SupportedCurrency,
  locale: Locale,
): string {
  assertCurrency(currency);
  if (!isLocale(locale)) throw new Error("Unsupported locale.");
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new Error("Invalid minor amount.");
  }

  const cents = currency === "usd" ? amount % 100 : 0;
  const fractionDigits = cents !== 0 ? 2 : 0;
  const formatter = new Intl.NumberFormat(locale === "vi" ? "vi-VN" : "en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
  // Formatting whole dollars and inserting cents avoids rounding large safe
  // integer amounts through a floating-point dollars representation.
  const wholeAmount = currency === "usd" ? (amount - cents) / 100 : amount;
  return formatter
    .formatToParts(wholeAmount === 0 ? 0 : wholeAmount)
    .map((part) =>
      part.type === "fraction" ? String(cents).padStart(2, "0") : part.value,
    )
    .join("");
}
