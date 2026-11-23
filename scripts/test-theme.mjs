import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createContext, runInContext } from "node:vm";
import ts from "typescript";

// Offline DOM fixtures run the actual head bootstrap and public script.
const root = fileURLToPath(new URL("../", import.meta.url));
const sourceRoot = process.env.THEME_TEST_SOURCE_ROOT || root;
const [
  layout,
  header,
  baseCss,
  componentsCss,
  navigationCss,
  mainScript,
  themeCss,
] = await Promise.all(
  [
    "src/layouts/Base.astro",
    "src/layouts/partials/Header.astro",
    "src/styles/base.css",
    "src/styles/components.css",
    "src/styles/navigation.css",
    "public/scripts/main.js",
    "src/styles/generated-theme.css",
  ].map((path) => readFile(resolve(sourceRoot, path), "utf8")),
);
const bootstrap =
  layout.match(/<script is:inline>([\s\S]*?)<\/script>/)?.[1] || "";
const buttonTag = header.match(
  /<button\b(?=[^>]*data-theme-toggle)[^>]*>/,
)?.[0];
const buttonMarkup = header.match(
  /<button\b(?=[^>]*data-theme-toggle)[\s\S]*?<\/button>/,
)?.[0];
const switchCss = navigationCss.slice(
  navigationCss.indexOf(".theme-toggle {"),
  navigationCss.indexOf(".navbar-brand {"),
);
const metaTags = [
  ...layout.matchAll(/<meta\b[^>]*data-theme-color="[^"]+"[^>]*\/>/g),
];
const [messageSource, pricingSection] = await Promise.all(
  ["src/lib/messages.ts", "src/layouts/components/PricingSection.astro"].map(
    (path) =>
      readFile(resolve(sourceRoot, path), "utf8").catch((error) => {
        if (error.code !== "ENOENT") throw error;
        return "";
      }),
  ),
);
let getMessages;
if (messageSource) {
  const exports = {};
  runInContext(
    ts.transpileModule(messageSource, {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
      fileName: "messages.ts",
    }).outputText,
    createContext({ exports }),
    { filename: "src/lib/messages.ts" },
  );
  getMessages = exports.getMessages;
}
const defaultNotes = {
  month: "Monthly subscription. Prices shown in USD.",
  year: "Yearly subscription. The full yearly amount is billed once per year. Prices shown in USD.",
};
const expectedThemeCopy = {
  en: {
    darkMode: "Dark mode",
    switchLight: "Switch to light mode",
    switchDark: "Switch to dark mode",
  },
  vi: {
    darkMode: "Chế độ tối",
    switchLight: "Chuyển sang chế độ sáng",
    switchDark: "Chuyển sang chế độ tối",
  },
};

// Resolve actual Astro copy bindings, rather than inserting a missing label
// into the fixture. Literal English markup remains supported for baseline runs.
function localizedTag(tag, locale, implicitGroup = "common") {
  return tag?.replace(
    /([\w-]+)=\{copy\.(?:(common|pricing)\.)?(\w+)\}/g,
    (_, attribute, group, key) => {
      const section = group || implicitGroup;
      const value = getMessages?.(locale)?.[section]?.[key];
      assert.equal(
        typeof value,
        "string",
        `Missing ${locale} ${section}.${key}`,
      );
      return `${attribute}="${value.replaceAll('"', "&quot;")}"`;
    },
  );
}

function attributes(tag) {
  return Object.fromEntries(
    [...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map((match) => [
      match[1],
      match[2],
    ]),
  );
}

function cssRule(selector, source = switchCss) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rule = source.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`));
  assert.ok(rule, `Missing switch CSS rule: ${selector}`);
  return rule[1];
}

function cssValue(rule, property) {
  const value = rule.match(
    new RegExp(`(?:^|;)\\s*${property}:\\s*([^;]+);`),
  )?.[1];
  assert.ok(value, `Missing CSS property: ${property}`);
  return value.trim();
}

function cssLength(rule, property) {
  const value = cssValue(rule, property).match(/^(\d+(?:\.\d+)?)(px|rem)$/);
  assert.ok(value, `Expected fixed px/rem length: ${property}`);
  return Number(value[1]) * (value[2] === "rem" ? 16 : 1);
}

function contrastRatio(first, second) {
  const luminance = (hex) => {
    assert.match(hex, /^#[\da-f]{6}$/i);
    const channels = hex
      .slice(1)
      .match(/../g)
      .map((channel) => Number.parseInt(channel, 16) / 255)
      .map((channel) =>
        channel <= 0.04045
          ? channel / 12.92
          : ((channel + 0.055) / 1.055) ** 2.4,
      );
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

class FixtureNode {
  constructor(attrs = {}) {
    this.attributes = { ...attrs };
    this.dataset = Object.fromEntries(
      Object.entries(attrs)
        .filter(([key]) => key.startsWith("data-"))
        .map(([key, value]) => [
          key
            .slice(5)
            .replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()),
          value,
        ]),
    );
    this.listeners = new Map();
    this.selectors = new Map();
    this.selectorLists = new Map();
    this.children = [];
    this.hidden = false;
    this.focusCount = 0;
  }

  addEventListener(type, callback, options = {}) {
    const listeners = this.listeners.get(type) || [];
    listeners.push({ callback, once: options.once });
    this.listeners.set(type, listeners);
  }

  emit(type, event = {}) {
    event.target ??= this;
    for (const listener of [...(this.listeners.get(type) || [])]) {
      if (listener.once) {
        this.listeners.set(
          type,
          this.listeners.get(type).filter((entry) => entry !== listener),
        );
      }
      listener.callback(event);
    }
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  querySelector(selector) {
    return this.selectors.get(selector) || null;
  }

  querySelectorAll(selector) {
    return this.selectorLists.get(selector) || [];
  }

  contains(node) {
    return this === node || this.children.some((child) => child.contains(node));
  }

  focus() {
    this.focusCount += 1;
  }
}

class FixtureButton extends FixtureNode {}
class FixtureDetails extends FixtureNode {
  open = false;
}
class FixtureFieldset extends FixtureNode {
  disabled = true;
}
class FixtureMedia extends FixtureNode {
  constructor(matches) {
    super();
    this.matches = matches;
  }

  change(matches) {
    if (this.matches !== matches) {
      this.matches = matches;
      this.emit("change", { matches });
    }
  }
}

function createPage(options = {}) {
  const document = new FixtureNode();
  const window = new FixtureNode();
  const html = new FixtureNode();
  document.documentElement = html;
  document.readyState = options.readyState || "complete";

  const locale = options.locale || "en";
  const button = buttonTag
    ? new FixtureButton(attributes(localizedTag(buttonTag, locale)))
    : null;
  if (button) button.hidden = /\bhidden\b/.test(buttonTag);
  if (options.hasToggle !== false) {
    document.selectors.set("[data-theme-toggle]", button);
  }
  const metas = metaTags.map(([tag]) => new FixtureNode(attributes(tag)));
  document.selectorLists.set("[data-theme-color]", metas);

  const system = new FixtureMedia(options.systemDark || false);
  const desktop = new FixtureMedia(false);
  window.matchMedia = (query) => {
    assert.ok(
      query === "(prefers-color-scheme: dark)" ||
        query === "(min-width: 1024px)",
      `Unexpected media query: ${query}`,
    );
    return query === "(prefers-color-scheme: dark)" ? system : desktop;
  };

  const values = new Map(options.storageValues || []);
  if (options.saved !== undefined) values.set("vlabs-theme", options.saved);
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
      if (denied.access) throw new Error("Fixture storage access denied");
      return storage;
    },
  });

  const navigation = new FixtureDetails();
  const summary = new FixtureNode();
  const menuLink = new FixtureNode();
  navigation.children.push(summary, menuLink);
  navigation.selectors.set("summary", summary);
  navigation.selectorLists.set("a", [menuLink]);
  document.selectors.set(".mobile-navigation", navigation);

  const pricing = new FixtureNode();
  const radios = ["month", "year"].map((value) => {
    const radio = new FixtureNode();
    radio.value = value;
    radio.checked = false;
    return radio;
  });
  const prices = ["month", "year"].map((interval) => {
    const price = new FixtureNode({ "data-billing-price": interval });
    price.textContent = interval === "year" ? "39" : "49";
    return price;
  });
  const noteTag = pricingSection.match(
    /<p\b(?=[^>]*\bdata-billing-note\b)[^>]*>/,
  )?.[0];
  const note = new FixtureNode(
    attributes(localizedTag(noteTag || "", locale, "pricing")),
  );
  const expectedNotes = {
    month: note.dataset.monthNote || defaultNotes.month,
    year: note.dataset.yearNote || defaultNotes.year,
  };
  const fieldset = new FixtureFieldset();
  pricing.selectorLists.set("input[name='billing-interval']", radios);
  pricing.selectorLists.set("[data-billing-price]", prices);
  pricing.selectors.set("[data-billing-note]", note);
  pricing.selectors.set("[data-billing-selector]", fieldset);
  document.selectorLists.set("[data-pricing-section]", [pricing]);

  const form = new FixtureNode();
  const fields = {
    name: "Ada Lovelace",
    email: "ada@example.test",
    message: "Draft",
  };
  const inputs = Object.keys(fields).map((name) => {
    const input = new FixtureNode({ name });
    Object.defineProperty(input, "value", {
      get: () => fields[name],
      set: (value) => {
        fields[name] = value;
      },
    });
    return input;
  });
  form.selectorLists.set("input, textarea", inputs);
  document.selectorLists.set("input, textarea", inputs);
  document.selectors.set("[data-enquiry-form]", form);
  const denyFormAction = () =>
    assert.fail("Theme must not submit or reset forms");
  form.reset = form.submit = form.requestSubmit = denyFormAction;
  document.selectorLists.set("form", [form]);
  const networkCalls = [];
  const denyNetwork = (...args) => {
    networkCalls.push(args);
    assert.fail("External network disabled in theme regression tests");
  };
  window.fetch = denyNetwork;

  window.location = {
    href:
      options.url || "https://vlabs.example.test/pricing?billing=year#plans",
  };
  const historyCalls = [];
  window.history = {
    state: { fixture: true },
    replaceState(state, title, url) {
      historyCalls.push([state, title, String(url)]);
      window.location.href = String(url);
    },
  };

  const context = createContext({
    document,
    window,
    Node: FixtureNode,
    HTMLButtonElement: FixtureButton,
    HTMLDetailsElement: FixtureDetails,
    HTMLFieldSetElement: FixtureFieldset,
    URL,
    fetch: denyNetwork,
  });
  return {
    document,
    window,
    html,
    button,
    metas,
    system,
    desktop,
    storage,
    values,
    denied,
    reads,
    writes,
    navigation,
    summary,
    menuLink,
    radios,
    prices,
    note,
    fieldset,
    fields,
    networkCalls,
    historyCalls,
    context,
    locale,
    expectedNotes,
    runBootstrap() {
      runInContext(bootstrap, context, {
        filename: "Base.astro theme bootstrap",
      });
    },
    runMain() {
      runInContext(mainScript, context, { filename: "public/scripts/main.js" });
    },
    ready() {
      document.readyState = "interactive";
      document.emit("DOMContentLoaded");
    },
    click() {
      assert.ok(button, "Theme button must exist");
      button.emit("click");
      document.emit("click", { target: button });
    },
    externalPreference(
      value,
      { key = "vlabs-theme", storageArea = storage } = {},
    ) {
      if (storageArea === storage) {
        if (key === null) values.clear();
        else if (value === null) values.delete(key);
        else values.set(key, value);
      }
      window.emit("storage", { key, newValue: value, storageArea });
    },
  };
}

function boot(options) {
  const page = createPage(options);
  page.runBootstrap();
  page.runMain();
  return page;
}

function assertTheme(page, theme, initialized = true) {
  assert.equal(page.html.dataset.theme, theme);
  assert.equal(page.metas.length, 2);
  for (const meta of page.metas) {
    assert.equal(
      meta.getAttribute("media"),
      meta.dataset.themeColor === theme ? "all" : "not all",
    );
    assert.equal(
      meta.getAttribute("content"),
      meta.dataset.themeColor === "dark" ? "#11192B" : "#FFFFFF",
    );
  }
  if (initialized) {
    assert.equal(page.button.hidden, false);
    assert.equal(page.button.getAttribute("role"), "switch");
    assert.equal(
      page.button.getAttribute("aria-label"),
      expectedThemeCopy[page.locale].darkMode,
    );
    assert.equal(
      page.button.getAttribute("aria-checked"),
      String(theme === "dark"),
    );
    assert.equal(
      page.button.title,
      theme === "dark"
        ? expectedThemeCopy[page.locale].switchLight
        : expectedThemeCopy[page.locale].switchDark,
    );
  }
}

test("head bootstrap is synchronous, scoped, and precedes the deferred public script", () => {
  assert.ok(bootstrap.trim());
  assert.equal((layout.match(/<script is:inline>/g) || []).length, 1);
  assert.ok(layout.indexOf("<head>") < layout.indexOf("<script is:inline>"));
  assert.ok(
    layout.indexOf("<script is:inline>") <
      layout.indexOf('<script is:inline defer src="/scripts/main.js">'),
  );
  const page = createPage();
  const globals = Object.keys(page.context);
  page.runBootstrap();
  page.runMain();
  assert.deepEqual(Object.keys(page.context), globals);
});

test("one hidden native switch has a stable name and decorative sun/moon glyphs inside its thumb", () => {
  assert.equal((header.match(/\bdata-theme-toggle\b/g) || []).length, 1);
  assert.ok(buttonTag);
  const attrs = attributes(localizedTag(buttonTag, "en"));
  assert.equal(attrs.type, "button");
  assert.equal(attrs.role, "switch");
  assert.equal(attrs["aria-label"], "Dark mode");
  assert.equal(attrs["aria-checked"], "false");
  assert.match(buttonTag, /\bhidden\b/);
  assert.match(attrs.class, /\btheme-toggle\b/);
  assert.doesNotMatch(buttonTag, /\b(?:disabled|tabindex|autofocus)\b/);
  const thumbMarkup = buttonMarkup.match(
    /<span class="theme-toggle-track" aria-hidden="true">\s*<span class="theme-toggle-thumb">([\s\S]*?)<\/span>\s*<\/span>\s*<\/button>/,
  )?.[1];
  assert.ok(thumbMarkup);
  assert.equal((thumbMarkup.match(/<DynamicIcon\b/g) || []).length, 2);
  for (const [name, icon] of [
    ["sun", "FaSun"],
    ["moon", "FaMoon"],
  ]) {
    assert.match(
      thumbMarkup,
      new RegExp(
        `<span class="theme-toggle-icon theme-${name}-icon">\\s*<DynamicIcon\\s+icon="${icon}"[^>]*aria-hidden="true"[^>]*focusable="false"\\s*\\/>\\s*<\\/span>`,
      ),
    );
  }
  assert.doesNotMatch(thumbMarkup, /\b(?:tabindex|autofocus|role)\s*=/);
});

test("switch preserves a 64x44px hit target, native appearance reset, blue focus, and menu layout", () => {
  assert.match(
    navigationCss,
    /\.theme-toggle\s*\{[^}]*width: 4rem;[^}]*height: 2\.75rem;/,
  );
  assert.equal(cssValue(cssRule(".theme-toggle"), "appearance"), "none");
  assert.match(baseCss, /html\s*\{[^}]*font-size: 16px;/);
  assert.match(baseCss, /--header-height: 4\.5rem;/);
  assert.match(baseCss, /--focus-color: #163a6b;/);
  assert.match(baseCss, /--focus-color: #9db7ee;/);
  assert.match(
    baseCss,
    /:focus-visible\s*\{[^}]*outline: 3px solid var\(--focus-color\);[^}]*outline-offset: 3px;/,
  );
  assert.match(baseCss, /\[hidden\]\s*\{\s*display: none !important;/);
  assert.match(navigationCss, /\.header-actions\s*\{[^}]*flex-shrink: 0;/);
  assert.match(
    navigationCss,
    /\.theme-toggle\s*\{[^}]*color: var\(--color-primary\);/,
  );
  assert.match(
    navigationCss,
    /\.header-inner\s*\{[^}]*height: var\(--header-height\);/,
  );
  const summaryTag = header.match(
    /<details class="mobile-navigation">\s*(<summary\b[^>]*>)/,
  )?.[1];
  assert.ok(summaryTag, "Native mobile navigation summary must remain");
  assert.equal(attributes(summaryTag)["aria-controls"], "mobile-menu");
  for (const [icon, className] of [
    ["FaBars", "menu-open-icon"],
    ["FaXmark", "menu-close-icon"],
  ]) {
    assert.match(
      header,
      new RegExp(
        `<DynamicIcon\\s+icon="${icon}"\\s+className="${className}"\\s+aria-hidden="true"`,
      ),
    );
  }
  assert.doesNotMatch(switchCss, /\boutline(?:-[\w-]+)?:/);
  assert.match(navigationCss, /@media \(min-width: 1024px\)/);
});

test("switch centers a 52x32px track and 28px white thumb with static shadow and contrasting centered glyphs", () => {
  assert.match(
    buttonMarkup,
    /<span class="theme-toggle-track" aria-hidden="true">\s*<span class="theme-toggle-thumb">/,
  );
  const control = cssRule(".theme-toggle");
  const track = cssRule(".theme-toggle-track");
  const thumb = cssRule(".theme-toggle-thumb");
  assert.equal(cssValue(control, "display"), "grid");
  assert.equal(cssValue(control, "place-items"), "center");
  assert.equal(cssLength(control, "width"), 64);
  assert.equal(cssLength(control, "height"), 44);
  assert.equal(cssValue(control, "border-radius"), "999px");
  assert.equal(cssValue(track, "display"), "block");
  assert.equal(cssValue(track, "position"), "relative");
  assert.equal(cssLength(track, "width"), 52);
  assert.equal(cssLength(track, "height"), 32);
  assert.equal(cssValue(track, "border-radius"), "999px");
  assert.equal(cssValue(track, "pointer-events"), "none");
  assert.doesNotMatch(track, /\bborder(?:-width)?:/);
  assert.equal(cssValue(thumb, "position"), "absolute");
  assert.equal(cssLength(thumb, "top"), 2);
  assert.equal(cssLength(thumb, "left"), 2);
  assert.equal(cssLength(thumb, "width"), 28);
  assert.equal(cssLength(thumb, "height"), 28);
  assert.equal(cssValue(thumb, "border-radius"), "50%");
  assert.equal(cssValue(thumb, "background"), "#ffffff");
  assert.equal(cssValue(thumb, "box-shadow"), "0 1px 3px rgb(15 23 42 / 22%)");
  const glyph = cssRule(".theme-toggle-icon");
  const svg = cssRule(".theme-toggle-icon svg");
  assert.equal(cssValue(glyph, "position"), "absolute");
  assert.equal(cssValue(glyph, "inset"), "0");
  assert.equal(cssValue(glyph, "display"), "grid");
  assert.equal(cssValue(glyph, "place-items"), "center");
  assert.equal(cssValue(glyph, "color"), "#3a3a3c");
  assert.equal(cssLength(svg, "width"), 14);
  assert.equal(cssLength(svg, "height"), 14);
  const glyphContrast = contrastRatio(
    cssValue(glyph, "color"),
    cssValue(thumb, "background"),
  );
  assert.ok(glyphContrast >= 3, `Glyph/thumb contrast: ${glyphContrast}`);
  assert.equal((switchCss.match(/\bbox-shadow:/g) || []).length, 1);
  assert.match(navigationCss, /\.header-actions\s*\{[^}]*min-width: 4rem;/);
});

test("checked state slides the thumb 20px right, preserves contrasting tracks, and crossfades sun/moon endpoints", () => {
  const track = cssRule(".theme-toggle-track");
  const thumb = cssRule(".theme-toggle-thumb");
  const checkedThumb = cssRule(
    '.theme-toggle[aria-checked="true"] .theme-toggle-thumb',
  );
  assert.equal(cssValue(thumb, "transform"), "translateX(0)");
  const travel =
    cssLength(track, "width") -
    cssLength(thumb, "width") -
    2 * cssLength(thumb, "left");
  assert.equal(travel, 20);
  assert.equal(
    cssValue(checkedThumb, "transform"),
    `translateX(${travel / 16}rem)`,
  );
  assert.doesNotMatch(
    checkedThumb,
    /\b(?:left|top|width|height|background(?:-color)?|box-shadow):/,
  );
  const off = cssValue(track, "background");
  const on = cssValue(
    cssRule('.theme-toggle[aria-checked="true"] .theme-toggle-track'),
    "background",
  );
  assert.equal(off, "#8e8e93");
  assert.equal(on, "#248a3d");
  const lightTokens = themeCss.match(/@theme\s*\{([^}]+)\}/)?.[1];
  const darkTokens = baseCss.match(
    /:root\[data-theme="dark"\]\s*\{([^}]+)\}/,
  )?.[1];
  assert.ok(lightTokens);
  assert.ok(darkTokens);
  assert.match(
    navigationCss,
    /\.header\s*\{[^}]*background: var\(--color-body\);/,
  );
  const backgrounds = [lightTokens, darkTokens].map((tokens) =>
    cssValue(tokens, "--color-body"),
  );
  const colors = [off, on];
  for (const checked of ["false", "true"]) {
    assert.match(
      switchCss,
      new RegExp(
        `\\.theme-toggle\\[aria-checked="${checked}"\\]:hover \\.theme-toggle-track,\\s*\\.theme-toggle\\[aria-checked="${checked}"\\]:active \\.theme-toggle-track\\s*\\{`,
      ),
    );
    colors.push(
      cssValue(
        cssRule(
          `.theme-toggle[aria-checked="${checked}"]:active .theme-toggle-track`,
        ),
        "background",
      ),
    );
  }
  for (const color of colors) {
    const thumbContrast = contrastRatio(cssValue(thumb, "background"), color);
    assert.ok(thumbContrast >= 3, `Thumb/track contrast: ${thumbContrast}`);
    for (const background of backgrounds) {
      const edgeContrast = contrastRatio(color, background);
      assert.ok(edgeContrast >= 3, `Track/header contrast: ${edgeContrast}`);
    }
  }
  for (const [name, offOpacity, onOpacity] of [
    ["sun", "1", "0"],
    ["moon", "0", "1"],
  ]) {
    assert.equal(
      cssValue(cssRule(`.theme-toggle .theme-${name}-icon`), "opacity"),
      offOpacity,
    );
    assert.equal(
      cssValue(
        cssRule(`.theme-toggle[aria-checked="true"] .theme-${name}-icon`),
        "opacity",
      ),
      onOpacity,
    );
  }
  assert.doesNotMatch(switchCss, /display:\s*none|visibility:\s*hidden/);
});

test("finite thumb/glyph motion uses only transform/opacity at 220ms inside the reduced-motion gate", () => {
  const gate = switchCss.match(
    /@media \(prefers-reduced-motion: no-preference\)\s*\{([\s\S]*?)\n\}/,
  );
  assert.ok(gate);
  const transitions = [...switchCss.matchAll(/\btransition:\s*([^;]+);/g)];
  assert.equal(transitions.length, 2);
  const timing = String.raw`220ms\s+cubic-bezier\(\s*0\.2,\s*0\.8,\s*0\.2,\s*1\s*\)`;
  for (const [selector, property] of [
    [".theme-toggle-thumb", "transform"],
    [".theme-toggle-icon", "opacity"],
  ]) {
    assert.match(
      cssValue(cssRule(selector, gate[1]), "transition"),
      new RegExp(`^\\s*${property}\\s+${timing}\\s*$`),
    );
  }
  assert.doesNotMatch(
    switchCss.replace(gate[0], ""),
    /\btransition(?:-[\w-]+)?:/,
  );
  assert.doesNotMatch(
    switchCss,
    /\banimation(?:-[\w-]+)?:|\btransition-[\w-]+:|transition:\s*all\b/,
  );
  assert.match(
    baseCss,
    /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*transition: none !important;/,
  );
});

test("switch markup, styles, and controller contain no legacy pressed state", () => {
  for (const source of [header, switchCss, mainScript]) {
    assert.doesNotMatch(source, /aria-pressed/);
  }
  assert.doesNotMatch(switchCss, /\bcolor-scheme\s*:|:root|\bhtml\b/);
});

test("Vietnamese switch retains its stable localized name and both action titles", () => {
  const page = boot({ locale: "vi" });
  assertTheme(page, "light");
  page.click();
  assertTheme(page, "dark");
  page.click();
  assertTheme(page, "light");
  assert.deepEqual(page.writes, [
    ["vlabs-theme", "dark"],
    ["vlabs-theme", "light"],
  ]);
  assert.equal(page.button.listeners.get("keydown"), undefined);
  assert.equal(page.button.listeners.get("keyup"), undefined);
});

test("rapid switch clicks update checked state immediately without timers or keyboard duplication", () => {
  const page = boot();
  for (const [index, expected] of [
    "dark",
    "light",
    "dark",
    "light",
    "dark",
  ].entries()) {
    page.click();
    assertTheme(page, expected);
    assert.equal(page.writes.length, index + 1);
  }
  assert.equal(page.button.listeners.get("keydown"), undefined);
  assert.equal(page.button.listeners.get("keyup"), undefined);
  assert.doesNotMatch(
    mainScript,
    /\b(?:setTimeout|setInterval|requestAnimationFrame|cancelAnimationFrame)\s*\(/,
  );
});

test("manual dark and no-JS system dark share tokens, color-scheme, and icon filtering", () => {
  const explicit = baseCss.match(
    /:root\[data-theme="dark"\]\s*\{([^}]+)\}/,
  )?.[1];
  const fallback = baseCss.match(
    /@media \(prefers-color-scheme: dark\)\s*\{\s*:root:not\(\[data-theme\]\)\s*\{([^}]+)\}/,
  )?.[1];
  assert.ok(explicit);
  assert.ok(fallback);
  assert.equal(explicit.replace(/\s/g, ""), fallback.replace(/\s/g, ""));
  assert.match(explicit, /--color-body: #11192b;/);
  assert.match(explicit, /color-scheme: dark;/);
  assert.match(baseCss, /html\s*\{[^}]*color-scheme: light;/);
  assert.match(
    componentsCss,
    /\.theme-icon\s*\{\s*filter: var\(--theme-icon-filter\);/,
  );
  assert.doesNotMatch(componentsCss, /prefers-color-scheme/);
});

for (const [name, saved, systemDark, expected] of [
  ["first visit, light OS", undefined, false, "light"],
  ["first visit, dark OS", undefined, true, "dark"],
  ["saved light overrides dark OS", "light", true, "light"],
  ["saved dark overrides light OS", "dark", false, "dark"],
  ["invalid system value", "system", true, "dark"],
  ["invalid uppercase value", "Dark", false, "light"],
  ["invalid whitespace value", " light ", true, "dark"],
  ["invalid empty value", "", false, "light"],
]) {
  test(`pre-paint: ${name}`, () => {
    const page = createPage({ saved, systemDark });
    page.runBootstrap();
    assertTheme(page, expected, false);
    assert.equal(page.button.hidden, true);
    assert.deepEqual(page.writes, []);
    page.runMain();
    assertTheme(page, expected);
    assert.deepEqual(page.writes, []);
  });
}

test("no-JS markup keeps system-specific metadata and hides the control", () => {
  const page = createPage();
  assert.equal(page.html.dataset.theme, undefined);
  assert.equal(page.button.hidden, true);
  for (const meta of page.metas) {
    assert.equal(
      meta.getAttribute("media"),
      `(prefers-color-scheme: ${meta.dataset.themeColor})`,
    );
  }
});

test("deferred init reveals the working control only after DOMContentLoaded", () => {
  const page = boot({ readyState: "loading", systemDark: true });
  assertTheme(page, "dark", false);
  assert.equal(page.button.hidden, true);
  assert.equal(page.button.listeners.get("click"), undefined);
  page.ready();
  assertTheme(page, "dark");
  assert.equal(page.button.listeners.get("click").length, 1);
  page.ready();
  assert.equal(page.button.listeners.get("click").length, 1);
});

test("deferred script can initialize theme even if the head bootstrap did not run", () => {
  const page = createPage({ saved: "dark" });
  page.runMain();
  assertTheme(page, "dark");
});

test("clicks save only vlabs-theme and survive reload and ordinary navigation", () => {
  const page = boot();
  page.click();
  assertTheme(page, "dark");
  assert.deepEqual(page.writes, [["vlabs-theme", "dark"]]);
  const reload = boot({ storageValues: page.values });
  assertTheme(reload, "dark");
  const navigation = boot({
    storageValues: page.values,
    url: "https://vlabs.example.test/features",
  });
  assertTheme(navigation, "dark");
  navigation.click();
  assertTheme(navigation, "light");
  assertTheme(
    boot({ storageValues: navigation.values, systemDark: true }),
    "light",
  );
});

test("system changes are followed while no valid preference is saved", () => {
  const page = boot({ saved: "invalid" });
  page.system.change(true);
  assertTheme(page, "dark");
  page.system.change(false);
  assertTheme(page, "light");
  assert.deepEqual(page.writes, []);
});

test("explicit choice overrides OS changes until same-page storage removal", () => {
  const page = boot();
  page.click();
  page.system.change(true);
  page.system.change(false);
  assertTheme(page, "dark");
  page.values.delete("vlabs-theme");
  page.system.change(true);
  page.system.change(false);
  assertTheme(page, "light");
});

test("cross-tab valid changes, invalid values, removal, and clear synchronize", () => {
  const page = boot();
  page.externalPreference("dark");
  assertTheme(page, "dark");
  page.externalPreference("light");
  page.system.change(true);
  assertTheme(page, "light");
  page.externalPreference("invalid");
  assertTheme(page, "dark");
  page.system.change(false);
  assertTheme(page, "light");
  page.externalPreference("dark");
  page.externalPreference(null);
  assertTheme(page, "light");
  page.externalPreference("dark");
  page.externalPreference(null, { key: null });
  assertTheme(page, "light");
});

test("unrelated keys and session storage events do not replace the theme", () => {
  const page = boot({ saved: "dark" });
  page.externalPreference("light", { key: "unrelated" });
  assertTheme(page, "dark");
  page.externalPreference("light", { storageArea: {} });
  assertTheme(page, "dark");
});

test("cross-tab sync uses event data without rereading denied storage", () => {
  const page = boot({ saved: "light", systemDark: true });
  page.denied.get = true;
  const reads = page.reads.length;
  page.externalPreference("dark");
  assertTheme(page, "dark");
  page.externalPreference(null);
  assertTheme(page, "dark");
  assert.equal(page.reads.length, reads);
  page.system.change(false);
  assertTheme(page, "light");
});

for (const [name, options] of [
  ["localStorage getter denied", { denyAccess: true }],
  ["storage reads denied", { denyGet: true }],
  ["storage writes denied", { denySet: true }],
]) {
  test(`storage failure: ${name} keeps system fallback and in-memory toggle working`, () => {
    const page = boot(options);
    assertTheme(page, "light");
    page.system.change(true);
    assertTheme(page, "dark");
    page.click();
    assertTheme(page, "light");
    page.system.change(false);
    page.system.change(true);
    assertTheme(page, "light");
    page.click();
    assertTheme(page, "dark");
  });
}

test("failed write preserves a new in-memory choice over an old saved preference", () => {
  const page = boot({ saved: "light", denySet: true });
  page.click();
  page.system.change(true);
  page.system.change(false);
  assertTheme(page, "dark");
  assert.equal(page.values.get("vlabs-theme"), "light");
});

test("repeated public script execution does not duplicate theme bindings", () => {
  const page = boot();
  page.runMain();
  assert.equal(page.button.listeners.get("click").length, 1);
  assert.equal(page.system.listeners.get("change").length, 1);
  assert.equal(page.window.listeners.get("storage").length, 1);
  page.click();
  assertTheme(page, "dark");
  assert.deepEqual(page.writes, [["vlabs-theme", "dark"]]);
});

test("theme clicks leave billing URL/hash, prices, drafts, and network untouched", () => {
  const page = boot();
  const before = {
    url: page.window.location.href,
    prices: page.prices.map((price) => [price.hidden, price.textContent]),
    radios: page.radios.map((radio) => radio.checked),
    note: page.note.textContent,
    fields: { ...page.fields },
  };
  page.click();
  page.click();
  assert.equal(page.window.location.href, before.url);
  assert.deepEqual(
    page.prices.map((price) => [price.hidden, price.textContent]),
    before.prices,
  );
  assert.deepEqual(
    page.radios.map((radio) => radio.checked),
    before.radios,
  );
  assert.equal(page.note.textContent, before.note);
  assert.deepEqual(page.fields, before.fields);
  assert.deepEqual(page.historyCalls, []);
  assert.deepEqual(page.networkCalls, []);
});

test("existing menu Escape, link, outside-click, and desktop closure still work", () => {
  const page = boot();
  let prevented = false;
  page.navigation.open = true;
  page.navigation.emit("keydown", {
    key: "Escape",
    preventDefault() {
      prevented = true;
    },
  });
  assert.equal(page.navigation.open, false);
  assert.equal(page.summary.focusCount, 1);
  assert.equal(prevented, true);
  page.navigation.open = true;
  page.document.emit("click", { target: page.summary });
  assert.equal(page.navigation.open, true);
  page.menuLink.emit("click");
  assert.equal(page.navigation.open, false);
  page.navigation.open = true;
  page.click();
  assert.equal(page.navigation.open, false);
  page.navigation.open = true;
  page.desktop.change(true);
  assert.equal(page.navigation.open, false);
});

test("existing billing change keeps its URL, price, note, and fieldset contract", () => {
  const page = boot({
    url: "https://vlabs.example.test/pricing?billing=month#plans",
  });
  assert.equal(page.fieldset.disabled, false);
  assert.deepEqual(
    page.prices.map((price) => price.hidden),
    [false, true],
  );
  page.click();
  page.radios[0].checked = false;
  page.radios[1].checked = true;
  page.radios[1].emit("change");
  assert.equal(
    new URL(page.window.location.href).searchParams.get("billing"),
    "year",
  );
  assert.equal(new URL(page.window.location.href).hash, "#plans");
  assert.deepEqual(
    page.prices.map((price) => price.hidden),
    [true, false],
  );
  assert.equal(page.note.textContent, page.expectedNotes.year);
  if (messageSource) {
    assert.match(page.note.textContent, /pay yearly in USD through PayPal/i);
    assert.match(
      page.note.textContent,
      /full annual amount is charged once per year/i,
    );
    assert.match(
      page.note.textContent,
      /subscription renews automatically each year until it is cancelled/i,
    );
  } else {
    assert.match(page.note.textContent, /yearly subscription/i);
    assert.match(page.note.textContent, /full yearly amount.*once per year/i);
  }
  assert.match(page.note.textContent, /\bUSD\b/);
  assert.equal(page.historyCalls.length, 1);
  assertTheme(page, "dark");
});

test("missing theme control does not prevent existing menu and billing initialization", () => {
  const page = boot({ hasToggle: false });
  assert.equal(page.fieldset.disabled, false);
  assert.equal(page.navigation.listeners.get("keydown").length, 1);
  assert.deepEqual(
    page.prices.map((price) => price.hidden),
    [true, false],
  );
});
