import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createContext, runInContext } from "node:vm";
import test from "node:test";
import { parseFrontmatter } from "@astrojs/markdown-remark";
import ts from "typescript";
import * as currency from "../src/lib/currency.ts";
import { getMessages } from "../src/lib/messages.ts";
import * as seo from "../src/lib/seo.ts";
import * as text from "../src/lib/utils/textConverter.ts";

// Pure modules and in-memory content only: no environment files or network.
const root = new URL("../", import.meta.url);
const read = (relative) => readFile(new URL(relative, root), "utf8");
const config = JSON.parse(await read("src/config/config.json"));
const menu = JSON.parse(await read("src/config/menu.json"));
const locales = ["en", "vi"];
const corePages = [
  ["homepage", "homepage", "/"],
  ["features", "features", "/features"],
  ["pricing", "pricing", "/pricing"],
  ["integrations", "integrations", "/integrations"],
  ["contact", "contact", "/contact"],
  ["openLetter", "open-letter", "/open-letter"],
];
const content = new Map();
const pricingSources = {};
for (const locale of locales) {
  for (const [collection, directory] of corePages) {
    const id = locale === "vi" ? "vi/-index" : "-index";
    const source = await read(`src/content/${directory}/${id}.md`);
    const data = parseFrontmatter(source).frontmatter;
    const body = source.replace(/^---\r?\n[\s\S]*?\r?\n---\s*/, "");
    content.set(`${collection}/${id}`, { id, data, body });
    if (collection === "pricing") pricingSources[locale] = source;
  }
}
const pricingData = (locale) => content.get(`pricing/${locale === "vi" ? "vi/-index" : "-index"}`).data;

// Execute selected real Astro declarations without importing layouts or env.
async function astroDeclarations(relative, names, globals = {}) {
  const source = await read(relative);
  const frontmatter = source.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1];
  assert.ok(frontmatter, `${relative}: Astro frontmatter required`);
  const tree = ts.createSourceFile(relative, frontmatter, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const selected = tree.statements.filter((node) =>
    (ts.isFunctionDeclaration(node) && names.includes(node.name?.text)) ||
    (ts.isVariableStatement(node) && node.declarationList.declarations.some((declaration) => names.includes(declaration.name.getText(tree)))),
  );
  assert.equal(selected.length, names.length, `${relative}: expected real declarations ${names.join(", ")}`);
  const code = ts.transpileModule(`${selected.map((node) => node.getText(tree)).join("\n")}\nexports.selected = { ${names.join(", ")} };`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: `${relative}.ts`,
  }).outputText;
  const exports = {};
  runInContext(code, createContext({ exports, URL, ...globals }), { filename: relative });
  return exports.selected;
}

async function loadModule(relative, imports) {
  const source = await read(relative);
  const module = { exports: {} };
  const context = createContext({
    module, exports: module.exports, URL, Intl, Response,
    require(specifier) {
      assert.ok(Object.hasOwn(imports, specifier), `Offline SEO test forbids import: ${specifier}`);
      return imports[specifier];
    },
  });
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: relative,
  }).outputText;
  runInContext(compiled, context, { filename: fileURLToPath(new URL(relative, root)) });
  return module.exports;
}
const pricing = await loadModule("src/lib/locale-pricing.ts", { "@/lib/currency": currency });
const i18n = await loadModule("src/lib/i18n.ts", {
  "@/config/config.json": config,
  "@/config/menu.json": menu,
});
async function endpoint(relative, entries = content) {
  return loadModule(relative, {
    "astro:content": {
      async getEntry(collection, id) {
        const entry = entries.get(`${collection}/${id}`);
        if (!entry) return undefined;
        const copy = structuredClone(entry);
        // Match the UI collection: pricing_note is not a schema field.
        if (collection === "pricing") delete copy.data.pricing_note;
        return copy;
      },
    },
    "@/config/config.json": config,
    "@/lib/i18n": i18n,
    "@/lib/messages": { getMessages },
    "@/lib/locale-pricing": pricing,
    "@/lib/seo": seo,
    "@/lib/utils/textConverter": text,
    "@astrojs/markdown-remark": { parseFrontmatter },
    "@/content/pricing/-index.md?raw": pricingSources.en,
    "@/content/pricing/vi/-index.md?raw": pricingSources.vi,
  });
}

test("JSON-LD escapes HTML script delimiters and preserves exact Unicode data", () => {
  const fixture = '</script><script>alert("fixture")</script><img src=x onerror=alert(1)>&\u2028\u2029';
  const value = seo.buildFaqSchema([{ question: fixture, answer: fixture }], "https://example.test/", "vi");
  const serialized = seo.serializeJsonLd(value);
  assert.doesNotMatch(serialized, /[<>&\u2028\u2029]/);
  assert.deepEqual(JSON.parse(serialized), value);
  const html = `<head><script type="application/ld+json">${serialized}</script></head>`;
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 1, "Injected closing script must not create executable markup");
  assert.equal(JSON.parse(scripts[0][1]).mainEntity[0].acceptedAnswer.text, fixture);
});

test("serialization rejects values that are not JSON", () => {
  assert.throws(() => seo.serializeJsonLd(undefined), /JSON data/);
  assert.throws(() => seo.serializeJsonLd({ value: 1n }), TypeError);
});

test("site graph has stable identities, real logo, and both languages", () => {
  const graph = JSON.parse(seo.serializeJsonLd(seo.buildSiteSchema(config.site.base_url, config.site.logo, getMessages("vi").meta.description)))["@graph"];
  assert.equal(graph.length, 2);
  assert.equal(graph[0]["@type"], "Organization");
  assert.equal(graph[0].name, "VLABS");
  assert.equal(graph[0].url, new URL(config.site.base_url).href);
  assert.equal(graph[0].logo, new URL(config.site.logo, config.site.base_url).href);
  assert.equal(graph[0].parentOrganization["@type"], "Organization");
  assert.equal(graph[0].parentOrganization.name, "Smart Learning Technology Solution");
  assert.equal(graph[0].parentOrganization.founder["@type"], "Person");
  assert.equal(graph[0].parentOrganization.founder.name, "Nguyễn Đình Khôi");
  assert.equal(graph[1]["@type"], "WebSite");
  assert.deepEqual(graph[1].inLanguage, locales);
  assert.equal(graph[1].publisher["@id"], graph[0]["@id"]);
  assert.equal(graph[1].description, getMessages("vi").meta.description);
  assert.ok(!("sameAs" in graph[0]) && !("contactPoint" in graph[0]));
});

test("empty FAQ creates no schema", () => {
  assert.equal(seo.buildFaqSchema([], "https://example.test/", "en"), undefined);
});

for (const locale of locales) {
  test(`${locale} FAQ retains every source question and answer, without a second copy`, async () => {
    const data = parseFrontmatter(await read(`src/content/sections/${locale === "vi" ? "vi/" : ""}faq.md`)).frontmatter;
    const schema = JSON.parse(seo.serializeJsonLd(seo.buildFaqSchema(data.items, `https://example.test/${locale}`, locale)));
    assert.equal(schema["@type"], "FAQPage");
    assert.equal(schema.inLanguage, locale);
    assert.ok(schema.mainEntity.length >= 3);
    assert.deepEqual(schema.mainEntity.map((item) => ({ question: item.name, answer: item.acceptedAnswer.text })), data.items);
    for (const question of schema.mainEntity) {
      assert.equal(question["@type"], "Question");
      assert.equal(question.acceptedAnswer["@type"], "Answer");
    }
  });

  test(`${locale} software-plan offers use source prices and separate account/time units`, () => {
    const data = pricingData(locale);
    const plans = data.plans.map((plan) => ({
      id: plan.plan_id, title: plan.title, description: plan.description,
      ...pricing.planAmounts(pricing.planById(pricingData("en").plans, plan.plan_id), plan, locale),
    }));
    const schema = JSON.parse(seo.serializeJsonLd(seo.buildPricingSchema(plans, `https://example.test/${locale}/pricing`, config.site.base_url, locale, getMessages(locale).pricing.availability)));
    assert.equal(schema["@graph"].length, 3);
    for (const app of schema["@graph"]) {
      const plan = data.plans.find((candidate) => candidate.plan_id === app.identifier);
      assert.equal(app["@type"], "SoftwareApplication");
      assert.equal(app.name, `VLABS ${plan.title}`);
      assert.equal(app.description, plan.description);
      assert.equal(app.inLanguage, locale);
      assert.equal(app.offers.length, 2);
      for (const [index, field] of ["price", "yearly_price"].entries()) {
        const offer = app.offers[index];
        const spec = offer.priceSpecification;
        assert.equal(offer["@type"], "Offer");
        assert.equal(offer.price, plan[field]);
        assert.equal(offer.priceCurrency, locale === "vi" ? "VND" : "USD");
        assert.equal(spec["@type"], "UnitPriceSpecification");
        assert.equal(spec.price, offer.price);
        assert.equal(spec.priceCurrency, offer.priceCurrency);
        assert.equal(spec.billingDuration, index === 0 ? "P1M" : "P1Y");
        assert.deepEqual(spec.referenceQuantity, { "@type": "QuantitativeValue", value: 1, unitCode: "C62", unitText: locale === "vi" ? "tài khoản" : "account" });
        assert.equal(offer.description, getMessages(locale).pricing.availability);
        assert.ok(!("unitText" in offer));
      }
    }
    const json = JSON.stringify(schema);
    assert.doesNotMatch(json, /"(?:priceValidUntil|availability|aggregateRating|review|operatingSystem)"\s*:/);
  });
}

test("minor-unit serialization keeps USD cents, VND integers, and rejects invalid prices", () => {
  assert.equal(seo.schemaPrice(269, "usd"), "2.69");
  assert.equal(seo.schemaPrice(2690, "usd"), "26.90");
  assert.equal(seo.schemaPrice(69000, "vnd"), "69000");
  for (const amount of [0, -1, 1.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
    assert.throws(() => seo.schemaPrice(amount, "usd"), /positive integer/);
  assert.throws(() => seo.schemaPrice(100, "eur"), /Unsupported/);
});

test("Markdown text stays on one line and escapes inline link and HTML delimiters", () => {
  assert.equal(seo.markdownText("[name](url)\n# title <script>"), "\\[name\\](url) # title \\<script\\>");
});

test("llms endpoint returns bilingual, source-derived summaries and exactly 13 curated links without withdrawn sections", async () => {
  const response = await (await endpoint("src/pages/llms.txt.ts")).GET();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "text/plain; charset=utf-8");
  assert.equal(response.headers.get("link"), '</llms-full.txt>; rel="alternate"; type="text/plain"');
  const body = await response.text();
  assert.match(body, /^# VLABS\n/);
  assert.equal([...body.matchAll(/^- \[/gm)].length, 13);
  for (const [, url] of body.matchAll(/^- \[[^\n]+\]\(([^\s)]+)\)/gm))
    assert.doesNotMatch(new URL(url).pathname, /^\/(?:vi\/)?(?:about|careers|case-study)(?:\/|$)/);
  for (const locale of locales) {
    const id = locale === "vi" ? "vi/-index" : "-index";
    const home = content.get(`homepage/${id}`).data;
    assert.ok(body.includes(`> ${locale}: ${seo.markdownText(text.plainify(home.description))}`));
    for (const [collection, , route] of corePages) {
      const data = content.get(`${collection}/${id}`).data;
      const title = seo.markdownText(text.plainify(data.title));
      const description = seo.markdownText(text.plainify(data.description));
      const url = new URL(i18n.localePath(route, locale), config.site.base_url).href;
      assert.ok(body.includes(`- [${title} (${locale})](${url}): ${description}`), `${locale} ${route}`);
    }
  }
  assert.ok(body.includes(`(${new URL("/pricing.md", config.site.base_url).href})`));
  const fullUrl = new URL("/llms-full.txt", config.site.base_url).href;
  const references = body.split("\n").filter((line) => line.includes(fullUrl));
  assert.equal(references.length, 1, "Exactly one full-text discovery line");
  assert.doesNotMatch(references[0], /^- \[/, "Full-text discovery must not add a fourteenth bullet");
});

test("llms-full returns readable bilingual Markdown for exactly twelve source pages without withdrawn URLs", async () => {
  const response = await (await endpoint("src/pages/llms-full.txt.ts")).GET();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "text/plain; charset=utf-8");
  const body = await response.text();
  assert.match(body, /^# VLABS\n/);
  assert.equal([...body.matchAll(/^### /gm)].length, 12);
  for (const locale of locales) {
    const id = locale === "vi" ? "vi/-index" : "-index";
    for (const [collection, , route] of corePages) {
      const data = content.get(`${collection}/${id}`).data;
      const url = new URL(i18n.localePath(route, locale), config.site.base_url).href;
      assert.ok(body.includes(`<${url}>`), `${locale} ${route}: canonical URL`);
      assert.ok(body.includes(`### ${seo.markdownText(text.plainify(data.title))}\n`), `${locale} ${route}: source title`);
      assert.ok(body.includes(seo.markdownText(text.plainify(data.description))), `${locale} ${route}: source description`);
      const opening = data.banner?.content || data.page_header?.content || data.page_header?.subtitle || data.salutation;
      assert.ok(body.includes(seo.markdownText(text.plainify(opening))), `${locale} ${route}: readable body opening`);
      for (const paragraph of data.paragraphs || [])
        assert.ok(body.includes(seo.markdownText(text.plainify(paragraph))), `${locale} ${route}: full letter paragraphs`);
      for (const role of data.roles?.items || []) for (const point of role.points)
        assert.ok(body.includes(`- ${seo.markdownText(text.plainify(point))}`), `${locale} ${route}: role point`);
      for (const item of data.integrations?.items || [])
        assert.ok(body.includes(seo.markdownText(text.plainify(item.content))), `${locale} ${route}: integration qualification`);
      for (const item of data.contact_info?.items || [])
        assert.ok(body.includes(seo.markdownText(text.plainify(item.detail))), `${locale} ${route}: contact facts`);
    }
    for (const plan of pricingData(locale).plans) {
      assert.ok(body.includes(seo.markdownText(plan.description)));
      for (const [field, interval] of [["price", "month"], ["yearly_price", "year"]])
        assert.ok(body.includes(`${plan[field]} ${locale === "vi" ? "VND" : "USD"}/${getMessages(locale).pricing[interval]}`), `${locale}/${plan.plan_id}/${field}`);
      for (const feature of plan.features) {
        const label = getMessages(locale).pricing[feature.included ? "included" : "notIncluded"];
        assert.ok(body.includes(`- ${label}: ${seo.markdownText(feature.label)}`));
        if (feature.tooltip) assert.ok(body.includes(seo.markdownText(feature.tooltip)));
      }
    }
  }
  for (const [url] of body.matchAll(/https?:\/\/[^\s)>]+/g))
    assert.doesNotMatch(new URL(url).pathname, /^\/(?:vi\/)?(?:about|careers|case-study)(?:\/|$)/);
  assert.doesNotMatch(body, /<\/?(?:strong|br|script)\b|^---$/m, "Readable Markdown, not raw frontmatter or HTML");
});

for (const condition of ["missing", "draft", "noindex"]) {
  test(`llms-full rejects ${condition} public content instead of publishing incomplete or nonpublic copy`, async () => {
    const entries = new Map([...content].map(([key, entry]) => [key, structuredClone(entry)]));
    if (condition === "missing") entries.delete("features/vi/-index");
    else entries.get("features/vi/-index").data[condition] = true;
    const route = await endpoint("src/pages/llms-full.txt.ts", entries);
    await assert.rejects(() => route.GET(), /Missing public vi page: \/features/);
  });
}

test("llms-full follows edited frontmatter and Markdown body without a second copy", async () => {
  const entries = new Map([...content].map(([key, entry]) => [key, structuredClone(entry)]));
  entries.get("features/-index").data.banner.content = "Edited **classroom** source & model limits.";
  entries.get("features/-index").data.roles.items[0].points[0] = "A changed source observation";
  entries.get("openLetter/vi/-index").data.paragraphs[0] = "Nội dung thư đã thay đổi từ nguồn.";
  entries.get("integrations/-index").body = "## Source Markdown\n\nA source-authored body paragraph.\n";
  const body = await (await (await endpoint("src/pages/llms-full.txt.ts", entries)).GET()).text();
  for (const fact of ["Edited classroom source & model limits.", "A changed source observation", "Nội dung thư đã thay đổi từ nguồn.", "## Source Markdown\n\nA source-authored body paragraph."])
    assert.ok(body.includes(fact), fact);
});

test("llms-full omits disabled source sections rather than promoting hidden feature copy", async () => {
  const entries = new Map([...content].map(([key, entry]) => [key, structuredClone(entry)]));
  entries.get("features/-index").data.roles.enable = false;
  const body = await (await (await endpoint("src/pages/llms-full.txt.ts", entries)).GET()).text();
  for (const role of entries.get("features/-index").data.roles.items)
    assert.ok(!body.includes(seo.markdownText(text.plainify(role.content))));
});

for (const condition of ["missing", "draft", "noindex"]) {
  test(`llms endpoint rejects ${condition} public content rather than publishing a stale summary`, async () => {
    const entries = new Map([...content].map(([key, entry]) => [key, structuredClone(entry)]));
    if (condition === "missing") entries.delete("features/vi/-index");
    else entries.get("features/vi/-index").data[condition] = true;
    const route = await endpoint("src/pages/llms.txt.ts", entries);
    await assert.rejects(() => route.GET(), /Missing public vi page: \/features/);
  });
}

test("llms summaries follow changed source content without a second editorial copy", async () => {
  const entries = new Map([...content].map(([key, entry]) => [key, structuredClone(entry)]));
  entries.get("features/-index").data.description = "Updated **source** description & classroom facts.";
  const response = await (await endpoint("src/pages/llms.txt.ts", entries)).GET();
  assert.ok((await response.text()).includes("Updated source description & classroom facts."));
});

test("pricing Markdown covers every source amount, feature, comparison value, qualification and CTA", async () => {
  const response = await (await endpoint("src/pages/pricing.md.ts")).GET();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "text/markdown; charset=utf-8");
  assert.equal(response.headers.get("link"), '</llms.txt>; rel="describedby"');
  const body = await response.text();
  for (const locale of locales) {
    const section = body.split(`## ${locale === "en" ? "English (USD)" : "Tiếng Việt (VND)"}\n`)[1].split(/\n## /)[0];
    const data = pricingData(locale);
    const copy = getMessages(locale);
    for (const plan of data.plans) {
      const block = section.split(`### ${plan.title} (${plan.plan_id})\n`)[1].split(/\n### /)[0];
      assert.ok(block.includes(seo.markdownText(plan.description)));
      for (const [field, interval] of [["price", "month"], ["yearly_price", "year"]]) {
        const display = locale === "vi" ? `${new Intl.NumberFormat("vi-VN").format(Number(plan[field]))} VND` : `$${plan[field]}`;
        assert.ok(block.includes(`${display}/${copy.pricing[interval]}`), `${locale}/${plan.plan_id}/${field}`);
      }
      for (const feature of plan.features) {
        assert.ok(block.includes(`- ${feature.included ? copy.pricing.included : copy.pricing.notIncluded}: ${seo.markdownText(feature.label)}`));
        if (feature.tooltip) assert.ok(block.includes(seo.markdownText(feature.tooltip)));
      }
      const column = data.comparison.headers.findIndex((header) => header.plan_id === plan.plan_id) - 1;
      for (const row of data.comparison.rows.filter((row) => !row.kind)) {
        const value = row.values[column];
        const display = typeof value === "boolean" ? value ? copy.pricing.included : copy.pricing.notIncluded : value;
        assert.ok(block.includes(`- ${seo.markdownText(row.feature)}: ${seo.markdownText(display)}`));
      }
      const action = plan.plan_id === "starter" ? `${i18n.localePath("/pricing", locale)}#plan-starter` : i18n.localizeHref(plan.button.link, locale);
      assert.ok(block.includes(`[${seo.markdownText(plan.button.label)}](${new URL(action, config.site.base_url).href})`));
    }
    for (const key of ["fixedRate", "availability", "monthlyNote", "yearlyNote", "comparisonNote"])
      assert.ok(section.includes(seo.markdownText(copy.pricing[key])), `${locale} ${key}`);
    assert.ok(section.includes(seo.markdownText(data.pricing_note.content)));
    assert.ok(section.includes(seo.markdownText(copy.checkout.terms)));
  }
});

test("Markdown prices follow independently changed content rather than hardcoded amounts or FX", async () => {
  const entries = new Map([...content].map(([key, entry]) => [key, structuredClone(entry)]));
  const enPlan = entries.get("pricing/-index").data.plans[0];
  enPlan.price = "4.99";
  enPlan.yearly_price = "49.90";
  const viPlan = entries.get("pricing/vi/-index").data.plans[0];
  viPlan.price = "77777";
  viPlan.yearly_price = "777770";
  const body = await (await (await endpoint("src/pages/pricing.md.ts", entries)).GET()).text();
  assert.ok(body.includes("$4.99/acc/month") && body.includes("$49.90/acc/year"));
  assert.ok(body.includes("77.777 VND/tài khoản/tháng") && body.includes("777.770 VND/tài khoản/năm"));
});

test("pricing Markdown rejects a missing locale instead of silently using English fallback", async () => {
  const entries = new Map(content);
  entries.delete("pricing/vi/-index");
  const route = await endpoint("src/pages/pricing.md.ts", entries);
  await assert.rejects(() => route.GET(), /Both pricing locales are required/);
});

test("all JSON-LD sinks use explicit inline safe serialization, not client code", async () => {
  for (const relative of ["src/layouts/Base.astro", "src/layouts/components/Faq.astro", "src/layouts/pages/PricingPage.astro", "src/layouts/pages/OpenLetterPage.astro"]) {
    const source = await read(relative);
    const script = source.match(/<script\b[^>]*type="application\/ld\+json"[^>]*>/)?.[0];
    assert.ok(script?.includes("is:inline") && script.includes("set:html={serializeJsonLd("), relative);
    assert.doesNotMatch(script, /client:|JSON\.stringify/);
  }
  for (const relative of ["src/lib/seo.ts", "src/pages/llms.txt.ts", "src/pages/llms-full.txt.ts", "src/pages/pricing.md.ts"])
    assert.doesNotMatch(await read(relative), /process\.env|import\.meta\.env|\bfetch\s*\(/);
});

for (const locale of locales) {
  test(`${locale} feature meta title equals approved copy and stays within sixty Unicode code points`, () => {
    const title = content.get(`features/${locale === "vi" ? "vi/-index" : "-index"}`).data.meta_title;
    assert.equal(title, locale === "en" ? "VLABS Features | Students, Teachers and Administrators" : "Tính năng VLABS | Học sinh, giáo viên và quản trị viên");
    assert.ok([...title].length <= 60, `${locale}: ${[...title].length} code points`);
  });

  test(`${locale} social metadata table retains measured logo and portrait dimensions and factual alt`, async () => {
    const select = (image, socialImageAlt) => astroDeclarations("src/layouts/Base.astro", ["socialImage", "socialImageMetadata", "socialImageMeta", "socialAlt"], { image, socialImageAlt, locale, config });
    const logo = await select(undefined);
    assert.equal(logo.socialImage, "/images/logo.png");
    assert.deepEqual(JSON.parse(JSON.stringify(logo.socialImageMetadata["/images/logo.png"])), { width: 480, height: 480, alt: locale === "en" ? "VLABS logo" : "Logo VLABS" });
    assert.equal(logo.socialAlt, locale === "en" ? "VLABS logo" : "Logo VLABS");
    const data = content.get(`openLetter/${locale === "vi" ? "vi/-index" : "-index"}`).data;
    const { portraitAlt } = await astroDeclarations("src/layouts/pages/OpenLetterPage.astro", ["portraitAlt"], { locale, founder: data.founder });
    const portrait = await select(data.image, portraitAlt);
    assert.equal(portrait.socialImage, "/images/ceo.jpeg", "Page-specific selection remains unchanged");
    assert.equal(portrait.socialImageMetadata["/images/ceo.jpeg"].width, 768);
    assert.equal(portrait.socialImageMetadata["/images/ceo.jpeg"].height, 768);
    assert.equal(portrait.socialAlt, portraitAlt);
    assert.equal(portraitAlt, locale === "en" ? `Portrait of ${data.founder.name}, founder of Smart Learning Technology Solution` : `Chân dung ${data.founder.name}, nhà sáng lập Smart Learning Technology Solution`);
    const unknown = await select("/images/unknown.png", "Must not publish unverified metadata");
    assert.equal(unknown.socialImageMeta, undefined, "Unknown paths have no fabricated dimensions or alt");
    const svg = await select("/images/source.svg");
    assert.equal(svg.socialImage, "/images/logo.png", "Existing SVG fallback remains unchanged");
  });

  test(`${locale} open-letter WebPage publication month is derived from existing authored date`, async () => {
    const data = content.get(`openLetter/${locale === "vi" ? "vi/-index" : "-index"}`).data;
    const { publicationMonth, openLetterSchema } = await astroDeclarations("src/layouts/pages/OpenLetterPage.astro", ["publicationMonth", "pageUrl", "openLetterSchema"], { data, locale, config, localePath: i18n.localePath });
    assert.equal(publicationMonth(data.date), "2026-11");
    assert.equal(openLetterSchema["@context"], "https://schema.org");
    assert.equal(openLetterSchema["@type"], "WebPage");
    assert.equal(openLetterSchema.datePublished, "2026-11");
    assert.equal(openLetterSchema.url, new URL(i18n.localePath("/open-letter", locale), config.site.base_url).href);
    assert.equal(openLetterSchema["@id"], `${openLetterSchema.url}#webpage`);
    assert.deepEqual(Object.keys(openLetterSchema).sort(), ["@context", "@type", "@id", "url", "datePublished"].sort(), "Factual-minimal schema only");
    assert.equal(publicationMonth("December 2027"), "2027-12");
    assert.equal(publicationMonth("Tháng 1, 2025"), "2025-01");
    for (const date of ["", "2026", "Unknown 2026", "Tháng 0, 2026", "Tháng 13, 2026", "November 17, 2026"])
      assert.throws(() => publicationMonth(date), /publication month/);
  });
}

test("known social metadata sinks are conditional and open-letter passes its existing portrait alt", async () => {
  const base = await read("src/layouts/Base.astro");
  for (const [key, expression] of [["og:image:width", "String(socialImageMeta.width)"], ["og:image:height", "String(socialImageMeta.height)"], ["og:image:alt", "socialAlt"], ["twitter:image:alt", "socialAlt"]]) {
    const tag = base.match(new RegExp(`<meta\\b[^>]*(?:name|property)="${key}"[^>]*>`))?.[0];
    assert.ok(tag?.includes(`content={${expression}}`), key);
  }
  assert.equal([...base.matchAll(/socialImageMeta &&/g)].length, 2, "Unknown images omit OG dimensions/alt and Twitter alt");
  const letter = await read("src/layouts/pages/OpenLetterPage.astro");
  assert.match(letter, /<Base\b[^>]*socialImageAlt=\{portraitAlt\}/);
  assert.equal([...letter.matchAll(/type="application\/ld\+json"/g)].length, 1, "Only one page-local WebPage block");
  assert.match(await read("src/layouts/components/Logo.astro"), /alt=""/, "Decorative logo remains unchanged");
});

test("source tree contains no untracked dateModified claim", async () => {
  async function visit(relative) {
    for (const entry of await readdir(new URL(`${relative}/`, root), { withFileTypes: true })) {
      if (entry.name === ".env" || entry.name.startsWith(".env.")) continue;
      const filename = `${relative}/${entry.name}`;
      if (entry.isDirectory()) await visit(filename);
      else if (entry.isFile()) assert.doesNotMatch(await read(filename), /dateModified/, filename);
    }
  }
  await visit("src");
});

test("new explanatory openings retain a concise, source-rendered paragraph in both locales", () => {
  for (const [collection] of corePages.filter(([name]) => ["homepage", "features", "pricing", "integrations"].includes(name))) {
    for (const locale of locales) {
      const data = content.get(`${collection}/${locale === "vi" ? "vi/-index" : "-index"}`).data;
      const opening = data.banner?.content || data.page_header?.content || data.page_header?.subtitle;
      assert.ok(opening.includes("VLABS"));
      assert.ok(opening.split(/\s+/).length <= 60, `${collection}/${locale} opening exceeds 60 words`);
    }
  }
});

test("sitemap filter excludes withdrawn roots and details precisely while preserving txt/md exclusions", async () => {
  const source = await read("astro.config.mjs");
  const tree = ts.createSourceFile("astro.config.mjs", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  assert.equal(tree.parseDiagnostics.length, 0);
  const filters = [];
  const visit = (node) => {
    if (ts.isPropertyAssignment(node) && node.name.getText(tree) === "filter") filters.push(node.initializer);
    ts.forEachChild(node, visit);
  };
  visit(tree);
  assert.equal(filters.length, 1, "Expected the existing sitemap filter");
  const exports = {};
  runInContext(`exports.filter = ${filters[0].getText(tree)};`, createContext({ exports, URL }));
  const filter = (route) => exports.filter(new URL(route, config.site.base_url).href);
  for (const base of ["/about", "/about/", "/about/team", "/careers", "/careers/", "/careers/example", "/careers/nested/example", "/case-study", "/case-study/", "/case-study/example", "/case-study/nested/example"])
    for (const route of [base, `/vi${base}`]) assert.equal(filter(route), false, route);
  for (const base of [...corePages.map(([, , route]) => route), "/privacy-policy", "/term-and-condition", "/404"])
    for (const locale of locales) assert.equal(filter(i18n.localePath(base, locale)), true, `${locale} ${base}`);
  for (const route of ["/llms.txt", "/llms-full.txt", "/pricing.md", "/vi/llms.txt", "/vi/llms-full.txt", "/vi/pricing.md"]) assert.equal(filter(route), false, route);
  for (const route of ["/about-us", "/careers-extra", "/case-study-extra", "/vi/about-us", "/violin/about"])
    assert.equal(filter(route), true, `No accidental prefix exclusion: ${route}`);
});
