(function () {
  "use strict";

  // One controller per document, including repeated script loads and bfcache.
  if (window.__vlabsLocaleV1) return;
  window.__vlabsLocaleV1 = true;

  function init() {
    const root = document.documentElement;
    const storageKey = "vlabs-locale-v1";
    const valid = (value) => (value === "en" || value === "vi" ? value : null);
    const currentUrl = () => new URL(window.location.href);
    const markerIn = (url) => {
      const values = url.searchParams.getAll("lang");
      return values.length === 1 ? valid(values[0]) : null;
    };
    const explicitVietnamese = (url) => /^\/vi(?:\/|$)/.test(url.pathname);
    const mapUrl = (url, locale, markManual = false) => {
      const target = new URL(url.href);
      const path = target.pathname.replace(/^\/vi(?=\/|$)/, "") || "/";
      const normalized = path === "/" ? "/" : path.replace(/\/+$/, "");
      target.pathname =
        locale === "vi"
          ? `/vi${normalized === "/" ? "" : normalized}`
          : normalized;
      if (markManual) target.searchParams.set("lang", locale);
      return target;
    };
    const pageLink = (link, url) =>
      url.origin === currentUrl().origin &&
      !link.hasAttribute("download") &&
      !/^\/(?:api|images|scripts|_astro|assets)(?:\/|$)/.test(url.pathname) &&
      !/\.[^/]+$/.test(url.pathname);

    let storage;
    let saved = null;
    try {
      storage = window.localStorage;
      saved = valid(storage.getItem(storageKey));
    } catch {}
    const marker = markerIn(currentUrl());
    let manual = marker || saved || valid(root.dataset.localeManual);
    let revision = 0;
    let request = null;
    let timeout = null;
    let interacted = false;
    let leaving = root.dataset.localeRedirect === "true";

    const save = (locale) => {
      try {
        storage?.setItem(storageKey, locale);
      } catch {}
    };
    if (marker && root.dataset.localeSource !== "query") save(marker);

    const stopLookup = () => {
      request?.abort();
      request = null;
      if (timeout !== null) window.clearTimeout(timeout);
      timeout = null;
    };
    const unsafeToNavigate = () =>
      interacted ||
      Boolean(
        document.querySelector(
          "dialog[open], form[aria-busy='true'], form[data-locale-dirty], form[data-locale-submitted]",
        ),
      ) ||
      Array.from(
        document.querySelectorAll("form input, form textarea, form select"),
      ).some((field) => {
        if (
          field.type === "hidden" ||
          field.type === "submit" ||
          field.type === "button"
        )
          return false;
        if (field.type === "checkbox" || field.type === "radio")
          return field.checked !== field.defaultChecked;
        return field.value !== field.defaultValue && Boolean(field.value);
      });

    const updateChoices = () => {
      document.querySelectorAll("[data-locale-choice]").forEach((link) => {
        const locale = valid(link.dataset.localeChoice);
        if (!locale) return;
        const target = mapUrl(currentUrl(), locale, true);
        link.href = `${target.pathname}${target.search}${target.hash}`;
      });
    };
    const carryManualChoice = () => {
      if (!manual) return;
      document.querySelectorAll("a[href]").forEach((link) => {
        if (link.hasAttribute("data-locale-choice")) return;
        const href = link.getAttribute("href");
        // Skip/section anchors must remain same-document native navigation.
        if (!href || /^\s*#/.test(href)) return;
        let url;
        try {
          url = new URL(href, currentUrl());
        } catch {
          return;
        }
        if (!pageLink(link, url)) return;
        const target = mapUrl(url, manual, true);
        link.href = `${target.pathname}${target.search}${target.hash}`;
      });
    };
    const replaceLocale = (locale, markManual = false) => {
      if (leaving || unsafeToNavigate()) return;
      const url = currentUrl();
      const target = mapUrl(url, locale, markManual);
      if (target.href === url.href) return;
      leaving = true;
      window.location.replace(target.href);
    };

    updateChoices();
    carryManualChoice();
    if (manual) replaceLocale(manual, Boolean(marker));

    const selector = document.querySelector("[data-locale-selector]");
    const summary = selector?.querySelector("summary");
    if (selector && summary) {
      selector.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && selector.open) {
          selector.open = false;
          summary.focus();
          event.preventDefault();
        }
      });
      document.addEventListener("click", (event) => {
        if (event.target instanceof Node && !selector.contains(event.target))
          selector.open = false;
      });
    }

    document.addEventListener(
      "click",
      (event) => {
        const target = event.target instanceof Element ? event.target : null;
        const choice = target?.closest("[data-locale-choice]");
        const locale = valid(choice?.dataset.localeChoice);
        if (locale) {
          // Let the native link navigate, including modified/new-tab clicks.
          manual = locale;
          revision += 1;
          root.dataset.localeManual = locale;
          stopLookup();
          save(locale);
          updateChoices();
          carryManualChoice();
          if (selector) selector.open = false;
        } else if (target?.closest("[aria-haspopup='dialog']")) {
          interacted = true;
          stopLookup();
        }
      },
      true,
    );

    const protectForm = (event) => {
      const target = event.target instanceof Element ? event.target : null;
      const form = target?.closest("form");
      if (!form) return;
      interacted = true;
      form.dataset[
        event.type === "submit" ? "localeSubmitted" : "localeDirty"
      ] = "true";
      stopLookup();
    };
    document.addEventListener("input", protectForm, true);
    document.addEventListener("change", protectForm, true);
    document.addEventListener("submit", protectForm, true);

    window.addEventListener("storage", (event) => {
      if (
        !storage ||
        event.storageArea !== storage ||
        (event.key !== storageKey && event.key !== null)
      )
        return;
      revision += 1;
      stopLookup();
      manual = valid(event.key === null ? null : event.newValue);
      root.dataset.localeManual = manual || "";
      updateChoices();
      carryManualChoice();
      // Never discard another tab's in-progress form or open checkout.
      if (manual) replaceLocale(manual, true);
    });
    window.addEventListener("pagehide", stopLookup);
    window.addEventListener("pageshow", () => {
      updateChoices();
      carryManualChoice();
    });

    if (
      manual ||
      explicitVietnamese(currentUrl()) ||
      leaving ||
      unsafeToNavigate()
    )
      return;
    const controller = new AbortController();
    const startedAtRevision = revision;
    request = controller;
    timeout = window.setTimeout(() => {
      controller.abort();
      request = null;
      timeout = null;
    }, 5_000);

    // Hosting IP country only; never browser language, location permission, or
    // a third-party IP service. Country defaults are not saved as manual choices.
    fetch("/api/locale", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return;
        const result = await response.json();
        if (
          controller.signal.aborted ||
          manual ||
          revision !== startedAtRevision ||
          markerIn(currentUrl()) ||
          explicitVietnamese(currentUrl()) ||
          unsafeToNavigate() ||
          !result ||
          !valid(result.locale) ||
          result.currency !== (result.locale === "vi" ? "vnd" : "usd")
        )
          return;
        replaceLocale(result.locale);
      })
      .catch(() => {
        /* Missing/invalid geo or offline: keep the English route. */
      })
      .finally(() => {
        if (request === controller) request = null;
        if (timeout !== null) window.clearTimeout(timeout);
        timeout = null;
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
