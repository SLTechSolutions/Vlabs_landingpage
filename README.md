# VLABS Website

Marketing website for VLABS virtual labs and learning management solutions. Built with Astro, Tailwind CSS, and small React components for interactive features.

This repository contains the website and its contact, lead, checkout, and webhook endpoints. It does not contain the VLABS learning application itself.

## Local Development

Use Node.js 22.12 or newer and the pnpm version specified in `package.json`.

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Public pages work without API credentials. To test configured integrations locally, copy `.env.example` to `.env` and supply your own test credentials. Never commit credentials or use live payment keys for local testing.

## Content Source

Repository Markdown under `src/content/` is the only content source for the website. No CMS editor or publish endpoints exist. Edit the English and Vietnamese Markdown files and rebuild to update website content.

Rendered Markdown is sanitized before HTML sinks. Images use local files or public HTTPS URLs; external images retain a no-referrer policy.

## Languages and Pricing

English keeps the existing unprefixed URLs. Vietnamese pages use `/vi`. The language selector switches language and currency together: English/USD or Tiếng Việt/VND.

Without a manual preference, the same-origin `/api/locale` endpoint reads `CF-IPCountry` first, falling back to `X-Vercel-IP-Country` only when the Cloudflare header is absent. `VN` selects Vietnamese/VND; other, missing, invalid, or unavailable country data selects English/USD. The deployment must overwrite these headers and prevent direct access to the origin so clients cannot spoof country defaults. No external IP service, browser-language inference, or live exchange-rate service is used. On static-only hosts or without JavaScript, the requested page's language remains the fallback.

A valid `lang=en|vi` URL marker takes precedence over the saved `vlabs-locale-v1` preference. A saved manual choice takes precedence over country defaults; an intentional `/vi` URL stays Vietnamese when no manual override exists. Automatic defaults are not saved as manual choices. If browser storage is blocked, links carry the marker where possible; a future visit without storage or a marker cannot retain that preference. Late geographic responses must not interrupt edited forms or an open checkout.

USD and VND prices are authored independently in the English and Vietnamese pricing Markdown. The server selects the corresponding content using an immutable plan ID, billing interval, and supported currency. Client-submitted prices cannot set the charge. No exchange-rate conversion is used. USD uses cents; VND uses whole dong.

| Plan       | Monthly USD | Yearly USD | Monthly VND |  Yearly VND |
| ---------- | ----------: | ---------: | ----------: | ----------: |
| Starter    |        2.69 |      26.90 |      69,000 |     690,000 |
| Campus     |        3.09 |      30.90 |      79,000 |     790,000 |
| Enterprise |        3.89 |      38.90 |      99,000 |     990,000 |

Prices are per account per month or year. Only Starter opens checkout; Campus and Enterprise link to the localized contact page. The server recognizes the immutable plan IDs `starter`, `campus`, and `enterprise`. Confirm feature availability and implementation scope with VLABS before purchasing.

## Search and Agent Readability

The sitemap contains 12 indexable English/Vietnamese page URLs (six core pages per language) with reciprocal `en`, `vi`, and `x-default` alternates. Legal pages and not-found pages retain their deliberate `noindex` policy. `/llms.txt` curates 13 bullet links: the six core pages in both languages plus `/pricing.md`. A separate non-bullet reference and an HTTP `Link` header expose `/llms-full.txt` without changing that count.

The about, careers, and case-study sections are withdrawn. `/about`, `/careers`, `/case-study`, all career and case-study detail URLs, and their `/vi` variants return the localized not-found page with HTTP 404 and `noindex`, without a redirect. Their Markdown files and layout components are retained, but the sections are absent from navigation, curated links, and the sitemap. Removed `/business` and `/vi/business` routes also return HTTP 404.

`/llms.txt`, `/llms-full.txt`, and `/pricing.md` are server endpoints generated from repository content. `/llms-full.txt` serves readable Markdown from the same twelve core content entries: titles, descriptions, structured frontmatter copy, and any Markdown bodies. Disabled sections and withdrawn routes are not promoted. Both text endpoints use `text/plain; charset=utf-8`. The pricing representation contains both independently authored currencies, plan facts, and qualifications.

Shared layouts render safely serialized Organization, WebSite, FAQPage, and pricing JSON-LD where applicable. Only the open letter adds a WebPage publication month, derived from its existing authored date as `2026-11` in both languages. No modification date or sitemap `lastmod` is inferred. Social-image dimensions match the existing logo (480×480) or founder portrait (768×768), with localized factual alt text; unknown images receive no guessed dimensions or alt. Summary cards remain unchanged, and a dedicated wide card is deferred. These annotations do not guarantee indexing, rankings, AI citations, or rich-result eligibility.

Organization JSON-LD declares parent company Smart Learning Technology Solution with founder Nguyễn Đình Khôi; the footer credits the company.

## Verification

```bash
pnpm check          # Astro and TypeScript diagnostics
pnpm test:theme     # Apple-style theme switch behavior and geometry regressions
pnpm test:utils     # Markdown sanitization and plain-text metadata regressions
pnpm test:api       # API regression tests with mocked external services
node scripts/test-locale.mjs # Language, pricing, and route regressions
node scripts/test-seo.mjs    # JSON-LD serialization and pricing regressions
pnpm build         # Generate static assets and the standalone Node server
pnpm check:site     # Check SSR output, assets, and GET-only SEO runtime behavior
```

`check:site` requires a fresh build. Browser checks cover runtime HTML because public pages are server-rendered. Regression tests make no external service calls: they do not create real contacts, send messages, or charge cards.

## Project Structure

| Path                    | Purpose                                                      |
| ----------------------- | ------------------------------------------------------------ |
| `src/pages/`            | Website routes                                               |
| `src/pages/api/`        | Contact, lead, locale, SePay preparation, and retained Stripe webhook endpoints |
| `src/layouts/`          | Shared layout, page components, and navigation               |
| `src/content/`          | Page copy and structured section data                        |
| `src/content.config.ts` | Content collection schemas                                   |
| `src/config/`           | Brand, navigation, contact details, and theme settings       |
| `src/styles/`           | Styles and generated theme tokens                            |
| `src/lib/server/`       | Server-only validation and integration helpers               |
| `public/images/`        | Referenced website images and illustrations                  |
| `scripts/`              | Theme generation and verification tools                      |

Edit `src/config/theme.json`, not `src/styles/generated-theme.css`. The development watcher and build regenerate theme tokens automatically.

## Integrations and Deployment

The configured adapter is `@astrojs/node` in standalone server mode. Website pages are rendered on demand using repository Markdown; content changes require a rebuild. The build writes browser assets to `dist/client` and the server entry to `dist/server/entry.mjs`. `pnpm start` starts that built server; no build or start command deploys the website by itself.

The existing local PM2 configuration runs the development watcher on loopback port 4321. It is not a verified production-server configuration. Generated build output, local logs, and browser-test artifacts are not source files and are excluded from version control and the Docker build context where appropriate.

- Contact and lead forms use GoHighLevel when `GHL_API_KEY` and `GHL_LOCATION_ID` are configured.
- VND checkout prepares a signed SePay browser form when `SEPAY_MERCHANT_ID` and the matching Gateway signing key in `SEPAY_API_KEY` are configured. It prepares a one-time payment, not an automatic subscription. Offline tests do not prove that a particular credential belongs to the Gateway service or that a live payment succeeds.
- USD/PayPal checkout is intentionally unavailable. Keep its credentials blank until an implementation and configuration are authorized. Missing SePay configuration also returns localized HTTP 409 `checkout_unavailable` without falling back to another provider.
- The retained `/api/webhooks/stripe` endpoint requires `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and a correctly configured external webhook. It is not used by the current checkout flow; keep it until any external callers are explicitly retired.
- This website does not implement SePay payment-confirmation IPN/webhook handling or automatically activate learning accounts. Preparing a signed form or visiting a return URL is not proof of payment.
- Website content and image references come only from repository Markdown. There are no CMS management or publish endpoints.

A static-only host cannot run these API routes. Existing Docker, Netlify, Cloudflare, and other deployment configuration files are retained alternatives, not verified deployments for the current Node setup. Review their adapter and output-directory settings before using them. Obsolete generated Vercel output can be removed without deleting deployment configuration or source.

### Before Production Use

- Verify SePay Gateway and GoHighLevel credentials, permissions, delivery, and retry behavior in a test environment. Verify Stripe separately if its retained webhook is still used. Offline regression tests do not prove live integration behavior.
- Review repository Markdown and referenced local or external images before rebuilding. Local tests do not prove external image availability.
- Implement verified payment confirmation and account fulfillment before treating SePay checkout as a complete purchase workflow. Add deployment-level rate limiting and durable idempotency for checkout and webhook retries. This project does not include a persistent duplicate-event store. CRM contact upsert and additive tagging are separate requests; contact notes remain best effort.
- Google Tag Manager remains disabled in the site configuration. The installed integration supports Astro 7 and peer checks pass; still validate the container ID, consent behavior, and production data policy before enabling it.

## Content Review Before Publishing

Confirm plan prices, feature availability, integration support, recruitment information, and legal wording with the business owner. Illustrative use cases and diagrams are not verified customer results or product screenshots. Publish customer testimonials and metrics only with supporting evidence and permission.

Privacy and terms pages describe website flows, not a complete institutional data-processing agreement. Obtain appropriate legal review before production use.

## Attribution and License

The original Automark template was designed and developed by [Themefisher](https://themefisher.com/) and distributed by [ThemeWagon](https://themewagon.com/themes/automark/).

- Code license: [MIT](LICENSE).
- Original template imagery was supplied for demonstration purposes only. Verify rights for any retained imagery before publishing.
