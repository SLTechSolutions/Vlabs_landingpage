import Stripe from "stripe";

export function createStripeClient(secretKey: string) {
  return new Stripe(secretKey, {
    // Keep the deployed API contract; SDK types only describe its newest version.
    // @ts-expect-error Preserve pinned 2026-03-25.dahlia, not SDK 2026-06-24.dahlia.
    apiVersion: "2026-03-25.dahlia",
    timeout: 15_000,
  });
}
