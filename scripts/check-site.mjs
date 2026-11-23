import { access, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifySeoRuntime } from "./check-seo-runtime.mjs";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const buildRoot = path.join(projectRoot, "dist");
const config = JSON.parse(
  await readFile(path.join(projectRoot, "src/config/config.json"), "utf8"),
);
const site = new URL(config.site.base_url);
const failures = new Set();
const menu = JSON.parse(
  await readFile(path.join(projectRoot, "src/config/menu.json"), "utf8"),
);
const englishRoutes = [
  "/",
  "/404",
  "/contact",
  "/features",
  "/integrations",
  "/open-letter",
  "/pricing",
  "/privacy-policy",
  "/term-and-condition",
];
const expectedPlanAmounts = {
  starter: {
    usd: { month: 269, year: 2_690 },
    vnd: { month: 69_000, year: 690_000 },
  },
  campus: {
    usd: { month: 309, year: 3_090 },
    vnd: { month: 79_000, year: 790_000 },
  },
  enterprise: {
    usd: { month: 389, year: 3_890 },
    vnd: { month: 99_000, year: 990_000 },
  },
};
const vietnameseMenuNames = {
  Features: "Tính năng",
  Business: "Tổ chức",
  Pricing: "Bảng giá",
  About: "Giới thiệu",
  Integrations: "Tích hợp",
  "Case Studies": "Tình huống",
  "Use Cases": "Tình huống minh họa",
  Contact: "Liên hệ",
  Home: "Trang chủ",
  "About Us": "Về chúng tôi",
  "About VLABS": "Về VLABS",
  "Example Use Cases": "Tình huống minh họa",
  "Illustrative Use Cases": "Tình huống minh họa",
  "Role Profiles": "Hồ sơ vai trò",
  "Open Letter": "Thư ngỏ",
  "Privacy Policy": "Chính sách quyền riêng tư",
  "Terms and Conditions": "Điều khoản và điều kiện",
};

async function filesIn(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const filename = path.join(directory, entry.name);
      return entry.isDirectory() ? filesIn(filename) : [filename];
    }),
  );
  return files.flat();
}

async function resolveBuiltFile(url) {
  const relative = decodeURIComponent(url.pathname).replace(/^\/+/, "");
  const filename = path.resolve(buildRoot, relative);
  if (filename !== buildRoot && !filename.startsWith(`${buildRoot}/`)) {
    return undefined;
  }
  for (const candidate of [
    filename,
    path.join(filename, "index.html"),
    `${filename}.html`,
  ]) {
    try {
      if ((await stat(candidate)).isFile()) return candidate;
    } catch {
      // Try the next static route representation.
    }
  }
  return undefined;
}

function attributes(tag) {
  const content = tag.replace(/^<[\w-]+\b/, "").replace(/\/?\s*>$/, "");
  return Object.fromEntries(
    Array.from(
      content.matchAll(
        /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g,
      ),
      (match) => [
        match[1].toLowerCase(),
        (match[2] ?? match[3] ?? match[4] ?? "").replaceAll("&amp;", "&"),
      ],
    ),
  );
}

function routeForRelative(relative) {
  const normalized = relative.replaceAll("\\", "/");
  if (normalized === "index.html") return "/";
  return `/${normalized.replace(/\/index\.html$/, "").replace(/\.html$/, "")}`;
}

function localeRoute(route, locale) {
  const base = route.replace(/^\/vi(?=\/|$)/, "") || "/";
  return locale === "vi" ? `/vi${base === "/" ? "" : base}` : base;
}

function decodeHtml(value) {
  return value
    .replace(/&#(?:x([\da-f]+)|(\d+));/gi, (_, hex, decimal) => {
      const point = Number.parseInt(hex || decimal, hex ? 16 : 10);
      return point <= 0x10ffff ? String.fromCodePoint(point) : "\ufffd";
    })
    .replace(
      /&(amp|quot|apos|lt|gt|nbsp|copy);/g,
      (_, name) =>
        ({
          amp: "&",
          quot: '"',
          apos: "'",
          lt: "<",
          gt: ">",
          nbsp: " ",
          copy: "©",
        })[name],
    );
}

function htmlText(html) {
  return decodeHtml(
    html
      .replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[\s\u00a0\u202f]+/g, " ")
    .trim();
}

function blocks(html, tagName) {
  return [
    ...html.matchAll(
      new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "gi"),
    ),
  ].map((match) => ({
    attrs: Object.fromEntries(
      Object.entries(
        attributes(match[0].slice(0, match[0].indexOf(">") + 1)),
      ).map(([key, value]) => [key, decodeHtml(value)]),
    ),
    body: match[1],
    text: htmlText(match[1]),
  }));
}

function metadataIssues(html, route, siteUrl) {
  const issues = [];
  const locale = /^\/vi(?:\/|$)/.test(route) ? "vi" : "en";
  const canonical = new URL(route, siteUrl).href;
  const htmlAttrs = attributes(html.match(/<html\b[^>]*>/i)?.[0] || "");
  if (htmlAttrs.lang !== locale)
    issues.push(`expected html.lang=${locale}, found ${htmlAttrs.lang}`);
  if (htmlAttrs["data-currency"] !== (locale === "vi" ? "vnd" : "usd"))
    issues.push(`html currency does not match ${locale}`);
  const links = [...html.matchAll(/<link\b[^>]*>/gi)].map(([tag]) =>
    attributes(tag),
  );
  const canonicals = links.filter((link) => link.rel === "canonical");
  if (canonicals.length !== 1 || canonicals[0].href !== canonical)
    issues.push(`expected one self-canonical ${canonical}`);
  for (const language of ["en", "vi", "x-default"]) {
    const alternates = links.filter(
      (link) => link.rel === "alternate" && link.hreflang === language,
    );
    const expected = new URL(
      localeRoute(route, language === "vi" ? "vi" : "en"),
      siteUrl,
    ).href;
    if (alternates.length !== 1 || alternates[0].href !== expected)
      issues.push(`expected one reciprocal ${language} alternate ${expected}`);
  }
  const metas = [...html.matchAll(/<meta\b[^>]*>/gi)].map(([tag]) =>
    Object.fromEntries(
      Object.entries(attributes(tag)).map(([key, value]) => [
        key,
        decodeHtml(value),
      ]),
    ),
  );
  const value = (name) =>
    metas.filter((meta) => meta.name === name || meta.property === name);
  const description = value("description");
  const title = htmlText(html.match(/<title>([^<]+)<\/title>/)?.[1] || "");
  if (description.length !== 1 || !description[0].content?.trim())
    issues.push("expected one nonempty meta description");
  for (const [key, expected] of [
    ["og:title", title],
    ["twitter:title", title],
    ["og:description", description[0]?.content],
    ["twitter:description", description[0]?.content],
    ["og:url", canonical],
    ["og:locale", locale === "vi" ? "vi_VN" : "en_US"],
  ]) {
    const matches = value(key);
    if (matches.length !== 1 || !expected || matches[0].content !== expected)
      issues.push(`${key} must match localized page metadata`);
  }
  const base = localeRoute(route, "en");
  if (base === "/features") {
    const expectedTitle = locale === "en"
      ? "VLABS Features | Students, Teachers and Administrators"
      : "Tính năng VLABS | Học sinh, giáo viên và quản trị viên";
    if (title !== expectedTitle || [...title].length > 60)
      issues.push("features title must equal approved copy within 60 Unicode code points");
  }

  const socialImages = value("og:image");
  if (socialImages.length !== 1 || !socialImages[0].content)
    issues.push("expected one og:image");
  const imageDimensions = {
    "/images/logo.png": { width: 480, height: 480 },
    "/images/ceo.jpeg": { width: 768, height: 768 },
  };
  let socialPath;
  try {
    const image = new URL(socialImages[0]?.content, siteUrl);
    if (image.origin === new URL(siteUrl).origin)
      socialPath = `${image.pathname}${image.search}${image.hash}`;
  } catch { /* Invalid image metadata is reported below. */ }
  const dimensions = imageDimensions[socialPath];
  const portrait = [...html.matchAll(/<img\b[^>]*>/gi)]
    .map(([tag]) => attributes(tag))
    .find((image) => /(?:^|\s)open-letter-portrait(?:\s|$)/.test(image.class || ""));
  const imageAlt = socialPath === "/images/logo.png"
    ? locale === "en" ? "VLABS logo" : "Logo VLABS"
    : decodeHtml(portrait?.alt || "");
  for (const [key, expected] of [
    ["og:image:width", dimensions && String(dimensions.width)],
    ["og:image:height", dimensions && String(dimensions.height)],
    ["og:image:alt", dimensions && imageAlt],
    ["twitter:image:alt", dimensions && imageAlt],
  ]) {
    const matches = value(key);
    if (dimensions) {
      if (matches.length !== 1 || !expected || matches[0].content !== expected)
        issues.push(`${key} must match verified source image dimensions/description`);
    } else if (matches.length) {
      issues.push(`${key} must not guess metadata for an unknown image`);
    }
  }

  const nodes = [];
  for (const script of blocks(html, "script").filter((script) => script.attrs.type === "application/ld+json")) {
    try {
      const schema = JSON.parse(script.body);
      nodes.push(...(schema["@graph"] || [schema]));
      if (schema["@context"] !== "https://schema.org") issues.push("JSON-LD context must be https://schema.org");
      if (/"dateModified"\s*:/.test(script.body)) issues.push("JSON-LD must not invent dateModified");
    } catch { issues.push("JSON-LD must be valid JSON"); }
  }
  const webPages = nodes.filter((node) => node["@type"] === "WebPage");
  if (base === "/open-letter") {
    if (webPages.length !== 1 || webPages[0].datePublished !== "2026-11")
      issues.push("open-letter must have exactly one WebPage with source publication month 2026-11");
  } else if (webPages.length || nodes.some((node) => Object.hasOwn(node, "datePublished"))) {
    issues.push("only open-letter may add a publication date/WebPage node");
  }
  if (
    base === "/404" ||
    base === "/privacy-policy" ||
    base === "/term-and-condition" ||
    /^\/(?:careers|case-study)\//.test(base)
  ) {
    if (
      !value("robots").some((meta) =>
        /(?:^|,)\s*noindex\s*(?:,|$)/i.test(meta.content || ""),
      )
    )
      issues.push("illustrative/legal/404 page must remain noindex");
  }
  return issues;
}

function chromeIssues(html, route, siteUrl, menuData) {
  const issues = [];
  const locale = /^\/vi(?:\/|$)/.test(route) ? "vi" : "en";
  const header = blocks(html, "header")[0]?.body || "";
  const footer = blocks(html, "footer")[0]?.body || "";
  if (!header || !footer) issues.push("missing shared header/footer");
  const headerLinks = blocks(header, "a").filter((link) =>
    /(?:^|\s)nav-link(?:\s|$)/.test(link.attrs.class || ""),
  );
  for (const item of menuData.main) {
    const href = localeRoute(item.url, locale);
    const name = locale === "vi" ? vietnameseMenuNames[item.name] : item.name;
    if (
      headerLinks.filter(
        (link) => link.attrs.href === href && link.text === name,
      ).length !== 2
    )
      issues.push(
        `desktop/mobile menu must both contain localized ${href}: ${name}`,
      );
  }
  const footerLinks = blocks(footer, "a").filter((link) =>
    /(?:^|\s)footer-link(?:\s|$)/.test(link.attrs.class || ""),
  );
  for (const group of ["footer_primary", "footer_resource", "footer_legal"])
    for (const item of menuData[group]) {
      const href = localeRoute(item.url, locale);
      const name = locale === "vi" ? vietnameseMenuNames[item.name] : item.name;
      if (
        footerLinks.filter(
          (link) => link.attrs.href === href && link.text === name,
        ).length !== 1
      )
        issues.push(`footer must contain localized ${href}: ${name}`);
    }
  const titles =
    locale === "vi"
      ? ["Nền tảng", "Khám phá", "Chính sách"]
      : [
          menuData.footer_col_1_title,
          menuData.footer_col_2_title,
          menuData.footer_col_3_title,
        ];
  for (const title of titles)
    if (!blocks(footer, "h2").some((heading) => heading.text === title))
      issues.push(`missing localized footer group ${title}`);
  const footerNavigation = blocks(footer, "nav");
  for (const title of titles) {
    const name = `${locale === "vi" ? "Chân trang" : "Footer"} ${title}`;
    if (
      footerNavigation.filter((nav) => nav.attrs["aria-label"] === name)
        .length !== 1
    )
      issues.push(
        `footer navigation accessible name must be localized: ${name}`,
      );
  }
  const navigationName =
    locale === "vi" ? "Điều hướng chính" : "Main Navigation";
  if (
    ![...header.matchAll(/<nav\b[^>]*>/g)].some(
      ([tag]) => attributes(tag)["aria-label"] === navigationName,
    )
  )
    issues.push("main navigation accessible name is not localized");
  const mobile = blocks(header, "details").filter((detail) =>
    /(?:^|\s)mobile-navigation(?:\s|$)/.test(detail.attrs.class || ""),
  );
  const mobileSummary = blocks(mobile[0]?.body || "", "summary");
  const menuName = locale === "vi" ? "Trình đơn" : "Menu";
  if (
    mobile.length !== 1 ||
    mobileSummary.length !== 1 ||
    mobileSummary[0].attrs["aria-label"] !== menuName ||
    mobileSummary[0].text !== menuName ||
    mobileSummary[0].attrs["aria-controls"] !== "mobile-menu" ||
    !blocks(mobile[0].body, "ul").some(
      (list) => list.attrs.id === "mobile-menu",
    )
  )
    issues.push(
      "native mobile summary must have localized name and functional menu controls",
    );
  const theme = [...header.matchAll(/<button\b[^>]*>/g)]
    .map(([tag]) => attributes(tag))
    .filter((attrs) => "data-theme-toggle" in attrs);
  if (
    theme.length !== 1 ||
    theme[0]["aria-label"] !== (locale === "vi" ? "Chế độ tối" : "Dark mode")
  )
    issues.push("theme switch stable name is not localized");
  if (
    theme.length === 1 &&
    (theme[0]["data-theme-light-label"] !==
      (locale === "vi" ? "Chuyển sang chế độ sáng" : "Switch to light mode") ||
      theme[0]["data-theme-dark-label"] !==
        (locale === "vi" ? "Chuyển sang chế độ tối" : "Switch to dark mode"))
  )
    issues.push("theme action titles are not localized");
  const selector = blocks(header, "details").find(
    (detail) => "data-locale-selector" in detail.attrs,
  );
  if (!selector) issues.push("missing native language selector");
  else {
    const summary = blocks(selector.body, "summary");
    const name =
      locale === "vi"
        ? "Ngôn ngữ và tiền tệ: Tiếng Việt, VND"
        : "Language and currency: English, USD";
    if (
      summary.length !== 1 ||
      summary[0].attrs["aria-label"] !== name ||
      summary[0].attrs["aria-controls"] !== "locale-options" ||
      !blocks(selector.body, "div").some(
        (container) => container.attrs.id === "locale-options",
      )
    )
      issues.push(
        "native language summary must have localized language/currency name and functional controls",
      );
    const choices = blocks(selector.body, "a").filter(
      (link) => "data-locale-choice" in link.attrs,
    );
    if (choices.length !== 2)
      issues.push(
        "native selector must contain exactly two functional language links",
      );
    for (const language of ["en", "vi"]) {
      const choice = choices.filter(
        (link) => link.attrs["data-locale-choice"] === language,
      );
      const expected = new URL(localeRoute(route, language), siteUrl);
      expected.searchParams.set("lang", language);
      if (choice.length !== 1) {
        issues.push(`missing native ${language} choice`);
        continue;
      }
      let target;
      try {
        target = new URL(choice[0].attrs.href, new URL(route, siteUrl));
      } catch {}
      if (
        target?.href !== expected.href ||
        choice[0].attrs.lang !== language ||
        choice[0].attrs.hreflang !== language ||
        choice[0].text !==
          (language === "vi" ? "Tiếng Việt · VND" : "English · USD")
      )
        issues.push(
          `no-JS ${language} choice does not map language/currency to its counterpart page`,
        );
      if (
        choice[0].attrs["aria-current"] !==
        (language === locale ? "true" : undefined)
      )
        issues.push(`native ${language} choice current state is incorrect`);
    }
  }
  const skip = blocks(html, "a").filter((link) =>
    /(?:^|\s)skip-link(?:\s|$)/.test(link.attrs.class || ""),
  );
  if (
    skip.length !== 1 ||
    skip[0].attrs.href !== "#main-content" ||
    skip[0].text !==
      (locale === "vi" ? "Bỏ qua để đến nội dung" : "Skip to Content")
  )
    issues.push("skip link must remain localized same-document navigation");
  if (
    locale === "vi" &&
    /All Rights Reserved|Empowering learners and educators/.test(
      htmlText(footer),
    )
  )
    issues.push("English footer fallback remains");
  return issues;
}

function priceDisplay(amount, locale) {
  const fractionDigits = locale === "en" && amount % 100 !== 0 ? 2 : 0;
  return new Intl.NumberFormat(locale === "vi" ? "vi-VN" : "en-US", {
    style: "currency",
    currency: locale === "vi" ? "VND" : "USD",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })
    .format(locale === "vi" ? amount : amount / 100)
    .replace(/[\u00a0\u202f]/g, " ");
}

function pricingIssues(html, route) {
  const issues = [];
  const base = localeRoute(route, "en");
  if (base !== "/" && base !== "/pricing") return issues;
  const locale = /^\/vi(?:\/|$)/.test(route) ? "vi" : "en";
  const currency = locale === "vi" ? "vnd" : "usd";
  const cards = blocks(html, "article").filter(
    (article) => "data-plan-id" in article.attrs,
  );
  const checkoutIslands = (body) => [...body.matchAll(/<astro-island\b[^>]*>/g)]
    .map(([tag]) => attributes(tag))
    .filter((attrs) => (attrs.props || "").includes("monthlyAmountMinor"));
  const contactHref = localeRoute("/contact", locale);
  if (cards.length !== 3)
    issues.push(`expected three pricing cards, found ${cards.length}`);
  const assertAmount = (node, planId, interval, label) => {
    const expected = expectedPlanAmounts[planId]?.[currency]?.[interval];
    if (
      !expected ||
      node?.attrs["data-currency"] !== currency ||
      node?.attrs["data-amount-minor"] !== String(expected)
    )
      issues.push(
        `${label}: ${planId}/${interval} must equal approved ${currency} minor amount ${expected}`,
      );
    if (
      node &&
      htmlText(node.body).split(" / ")[0] !== priceDisplay(expected, locale)
    )
      issues.push(
        `${label}: ${planId}/${interval} display does not match approved formatted amount ${priceDisplay(expected, locale)}`,
      );
  };
  for (const planId of Object.keys(expectedPlanAmounts)) {
    const matches = cards.filter(
      (card) => card.attrs["data-plan-id"] === planId,
    );
    if (matches.length !== 1) {
      issues.push(`expected exactly one canonical ${planId} card`);
      continue;
    }
    for (const interval of ["month", "year"]) {
      const prices = blocks(matches[0].body, "p").filter(
        (price) => price.attrs["data-billing-price"] === interval,
      );
      if (prices.length !== 1) {
        issues.push(`missing unique ${planId}/${interval} card price`);
        continue;
      }
      const price = prices[0];
      const amount = blocks(price.body, "strong")[0];
      assertAmount(
        { attrs: price.attrs, body: amount?.body || "" },
        planId,
        interval,
        "card",
      );
      if ("hidden" in price.attrs !== (interval === "year"))
        issues.push(
          `${planId}/${interval} no-JS visibility must default to monthly billing`,
        );
      const period =
        interval === "year"
          ? locale === "vi"
            ? "tài khoản/năm"
            : "acc/year"
          : locale === "vi"
            ? "tài khoản/tháng"
            : "acc/month";
      const joinedPrice = decodeHtml(price.body.replace(/<[^>]*>/g, ""))
        .replace(/[\u00a0\u202f]/g, " ")
        .trim();
      const expected = expectedPlanAmounts[planId][currency][interval];
      if (joinedPrice !== `${priceDisplay(expected, locale)}/${period}`)
        issues.push(`${planId}/${interval} account/period unit or slash spacing is not localized`);
    }
    const card = matches[0];
    const ownDialogs = blocks(card.body, "dialog").filter((node) =>
      /(?:^|\s)checkout-dialog(?:\s|$)/.test(node.attrs.class || ""),
    );
    const ownIslands = checkoutIslands(card.body);
    if (planId === "starter") {
      if (ownDialogs.length !== 1 || ownIslands.length !== 1)
        issues.push("Starter card must own the only checkout island/dialog");
      const fallbacks = blocks(card.body, "noscript").flatMap((node) => blocks(node.body, "a"));
      if (fallbacks.length !== 1 || fallbacks[0].attrs.href !== contactHref)
        issues.push("Starter no-JS fallback must link to localized /contact");
    } else {
      if (ownDialogs.length || ownIslands.length)
        issues.push(`${planId} card must not render a checkout island/dialog`);
      const links = blocks(card.body, "a").filter((node) =>
        /(?:^|\s)btn-outline(?:\s|$)/.test(node.attrs.class || ""),
      );
      const label = locale === "vi" ? "Liên hệ VLABS" : "Contact VLABS";
      if (links.length !== 1 || links[0].attrs.href !== contactHref || links[0].text !== label)
        issues.push(`${planId} CTA must be the localized Contact VLABS link to /contact`);
    }
    if (blocks(card.body, "a").some((node) => (node.attrs.href || "").includes("/contact#demo")))
      issues.push(`${planId} card must not link to /contact#demo`);
  }
  if (base === "/pricing") {
    const table = blocks(html, "table").find((node) =>
      /(?:^|\s)plan-table(?:\s|$)/.test(node.attrs.class || ""),
    );
    if (!table) issues.push("missing plan comparison table");
    for (const [interval, kind] of [
      ["month", "monthly_price"],
      ["year", "yearly_price"],
    ]) {
      const rows = blocks(table?.body || "", "tr").filter(
        (row) => row.attrs["data-comparison-kind"] === kind,
      );
      if (rows.length !== 1) {
        issues.push(
          `comparison must expose one approved ${interval} price row (${kind}); found ${rows.length}`,
        );
        continue;
      }
      const cells = blocks(rows[0].body, "td");
      if (cells.length !== 3)
        issues.push(
          `comparison ${interval} row needs three canonical plan cells`,
        );
      for (const planId of Object.keys(expectedPlanAmounts)) {
        const matching = cells.filter(
          (cell) => cell.attrs["data-plan-id"] === planId,
        );
        if (matching.length !== 1)
          issues.push(`comparison ${interval} missing unique ${planId} cell`);
        else assertAmount(matching[0], planId, interval, "comparison");
      }
    }
  }
  const note = blocks(html, "p").filter(
    (node) => "data-billing-note" in node.attrs,
  );
  if (note.length !== 1) issues.push("missing unique live billing note");
  else
    for (const interval of ["month", "year"]) {
      const text = note[0].attrs[`data-${interval}-note`] || "";
      const period = interval === "year" ? "year" : "month";
      const disclosed = locale === "en"
        ? /USD.*PayPal/.test(text) &&
          new RegExp(`subscription renews automatically each ${period} until it is cancelled`, "i").test(text) &&
          (interval !== "year" || /full annual amount is charged once per year/i.test(text))
        : (interval === "year"
            ? /thanh toán trước toàn bộ số tiền.*VND.*SePay/i.test(text)
            : /thanh toán trước.*một lần.*VND.*SePay/i.test(text)) &&
          new RegExp(`kỳ sử dụng một ${interval === "year" ? "năm" : "tháng"}`).test(text) &&
          /chủ động lựa chọn gia hạn.*không tự động thu tiền/i.test(text) &&
          (interval !== "year" || /toàn bộ số tiền/i.test(text));
      if (!disclosed)
        issues.push(
          `${interval} billing note lacks ${locale === "vi" ? "SePay/VND one-time/manual" : "PayPal/USD automatic"} disclosure`,
        );
    }
  if (note.length === 1 && note[0].text !== note[0].attrs["data-month-note"])
    issues.push("no-JS billing note must describe selected monthly price");
  const rate = blocks(html, "p").filter(
    (node) => "data-fixed-rate" in node.attrs,
  );
  if (
    rate.length !== 1 ||
    /1 USD\s*=\s*26[,.]000 VND/.test(rate[0].text) ||
    !(locale === "vi"
      ? /Giá USD được thanh toán bằng USD.*giá VND được thanh toán bằng VND theo mức niêm yết.*độc lập.*không quy đổi/.test(rate[0].text)
      : /USD prices are billed in USD.*VND prices are billed in VND as listed.*independently.*not converted/i.test(rate[0].text))
  )
    issues.push("independent USD/VND listed-price billing disclosure missing or contradicts pricing authority");
  const dialogs = blocks(html, "dialog").filter((node) =>
    /(?:^|\s)checkout-dialog(?:\s|$)/.test(node.attrs.class || ""),
  );
  const islands = checkoutIslands(html);
  if (islands.length !== 1)
    issues.push("expected one Starter checkout island");
  else {
    let props;
    try { props = JSON.parse(decodeHtml(islands[0].props)); } catch {}
    const value = (key) => Array.isArray(props?.[key]) ? props[key][1] : props?.[key];
    if (
      value("planId") !== "starter" || value("locale") !== locale ||
      value("monthlyAmountMinor") !== expectedPlanAmounts.starter[currency].month ||
      value("yearlyAmountMinor") !== expectedPlanAmounts.starter[currency].year
    ) issues.push("Starter checkout props must carry approved localized month/year minor amounts and immutable ID");
  }
  if (dialogs.length !== 1)
    issues.push("expected one Starter checkout dialog");
  else {
    const dialog = dialogs[0];
    if (dialog.attrs.lang !== locale)
      issues.push("checkout dialog language must match page");
    if (locale === "vi") {
      if (/\b(?:USD|Stripe|PayPal)\b|\$/i.test(dialog.text))
        issues.push(
          "Vietnamese checkout must not claim USD, Stripe, or PayPal",
        );
      if (
        !/một lần.*VND.*SePay.*chủ động lựa chọn gia hạn.*không tự động thu tiền/.test(
          dialog.text,
        )
      )
        issues.push(
          "Vietnamese checkout lacks one-time/manual SePay disclosure",
        );
      if (
        !dialog.text.includes(
          priceDisplay(expectedPlanAmounts.starter.vnd.month, locale),
        )
      )
        issues.push("Vietnamese checkout monthly amount differs from card");
    } else {
      if (
        !/USD per month.*billed through PayPal.*subscription renews automatically each month until it is cancelled/.test(
          dialog.text,
        )
      )
        issues.push(
          "English checkout lacks automatic PayPal subscription disclosure",
        );
      if (/\b(?:Stripe|SePay)\b/i.test(dialog.text))
        issues.push("English checkout names wrong payment provider");
      if (
        !dialog.text.includes(
          priceDisplay(expectedPlanAmounts.starter.usd.month, locale),
        )
      )
        issues.push("English checkout monthly amount differs from card");
    }
  }
  return issues;
}

function formIssues(html, route, siteUrl) {
  const issues = [];
  const locale = /^\/vi(?:\/|$)/.test(route) ? "vi" : "en";
  for (const form of blocks(html, "form").filter(
    (node) => "data-enquiry-form" in node.attrs,
  )) {
    let action;
    try {
      action = new URL(form.attrs.action, new URL(route, siteUrl));
    } catch {}
    if (
      action?.origin !== new URL(siteUrl).origin ||
      action.pathname !== `/api/${form.attrs["data-enquiry-form"]}` ||
      action.searchParams.getAll("lang").length !== 1 ||
      action.searchParams.get("lang") !== locale ||
      form.attrs.method?.toUpperCase() !== "POST"
    )
      issues.push(
        "native enquiry action must be unprefixed same-origin locale-aware POST",
      );
    if (form.attrs.lang !== locale || form.attrs["data-locale"] !== locale)
      issues.push("enquiry form language must match page");
    const inputs = [...form.body.matchAll(/<input\b[^>]*>/g)].map(([tag]) =>
      attributes(tag),
    );
    const localeFields = inputs.filter((input) => input.name === "locale");
    if (
      localeFields.length !== 1 ||
      localeFields[0].type !== "hidden" ||
      localeFields[0].value !== locale
    )
      issues.push("native enquiry needs one hidden validated locale field");
    let copy;
    try {
      copy = JSON.parse(form.attrs["data-form-copy"]);
    } catch {}
    if (
      !copy ||
      copy.name !== (locale === "vi" ? "Họ và tên" : "Full Name") ||
      copy.email !== (locale === "vi" ? "Địa chỉ email" : "Email Address")
    )
      issues.push("serialized enquiry copy is missing or English fallback");
    if (
      locale === "vi" &&
      /All fields are required|Full Name|Email Address|Phone Number|Prefer email/.test(
        form.text,
      )
    )
      issues.push("English enquiry body fallback remains");
  }
  return issues;
}

function fallbackIssues(englishHtml, vietnameseHtml) {
  const issues = [];
  const enMain = blocks(englishHtml, "main")[0]?.body || "";
  const viMain = blocks(vietnameseHtml, "main")[0]?.body || "";
  if (!enMain || !viMain) issues.push("missing counterpart main content");
  if (
    !/[ăâđêôơưàảãáạằẳẵắặầẩẫấậèẻẽéẹềểễếệìỉĩíịòỏõóọồổỗốộờởỡớợùủũúụừửữứựỳỷỹýỵ]/i.test(
      htmlText(viMain),
    )
  )
    issues.push("Vietnamese main has no translated prose");
  if (htmlText(enMain) === htmlText(viMain))
    issues.push("Vietnamese main is English fallback");
  for (const tag of ["title", "h1"])
    if (
      blocks(englishHtml, tag)[0]?.text === blocks(vietnameseHtml, tag)[0]?.text
    )
      issues.push(`Vietnamese ${tag} is English fallback`);
  const descriptions = (html) =>
    [...html.matchAll(/<meta\b[^>]*>/g)]
      .map(([tag]) => attributes(tag))
      .find((meta) => meta.name === "description")?.content;
  if (descriptions(englishHtml) === descriptions(vietnameseHtml))
    issues.push("Vietnamese metadata description is English fallback");
  // Only sentence-length prose can be a leaked English paragraph. Proper
  // names, email addresses and other language-invariant labels are identical
  // in both locales by design, so they must not count as fallback.
  const isProse = (text) => {
    const words = text.split(/\s+/).filter(Boolean);
    return (
      words.length >= 4 &&
      words.some((word) => /^[a-z]/.test(word)) &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text.trim())
    );
  };
  const paragraphs = new Set(
    blocks(enMain, "p")
      .map((node) => node.text)
      .filter(isProse),
  );
  for (const paragraph of blocks(viMain, "p"))
    if (paragraphs.has(paragraph.text))
      issues.push(
        `English paragraph remains in Vietnamese body: ${paragraph.text.slice(0, 100)}`,
      );
  const enArticle = blocks(enMain, "article").find((node) =>
    /(?:^|\s)content(?:\s|$)/.test(node.attrs.class || ""),
  );
  const viArticle = blocks(viMain, "article").find((node) =>
    /(?:^|\s)content(?:\s|$)/.test(node.attrs.class || ""),
  );
  if (enArticle && viArticle && enArticle.text === viArticle.text)
    issues.push(
      "Vietnamese generated Markdown body is English fallback despite localized frontmatter",
    );
  return issues;
}

function protectedReferences(html, pageUrl, siteUrl) {
  const assets = new Set();
  const contacts = new Set();
  const external = new Set();
  for (const [tag] of html.matchAll(
    /<(?:a|link|script|img|source|video|audio|iframe)\b[^>]*>/g,
  )) {
    const attrs = attributes(tag);
    for (const key of ["href", "src", "poster"])
      if (attrs[key]) {
        let url;
        try {
          url = new URL(attrs[key], pageUrl);
        } catch {
          continue;
        }
        if (url.protocol === "mailto:" || url.protocol === "tel:")
          contacts.add(`${url.protocol}${url.pathname}`);
        if (
          /^https?:$/.test(url.protocol) &&
          url.origin !== new URL(siteUrl).origin
        )
          external.add(url.href);
        if (
          url.origin === new URL(siteUrl).origin &&
          (/^\/(?:images|scripts|_astro|assets)(?:\/|$)/.test(url.pathname) ||
            /\.(?!html?$)[^/]+$/.test(url.pathname))
        )
          assets.add(`${url.pathname}${url.search}${url.hash}`);
      }
  }
  return {
    assets: [...assets].sort(),
    contacts: [...contacts].sort(),
    external: [...external].sort(),
  };
}

function markdownProbe(source) {
  const body = source.replace(/^---\r?\n[\s\S]*?\r?\n---\s*/, "");
  const normalize = (value) =>
    htmlText(
      value.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[*_`]/g, ""),
    );
  const heading = normalize(body.match(/^#{2,6}\s+(.+)$/m)?.[1] || "");
  const paragraph = normalize(
    body
      .split(/\r?\n\s*\r?\n/)
      .find(
        (part) =>
          part.trim() && !/^(?:#{1,6}\s|[-*]\s|\d+\.\s)/.test(part.trim()),
      ) || "",
  );
  return { heading, paragraph, body: normalize(body) };
}

async function checkReference(value, sourceFile, pageUrl) {
  if (!value || /^(?:data:|mailto:|tel:|javascript:)/i.test(value)) return;
  let url;
  try {
    url = new URL(value, pageUrl);
  } catch {
    failures.add(`${sourceFile}: invalid URL ${value}`);
    return;
  }
  if (url.origin !== site.origin || url.pathname.startsWith("/api/")) return;
  const target = await resolveBuiltFile(url);
  if (!target) {
    failures.add(`${sourceFile}: missing local target ${value}`);
    return;
  }
  if (url.hash && target.endsWith(".html")) {
    const targetHtml = await readFile(target, "utf8");
    const fragment = decodeURIComponent(url.hash.slice(1));
    const ids = Array.from(
      targetHtml.matchAll(/\bid=["']([^"']+)["']/g),
      (m) => m[1],
    );
    if (!ids.includes(fragment)) {
      failures.add(`${sourceFile}: missing anchor ${value}`);
    }
  }
}

let files;
try {
  files = await filesIn(buildRoot);
} catch {
  console.error(
    "No static build found. Run pnpm build before checking the site.",
  );
  process.exit(1);
}
const pages = files.filter((filename) => filename.endsWith(".html"));
const expectedRoutes = new Set(
  englishRoutes.flatMap((route) => [route, localeRoute(route, "vi")]),
);
for (const filename of pages) {
  const relative = path.relative(buildRoot, filename).replaceAll("\\", "/").replace(/^client\//, "");
  if (/^\/(?:vi\/)?(?:about|careers|case-study)(?:\/|$)/.test(routeForRelative(relative)))
    failures.add(`${relative}: withdrawn section must not be emitted as static HTML.`);
}
const expectedSitemapUrls = new Set(
  englishRoutes
    .filter((route) => !["/404", "/privacy-policy", "/term-and-condition"].includes(route))
    .flatMap((route) => [route, localeRoute(route, "vi")])
    .map((route) => new URL(route, site).href),
);
if (expectedSitemapUrls.size !== 12)
  failures.add(`Expected 12 indexable route URLs, found ${expectedSitemapUrls.size}.`);
for (const filename of await filesIn(path.join(projectRoot, "src"))) {
  if (path.basename(filename) === ".env" || path.basename(filename).startsWith(".env.")) continue;
  if ((await readFile(filename, "utf8")).includes("dateModified"))
    failures.add(`${path.relative(projectRoot, filename)}: untracked dateModified claim is forbidden.`);
}
try {
  const clientSitemap = path.join(buildRoot, "client", "sitemap-0.xml");
  const sitemapFile = files.includes(clientSitemap) ? clientSitemap : path.join(buildRoot, "sitemap-0.xml");
  const sitemap = await readFile(sitemapFile, "utf8");
  const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => decodeHtml(match[1]));
  const seen = new Set(urls);
  if (urls.length !== 12 || seen.size !== 12 || [...seen].some((url) => !expectedSitemapUrls.has(url)))
    failures.add("Static sitemap must contain exactly 12 unique indexable canonical URLs and no withdrawn sections.");
} catch (error) {
  failures.add(`Cannot verify static sitemap: ${error.message}`);
}

if (!pages.length) {
  const serverEntry = path.join(buildRoot, "server", "entry.mjs");
  const hasServerEntry = await access(serverEntry)
    .then(() => true)
    .catch(() => false);
  if (!hasServerEntry) {
    failures.add(
      "Build contains no static pages and no Node SSR server entrypoint.",
    );
  }

  const startScript = String(
    (await importPackageJson()).scripts?.start ?? "",
  );
  if (!/dist\/server\/entry\.mjs/.test(startScript)) {
    failures.add(
      "package.json start script must run the Node SSR entrypoint dist/server/entry.mjs.",
    );
  }

  for (const filename of files.filter((file) => file.endsWith(".css"))) {
    const relative = path.relative(buildRoot, filename);
    const cssUrl = new URL(`/${relative}`, site);
    const css = await readFile(filename, "utf8");
    for (const match of css.matchAll(/url\(\s*["']?([^"'\s)]+)["']?\s*\)/g)) {
      await checkReference(match[1], relative, cssUrl);
    }
  }

  if (hasServerEntry) {
    try {
      // GET-only local verification covers JSON.parse, FAQ/price parity,
      // content-derived Markdown, sitemap alternates, and deliberate noindex.
      const artifactDir = "/tmp/opencode/source-cleanup/seo-verification/runtime";
      await verifySeoRuntime({ projectRoot, port: 4350, artifactDir });
      for (const [filename, copyright] of [
        ["worker-runtime-home.html", "© 2026 Smart Learning Technology Solution. All Rights Reserved."],
        ["worker-runtime-vi-pricing.html", "© 2026 Smart Learning Technology Solution. Bảo lưu mọi quyền."]
      ]) {
        const html = await readFile(path.join(artifactDir, filename), "utf8");
        const footer = blocks(html, "footer")[0]?.body || "";
        if (!blocks(footer, "p").some((paragraph) => paragraph.text === copyright))
          failures.add(`${filename}: missing footer copyright: ${copyright}`);
      }
    } catch (error) {
      failures.add(error.message);
    }
  }

  if (failures.size) {
    console.error([...failures].sort().join("\n"));
    console.error(`Site check failed: ${failures.size} SSR/output issue(s).`);
    process.exitCode = 1;
  } else {
    console.log(
      `Site check passed: ${expectedSitemapUrls.size} indexable routes / sitemap URLs; ${expectedRoutes.size} retained HTML routes including legal and 404 pages; withdrawn sections return localized HTTP 404 without static HTML; Node SSR entrypoint and static CSS asset references verified.`,
    );
  }
  process.exit();
}

async function importPackageJson() {
  return JSON.parse(await readFile(path.join(projectRoot, "package.json"), "utf8"));
}

if (pages.length !== expectedRoutes.size)
  failures.add(
    `Expected ${expectedRoutes.size} static pages (${englishRoutes.length} EN + ${englishRoutes.length} VI including 404), found ${pages.length}.`,
  );
const builtPages = new Map();

for (const filename of pages) {
  const relative = path.relative(buildRoot, filename);
  // /404 resolves to English 404.html, never /404.html as the canonical URL.
  const route = routeForRelative(relative);
  const pageUrl = new URL(route, site);
  const html = await readFile(filename, "utf8");
  if (builtPages.has(route))
    failures.add(`${relative}: duplicate static route ${route}`);
  builtPages.set(route, { html, filename, relative, pageUrl });
  if (!expectedRoutes.has(route))
    failures.add(
      `${relative}: unexpected draft/index/API/SSR or changed canonical route ${route}`,
    );
  for (const issue of [
    ...metadataIssues(html, route, site.href),
    ...chromeIssues(html, route, site.href, menu),
    ...pricingIssues(html, route),
    ...formIssues(html, route, site.href),
  ])
    failures.add(`${relative}: ${issue}`);
  const h1Count = (html.match(/<h1\b/g) || []).length;
  if (h1Count !== 1)
    failures.add(`${relative}: expected 1 h1, found ${h1Count}`);
  if (!/<title>[^<]+<\/title>/.test(html))
    failures.add(`${relative}: missing title`);
  if (/lorem ipsum|this is meta description/i.test(html)) {
    failures.add(`${relative}: placeholder content remains`);
  }

  for (const match of html.matchAll(
    /<(?:a|link|script|img|source|video|audio|iframe|form)\b[^>]*>/g,
  )) {
    const tag = match[0];
    const attrs = attributes(tag);
    for (const key of ["href", "src", "poster", "action"]) {
      if (key in attrs) await checkReference(attrs[key], relative, pageUrl);
    }
    if (
      tag.startsWith("<a") &&
      attrs.href &&
      !/^\s*#/.test(attrs.href) &&
      !("download" in attrs)
    ) {
      let target;
      try {
        target = new URL(attrs.href, pageUrl);
      } catch {}
      if (
        target?.origin === site.origin &&
        !target.pathname.startsWith("/api/") &&
        (await resolveBuiltFile(target))?.endsWith(".html") &&
        !("data-locale-choice" in attrs)
      ) {
        const locale = /^\/vi(?:\/|$)/.test(route) ? "vi" : "en";
        if ((/^\/vi(?:\/|$)/.test(target.pathname) ? "vi" : "en") !== locale)
          failures.add(
            `${relative}: internal page/Markdown link crosses locale ${attrs.href}`,
          );
        const markers = target.searchParams.getAll("lang");
        if (markers.length && (markers.length !== 1 || markers[0] !== locale))
          failures.add(
            `${relative}: invalid manual marker on localized page link ${attrs.href}`,
          );
      }
    }
    if (tag.startsWith("<img")) {
      if (!("alt" in attrs))
        failures.add(`${relative}: image missing alt (${attrs.src})`);
      if (!Number(attrs.width) || !Number(attrs.height)) {
        failures.add(`${relative}: image missing dimensions (${attrs.src})`);
      }
    }
  }
}

for (const route of expectedRoutes)
  if (!builtPages.has(route))
    failures.add(`Missing static counterpart route ${route}.`);
for (const englishRoute of englishRoutes) {
  const english = builtPages.get(englishRoute);
  const vietnamese = builtPages.get(localeRoute(englishRoute, "vi"));
  if (!english || !vietnamese) continue;
  for (const issue of fallbackIssues(english.html, vietnamese.html))
    failures.add(`${vietnamese.relative}: ${issue}`);
  const enProtected = protectedReferences(
    english.html,
    english.pageUrl,
    site.href,
  );
  const viProtected = protectedReferences(
    vietnamese.html,
    vietnamese.pageUrl,
    site.href,
  );
  if (JSON.stringify(enProtected.assets) !== JSON.stringify(viProtected.assets))
    failures.add(
      `${vietnamese.relative}: local assets changed between counterparts`,
    );
  // Subject copy may be translated; mailto/tel destination itself must not change.
  if (
    JSON.stringify(enProtected.contacts) !==
    JSON.stringify(viProtected.contacts)
  )
    failures.add(
      `${vietnamese.relative}: mailto/tel destinations changed between counterparts`,
    );
  if (
    JSON.stringify(enProtected.external) !==
    JSON.stringify(viProtected.external)
  )
    failures.add(
      `${vietnamese.relative}: external URLs changed between counterparts`,
    );
}

for (const [collection, slug] of [
  ["pages", "privacy-policy"],
  ["pages", "term-and-condition"],
  ["careers", "marketing-specialist"],
  ["careers", "seo-product-manager"],
  ["careers", "senior-frontend-developer"],
  ["careers", "ux-ui-designer"],
]) {
  const route = collection === "pages" ? `/${slug}` : `/careers/${slug}`;
  const probes = {};
  for (const locale of ["en", "vi"]) {
    const contentFile = path.join(
      projectRoot,
      "src/content",
      collection,
      locale === "vi" ? "vi" : "",
      `${slug}.md`,
    );
    try {
      probes[locale] = markdownProbe(await readFile(contentFile, "utf8"));
    } catch {
      failures.add(`Missing ${locale} Markdown source for ${route}.`);
      continue;
    }
    const page = builtPages.get(localeRoute(route, locale));
    if (!page) continue;
    const article = blocks(page.html, "article").find((node) =>
      /(?:^|\s)content(?:\s|$)/.test(node.attrs.class || ""),
    );
    if (
      !article ||
      !probes[locale].heading ||
      !probes[locale].paragraph ||
      !article.text.includes(probes[locale].heading) ||
      !article.text.includes(probes[locale].paragraph)
    )
      failures.add(
        `${page.relative}: generated Markdown must render selected ${locale} entry heading and body, not only translated frontmatter`,
      );
  }
  if (probes.en && probes.vi && probes.en.body === probes.vi.body)
    failures.add(`${route}: Vietnamese Markdown source is English fallback.`);
}

for (const filename of files.filter((file) => file.endsWith(".css"))) {
  const relative = path.relative(buildRoot, filename);
  const cssUrl = new URL(`/${relative}`, site);
  const css = await readFile(filename, "utf8");
  for (const match of css.matchAll(/url\(\s*["']?([^"'\s)]+)["']?\s*\)/g)) {
    await checkReference(match[1], relative, cssUrl);
  }
}

if (failures.size) {
  console.error([...failures].sort().join("\n"));
  console.error(
    `Site check failed: ${failures.size} issue(s) across ${pages.length} pages.`,
  );
  process.exitCode = 1;
} else {
  console.log(
    `Site check passed: ${pages.length} pages; original links/assets, headings, image metadata, and placeholder checks; bilingual routes, metadata/alternates, menus, Markdown, locale-aware forms, and approved monthly/yearly pricing/provider contracts.`,
  );
}
