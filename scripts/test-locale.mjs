import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path, { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createContext, runInContext } from "node:vm";
import { parseFrontmatter } from "@astrojs/markdown-remark";
import ts from "typescript";

// No server, browser, environment file, network, or payment provider is used.
// Override only the sources when comparing with an archived pre-feature tree:
// LOCALE_TEST_SOURCE_ROOT=/path/to/before node --test scripts/test-locale.mjs
const root = fileURLToPath(new URL("../", import.meta.url));
const sourceRoot = process.env.LOCALE_TEST_SOURCE_ROOT || root;
const paths = {
  layout: "src/layouts/Base.astro",
  controller: "public/scripts/locale.js",
  i18n: "src/lib/i18n.ts",
  currency: "src/lib/currency.ts",
  pricing: "src/lib/locale-pricing.ts",
  messages: "src/lib/messages.ts",
  content: "src/lib/contentParser.astro",
  markdown: "src/lib/remark-locale-links.mjs",
  selector: "src/layouts/components/LanguageSelector.astro",
  enquiry: "src/layouts/components/EnquiryForm.astro",
  checkout: "src/layouts/components/PricingCheckout.tsx",
  card: "src/layouts/components/PricingCard.astro",
  config: "src/config/config.json",
  menu: "src/config/menu.json",
  siteChecker: "scripts/check-site.mjs",
};
const sources = Object.fromEntries(
  await Promise.all(
    Object.entries(paths).map(async ([key, path]) => [
      key,
      await readFile(resolve(sourceRoot, path), "utf8").catch((error) => {
        if (error.code !== "ENOENT") throw error;
        return null;
      }),
    ]),
  ),
);

function required(key) {
  assert.ok(
    sources[key]?.trim(),
    `Expected bilingual feature source ${paths[key]} is missing in ${sourceRoot}; this behavior cannot execute without it`,
  );
  return sources[key];
}

function frontmatter(source) {
  const result = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  assert.ok(result, "Expected executable Astro frontmatter");
  return result[1];
}

function localeBootstrap() {
  const result = required("layout").match(
    /<script\b(?=[^>]*\bdata-locale-bootstrap\b)[^>]*>([\s\S]*?)<\/script>/,
  );
  assert.ok(
    result?.[1]?.trim(),
    "Expected synchronous pre-paint locale bootstrap is missing",
  );
  return result[1];
}

// Existing TypeScript transpiler executes only the selected pure modules.
// Imports are allowlisted; Astro content APIs receive in-memory collection data.
function moduleLoader(overrides = {}, globals = {}) {
  const cache = new Map();
  const byPath = new Map(
    Object.entries(paths).map(([key, path]) => [path, key]),
  );
  const load = (key) => {
    if (cache.has(key)) return cache.get(key);
    const source = required(key);
    if (paths[key].endsWith(".json")) {
      const result = { exports: JSON.parse(source) };
      cache.set(key, result);
      return result;
    }
    const module = { exports: {} };
    const context = createContext({
      exports: module.exports,
      module,
      URL,
      Intl,
      ...globals,
      require(specifier) {
        if (Object.hasOwn(overrides, specifier)) return overrides[specifier];
        const relative = specifier.replace(/^@\//, "src/");
        const dependency = byPath.get(relative) || byPath.get(`${relative}.ts`);
        assert.ok(
          dependency,
          `Offline test forbids module import: ${specifier}`,
        );
        return load(dependency).exports;
      },
    });
    const result = { exports: module.exports, context };
    cache.set(key, result);
    const code = ts.transpileModule(
      paths[key].endsWith(".astro") ? frontmatter(source) : source,
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          esModuleInterop: true,
        },
        fileName: paths[key].replace(/\.(?:astro|mjs)$/, ".ts"),
      },
    ).outputText;
    runInContext(code, context, { filename: paths[key] });
    result.exports = module.exports;
    return result;
  };
  return (key) => load(key).exports;
}

const plain = (value) => JSON.parse(JSON.stringify(value));
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};

class FixtureNode {
  children = [];
  listeners = new Map();
  parentNode = null;
  ownerDocument = null;

  append(...children) {
    for (const child of children) {
      child.parentNode = this;
      const attach = (node) => {
        node.ownerDocument = this.ownerDocument || this;
        node.children.forEach(attach);
      };
      attach(child);
      this.children.push(child);
    }
    return this;
  }

  contains(node) {
    return node === this || this.children.some((child) => child.contains(node));
  }

  addEventListener(type, callback, options = {}) {
    const listeners = this.listeners.get(type) || [];
    listeners.push({
      callback,
      once: options?.once === true,
      capture: options === true || options?.capture === true,
    });
    this.listeners.set(type, listeners);
  }

  emit(type, event = {}) {
    event.type = type;
    event.target ??= this;
    event.defaultPrevented ??= false;
    const original = event.preventDefault;
    event.preventDefault = () => {
      event.defaultPrevented = true;
      original?.call(event);
    };
    for (const listener of [...(this.listeners.get(type) || [])]) {
      if (listener.once) {
        this.listeners.set(
          type,
          this.listeners.get(type).filter((entry) => entry !== listener),
        );
      }
      listener.callback(event);
    }
    return event;
  }

  querySelectorAll(selector) {
    const result = [];
    const visit = (node) => {
      for (const child of node.children) {
        if (child instanceof FixtureElement && child.matches(selector))
          result.push(child);
        visit(child);
      }
    };
    visit(this);
    return result;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }
}

class FixtureElement extends FixtureNode {
  focusCount = 0;

  constructor(tagName, attributes = {}) {
    super();
    this.tagName = tagName.toLowerCase();
    this.attributes = { ...attributes };
    this.dataset = new Proxy(
      {},
      {
        get: (_, key) =>
          this.getAttribute(
            `data-${String(key).replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`,
          ) ?? undefined,
        set: (_, key, value) => {
          this.setAttribute(
            `data-${String(key).replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`,
            value,
          );
          return true;
        },
      },
    );
  }

  getAttribute(name) {
    return Object.hasOwn(this.attributes, name)
      ? String(this.attributes[name])
      : null;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  removeAttribute(name) {
    delete this.attributes[name];
  }

  hasAttribute(name) {
    return Object.hasOwn(this.attributes, name);
  }

  get open() {
    return this.hasAttribute("open");
  }

  set open(value) {
    if (value) this.setAttribute("open", "");
    else this.removeAttribute("open");
  }

  get href() {
    return new URL(
      this.getAttribute("href"),
      this.ownerDocument.defaultView.location.href,
    ).href;
  }

  set href(value) {
    this.setAttribute("href", value);
  }

  matchesSimple(selector) {
    let matches = true;
    let rest = selector.replace(/^[\w-]+/, (tag) => {
      matches &&= this.tagName === tag.toLowerCase();
      return "";
    });
    rest = rest.replace(
      /\[([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\]\s]+)))?\]/g,
      (_, name, double, single, bare) => {
        matches &&= this.hasAttribute(name);
        const value = double ?? single ?? bare;
        if (value !== undefined) matches &&= this.getAttribute(name) === value;
        return "";
      },
    );
    assert.equal(
      rest,
      "",
      `Unsupported selector in native DOM fixture: ${selector}`,
    );
    return matches;
  }

  matches(selector) {
    return selector.split(",").some((group) => {
      const pieces = group.trim().split(/\s+/);
      if (!this.matchesSimple(pieces.pop())) return false;
      let ancestor = this.parentNode;
      for (const piece of pieces.reverse()) {
        while (
          ancestor instanceof FixtureElement &&
          !ancestor.matchesSimple(piece)
        )
          ancestor = ancestor.parentNode;
        if (!(ancestor instanceof FixtureElement)) return false;
        ancestor = ancestor.parentNode;
      }
      return true;
    });
  }

  closest(selector) {
    let node = this;
    while (node instanceof FixtureElement) {
      if (node.matches(selector)) return node;
      node = node.parentNode;
    }
    return null;
  }

  focus() {
    this.focusCount += 1;
    this.ownerDocument.activeElement = this;
  }
}

function createPage(options = {}) {
  const script = required("controller");
  const document = new FixtureNode();
  const window = new FixtureNode();
  document.ownerDocument = document;
  document.defaultView = window;
  document.readyState = options.readyState || "complete";
  window.location = {
    href:
      options.url ||
      "https://vlabs.example.test/pricing?billing=year&utm_source=offline#pricing",
    replace(href) {
      navigations.push(["replace", String(href)]);
    },
    assign(href) {
      navigations.push(["assign", String(href)]);
    },
  };
  const renderedLocale =
    options.renderedLocale ||
    (/^\/vi(?:\/|$)/.test(new URL(window.location.href).pathname)
      ? "vi"
      : "en");
  const html = new FixtureElement("html", {
    lang: renderedLocale,
    "data-currency": renderedLocale === "vi" ? "vnd" : "usd",
    ...options.rootAttributes,
  });
  document.documentElement = html;
  document.append(html);

  const selector = new FixtureElement("details", {
    "data-locale-selector": "",
  });
  const summary = new FixtureElement("summary");
  const path =
    new URL(window.location.href).pathname
      .replace(/^\/vi(?=\/|$)/, "")
      .replace(/\/+$/, "") || "/";
  const choices = Object.fromEntries(
    ["en", "vi"].map((locale) => {
      const choicePath =
        locale === "vi" ? `/vi${path === "/" ? "" : path}` : path;
      return [
        locale,
        new FixtureElement("a", {
          href: `${choicePath}?lang=${locale}`,
          "data-locale-choice": locale,
          lang: locale,
          hreflang: locale,
        }),
      ];
    }),
  );
  for (const choice of Object.values(choices))
    choice.append(new FixtureElement("span"));
  selector.append(summary, ...Object.values(choices));
  const links = (options.links || []).map(
    (attributes) => new FixtureElement("a", attributes),
  );
  html.append(selector, ...links);

  const form = new FixtureElement("form", {
    ...(options.busyForm ? { "aria-busy": "true" } : {}),
    ...(options.dirtyForm ? { "data-locale-dirty": "true" } : {}),
    ...(options.submittedForm ? { "data-locale-submitted": "true" } : {}),
  });
  const fields = (
    options.fields || [
      { name: "name" },
      { name: "email" },
      { name: "message", tag: "textarea" },
    ]
  ).map((field) => {
    const node = new FixtureElement(field.tag || "input", {
      name: field.name || "name",
    });
    Object.assign(
      node,
      {
        type: "text",
        value: "",
        defaultValue: "",
        checked: false,
        defaultChecked: false,
      },
      field,
    );
    return node;
  });
  form.append(...fields);
  const formActions = [];
  for (const action of ["reset", "submit", "requestSubmit"])
    form[action] = () => {
      formActions.push(action);
      assert.fail(`Locale controller must not ${action} forms`);
    };
  const dialog = new FixtureElement("dialog");
  dialog.open = options.dialogOpen || false;
  const trigger = new FixtureElement("button", { "aria-haspopup": "dialog" });
  trigger.append(new FixtureElement("span"));
  html.append(form, dialog, trigger);

  const values = new Map(options.storageValues || []);
  if (options.saved !== undefined) values.set("vlabs-locale-v1", options.saved);
  const denied = {
    access: options.denyAccess || false,
    get: options.denyGet || false,
    set: options.denySet || false,
  };
  const reads = [];
  const writes = [];
  const storage = {
    getItem(key) {
      reads.push(key);
      if (denied.get) throw new Error("Fixture storage read denied");
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      if (denied.set) throw new Error("Fixture storage write denied");
      values.set(key, String(value));
      writes.push([key, String(value)]);
    },
  };
  Object.defineProperty(window, "localStorage", {
    get() {
      if (denied.access) throw new Error("Fixture localStorage getter denied");
      return storage;
    },
  });

  const navigations = [];
  const historyCalls = [];
  window.history = {
    state: { fixture: true },
    replaceState(...args) {
      historyCalls.push(args);
    },
    pushState(...args) {
      historyCalls.push(args);
    },
  };
  let now = 0;
  let nextTimer = 1;
  const timers = new Map();
  window.setTimeout = (callback, delay) => {
    const id = nextTimer++;
    timers.set(id, { callback, at: now + delay, delay });
    return id;
  };
  window.clearTimeout = (id) => timers.delete(id);
  const requests = [];
  const fetch = (url, init) => {
    assert.equal(
      url,
      "/api/locale",
      "Only same-origin locale lookup is allowed by this offline fixture",
    );
    const response = deferred();
    const jsonStarted = deferred();
    const request = {
      url,
      init,
      jsonCalls: 0,
      tail: response.promise,
      jsonStarted: jsonStarted.promise,
    };
    // Trace the actual then/catch/finally chain, so tests await completion rather
    // than sleeping or guessing how many microtasks the controller requires.
    const trace = (promise) =>
      Object.fromEntries(
        ["then", "catch", "finally"].map((method) => [
          method,
          (...args) => {
            request.tail = promise[method](...args);
            return trace(request.tail);
          },
        ]),
      );
    request.deliver = (result, responseOptions = {}) =>
      response.resolve({
        ok: responseOptions.ok ?? true,
        json() {
          request.jsonCalls += 1;
          jsonStarted.resolve();
          if (responseOptions.jsonError)
            return Promise.reject(responseOptions.jsonError);
          return responseOptions.jsonPromise || Promise.resolve(result);
        },
      });
    request.respond = async (result, responseOptions) => {
      request.deliver(result, responseOptions);
      await request.tail;
    };
    request.fail = async (error) => {
      response.reject(error);
      await request.tail;
    };
    requests.push(request);
    return trace(response.promise);
  };
  window.fetch = fetch;
  const navigatorReads = [];
  const navigator = {};
  for (const key of ["language", "languages", "userLanguage", "geolocation"])
    Object.defineProperty(navigator, key, {
      get() {
        navigatorReads.push(key);
        assert.fail(`Country routing must not read navigator.${key}`);
      },
    });
  window.navigator = navigator;
  const context = createContext({
    document,
    window,
    Node: FixtureNode,
    Element: FixtureElement,
    URL,
    AbortController,
    fetch,
    navigator,
  });
  return {
    document,
    window,
    html,
    selector,
    summary,
    choices,
    links,
    form,
    fields,
    dialog,
    trigger,
    storage,
    values,
    denied,
    reads,
    writes,
    requests,
    timers,
    navigations,
    historyCalls,
    navigatorReads,
    formActions,
    context,
    runBootstrap() {
      runInContext(localeBootstrap(), context, {
        filename: "Base.astro locale bootstrap",
      });
    },
    runController() {
      runInContext(script, context, { filename: paths.controller });
    },
    ready() {
      document.readyState = "interactive";
      document.emit("DOMContentLoaded");
    },
    click(locale, event = {}) {
      return document.emit("click", { target: choices[locale], ...event });
    },
    protect(type = "input", target = fields[0]) {
      return document.emit(type, { target });
    },
    advance(milliseconds) {
      now += milliseconds;
      for (const [id, timer] of [...timers])
        if (timer.at <= now) {
          timers.delete(id);
          timer.callback();
        }
    },
    externalPreference(
      value,
      { key = "vlabs-locale-v1", storageArea = storage } = {},
    ) {
      if (storageArea === storage) {
        if (key === null) values.clear();
        else if (value === null) values.delete(key);
        else values.set(key, value);
      }
      window.emit("storage", { key, storageArea, newValue: value });
    },
  };
}

function boot(options, { head = true } = {}) {
  const page = createPage(options);
  if (head) page.runBootstrap();
  page.runController();
  return page;
}

function assertNoNavigation(page) {
  assert.deepEqual(page.navigations, []);
  assert.deepEqual(page.historyCalls, []);
  assert.deepEqual(page.formActions, []);
}

function assertLookup(page) {
  assert.equal(page.requests.length, 1);
  const { url, init } = page.requests[0];
  assert.equal(url, "/api/locale");
  assert.equal(init.method, "GET");
  assert.equal(init.credentials, "same-origin");
  assert.equal(init.cache, "no-store");
  assert.equal(init.redirect, "error");
  assert.equal(init.signal.aborted, false);
  assert.equal(page.timers.size, 1);
  assert.equal([...page.timers.values()][0].delay, 5_000);
  assert.deepEqual(page.writes, []);
  assert.deepEqual(page.navigatorReads, []);
  return page.requests[0];
}

test("locale bootstrap is synchronous and inside head before deferred controller", () => {
  const layout = required("layout");
  const bootstrap = localeBootstrap();
  const tag = layout.match(
    /<script\b[^>]*\bdata-locale-bootstrap\b[^>]*>/,
  )?.[0];
  assert.equal((layout.match(/\bdata-locale-bootstrap\b/g) || []).length, 1);
  assert.match(tag, /\bis:inline\b/);
  assert.doesNotMatch(tag, /\b(?:defer|async|src|type)\b/);
  assert.ok(layout.indexOf("<head>") < layout.indexOf(tag));
  assert.ok(layout.indexOf(tag) < layout.indexOf("</head>"));
  assert.ok(
    layout.indexOf(tag) <
      layout.indexOf('<script is:inline defer src="/scripts/locale.js">'),
  );
  assert.match(bootstrap, /vlabs-locale-v1/);
  const page = createPage();
  const globals = Object.keys(page.context);
  page.runBootstrap();
  assert.deepEqual(Object.keys(page.context), globals);
  assert.deepEqual(page.requests, []);
  assert.equal(page.timers.size, 0);
});

for (const [name, url, saved, manual, source, target] of [
  [
    "unprefixed default",
    "/pricing?billing=year#pricing",
    undefined,
    "",
    "default",
    null,
  ],
  [
    "explicit Vietnamese",
    "/vi/pricing?billing=year#pricing",
    undefined,
    "",
    "path",
    null,
  ],
  [
    "saved Vietnamese before paint",
    "/pricing?billing=year#pricing",
    "vi",
    "vi",
    "storage",
    "/vi/pricing?billing=year#pricing",
  ],
  [
    "saved English beats Vietnamese path",
    "/vi/pricing?billing=year#pricing",
    "en",
    "en",
    "storage",
    "/pricing?billing=year#pricing",
  ],
  [
    "English marker beats saved Vietnamese and path",
    "/vi/pricing?billing=year&lang=en#pricing",
    "vi",
    "en",
    "query",
    "/pricing?billing=year&lang=en#pricing",
  ],
  [
    "Vietnamese marker beats saved English",
    "/pricing?billing=year&lang=vi#pricing",
    "en",
    "vi",
    "query",
    "/vi/pricing?billing=year&lang=vi#pricing",
  ],
  [
    "matching marker does not reload",
    "/vi/pricing?billing=year&lang=vi#pricing",
    "en",
    "vi",
    "query",
    null,
  ],
]) {
  test(`pre-paint precedence: ${name}`, () => {
    const page = createPage({ url: `https://vlabs.example.test${url}`, saved });
    page.runBootstrap();
    assert.equal(page.html.dataset.localeManual, manual);
    assert.equal(page.html.dataset.localeSource, source);
    assert.deepEqual(
      page.navigations,
      target ? [["replace", `https://vlabs.example.test${target}`]] : [],
    );
    assert.equal(page.html.dataset.localeRedirect, target ? "true" : undefined);
    assert.deepEqual(
      page.writes,
      source === "query" ? [["vlabs-locale-v1", manual]] : [],
    );
    assert.equal(page.requests.length, 0);
    const before = plain(page.navigations);
    page.runController();
    assert.deepEqual(
      page.navigations,
      before,
      "Deferred controller must not duplicate pre-paint redirect",
    );
    assert.equal(page.requests.length, source === "default" ? 1 : 0);
    assert.deepEqual(
      page.writes,
      source === "query" ? [["vlabs-locale-v1", manual]] : [],
    );
  });
}

for (const saved of [
  "",
  "EN",
  "VI",
  "en-US",
  "vi-VN",
  " en",
  "vi ",
  "usd",
  "vnd",
  "null",
]) {
  test(`invalid manual storage value ${JSON.stringify(saved)} is ignored, not normalized`, async () => {
    const page = boot({ saved });
    assert.equal(page.html.dataset.localeManual, "");
    assert.equal(page.html.dataset.localeSource, "default");
    await assertLookup(page).respond({ locale: "en", currency: "usd" });
    assertNoNavigation(page);
    assert.deepEqual(page.writes, []);
  });
}

for (const query of [
  "lang=",
  "lang=EN",
  "lang=VI",
  "lang=en-US",
  "lang=vi-VN",
  "lang=%20en",
  "lang=vi%20",
  "lang=fr",
  "lang=en&lang=en",
  "lang=vi&lang=en",
  "lang=vi&lang=vi&lang=vi",
]) {
  test(`lang query requires exactly one validated value: ${query}`, async () => {
    const page = boot({
      url: `https://vlabs.example.test/pricing?${query}#pricing`,
    });
    assert.equal(page.html.dataset.localeManual, "");
    assert.equal(page.html.dataset.localeSource, "default");
    await assertLookup(page).respond({ locale: "en", currency: "usd" });
    assertNoNavigation(page);
    assert.deepEqual(page.writes, []);
    const saved = boot({
      url: `https://vlabs.example.test/vi/pricing?${query}#pricing`,
      saved: "en",
    });
    assert.equal(saved.html.dataset.localeManual, "en");
    assert.equal(saved.requests.length, 0);
    assert.equal(new URL(saved.navigations[0][1]).pathname, "/pricing");
  });
}

for (const [name, options] of [
  ["localStorage getter denied", { denyAccess: true }],
  ["storage read denied", { denyGet: true }],
  ["storage write denied", { denySet: true }],
]) {
  test(`storage failure: ${name} keeps country fallback and native manual choice usable`, async () => {
    const page = boot(options);
    const request = assertLookup(page);
    page.click("en");
    assert.equal(page.html.dataset.localeManual, "en");
    assert.equal(request.init.signal.aborted, true);
    assert.equal(page.timers.size, 0);
    assert.equal(new URL(page.choices.en.href).searchParams.get("lang"), "en");
    await request.respond({ locale: "vi", currency: "vnd" });
    assertNoNavigation(page);
    const marked = boot({
      ...options,
      url: "https://vlabs.example.test/pricing?lang=vi#pricing",
    });
    assert.equal(marked.html.dataset.localeManual, "vi");
    assert.equal(marked.requests.length, 0);
    assert.deepEqual(marked.navigations, [
      ["replace", "https://vlabs.example.test/vi/pricing?lang=vi#pricing"],
    ]);
  });
}

test("deferred controller can apply saved manual choice without head execution", () => {
  const page = boot({ saved: "vi" }, { head: false });
  assert.equal(page.requests.length, 0);
  assert.deepEqual(page.navigations, [
    [
      "replace",
      "https://vlabs.example.test/vi/pricing?billing=year&utm_source=offline#pricing",
    ],
  ]);
  assert.deepEqual(page.writes, []);
});

test("country default is one same-origin GET, automatically replaces route, and never saves manual preference", async () => {
  const page = boot();
  assertNoNavigation(page);
  await assertLookup(page).respond({ locale: "vi", currency: "vnd" });
  assert.deepEqual(page.navigations, [
    [
      "replace",
      "https://vlabs.example.test/vi/pricing?billing=year&utm_source=offline#pricing",
    ],
  ]);
  assert.equal(page.html.dataset.localeManual, "");
  assert.equal(page.values.has("vlabs-locale-v1"), false);
  assert.deepEqual(page.writes, []);
  assert.equal(page.timers.size, 0);
  assert.deepEqual(page.historyCalls, []);
  assert.deepEqual(page.navigatorReads, []);
});

test("non-Vietnam country default keeps English without navigation or storage", async () => {
  const page = boot();
  await assertLookup(page).respond({ locale: "en", currency: "usd" });
  assertNoNavigation(page);
  assert.equal(page.html.dataset.localeManual, "");
  assert.deepEqual(page.writes, []);
  assert.equal(page.timers.size, 0);
  assert.deepEqual(page.navigatorReads, []);
});

for (const url of [
  "/vi",
  "/vi/",
  "/vi/pricing?billing=year#pricing",
  "/vi/pricing?lang=invalid#pricing",
]) {
  test(`explicit Vietnamese route never performs geo lookup: ${url}`, () => {
    const page = boot({ url: `https://vlabs.example.test${url}` });
    assert.equal(page.requests.length, 0);
    assertNoNavigation(page);
    assert.deepEqual(page.writes, []);
  });
}

test("a slug beginning with vi is not an explicit locale segment", async () => {
  const page = boot({
    url: "https://vlabs.example.test/virtual-lab?billing=month#details",
  });
  await assertLookup(page).respond({ locale: "vi", currency: "vnd" });
  assert.deepEqual(page.navigations, [
    [
      "replace",
      "https://vlabs.example.test/vi/virtual-lab?billing=month#details",
    ],
  ]);
});

for (const result of [
  null,
  {},
  [],
  "vi",
  true,
  { locale: "vi" },
  { currency: "vnd" },
  { locale: "VI", currency: "vnd" },
  { locale: "en-US", currency: "usd" },
  { locale: "vi", currency: "usd" },
  { locale: "en", currency: "vnd" },
  { locale: "vi", currency: "VND" },
  { locale: "en", currency: "eur" },
]) {
  test(`invalid/inconsistent country response falls back: ${JSON.stringify(result)}`, async () => {
    const page = boot();
    await assertLookup(page).respond(result);
    assertNoNavigation(page);
    assert.deepEqual(page.writes, []);
    assert.equal(page.timers.size, 0);
  });
}

test("geo HTTP failure is ignored even with a valid-looking body", async () => {
  const page = boot();
  const request = assertLookup(page);
  await request.respond({ locale: "vi", currency: "vnd" }, { ok: false });
  assert.equal(request.jsonCalls, 0);
  assertNoNavigation(page);
  assert.equal(page.timers.size, 0);
});

test("offline and invalid JSON geo failures preserve English", async () => {
  const offline = boot();
  await assertLookup(offline).fail(new Error("Offline fixture"));
  assertNoNavigation(offline);
  assert.equal(offline.timers.size, 0);
  const invalidJson = boot();
  await assertLookup(invalidJson).respond(null, {
    jsonError: new SyntaxError("Invalid JSON fixture"),
  });
  assertNoNavigation(invalidJson);
  assert.deepEqual(invalidJson.writes, []);
  assert.equal(invalidJson.timers.size, 0);
});

test("5-second geo deadline aborts lookup and ignores a late successful response", async () => {
  const page = boot();
  const request = assertLookup(page);
  page.advance(4_999);
  assert.equal(request.init.signal.aborted, false);
  page.advance(1);
  assert.equal(request.init.signal.aborted, true);
  assert.equal(page.timers.size, 0);
  await request.respond({ locale: "vi", currency: "vnd" });
  assertNoNavigation(page);
  assert.deepEqual(page.writes, []);
});

for (const [name, event] of [
  ["ordinary click", {}],
  ["Control/new-tab click", { ctrlKey: true }],
  ["Command/new-tab click", { metaKey: true }],
  ["middle-button click", { button: 1 }],
]) {
  test(`manual ${name} keeps native href, aborts geo, and saves only versioned locale key`, async () => {
    const page = boot();
    const request = assertLookup(page);
    page.selector.open = true;
    const click = page.click("en", event);
    assert.equal(click.defaultPrevented, false);
    assert.equal(page.selector.open, false);
    assert.equal(request.init.signal.aborted, true);
    assert.equal(page.html.dataset.localeManual, "en");
    assert.deepEqual(page.writes, [["vlabs-locale-v1", "en"]]);
    assert.equal(
      page.choices.en.getAttribute("href"),
      "/pricing?billing=year&utm_source=offline&lang=en#pricing",
    );
    assert.equal(
      page.choices.vi.getAttribute("href"),
      "/vi/pricing?billing=year&utm_source=offline&lang=vi#pricing",
    );
    await request.respond({ locale: "vi", currency: "vnd" });
    assertNoNavigation(page);
    assert.equal(page.requests.length, 1);
    assert.equal(page.timers.size, 0);
  });
}

test("manual click on descendant label is recognized; query/hash/billing and single lang marker survive", async () => {
  const page = boot(
    {
      url: "https://vlabs.example.test/vi/pricing/?billing=month&lang=en&ref=a%2Fb#pricing",
      denySet: true,
    },
    { head: false },
  );
  const click = page.click("vi", { target: page.choices.vi.children[0] });
  assert.equal(click.defaultPrevented, false);
  assert.equal(page.html.dataset.localeManual, "vi");
  const target = new URL(page.choices.vi.href);
  assert.equal(target.pathname, "/vi/pricing");
  assert.equal(target.searchParams.get("billing"), "month");
  assert.equal(target.searchParams.get("ref"), "a/b");
  assert.deepEqual(target.searchParams.getAll("lang"), ["vi"]);
  assert.equal(target.hash, "#pricing");
  assert.deepEqual(page.writes, []);
});

test("manual choice made while JSON is pending wins over a late geo response", async () => {
  const page = boot();
  const request = assertLookup(page);
  const json = deferred();
  request.deliver(null, { jsonPromise: json.promise });
  await request.jsonStarted;
  page.click("en");
  json.resolve({ locale: "vi", currency: "vnd" });
  await request.tail;
  assert.equal(request.init.signal.aborted, true);
  assertNoNavigation(page);
  assert.deepEqual(page.writes, [["vlabs-locale-v1", "en"]]);
});

const excludedLinks = [
  { href: "#main-content" },
  { href: "#" },
  { href: "/api/locale" },
  { href: "/api/checkout?billing=year" },
  { href: "/api" },
  { href: "/images/logo.png" },
  { href: "/images" },
  { href: "/scripts/locale.js" },
  { href: "/_astro/chunk.js" },
  { href: "/assets/icons" },
  { href: "/downloads/guide.pdf?lang=en#page=2" },
  { href: "https://external.example.test/pricing?lang=en#plans" },
  { href: "//external.example.test/pricing" },
  { href: "mailto:team@example.test?subject=Hello" },
  { href: "tel:+84000000000" },
  { href: "data:text/plain,offline" },
  { href: "/pricing?download=1", download: "pricing" },
];

test("storage-blocked manual marker is carried only by same-origin page links, never fragments/assets/API/downloads/external", async () => {
  const page = boot({
    denyAccess: true,
    links: [
      { href: "/features?billing=year&ref=one#details" },
      { href: "https://vlabs.example.test/contact?ref=one#demo" },
      { href: "/#main-content" },
      ...excludedLinks,
    ],
  });
  const request = assertLookup(page);
  page.click("vi");
  assert.equal(
    page.links[0].getAttribute("href"),
    "/vi/features?billing=year&ref=one&lang=vi#details",
  );
  assert.equal(
    page.links[1].getAttribute("href"),
    "/vi/contact?ref=one&lang=vi#demo",
  );
  assert.equal(page.links[2].getAttribute("href"), "/vi?lang=vi#main-content");
  assert.deepEqual(
    page.links.slice(3).map((link) => link.getAttribute("href")),
    excludedLinks.map((link) => link.href),
  );
  assert.equal(page.links.at(-1).getAttribute("download"), "pricing");
  assert.deepEqual(page.writes, []);
  await request.respond({ locale: "en", currency: "usd" });
  assertNoNavigation(page);
});

test("incoming no-storage marker also localizes ordinary page links on initialization", () => {
  const page = boot({
    denyAccess: true,
    url: "https://vlabs.example.test/vi/pricing?lang=vi#pricing",
    links: [{ href: "/contact#demo" }, ...excludedLinks],
  });
  assert.equal(page.requests.length, 0);
  assert.equal(page.links[0].getAttribute("href"), "/vi/contact?lang=vi#demo");
  assert.deepEqual(
    page.links.slice(1).map((link) => link.getAttribute("href")),
    excludedLinks.map((link) => link.href),
  );
  assertNoNavigation(page);
});

test("manual English choice removes Vietnamese prefix without changing unrelated query/hash or protected links", () => {
  const page = boot({
    saved: "en",
    url: "https://vlabs.example.test/pricing?lang=en&billing=year#pricing",
    links: [{ href: "/vi/contact?lang=vi&ref=one#demo" }, ...excludedLinks],
  });
  assert.equal(
    page.links[0].getAttribute("href"),
    "/contact?lang=en&ref=one#demo",
  );
  assert.deepEqual(
    page.links.slice(1).map((link) => link.getAttribute("href")),
    excludedLinks.map((link) => link.href),
  );
  assertNoNavigation(page);
  assert.equal(page.requests.length, 0);
});

test("cross-tab new valid choice aborts lookup, uses event data without rereading storage, and replaces clean route", async () => {
  const page = boot();
  const request = assertLookup(page);
  const reads = page.reads.length;
  page.denied.get = true;
  page.externalPreference("vi");
  assert.equal(page.reads.length, reads);
  assert.equal(request.init.signal.aborted, true);
  assert.equal(page.html.dataset.localeManual, "vi");
  assert.deepEqual(page.navigations, [
    [
      "replace",
      "https://vlabs.example.test/vi/pricing?billing=year&utm_source=offline&lang=vi#pricing",
    ],
  ]);
  await request.respond({ locale: "en", currency: "usd" });
  assert.equal(page.navigations.length, 1);
  assert.deepEqual(page.writes, []);
});

test("unrelated keys and session storage events leave pending geo request untouched", async () => {
  const page = boot();
  const request = assertLookup(page);
  page.externalPreference("vi", { key: "vlabs-theme" });
  page.externalPreference("vi", { storageArea: {} });
  assert.equal(request.init.signal.aborted, false);
  assert.equal(page.html.dataset.localeManual, "");
  assertNoNavigation(page);
  await request.respond({ locale: "en", currency: "usd" });
});

for (const [name, value, key] of [
  ["invalid value", "VI", "vlabs-locale-v1"],
  ["removed preference", null, "vlabs-locale-v1"],
  ["cleared storage", null, null],
]) {
  test(`cross-tab ${name} cancels stale lookup without promoting a new manual choice`, async () => {
    const page = boot();
    const request = assertLookup(page);
    page.externalPreference(value, { key });
    assert.equal(request.init.signal.aborted, true);
    assert.equal(page.html.dataset.localeManual, "");
    await request.respond({ locale: "vi", currency: "vnd" });
    assertNoNavigation(page);
    assert.deepEqual(page.writes, []);
    assert.equal(page.requests.length, 1);
  });
}

const lockedPages = [
  ["open checkout", { dialogOpen: true }],
  ["busy form", { busyForm: true }],
  ["dirty form", { dirtyForm: true }],
  ["submitted form", { submittedForm: true }],
  [
    "nonempty edited text",
    { fields: [{ name: "name", value: "Unsaved draft" }] },
  ],
  [
    "edited checkbox",
    { fields: [{ name: "consent", type: "checkbox", checked: true }] },
  ],
  [
    "edited radio",
    { fields: [{ name: "choice", type: "radio", checked: true }] },
  ],
  [
    "edited select",
    { fields: [{ name: "course", tag: "select", value: "physics" }] },
  ],
];

for (const [name, options] of lockedPages) {
  test(`navigation lock: ${name} blocks initial geo and cross-tab redirect without discarding values`, () => {
    const page = boot({ ...options, links: [{ href: "/contact#demo" }] });
    const before = page.fields.map((field) => [field.value, field.checked]);
    assert.equal(page.requests.length, 0);
    page.externalPreference("vi");
    assert.equal(page.html.dataset.localeManual, "vi");
    assert.equal(
      page.links[0].getAttribute("href"),
      "/vi/contact?lang=vi#demo",
    );
    assert.deepEqual(
      page.fields.map((field) => [field.value, field.checked]),
      before,
    );
    assertNoNavigation(page);
    assert.deepEqual(page.writes, []);
  });
}

for (const type of ["input", "change", "submit"]) {
  test(`form ${type} aborts lookup and preserves dirty/submitted lock even after fields clear`, async () => {
    const page = boot();
    const request = assertLookup(page);
    page.fields[0].value = "Unsaved draft";
    page.protect(type, type === "submit" ? page.form : page.fields[0]);
    assert.equal(
      page.form.dataset[type === "submit" ? "localeSubmitted" : "localeDirty"],
      "true",
    );
    assert.equal(request.init.signal.aborted, true);
    assert.equal(page.timers.size, 0);
    page.fields[0].value = "";
    page.externalPreference("vi");
    await request.respond({ locale: "vi", currency: "vnd" });
    assertNoNavigation(page);
    assert.equal(page.fields[0].value, "");
    assert.deepEqual(page.writes, []);
  });
}

test("clicking checkout trigger descendant aborts geo before dialog opens", async () => {
  const page = boot();
  const request = assertLookup(page);
  page.document.emit("click", { target: page.trigger.children[0] });
  assert.equal(request.init.signal.aborted, true);
  page.dialog.open = true;
  page.externalPreference("vi");
  await request.respond({ locale: "vi", currency: "vnd" });
  assertNoNavigation(page);
  assert.equal(page.dialog.open, true);
});

test("dialog opened while response JSON is pending blocks late automatic navigation", async () => {
  const page = boot();
  const request = assertLookup(page);
  const json = deferred();
  request.deliver(null, { jsonPromise: json.promise });
  await request.jsonStarted;
  page.dialog.open = true;
  json.resolve({ locale: "vi", currency: "vnd" });
  await request.tail;
  assertNoNavigation(page);
});

test("untouched prefills and hidden/submit/button values are not false dirty locks", async () => {
  const page = boot({
    fields: [
      { name: "name", value: "Existing value", defaultValue: "Existing value" },
      { name: "token", type: "hidden", value: "opaque" },
      { name: "send", type: "submit", value: "Send" },
      { name: "cancel", type: "button", value: "Cancel" },
      { name: "check", type: "checkbox", checked: true, defaultChecked: true },
    ],
  });
  await assertLookup(page).respond({ locale: "en", currency: "usd" });
  assertNoNavigation(page);
  assert.equal(page.fields[0].value, "Existing value");
});

test("non-form input/change events do not cancel eligible geo lookup", async () => {
  const page = boot();
  const request = assertLookup(page);
  page.protect("change", page.summary);
  page.protect("input", page.choices.en);
  assert.equal(request.init.signal.aborted, false);
  await request.respond({ locale: "en", currency: "usd" });
  assertNoNavigation(page);
});

test("repeated controller execution binds one lookup and one set of listeners", async () => {
  const page = boot();
  page.runController();
  page.runController();
  assert.equal(page.window.__vlabsLocaleV1, true);
  assert.equal(page.window.listeners.get("storage").length, 1);
  assert.equal(page.window.listeners.get("pagehide").length, 1);
  assert.equal(page.window.listeners.get("pageshow").length, 1);
  assert.equal(page.document.listeners.get("click").length, 2);
  for (const type of ["input", "change", "submit"])
    assert.equal(page.document.listeners.get(type).length, 1);
  page.click("en");
  assert.deepEqual(page.writes, [["vlabs-locale-v1", "en"]]);
  await page.requests[0].respond({ locale: "vi", currency: "vnd" });
  assertNoNavigation(page);
});

test("loading document defers controller once until DOMContentLoaded", async () => {
  const page = boot({ readyState: "loading" });
  page.runController();
  assert.equal(page.requests.length, 0);
  assert.equal(page.document.listeners.get("DOMContentLoaded").length, 1);
  assert.equal(page.document.listeners.get("click"), undefined);
  page.ready();
  page.ready();
  await assertLookup(page).respond({ locale: "en", currency: "usd" });
  assertNoNavigation(page);
});

test("pagehide aborts lookup and pageshow refreshes query/hash choices without duplicate fetch", async () => {
  const page = boot();
  const request = assertLookup(page);
  page.window.emit("pagehide");
  assert.equal(request.init.signal.aborted, true);
  assert.equal(page.timers.size, 0);
  page.window.location.href =
    "https://vlabs.example.test/pricing?billing=month&ref=two#plan-enterprise";
  page.window.emit("pageshow");
  assert.equal(
    page.choices.vi.getAttribute("href"),
    "/vi/pricing?billing=month&ref=two&lang=vi#plan-enterprise",
  );
  assert.equal(page.requests.length, 1);
  await request.respond({ locale: "vi", currency: "vnd" });
  assertNoNavigation(page);
});

test("language details Escape closes and restores summary focus; outside click closes without hijacking links", async () => {
  const page = boot();
  page.selector.open = true;
  const escape = page.selector.emit("keydown", { key: "Escape" });
  assert.equal(page.selector.open, false);
  assert.equal(page.summary.focusCount, 1);
  assert.equal(page.document.activeElement, page.summary);
  assert.equal(escape.defaultPrevented, true);
  const closedEscape = page.selector.emit("keydown", { key: "Escape" });
  assert.equal(closedEscape.defaultPrevented, false);
  page.selector.open = true;
  page.document.emit("click", { target: page.summary });
  assert.equal(page.selector.open, true);
  page.document.emit("click", { target: page.fields[0] });
  assert.equal(page.selector.open, false);
  assert.equal(
    page.selector.emit("keydown", { key: "Enter" }).defaultPrevented,
    false,
  );
  await page.requests[0].respond({ locale: "en", currency: "usd" });
  assertNoNavigation(page);
});

test("native no-JS selector evaluates to functional EN/USD and VI/VND page links", () => {
  const source = required("selector");
  assert.match(source, /<details\b[^>]*\bdata-locale-selector\b/);
  assert.match(source, /<summary\b[^>]*aria-controls="locale-options"/);
  assert.match(source, /\blang=\{choice\.locale\}/);
  assert.match(source, /\bhreflang=\{choice\.locale\}/);
  assert.doesNotMatch(source, /href=["'](?:#|javascript:)/i);
  const expression = source.match(/href=\{(`[^`]+`)\}/)?.[1];
  assert.ok(expression, "No-JS links must have a build-time page href");
  for (const pathname of ["/pricing", "/vi/pricing", "/", "/vi"]) {
    const modules = moduleLoader(
      {},
      {
        Astro: {
          props: { locale: pathname.startsWith("/vi") ? "vi" : "en" },
          url: new URL(pathname, "https://vlabs.example.test"),
        },
      },
    );
    // Evaluate the actual frontmatter and href expression, not a fake renderer.
    const code = ts.transpileModule(
      `${frontmatter(source)}\nexports.hrefs = choices.map(choice => ({ locale: choice.locale, label: choice.label, href: ${expression} }));`,
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          esModuleInterop: true,
        },
      },
    ).outputText;
    const exports = {};
    const context = createContext({
      exports,
      Astro: {
        props: { locale: pathname.startsWith("/vi") ? "vi" : "en" },
        url: new URL(pathname, "https://vlabs.example.test"),
      },
      require(specifier) {
        if (specifier === "@/lib/i18n") return modules("i18n");
        if (specifier === "@/lib/messages") return modules("messages");
        assert.fail(`No-JS test forbids import ${specifier}`);
      },
    });
    runInContext(code, context, { filename: paths.selector });
    const base = pathname === "/" || pathname === "/vi" ? "" : "/pricing";
    assert.deepEqual(plain(exports.hrefs), [
      { locale: "en", label: "English · USD", href: `${base || "/"}?lang=en` },
      { locale: "vi", label: "Tiếng Việt · VND", href: `/vi${base}?lang=vi` },
    ]);
  }
});

test("canonical content IDs strip only supported leading locale segment; entry selection is explicit", () => {
  const { canonicalId, entryLocale, locales, LOCALE_STORAGE_KEY } =
    moduleLoader()("i18n");
  assert.deepEqual(plain(locales), ["en", "vi"]);
  assert.equal(LOCALE_STORAGE_KEY, "vlabs-locale-v1");
  for (const [id, canonical, locale] of [
    ["vi/careers/example", "careers/example", "vi"],
    ["en/careers/example", "careers/example", "en"],
    ["vi/-index", "-index", "vi"],
    ["violin/example", "violin/example", "en"],
    ["VI/example", "VI/example", "en"],
    ["careers/vi/example", "careers/vi/example", "en"],
    ["vi", "vi", "en"],
  ]) {
    assert.equal(canonicalId(id), canonical);
    assert.equal(entryLocale(id), locale);
  }
});

test("locale path mapping preserves canonical slugs and never doubles Vietnamese prefix", () => {
  const { localePath } = moduleLoader()("i18n");
  for (const [path, en, vi] of [
    ["/", "/", "/vi"],
    ["/vi", "/", "/vi"],
    ["/vi/", "/", "/vi"],
    ["/pricing/", "/pricing", "/vi/pricing"],
    ["/vi/pricing//", "/pricing", "/vi/pricing"],
    [
      "/careers/senior-frontend-developer",
      "/careers/senior-frontend-developer",
      "/vi/careers/senior-frontend-developer",
    ],
    ["/virtual-lab", "/virtual-lab", "/vi/virtual-lab"],
    ["/violin", "/violin", "/vi/violin"],
  ]) {
    assert.equal(localePath(path, "en"), en);
    assert.equal(localePath(path, "vi"), vi);
  }
});

test("build-time link helper localizes pages and preserves billing/hash while leaving nonpage references unchanged", () => {
  const modules = moduleLoader();
  const { localizeHref } = modules("i18n");
  const origin = new URL(modules("config").site.base_url).origin;
  assert.equal(
    localizeHref("/pricing?billing=year&lang=en&ref=one#pricing", "vi"),
    "/vi/pricing?billing=year&lang=vi&ref=one#pricing",
  );
  assert.equal(
    localizeHref("/vi/contact?billing=month&lang=vi#demo", "en"),
    "/contact?billing=month&lang=en#demo",
  );
  assert.equal(
    localizeHref(`${origin}/contact?ref=one#demo`, "vi"),
    "/vi/contact?ref=one#demo",
  );
  assert.equal(localizeHref("/", "vi"), "/vi");
  assert.equal(localizeHref("/features", "vi"), "/vi/features");
  for (const href of [
    "",
    "#main-content",
    "?billing=year",
    "//external.example.test/x",
    "mailto:team@example.test",
    "tel:+84000000000",
    "data:text/plain,offline",
    "javascript:void(0)",
    "/api",
    "/api/locale?lang=en",
    "/images",
    "/images/logo.png",
    "/scripts/locale.js",
    "/_astro/chunk.js",
    "/assets/icons",
    "/guide.pdf?lang=en#p2",
    "https://external.example.test/features",
  ]) {
    assert.equal(localizeHref(href, "vi"), href, href);
    assert.equal(localizeHref(href, "en"), href, href);
  }
  assert.throws(() => localizeHref("http://[", "vi"), /Invalid URL/);
});

test("shared menu/footer use translated names, locale page paths, and identical canonical link ordering", () => {
  const modules = moduleLoader();
  const { localizedMenu, localePath } = modules("i18n");
  const en = localizedMenu("en");
  const vi = localizedMenu("vi");
  assert.deepEqual(plain(en), modules("menu"));
  assert.deepEqual(
    [vi.footer_col_1_title, vi.footer_col_2_title, vi.footer_col_3_title],
    ["Nền tảng", "Khám phá", "Chính sách"],
  );
  for (const group of [
    "main",
    "footer_primary",
    "footer_resource",
    "footer_legal",
  ]) {
    assert.equal(vi[group].length, en[group].length);
    for (const link of [...en[group], ...vi[group]]) {
      assert.ok(!/\bInstitutions\b/i.test(link.name), `${group}: removed Institutions label`);
      assert.ok(!/^(?:\/vi)?\/business(?:[/?#]|$)/.test(link.url), `${group}: removed business route`);
      assert.ok(!/^\/(?:vi\/)?(?:about|careers|case-study)(?:[/?#]|$)/.test(link.url), `${group}: withdrawn section link removed`);
    }
    vi[group].forEach((link, index) => {
      assert.equal(link.url, localePath(en[group][index].url, "vi"));
      assert.equal(typeof link.name, "string");
      assert.ok(link.name.trim());
      assert.notEqual(link.name, en[group][index].name);
    });
  }
  assert.deepEqual(
    plain(vi.main).map((link) => link.name),
    [
      "Thư ngỏ",
      "Tính năng",
      "Tích hợp",
      "Bảng giá",
      "Liên hệ",
    ],
  );
  assert.deepEqual(plain(vi.footer_primary).map((link) => link.name), ["Trang chủ", "Tính năng", "Bảng giá", "Liên hệ"]);
  assert.deepEqual(plain(vi.footer_resource).map((link) => link.name), ["Tích hợp", "Thư ngỏ"]);
  assert.deepEqual(plain(vi.footer_legal).map((link) => link.name), ["Chính sách quyền riêng tư", "Điều khoản và điều kiện"]);
});

const approvedPlans = [
  {
    plan_id: "starter",
    title: "Starter",
    price: "2.69",
    yearly_price: "26.90",
    usd: [269, 2_690],
    vnd: [69_000, 690_000],
  },
  {
    plan_id: "campus",
    title: "Campus",
    price: "3.09",
    yearly_price: "30.90",
    usd: [309, 3_090],
    vnd: [79_000, 790_000],
  },
  {
    plan_id: "enterprise",
    title: "Enterprise",
    price: "3.89",
    yearly_price: "38.90",
    usd: [389, 3_890],
    vnd: [99_000, 990_000],
  },
];
const pricingEntries = Object.fromEntries(await Promise.all(["en", "vi"].map(async (locale) => [
  locale,
  parseFrontmatter(await readFile(resolve(root, "src/content/pricing", locale === "vi" ? "vi/-index.md" : "-index.md"), "utf8")).frontmatter,
])));
const normalizeMoney = (value) => value.replace(/[\u00a0\u202f]/g, " ");

test("content buttons keep Starter checkout label and pin Campus/Enterprise contact links in both locales", () => {
  for (const locale of ["en", "vi"]) {
    const labels = locale === "vi"
      ? ["Bắt đầu với Starter", "Liên hệ VLABS", "Liên hệ VLABS"]
      : ["Get Started with Starter", "Contact VLABS", "Contact VLABS"];
    for (const [index, { plan_id }] of approvedPlans.entries()) {
      const plan = pricingEntries[locale].plans.find((plan) => plan.plan_id === plan_id);
      assert.deepEqual(plan.button, { enable: true, label: labels[index], link: "/contact" }, `${locale}/${plan_id}`);
    }
  }
});

test("locale/currency validation accepts only exact EN/USD and VI/VND mapping; legacy conversion constant is unchanged", () => {
  const { isLocale, currencyForLocale, VND_PER_USD } =
    moduleLoader()("currency");
  assert.equal(VND_PER_USD, 26_000);
  assert.equal(isLocale("en"), true);
  assert.equal(isLocale("vi"), true);
  assert.equal(currencyForLocale("en"), "usd");
  assert.equal(currencyForLocale("vi"), "vnd");
  for (const value of [
    "EN",
    "VI",
    "vi-VN",
    "en-US",
    " en",
    "vi ",
    "",
    "usd",
    "vnd",
    null,
    undefined,
    0,
    {},
    [],
  ]) {
    assert.equal(isLocale(value), false);
    assert.throws(() => currencyForLocale(value), /Unsupported locale/);
  }
});

for (const plan of approvedPlans) {
  test(`${plan.plan_id} display prices use independent EN/USD and VI/VND content for both billing periods`, () => {
    const modules = moduleLoader();
    const { usdPriceToMinor, vndPriceToMinor } = modules("currency");
    const { planAmounts, planById } = modules("pricing");
    const canonicalPlan = planById(pricingEntries.en.plans, plan.plan_id);
    const localizedPlan = planById(pricingEntries.vi.plans, plan.plan_id);
    assert.equal(canonicalPlan.price, plan.price);
    assert.equal(canonicalPlan.yearly_price, plan.yearly_price);
    assert.equal(localizedPlan.price, String(plan.vnd[0]));
    assert.equal(localizedPlan.yearly_price, String(plan.vnd[1]));
    for (const [locale, currency] of [["en", "usd"], ["vi", "vnd"]]) {
      const amounts = planAmounts(canonicalPlan, localizedPlan, locale);
      assert.equal(amounts.currency, currency);
      assert.equal(amounts.month, plan[currency][0]);
      assert.equal(amounts.year, plan[currency][1]);
      assert.equal(currency === "vnd" ? vndPriceToMinor(localizedPlan.price) : usdPriceToMinor(canonicalPlan.price, "usd"), plan[currency][0]);
      assert.equal(currency === "vnd" ? vndPriceToMinor(localizedPlan.yearly_price) : usdPriceToMinor(canonicalPlan.yearly_price, "usd"), plan[currency][1]);
      assert.equal(normalizeMoney(amounts.monthlyDisplay), locale === "vi" ? `${plan.vnd[0].toLocaleString("vi-VN")} ₫` : `$${plan.price}`);
      assert.equal(normalizeMoney(amounts.yearlyDisplay), locale === "vi" ? `${plan.vnd[1].toLocaleString("vi-VN")} ₫` : `$${plan.yearly_price}`);
    }
  });
}

test("canonical plan selection is by immutable ID, not translated title or array position", () => {
  const { planById } = moduleLoader()("pricing");
  const reversed = [...approvedPlans].reverse().map((plan) => ({ ...plan, title: `Translated ${plan.plan_id}` }));
  assert.equal(planById(reversed, "starter"), reversed[2]);
  assert.equal(planById(reversed, "enterprise"), reversed[0]);
  assert.throws(() => planById(reversed, "missing"), /exactly one pricing plan: missing/);
  assert.throws(() => planById([], "starter"), /exactly one pricing plan: starter/);
  assert.throws(() => planById([approvedPlans[0], { ...approvedPlans[0] }], "starter"), /exactly one pricing plan: starter/);
});

test("display helpers preserve plan IDs, reject malformed VND content, and never consult USD prices for VI", () => {
  const modules = moduleLoader();
  const { planAmounts } = modules("pricing");
  const { vndPriceToMinor } = modules("currency");
  const canonicalPlan = pricingEntries.en.plans[0];
  const localizedPlan = pricingEntries.vi.plans[0];
  assert.equal(planAmounts({ ...canonicalPlan, price: "invalid", yearly_price: "invalid" }, localizedPlan, "vi").month, 69_000);
  assert.equal(planAmounts(canonicalPlan, { ...localizedPlan, price: "invalid", yearly_price: "invalid" }, "en").month, 269);
  assert.throws(() => planAmounts(canonicalPlan, { ...localizedPlan, plan_id: "campus" }, "vi"), /canonical plan ID/);
  assert.equal(vndPriceToMinor("999999999999"), 999_999_999_999);
  for (const price of ["0", "-1", "+69000", "69.000", "69,000", "69000.0", "69000 ", " 69000", "69000\n", "1e5", "0x10", "1000000000000", "9007199254740993", "", 69000, null, undefined]) {
    assert.throws(() => vndPriceToMinor(price), /Invalid VND price/, String(price));
    assert.throws(() => planAmounts(canonicalPlan, { ...localizedPlan, price }, "vi"), /Invalid VND price/, String(price));
    assert.throws(() => planAmounts(canonicalPlan, { ...localizedPlan, yearly_price: price }, "vi"), /Invalid VND price/, String(price));
  }
});

test("USD parsing uses integer cents before FX, enforces monetary ceiling, and rejects malformed inputs", () => {
  const { usdPriceToMinor, formatMinorAmount } = moduleLoader()("currency");
  assert.equal(usdPriceToMinor("0.01", "usd"), 1);
  assert.equal(usdPriceToMinor("0.01", "vnd"), 260);
  assert.equal(usdPriceToMinor("49.01", "usd"), 4_901);
  assert.equal(usdPriceToMinor("49.01", "vnd"), 1_274_260);
  assert.equal(usdPriceToMinor(" 49 ", "usd"), 4_900);
  assert.equal(usdPriceToMinor("38461538.46", "vnd"), 999_999_999_960);
  assert.throws(() => usdPriceToMinor("38461538.47", "vnd"), /Invalid USD price/);
  assert.equal(usdPriceToMinor("9999999999.99", "usd"), 999_999_999_999);
  assert.throws(() => usdPriceToMinor("10000000000", "usd"), /Invalid USD price/);
  for (const price of ["0", "-1", "49.000", "1e2", "0x31", "049", ".5", "49.", "NaN", "Infinity", "", 49, null, undefined]) {
    assert.throws(() => usdPriceToMinor(price, "usd"), /Invalid USD price/, String(price));
    assert.throws(() => usdPriceToMinor(price, "vnd"), /Invalid USD price/, String(price));
  }
  assert.throws(() => usdPriceToMinor("49", "eur"), /Unsupported currency/);
  assert.equal(formatMinorAmount(4_901, "usd", "en"), "$49.01");
  assert.equal(formatMinorAmount(1, "usd", "en"), "$0.01");
  assert.equal(formatMinorAmount(0, "usd", "en"), "$0");
  assert.equal(normalizeMoney(formatMinorAmount(0, "vnd", "vi")), "0 ₫");
  assert.equal(formatMinorAmount(999_999_999_999, "usd", "en"), "$9,999,999,999.99");
  for (const amount of [-1, 1.1, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1, "4900"]) assert.throws(() => formatMinorAmount(amount, "usd", "en"), /Invalid minor amount/);
  assert.throws(() => formatMinorAmount(1, "eur", "en"), /Unsupported currency/);
  assert.throws(() => formatMinorAmount(1, "usd", "EN"), /Unsupported locale/);
});

function contentModule(entries) {
  const calls = [];
  const module = moduleLoader({ "astro:content": {
    async getCollection(collection) { calls.push(["collection", collection]); return entries; },
    async getEntry(collection, id) { calls.push(["entry", collection, id]); return entries.find((entry) => entry.id === id); },
  } })("content");
  return { ...module, calls };
}

test("content lists select requested language and exclude drafts and nested -indexes from detail routes", async () => {
  const entries = ["-index", "nested/-index", "published", "draft"].flatMap((id) => ["en", "vi"].map((locale) => ({ id: locale === "vi" ? `vi/${id}` : id, data: { title: `${locale} ${id}`, draft: id === "draft" } })));
  const { getSinglePage } = contentModule(entries);
  assert.deepEqual(plain(await getSinglePage("careers", "en")).map((entry) => entry.id), ["published"]);
  assert.deepEqual(plain(await getSinglePage("careers", "vi")).map((entry) => entry.id), ["vi/published"]);
  assert.deepEqual(plain(await getSinglePage("careers")).map((entry) => entry.id), ["published"]);
});

for (const [id, draft] of [["published", false], ["draft", true], ["-index", false]]) {
  test(`missing translation fails before draft/index filtering: ${id}`, async () => {
    const { getSinglePage } = contentModule([{ id, data: { draft } }]);
    await assert.rejects(() => getSinglePage("careers", "en"), new RegExp(`Missing vi translation: careers/${id}`));
    await assert.rejects(() => getSinglePage("careers", "vi"), new RegExp(`Missing vi translation: careers/${id}`));
  });
}

test("content lookup returns actual Vietnamese entry rather than English fallback and validates counterpart", async () => {
  const en = { id: "privacy-policy", data: { title: "Privacy Policy" }, body: "English body" };
  const vi = { id: "vi/privacy-policy", data: { title: "Chính sách quyền riêng tư" }, body: "Nội dung tiếng Việt" };
  const module = contentModule([en, vi]);
  assert.equal(await module.getListPage("pages", "privacy-policy", "vi"), vi);
  assert.equal(await module.getListPage("pages", "vi/privacy-policy", "vi"), vi);
  assert.equal(await module.getListPage("pages", "vi/privacy-policy", "en"), en);
  assert.equal(await module.getListPage("pages", "privacy-policy"), en);
  assert.deepEqual(module.calls.slice(0, 2), [["entry", "pages", "vi/privacy-policy"], ["entry", "pages", "privacy-policy"]]);
  await assert.rejects(() => contentModule([en]).getListPage("pages", "privacy-policy", "vi"), /Missing vi translation: pages\/privacy-policy/);
  await assert.rejects(() => contentModule([vi]).getListPage("pages", "privacy-policy", "vi"), /Missing en translation: pages\/privacy-policy/);
  await assert.rejects(() => contentModule([vi]).getListPage("pages", "privacy-policy", "en"), /Missing en translation: pages\/privacy-policy/);
});

test("Vietnamese Markdown transformer rewrites links and definitions recursively, not assets/anchors/external/image sources", () => {
  const transform = moduleLoader()("markdown").default({ site: "https://vlabs.example.test" });
  const untouched = ["#main-content", "?billing=year", "/api/locale", "/images/logo.png", "/scripts/main.js", "/_astro/chunk.js", "/assets/icons", "/guide.pdf#page=2", "mailto:team@example.test", "tel:+84000000000", "https://external.example.test/privacy", "//external.example.test/privacy"];
  const tree = { type: "root", children: [
    { type: "paragraph", children: [{ type: "link", url: "/privacy-policy?lang=en&billing=year#privacy" }] },
    { type: "definition", url: "https://vlabs.example.test/contact?ref=one#demo" },
    { type: "link", url: "/vi/pricing/" }, { type: "image", url: "/images/logo.png" },
    ...untouched.map((url) => ({ type: "link", url })),
  ] };
  transform(tree, { path: "/project/src/content/pages/vi/terms.md" });
  assert.equal(tree.children[0].children[0].url, "/vi/privacy-policy?lang=vi&billing=year#privacy");
  assert.equal(tree.children[1].url, "/vi/contact?ref=one#demo");
  assert.equal(tree.children[2].url, "/vi/pricing");
  assert.equal(tree.children[3].url, "/images/logo.png");
  assert.deepEqual(tree.children.slice(4).map((node) => node.url), untouched);
  const windows = { type: "link", url: "/contact#demo" };
  transform(windows, { path: "C:\\project\\content\\vi\\terms.md" });
  assert.equal(windows.url, "/vi/contact#demo");
  for (const path of ["/project/src/content/pages/terms.md", "/project/src/content/vietnam/terms.md", undefined]) {
    const english = { type: "root", children: [{ type: "link", url: "/privacy-policy#privacy" }] };
    transform(english, { path });
    assert.equal(english.children[0].url, "/privacy-policy#privacy");
  }
});

test("message dictionaries have complete matching keys, nonempty translated copy, and no silent English form/widget fallback", () => {
  const { getMessages } = moduleLoader()("messages");
  const en = getMessages("en");
  const vi = getMessages("vi");
  const compare = (english, vietnamese, path = "copy") => {
    assert.deepEqual(Object.keys(vietnamese).sort(), Object.keys(english).sort(), path);
    for (const [key, value] of Object.entries(english)) {
      if (typeof value === "object") compare(value, vietnamese[key], `${path}.${key}`);
      else {
        assert.equal(typeof vietnamese[key], "string", `${path}.${key}`);
        assert.ok(vietnamese[key].trim(), `${path}.${key}`);
        assert.notEqual(vietnamese[key], value, `English fallback at ${path}.${key}`);
      }
    }
  };
  compare(en, vi);
  assert.equal(vi.form.name, "Họ và tên");
  assert.equal(vi.form.email, "Địa chỉ email");
  assert.equal(vi.form.phone, "Số điện thoại");
  assert.equal(vi.form.message, "VLABS có thể hỗ trợ bạn như thế nào?");
  assert.equal(vi.form.requiredName, "Vui lòng nhập họ và tên của bạn.");
  assert.equal(vi.form.invalidEmail, "Vui lòng nhập một địa chỉ email hợp lệ.");
  assert.equal(vi.form.sending, "Đang gửi…");
  assert.match(vi.form.contactReceived, /VLABS đã nhận được yêu cầu/);
  assert.match(vi.form.timeout, /chưa thể xác nhận yêu cầu trong thời gian dự kiến.*thử lại.*liên hệ/);
  assert.match(vi.form.connection, /kiểm tra kết nối Internet/);
  assert.equal(en.pricing.month, "acc/month");
  assert.equal(en.pricing.year, "acc/year");
  assert.equal(vi.pricing.month, "tài khoản/tháng");
  assert.equal(vi.pricing.year, "tài khoản/năm");
});

for (const [interval, key, period] of [["month", "monthlySummary", "tháng"], ["year", "yearlySummary", "năm"]]) {
  test(`checkout ${interval} disclosure is EN/USD PayPal automatic and VI/VND SePay one-time/manual`, () => {
    const { getMessages } = moduleLoader()("messages");
    const en = getMessages("en");
    const vi = getMessages("vi");
    assert.match(en.checkout[key], /\{amount\}.*\bUSD\b/);
    assert.match(en.checkout[key], /PayPal/);
    assert.match(en.checkout[key], new RegExp(`subscription renews automatically each ${interval} until it is cancelled`, "i"));
    assert.match(en.checkout[key], interval === "year" ? /per year.*full annual amount is charged once per year/i : /per month, billed through PayPal/i);
    assert.match(vi.checkout[key], /\{amount\}/);
    assert.match(vi.checkout[key], new RegExp(`kỳ sử dụng một ${period}`));
    assert.match(vi.checkout[key], /VND.*SePay/);
    assert.match(vi.checkout[key], /một lần/);
    assert.match(vi.checkout[key], /chủ động lựa chọn gia hạn/);
    assert.match(vi.checkout[key], /không tự động thu tiền/);
    assert.doesNotMatch(JSON.stringify(vi.checkout), /\b(?:USD|Stripe|PayPal)\b|\$/i);
    assert.doesNotMatch(JSON.stringify(en.checkout), /\b(?:Stripe|SePay)\b/i);
    const noteKey = interval === "year" ? "yearlyNote" : "monthlyNote";
    assert.match(en.pricing[noteKey], /USD.*PayPal/);
    assert.match(en.pricing[noteKey], new RegExp(`subscription renews automatically each ${interval} until it is cancelled`, "i"));
    assert.match(vi.pricing[noteKey], interval === "year" ? /Thanh toán trước toàn bộ số tiền.*VND.*SePay/ : /Thanh toán trước một lần.*VND.*SePay/);
    assert.match(vi.pricing[noteKey], new RegExp(`kỳ sử dụng một ${period}`));
    assert.match(vi.pricing[noteKey], /chủ động lựa chọn gia hạn.*không tự động thu tiền/);
    if (interval === "year") {
      assert.match(en.pricing[noteKey], /full annual amount is charged once per year/i);
      assert.match(vi.checkout[key], /Toàn bộ số tiền được thanh toán trước một lần/);
    }
    assert.match(en.checkout.terms, /return URL is not, by itself, proof of successful payment/i);
    assert.match(vi.checkout.terms, /URL quay lại.*không tự động được xem là bằng chứng giao dịch đã thành công/);
  });
}

test("pricing disclosure states independent listed USD/VND billing, never a fixed USD-to-VND conversion", () => {
  const { getMessages } = moduleLoader()("messages");
  assert.match(getMessages("en").pricing.fixedRate, /USD prices are billed in USD.*VND prices are billed in VND as listed.*independently.*not converted/);
  assert.match(getMessages("vi").pricing.fixedRate, /Giá USD được thanh toán bằng USD.*giá VND được thanh toán bằng VND theo mức niêm yết.*độc lập.*không quy đổi/);
  for (const locale of ["en", "vi"]) assert.doesNotMatch(getMessages(locale).pricing.fixedRate, /1 USD\s*=\s*26[,.]000 VND/);
});

function parsed(key, code = required(key)) {
  const tree = ts.createSourceFile(paths[key].replace(/\.astro$/, ".ts"), code, ts.ScriptTarget.Latest, true, paths[key].endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  assert.equal(tree.parseDiagnostics.length, 0, `Tested source must parse: ${paths[key]}`);
  return tree;
}

function nodesIn(tree, predicate) {
  const matches = [];
  const visit = (node) => { if (predicate(node)) matches.push(node); ts.forEachChild(node, visit); };
  visit(tree);
  return matches;
}

function propertyName(property) {
  if (ts.isShorthandPropertyAssignment(property)) return property.name.text;
  return property.name?.text;
}

function propertyValue(object, name) {
  const property = object.properties.find((node) => propertyName(node) === name);
  assert.ok(property, `Missing request property ${name}`);
  return property.initializer || property.name;
}

function evaluateExpression(expression, globals) {
  const code = ts.transpileModule(`exports.result = (${expression});`, { compilerOptions: { module: ts.ModuleKind.CommonJS }, fileName: "fixture.ts" }).outputText;
  const exports = {};
  runInContext(code, createContext({ exports, ...globals }), { filename: "actual source expression" });
  return exports.result;
}

test("native enquiry contracts carry validated locale in unprefixed API action, hidden field, serialized copy, and POST JSON", () => {
  const source = required("enquiry");
  const action = source.match(/action=\{(`[^`]+`)\}/)?.[1];
  assert.ok(action, "Enquiry form needs a native same-origin API action");
  assert.match(source, /method="POST"/);
  assert.match(source, /lang=\{locale\}/);
  assert.match(source, /data-locale=\{locale\}/);
  assert.match(source, /data-form-copy=\{JSON\.stringify\(copy\)\}/);
  assert.match(source, /<input\b[^>]*type="hidden"[^>]*name="locale"[^>]*value=\{locale\}/);
  const script = source.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script, "Enquiry client enhancement must remain available");
  const tree = parsed("enquiry", script);
  const payload = nodesIn(tree, (node) => ts.isVariableDeclaration(node) && node.name.getText(tree) === "payload")[0]?.initializer;
  assert.ok(payload && ts.isObjectLiteralExpression(payload), "Enquiry JSON needs an explicit payload");
  assert.equal(propertyValue(payload, "locale").getText(tree), "locale");
  const fetches = nodesIn(tree, (node) => ts.isCallExpression(node) && node.expression.getText(tree) === "fetch");
  assert.equal(fetches.length, 1);
  assert.equal(fetches[0].arguments[0].getText(tree), "form.action");
  const init = fetches[0].arguments[1];
  assert.equal(propertyValue(init, "method").text, "POST");
  assert.equal(propertyValue(init, "body").getText(tree), "JSON.stringify(payload)");
  assert.equal(propertyValue(propertyValue(init, "headers"), "Content-Type").text, "application/json");
  for (const locale of ["en", "vi"]) for (const kind of ["contact", "lead"]) {
    const url = new URL(evaluateExpression(action, { kind, locale }), "https://vlabs.example.test");
    assert.equal(url.origin, "https://vlabs.example.test");
    assert.equal(url.pathname, `/api/${kind}`);
    assert.deepEqual(url.searchParams.getAll("lang"), [locale]);
    const values = { name: " Ada ", email: " ada@example.test ", phone: " +84000000000 ", message: " Offline fixture " };
    assert.deepEqual(plain(evaluateExpression(payload.getText(tree), { locale, kind, formData: { get: (key) => values[key] } })), {
      locale, name: "Ada", email: "ada@example.test",
      ...(kind === "contact" ? { phone: "+84000000000", message: "Offline fixture" } : {}),
    });
  }
  assert.doesNotMatch(script, /\.validationMessage\b/);
  for (const key of ["requiredName", "requiredEmail", "invalidEmail", "review", "sending", "pending", "failed", "timeout", "connection", "contactReceived", "leadReceived"]) assert.match(script, new RegExp(`\\bcopy\\.${key}\\b`));
  assert.match(source, /href=\{localizeHref\("\/privacy-policy", locale\)\}/);
});

test("Starter checkout receives server-computed localized minor amounts and immutable ID; POST sends selection, never display amount/currency", () => {
  const card = required("card");
  const island = card.match(/<PricingCheckout\b[\s\S]*?\/>/)?.[0];
  assert.ok(island, "Pricing card must render the checkout island");
  for (const pattern of [/locale=\{locale\}/, /planId=\{planId\}/, /planTitle=\{title\}/, /monthlyAmountMinor=\{amounts\.month\}/, /yearlyAmountMinor=\{amounts\.year\}/, /copy=\{copy\.checkout\}/]) assert.match(island, pattern);
  assert.match(card, /planAmounts\(canonicalPlan, Astro\.props, locale\)/);
  assert.match(card, /<strong>\{amounts\.monthlyDisplay\}<\/strong><span>\/\{copy\.pricing\.month\}<\/span>/);
  assert.match(card, /<strong>\{amounts\.yearlyDisplay\}<\/strong><span>\/\{copy\.pricing\.year\}<\/span>/);
  assert.match(card, /plan_id !== canonicalPlan\.plan_id/);
  assert.match(card, /button\.enable && planId === "starter"/);
  assert.doesNotMatch(card, /planId === "enterprise"|\/contact#demo/);
  const fallback = card.match(/<noscript>[\s\S]*?<\/noscript>/)?.[0];
  assert.ok(fallback, "Starter checkout needs a no-JS fallback");
  assert.match(fallback, /href=\{localizeHref\(button\.link, locale\)\}/);
  assert.match(fallback, /\{copy\.checkout\.contact\}/);
  const source = required("checkout");
  const tree = parsed("checkout");
  const fetches = nodesIn(tree, (node) => ts.isCallExpression(node) && node.expression.getText(tree) === "fetch");
  assert.equal(fetches.length, 1);
  assert.equal(fetches[0].arguments[0].text, "/api/checkout");
  const init = fetches[0].arguments[1];
  assert.equal(propertyValue(init, "method").text, "POST");
  assert.equal(propertyValue(propertyValue(init, "headers"), "Content-Type").text, "application/json");
  assert.equal(propertyValue(init, "signal").getText(tree), "controller.signal");
  const stringify = propertyValue(init, "body");
  assert.equal(stringify.expression.getText(tree), "JSON.stringify");
  const payload = stringify.arguments[0];
  assert.ok(ts.isObjectLiteralExpression(payload));
  assert.deepEqual(payload.properties.map(propertyName).sort(), ["name", "email", "planId", "interval", "locale"].sort());
  for (const locale of ["en", "vi"]) assert.deepEqual(plain(evaluateExpression(payload.getText(tree), { name: "Ada", email: "ada@example.test", planId: "starter", interval: "year", locale })), { name: "Ada", email: "ada@example.test", planId: "starter", interval: "year", locale });
  assert.match(source, /currencyForLocale\(locale\)/);
  assert.match(source, /readonly monthlyAmountMinor: number/);
  assert.match(source, /readonly yearlyAmountMinor: number/);
  assert.doesNotMatch(source, /usdPriceToMinor|vndPriceToMinor/);
  const minorExpression = nodesIn(tree, (node) => ts.isVariableDeclaration(node) && node.name.getText(tree) === "amountMinor")[0]?.initializer;
  const displayExpression = nodesIn(tree, (node) => ts.isVariableDeclaration(node) && node.name.getText(tree) === "amount")[0]?.initializer;
  assert.ok(minorExpression && displayExpression, "Checkout display must derive directly from serialized minor amounts");
  const { formatMinorAmount } = moduleLoader()("currency");
  for (const [locale, currency] of [["en", "usd"], ["vi", "vnd"]]) for (const interval of ["month", "year"]) {
    const [monthlyAmountMinor, yearlyAmountMinor] = approvedPlans[0][currency];
    const amountMinor = evaluateExpression(minorExpression.getText(tree), { interval, monthlyAmountMinor, yearlyAmountMinor });
    assert.equal(amountMinor, interval === "year" ? yearlyAmountMinor : monthlyAmountMinor);
    assert.equal(normalizeMoney(evaluateExpression(displayExpression.getText(tree), { amountMinor, currency, locale, formatMinorAmount })), locale === "vi" ? `${amountMinor.toLocaleString("vi-VN")} ₫` : `$${interval === "year" ? "26.90" : "2.69"}`);
  }
  assert.match(source, /lang=\{locale\}/);
  assert.doesNotMatch(source, /\.validationMessage\b/);
  for (const key of ["requiredName", "requiredEmail", "invalidEmail", "review", "loading", "pending", "failed", "invalidLink", "timeout", "connection"]) assert.match(source, new RegExp(`\\bcopy\\.${key}\\b`));
  assert.match(source, /href=\{`\$\{localePrefix\}\/privacy-policy`\}/);
  assert.match(source, /href=\{`\$\{localePrefix\}\/term-and-condition`\}/);
  assert.match(source, /href=\{`\$\{localePrefix\}\/contact`\}/);
});

function checkoutGuard() {
  const source = required("checkout");
  const tree = parsed("checkout");
  const names = new Set(["paypalOrigins", "sepayCheckoutUrls", "sepayFieldNames", "requiredSepayFields"]);
  const selected = tree.statements.filter((node) =>
    (ts.isFunctionDeclaration(node) && ["isRecord", "checkoutResult"].includes(node.name?.text)) ||
    (ts.isVariableStatement(node) && node.declarationList.declarations.some((declaration) => names.has(declaration.name.getText(tree)))),
  );
  assert.equal(selected.length, 6, "Expected pure locale/provider checkout response guard and explicit provider allowlists");
  const code = ts.transpileModule(`${selected.map((node) => node.getText(tree)).join("\n")}\nexports.guard = checkoutResult;`, { compilerOptions: { module: ts.ModuleKind.CommonJS }, fileName: "checkout-guard.ts" }).outputText;
  const exports = {};
  runInContext(code, createContext({ exports, URL }), { filename: "actual PricingCheckout response guard" });
  return exports.guard;
}

const paypalResult = { success: true, provider: "paypal", url: "https://www.paypal.com/webapps/billing/subscriptions?fixture=offline", orderId: "offline-order" };
const sepayResult = { success: true, provider: "sepay", url: "https://pay.sepay.vn/v1/checkout/init", method: "POST", orderId: "offline-order", fields: { merchant: "offline-merchant", operation: "PURCHASE", order_invoice_number: "offline-order", order_amount: "990000", currency: "VND", signature: "offline-signature" } };

test("pure checkout response guard accepts locale-matched PayPal subscription URLs and SePay signed POST fields without rewriting them", () => {
  const guard = checkoutGuard();
  for (const origin of ["https://www.paypal.com", "https://www.sandbox.paypal.com"]) {
    const result = { ...paypalResult, url: `${origin}/webapps/billing/subscriptions?fixture=offline` };
    assert.deepEqual(plain(guard(result, "en")), result);
  }
  for (const origin of ["https://pay.sepay.vn", "https://pay-sandbox.sepay.vn"]) {
    const result = { ...sepayResult, url: `${origin}/v1/checkout/init`, fields: { ...sepayResult.fields, custom_data: "  signed +&= value  ", lang: "vi" } };
    const accepted = guard(result, "vi");
    assert.ok(accepted);
    assert.equal(accepted.fields, result.fields);
    assert.deepEqual(Object.entries(accepted.fields), Object.entries(result.fields));
    assert.equal(accepted.fields.custom_data, "  signed +&= value  ");
    assert.deepEqual(plain(accepted), result);
  }
  const source = required("checkout");
  assert.match(source, /hostedForm\.method = "POST"/);
  assert.match(source, /hostedForm\.action = checkout\.url/);
  assert.match(source, /HTMLFormElement\.prototype\.submit\.call\(hostedForm\)/);
  assert.match(source, /if \(!dialogRef\.current\?\.open\) return/);
  assert.match(source, /controller\.signal\.aborted/);
});

test("checkout response guard rejects provider/locale mismatches, unsafe or lookalike URLs, and incomplete responses", () => {
  const guard = checkoutGuard();
  assert.equal(guard(paypalResult, "vi"), null);
  assert.equal(guard(sepayResult, "en"), null);
  for (const value of [null, [], "ok", {}, { ...paypalResult, success: false }, { ...paypalResult, provider: "stripe" }, { ...paypalResult, orderId: " " }, { ...paypalResult, orderId: 1 }, { ...paypalResult, url: 1 }]) assert.equal(guard(value, "en"), null, JSON.stringify(value));
  for (const url of [
    "http://www.paypal.com/webapps/billing/subscriptions", "https://paypal.example.test/webapps/billing/subscriptions",
    "https://www.paypal.com.example.test/webapps/billing/subscriptions", "https://www.paypal.com:444/webapps/billing/subscriptions",
    "https://user@www.paypal.com/webapps/billing/subscriptions", "https://user:password@www.paypal.com/webapps/billing/subscriptions",
    "https://www.paypal.com/checkout", "https://www.paypal.com/webapps/billing/subscriptions#fragment", "not a URL",
  ]) assert.equal(guard({ ...paypalResult, url }, "en"), null, url);
  for (const url of ["http://pay.sepay.vn/v1/checkout/init", "https://pay.sepay.vn.example.test/v1/checkout/init", "https://pay.sepay.vn/v1/checkout/init/", "https://pay.sepay.vn/v1/checkout/init?extra=1", "https://pay.sepay.vn/v1/checkout/init#fragment", "https://user@pay.sepay.vn/v1/checkout/init"]) assert.equal(guard({ ...sepayResult, url }, "vi"), null, url);
});

test("SePay one-time response guard rejects malformed/unknown signed fields, wrong method, subscription operation, or USD", () => {
  const guard = checkoutGuard();
  for (const fields of [null, [], {}, { ...sepayResult.fields, signature: "" }, { ...sepayResult.fields, merchant: " " }, { ...sepayResult.fields, currency: "USD" }, { ...sepayResult.fields, operation: "SUBSCRIBE" }, { ...sepayResult.fields, order_amount: 990000 }, { ...sepayResult.fields, injected: "unapproved" }]) assert.equal(guard({ ...sepayResult, fields }, "vi"), null, JSON.stringify(fields));
  assert.equal(guard({ ...sepayResult, method: "GET" }, "vi"), null);
  assert.equal(guard({ ...sepayResult, method: undefined }, "vi"), null);
  for (const name of ["merchant", "operation", "order_invoice_number", "order_amount", "currency", "signature"]) {
    const fields = { ...sepayResult.fields };
    delete fields[name];
    assert.equal(guard({ ...sepayResult, fields }, "vi"), null, name);
  }
});

// Execute the real island with isolated hooks/DOM fixtures. No React renderer,
// environment file, browser navigation, or external fetch is used.
function checkoutIsland(locale) {
  const hooks = [];
  const effects = [];
  const cleanups = [];
  const timers = new Map();
  let cursor = 0;
  let nextTimer = 0;
  let tree;
  const fixture = {
    requests: [], forms: [], submissions: [], navigations: [], interval: "month",
    response: { status: 409, body: { success: false, code: "checkout_unavailable", error: "ignored-upstream-detail" } },
  };
  const react = {
    useId: () => "offline-checkout",
    useRef(initial) {
      const index = cursor++;
      if (!Object.hasOwn(hooks, index)) hooks[index] = { current: initial };
      return hooks[index];
    },
    useState(initial) {
      const index = cursor++;
      if (!Object.hasOwn(hooks, index)) hooks[index] = initial;
      return [hooks[index], (next) => { hooks[index] = typeof next === "function" ? next(hooks[index]) : next; }];
    },
    useEffect(effect) {
      const index = cursor++;
      if (!Object.hasOwn(hooks, index)) { hooks[index] = true; effects.push(effect); }
    },
  };
  const jsx = (type, props) => ({ type, props });
  const dialog = { open: false, showModal() { this.open = true; }, close() { this.open = false; } };
  const trigger = { focus() {}, closest: () => ({ querySelector: () => ({ value: fixture.interval }) }) };
  const heading = { focus() {} };
  const document = {
    body: { append: (form) => fixture.forms.push(form) },
    createElement(type) {
      if (type === "input") return {};
      assert.equal(type, "form");
      return { children: [], removed: false, append(input) { this.children.push(input); }, remove() { this.removed = true; } };
    },
  };
  class HostedForm {
    submit() {
      if (fixture.submitError) throw new Error("offline-submit-error");
      fixture.submissions.push(this);
    }
  }
  const copy = moduleLoader()("messages").getMessages(locale).checkout;
  const currency = moduleLoader()("currency");
  const module = { exports: {} };
  const context = createContext({
    exports: module.exports, module, URL, AbortController, document,
    HTMLFormElement: HostedForm,
    FormData: class { constructor(form) { this.form = form; } get(name) { return this.form.elements.namedItem(name).value; } },
    window: {
      addEventListener() {}, removeEventListener() {},
      setTimeout(callback, delay) { assert.equal(delay, 20_000); timers.set(++nextTimer, callback); return nextTimer; },
      clearTimeout(id) { timers.delete(id); },
      location: { assign: (url) => fixture.navigations.push(url) },
    },
    async fetch(url, options) {
      assert.equal(url, "/api/checkout", "Only the same-origin checkout API may be requested.");
      assert.equal(options.method, "POST");
      assert.equal(options.headers["Content-Type"], "application/json");
      fixture.requests.push({ url, body: JSON.parse(options.body), signal: options.signal });
      if (fixture.fetchImpl) return fixture.fetchImpl(url, options);
      return new Response(JSON.stringify(fixture.response.body), { status: fixture.response.status });
    },
    require(specifier) {
      if (specifier === "react") return react;
      if (specifier === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "fragment" };
      if (specifier === "react-icons/fa6") return { FaXmark: () => null };
      if (specifier === "@/lib/currency") return currency;
      assert.fail(`Checkout fixture forbids module import: ${specifier}`);
    },
  });
  const code = ts.transpileModule(required("checkout"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    fileName: paths.checkout,
  }).outputText;
  runInContext(code, context, { filename: "actual PricingCheckout island (offline)" });
  const props = { locale, planId: "starter", planTitle: "Starter", monthlyAmountMinor: locale === "vi" ? 69_000 : 269, yearlyAmountMinor: locale === "vi" ? 690_000 : 2_690, buttonLabel: "Offline checkout", copy };
  function nodes(node) {
    if (arguments.length === 0) node = tree;
    if (Array.isArray(node)) return node.flatMap(nodes);
    if (!node || typeof node !== "object" || !node.props) return [];
    return [node, ...nodes(node.props.children)];
  }
  function render() {
    cursor = 0;
    tree = module.exports.default(props);
    for (const node of nodes()) if (node.props.ref) {
      node.props.ref.current = node.type === "dialog" ? dialog : node.type === "h2" ? heading : trigger;
    }
    return tree;
  }
  const input = (value, maxLength) => ({ value, maxLength, required: true, validity: {}, setCustomValidity() {} });
  const inputs = { name: input(" Ada Lovelace ", 200), email: input(" ada@example.test ", 254) };
  const form = { elements: { namedItem: (name) => inputs[name] }, reportValidity: () => true };
  render();
  for (const effect of effects) cleanups.push(effect());
  render();
  function open() { nodes().find((node) => node.props.ref?.current === trigger).props.onClick(); render(); }
  function close() { dialog.close(); nodes().find((node) => node.type === "dialog").props.onClose(); render(); }
  open();
  return Object.assign(fixture, {
    copy, render, open, close, timers,
    status: () => nodes().find((node) => node.props.role === "status").props,
    contact: () => nodes().filter((node) => node.type === "a").at(-1).props,
    submitButton: () => nodes().find((node) => node.type === "button" && node.props.type === "submit").props,
    submit: () => nodes().find((node) => node.type === "form").props.onSubmit({ preventDefault() {}, currentTarget: form }),
    dispose: () => { for (const cleanup of cleanups) cleanup?.(); },
  });
}

for (const locale of ["en", "vi"]) {
  test(`checkout island ${locale}: unavailable response uses localized contact state, never upstream text or retry/provider navigation`, async () => {
    const fixture = checkoutIsland(locale);
    try {
      await fixture.submit();
      fixture.render();
      assert.equal(fixture.status()["data-state"], "unavailable");
      assert.equal(fixture.status().children, fixture.copy.unavailable);
      assert.equal(fixture.copy.unavailable, locale === "vi"
        ? "Thanh toán trực tuyến chưa khả dụng cho lựa chọn này. Vui lòng liên hệ đội ngũ VLABS."
        : "Online payment is not available for this selection. Please contact the VLABS team.");
      assert.equal(fixture.contact().href, `${locale === "vi" ? "/vi" : ""}/contact`);
      assert.equal(fixture.contact().children, fixture.copy.unavailableContact);
      assert.equal(typeof fixture.copy.unavailableContact, "string");
      assert.ok(fixture.copy.unavailableContact.trim());
      assert.equal(fixture.submitButton().disabled, false);
      assert.deepEqual(fixture.requests.map(({ body }) => body), [{ name: "Ada Lovelace", email: "ada@example.test", planId: "starter", interval: "month", locale }]);
      assert.equal(fixture.timers.size, 0);
      assert.deepEqual(fixture.forms, []);
      assert.deepEqual(fixture.submissions, []);
      assert.deepEqual(fixture.navigations, []);
    } finally { fixture.dispose(); }
  });
  test(`checkout island ${locale}: ordinary API failures retain generic localized retry/fallback handling`, async () => {
    const fixture = checkoutIsland(locale);
    try {
      for (const [status, body, expected] of [
        [400, { success: false, error: "Offline validation error." }, `Offline validation error. ${fixture.copy.retry}`],
        [500, null, fixture.copy.failed],
        [409, { success: false, code: "unknown", error: "Offline failure." }, `Offline failure. ${fixture.copy.retry}`],
        [200, { success: false, code: "checkout_unavailable", error: "Invalid success envelope." }, `Invalid success envelope. ${fixture.copy.retry}`],
      ]) {
        fixture.response = { status, body };
        await fixture.submit();
        fixture.render();
        assert.equal(fixture.status()["data-state"], "error");
        assert.equal(fixture.status().children, expected);
        assert.equal(fixture.contact().children, fixture.copy.contact);
      }
      assert.deepEqual(fixture.forms, []);
      assert.deepEqual(fixture.navigations, []);
    } finally { fixture.dispose(); }
  });
}

test("checkout island: close/reopen and new submit clear stale unavailable state and prevent duplicate in-flight requests", async () => {
  const fixture = checkoutIsland("en");
  try {
    await fixture.submit(); fixture.render();
    assert.equal(fixture.status()["data-state"], "unavailable");
    fixture.close(); fixture.open();
    assert.equal(fixture.status()["data-state"], "pending");
    assert.equal(fixture.status().children, "");
    const pending = deferred();
    fixture.fetchImpl = () => pending.promise;
    const request = fixture.submit(); fixture.render();
    await fixture.submit();
    assert.equal(fixture.requests.length, 2, "Second submit while pending must not start another request.");
    assert.equal(fixture.submitButton().disabled, true);
    assert.equal(fixture.status().children, fixture.copy.pending);
    pending.resolve(new Response(JSON.stringify({ success: false, error: "Offline retry failed." }), { status: 500 }));
    await request; fixture.render();
    assert.equal(fixture.status()["data-state"], "error");
    assert.equal(fixture.status().children, `Offline retry failed. ${fixture.copy.retry}`);
    assert.equal(fixture.timers.size, 0);
  } finally { fixture.dispose(); }
});

test("checkout island: SePay browser form forwards raw signed fields in exact insertion order and cleans up on close", async () => {
  const fixture = checkoutIsland("vi");
  try {
    const fields = {
      order_amount: "69000", merchant: "test-merchant", currency: "VND", operation: "PURCHASE",
      order_description: "  Starter + thử nghiệm & renewal  ", order_invoice_number: "INV-test-001",
      success_url: "https://checkout.example.test/vi/pricing?checkout=success&order=INV-test-001",
      error_url: "https://checkout.example.test/vi/pricing?checkout=error&order=INV-test-001",
      cancel_url: "https://checkout.example.test/vi/pricing?checkout=cancel&order=INV-test-001",
      lang: "vi", signature: "throwaway-signature+/=",
    };
    fixture.response = { status: 200, body: { ...sepayResult, orderId: "INV-test-001", fields } };
    await fixture.submit(); fixture.render();
    assert.equal(fixture.forms.length, 1);
    assert.equal(fixture.submissions[0], fixture.forms[0]);
    assert.equal(fixture.forms[0].action, "https://pay.sepay.vn/v1/checkout/init");
    assert.equal(fixture.forms[0].method, "POST");
    assert.equal(fixture.forms[0].hidden, true);
    assert.deepEqual(fixture.forms[0].children.map(({ name, value }) => [name, value]), Object.entries(fields));
    assert.ok(fixture.forms[0].children.every(({ type }) => type === "hidden"));
    assert.deepEqual(fixture.navigations, []);
    assert.equal(fixture.timers.size, 0);
    fixture.close();
    assert.equal(fixture.forms[0].removed, true);
  } finally { fixture.dispose(); }
});

test("checkout island: rejected signed response and local submit failure retain safe generic errors", async () => {
  const fixture = checkoutIsland("vi");
  try {
    fixture.response = { status: 200, body: { ...sepayResult, url: "https://pay.sepay.vn.example.test/v1/checkout/init" } };
    await fixture.submit(); fixture.render();
    assert.equal(fixture.status().children, fixture.copy.invalidLink);
    assert.deepEqual(fixture.forms, []);
    fixture.response = { status: 200, body: sepayResult };
    fixture.submitError = true;
    await fixture.submit(); fixture.render();
    assert.equal(fixture.status().children, fixture.copy.connection);
    assert.equal(fixture.forms[0].removed, true);
    assert.deepEqual(fixture.submissions, []);
    assert.deepEqual(fixture.navigations, []);
    assert.equal(fixture.timers.size, 0);
  } finally { fixture.dispose(); }
});

test("checkout island: timeout is localized, and a closed-dialog response cannot navigate or submit a hosted form", async () => {
  for (const timedOut of [true, false]) {
    const fixture = checkoutIsland("vi");
    try {
      const pending = deferred();
      fixture.fetchImpl = () => pending.promise;
      const request = fixture.submit(); fixture.render();
      if (timedOut) [...fixture.timers.values()][0]();
      else fixture.close();
      assert.equal(fixture.requests[0].signal.aborted, true);
      pending.resolve(new Response(JSON.stringify(sepayResult)));
      await request; fixture.render();
      assert.equal(fixture.status().children, timedOut ? fixture.copy.timeout : "");
      assert.deepEqual(fixture.forms, []);
      assert.deepEqual(fixture.submissions, []);
      assert.deepEqual(fixture.navigations, []);
      assert.equal(fixture.timers.size, 0);
    } finally { fixture.dispose(); }
  }
});

// Execute the actual check-site contract functions against in-memory HTML.
// Its CLI build walk is deliberately not run while another writer is active.
function siteContracts(globals = {}) {
  const source = required("siteChecker");
  const tree = parsed("siteChecker");
  const functions = ["attributes", "routeForRelative", "localeRoute", "decodeHtml", "htmlText", "blocks", "metadataIssues", "chromeIssues", "priceDisplay", "pricingIssues", "formIssues", "fallbackIssues", "protectedReferences", "markdownProbe", "resolveBuiltFile", "checkReference"];
  const constants = new Set(["englishRoutes", "expectedPlanAmounts", "vietnameseMenuNames"]);
  const selected = tree.statements.filter((node) =>
    (ts.isFunctionDeclaration(node) && functions.includes(node.name?.text)) ||
    (ts.isVariableStatement(node) && node.declarationList.declarations.some((declaration) => constants.has(declaration.name.getText(tree)))),
  );
  assert.equal(selected.length, functions.length + constants.size, "Expected bilingual build-check contracts are missing; baseline does not implement these checks");
  const code = ts.transpileModule(`${selected.map((node) => node.getText(tree)).join("\n")}\nexports.contracts = { ${[...functions, ...constants].join(", ")} };`, { compilerOptions: { module: ts.ModuleKind.CommonJS }, fileName: "check-site-contracts.ts" }).outputText;
  const exports = {};
  runInContext(code, createContext({ exports, URL, Intl, path, ...globals }), { filename: "actual check-site contracts" });
  return exports.contracts;
}

const fixtureSite = "https://vlabs.example.test";
const escapeHtml = (text) => text.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

function metadataFixture(route, locale) {
  const base = route.replace(/^\/vi(?=\/|$)/, "") || "/";
  const title = base === "/features"
    ? locale === "en" ? "VLABS Features | Students, Teachers and Administrators" : "Tính năng VLABS | Học sinh, giáo viên và quản trị viên"
    : locale === "vi" ? "Trang kiểm thử" : "Fixture Page";
  const description = locale === "vi" ? "Nội dung kiểm thử tiếng Việt." : "Meaningful English fixture description.";
  const isLetter = base === "/open-letter";
  const image = isLetter ? "/images/ceo.jpeg" : "/images/logo.png";
  const imageAlt = isLetter
    ? locale === "en" ? "Portrait of Fixture Founder, founder of Smart Learning Technology Solution" : "Chân dung Fixture Founder, nhà sáng lập Smart Learning Technology Solution"
    : locale === "en" ? "VLABS logo" : "Logo VLABS";
  const size = isLetter ? 768 : 480;
  const letterSchema = isLetter ? `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "WebPage", "@id": `${fixtureSite}${route}#webpage`, url: `${fixtureSite}${route}`, datePublished: "2026-11" })}</script>` : "";
  return `<html lang="${locale}" data-currency="${locale === "vi" ? "vnd" : "usd"}"><head>
    <title>${title}</title><link rel="canonical" href="${fixtureSite}${route}">
    <link rel="alternate" hreflang="en" href="${fixtureSite}${base}">
    <link rel="alternate" hreflang="vi" href="${fixtureSite}/vi${base === "/" ? "" : base}">
    <link rel="alternate" hreflang="x-default" href="${fixtureSite}${base}">
    <meta name="description" content="${description}"><meta property="og:title" content="${title}">
    <meta name="twitter:title" content="${title}"><meta property="og:description" content="${description}">
    <meta name="twitter:description" content="${description}"><meta property="og:url" content="${fixtureSite}${route}">
    <meta property="og:locale" content="${locale === "vi" ? "vi_VN" : "en_US"}"><meta name="robots" content="noindex,follow">
    <meta property="og:image" content="${fixtureSite}${image}"><meta property="og:image:width" content="${size}">
    <meta property="og:image:height" content="${size}"><meta property="og:image:alt" content="${imageAlt}">
    <meta name="twitter:image:alt" content="${imageAlt}">
    </head><body><main><h1>${title}</h1>${isLetter ? `<img class="open-letter-portrait" alt="${imageAlt}" src="${image}">` : ""}${letterSchema}</main></body></html>`;
}

const chromeMenu = {
  main: [{ name: "Features", url: "/features" }, { name: "Pricing", url: "/pricing" }],
  footer_col_1_title: "Platform",
  footer_col_2_title: "Explore",
  footer_col_3_title: "Policies",
  footer_primary: [{ name: "Home", url: "/" }],
  footer_resource: [{ name: "Integrations", url: "/integrations" }],
  footer_legal: [{ name: "Terms and Conditions", url: "/term-and-condition" }],
};

function chromeFixture(route, locale) {
  const localizedPath = (pathname, language = locale) => {
    const base = pathname.replace(/^\/vi(?=\/|$)/, "") || "/";
    return language === "vi" ? `/vi${base === "/" ? "" : base}` : base;
  };
  const names = { Features: "Tính năng", Pricing: "Bảng giá", Home: "Trang chủ", Integrations: "Tích hợp", "Terms and Conditions": "Điều khoản và điều kiện" };
  const link = (item, className) => `<a class="${className}" href="${localizedPath(item.url)}">${locale === "vi" ? names[item.name] : item.name}</a>`;
  const menu = locale === "vi" ? "Trình đơn" : "Menu";
  const selectorName = locale === "vi" ? "Ngôn ngữ và tiền tệ: Tiếng Việt, VND" : "Language and currency: English, USD";
  const choices = ["en", "vi"].map((language) => `<a href="${localizedPath(route, language)}?lang=${language}" data-locale-choice="${language}" lang="${language}" hreflang="${language}"${language === locale ? ' aria-current="true"' : ""}>${language === "vi" ? "Tiếng Việt · VND" : "English · USD"}</a>`).join("");
  const titles = locale === "vi" ? ["Nền tảng", "Khám phá", "Chính sách"] : ["Platform", "Explore", "Policies"];
  const footer = ["footer_primary", "footer_resource", "footer_legal"].map((group, index) => `<nav aria-label="${locale === "vi" ? "Chân trang" : "Footer"} ${titles[index]}"><h2>${titles[index]}</h2>${chromeMenu[group].map((item) => link(item, "footer-link")).join("")}</nav>`).join("");
  return `<a class="skip-link" href="#main-content">${locale === "vi" ? "Bỏ qua để đến nội dung" : "Skip to Content"}</a><header>
    <nav aria-label="${locale === "vi" ? "Điều hướng chính" : "Main Navigation"}"><ul class="desktop-navigation">${chromeMenu.main.map((item) => link(item, "nav-link")).join("")}</ul>
    <button type="button" data-theme-toggle role="switch" aria-label="${locale === "vi" ? "Chế độ tối" : "Dark mode"}" data-theme-light-label="${locale === "vi" ? "Chuyển sang chế độ sáng" : "Switch to light mode"}" data-theme-dark-label="${locale === "vi" ? "Chuyển sang chế độ tối" : "Switch to dark mode"}" aria-checked="false" hidden></button>
    <details data-locale-selector><summary aria-label="${selectorName}" aria-controls="locale-options"><span aria-hidden="true">${locale.toUpperCase()}</span></summary><div id="locale-options">${choices}</div></details>
    <details class="mobile-navigation"><summary aria-label="${menu}" aria-controls="mobile-menu"><svg aria-hidden="true"></svg><span>${menu}</span></summary><ul id="mobile-menu">${chromeMenu.main.map((item) => link(item, "nav-link")).join("")}</ul></details></nav></header>
    <footer>${footer}<p>${locale === "vi" ? "Trao thêm khả năng cho người học và nhà giáo dục. Bảo lưu mọi quyền." : "Empowering learners and educators. All Rights Reserved."}</p></footer><main id="main-content"></main>`;
}

test("built chrome checker accepts localized menus, native selector/mobile summaries, footer navigation, and same-document skip links", () => {
  const { chromeIssues } = siteContracts();
  for (const [route, locale] of [["/", "en"], ["/vi", "vi"], ["/pricing", "en"], ["/vi/pricing", "vi"], ["/404", "en"], ["/vi/404", "vi"]]) assert.deepEqual(plain(chromeIssues(chromeFixture(route, locale), route, fixtureSite, chromeMenu)), [], route);
});

test("built chrome checker rejects untranslated accessible names and broken native summary controls", () => {
  const { chromeIssues } = siteContracts();
  const html = chromeFixture("/vi/pricing", "vi");
  for (const [mutated, expected] of [
    [html.replace('aria-label="Điều hướng chính"', 'aria-label="Main Navigation"'), /main navigation accessible name/],
    [html.replace('aria-label="Chân trang Nền tảng"', 'aria-label="Footer Nền tảng"'), /footer navigation accessible name/],
    [html.replace('aria-label="Trình đơn"', 'aria-label="Menu"'), /native mobile summary/],
    [html.replace("<span>Trình đơn</span>", "<span>Menu</span>"), /native mobile summary/],
    [html.replace('aria-controls="mobile-menu"', 'aria-controls="missing-menu"'), /native mobile summary/],
    [html.replace('id="mobile-menu"', 'id="missing-menu"'), /native mobile summary/],
    [html.replace('aria-label="Ngôn ngữ và tiền tệ: Tiếng Việt, VND"', 'aria-label="Language and currency: English, USD"'), /native language summary/],
    [html.replace('aria-controls="locale-options"', 'aria-controls="missing-options"'), /native language summary/],
    [html.replace('id="locale-options"', 'id="missing-options"'), /native language summary/],
    [html.replace('aria-label="Chế độ tối"', 'aria-label="Dark mode"'), /theme switch stable name/],
    [html.replace('data-theme-light-label="Chuyển sang chế độ sáng"', 'data-theme-light-label="Switch to light mode"'), /theme action titles/],
    [html.replace("Bảo lưu mọi quyền.", "All Rights Reserved."), /English footer fallback/],
  ]) {
    assert.notEqual(mutated, html, `Mutation must exercise ${expected}`);
    assert.ok(chromeIssues(mutated, "/vi/pricing", fixtureSite, chromeMenu).some((issue) => expected.test(issue)), String(expected));
  }
});

test("built chrome checker detects missing/duplicate menu links, invalid no-JS locale choices, and rewritten skip anchors", () => {
  const { chromeIssues } = siteContracts();
  const html = chromeFixture("/vi/pricing", "vi");
  const enChoice = '<a href="/pricing?lang=en" data-locale-choice="en" lang="en" hreflang="en">English · USD</a>';
  for (const [mutated, expected] of [
    [html.replace('<a class="nav-link" href="/vi/features">Tính năng</a>', ""), /desktop\/mobile menu/],
    [html.replace('<a class="footer-link" href="/vi">Trang chủ</a>', '<a class="footer-link" href="/vi">Home</a>'), /footer must contain localized/],
    [html.replace("</header>", `<a class="nav-link" href="/vi/pricing">Bảng giá</a></header>`), /desktop\/mobile menu/],
    [html.replace("</footer>", '<a class="footer-link" href="/vi">Trang chủ</a></footer>'), /footer must contain localized/],
    [html.replace(enChoice, `${enChoice}${enChoice}`), /exactly two functional language links/],
    [html.replace('href="/pricing?lang=en" data-locale-choice', 'href="#" data-locale-choice'), /no-JS en choice/],
    [html.replace('data-locale-choice="vi" lang="vi"', 'data-locale-choice="vi" lang="en"'), /no-JS vi choice/],
    [html.replace(' aria-current="true"', ""), /vi choice current state/],
    [html.replace('href="#main-content"', 'href="/vi#main-content"'), /same-document navigation/],
  ]) {
    assert.notEqual(mutated, html, `Mutation must exercise ${expected}`);
    assert.ok(chromeIssues(mutated, "/vi/pricing", fixtureSite, chromeMenu).some((issue) => expected.test(issue)), String(expected));
  }
  assert.ok(chromeIssues("", "/vi/pricing", fixtureSite, chromeMenu).includes("missing shared header/footer"));
});

test("build contracts preserve nine English routes, exclude withdrawn sections, require counterparts, and map 404.html to /404", () => {
  const { englishRoutes, routeForRelative, localeRoute } = siteContracts();
  assert.deepEqual(plain(englishRoutes).sort(), ["/", "/404", "/contact", "/features", "/integrations", "/open-letter", "/pricing", "/privacy-policy", "/term-and-condition"].sort());
  const publicRoutes = new Set(englishRoutes.flatMap((route) => [route, localeRoute(route, "vi")]));
  assert.equal(publicRoutes.size, 18);
  const indexableRoutes = [...publicRoutes].filter((route) => !/^(?:\/vi)?\/(?:404|privacy-policy|term-and-condition)$/.test(route));
  assert.equal(indexableRoutes.length, 12);
  assert.ok(!publicRoutes.has("/business"));
  assert.ok(!publicRoutes.has("/vi/business"));
  for (const base of ["/about", "/careers", "/careers/marketing-specialist", "/careers/seo-product-manager", "/careers/senior-frontend-developer", "/careers/ux-ui-designer", "/case-study", "/case-study/kyber-security", "/case-study/technova"])
    for (const route of [base, localeRoute(base, "vi")]) assert.ok(!publicRoutes.has(route), `${route}: withdrawn route is not public content`);
  for (const [relative, route] of [["index.html", "/"], ["404.html", "/404"], ["vi/index.html", "/vi"], ["vi/404/index.html", "/vi/404"], ["vi/404.html", "/vi/404"], ["pricing/index.html", "/pricing"], ["vi/careers/example/index.html", "/vi/careers/example"], ["vi\\pricing\\index.html", "/vi/pricing"]]) assert.equal(routeForRelative(relative), route);
  const source = required("siteChecker");
  assert.match(source, /pages\.length !== expectedRoutes\.size/);
  assert.match(source, /unexpected draft\/index\/API\/SSR or changed canonical route/);
});

test("metadata checker accepts self-canonical reciprocal EN/VI/x-default alternates including both 404 routes", () => {
  const { metadataIssues } = siteContracts();
  for (const [route, locale] of [["/", "en"], ["/vi", "vi"], ["/pricing", "en"], ["/vi/pricing", "vi"], ["/404", "en"], ["/vi/404", "vi"], ["/features", "en"], ["/vi/features", "vi"], ["/open-letter", "en"], ["/vi/open-letter", "vi"]]) assert.deepEqual(plain(metadataIssues(metadataFixture(route, locale), route, fixtureSite)), [], route);
});

test("metadata checker rejects missing, duplicate, guessed, or mismatched social image dimensions/alt", () => {
  const { metadataIssues } = siteContracts();
  const logo = metadataFixture("/vi", "vi");
  const portrait = metadataFixture("/open-letter", "en");
  for (const [html, route, expected] of [
    [logo.replace('property="og:image:width" content="480"', 'property="og:image:width" content="1200"'), "/vi", /og:image:width/],
    [logo.replace('<meta property="og:image:height" content="480">', ""), "/vi", /og:image:height/],
    [logo.replace('property="og:image:alt" content="Logo VLABS"', 'property="og:image:alt" content=""'), "/vi", /og:image:alt/],
    [logo.replace('name="twitter:image:alt" content="Logo VLABS"', 'name="twitter:image:alt" content="Unrelated image"'), "/vi", /twitter:image:alt/],
    [logo.replace("</head>", '<meta property="og:image:width" content="480"></head>'), "/vi", /og:image:width/],
    [logo.replace('/images/logo.png', '/images/unknown.png'), "/vi", /must not guess metadata/],
    [portrait.replace('property="og:image:width" content="768"', 'property="og:image:width" content="480"'), "/open-letter", /og:image:width/],
    [portrait.replace('property="og:image:height" content="768"', 'property="og:image:height" content="480"'), "/open-letter", /og:image:height/],
    [portrait.replace('property="og:image:alt" content="Portrait of Fixture Founder, founder of Smart Learning Technology Solution"', 'property="og:image:alt" content="VLABS logo"'), "/open-letter", /og:image:alt/],
  ]) assert.ok(metadataIssues(html, route, fixtureSite).some((issue) => expected.test(issue)), String(expected));
  const unknown = logo.replace('/images/logo.png', '/images/unknown.png').replace(/<meta (?:property|name)="(?:og:image:(?:width|height|alt)|twitter:image:alt)"[^>]*>/g, "");
  assert.deepEqual(plain(metadataIssues(unknown, "/vi", fixtureSite)), [], "Unknown images omit unverified metadata");
});

test("metadata checker pins exact feature titles within sixty Unicode code points in both locales", () => {
  const { metadataIssues } = siteContracts();
  for (const locale of ["en", "vi"]) {
    const route = locale === "en" ? "/features" : "/vi/features";
    const html = metadataFixture(route, locale);
    const title = html.match(/<title>([^<]+)<\/title>/)[1];
    assert.ok([...title].length <= 60);
    for (const changed of ["X".repeat(61), "Different short feature title"])
      assert.ok(metadataIssues(html.replace(`<title>${title}</title>`, `<title>${changed}</title>`), route, fixtureSite).some((issue) => /features title/.test(issue)));
  }
});

test("metadata checker requires one source-month WebPage only on each open letter and rejects modification dates", () => {
  const { metadataIssues } = siteContracts();
  for (const locale of ["en", "vi"]) {
    const route = locale === "en" ? "/open-letter" : "/vi/open-letter";
    const html = metadataFixture(route, locale);
    const script = html.match(/<script type="application\/ld\+json">[\s\S]*?<\/script>/)[0];
    for (const mutated of [html.replace(script, ""), html.replace(script, script + script), html.replace('"datePublished":"2026-11"', '"datePublished":"2026-11-17"')])
      assert.ok(metadataIssues(mutated, route, fixtureSite).some((issue) => /exactly one WebPage.*2026-11/.test(issue)));
    assert.ok(metadataIssues(html.replace('"datePublished":"2026-11"', '"datePublished":"2026-11","dateModified":"2026-11"'), route, fixtureSite).some((issue) => /dateModified/.test(issue)));
    const other = metadataFixture(locale === "en" ? "/" : "/vi", locale).replace("</main>", `${script}</main>`);
    assert.ok(metadataIssues(other, locale === "en" ? "/" : "/vi", fixtureSite).some((issue) => /only open-letter/.test(issue)));
  }
});

test("compact header brand may shrink without changing fixed controls, focus rules, or Vietnamese desktop breakpoints", async () => {
  const css = await readFile(resolve(sourceRoot, "src/styles/navigation.css"), "utf8");
  const compact = css.replace(/\/\*[\s\S]*?\*\//g, "").match(/@media \(max-width: 639px\) \{([\s\S]*?)\n\}/)?.[1];
  assert.ok(compact);
  const brand = compact.match(/\.header-inner > \.navbar-brand\s*\{([^}]+)\}/)?.[1];
  assert.match(brand, /min-width:\s*0\s*;/);
  assert.match(brand, /flex-shrink:\s*1\s*;/);
  const lineHeight = Number(brand.match(/line-height:\s*([\d.]+)\s*;/)?.[1]);
  assert.equal(lineHeight, 1.3, "Keep the measured compact-brand height correction");
  const base = await readFile(resolve(sourceRoot, "src/styles/base.css"), "utf8");
  const rem = Number(base.match(/html\s*\{\s*font-size:\s*([\d.]+)px;/)?.[1]);
  const headerHeight = Number(base.match(/--header-height:\s*([\d.]+)rem;/)?.[1]) * rem;
  const focus = base.match(/:focus-visible\s*\{([^}]+)\}/)?.[1];
  const outline = Number(focus?.match(/outline:\s*([\d.]+)px\s+solid/)?.[1]);
  const offset = Number(focus?.match(/outline-offset:\s*([\d.]+)px;/)?.[1]);
  assert.equal(outline, 3);
  assert.equal(offset, 3);
  // Source-contract budget from the 360px browser fixture: 25px title, 6px gap,
  // three 7px tagline lines, and 44px logo. Browser checks actual painted boxes.
  const ringTopAt360 = (leading) =>
    (headerHeight - Math.max(44, 25 + 6 + 3 * 7 * leading)) / 2 - outline - offset;
  assert.ok(ringTopAt360(lineHeight) >= 0, "Wrapped brand must leave its entire focus outline inside the viewport");
  assert.ok(ringTopAt360(1.4) < 0, "Budget catches the measured 1.4 line-height clipping regression");
  assert.doesNotMatch(compact, /focus|outline|overflow-x:\s*(?:hidden|clip)/, "Do not hide overflow or clip focus rings");
  const actions = css.match(/\.header-actions\s*\{([^}]+)\}/)?.[1];
  assert.match(actions, /flex-shrink:\s*0\s*;/);
  const vietnamese = css.match(/@media \(min-width: 1024px\) and \(max-width: 1279px\) \{([\s\S]*?)\n\}/)?.[1];
  assert.match(vietnamese, /html\[lang="vi"\] \.desktop-navigation\s*\{\s*display:\s*none;/);
  assert.match(vietnamese, /html\[lang="vi"\] \.mobile-navigation\s*\{\s*display:\s*block;/);
});

test("metadata checker rejects wrong lang/currency/canonical/alternates, duplicates, untranslated social copy, and lost noindex", () => {
  const { metadataIssues } = siteContracts();
  const html = metadataFixture("/vi/404", "vi");
  const cases = [
    [html.replace('lang="vi"', 'lang="en"'), /html\.lang=vi/],
    [html.replace('data-currency="vnd"', 'data-currency="usd"'), /html currency/],
    [html.replace('rel="canonical" href="https://vlabs.example.test/vi/404"', 'rel="canonical" href="https://vlabs.example.test/404.html"'), /self-canonical/],
    [html.replace('hreflang="vi" href="https://vlabs.example.test/vi/404"', 'hreflang="vi" href="https://vlabs.example.test/404"'), /reciprocal vi alternate/],
    [html.replace("</head>", '<link rel="alternate" hreflang="en" href="https://vlabs.example.test/404"></head>'), /reciprocal en alternate/],
    [html.replace('property="og:locale" content="vi_VN"', 'property="og:locale" content="en_US"'), /og:locale/],
    [html.replace('name="twitter:title" content="Trang kiểm thử"', 'name="twitter:title" content="English fallback"'), /twitter:title/],
    [html.replace('<meta name="robots" content="noindex,follow">', ""), /must remain noindex/],
  ];
  for (const [mutated, expected] of cases) assert.ok(metadataIssues(mutated, "/vi/404", fixtureSite).some((issue) => expected.test(issue)), String(expected));
});

test("existing local resolver still checks 404.html, static route indexes, containment, and missing targets", async () => {
  const buildRoot = "/offline/dist/client";
  const known = new Set([`${buildRoot}/404.html`, `${buildRoot}/vi/404/index.html`, `${buildRoot}/images/logo.png`]);
  const { resolveBuiltFile } = siteContracts({ buildRoot, async stat(filename) {
    if (!known.has(filename)) throw new Error("Missing offline fixture");
    return { isFile: () => true };
  } });
  assert.equal(await resolveBuiltFile(new URL("/404", fixtureSite)), `${buildRoot}/404.html`);
  assert.equal(await resolveBuiltFile(new URL("/vi/404", fixtureSite)), `${buildRoot}/vi/404/index.html`);
  assert.equal(await resolveBuiltFile(new URL("/images/logo.png", fixtureSite)), `${buildRoot}/images/logo.png`);
  assert.equal(await resolveBuiltFile(new URL("/missing", fixtureSite)), undefined);
  assert.equal(await resolveBuiltFile(new URL("/..%2Foutside.html", fixtureSite)), undefined);
});

test("original reference checker retains invalid URL, missing asset, and fragment failures while ignoring external/mailto/API", async () => {
  const buildRoot = "/offline/dist/client";
  const failures = new Set();
  const { checkReference } = siteContracts({ buildRoot, failures, site: new URL(fixtureSite), async stat(filename) {
    if (filename !== `${buildRoot}/contact/index.html` && filename !== `${buildRoot}/images/logo.png`) throw new Error("Missing offline fixture");
    return { isFile: () => true };
  }, async readFile() { return '<main id="demo"><h1>Contact</h1></main>'; } });
  const pageUrl = new URL("/pricing", fixtureSite);
  await checkReference("/contact#demo", "pricing/index.html", pageUrl);
  await checkReference("/images/logo.png", "pricing/index.html", pageUrl);
  for (const href of ["mailto:team@example.test", "tel:+84000000000", "data:text/plain,offline", "/api/locale", "https://external.example.test/missing"]) await checkReference(href, "pricing/index.html", pageUrl);
  assert.deepEqual([...failures], []);
  await checkReference("http://[", "pricing/index.html", pageUrl);
  await checkReference("/missing.png", "pricing/index.html", pageUrl);
  await checkReference("/contact#missing", "pricing/index.html", pageUrl);
  assert.deepEqual([...failures].sort(), ["pricing/index.html: invalid URL http://[", "pricing/index.html: missing local target /missing.png", "pricing/index.html: missing anchor /contact#missing"].sort());
});

function pricingFixture(locale, { yearlyComparison = true } = {}) {
  const currency = locale === "vi" ? "vnd" : "usd";
  const copy = moduleLoader()("messages").getMessages(locale);
  const formatted = (plan, interval) => locale === "vi" ? `${plan.vnd[interval === "year" ? 1 : 0].toLocaleString("vi-VN")} ₫` : `$${interval === "year" ? plan.yearly_price : plan.price}`;
  const contactHref = locale === "vi" ? "/vi/contact" : "/contact";
  const props = { locale: [0, locale], planId: [0, "starter"], monthlyAmountMinor: [0, approvedPlans[0][currency][0]], yearlyAmountMinor: [0, approvedPlans[0][currency][1]] };
  const summary = copy.checkout.monthlySummary.replace("{amount}", () => formatted(approvedPlans[0], "month"));
  const title = copy.checkout.title.replace("{plan}", () => "Starter");
  const checkout = `<astro-island props="${escapeHtml(JSON.stringify(props))}"><button>${locale === "vi" ? "Bắt đầu với Starter" : "Get Started with Starter"}</button><dialog class="checkout-dialog" lang="${locale}"><h2>${title}</h2>${summary}</dialog></astro-island><noscript><p>${copy.pricing.noCheckout} <a href="${contactHref}">${copy.checkout.contact}</a> ${copy.pricing.instead}</p></noscript>`;
  const contact = `<a class="btn btn-outline w-full" href="${contactHref}">${locale === "vi" ? "Liên hệ VLABS" : "Contact VLABS"}</a>`;
  const cards = approvedPlans.map((plan) => `<article data-plan-id="${plan.plan_id}">${["month", "year"].map((interval) => `<p data-billing-price="${interval}" data-currency="${currency}" data-amount-minor="${plan[currency][interval === "year" ? 1 : 0]}" ${interval === "year" ? "hidden" : ""}><strong>${formatted(plan, interval)}</strong><span>/${copy.pricing[interval]}</span></p>`).join("")}${plan.plan_id === "starter" ? checkout : contact}</article>`).join("");
  const comparison = ["month", ...(yearlyComparison ? ["year"] : [])].map((interval) => `<tr data-comparison-kind="${interval === "year" ? "yearly_price" : "monthly_price"}"><th>${interval}</th>${approvedPlans.map((plan) => `<td data-plan-id="${plan.plan_id}" data-currency="${currency}" data-amount-minor="${plan[currency][interval === "year" ? 1 : 0]}">${formatted(plan, interval)}</td>`).join("")}</tr>`).join("");
  const monthNote = copy.pricing.monthlyNote;
  const yearNote = copy.pricing.yearlyNote;
  const rate = copy.pricing.fixedRate;
  return `${cards}<table class="plan-table">${comparison}</table><p data-billing-note data-month-note="${escapeHtml(monthNote)}" data-year-note="${escapeHtml(yearNote)}">${monthNote}</p><p data-fixed-rate>${rate}</p>`;
}

test("built price checker uses canonical pinned matrix for all cards and comparison rows, both periods and currencies", () => {
  const { pricingIssues, expectedPlanAmounts } = siteContracts();
  assert.deepEqual(plain(expectedPlanAmounts), Object.fromEntries(approvedPlans.map((plan) => [plan.plan_id, { usd: { month: plan.usd[0], year: plan.usd[1] }, vnd: { month: plan.vnd[0], year: plan.vnd[1] } }])));
  for (const locale of ["en", "vi"]) assert.deepEqual(plain(pricingIssues(pricingFixture(locale), locale === "vi" ? "/vi/pricing" : "/pricing")), [], locale);
});

test("built price checker rejects missing annual comparison rather than claiming both periods are covered", () => {
  const { pricingIssues } = siteContracts();
  for (const locale of ["en", "vi"]) assert.ok(pricingIssues(pricingFixture(locale, { yearlyComparison: false }), locale === "vi" ? "/vi/pricing" : "/pricing").some((issue) => /comparison must expose one approved year price row/.test(issue)));
});

test("built price checker detects stale card/comparison minor amounts, display text, currency, and no-JS visibility", () => {
  const { pricingIssues } = siteContracts();
  const vi = pricingFixture("vi");
  for (const [mutated, expected] of [
    [vi.replace('data-amount-minor="690000"', 'data-amount-minor="699400"'), /card: starter\/year must equal/],
    [vi.replace('<td data-plan-id="enterprise" data-currency="vnd" data-amount-minor="990000">', '<td data-plan-id="enterprise" data-currency="vnd" data-amount-minor="1011400">'), /comparison: enterprise\/year must equal/],
    [vi.replace("<strong>69.000 ₫</strong>", "<strong>69.940 ₫</strong>"), /starter\/month display does not match/],
    [vi.replace('data-currency="vnd"', 'data-currency="usd"'), /starter\/month must equal/],
    [vi.replace('690000" hidden', '690000"'), /starter\/year no-JS visibility/],
    [vi.replace("/tài khoản/tháng", "/acc/month"), /starter\/month account\/period unit or slash spacing is not localized/],
    [vi.replace("/tài khoản/tháng", " / tài khoản/tháng"), /starter\/month account\/period unit or slash spacing is not localized/],
  ]) assert.ok(pricingIssues(mutated, "/vi/pricing").some((issue) => expected.test(issue)), String(expected));
  const en = pricingFixture("en");
  assert.ok(pricingIssues(en.replace("<strong>$26.90</strong>", "<strong>$26.9</strong>"), "/pricing").some((issue) => /starter\/year display does not match/.test(issue)));
  assert.ok(pricingIssues(en.replace("/acc/month", " / acc/month"), "/pricing").some((issue) => /starter\/month account\/period unit or slash spacing is not localized/.test(issue)));
});

test("built price checker pins Starter island/dialog, contact CTAs, no-JS fallback, and localized serialized amounts", () => {
  const { pricingIssues } = siteContracts();
  for (const locale of ["en", "vi"]) {
    const route = locale === "vi" ? "/vi/pricing" : "/pricing";
    const html = pricingFixture(locale);
    const contactHref = locale === "vi" ? "/vi/contact" : "/contact";
    const contactLabel = locale === "vi" ? "Liên hệ VLABS" : "Contact VLABS";
    const dialog = html.match(/<dialog\b[\s\S]*?<\/dialog>/)[0];
    const withoutDialog = html.replace(dialog, "");
    const movedDialog = withoutDialog.replace('<article data-plan-id="enterprise">', `<article data-plan-id="enterprise">${dialog}`);
    const mutations = [
      [movedDialog, /Starter card must own the only checkout island\/dialog/],
      [movedDialog, /enterprise card must not render a checkout island\/dialog/],
      [html.replace("</astro-island>", `${dialog}</astro-island>`), /expected one Starter checkout dialog/],
      [html.replace(`href="${contactHref}">${contactLabel}`, `href="${contactHref}#demo">${contactLabel}`), /campus CTA must be the localized Contact VLABS link to \/contact/],
      [html.replace(`href="${contactHref}">${contactLabel}`, `href="${contactHref}">Request a Demo`), /campus CTA must be the localized Contact VLABS link to \/contact/],
      [html.replace(`<noscript><p>${moduleLoader()("messages").getMessages(locale).pricing.noCheckout} <a href="${contactHref}">`, `<noscript><p>Fallback <a href="${contactHref}#demo">`), /Starter no-JS fallback must link to localized \/contact/],
      [html.replace('&quot;planId&quot;:[0,&quot;starter&quot;]', '&quot;planId&quot;:[0,&quot;enterprise&quot;]'), /Starter checkout props must carry approved localized month\/year minor amounts and immutable ID/],
      [html.replace(`&quot;monthlyAmountMinor&quot;:[0,${approvedPlans[0][locale === "vi" ? "vnd" : "usd"][0]}]`, '&quot;monthlyAmountMinor&quot;:[0,1]'), /Starter checkout props must carry approved localized month\/year minor amounts and immutable ID/],
      [html.replace(`&quot;yearlyAmountMinor&quot;:[0,${approvedPlans[0][locale === "vi" ? "vnd" : "usd"][1]}]`, '&quot;yearlyAmountMinor&quot;:[0,1]'), /Starter checkout props must carry approved localized month\/year minor amounts and immutable ID/],
    ];
    for (const [mutated, expected] of mutations) assert.ok(pricingIssues(mutated, route).some((issue) => expected.test(issue)), `${locale}: ${expected}`);
  }
});

test("built checker bans USD/Stripe from VI checkout, requires provider renewal notes, and permits independent USD/VND billing disclosure", () => {
  const { pricingIssues } = siteContracts();
  assert.deepEqual(plain(pricingIssues(pricingFixture("vi"), "/vi/pricing")), []);
  const badCheckout = pricingFixture("vi").replace("69.000 ₫ cho kỳ", "$2.69 USD through Stripe cho kỳ");
  assert.ok(pricingIssues(badCheckout, "/vi/pricing").some((issue) => /Vietnamese checkout must not claim USD, Stripe/.test(issue)));
  const badNotes = pricingFixture("vi").replaceAll("chủ động lựa chọn gia hạn", "tự động gia hạn").replaceAll("không tự động thu tiền", "tự động thu tiền");
  assert.ok(pricingIssues(badNotes, "/vi/pricing").some((issue) => /month billing note lacks SePay\/VND one-time\/manual/.test(issue)));
  assert.ok(pricingIssues(badNotes, "/vi/pricing").some((issue) => /year billing note lacks SePay\/VND one-time\/manual/.test(issue)));
  for (const locale of ["en", "vi"]) {
    const rate = moduleLoader()("messages").getMessages(locale).pricing.fixedRate;
    const oldRate = locale === "vi" ? "Giá dùng tỷ lệ cố định 1 USD = 26.000 VND, không phải tỷ giá trực tiếp." : "A fixed 1 USD = 26,000 VND, not a live exchange rate.";
    assert.ok(pricingIssues(pricingFixture(locale).replace(rate, oldRate), locale === "vi" ? "/vi/pricing" : "/pricing").some((issue) => /independent USD\/VND listed-price billing disclosure/.test(issue)));
  }
});

function formFixture(locale) {
  const copy = { name: locale === "vi" ? "Họ và tên" : "Full Name", email: locale === "vi" ? "Địa chỉ email" : "Email Address" };
  return `<form data-enquiry-form="contact" data-locale="${locale}" lang="${locale}" method="POST" action="/api/contact?lang=${locale}" data-form-copy="${escapeHtml(JSON.stringify(copy))}"><input type="hidden" name="locale" value="${locale}"><label>${copy.name}</label><label>${copy.email}</label></form>`;
}

test("built native forms validate locale/action/copy and reject VI API prefix or English fallback", () => {
  const { formIssues } = siteContracts();
  for (const locale of ["en", "vi"]) assert.deepEqual(plain(formIssues(formFixture(locale), locale === "vi" ? "/vi/contact" : "/contact", fixtureSite)), []);
  for (const [mutated, expected] of [
    [formFixture("vi").replace("/api/contact", "/vi/api/contact"), /unprefixed same-origin/],
    [formFixture("vi").replace("?lang=vi", "?lang=en"), /locale-aware POST/],
    [formFixture("vi").replace('name="locale" value="vi"', 'name="locale" value="en"'), /hidden validated locale field/],
    [formFixture("vi").replaceAll("Họ và tên", "Full Name"), /copy is missing or English fallback/],
    [formFixture("vi").replace("</form>", "<p>All fields are required.</p></form>"), /English enquiry body fallback/],
  ]) assert.ok(formIssues(mutated, "/vi/contact", fixtureSite).some((issue) => expected.test(issue)), String(expected));
});

test("built fallback checks examine real main/Markdown body, not localized frontmatter or script copy", () => {
  const { fallbackIssues, markdownProbe } = siteContracts();
  const english = '<title>Example role</title><meta name="description" content="English description"><main><h1>Example role</h1><article class="content"><h2>Example Focus</h2><p>Meaningful English body paragraph with several words.</p></article></main>';
  const vietnamese = '<title>Vai trò minh họa</title><meta name="description" content="Mô tả tiếng Việt"><main><h1>Vai trò minh họa</h1><article class="content"><h2>Trọng tâm minh họa</h2><p>Nội dung tiếng Việt cần được tạo từ tài liệu đã chọn.</p></article></main>';
  assert.deepEqual(plain(fallbackIssues(english, vietnamese)), []);
  const frontmatterOnly = vietnamese.replace('<h2>Trọng tâm minh họa</h2><p>Nội dung tiếng Việt cần được tạo từ tài liệu đã chọn.</p>', '<h2>Example Focus</h2><p>Meaningful English body paragraph with several words.</p>');
  const issues = fallbackIssues(english, frontmatterOnly);
  assert.ok(issues.some((issue) => /English paragraph remains/.test(issue)));
  assert.ok(issues.some((issue) => /generated Markdown body is English fallback despite localized frontmatter/.test(issue)));
  const scriptOnly = '<title>Translated</title><meta name="description" content="Different"><main><h1>Role</h1><p>English body only.</p></main><script>{"copy":"Nội dung tiếng Việt"}</script>';
  assert.ok(fallbackIssues(english, scriptOnly).some((issue) => /main has no translated prose/.test(issue)));
  assert.deepEqual(plain(markdownProbe('---\ntitle: "English frontmatter must not count"\n---\n## Trọng tâm minh họa\n\n**Nội dung tiếng Việt** và [liên kết](/privacy-policy).')), { heading: "Trọng tâm minh họa", paragraph: "Nội dung tiếng Việt và liên kết.", body: "## Trọng tâm minh họa Nội dung tiếng Việt và liên kết." });
});

test("protected-reference checker keeps assets, mailto/tel destinations, and full external URLs unchanged across localized markup", () => {
  const { protectedReferences } = siteContracts();
  const common = '<link rel="stylesheet" href="/_astro/main.css"><script src="/scripts/locale.js"></script><img src="/images/logo.png" alt="logo"><a href="mailto:team@example.test?subject=English">Email</a><a href="tel:+84000000000">Phone</a><a href="https://external.example.test/x?billing=year&amp;lang=en#plans">External</a><img src="//cdn.example.test/image.png?version=1#image"><a href="/pricing">Pricing</a>';
  const vi = common.replace("subject=English", "subject=Ti%E1%BA%BFng%20Vi%E1%BB%87t").replace("Email</a>", "Gửi email</a>").replace("Phone</a>", "Điện thoại</a>");
  const expected = { assets: ["/_astro/main.css", "/images/logo.png", "/scripts/locale.js"], contacts: ["mailto:team@example.test", "tel:+84000000000"], external: ["https://cdn.example.test/image.png?version=1#image", "https://external.example.test/x?billing=year&lang=en#plans"] };
  assert.deepEqual(plain(protectedReferences(common, `${fixtureSite}/contact`, fixtureSite)), expected);
  assert.deepEqual(plain(protectedReferences(vi, `${fixtureSite}/vi/contact`, fixtureSite)), expected);
});

test("protected-reference comparison exposes localized asset/contact/external destination drift while ignoring page counterpart paths", () => {
  const { protectedReferences } = siteContracts();
  const html = '<a href="/pricing">Pricing</a><img src="/images/logo.png"><a href="mailto:team@example.test">Email</a><a href="tel:+84000000000">Phone</a><a href="https://external.example.test/pricing?billing=year#plans">External</a>';
  const reference = plain(protectedReferences(html, `${fixtureSite}/contact`, fixtureSite));
  const compare = (mutated) => plain(protectedReferences(mutated, `${fixtureSite}/vi/contact`, fixtureSite));
  assert.deepEqual(compare(html.replace('href="/pricing"', 'href="/vi/pricing"')), reference);
  for (const [mutated, key] of [
    [html.replace("/images/logo.png", "/vi/images/logo.png"), "assets"],
    [html.replace("team@example.test", "other@example.test"), "contacts"],
    [html.replace("tel:+84000000000", "tel:+84000000001"), "contacts"],
    [html.replace("external.example.test/pricing", "external.example.test/vi/pricing"), "external"],
    [html.replace("?billing=year#plans", "?billing=year&lang=vi#plans"), "external"],
  ]) assert.notDeepEqual(compare(mutated)[key], reference[key], key);
  assert.match(required("siteChecker"), /enProtected\.external/);
  assert.match(required("siteChecker"), /external URLs changed between counterparts/);
});
