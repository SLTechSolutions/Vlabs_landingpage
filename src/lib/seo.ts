import type { Locale, SupportedCurrency } from "./currency";

/** JSON is raw text inside script elements, not an HTML-escaped expression. */
export function serializeJsonLd(value: unknown): string {
  const json = JSON.stringify(value);
  if (json === undefined) throw new TypeError("JSON-LD must contain JSON data.");
  const escaped: Record<string, string> = {
    "<": "\\u003c",
    ">": "\\u003e",
    "&": "\\u0026",
    "\u2028": "\\u2028",
    "\u2029": "\\u2029",
  };
  return json.replace(/[<>&\u2028\u2029]/g, (character) => escaped[character]);
}

export function buildSiteSchema(
  siteUrl: string,
  logo: string,
  description: string,
) {
  const url = new URL(siteUrl).href;
  const organizationId = `${url}#organization`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": organizationId,
        name: "VLABS",
        url,
        logo: new URL(logo, url).href,
        parentOrganization: {
          "@type": "Organization",
          name: "Smart Learning Technology Solution",
          founder: { "@type": "Person", name: "Nguyễn Đình Khôi" },
        },
      },
      {
        "@type": "WebSite",
        "@id": `${url}#website`,
        name: "VLABS",
        url,
        description,
        inLanguage: ["en", "vi"],
        publisher: { "@id": organizationId },
      },
    ],
  };
}

export function buildFaqSchema(
  items: ReadonlyArray<{ question: string; answer: string }>,
  pageUrl: string,
  locale: Locale,
) {
  if (!items.length) return undefined;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "@id": `${pageUrl}#faq`,
    inLanguage: locale,
    mainEntity: items.map((item) => ({
      "@type": "Question",
      // Accordion renders these exact strings as plain text, including links.
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
}

export function schemaPrice(
  amountMinor: number,
  currency: SupportedCurrency,
): string {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0)
    throw new Error("Structured prices require a positive integer minor amount.");
  if (currency === "vnd") return String(amountMinor);
  if (currency !== "usd") throw new Error("Unsupported structured currency.");
  return `${Math.floor(amountMinor / 100)}.${String(amountMinor % 100).padStart(2, "0")}`;
}

export interface ResolvedSeoPlan {
  id: string;
  title: string;
  description: string;
  currency: SupportedCurrency;
  month: number;
  year: number;
}

export function buildPricingSchema(
  plans: ReadonlyArray<ResolvedSeoPlan>,
  pageUrl: string,
  siteUrl: string,
  locale: Locale,
  referenceNotice: string,
) {
  const organizationId = `${new URL(siteUrl).href}#organization`;
  return {
    "@context": "https://schema.org",
    "@graph": plans.map((plan) => {
      const url = `${pageUrl}#plan-${plan.id}`;
      return {
        "@type": "SoftwareApplication",
        "@id": url,
        name: `VLABS ${plan.title}`,
        identifier: plan.id,
        url,
        description: plan.description,
        applicationCategory: "EducationalApplication",
        inLanguage: locale,
        provider: { "@id": organizationId },
        offers: (["month", "year"] as const).map((interval) => {
          const price = schemaPrice(plan[interval], plan.currency);
          const priceCurrency = plan.currency.toUpperCase();
          return {
            "@type": "Offer",
            "@id": `${pageUrl}#offer-${plan.id}-${interval}`,
            identifier: `${plan.id}-${interval}`,
            url,
            price,
            priceCurrency,
            description: referenceNotice,
            seller: { "@id": organizationId },
            priceSpecification: {
              "@type": "UnitPriceSpecification",
              price,
              priceCurrency,
              billingDuration: interval === "month" ? "P1M" : "P1Y",
              referenceQuantity: {
                "@type": "QuantitativeValue",
                value: 1,
                unitCode: "C62",
                unitText: locale === "vi" ? "tài khoản" : "account",
              },
            },
          };
        }),
      };
    }),
  };
}

/** Keep source-authored text inside one Markdown line without changing facts. */
export function markdownText(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[\\`*_{}\[\]<>|]/g, "\\$&");
}
