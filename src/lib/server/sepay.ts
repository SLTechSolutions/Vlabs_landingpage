import { createHmac } from "node:crypto";

// https://developer.sepay.vn/en/cong-thanh-toan/API/don-hang/form-thanh-toan
// Sign raw UTF-8 name=value pairs in this order, not URL-encoded form data.
const signedFieldNames = [
  "order_amount",
  "merchant",
  "currency",
  "operation",
  "order_description",
  "order_invoice_number",
  "customer_id",
  "payment_method",
  "success_url",
  "error_url",
  "cancel_url",
] as const;

export function signSepayFields(
  fields: Readonly<Record<string, string | undefined>>,
  secretKey: string,
) {
  if (typeof secretKey !== "string" || !secretKey.trim()) {
    throw new Error("Checkout signing configuration unavailable.");
  }
  const signingString = signedFieldNames
    .filter((name) => Object.prototype.hasOwnProperty.call(fields, name))
    .filter(
      (name) =>
        fields[name] !== undefined && fields[name] !== "" && fields[name] !== "0",
    )
    .map((name) => {
      const value = fields[name];
      if (typeof value !== "string") {
        throw new Error("Invalid checkout fields.");
      }
      return `${name}=${value}`;
    })
    .join(",");
  // signature, lang, and custom_data are not in SePay's signing allowlist.
  return createHmac("sha256", secretKey)
    .update(signingString, "utf8")
    .digest("base64");
}

interface SepayCheckoutOptions {
  readonly merchantId: string;
  readonly secretKey: string;
  readonly unitAmount: number;
  readonly description: string;
  readonly orderId: string;
  readonly returnOrigin: string;
}

export function buildSepayCheckout({
  merchantId,
  secretKey,
  unitAmount,
  description,
  orderId,
  returnOrigin,
}: SepayCheckoutOptions) {
  if (
    typeof merchantId !== "string" ||
    !merchantId.trim() ||
    typeof secretKey !== "string" ||
    !secretKey.trim()
  ) {
    throw new Error("Checkout integration unavailable.");
  }
  if (
    !Number.isSafeInteger(unitAmount) ||
    unitAmount <= 0 ||
    unitAmount > 999_999_999_999 ||
    typeof description !== "string" ||
    !description.trim() ||
    typeof orderId !== "string" ||
    !/^INV-[A-Za-z0-9-]+$/.test(orderId) ||
    /[\u0000-\u001f\u007f]/.test(orderId)
  ) {
    throw new Error("Invalid checkout order.");
  }
  const origin = new URL(returnOrigin);
  if (
    origin.protocol !== "https:" ||
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash
  ) {
    throw new Error("Invalid checkout return origin.");
  }
  const callback = (result: "success" | "error" | "cancel") => {
    const url = new URL("/vi/pricing", origin);
    url.searchParams.set("checkout", result);
    url.searchParams.set("order", orderId);
    return url.href;
  };
  // Match SePay's documented form insertion order. No client fields are merged.
  const fields: Record<string, string> = {
    order_amount: String(unitAmount), // VND has no fractional/minor-unit scaling.
    merchant: merchantId,
    currency: "VND",
    operation: "PURCHASE", // One-time payment, not an automatic subscription.
    order_description: description,
    order_invoice_number: orderId,
    success_url: callback("success"),
    error_url: callback("error"),
    cancel_url: callback("cancel"),
    lang: "vi",
  };
  fields.signature = signSepayFields(fields, secretKey);
  // This is a browser form contract, not a server-side provider API request.
  return {
    success: true as const,
    provider: "sepay" as const,
    url: "https://pay.sepay.vn/v1/checkout/init",
    method: "POST" as const,
    fields,
    orderId,
  };
}
