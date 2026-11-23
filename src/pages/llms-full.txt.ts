import type { APIRoute } from "astro";
import { getEntry } from "astro:content";
import config from "@/config/config.json";
import { localizeHref, localePath, locales, type Locale } from "@/lib/i18n";
import { getMessages } from "@/lib/messages";
import { markdownText } from "@/lib/seo";
import { plainify } from "@/lib/utils/textConverter";

const corePages = [
  { collection: "homepage", path: "/" },
  { collection: "features", path: "/features" },
  { collection: "pricing", path: "/pricing" },
  { collection: "integrations", path: "/integrations" },
  { collection: "contact", path: "/contact" },
  { collection: "openLetter", path: "/open-letter" },
] as const;

const proseFields = new Set([
  "content", "subtitle", "description", "detail", "tooltip",
  "name", "role", "date", "salutation", "closing",
]);
const handledFields = new Set([
  "title", "label", "link", "price", "yearly_price", "headers", "rows",
]);
const readable = (value: string) =>
  markdownText(plainify(value.replace(/<br\s*\/?\s*>/gi, " ")));
const sourceLink = (href: string, locale: Locale) =>
  new URL(localizeHref(href, locale), config.site.base_url).href;

/** Render source copy, not schema keys, image paths, icons, or internal flags. */
function frontmatterMarkdown(value: unknown, locale: Locale, level = 4, root = false): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const data = value as Record<string, unknown>;
  if (data.enable === false) return [];
  const copy = getMessages(locale);
  const lines: string[] = [];
  if (!root && typeof data.title === "string")
    lines.push(`${"#".repeat(level)} ${readable(data.title)}`, "");
  if (typeof data.label === "string") {
    if (typeof data.included === "boolean")
      lines.push(`- ${copy.pricing[data.included ? "included" : "notIncluded"]}: ${readable(data.label)}`, "");
    else if (typeof data.link === "string")
      lines.push(`[${readable(data.label)}](${sourceLink(data.link, locale)})`, "");
    else lines.push(readable(data.label), "");
  } else if (typeof data.link === "string") {
    lines.push(`<${sourceLink(data.link, locale)}>`, "");
  }
  for (const [field, interval] of [["price", "month"], ["yearly_price", "year"]] as const)
    if (typeof data[field] === "string")
      lines.push(`- ${readable(data[field])} ${locale === "vi" ? "VND" : "USD"}/${copy.pricing[interval]}`, "");

  if (Array.isArray(data.headers) && Array.isArray(data.rows)) {
    const headers = data.headers as { label: string }[];
    const rows = data.rows as { feature: string; values: (string | boolean)[] }[];
    lines.push(`| ${headers.map((header) => readable(header.label)).join(" | ")} |`);
    lines.push(`| ${headers.map(() => "---").join(" | ")} |`);
    for (const row of rows) {
      if (row.values.length !== headers.length - 1)
        throw new Error("Source comparison rows must match their headers.");
      const cells = row.values.map((cell) => typeof cell === "boolean"
        ? copy.pricing[cell ? "included" : "notIncluded"]
        : readable(cell));
      lines.push(`| ${readable(row.feature)} | ${cells.join(" | ")} |`);
    }
    lines.push("");
  }

  const childLevel = root ? level : Math.min(level + 1, 6);
  for (const [field, child] of Object.entries(data)) {
    if (handledFields.has(field) || (root && field === "description")) continue;
    if (typeof child === "string" && proseFields.has(field)) {
      lines.push(readable(child), "");
    } else if (Array.isArray(child)) {
      for (const item of child) {
        if (typeof item === "string")
          lines.push(field === "paragraphs" ? readable(item) : `- ${readable(item)}`, "");
        else lines.push(...frontmatterMarkdown(item, locale, childLevel));
      }
    } else if (child && typeof child === "object") {
      lines.push(...frontmatterMarkdown(child, locale, childLevel));
    }
  }
  return lines;
}

export const GET: APIRoute = async () => {
  const pages = await Promise.all(
    locales.flatMap((locale) => corePages.map(async (page) => {
      const entry = await getEntry(page.collection, locale === "vi" ? "vi/-index" : "-index");
      if (!entry || entry.data.draft || entry.data.noindex)
        throw new Error(`Missing public ${locale} page: ${page.path}`);
      return {
        locale,
        collection: page.collection,
        url: new URL(localePath(page.path, locale), config.site.base_url).href,
        data: entry.data,
        body: entry.body?.trim(),
      };
    })),
  );
  const lines = ["# VLABS", ""];
  for (const locale of locales) {
    lines.push(`## ${locale === "en" ? "English (en)" : "Tiếng Việt (vi)"}`, "");
    for (const page of pages.filter((page) => page.locale === locale)) {
      lines.push(`### ${readable(page.data.title)}`, "", `<${page.url}>`, "");
      if (page.data.description) lines.push(readable(page.data.description), "");
      lines.push(...frontmatterMarkdown(page.data, locale, 4, true));
      if (page.body) lines.push(page.body, "");
      if (page.collection === "pricing")
        lines.push(`[${readable(getMessages(locale).seo.pricingMarkdown)}](${new URL("/pricing.md", config.site.base_url).href})`, "");
    }
  }
  return new Response(lines.join("\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
