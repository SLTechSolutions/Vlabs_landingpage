import type { APIRoute } from "astro";
import { getEntry } from "astro:content";
import { parseFrontmatter } from "@astrojs/markdown-remark";
import config from "@/config/config.json";
import { localizeHref, localePath, locales } from "@/lib/i18n";
import { getMessages } from "@/lib/messages";
import { planAmounts, planById } from "@/lib/locale-pricing";
import { markdownText, schemaPrice } from "@/lib/seo";
import englishSource from "@/content/pricing/-index.md?raw";
import vietnameseSource from "@/content/pricing/vi/-index.md?raw";

// pricing_note is source-authored frontmatter, outside the UI collection schema.
// Only its qualifications are read here; prices always use the UI's helpers.
function pricingNote(source: string) {
  const note = parseFrontmatter(source).frontmatter.pricing_note;
  if (!note?.enable || typeof note.title !== "string" || typeof note.content !== "string")
    throw new Error("Pricing qualifications must be present in source content.");
  return { title: note.title as string, content: note.content as string };
}

export const GET: APIRoute = async () => {
  const [english, vietnamese] = await Promise.all([
    getEntry("pricing", "-index"),
    getEntry("pricing", "vi/-index"),
  ]);
  if (!english || !vietnamese)
    throw new Error("Both pricing locales are required.");
  const localized = { en: english.data, vi: vietnamese.data };
  const notes = { en: pricingNote(englishSource), vi: pricingNote(vietnameseSource) };
  const lines = ["# VLABS reference pricing / Bảng giá tham khảo VLABS", ""];

  for (const locale of locales) {
    const data = localized[locale];
    const copy = getMessages(locale);
    const pageUrl = new URL(localePath("/pricing", locale), config.site.base_url).href;
    lines.push(`## ${locale === "en" ? "English (USD)" : "Tiếng Việt (VND)"}`, "");
    lines.push(`[${markdownText(data.title)}](${pageUrl})`, "");
    lines.push(markdownText(data.page_header.content), "");
    lines.push(markdownText(copy.pricing.fixedRate), "");
    lines.push(markdownText(copy.pricing.availability), "");

    for (const plan of data.plans) {
      const amounts = planAmounts(
        planById(english.data.plans, plan.plan_id),
        plan,
        locale,
      );
      const amount = (interval: "month" | "year") =>
        amounts.currency === "usd"
          ? `$${schemaPrice(amounts[interval], amounts.currency)}`
          : `${new Intl.NumberFormat("vi-VN").format(amounts[interval])} VND`;
      const action = plan.plan_id === "starter"
        ? `${pageUrl}#plan-${plan.plan_id}`
        : new URL(localizeHref(plan.button.link, locale), config.site.base_url).href;
      lines.push(`### ${markdownText(plan.title)} (${plan.plan_id})`, "");
      lines.push(markdownText(plan.description), "");
      lines.push(`- ${amount("month")}/${copy.pricing.month}`);
      lines.push(`- ${amount("year")}/${copy.pricing.year}`);
      if (plan.button.enable)
        lines.push(`- [${markdownText(plan.button.label)}](${action})`);
      if (plan.plan_id === "starter")
        lines.push(`- ${markdownText(copy.pricing.noCheckout)}`);
      lines.push("");
      for (const feature of plan.features) {
        const label = feature.included ? copy.pricing.included : copy.pricing.notIncluded;
        lines.push(`- ${label}: ${markdownText(feature.label)}${feature.tooltip ? `. ${markdownText(feature.tooltip)}` : ""}`);
      }
      lines.push("");
      const column = data.comparison.headers.findIndex((header) => header.plan_id === plan.plan_id) - 1;
      if (column < 0) throw new Error("Comparison columns must retain plan identifiers.");
      if (data.comparison.enable) {
        lines.push(`#### ${markdownText(copy.pricing.comparison)}`, "");
        for (const row of data.comparison.rows.filter((row) => !row.kind)) {
          const value = row.values[column];
          if (value === undefined) throw new Error("Missing plan comparison value.");
          const text = typeof value === "boolean"
            ? value ? copy.pricing.included : copy.pricing.notIncluded
            : value;
          lines.push(`- ${markdownText(row.feature)}: ${markdownText(text)}`);
        }
        lines.push("");
      }
    }
    lines.push(`### ${markdownText(notes[locale].title)}`, "");
    lines.push(markdownText(notes[locale].content), "");
    lines.push(markdownText(copy.pricing.monthlyNote), "");
    lines.push(markdownText(copy.pricing.yearlyNote), "");
    lines.push(markdownText(copy.pricing.comparisonNote), "");
    lines.push(markdownText(copy.checkout.terms), "");
  }

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      Link: '</llms.txt>; rel="describedby"',
    },
  });
};
