import { unified } from "@astrojs/markdown-remark";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import node from "@astrojs/node";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, fontProviders } from "astro/config";
import config from "./src/config/config.json";
import theme from "./src/config/theme.json";
import remarkLocaleLinks from "./src/lib/remark-locale-links.mjs";

// Helper to parse font string format: "FontName:wght@400;500;600;700"
function parseFontString(fontStr) {
  const [name, weightPart] = fontStr.split(":");
  let weights = [400]; // default weight

  if (weightPart) {
    // Extract weights from wght@400;500;600 format
    const weightMatch = weightPart.match(/wght@?([\d;]+)/);
    if (weightMatch) {
      weights = weightMatch[1].split(";").map((w) => parseInt(w, 10));
    }
  }

  // remove + from font name and add space
  const cleanName = name.replace(/\+/g, " ");
  return { name: cleanName, weights };
}

// Families installed on the OS (not hosted by Google Fonts): they are
// referenced from CSS only, so they must not be registered with a font provider.
const systemFamilies = new Set(theme.fonts.system_families || []);

// Build fonts configuration from theme.json
const fontsConfig = Object.entries(theme.fonts.font_family)
  .filter(([key]) => !key.includes("_type")) // Filter out type entries
  .map(([key, fontStr]) => {
    const { name, weights } = parseFontString(fontStr);
    if (systemFamilies.has(name)) return null;
    const typeKey = `${key}_type`;
    const fallback = theme.fonts.font_family[typeKey] || "sans-serif";

    return {
      name,
      cssVariable: `--font-${key}`,
      provider: fontProviders.google(),
      weights,
      display: "swap",
      fallbacks: [fallback],
    };
  })
  .filter(Boolean);

const trailingSlash = config.site.trailing_slash ? "always" : "never";

export default defineConfig({
  // Repository Markdown is rendered on demand; Cloudflare Tunnel proxies the
  // public origin to this loopback-only Node server.
  output: "server",
  adapter: node({
    mode: "standalone",
    bodySizeLimit: 1024 * 1024,
  }),
  server: { 
    // Thay đổi từ '127.0.0.1' thành true hoặc '0.0.0.0' 
    // nếu bạn muốn mở cho các thiết bị ngoài/Cloudflare Tunnel kết nối vào port này
    host: process.env.HOST || true,
    port: Number(process.env.PORT || 4321),

    // Cấu hình Allowed Hosts bảo mật
    allowedHosts: [
      "localhost",
      "127.0.0.1",
      "learningsmart.io.vn"    // Domain chính thức của bạn khi chạy production
    ]
  },
  session: false,
  site: config.site.base_url,
  base: config.site.base_path || "/",
  trailingSlash:
    process.env.NODE_ENV === "development" ? "ignore" : trailingSlash,
  image: { dangerouslyProcessSVG: true },
  i18n: {
    locales: ["en", "vi"],
    defaultLocale: "en",
    routing: { prefixDefaultLocale: false },
  },
  vite: { plugins: [tailwindcss()] },
  fonts: fontsConfig,
  integrations: [
    react(),
    sitemap({
      i18n: { defaultLocale: "en", locales: { en: "en", vi: "vi" } },
      // Keep machine-readable representations and withdrawn sections out of the HTML sitemap.
      filter: (page) => {
        const pathname = new URL(page).pathname;
        return (
          !/\.(?:txt|md)$/.test(pathname) &&
          !/^\/(?:vi\/)?(?:about|careers|case-study)(?:\/|$)/.test(pathname)
        );
      },
      serialize: (item) => {
        const english = item.links?.find((link) => link.lang === "en");
        return {
          ...item,
          links: english
            ? [
                ...item.links.filter((link) => link.lang !== "x-default"),
                { lang: "x-default", url: english.url },
              ]
            : item.links,
        };
      },
    }),
  ],
  markdown: {
    processor: unified({
      remarkPlugins: [[remarkLocaleLinks, { site: config.site.base_url }]],
    }),
  },
});
