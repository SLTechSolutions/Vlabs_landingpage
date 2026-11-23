(function () {
  "use strict";

  function initTheme() {
    const toggle = document.querySelector("[data-theme-toggle]");
    if (!(toggle instanceof HTMLButtonElement) || !toggle.hidden) return;

    const root = document.documentElement;
    const system = window.matchMedia("(prefers-color-scheme: dark)");
    const storageKey = "vlabs-theme";
    const validPreference = (value) =>
      value === "light" || value === "dark" ? value : null;
    let storage;
    let preference = null;
    let memoryOnlyPreference = false;

    try {
      storage = window.localStorage;
      preference = validPreference(storage.getItem(storageKey));
    } catch {}

    const applyTheme = () => {
      const theme = preference || (system.matches ? "dark" : "light");
      root.dataset.theme = theme;
      toggle.setAttribute("aria-checked", String(theme === "dark"));
      toggle.title =
        theme === "dark"
          ? toggle.dataset.themeLightLabel || "Switch to light mode"
          : toggle.dataset.themeDarkLabel || "Switch to dark mode";
      document.querySelectorAll("[data-theme-color]").forEach((meta) => {
        meta.setAttribute(
          "media",
          meta.dataset.themeColor === theme ? "all" : "not all",
        );
      });
    };

    toggle.addEventListener("click", () => {
      preference = root.dataset.theme === "dark" ? "light" : "dark";
      memoryOnlyPreference = true;
      applyTheme();
      try {
        if (storage) {
          storage.setItem(storageKey, preference);
          memoryOnlyPreference = false;
        }
      } catch {}
    });
    system.addEventListener("change", () => {
      // Notice same-page storage removal, but keep unsaved selections in memory.
      if (!memoryOnlyPreference && storage) {
        try {
          preference = validPreference(storage.getItem(storageKey));
        } catch {}
      }
      applyTheme();
    });
    window.addEventListener("storage", (event) => {
      if (
        !storage ||
        event.storageArea !== storage ||
        (event.key !== storageKey && event.key !== null)
      ) {
        return;
      }
      preference = validPreference(event.key === null ? null : event.newValue);
      memoryOnlyPreference = false;
      applyTheme();
    });

    applyTheme();
    toggle.hidden = false;
  }

  function init() {
    initTheme();
    if (document.documentElement.dataset.vlabsMainReady) return;
    document.documentElement.dataset.vlabsMainReady = "true";
    const navigation = document.querySelector(".mobile-navigation");
    const summary = navigation?.querySelector("summary");

    if (navigation instanceof HTMLDetailsElement && summary) {
      navigation.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && navigation.open) {
          navigation.open = false;
          summary.focus();
          event.preventDefault();
        }
      });
      navigation.querySelectorAll("a").forEach((link) => {
        link.addEventListener("click", () => {
          navigation.open = false;
        });
      });
      document.addEventListener("click", (event) => {
        if (
          event.target instanceof Node &&
          !navigation.contains(event.target)
        ) {
          navigation.open = false;
        }
      });
      window
        .matchMedia("(min-width: 1024px)")
        .addEventListener("change", (event) => {
          if (event.matches) navigation.open = false;
        });
    }

    document.querySelectorAll("[data-pricing-section]").forEach((section) => {
      const radios = section.querySelectorAll("input[name='billing-interval']");
      const note = section.querySelector("[data-billing-note]");
      const selector = section.querySelector("[data-billing-selector]");

      const updateBilling = (interval, updateUrl = false) => {
        section.querySelectorAll("[data-billing-price]").forEach((price) => {
          price.hidden = price.dataset.billingPrice !== interval;
        });
        if (note)
          note.textContent =
            interval === "year"
              ? note.dataset.yearNote || "Yearly subscription. The full yearly amount is billed once per year. Prices shown in USD."
              : note.dataset.monthNote || "Monthly subscription. Prices shown in USD.";
        if (updateUrl) {
          const url = new URL(window.location.href);
          url.searchParams.set("billing", interval);
          window.history.replaceState(window.history.state, "", url);
        }
      };

      const savedInterval = new URL(window.location.href).searchParams.get(
        "billing",
      );
      const interval = savedInterval === "year" ? "year" : "month";
      radios.forEach((radio) => {
        radio.checked = radio.value === interval;
        radio.addEventListener("change", () => {
          if (radio.checked) updateBilling(radio.value, true);
        });
      });
      if (selector instanceof HTMLFieldSetElement) selector.disabled = false;
      updateBilling(interval);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
