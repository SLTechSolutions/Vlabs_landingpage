import config from "@/config/config.json";
import menu from "@/config/menu.json";
import type { Locale } from "@/lib/currency";
import type { Menu, NavLink } from "@/types";

export type { Locale } from "@/lib/currency";
export const locales = ["en", "vi"] as const;
export const LOCALE_STORAGE_KEY = "vlabs-locale-v1";

/** Only a supported locale segment is removed; document slugs stay intact. */
export function canonicalId(id: string): string {
  return id.replace(/^(?:en|vi)\//, "");
}

export function entryLocale(id: string): Locale {
  return id.startsWith("vi/") ? "vi" : "en";
}

export function localePath(pathname: string, locale: Locale): string {
  const path = pathname.replace(/^\/vi(?=\/|$)/, "") || "/";
  const normalized = path === "/" ? "/" : path.replace(/\/+$/, "");
  return locale === "vi" ? `/vi${normalized === "/" ? "" : normalized}` : normalized;
}

/** Build-time page links only. Assets, API URLs, external links, and anchors stay put. */
export function localizeHref(href: string, locale: Locale): string {
  if (!href || /^(?:#|\?|\/\/|mailto:|tel:|data:)/i.test(href)) return href;
  const url = new URL(href, config.site.base_url);
  if (
    url.origin !== new URL(config.site.base_url).origin ||
    /^\/(?:api|images|scripts|_astro|assets)(?:\/|$)/.test(url.pathname) ||
    /\.[^/]+$/.test(url.pathname)
  ) return href;
  url.pathname = localePath(url.pathname, locale);
  if (url.searchParams.has("lang")) url.searchParams.set("lang", locale);
  return `${url.pathname}${url.search}${url.hash}`;
}

const vietnameseLinkNames: Record<string, string> = {
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

export function localizedMenu(locale: Locale): Menu {
  const links = (items: NavLink[]) => items.map((item) => ({
    name: locale === "vi" ? vietnameseLinkNames[item.name] : item.name,
    url: localizeHref(item.url, locale),
  }));
  return {
    main: links(menu.main),
    footer_col_1_title: locale === "vi" ? "Nền tảng" : menu.footer_col_1_title,
    footer_col_2_title: locale === "vi" ? "Khám phá" : menu.footer_col_2_title,
    footer_col_3_title: locale === "vi" ? "Chính sách" : menu.footer_col_3_title,
    footer_primary: links(menu.footer_primary),
    footer_resource: links(menu.footer_resource),
    footer_legal: links(menu.footer_legal),
  };
}
