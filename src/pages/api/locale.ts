import type { APIRoute } from "astro";
import { currencyForLocale, type Locale } from "../../lib/currency";

export const prerender = false;

export const GET: APIRoute = ({ request }) => {
  // Trust requires edge-overwritten headers and a loopback-only tunnel origin.
  // Accept case/outer whitespace, never lists or partial country codes.
  // Country/IP data is not logged, stored, or returned.
  const country = (
    request.headers.get("cf-ipcountry") ??
    request.headers.get("x-vercel-ip-country")
  )
    ?.trim()
    .toUpperCase();
  const locale: Locale =
    country && /^[A-Z]{2}$/.test(country) && country === "VN" ? "vi" : "en";
  return new Response(
    JSON.stringify({ locale, currency: currencyForLocale(locale) }),
    {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "private, no-store",
        Vary: "CF-IPCountry, X-Vercel-IP-Country",
      },
    },
  );
};
