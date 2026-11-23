import type { APIRoute } from "astro";
import { getEntry } from "astro:content";
import config from "@/config/config.json";
import { localePath, locales } from "@/lib/i18n";
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

export const GET: APIRoute = async () => {
  const pages = await Promise.all(
    locales.flatMap((locale) =>
      corePages.map(async (page) => {
        const entry = await getEntry(
          page.collection,
          locale === "vi" ? "vi/-index" : "-index",
        );
        if (!entry || entry.data.draft || entry.data.noindex)
          throw new Error(`Missing public ${locale} page: ${page.path}`);
        return {
          locale,
          path: page.path,
          title: markdownText(plainify(entry.data.title)),
          description: markdownText(plainify(entry.data.description || "")),
          url: new URL(localePath(page.path, locale), config.site.base_url).href,
        };
      }),
    ),
  );
  const lines = ["# VLABS", ""];
  for (const locale of locales) {
    const home = pages.find((page) => page.path === "/" && page.locale === locale)!;
    lines.push(`> ${locale}: ${home.description}`);
  }
  lines.push("");
  for (const locale of locales) {
    lines.push(`## ${locale === "en" ? "English (en)" : "Tiếng Việt (vi)"}`, "");
    for (const page of pages.filter((page) => page.locale === locale))
      lines.push(`- [${page.title} (${locale})](${page.url}): ${page.description}`);
    lines.push("");
  }
  const markdownUrl = new URL("/pricing.md", config.site.base_url).href;
  lines.push("## Pricing data / Dữ liệu bảng giá", "");
  lines.push(
    `- [${getMessages("en").seo.pricingMarkdown} / ${getMessages("vi").seo.pricingMarkdown} (en, vi)](${markdownUrl})`,
    "",
  );
  const fullUrl = new URL("/llms-full.txt", config.site.base_url).href;
  lines.push(`[llms-full.txt](${fullUrl})`, "");
  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      Link: '</llms-full.txt>; rel="alternate"; type="text/plain"',
    },
  });
};
