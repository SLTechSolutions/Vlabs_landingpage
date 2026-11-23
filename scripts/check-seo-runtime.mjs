import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { createContext, runInContext } from "node:vm";
import { parseFrontmatter } from "@astrojs/markdown-remark";
import sharp from "sharp";
import ts from "typescript";
import { plainify } from "../src/lib/utils/textConverter.ts";

const defaultRoot = fileURLToPath(new URL("../", import.meta.url));
const corePages = [
  ["homepage", "/"], ["features", "/features"], ["pricing", "/pricing"],
  ["integrations", "/integrations"], ["contact", "/contact"],
  ["open-letter", "/open-letter"],
];
const withdrawnSections = ["/about", "/careers", "/case-study"];
const faqRoutes = new Set(["/", "/features", "/pricing", "/integrations", "/contact"]);
const definitionRoutes = new Set(["/", "/features", "/pricing", "/integrations"]);
const locales = ["en", "vi"];
const normalize = (value) => String(value).replace(/[\s\u00a0\u202f]+/g, " ").trim();
const localeRoute = (route, locale) => locale === "vi" ? `/vi${route === "/" ? "" : route}` : route;

function decodeHtml(value) {
  return value.replace(/&#(?:x([\da-f]+)|(\d+));/gi, (_, hex, decimal) => String.fromCodePoint(Number.parseInt(hex || decimal, hex ? 16 : 10)))
    .replace(/&(amp|quot|apos|lt|gt|nbsp);/g, (_, name) => ({ amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " })[name]);
}

function attributes(tag) {
  return Object.fromEntries([...tag.replace(/^<[\w-]+\b/, "").replace(/\/?\s*>$/, "").matchAll(/([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)]
    .map((match) => [match[1].toLowerCase(), decodeHtml(match[2] ?? match[3] ?? match[4] ?? "")]));
}

function htmlText(html) {
  return normalize(decodeHtml(html.replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ")));
}

function blocks(html, name) {
  return [...html.matchAll(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`, "gi"))]
    .map((match) => ({ attrs: attributes(match[0].slice(0, match[0].indexOf(">") + 1)), body: match[1], text: htmlText(match[1]) }));
}

function tags(html, name) {
  return [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, "gi"))].map(([tag]) => attributes(tag));
}

function hasNoindex(html) {
  return tags(html, "meta").some((meta) => meta.name === "robots" && /(?:^|,)\s*noindex\s*(?:,|$)/i.test(meta.content || ""));
}

async function sourceFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === ".env" || entry.name.startsWith(".env.")) continue;
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(filename));
    else if (entry.isFile()) files.push(filename);
  }
  return files;
}

/** The same pure public pricing/text modules used by the UI; no env or API imports. */
async function publicModules(root, config) {
  const names = {
    "@/lib/currency": "src/lib/currency.ts",
    "@/lib/messages": "src/lib/messages.ts",
    "@/lib/locale-pricing": "src/lib/locale-pricing.ts",
    "@/lib/seo": "src/lib/seo.ts",
  };
  const sources = Object.fromEntries(await Promise.all(Object.entries(names).map(async ([key, relative]) => [key, await readFile(path.join(root, relative), "utf8")])));
  const cache = new Map();
  const load = (name) => {
    if (cache.has(name)) return cache.get(name);
    assert.ok(Object.hasOwn(names, name), `Runtime SEO test forbids module: ${name}`);
    const module = { exports: {} };
    cache.set(name, module.exports);
    const context = createContext({ exports: module.exports, module, URL, Intl, require: load });
    const code = ts.transpileModule(sources[name], {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: names[name],
    }).outputText;
    runInContext(code, context, { filename: names[name] });
    cache.set(name, module.exports);
    return module.exports;
  };
  return { config, pricing: load("@/lib/locale-pricing"), messages: load("@/lib/messages"), seo: load("@/lib/seo") };
}

async function freePort(first) {
  assert.ok(Number.isInteger(first) && first >= 4342 && first <= 65535, "Only test ports >=4342 are permitted");
  for (let port = first; port <= Math.min(first + 20, 65535); port++) {
    const probe = net.createServer();
    try {
      await new Promise((resolve, reject) => { probe.once("error", reject); probe.listen(port, "127.0.0.1", resolve); });
      await new Promise((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
      return port;
    } catch (error) {
      if (error.code !== "EADDRINUSE") throw error;
    }
  }
  throw new Error("No free test port available in the approved range.");
}

async function stopOwnServer(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, "exit");
  child.kill("SIGTERM");
  const graceful = await Promise.race([exited.then(() => true), delay(5000).then(() => false)]);
  if (!graceful) {
    child.kill("SIGKILL");
    await exited;
  }
}

export async function verifySeoRuntime({ projectRoot = defaultRoot, port: requestedPort = 4350, artifactDir = "/tmp/opencode/source-cleanup/seo-verification/runtime" } = {}) {
  await mkdir(artifactDir, { recursive: true });
  const config = JSON.parse(await readFile(path.join(projectRoot, "src/config/config.json"), "utf8"));
  const site = new URL(config.site.base_url);
  const modules = await publicModules(projectRoot, config);
  for (const filename of await sourceFiles(path.join(projectRoot, "src")))
    assert.doesNotMatch(await readFile(filename, "utf8"), /dateModified/, `${path.relative(projectRoot, filename)} must not invent a modification date`);
  const content = new Map();
  for (const locale of locales) {
    for (const [directory, route] of corePages) {
      const source = await readFile(path.join(projectRoot, "src/content", directory, locale === "vi" ? "vi/-index.md" : "-index.md"), "utf8");
      content.set(localeRoute(route, locale), parseFrontmatter(source).frontmatter);
    }
  }
  const faqContent = Object.fromEntries(await Promise.all(locales.map(async (locale) => [locale, parseFrontmatter(await readFile(path.join(projectRoot, "src/content/sections", locale === "vi" ? "vi/faq.md" : "faq.md"), "utf8")).frontmatter])));
  const port = await freePort(requestedPort);
  const origin = `http://127.0.0.1:${port}`;
  // Deliberately no --env-file and no inherited provider credentials.
  const child = spawn(process.execPath, ["dist/server/entry.mjs"], {
    cwd: projectRoot,
    env: { NODE_ENV: "production", HOST: "127.0.0.1", PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let serverLog = "";
  let startError;
  child.on("error", (error) => { startError = error; });
  child.stdout.on("data", (chunk) => { serverLog += chunk; });
  child.stderr.on("data", (chunk) => { serverLog += chunk; });
  const failures = [];
  const metrics = { getRequests: 0, checkGroups: 0, indexablePages: 0, jsonLdBlocks: 0, faqPages: 0, faqPairs: 0, pricingPages: 0, offers: 0, pricingUiPages: 0, noindexSingles: 0, withdrawnPages: 0, legalPages: 0, notFoundPages: 0, sitemapUrls: 0, endpointLinks: 0, markdownPlanAmounts: 0, socialMetadataPages: 0, portraitMetadataPages: 0, webPages: 0, fullTextPages: 0 };
  const results = [];
  const samples = {};
  const pageHtml = new Map();
  const check = (label, run) => {
    metrics.checkGroups++;
    try { run(); } catch (error) { failures.push(`${label}: ${error.message}`); }
  };
  const get = async (route) => {
    assert.ok(route.startsWith("/") && !route.startsWith("/api/"), "Verification is public GET-only");
    const response = await fetch(`${origin}${route}`, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(15000) });
    metrics.getRequests++;
    const body = await response.text();
    results.push({
      route, status: response.status, contentType: response.headers.get("content-type"),
      noindex: hasNoindex(body), location: response.headers.get("location"),
      lang: tags(body, "html")[0]?.lang, heading: blocks(body, "h1")[0]?.text,
      has404: blocks(body, "p").some((paragraph) => paragraph.text === "404"),
    });
    return { response, body };
  };
  const verifySocialMetadata = (html, route) => {
    const locale = /^\/vi(?:\/|$)/.test(route) ? "vi" : "en";
    check(`${route} verified social image dimensions and localized factual alt`, () => {
      const metas = tags(html, "meta");
      const meta = (key) => metas.filter((item) => item.name === key || item.property === key);
      assert.equal(meta("og:image").length, 1);
      assert.equal(meta("twitter:image").length, 1);
      assert.equal(meta("twitter:image")[0].content, meta("og:image")[0].content);
      const images = new Map([
        [new URL("/images/logo.png", site).href, { width: 480, height: 480, alt: locale === "en" ? "VLABS logo" : "Logo VLABS" }],
        [new URL("/images/ceo.jpeg", site).href, { width: 768, height: 768 }],
      ]);
      const expected = images.get(meta("og:image")[0].content);
      if (!expected) {
        for (const key of ["og:image:width", "og:image:height", "og:image:alt", "twitter:image:alt"])
          assert.equal(meta(key).length, 0, "Unknown images must not receive fabricated metadata");
        return;
      }
      let alt = expected.alt;
      if (!alt) {
        const data = content.get(localeRoute("/open-letter", locale));
        alt = locale === "en" ? `Portrait of ${data.founder.name}, founder of Smart Learning Technology Solution` : `Chân dung ${data.founder.name}, nhà sáng lập Smart Learning Technology Solution`;
        const portrait = tags(html, "img").filter((image) => /(?:^|\s)open-letter-portrait(?:\s|$)/.test(image.class || ""));
        assert.equal(portrait.length, 1);
        assert.equal(portrait[0].alt, alt, "Social alt must equal the existing visible portrait alt");
        metrics.portraitMetadataPages++;
      }
      for (const [key, value] of [["og:image:width", String(expected.width)], ["og:image:height", String(expected.height)], ["og:image:alt", alt], ["twitter:image:alt", alt]]) {
        assert.equal(meta(key).length, 1, `${key} must be present exactly once`);
        assert.equal(meta(key)[0].content, value, key);
      }
    });
    metrics.socialMetadataPages++;
  };
  const parseSchemas = (html, route) => {
    verifySocialMetadata(html, route);
    const nodes = [];
    for (const script of blocks(html, "script").filter((script) => script.attrs.type === "application/ld+json")) {
      metrics.jsonLdBlocks++;
      check(`${route} JSON-LD block ${metrics.jsonLdBlocks}`, () => {
        assert.doesNotMatch(script.body, /[<>&\u2028\u2029]/, "JSON-LD must be escaped for script context");
        const schema = JSON.parse(script.body);
        assert.equal(schema["@context"], "https://schema.org");
        const graph = schema["@graph"] || [schema];
        assert.ok(Array.isArray(graph) && graph.length);
        for (const node of graph) {
          assert.ok(typeof node["@type"] === "string" && node["@id"], "Every node needs type and stable identity");
          nodes.push(node);
          samples[node["@type"]] ??= node;
        }
      });
    }
    check(`${route} identity graph`, () => {
      const organizations = nodes.filter((node) => node["@type"] === "Organization");
      const websites = nodes.filter((node) => node["@type"] === "WebSite");
      assert.equal(organizations.length, 1);
      assert.equal(websites.length, 1);
      const organization = organizations[0];
      const website = websites[0];
      assert.equal(organization.name, "VLABS");
      assert.equal(organization.url, site.href);
      assert.equal(organization.logo, new URL(config.site.logo, site).href);
      assert.equal(organization["@id"], `${site.href}#organization`);
      assert.equal(organization.parentOrganization["@type"], "Organization");
      assert.equal(organization.parentOrganization.name, "Smart Learning Technology Solution");
      assert.equal(organization.parentOrganization.founder["@type"], "Person");
      assert.equal(organization.parentOrganization.founder.name, "Nguyễn Đình Khôi");
      assert.equal(website.name, "VLABS");
      assert.equal(website.url, site.href);
      assert.deepEqual(website.inLanguage, locales);
      assert.equal(website.publisher["@id"], organization["@id"]);
    });
    check(`${route} source-only publication month and no invented modification dates`, () => {
      assert.doesNotMatch(JSON.stringify(nodes), /"dateModified"\s*:/);
      const webPages = nodes.filter((node) => node["@type"] === "WebPage");
      const isLetter = (route.replace(/^\/vi(?=\/|$)/, "") || "/") === "/open-letter";
      assert.equal(webPages.length, isLetter ? 1 : 0, "Only open-letter adds exactly one WebPage node");
      for (const node of nodes.filter((node) => node["@type"] !== "WebPage"))
        assert.ok(!Object.hasOwn(node, "datePublished"), "Other schemas must not acquire publication dates");
      if (!isLetter) return;
      assert.equal(webPages[0].datePublished, "2026-11");
      assert.equal(webPages[0].url, new URL(route, site).href);
      assert.equal(webPages[0]["@id"], `${webPages[0].url}#webpage`);
      assert.deepEqual(Object.keys(webPages[0]).sort(), ["@context", "@type", "@id", "url", "datePublished"].sort());
      metrics.webPages++;
    });
    return nodes;
  };
  const verifyNotFound = (route, response, html) => {
    const locale = /^\/vi(?:\/|$)/.test(route) ? "vi" : "en";
    check(`${route} localized HTTP404 / HTML / noindex / no redirect`, () => {
      assert.equal(response.status, 404);
      assert.match(response.headers.get("content-type") || "", /^text\/html\b/);
      assert.equal(response.headers.has("location"), false);
      assert.ok(hasNoindex(html), "Every not-found response must render noindex HTML");
      assert.equal(tags(html, "html")[0]?.lang, locale);
      const headings = blocks(html, "h1");
      assert.equal(headings.length, 1);
      assert.equal(headings[0].text, normalize(modules.messages.getMessages(locale).notFound.title));
      assert.ok(blocks(html, "p").some((paragraph) => paragraph.text === "404"));
      assert.equal(tags(html, "link").find((link) => link.rel === "canonical")?.href, new URL(localeRoute("/404", locale), site).href);
    });
    parseSchemas(html, route);
  };
  const verifyPricingUi = (html, route, locale) => {
    const data = content.get(localeRoute("/pricing", locale));
    const canonical = content.get("/pricing");
    const cards = blocks(html, "article").filter((card) => "data-plan-id" in card.attrs);
    check(`${route} pricing cards and unchanged CTAs`, () => {
      assert.equal(cards.length, 3);
      for (const plan of data.plans) {
        const card = cards.find((card) => card.attrs["data-plan-id"] === plan.plan_id);
        assert.ok(card, `Missing ${plan.plan_id} card`);
        const amounts = modules.pricing.planAmounts(modules.pricing.planById(canonical.plans, plan.plan_id), plan, locale);
        assert.equal(blocks(card.body, "h3")[0].text, plan.title);
        assert.ok(blocks(card.body, "p").some((paragraph) => paragraph.text === normalize(plan.description)));
        for (const interval of ["month", "year"]) {
          const prices = blocks(card.body, "p").filter((price) => price.attrs["data-billing-price"] === interval);
          assert.equal(prices.length, 1);
          assert.equal(prices[0].attrs["data-currency"], amounts.currency);
          assert.equal(prices[0].attrs["data-amount-minor"], String(amounts[interval]));
          assert.equal(blocks(prices[0].body, "strong")[0].text, normalize(interval === "month" ? amounts.monthlyDisplay : amounts.yearlyDisplay));
          assert.equal("hidden" in prices[0].attrs, interval === "year");
        }
        const islands = tags(card.body, "astro-island").filter((island) => (island.props || "").includes("monthlyAmountMinor"));
        const dialogs = blocks(card.body, "dialog");
        if (plan.plan_id === "starter") {
          assert.equal(islands.length, 1);
          assert.equal(dialogs.length, 1);
          const props = JSON.parse(islands[0].props);
          const value = (key) => Array.isArray(props[key]) ? props[key][1] : props[key];
          assert.equal(value("planId"), "starter");
          assert.equal(value("locale"), locale);
          assert.equal(value("buttonLabel"), plan.button.label);
          assert.equal(value("monthlyAmountMinor"), amounts.month);
          assert.equal(value("yearlyAmountMinor"), amounts.year);
        } else {
          assert.equal(islands.length, 0);
          assert.equal(dialogs.length, 0);
          const links = blocks(card.body, "a").filter((link) => /(?:^|\s)btn-outline(?:\s|$)/.test(link.attrs.class || ""));
          assert.equal(links.length, 1);
          assert.equal(links[0].attrs.href, localeRoute("/contact", locale));
          assert.equal(links[0].text, plan.button.label);
        }
      }
    });
    metrics.pricingUiPages++;
  };

  let stopped = false;
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (startError) throw startError;
      if (child.exitCode !== null) throw new Error(`Built server exited with ${child.exitCode}`);
      try {
        const response = await fetch(`${origin}/`, { method: "GET", signal: AbortSignal.timeout(2000) });
        await response.arrayBuffer();
        if (response.status === 200) { ready = true; break; }
      } catch { /* Wait for this process's listener, never touch another server. */ }
      await delay(100);
    }
    if (!ready) throw new Error("Built server did not become ready on the approved test port.");

    const descriptions = new Set();
    for (const locale of locales) {
      for (const [, base] of corePages) {
        const route = localeRoute(base, locale);
        const { response, body: html } = await get(route);
        pageHtml.set(route, html);
        metrics.indexablePages++;
        const data = content.get(route);
        const metas = tags(html, "meta");
        const meta = (name) => metas.filter((meta) => meta.name === name || meta.property === name);
        const links = tags(html, "link");
        const nodes = parseSchemas(html, route);
        const description = meta("description")[0]?.content || "";
        results.at(-1).descriptionCodePoints = [...description].length;
        results.at(-1).title = blocks(html, "title")[0]?.text;
        results.at(-1).titleCodePoints = [...(results.at(-1).title || "")].length;
        results.at(-1).twitterCard = meta("twitter:card")[0]?.content;
        check(`${route} metadata and discoverability`, () => {
          assert.equal(response.status, 200);
          assert.equal(tags(html, "html")[0].lang, locale);
          assert.equal(blocks(html, "h1").length, 1);
          assert.ok(!hasNoindex(html), "Core HTML page must remain indexable");
          for (const link of blocks(html, "a"))
            assert.doesNotMatch(new URL(link.attrs.href || "", site).pathname, /^\/(?:vi\/)?(?:about|careers|case-study)(?:\/|$)/, "Public pages must not link to withdrawn sections");
          assert.equal(meta("description").length, 1);
          assert.ok(description.trim() && [...description].length <= 160, `Description has ${[...description].length} code points (editorial target <=160)`);
          assert.ok(!descriptions.has(description), "Descriptions must be unique");
          descriptions.add(description);
          assert.equal(links.filter((link) => link.rel === "canonical").length, 1);
          assert.equal(links.find((link) => link.rel === "canonical").href, new URL(route, site).href);
          for (const language of ["en", "vi", "x-default"]) {
            const alternate = links.filter((link) => link.rel === "alternate" && link.hreflang === language);
            assert.equal(alternate.length, 1);
            assert.equal(alternate[0].href, new URL(localeRoute(base, language === "vi" ? "vi" : "en"), site).href);
          }
          const described = links.filter((link) => link.rel === "describedby");
          assert.equal(described.length, 1);
          assert.equal(new URL(described[0].href, site).pathname, "/llms.txt");
          assert.equal(meta("og:site_name")[0]?.content, "VLABS");
          const image = data.image && !data.image.endsWith(".svg") ? data.image : config.metadata.meta_image;
          assert.equal(meta("og:image")[0]?.content, new URL(image, site).href);
          if (base === "/features") {
            const expectedTitle = locale === "en" ? "VLABS Features | Students, Teachers and Administrators" : "Tính năng VLABS | Học sinh, giáo viên và quản trị viên";
            assert.equal(data.meta_title, expectedTitle);
            assert.equal(blocks(html, "title")[0]?.text, expectedTitle);
            assert.ok([...data.meta_title].length <= 60);
          }
          // Current relevant assets are square; retain an honest summary card.
          assert.equal(meta("twitter:card")[0]?.content, "summary");
          const markdown = links.filter((link) => link.rel === "alternate" && link.type === "text/markdown");
          assert.equal(markdown.length, base === "/pricing" ? 1 : 0);
          if (base === "/pricing") {
            assert.equal(markdown[0].href, new URL("/pricing.md", site).href);
            assert.ok(!("hreflang" in markdown[0]));
            const visible = blocks(html, "a").filter((link) => link.attrs.href === "/pricing.md");
            assert.equal(visible.length, 1);
            assert.equal(visible[0].text, modules.messages.getMessages(locale).seo.pricingMarkdown);
          }
        });
        check(`${route} FAQ source / visible-text parity`, () => {
          const faqs = nodes.filter((node) => node["@type"] === "FAQPage");
          const accordions = blocks(html, "details").filter((detail) => /(?:^|\s)accordion(?:\s|$)/.test(detail.attrs.class || ""));
          const expected = faqRoutes.has(base) && faqContent[locale].enable ? faqContent[locale].items : [];
          assert.equal(accordions.length, expected.length);
          assert.equal(faqs.length, expected.length ? 1 : 0);
          if (!expected.length) return;
          assert.equal(faqs[0].inLanguage, locale);
          assert.equal(faqs[0].mainEntity.length, accordions.length);
          if (accordions.length >= 3) assert.ok(faqs[0].mainEntity.length >= 3);
          faqs[0].mainEntity.forEach((question, index) => {
            assert.equal(question["@type"], "Question");
            assert.equal(question.acceptedAnswer["@type"], "Answer");
            assert.equal(question.name, expected[index].question);
            assert.equal(question.acceptedAnswer.text, expected[index].answer);
            assert.equal(normalize(question.name), blocks(accordions[index].body, "summary")[0].text);
            assert.equal(normalize(question.acceptedAnswer.text), blocks(accordions[index].body, "div")[0].text);
          });
          metrics.faqPages++;
          metrics.faqPairs += accordions.length;
        });
        if (definitionRoutes.has(base)) check(`${route} definition opening`, () => {
          const opening = data.banner?.content || data.page_header?.content || data.page_header?.subtitle;
          assert.ok(opening && opening.split(/\s+/).length <= 60);
          assert.ok(blocks(html, "p").some((paragraph) => paragraph.text === normalize(opening)), "Opening must be rendered as visible text");
        });
        if (base === "/" || base === "/pricing") verifyPricingUi(html, route, locale);
        check(`${route} pricing schema`, () => {
          const applications = nodes.filter((node) => node["@type"] === "SoftwareApplication");
          assert.equal(applications.length, base === "/pricing" ? 3 : 0);
          if (base !== "/pricing") return;
          metrics.pricingPages++;
          const pricing = content.get(route);
          for (const app of applications) {
            const plan = pricing.plans.find((plan) => plan.plan_id === app.identifier);
            assert.ok(plan);
            assert.equal(app.name, `VLABS ${plan.title}`);
            assert.equal(app.description, plan.description);
            assert.equal(app.inLanguage, locale);
            assert.equal(app.url, `${new URL(route, site).href}#plan-${plan.plan_id}`);
            assert.equal(app.offers.length, 2);
            assert.ok(!("aggregateRating" in app) && !("review" in app) && !("operatingSystem" in app));
            for (const [index, field] of ["price", "yearly_price"].entries()) {
              const offer = app.offers[index];
              const spec = offer.priceSpecification;
              assert.equal(offer["@type"], "Offer");
              assert.equal(offer.price, plan[field]);
              assert.equal(offer.priceCurrency, locale === "vi" ? "VND" : "USD");
              assert.equal(offer.url, app.url);
              assert.equal(offer.description, modules.messages.getMessages(locale).pricing.availability);
              assert.ok(!("priceValidUntil" in offer) && !("availability" in offer) && !("unitText" in offer));
              assert.equal(spec["@type"], "UnitPriceSpecification");
              assert.equal(spec.price, offer.price);
              assert.equal(spec.priceCurrency, offer.priceCurrency);
              assert.equal(spec.billingDuration, index === 0 ? "P1M" : "P1Y");
              assert.deepEqual(spec.referenceQuantity, { "@type": "QuantitativeValue", value: 1, unitCode: "C62", unitText: locale === "vi" ? "tài khoản" : "account" });
              metrics.offers++;
            }
          }
          samples[`SoftwareApplication-${locale}`] = applications[0];
          samples[`Offer-${locale}`] = applications[0].offers[0];
        });
      }
    }

    for (const base of withdrawnSections) for (const locale of locales) {
      const route = localeRoute(base, locale);
      const { response, body } = await get(route);
      verifyNotFound(route, response, body);
      metrics.withdrawnPages++;
    }
    for (const directory of ["careers", "case-study"]) {
      const { readdir } = await import("node:fs/promises");
      const entries = await readdir(path.join(projectRoot, "src/content", directory));
      for (const filename of entries.filter((name) => name.endsWith(".md") && !name.startsWith("-"))) {
        const base = `/${directory}/${filename.replace(/\.md$/, "")}`;
        for (const locale of locales) {
          const route = localeRoute(base, locale);
          const { response, body } = await get(route);
          verifyNotFound(route, response, body);
          metrics.withdrawnPages++;
        }
      }
    }
    for (const base of ["/privacy-policy", "/term-and-condition"]) for (const locale of locales) {
      const route = localeRoute(base, locale);
      const { response, body } = await get(route);
      check(`${route} legal noindex preserved`, () => { assert.equal(response.status, 200); assert.ok(hasNoindex(body)); });
      parseSchemas(body, route);
      metrics.legalPages++;
    }
    for (const base of ["/404", "/business", "/__seo-check-nonexistent", "/careers/__seo-check-nonexistent", "/case-study/__seo-check-nonexistent", "/careers/nested/__seo-check-nonexistent", "/case-study/nested/__seo-check-nonexistent"]) for (const locale of locales) {
      const route = localeRoute(base, locale);
      const { response, body } = await get(route);
      verifyNotFound(route, response, body);
      metrics.notFoundPages++;
    }
    for (const route of ["/vi/llms.txt", "/vi/llms-full.txt", "/vi/pricing.md"]) {
      const { response, body } = await get(route);
      check(`${route} no invented localized representation`, () => assert.equal(response.status, 404));
      verifyNotFound(route, response, body);
    }
    check("exactly 12 indexable pages and no active noindex singles", () => {
      assert.equal(metrics.indexablePages, 12);
      assert.equal(metrics.noindexSingles, 0);
    });

    const llms = await get("/llms.txt");
    await writeFile(path.join(artifactDir, "worker-llms.txt"), llms.body);
    check("/llms.txt status, MIME, and curated bilingual content", () => {
      assert.equal(llms.response.status, 200);
      assert.equal(llms.response.headers.get("content-type"), "text/plain; charset=utf-8");
      assert.equal(llms.response.headers.get("link"), '</llms-full.txt>; rel="alternate"; type="text/plain"');
      assert.match(llms.body, /^# VLABS\n\n> en:/);
      const links = [...llms.body.matchAll(/^- \[[^\n]+\]\(([^\s)]+)\)/gm)];
      assert.equal(links.length, 13);
      const urls = new Set(links.map((match) => match[1]));
      for (const locale of locales) for (const [, base] of corePages)
        assert.ok(urls.has(new URL(localeRoute(base, locale), site).href));
      assert.ok(urls.has(new URL("/pricing.md", site).href));
      const references = llms.body.split("\n").filter((line) => line.includes(new URL("/llms-full.txt", site).href));
      assert.equal(references.length, 1);
      assert.doesNotMatch(references[0], /^- \[/, "Full-text reference must not change the thirteen bullets");
      for (const url of urls)
        assert.doesNotMatch(new URL(url).pathname, /^\/(?:vi\/)?(?:about|careers|case-study)(?:\/|$)/);
      metrics.endpointLinks = links.length;
    });

    const fullText = await get("/llms-full.txt");
    await writeFile(path.join(artifactDir, "worker-llms-full.txt"), fullText.body);
    check("/llms-full.txt status, MIME, twelve canonical URLs, and source-derived readable body copy", () => {
      assert.equal(fullText.response.status, 200);
      assert.equal(fullText.response.headers.get("content-type"), "text/plain; charset=utf-8");
      assert.match(fullText.body, /^# VLABS\n/);
      assert.equal([...fullText.body.matchAll(/^### /gm)].length, 12);
      const md = (value) => modules.seo.markdownText(plainify(value.replace(/<br\s*\/?\s*>/gi, " ")));
      const urls = new Set();
      for (const locale of locales) for (const [, base] of corePages) {
        const route = localeRoute(base, locale);
        const url = new URL(route, site).href;
        const data = content.get(route);
        const marker = `<${url}>`;
        assert.equal(fullText.body.split(marker).length - 1, 1, `${route}: canonical page appears once`);
        assert.ok(fullText.body.includes(`### ${md(data.title)}\n`));
        const page = fullText.body.split(`${marker}\n`)[1]?.split(/\n###? /)[0];
        assert.ok(page?.includes(md(data.description)), `${route}: source description`);
        const opening = data.banner?.content || data.page_header?.content || data.page_header?.subtitle || data.salutation;
        assert.ok(page.includes(md(opening)), `${route}: source body opening`);
        for (const paragraph of data.paragraphs || []) assert.ok(page.includes(md(paragraph)), `${route}: complete letter`);
        for (const role of data.roles?.items || []) for (const point of role.points)
          assert.ok(page.includes(md(point)), `${route}: role points`);
        for (const item of data.integrations?.items || []) assert.ok(page.includes(md(item.content)), `${route}: integration facts`);
        for (const item of data.contact_info?.items || []) assert.ok(page.includes(md(item.detail)), `${route}: contact facts`);
        urls.add(url);
      }
      assert.equal(urls.size, 12);
      for (const [url] of fullText.body.matchAll(/https?:\/\/[^\s)>]+/g))
        assert.doesNotMatch(new URL(url).pathname, /^\/(?:vi\/)?(?:about|careers|case-study)(?:\/|$)/);
      assert.doesNotMatch(fullText.body, /<\/?(?:strong|br|script)\b|^---$/m, "Do not publish raw frontmatter or HTML in place of readable Markdown");
      metrics.fullTextPages = urls.size;
    });

    const markdown = await get("/pricing.md");
    await writeFile(path.join(artifactDir, "worker-pricing.md"), markdown.body);
    check("/pricing.md status, MIME, all source amounts / plan facts / qualifications", () => {
      assert.equal(markdown.response.status, 200);
      assert.equal(markdown.response.headers.get("content-type"), "text/markdown; charset=utf-8");
      assert.equal(markdown.response.headers.get("link"), '</llms.txt>; rel="describedby"');
      const md = modules.seo.markdownText;
      for (const locale of locales) {
        const section = markdown.body.split(`## ${locale === "en" ? "English (USD)" : "Tiếng Việt (VND)"}\n`)[1]?.split(/\n## /)[0];
        assert.ok(section);
        const pricing = content.get(localeRoute("/pricing", locale));
        const copy = modules.messages.getMessages(locale);
        for (const plan of pricing.plans) {
          const block = section.split(`### ${plan.title} (${plan.plan_id})\n`)[1]?.split(/\n### /)[0];
          assert.ok(block && block.includes(md(plan.description)));
          for (const [field, interval] of [["price", "month"], ["yearly_price", "year"]]) {
            const display = locale === "vi" ? `${new Intl.NumberFormat("vi-VN").format(Number(plan[field]))} VND` : `$${plan[field]}`;
            assert.ok(block.includes(`${display}/${copy.pricing[interval]}`), `${locale} ${plan.plan_id} ${field}`);
            metrics.markdownPlanAmounts++;
          }
          for (const feature of plan.features) {
            assert.ok(block.includes(`- ${feature.included ? copy.pricing.included : copy.pricing.notIncluded}: ${md(feature.label)}`));
            if (feature.tooltip) assert.ok(block.includes(md(feature.tooltip)));
          }
          const column = pricing.comparison.headers.findIndex((header) => header.plan_id === plan.plan_id) - 1;
          for (const row of pricing.comparison.rows.filter((row) => !row.kind)) {
            const value = row.values[column];
            const display = typeof value === "boolean" ? value ? copy.pricing.included : copy.pricing.notIncluded : value;
            assert.ok(block.includes(`- ${md(row.feature)}: ${md(display)}`));
          }
          const action = plan.plan_id === "starter" ? `${localeRoute("/pricing", locale)}#plan-starter` : localeRoute("/contact", locale);
          assert.ok(block.includes(`[${md(plan.button.label)}](${new URL(action, site).href})`));
        }
        for (const key of ["fixedRate", "availability", "monthlyNote", "yearlyNote", "comparisonNote"])
          assert.ok(section.includes(md(copy.pricing[key])), `${locale} ${key}`);
        assert.ok(section.includes(md(pricing.pricing_note.content)));
        assert.ok(section.includes(md(copy.checkout.terms)));
      }
    });

    const index = await get("/sitemap-index.xml");
    const sitemap = await get("/sitemap-0.xml");
    await writeFile(path.join(artifactDir, "worker-sitemap.xml"), sitemap.body);
    check("sitemap exactly 12 canonical HTML URLs with en / vi / x-default", () => {
      assert.equal(index.response.status, 200);
      assert.ok(index.body.includes(new URL("/sitemap-0.xml", site).href));
      assert.equal(sitemap.response.status, 200);
      const entries = blocks(sitemap.body, "url");
      assert.equal(entries.length, 12);
      const expected = new Set(corePages.flatMap(([, base]) => locales.map((locale) => new URL(localeRoute(base, locale), site).href)));
      const seen = new Set();
      for (const entry of entries) {
        const url = decodeHtml(entry.body.match(/<loc>([^<]+)<\/loc>/)?.[1] || "");
        assert.ok(expected.has(url), `Unexpected/noindex/duplicate sitemap URL ${url}`);
        assert.ok(!seen.has(url));
        seen.add(url);
        const base = new URL(url).pathname.replace(/^\/vi(?=\/|$)/, "") || "/";
        const alternates = tags(entry.body, "xhtml:link");
        assert.equal(alternates.length, 3);
        for (const language of ["en", "vi", "x-default"]) {
          const alternate = alternates.filter((link) => link.hreflang === language);
          assert.equal(alternate.length, 1);
          assert.equal(alternate[0].rel, "alternate");
          assert.equal(alternate[0].href, new URL(localeRoute(base, language === "vi" ? "vi" : "en"), site).href);
        }
      }
      assert.equal(seen.size, expected.size);
      assert.doesNotMatch(sitemap.body, /<(?:lastmod|changefreq)>/);
      metrics.sitemapUrls = entries.length;
    });

    // Measure images actually published in metadata, not unused template assets.
    const socialPaths = new Set();
    for (const html of pageHtml.values()) {
      for (const meta of tags(html, "meta").filter((meta) => meta.property === "og:image")) {
        const image = new URL(meta.content, site);
        if (image.origin === site.origin) socialPaths.add(image.pathname);
      }
    }
    const socialImages = [];
    for (const pathname of socialPaths) {
      const metadata = await sharp(path.join(projectRoot, "public", pathname)).metadata();
      socialImages.push({ path: pathname, width: metadata.width, height: metadata.height });
    }
    check("both registered social image dimensions match the actual published files", () => {
      for (const [pathname, size] of [["/images/logo.png", 480], ["/images/ceo.jpeg", 768]]) {
        const image = socialImages.find((image) => image.path === pathname);
        assert.ok(image, pathname);
        assert.equal(image.width, size);
        assert.equal(image.height, size);
      }
      assert.equal(metrics.portraitMetadataPages, 2);
      assert.equal(metrics.webPages, 2);
    });
    await writeFile(path.join(artifactDir, "worker-runtime-home.html"), pageHtml.get("/"));
    await writeFile(path.join(artifactDir, "worker-runtime-vi-pricing.html"), pageHtml.get("/vi/pricing"));
    for (const [type, value] of Object.entries(samples))
      await writeFile(path.join(artifactDir, `worker-schema-${type}.json`), JSON.stringify(value, null, 2) + "\n");
    await stopOwnServer(child);
    stopped = true;
    const summary = { port, ownServerPid: child.pid, serverStopped: stopped, metrics, results, failures, socialImages, socialCardLimitation: "Retained summary cards and source-authored social images; no dedicated wide social-card asset selected." };
    await writeFile(path.join(artifactDir, "worker-runtime-summary.json"), JSON.stringify(summary, null, 2) + "\n");
    console.log(`SEO runtime: ${metrics.indexablePages} indexable pages; ${metrics.jsonLdBlocks} JSON-LD blocks; ${metrics.faqPages} FAQ pages / ${metrics.faqPairs} exact visible Q&A pairs; ${metrics.offers} offers; ${metrics.markdownPlanAmounts} Markdown price amounts; ${metrics.noindexSingles} noindex singles; ${metrics.withdrawnPages} withdrawn 404 pages; ${metrics.sitemapUrls} sitemap URLs; ${metrics.endpointLinks} llms bullets; ${metrics.fullTextPages} full-text pages; ${metrics.socialMetadataPages} image metadata pages / ${metrics.portraitMetadataPages} portraits; ${metrics.webPages} source-month WebPages; ${failures.length} failure(s). Own port ${port} server stopped.`);
    if (failures.length) throw new Error(`SEO runtime failed (${failures.length}):\n${failures.join("\n")}`);
    return summary;
  } finally {
    if (!stopped) await stopOwnServer(child);
    await writeFile(path.join(artifactDir, "worker-runtime-server.log"), serverLog);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await verifySeoRuntime(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
