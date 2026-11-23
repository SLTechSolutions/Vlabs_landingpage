import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parseFrontmatter } from "@astrojs/markdown-remark";
import Stripe from "stripe";
import ts from "typescript";
import { createServer, isRunnableDevEnvironment } from "vite";

// Run with: node scripts/test-api.mjs. No .env loading or external requests.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// Optional API/helper source snapshot for red/green; dependencies stay local.
const apiSourceRoot = process.env.API_TEST_SOURCE_ROOT
  ? resolve(process.env.API_TEST_SOURCE_ROOT)
  : root;
const pricing = parseFrontmatter(
  await readFile(resolve(root, "src/content/pricing/-index.md"), "utf8"),
).frontmatter;
const vndPricing = parseFrontmatter(
  await readFile(resolve(root, "src/content/pricing/vi/-index.md"), "utf8"),
).frontmatter;
const priceMatrix = [
  {
    planId: "starter",
    title: "Starter",
    interval: "month",
    price: "2.69",
    vndPrice: "69000",
    usd: 269,
    vnd: 69_000,
  },
  {
    planId: "starter",
    title: "Starter",
    interval: "year",
    price: "26.90",
    vndPrice: "690000",
    usd: 2_690,
    vnd: 690_000,
  },
  {
    planId: "campus",
    title: "Campus",
    interval: "month",
    price: "3.09",
    vndPrice: "79000",
    usd: 309,
    vnd: 79_000,
  },
  {
    planId: "campus",
    title: "Campus",
    interval: "year",
    price: "30.90",
    vndPrice: "790000",
    usd: 3_090,
    vnd: 790_000,
  },
  {
    planId: "enterprise",
    title: "Enterprise",
    interval: "month",
    price: "3.89",
    vndPrice: "99000",
    usd: 389,
    vnd: 99_000,
  },
  {
    planId: "enterprise",
    title: "Enterprise",
    interval: "year",
    price: "38.90",
    vndPrice: "990000",
    usd: 3_890,
    vnd: 990_000,
  },
];
const fixtureKey = "__vlabsApiRegression";
const privateMarker = "fixture-upstream-private-detail";
const fixtureEnv = {
  GHL_API_KEY: "ghl-local-test-only",
  GHL_LOCATION_ID: "location-local-test-only",
  STRIPE_SECRET_KEY: "sk_test_local_fixture_only",
  STRIPE_WEBHOOK_SECRET: "whsec_local_fixture_only",
  SEPAY_MERCHANT_ID: "test-merchant",
  SEPAY_API_KEY: "test-secret",
};
const runtimeFixtureEnv = {
  GHL_API_KEY: "ghl-runtime-test-only",
  GHL_LOCATION_ID: "location-runtime-test-only",
  STRIPE_SECRET_KEY: "sk_test_runtime_fixture_only",
  STRIPE_WEBHOOK_SECRET: "whsec_runtime_fixture_only",
  SEPAY_MERCHANT_ID: "test-runtime-merchant",
  SEPAY_API_KEY: "test-runtime-secret",
};
const person = { name: " Ada Lovelace ", email: " ada@example.test " };
const seededTags = ["existing-crm-tag", "existing-segment"];
const checkout = {
  ...person,
  planId: "starter",
  interval: "month",
  locale: "vi",
};
const sepayCheckoutUrl = "https://pay.sepay.vn/v1/checkout/init";
const sepaySigningFields = [
  "order_amount", "merchant", "currency", "operation", "order_description",
  "order_invoice_number", "customer_id", "payment_method", "success_url",
  "error_url", "cancel_url",
];
const emittedSepayFields = [
  "order_amount", "merchant", "currency", "operation", "order_description",
  "order_invoice_number", "success_url", "error_url", "cancel_url", "lang",
  "signature",
];
const unavailableErrors = {
  en: "Online payment is not available for this selection. Please contact the VLABS team.",
  vi: "Thanh toán trực tuyến chưa khả dụng cho lựa chọn này. Vui lòng liên hệ đội ngũ VLABS.",
};
const siteConfig = JSON.parse(await readFile(resolve(root, "src/config/config.json"), "utf8"));
const returnOrigin = new URL(siteConfig.site.base_url).origin;
const sessionUrl = "https://checkout.stripe.com/c/pay/cs_test_local_fixture";
const offlineStripe = new Stripe(fixtureEnv.STRIPE_SECRET_KEY, {
  telemetry: false,
});

await test("API regression suite (offline)", async (t) => {
  const previousFixture = globalThis[fixtureKey];
  const state = {
    env: {},
    runtimeEnv: {},
    pricing: undefined,
    vndPricing: undefined,
    fetchCalls: [],
    fetchResponses: [],
    stripeCalls: [],
    constructors: [],
    entryCalls: [],
    signatureBodies: [],
    timeouts: [],
    logs: [],
    blockedNetworkCalls: 0,
  };
  function reset() {
    state.env = { ...fixtureEnv };
    state.runtimeEnv = {};
    state.pricing = structuredClone(pricing);
    state.vndPricing = structuredClone(vndPricing);
    for (const key of [
      "fetchCalls",
      "fetchResponses",
      "stripeCalls",
      "constructors",
      "entryCalls",
      "signatureBodies",
      "timeouts",
      "logs",
    ]) {
      state[key].length = 0;
    }
    state.abortGhl = false;
    state.constructorError = undefined;
    state.contactId = "contact-local-fixture";
    state.crmTags = new Set(seededTags);
    state.fetchImpl = async (url, options) => {
      const payload = JSON.parse(options.body);
      if (url.endsWith("/contacts/upsert")) {
        // Model the documented destructive upsert behavior, not idealized merging.
        if (Object.hasOwn(payload, "tags")) {
          state.crmTags = new Set(payload.tags);
        }
        return Response.json({ contact: { id: state.contactId } });
      }
      if (url.endsWith("/tags")) {
        assert.equal(
          url,
          `https://services.leadconnectorhq.com/contacts/${encodeURIComponent(state.contactId.trim())}/tags`,
        );
        assert.ok(Array.isArray(payload.tags));
        for (const tag of payload.tags) {
          assert.equal(typeof tag, "string");
          state.crmTags.add(tag);
        }
        return Response.json({ tags: [...state.crmTags] }, { status: 201 });
      }
      return Response.json({ success: true });
    };
    state.createSession = async () => ({ url: sessionUrl });
  }
  state.Stripe = class FixtureStripe {
    constructor(key, options) {
      state.constructors.push({ key, options });
      if (state.constructorError) throw state.constructorError;
      this.checkout = {
        sessions: {
          create: async (params) => {
            state.stripeCalls.push(structuredClone(params));
            return state.createSession(params);
          },
        },
      };
      this.webhooks = {
        constructEvent: (body, signature, secret) => {
          state.signatureBodies.push(body);
          // Real SDK signature verification, using only local fixture secrets.
          return offlineStripe.webhooks.constructEvent(body, signature, secret);
        },
      };
    }
  };
  state.getEntry = async (collection, id) => {
    state.entryCalls.push({ collection, id });
    assert.equal(collection, "pricing");
    assert.ok(id === "-index" || id === "vi/-index");
    const data = id === "vi/-index" ? state.vndPricing : state.pricing;
    return data === undefined
      ? undefined
      : { id, collection, data };
  };
  globalThis[fixtureKey] = state;
  reset();

  const denyNetwork = () => {
    state.blockedNetworkCalls++;
    throw new Error("External network disabled in API regression tests.");
  };
  for (const client of [http, https]) {
    t.mock.method(client, "request", denyNetwork);
    t.mock.method(client, "get", denyNetwork);
  }
  for (const method of ["error", "log", "warn", "info"]) {
    t.mock.method(console, method, (...args) => {
      state.logs.push(args.map(String).join(" "));
    });
  }
  t.mock.method(AbortSignal, "timeout", (milliseconds) => {
    state.timeouts.push(milliseconds);
    assert.equal(milliseconds, 5_000);
    return state.abortGhl
      ? AbortSignal.abort(new DOMException(privateMarker, "TimeoutError"))
      : new AbortController().signal;
  });
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(typeof url, "string");
    if (new URL(url).origin !== "https://services.leadconnectorhq.com") {
      state.blockedNetworkCalls++;
      throw new Error("Provider network calls are forbidden in offline tests.");
    }
    assert.equal(options.method, "POST");
    assert.equal(options.headers["Content-Type"], "application/json");
    assert.equal(options.headers.Version, "2021-07-28");
    assert.equal(
      options.headers.Authorization,
      `Bearer ${state.runtimeEnv.GHL_API_KEY ?? state.env.GHL_API_KEY}`,
    );
    state.fetchCalls.push({
      url,
      payload: JSON.parse(options.body),
      signal: options.signal,
    });
    if (options.signal?.aborted) throw options.signal.reason;
    const response = await state.fetchImpl(url, options);
    assert.ok(response instanceof Response);
    state.fetchResponses.push({ url, response });
    return response;
  });

  let server;
  try {
    server = await createServer({
      root,
      configFile: false,
      envDir: false,
      appType: "custom",
      logLevel: "silent",
      server: { middlewareMode: true, hmr: false, watch: null },
      optimizeDeps: { noDiscovery: true, include: [] },
      ssr: { noExternal: ["stripe"] },
      plugins: [
        {
          name: "api-regression-fixtures",
          enforce: "pre",
          resolveId(id) {
            if (id === "stripe" || id === "astro:content") {
              return `\0api-regression:${id}`;
            }
          },
          load(id) {
            if (id === "\0api-regression:stripe") {
              return `export default globalThis[${JSON.stringify(fixtureKey)}].Stripe;`;
            }
            if (id === "\0api-regression:astro:content") {
              return `export const getEntry = (...args) => globalThis[${JSON.stringify(fixtureKey)}].getEntry(...args);`;
            }
          },
          async transform(code, id) {
            const sourceDirectory = ["src/pages/api", "src/lib/server"].find(
              (directory) => id.startsWith(resolve(root, directory) + "/"),
            );
            if (
              sourceDirectory ||
              id === resolve(root, "src/lib/currency.ts")
            ) {
              const source =
                apiSourceRoot === root
                  ? code
                  : await readFile(
                      resolve(apiSourceRoot, id.slice(root.length + 1)),
                      "utf8",
                    );
              return {
                // Isolate both env sources without mutating real process.env.
                code: source
                  .replaceAll(
                    "process.env",
                    `globalThis[${JSON.stringify(fixtureKey)}].runtimeEnv`,
                  )
                  .replaceAll(
                    "import.meta.env",
                    `globalThis[${JSON.stringify(fixtureKey)}].env`,
                  ),
                map: null,
              };
            }
          },
        },
      ],
    });
    const environment = server.environments.ssr;
    assert.ok(isRunnableDevEnvironment(environment));
    const routes = {};
    for (const name of ["contact", "lead", "checkout", "webhooks/stripe"]) {
      routes[name] = await environment.runner.import(
        `/src/pages/api/${name}.ts`,
      );
    }
    const apiHelpers = await environment.runner.import(
      "/src/lib/server/api.ts",
    );
    const pricingHelpers = await environment.runner.import(
      "/src/lib/server/pricing.ts",
    );
    // A source snapshot predating this foundation still runs every original
    // regression. Missing new modules become expected red assertions, not an
    // import failure that prevents the baseline suite from running.
    async function optionalSourceModule(file) {
      try {
        await access(resolve(apiSourceRoot, file));
      } catch (error) {
        if (error.code === "ENOENT") return {};
        throw error;
      }
      return environment.runner.import(`/${file}`);
    }
    const currency = await optionalSourceModule("src/lib/currency.ts");
    const sepayHelpers = await optionalSourceModule("src/lib/server/sepay.ts");
    const localeRoute = await optionalSourceModule("src/pages/api/locale.ts");
    const apiMessages = await optionalSourceModule(
      "src/lib/server/apiMessages.ts",
    );

    function rawRequest(route, body, contentType = "application/json") {
      const request = new Request(`https://vlabs.example.test/api/${route}`, {
        method: "POST",
        headers: contentType ? { "Content-Type": contentType } : {},
        body,
      });
      if (!contentType) request.headers.delete("content-type");
      return request;
    }
    const jsonRequest = (route, body) =>
      rawRequest(route, JSON.stringify(body));
    const invoke = (route, request) =>
      routes[route].POST({ request, url: new URL(request.url) });
    function noSideEffects() {
      assert.equal(state.fetchCalls.length, 0);
      assert.equal(state.stripeCalls.length, 0);
      assert.equal(state.blockedNetworkCalls, 0);
    }
    function noOutboundMessages() {
      assert.ok(
        state.fetchCalls.every(
          (call) => !new URL(call.url).pathname.startsWith("/conversations/"),
        ),
        "Contact tracking must not send outbound messages.",
      );
    }
    function preservedTags(...tags) {
      assert.deepEqual(state.crmTags, new Set([...seededTags, ...tags]));
    }
    function contactDelivery(payload, tags) {
      assert.equal(
        state.fetchCalls[0].url,
        "https://services.leadconnectorhq.com/contacts/upsert",
      );
      assert.deepEqual(state.fetchCalls[0].payload, payload);
      assert.equal(
        state.fetchCalls[1].url,
        `https://services.leadconnectorhq.com/contacts/${encodeURIComponent(state.contactId.trim())}/tags`,
      );
      assert.deepEqual(state.fetchCalls[1].payload, { tags });
      preservedTags(...tags);
    }
    function safeLogs() {
      assert.equal(state.blockedNetworkCalls, 0, "No provider/network attempt is allowed.");
      const logs = state.logs.join("\n");
      for (const sensitive of [
        privateMarker,
        "ada@example.test",
        "paid@example.test",
        ...Object.values(fixtureEnv),
        ...Object.values(runtimeFixtureEnv),
      ]) {
        assert.ok(
          !logs.includes(sensitive),
          "Logs must not contain private data",
        );
      }
      assert.equal(state.timeouts.length, state.fetchCalls.length);
      for (const call of state.fetchCalls) {
        assert.ok(call.signal instanceof AbortSignal);
      }
      noOutboundMessages();
      for (const { response } of state.fetchResponses) {
        assert.ok(
          response.body === null || response.bodyUsed,
          "GHL response bodies must be consumed or cancelled.",
        );
      }
    }
    async function responseBody(response, status, expected) {
      assert.equal(response.status, status);
      assert.match(
        response.headers.get("content-type"),
        /^application\/json\b/,
      );
      assert.equal(response.headers.get("cache-control"), "no-store");
      const body = await response.json();
      if (status >= 400) {
        assert.deepEqual(Object.keys(body).sort(), body.code === "checkout_unavailable"
          ? ["code", "error", "success"] : ["error", "success"]);
        if (body.code === "checkout_unavailable") assert.equal(status, 409);
        assert.equal(body.success, false);
        assert.equal(typeof body.error, "string");
        assert.ok(body.error.length > 0);
        for (const sensitive of [
          privateMarker,
          ...Object.values(fixtureEnv),
          ...Object.values(runtimeFixtureEnv),
        ]) {
          assert.ok(!JSON.stringify(body).includes(sensitive));
        }
      }
      if (typeof expected === "function") expected(body);
      else if (expected) assert.deepEqual(body, expected);
      return body;
    }
    function referenceSignature(fields, secretKey) {
      const signingString = sepaySigningFields
        .filter((name) => typeof fields[name] === "string" && fields[name] !== "" && fields[name] !== "0")
        .map((name) => `${name}=${fields[name]}`).join(",");
      return createHmac("sha256", secretKey).update(signingString, "utf8").digest("base64");
    }
    function sepayResponse(body, unitAmount = 69_000) {
      assert.deepEqual(Object.keys(body).sort(), ["fields", "method", "orderId", "provider", "success", "url"]);
      assert.equal(body.success, true);
      assert.equal(body.provider, "sepay");
      assert.equal(body.url, sepayCheckoutUrl);
      assert.equal(body.method, "POST");
      assert.match(body.orderId, /^INV-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      assert.deepEqual(Object.keys(body.fields), emittedSepayFields, "Form insertion order must match the documented signing order.");
      assert.ok(Object.values(body.fields).every((value) => typeof value === "string"));
      assert.equal(body.fields.order_amount, String(unitAmount));
      assert.equal(body.fields.merchant, state.runtimeEnv.SEPAY_MERCHANT_ID ?? state.env.SEPAY_MERCHANT_ID);
      assert.equal(body.fields.currency, "VND");
      assert.equal(body.fields.operation, "PURCHASE");
      assert.equal(body.fields.order_invoice_number, body.orderId);
      assert.equal(body.fields.lang, "vi");
      assert.equal(body.fields.signature, referenceSignature(body.fields, state.runtimeEnv.SEPAY_API_KEY ?? state.env.SEPAY_API_KEY));
      for (const result of ["success", "error", "cancel"]) {
        const url = new URL(body.fields[`${result}_url`]);
        assert.equal(url.origin, returnOrigin);
        assert.equal(url.pathname, "/vi/pricing");
        assert.equal(url.searchParams.get("checkout"), result);
        assert.equal(url.searchParams.get("order"), body.orderId);
        assert.equal(url.hash, "");
      }
      for (const secret of [fixtureEnv.SEPAY_API_KEY, runtimeFixtureEnv.SEPAY_API_KEY]) {
        assert.ok(!JSON.stringify(body).includes(secret), "Signing secrets must never be emitted.");
      }
      assert.ok(!JSON.stringify(body).includes("ada@example.test"));
      assert.equal(state.stripeCalls.length, 0);
      assert.equal(state.constructors.length, 0);
    }
    const unavailableResponse = (locale) => ({ success: false, code: "checkout_unavailable", error: unavailableErrors[locale] });
    const run = async (name, behavior) => {
      await t.test(name, async () => {
        reset();
        await behavior();
        safeLogs();
      });
    };

    await run("routes retain POST-only, server-rendered contract", async () => {
      for (const route of Object.values(routes)) {
        assert.equal(route.prerender, false);
        assert.equal(typeof route.POST, "function");
        assert.equal(route.GET, undefined);
        assert.equal(route.ALL, undefined);
      }
      noSideEffects();
    });

    await run("API/helper TypeScript contracts compile", async () => {
      const config = ts.readConfigFile(
        resolve(root, "tsconfig.json"),
        ts.sys.readFile,
      );
      assert.equal(config.error, undefined);
      const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
      const ownedFile = (file) =>
        file.startsWith(resolve(root, "src/pages/api") + "/") ||
        file.startsWith(resolve(root, "src/lib/server") + "/") ||
        file === resolve(root, "src/lib/currency.ts");
      const files = parsed.fileNames.filter(
        (file) => ownedFile(file) || file.endsWith(".d.ts"),
      );
      assert.ok(files.some(ownedFile));
      // Keep project target/lib and Astro types; ignore only TS6 config deprecations.
      const program = ts.createProgram(files, {
        ...parsed.options,
        noEmit: true,
        incremental: false,
        ignoreDeprecations: "6.0",
      });
      const diagnostics = [
        ...parsed.errors,
        ...ts.getPreEmitDiagnostics(program),
      ];
      const messages = diagnostics
        .map((diagnostic) =>
          ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
        )
        .join("\n");
      assert.equal(diagnostics.length, 0, messages);
    });

    const invalidFields = [
      ["missing name", { name: undefined }],
      ["blank name", { name: "   " }],
      ["numeric name", { name: 42 }],
      ["object name", { name: {} }],
      ["array name", { name: [] }],
      ["null name", { name: null }],
      ["boolean name", { name: true }],
      ["missing email", { email: undefined }],
      ["blank email", { email: " \t " }],
      ["numeric email", { email: 42 }],
      ["object email", { email: {} }],
      ["array email", { email: [] }],
      ["null email", { email: null }],
      ["invalid email", { email: "not-an-email" }],
      ["name length", { name: "n".repeat(201) }],
      ["email length", { email: `a@${"d".repeat(250)}.test` }],
      ["email local-part length", { email: `${"e".repeat(65)}@example.test` }],
      ["name controls", { name: "Ada\u0000Lovelace" }],
    ];
    for (const route of ["contact", "lead", "checkout"]) {
      const valid = route === "checkout" ? checkout : person;
      for (const [label, body] of [
        ["malformed JSON", "{"],
        ["empty JSON", ""],
        ["JSON null", "null"],
        ["JSON array", "[]"],
        ["JSON scalar", '"text"'],
      ]) {
        await run(`${route}: rejects ${label}`, async () => {
          await responseBody(await invoke(route, rawRequest(route, body)), 400);
          noSideEffects();
        });
      }
      for (const [label, fields] of invalidFields) {
        await run(`${route}: rejects ${label}`, async () => {
          await responseBody(
            await invoke(route, jsonRequest(route, { ...valid, ...fields })),
            400,
          );
          noSideEffects();
        });
      }
      for (const contentType of [
        null,
        "text/plain",
        "application/json-extra",
      ]) {
        await run(
          `${route}: rejects content type ${contentType ?? "missing"}`,
          async () => {
            await responseBody(
              await invoke(
                route,
                rawRequest(route, JSON.stringify(valid), contentType),
              ),
              415,
            );
            noSideEffects();
          },
        );
      }
      await run(`${route}: bounds actual body size`, async () => {
        await responseBody(
          await invoke(
            route,
            jsonRequest(route, { ...valid, unused: "x".repeat(32 * 1024) }),
          ),
          413,
        );
        noSideEffects();
      });
      await run(`${route}: bounds declared body size`, async () => {
        const request = jsonRequest(route, valid);
        request.headers.set("content-length", String(32 * 1024 + 1));
        await responseBody(await invoke(route, request), 413);
        noSideEffects();
      });
    }

    for (const route of ["contact", "lead"]) {
      for (const format of ["JSON", "urlencoded", "multipart"]) {
        await run(`${route}: accepts happy ${format} form`, async () => {
          let request;
          if (format === "JSON") {
            request = rawRequest(
              route,
              JSON.stringify(person),
              "Application/JSON; charset=utf-8",
            );
          } else if (format === "urlencoded") {
            request = rawRequest(
              route,
              new URLSearchParams(person).toString(),
              "application/x-www-form-urlencoded; charset=utf-8",
            );
          } else {
            const form = new FormData();
            for (const [key, value] of Object.entries(person)) {
              form.append(key, value);
            }
            request = new Request(`https://vlabs.example.test/api/${route}`, {
              method: "POST",
              body: form,
            });
          }
          await responseBody(await invoke(route, request), 200, {
            success: true,
          });
          assert.equal(state.fetchCalls.length, 2);
          contactDelivery(
            {
              locationId: fixtureEnv.GHL_LOCATION_ID,
              firstName: "Ada",
              lastName: "Lovelace",
              email: "ada@example.test",
              ...(route === "contact" ? { phone: "" } : {}),
            },
            [
              route === "contact"
                ? "website-contact-form"
                : "website-lead-generation",
            ],
          );
        });
      }
      await run(`${route}: rejects malformed multipart`, async () => {
        await responseBody(
          await invoke(
            route,
            rawRequest(route, "broken", "multipart/form-data"),
          ),
          400,
        );
        noSideEffects();
      });
      await run(`${route}: rejects duplicate form fields`, async () => {
        await responseBody(
          await invoke(
            route,
            rawRequest(
              route,
              "name=Ada&name=Other&email=ada%40example.test",
              "application/x-www-form-urlencoded",
            ),
          ),
          400,
        );
        noSideEffects();
      });
      await run(`${route}: rejects file-valued form field`, async () => {
        const form = new FormData();
        form.set("name", new Blob(["Ada"]), "name.txt");
        form.set("email", "ada@example.test");
        await responseBody(
          await invoke(
            route,
            new Request(`https://vlabs.example.test/api/${route}`, {
              method: "POST",
              body: form,
            }),
          ),
          400,
        );
        noSideEffects();
      });
      for (const status of [401, 422, 503]) {
        await run(`${route}: hides upstream ${status} error`, async () => {
          state.fetchImpl = async () =>
            Response.json({ message: privateMarker }, { status });
          await responseBody(
            await invoke(route, jsonRequest(route, person)),
            502,
          );
        });
      }
      for (const label of ["network failure", "timeout", "invalid response"]) {
        await run(`${route}: handles ${label}`, async () => {
          state.abortGhl = label === "timeout";
          state.fetchImpl = async () => {
            if (label === "invalid response")
              return Response.json({ contact: {} });
            throw new Error(privateMarker);
          };
          await responseBody(
            await invoke(route, jsonRequest(route, person)),
            502,
          );
        });
      }
      await run(`${route}: handles malformed upstream JSON`, async () => {
        state.fetchImpl = async () => new Response("not JSON");
        await responseBody(
          await invoke(route, jsonRequest(route, person)),
          502,
        );
      });
      await run(`${route}: missing configuration is safe`, async () => {
        delete state.env.GHL_API_KEY;
        await responseBody(
          await invoke(route, jsonRequest(route, person)),
          500,
        );
        noSideEffects();
      });
    }

    for (const [label, fields] of [
      ["numeric phone", { phone: 42 }],
      ["object phone", { phone: {} }],
      ["null phone", { phone: null }],
      ["numeric message", { message: 42 }],
      ["object message", { message: {} }],
      ["null message", { message: null }],
      ["phone length", { phone: "1".repeat(51) }],
      ["message length", { message: "m".repeat(5_001) }],
    ]) {
      await run(`contact: rejects ${label}`, async () => {
        await responseBody(
          await invoke(
            "contact",
            jsonRequest("contact", { ...person, ...fields }),
          ),
          400,
        );
        noSideEffects();
      });
    }
    await run(
      "contact: stores plain-text note without sending outbound messages",
      async () => {
        const message = ` <img src=x onerror="alert(1)">& 'text'\r\nSecond line `;
        const response = await invoke(
          "contact",
          jsonRequest("contact", {
            ...person,
            phone: " +1 555 0100 ",
            message,
          }),
        );
        noOutboundMessages();
        assert.equal(state.fetchCalls.length, 3);
        assert.equal(state.fetchCalls[0].payload.phone, "+1 555 0100");
        assert.deepEqual(state.fetchCalls[1].payload, {
          tags: ["website-contact-form"],
        });
        assert.ok(
          state.fetchCalls[2].url.endsWith(
            "/contacts/contact-local-fixture/notes",
          ),
        );
        assert.deepEqual(state.fetchCalls[2].payload, {
          body: `Message from web form:\n\n${message.trim()}`,
        });
        await responseBody(response, 200, { success: true });
      },
    );
    await run(
      "contact: encodes upstream contact ID in tag/note URLs",
      async () => {
        state.contactId = " id/segment?query#fragment% é ";
        await responseBody(
          await invoke(
            "contact",
            jsonRequest("contact", { ...person, message: "Hi" }),
          ),
          200,
        );
        assert.equal(
          state.fetchCalls[1].url,
          "https://services.leadconnectorhq.com/contacts/id%2Fsegment%3Fquery%23fragment%25%20%C3%A9/tags",
        );
        assert.equal(
          state.fetchCalls[2].url,
          "https://services.leadconnectorhq.com/contacts/id%2Fsegment%3Fquery%23fragment%25%20%C3%A9/notes",
        );
      },
    );
    for (const status of [200, 201, 204, 401, 422, 503]) {
      await run(
        `contact: disposes ${status} note response; tracking stays best effort`,
        async () => {
          const successfulFetch = state.fetchImpl;
          state.fetchImpl = async (url, options) =>
            url.endsWith("/notes")
              ? new Response(status === 204 ? null : privateMarker, { status })
              : successfulFetch(url, options);
          await responseBody(
            await invoke(
              "contact",
              jsonRequest("contact", { ...person, message: "Hi" }),
            ),
            200,
            { success: true },
          );
          assert.equal(state.fetchCalls.length, 3);
          assert.equal(
            state.logs.some((log) => log.includes("note tracking failed")),
            status >= 400,
          );
          const noteResponse = state.fetchResponses.find(({ url }) =>
            url.endsWith("/notes"),
          ).response;
          assert.ok(noteResponse.body === null || noteResponse.bodyUsed);
          preservedTags("website-contact-form");
        },
      );
    }

    for (const row of priceMatrix) {
      for (const locale of ["vi", "en"]) {
        await run(
          `checkout: ${row.planId}/${row.interval}/${locale} uses immutable server content, never client price/provider`,
          async () => {
            const response = await invoke(
              "checkout",
              jsonRequest("checkout", {
                ...checkout,
                planId: row.planId,
                interval: row.interval,
                locale,
                planTitle: "Injected <Plan>",
                price: "0.01",
                amount: 1,
                unitAmount: 1,
                order_amount: "1",
                currency: locale === "vi" ? "usd" : "vnd",
                provider: "stripe",
                merchant: "injected-merchant",
                signature: "injected-signature",
                contentId: locale === "vi" ? "-index" : "vi/-index",
              }),
            );
            assert.deepEqual(state.entryCalls, [
              { collection: "pricing", id: locale === "vi" ? "vi/-index" : "-index" },
            ]);
            if (locale === "en") {
              await responseBody(response, 409, unavailableResponse(locale));
              noSideEffects();
              assert.equal(state.constructors.length, 0);
              preservedTags();
              return;
            }
            await responseBody(response, 200, (body) => sepayResponse(body, row.vnd));
            assert.equal(state.fetchCalls.length, 2);
            contactDelivery(
              {
                locationId: fixtureEnv.GHL_LOCATION_ID,
                firstName: "Ada",
                lastName: "Lovelace",
                email: "ada@example.test",
              },
              ["checkout-initiated", row.title],
            );
          },
        );
      }
    }
    await run(
      "checkout: island JSON is sufficient, GHL is optional, and no Stripe key is needed",
      async () => {
        delete state.env.GHL_API_KEY;
        delete state.env.STRIPE_SECRET_KEY;
        await responseBody(
          await invoke("checkout", rawRequest("checkout", JSON.stringify(checkout), "Application/JSON; charset=utf-8")),
          200,
          sepayResponse,
        );
        noSideEffects();
      },
    );
    await run(
      "checkout: object-valued legacy prices and nested fields cannot control the signed request",
      async () => {
        await responseBody(
          await invoke(
            "checkout",
            jsonRequest("checkout", {
              ...checkout, price: {}, amount: [], order_amount: {},
              fields: { order_amount: "1", currency: "USD", signature: "injected" },
            }),
          ),
          200,
          sepayResponse,
        );
      },
    );
    for (const [label, fields] of [
      ["unknown plan", { planId: "Injected <Plan>" }],
      ["title instead of ID", { planId: "Starter" }],
      ["blank plan", { planId: " " }],
      ["missing plan", { planId: undefined }],
      ["numeric plan", { planId: 49 }],
      ["null plan", { planId: null }],
      ["object plan", { planId: {} }],
      ["array plan", { planId: [] }],
      ["long plan", { planId: "p".repeat(101) }],
      ["prototype plan", { planId: "__proto__" }],
      ["plan leading whitespace", { planId: " starter" }],
      ["plan trailing whitespace", { planId: "starter " }],
      ["unknown interval", { interval: "week" }],
      ["unsupported yearly alias", { interval: "yearly" }],
      ["missing interval", { interval: undefined }],
      ["blank interval", { interval: " " }],
      ["numeric interval", { interval: 12 }],
      ["null interval", { interval: null }],
      ["object interval", { interval: {} }],
      ["array interval", { interval: [] }],
      ["interval leading whitespace", { interval: " month" }],
      ["interval trailing whitespace", { interval: "year " }],
      ["interval case", { interval: "MONTH" }],
      ["missing locale", { locale: undefined }],
      ["blank locale", { locale: "" }],
      ["numeric locale", { locale: 12 }],
      ["null locale", { locale: null }],
      ["object locale", { locale: {} }],
      ["array locale", { locale: [] }],
      ["boolean locale", { locale: true }],
      ["unknown locale", { locale: "fr" }],
      ["currency instead of locale", { locale: "vnd" }],
      ["locale leading whitespace", { locale: " vi" }],
      ["locale trailing whitespace", { locale: "en " }],
      ["locale case", { locale: "VI" }],
      ["locale regional alias", { locale: "en-US" }],
    ]) {
      await run(
        `checkout: rejects ${label} before external side effects`,
        async () => {
          await responseBody(
            await invoke(
              "checkout",
              jsonRequest("checkout", { ...checkout, ...fields }),
            ),
            400,
          );
          noSideEffects();
          assert.equal(state.constructors.length, 0);
          assert.equal(state.entryCalls.length, 0);
        },
      );
    }
    await run("checkout: invalid selections beat unavailable configuration in either locale", async () => {
      state.env = {};
      for (const locale of ["en", "vi"]) {
        for (const [fields, english, vietnamese] of [
          [{ planId: "unknown" }, "Unknown plan.", "Không tìm thấy gói dịch vụ."],
          [{ interval: "week" }, "Interval must be month or year.", "Chu kỳ thanh toán phải là tháng hoặc năm."],
        ]) {
          await responseBody(await invoke("checkout", jsonRequest("checkout", { ...checkout, locale, ...fields })), 400, {
            success: false, error: locale === "vi" ? vietnamese : english,
          });
        }
      }
      noSideEffects();
      assert.equal(state.entryCalls.length, 0);
    });
    await run("checkout: rejects form content type", async () => {
      await responseBody(
        await invoke(
          "checkout",
          rawRequest(
            "checkout",
            new URLSearchParams(checkout).toString(),
            "application/x-www-form-urlencoded",
          ),
        ),
        415,
      );
      noSideEffects();
    });
    for (const badPrice of ["69000vnd", "0", "-1", "69000.0", "69.000", "9".repeat(20)]) {
      await run(
        `checkout: invalid configured VND amount ${badPrice} cannot create signed fields`,
        async () => {
          state.vndPricing.plans[0].price = badPrice;
          await responseBody(
            await invoke("checkout", jsonRequest("checkout", checkout)),
            500,
          );
          noSideEffects();
        },
      );
    }
    for (const locale of ["en", "vi"]) {
      for (const [label, mutate] of [
        ["missing content", (content) => { state[content] = undefined; }],
        ["duplicate IDs", (content) => { state[content].plans[1].plan_id = "starter"; }],
        ["missing immutable ID", (content) => { delete state[content].plans[0].plan_id; }],
        ["blank configured title", (content) => { state[content].plans[0].title = " "; }],
      ]) {
        await run(`checkout: ${locale} ${label} fails closed without fallback`, async () => {
          mutate(locale === "vi" ? "vndPricing" : "pricing");
          await responseBody(await invoke("checkout", jsonRequest("checkout", { ...checkout, locale })), 500);
          noSideEffects();
          assert.equal(state.constructors.length, 0);
        });
      }
    }
    await run("checkout: VND pricing is independent of USD content and localized titles", async () => {
      state.pricing = undefined;
      state.vndPricing.plans.reverse();
      state.vndPricing.plans.find((plan) => plan.plan_id === "starter").title = "Gói khởi đầu";
      const body = await responseBody(await invoke("checkout", jsonRequest("checkout", checkout)), 200, sepayResponse);
      assert.match(body.fields.order_description, /Gói khởi đầu/);
      contactDelivery({ locationId: fixtureEnv.GHL_LOCATION_ID, firstName: "Ada", lastName: "Lovelace", email: "ada@example.test" }, ["checkout-initiated", "Gói khởi đầu"]);
    });
    for (const failure of [503, "network failure", "timeout", "invalid response"]) {
      await run(`checkout: optional GHL ${failure} does not block SePay field preparation`, async () => {
        state.abortGhl = failure === "timeout";
        state.fetchImpl = async () => {
          if (failure === "invalid response") return Response.json({ contact: {} });
          if (typeof failure === "number") return new Response(privateMarker, { status: failure });
          throw new Error(privateMarker);
        };
        await responseBody(
          await invoke("checkout", jsonRequest("checkout", checkout)),
          200,
          sepayResponse,
        );
        assert.ok(state.logs.some((log) => log.includes("contact tracking failed")));
      });
    }
    for (const source of ["env", "runtimeEnv"]) {
      for (const key of ["SEPAY_MERCHANT_ID", "SEPAY_API_KEY"]) {
        for (const [label, value] of [["missing", undefined], ["blank", ""], ["whitespace", " \t\n "]]) {
          await run(`checkout: ${source} ${label} ${key} is unavailable without any network or fallback`, async () => {
            if (source === "runtimeEnv") {
              // Undefined alone intentionally permits the build-time fallback.
              if (value === undefined) delete state.env[key];
              state.runtimeEnv[key] = value;
            } else if (value === undefined) delete state.env[key];
            else state.env[key] = value;
            await responseBody(await invoke("checkout", jsonRequest("checkout", checkout)), 409, unavailableResponse("vi"));
            noSideEffects();
            assert.equal(state.constructors.length, 0);
            preservedTags();
          });
        }
      }
    }
    await run("checkout: EN/USD with every integration absent remains a safe unavailable response", async () => {
      state.env = {};
      await responseBody(await invoke("checkout", jsonRequest("checkout", { ...checkout, locale: "en" })), 409, unavailableResponse("en"));
      noSideEffects();
      assert.equal(state.constructors.length, 0);
    });
    await run("checkout: return URLs ignore client callbacks, request host, and forwarded-host headers", async () => {
      const request = new Request("https://attacker.example.test/api/checkout", {
        method: "POST", headers: { "Content-Type": "application/json", "X-Forwarded-Host": "attacker.example.test" },
        body: JSON.stringify({ ...checkout, success_url: "javascript:alert(1)", error_url: "https://attacker.example.test/error", cancel_url: "https://user:pass@attacker.example.test/cancel", returnUrl: "https://attacker.example.test", orderId: "injected-order" }),
      });
      const body = await responseBody(await invoke("checkout", request), 200, sepayResponse);
      assert.ok(!JSON.stringify(body).includes("attacker.example.test"));
      assert.ok(!JSON.stringify(body).includes("injected-order"));
    });
    await run("checkout: parallel requests and retries receive unique request-local invoices without charging or network", async () => {
      delete state.env.GHL_API_KEY;
      const responses = await Promise.all(Array.from({ length: 40 }, () => invoke("checkout", jsonRequest("checkout", checkout))));
      const orders = new Set();
      for (const response of responses) {
        const body = await responseBody(response, 200, sepayResponse);
        assert.ok(!orders.has(body.orderId));
        orders.add(body.orderId);
      }
      assert.equal(orders.size, 40);
      noSideEffects();
    });
    const signatureVector = {
      order_amount: "69000", merchant: "test-merchant", currency: "VND", operation: "PURCHASE",
      order_description: "Starter + thử nghiệm & renewal", order_invoice_number: "INV-test-001",
      success_url: "https://checkout.example.test/vi/pricing?checkout=success",
      error_url: "https://checkout.example.test/vi/pricing?checkout=error",
      cancel_url: "https://checkout.example.test/vi/pricing?checkout=cancel",
    };
    await run("SePay: raw UTF-8 Base64 HMAC-SHA256 matches independent Python throwaway vector", async () => {
      assert.equal(typeof sepayHelpers.signSepayFields, "function");
      // Computed independently using Python's hmac/hashlib/base64 standard library.
      const expected = "sPuni275jvyyTCUqcd9dp5ojd+q1uFcGtmnUumjlh9A=";
      const before = structuredClone(signatureVector);
      assert.equal(sepayHelpers.signSepayFields(signatureVector, "test-secret"), expected);
      assert.deepEqual(signatureVector, before);
      assert.notEqual(sepayHelpers.signSepayFields({ ...signatureVector, order_amount: "1" }, "test-secret"), expected);
      noSideEffects();
    });
    await run("SePay: canonical order skips unset/empty/zero optional fields and excludes signature/lang/custom_data", async () => {
      assert.equal(typeof sepayHelpers.signSepayFields, "function");
      const fields = Object.fromEntries(Object.entries(signatureVector).reverse());
      Object.assign(fields, { customer_id: "", payment_method: "0", signature: "not-signed", lang: "en", custom_data: "not-signed", injected: "not-signed" });
      assert.equal(sepayHelpers.signSepayFields(fields, "test-secret"), "sPuni275jvyyTCUqcd9dp5ojd+q1uFcGtmnUumjlh9A=");
      fields.customer_id = undefined;
      fields.payment_method = undefined;
      assert.equal(sepayHelpers.signSepayFields(fields, "test-secret"), "sPuni275jvyyTCUqcd9dp5ojd+q1uFcGtmnUumjlh9A=");
      fields.customer_id = "offline-customer";
      fields.payment_method = "BANK_TRANSFER";
      assert.equal(sepayHelpers.signSepayFields(fields, "test-secret"), referenceSignature(fields, "test-secret"));
      noSideEffects();
    });
    await run("SePay: blank signing secrets and non-string signed fields fail without exposing input", async () => {
      assert.equal(typeof sepayHelpers.signSepayFields, "function");
      for (const secret of [undefined, null, "", " \t\n "]) {
        assert.throws(() => sepayHelpers.signSepayFields(signatureVector, secret), /Checkout signing configuration unavailable\./);
      }
      for (const value of [null, 0, {}, []]) {
        assert.throws(() => sepayHelpers.signSepayFields({ ...signatureVector, order_amount: value }, "test-secret"), /Invalid checkout fields\./);
      }
      noSideEffects();
    });
    const builderOptions = {
      merchantId: "test-merchant", secretKey: "test-secret", unitAmount: 69_000,
      description: "Starter + thử nghiệm & renewal", orderId: "INV-test-001", returnOrigin: "https://checkout.example.test",
    };
    await run("SePay: pure field builder emits only canonical signed values followed by language and signature", async () => {
      assert.equal(typeof sepayHelpers.buildSepayCheckout, "function");
      const before = structuredClone(builderOptions);
      const result = sepayHelpers.buildSepayCheckout(builderOptions);
      assert.equal(result.url, sepayCheckoutUrl);
      assert.equal(result.method, "POST");
      assert.equal(result.provider, "sepay");
      assert.equal(result.success, true);
      assert.equal(result.orderId, "INV-test-001");
      assert.deepEqual(Object.keys(result.fields), emittedSepayFields);
      assert.equal(result.fields.order_amount, "69000");
      assert.equal(result.fields.operation, "PURCHASE");
      assert.equal(result.fields.currency, "VND");
      assert.equal(result.fields.signature, referenceSignature(result.fields, "test-secret"));
      assert.deepEqual(builderOptions, before);
      noSideEffects();
    });
    for (const [label, options] of [
      ["missing merchant", { merchantId: undefined }], ["blank merchant", { merchantId: " \t " }],
      ["missing secret", { secretKey: undefined }], ["blank secret", { secretKey: " \t " }],
      ["zero VND", { unitAmount: 0 }], ["negative VND", { unitAmount: -1 }],
      ["fractional VND", { unitAmount: 69_000.5 }], ["non-number VND", { unitAmount: "69000" }],
      ["unsafe VND", { unitAmount: Number.MAX_SAFE_INTEGER + 1 }], ["over-ceiling VND", { unitAmount: 1_000_000_000_000 }],
      ["blank invoice", { orderId: " " }], ["invoice controls", { orderId: "INV-one\n" }],
      ["blank description", { description: " " }],
      ["relative return origin", { returnOrigin: "/pricing" }], ["insecure return origin", { returnOrigin: "http://example.test" }],
      ["credential-bearing return origin", { returnOrigin: "https://user:pass@example.test" }],
      ["query-bearing return origin", { returnOrigin: "https://example.test?attacker=1" }],
      ["fragment-bearing return origin", { returnOrigin: "https://example.test#attacker" }],
    ]) {
      await run(`SePay: ${label} cannot produce a partial signed checkout`, async () => {
        assert.equal(typeof sepayHelpers.buildSepayCheckout, "function");
        assert.throws(() => sepayHelpers.buildSepayCheckout({ ...builderOptions, ...options }));
        noSideEffects();
      });
    }
    await run("checkout: production source reads only named request-local SePay settings and never calls a payment provider", async () => {
      const source = await readFile(resolve(apiSourceRoot, "src/pages/api/checkout.ts"), "utf8");
      assert.match(source, /process\.env\.SEPAY_MERCHANT_ID\s*\?\?\s*import\.meta\.env\.SEPAY_MERCHANT_ID/);
      assert.match(source, /process\.env\.SEPAY_API_KEY\s*\?\?\s*import\.meta\.env\.SEPAY_API_KEY/);
      assert.doesNotMatch(source, /createStripeClient|checkoutPlan|\.checkout\.sessions|\bfetch\s*\(|\bSTRIPE_SECRET_KEY\b|\bPAYPAL_/);
      const helperSource = await readFile(resolve(apiSourceRoot, "src/lib/server/sepay.ts"), "utf8");
      assert.doesNotMatch(helperSource, /\bfetch\s*\(|process\.env|import\.meta\.env|console\./);
      noSideEffects();
    });
    await run("checkout: partial runtime SePay overrides refresh independently without changing emitted/signing values", async () => {
      delete state.env.GHL_API_KEY;
      for (const runtimeEnv of [
        { SEPAY_MERCHANT_ID: runtimeFixtureEnv.SEPAY_MERCHANT_ID },
        { SEPAY_API_KEY: runtimeFixtureEnv.SEPAY_API_KEY },
        { SEPAY_MERCHANT_ID: undefined, SEPAY_API_KEY: undefined },
      ]) {
        state.runtimeEnv = runtimeEnv;
        await responseBody(await invoke("checkout", jsonRequest("checkout", checkout)), 200, sepayResponse);
      }
      noSideEffects();
    });

    function eventFixture(
      paymentStatus = "paid",
      type = "checkout.session.completed",
    ) {
      return {
        id: "evt_local_fixture",
        object: "event",
        api_version: "2026-03-25.dahlia",
        type,
        data: {
          object: {
            id: "cs_test_local_fixture",
            object: "checkout.session",
            payment_status: paymentStatus,
            amount_total: 4_900,
            customer_details: { email: "paid@example.test" },
            customer_email: null,
          },
        },
      };
    }
    function signedRequest(event, secret = fixtureEnv.STRIPE_WEBHOOK_SECRET) {
      const body = JSON.stringify(event, null, 2);
      const request = rawRequest("webhooks/stripe", body);
      request.headers.set(
        "stripe-signature",
        offlineStripe.webhooks.generateTestHeaderString({
          payload: body,
          secret,
        }),
      );
      return { request, body };
    }
    await run("webhook: missing signature cannot update GHL", async () => {
      await responseBody(
        await invoke(
          "webhooks/stripe",
          jsonRequest("webhooks/stripe", eventFixture()),
        ),
        400,
      );
      noSideEffects();
    });
    await run(
      "webhook: invalid signature is generic and cannot update GHL",
      async () => {
        const request = jsonRequest("webhooks/stripe", eventFixture());
        request.headers.set("stripe-signature", privateMarker);
        await responseBody(await invoke("webhooks/stripe", request), 400);
        noSideEffects();
      },
    );
    await run("webhook: altered signed body fails verification", async () => {
      const { request, body } = signedRequest(eventFixture());
      const altered = rawRequest("webhooks/stripe", `${body} `);
      altered.headers.set(
        "stripe-signature",
        request.headers.get("stripe-signature"),
      );
      await responseBody(await invoke("webhooks/stripe", altered), 400);
      noSideEffects();
    });
    await run("webhook: malformed signed JSON is handled safely", async () => {
      const request = rawRequest("webhooks/stripe", "{");
      request.headers.set(
        "stripe-signature",
        offlineStripe.webhooks.generateTestHeaderString({
          payload: "{",
          secret: fixtureEnv.STRIPE_WEBHOOK_SECRET,
        }),
      );
      await responseBody(await invoke("webhooks/stripe", request), 400);
      noSideEffects();
    });
    for (const paymentStatus of ["unpaid", "no_payment_required"]) {
      await run(
        `webhook: ${paymentStatus} completed session is not tagged paid`,
        async () => {
          const { request } = signedRequest(eventFixture(paymentStatus));
          const response = await invoke("webhooks/stripe", request);
          noSideEffects();
          await responseBody(response, 200, { received: true });
        },
      );
    }
    for (const type of [
      "checkout.session.completed",
      "checkout.session.async_payment_succeeded",
    ]) {
      await run(
        `webhook: paid ${type} verifies raw body and updates GHL`,
        async () => {
          const { request, body } = signedRequest(eventFixture("paid", type));
          await responseBody(await invoke("webhooks/stripe", request), 200, {
            received: true,
          });
          assert.equal(state.signatureBodies[0], body);
          assert.equal(
            state.constructors[0].options.apiVersion,
            "2026-03-25.dahlia",
          );
          assert.equal(state.fetchCalls.length, 2);
          contactDelivery(
            {
              locationId: fixtureEnv.GHL_LOCATION_ID,
              email: "paid@example.test",
              customFields: [{ key: "price", field_value: "$49" }],
            },
            ["paid-customer"],
          );
        },
      );
    }
    await run("webhook: falls back to customer_email", async () => {
      const event = eventFixture();
      event.data.object.customer_details = null;
      event.data.object.customer_email = "paid@example.test";
      await responseBody(
        await invoke("webhooks/stripe", signedRequest(event).request),
        200,
      );
      assert.equal(state.fetchCalls[0].payload.email, "paid@example.test");
    });
    await run(
      "webhook: unrelated event is acknowledged without side effects",
      async () => {
        await responseBody(
          await invoke(
            "webhooks/stripe",
            signedRequest(eventFixture("paid", "checkout.session.expired"))
              .request,
          ),
          200,
          { received: true },
        );
        noSideEffects();
      },
    );
    for (const status of [401, 422, 503]) {
      await run(`webhook: upstream ${status} remains retryable`, async () => {
        state.fetchImpl = async () =>
          Response.json(
            { message: `${privateMarker} paid@example.test` },
            { status },
          );
        await responseBody(
          await invoke(
            "webhooks/stripe",
            signedRequest(eventFixture()).request,
          ),
          502,
        );
      });
    }
    for (const label of ["network failure", "timeout", "invalid response"]) {
      await run(`webhook: ${label} remains retryable`, async () => {
        state.abortGhl = label === "timeout";
        state.fetchImpl = async () => {
          if (label === "invalid response")
            return Response.json({ contact: {} });
          throw new Error(`${privateMarker} paid@example.test`);
        };
        await responseBody(
          await invoke(
            "webhooks/stripe",
            signedRequest(eventFixture()).request,
          ),
          502,
        );
      });
    }
    await run(
      "webhook: failed delivery can succeed on same-event retry",
      async () => {
        const successfulFetch = state.fetchImpl;
        state.fetchImpl = async () =>
          new Response(privateMarker, { status: 503 });
        await responseBody(
          await invoke(
            "webhooks/stripe",
            signedRequest(eventFixture()).request,
          ),
          502,
        );
        state.fetchImpl = successfulFetch;
        await responseBody(
          await invoke(
            "webhooks/stripe",
            signedRequest(eventFixture()).request,
          ),
          200,
          { received: true },
        );
        assert.equal(state.fetchCalls.length, 3);
        preservedTags("paid-customer");
      },
    );
    for (const amount of [-1, 2.5, "4900", {}]) {
      await run(
        `webhook: invalid signed amount ${JSON.stringify(amount)}`,
        async () => {
          const event = eventFixture();
          event.data.object.amount_total = amount;
          await responseBody(
            await invoke("webhooks/stripe", signedRequest(event).request),
            500,
          );
          noSideEffects();
        },
      );
    }
    await run("webhook: constructor failure is generic", async () => {
      state.constructorError = new Error(privateMarker);
      await responseBody(
        await invoke("webhooks/stripe", signedRequest(eventFixture()).request),
        500,
      );
      noSideEffects();
    });
    await run("webhook: missing Stripe configuration is safe", async () => {
      delete state.env.STRIPE_WEBHOOK_SECRET;
      await responseBody(
        await invoke("webhooks/stripe", signedRequest(eventFixture()).request),
        500,
      );
      noSideEffects();
    });
    await run(
      "webhook: unconfigured optional GHL integration remains a no-op",
      async () => {
        delete state.env.GHL_API_KEY;
        await responseBody(
          await invoke(
            "webhooks/stripe",
            signedRequest(eventFixture()).request,
          ),
          200,
          { received: true },
        );
        noSideEffects();
      },
    );

    const flowTags = {
      contact: ["website-contact-form"],
      lead: ["website-lead-generation"],
      checkout: ["checkout-initiated", "Starter"],
      "webhooks/stripe": ["paid-customer"],
    };
    function flowRequest(route, secret = fixtureEnv.STRIPE_WEBHOOK_SECRET) {
      if (route === "webhooks/stripe") {
        const event = eventFixture();
        event.data.object.customer_details.email = "ada@example.test";
        return signedRequest(event, secret).request;
      }
      return jsonRequest(
        route,
        route === "checkout"
          ? checkout
          : { ...person, ...(route === "contact" ? { message: "Hi" } : {}) },
      );
    }
    const flowSuccess = (route) =>
      route === "webhooks/stripe"
        ? { received: true }
        : route === "checkout"
          ? sepayResponse
          : { success: true };

    for (const route of Object.keys(flowTags)) {
      await run(
        `${route}: runtime settings override build fallback and refresh per request`,
        async () => {
          for (const runtimeEnv of [
            runtimeFixtureEnv,
            { GHL_API_KEY: runtimeFixtureEnv.GHL_API_KEY },
            {},
          ]) {
            state.runtimeEnv = { ...runtimeEnv };
            const expectedEnv = { ...fixtureEnv, ...runtimeEnv };
            const offset = state.fetchCalls.length;
            await responseBody(
              await invoke(
                route,
                flowRequest(route, expectedEnv.STRIPE_WEBHOOK_SECRET),
              ),
              200,
              flowSuccess(route),
            );
            assert.ok(
              state.fetchCalls.length > offset,
              "Expected GHL delivery.",
            );
            assert.equal(
              state.fetchCalls[offset].payload.locationId,
              expectedEnv.GHL_LOCATION_ID,
            );
            if (route === "webhooks/stripe") {
              assert.equal(
                state.constructors.at(-1).key,
                expectedEnv.STRIPE_SECRET_KEY,
              );
            }
            preservedTags(...flowTags[route]);
          }
        },
      );
      const requiredSettings =
        route === "checkout"
          ? ["SEPAY_MERCHANT_ID", "SEPAY_API_KEY"]
          : route === "webhooks/stripe"
            ? ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"]
            : ["GHL_API_KEY", "GHL_LOCATION_ID"];
      for (const key of requiredSettings) {
        await run(
          `${route}: empty runtime ${key} cannot revive build configuration`,
          async () => {
            state.runtimeEnv[key] = "";
            await responseBody(await invoke(route, flowRequest(route)), route === "checkout" ? 409 : 500, route === "checkout" ? unavailableResponse("vi") : undefined);
            noSideEffects();
            assert.equal(state.constructors.length, 0);
          },
        );
      }
      if (route === "checkout" || route === "webhooks/stripe") {
        for (const key of ["GHL_API_KEY", "GHL_LOCATION_ID"]) {
          await run(
            `${route}: empty optional runtime ${key} disables GHL tracking`,
            async () => {
              state.runtimeEnv[key] = "";
              await responseBody(
                await invoke(route, flowRequest(route)),
                200,
                flowSuccess(route),
              );
              assert.equal(state.fetchCalls.length, 0);
              assert.equal(state.stripeCalls.length, 0);
            },
          );
        }
      }
    }
    await run(
      "webhook: runtime signing secret rejects a signature made with build fallback",
      async () => {
        state.runtimeEnv = { ...runtimeFixtureEnv };
        await responseBody(
          await invoke(
            "webhooks/stripe",
            signedRequest(eventFixture()).request,
          ),
          400,
        );
        noSideEffects();
        assert.equal(
          state.constructors[0].key,
          runtimeFixtureEnv.STRIPE_SECRET_KEY,
        );
      },
    );

    for (const route of Object.keys(flowTags)) {
      for (const failure of [401, 422, 503, "network failure", "timeout"]) {
        await run(
          `${route}: tag ${failure} honors delivery policy and retries`,
          async () => {
            const successfulFetch = state.fetchImpl;
            state.fetchImpl = async (url, options) => {
              if (url.endsWith("/contacts/upsert")) {
                const response = await successfulFetch(url, options);
                state.abortGhl = failure === "timeout";
                return response;
              }
              if (url.endsWith("/tags")) {
                if (typeof failure !== "number") throw new Error(privateMarker);
                return new Response(privateMarker, { status: failure });
              }
              return successfulFetch(url, options);
            };
            await responseBody(
              await invoke(route, flowRequest(route)),
              route === "checkout" ? 200 : 502,
              route === "checkout" ? flowSuccess(route) : undefined,
            );
            assert.equal(state.fetchCalls.length, 2);
            assert.equal(
              Object.hasOwn(state.fetchCalls[0].payload, "tags"),
              false,
            );
            assert.deepEqual(state.fetchCalls[1].payload, {
              tags: flowTags[route],
            });
            assert.equal(state.stripeCalls.length, 0);
            preservedTags();

            state.abortGhl = false;
            state.fetchImpl = successfulFetch;
            for (let retry = 1; retry <= 2; retry++) {
              await responseBody(
                await invoke(route, flowRequest(route)),
                200,
                flowSuccess(route),
              );
              preservedTags(...flowTags[route]);
              assert.equal(
                state.fetchCalls.length,
                2 + retry * (route === "contact" ? 3 : 2),
              );
              assert.equal(state.stripeCalls.length, 0);
            }
          },
        );
      }
      if (route !== "contact") {
        await run(
          `${route}: encodes upstream contact ID in tag URL`,
          async () => {
            state.contactId = " id/segment?query#fragment% é ";
            await responseBody(
              await invoke(route, flowRequest(route)),
              200,
              flowSuccess(route),
            );
            assert.equal(state.fetchCalls.length, 2);
            assert.equal(
              state.fetchCalls[1].url,
              "https://services.leadconnectorhq.com/contacts/id%2Fsegment%3Fquery%23fragment%25%20%C3%A9/tags",
            );
            preservedTags(...flowTags[route]);
          },
        );
      }
    }

    for (const status of [200, 201, 204]) {
      await run(
        `GHL: disposes ${status} tag response without parsing JSON`,
        async () => {
          const successfulFetch = state.fetchImpl;
          state.fetchImpl = async (url, options) =>
            url.endsWith("/tags")
              ? new Response(status === 204 ? null : privateMarker, { status })
              : successfulFetch(url, options);
          await responseBody(
            await invoke("lead", jsonRequest("lead", person)),
            200,
            { success: true },
          );
          assert.equal(state.fetchCalls.length, 2);
          const tagResponse = state.fetchResponses.find(({ url }) =>
            url.endsWith("/tags"),
          ).response;
          assert.ok(tagResponse.body === null || tagResponse.bodyUsed);
          assert.deepEqual(state.logs, []);
        },
      );
    }

    await run(
      "GHL: seeded tags survive all flows and repeated paid-event delivery",
      async () => {
        const expectedTags = [];
        for (const [route, tags] of Object.entries(flowTags)) {
          const offset = state.fetchCalls.length;
          await responseBody(
            await invoke(route, flowRequest(route)),
            200,
            flowSuccess(route),
          );
          assert.equal(
            Object.hasOwn(state.fetchCalls[offset].payload, "tags"),
            false,
          );
          assert.deepEqual(state.fetchCalls[offset + 1].payload, { tags });
          expectedTags.push(...tags);
          preservedTags(...expectedTags);
        }
        for (let retry = 0; retry < 3; retry++) {
          await responseBody(
            await invoke("webhooks/stripe", flowRequest("webhooks/stripe")),
            200,
            { received: true },
          );
          preservedTags(...expectedTags);
        }
      },
    );
    await run(
      "GHL: concurrent contact/lead additions preserve seeded tags",
      async () => {
        const responses = await Promise.all(
          ["contact", "lead"].map((route) => invoke(route, flowRequest(route))),
        );
        for (const response of responses) {
          await responseBody(response, 200, { success: true });
        }
        preservedTags(...flowTags.contact, ...flowTags.lead);
        const upserts = state.fetchCalls.filter(({ url }) =>
          url.endsWith("/contacts/upsert"),
        );
        assert.equal(upserts.length, 2);
        assert.ok(
          upserts.every(({ payload }) => !Object.hasOwn(payload, "tags")),
        );
      },
    );

    // Provider-independent foundation coverage retains pricing/currency authority.
    await run(
      "currency: frozen public exports have no framework or service dependency",
      async () => {
        assert.deepEqual(Object.keys(currency).sort(), [
          "VND_PER_USD",
          "currencyForLocale",
          "formatMinorAmount",
          "isLocale",
          "usdPriceToMinor",
          "vndPriceToMinor",
        ]);
        const source = await readFile(
          resolve(apiSourceRoot, "src/lib/currency.ts"),
          "utf8",
        );
        assert.doesNotMatch(
          source,
          /^\s*import\s|\b(?:fetch|XMLHttpRequest|process)\b|import\.meta/m,
        );
        assert.equal(currency.VND_PER_USD, 26_000);
        noSideEffects();
      },
    );

    await run("currency: strict locales switch currency together", async () => {
      assert.equal(typeof currency.isLocale, "function");
      assert.equal(currency.isLocale("en"), true);
      assert.equal(currency.isLocale("vi"), true);
      assert.equal(currency.currencyForLocale("en"), "usd");
      assert.equal(currency.currencyForLocale("vi"), "vnd");
      for (const value of [
        undefined,
        null,
        0,
        true,
        {},
        [],
        "",
        "EN",
        "VI",
        "en-US",
        "vi-VN",
        " vi",
        "vi ",
        "vnd",
      ]) {
        assert.equal(currency.isLocale(value), false);
        assert.throws(() => currency.currencyForLocale(value));
      }
      noSideEffects();
    });

    for (const row of priceMatrix) {
      for (const code of ["usd", "vnd"]) {
        await run(
          `currency: exact approved ${row.planId}/${row.interval}/${code}`,
          async () => {
            const content = code === "vnd" ? state.vndPricing : state.pricing;
            const plan = content.plans.find((plan) => plan.plan_id === row.planId);
            const price = row.interval === "year" ? plan.yearly_price : plan.price;
            assert.equal(price, code === "vnd" ? row.vndPrice : row.price);
            assert.equal(
              code === "vnd"
                ? currency.vndPriceToMinor(price)
                : currency.usdPriceToMinor(price, "usd"),
              row[code],
            );
            if (code === "vnd") {
              assert.notEqual(row.vnd, currency.usdPriceToMinor(row.price, "vnd"));
            }
            noSideEffects();
          },
        );
      }
    }
    await run(
      "currency: cents-first decimal conversion is exact and intentionally trims",
      async () => {
        assert.equal(typeof currency.usdPriceToMinor, "function");
        for (const [price, cents, dong] of [
          ["0.01", 1, 260],
          ["0.1", 10, 2_600],
          ["0.10", 10, 2_600],
          ["49.50", 4_950, 1_287_000],
          [" 49.01\t", 4_901, 1_274_260],
          ["\n1490.99 \n", 149_099, 38_765_740],
        ]) {
          assert.equal(currency.usdPriceToMinor(price, "usd"), cents);
          assert.equal(currency.usdPriceToMinor(price, "vnd"), dong);
        }
        noSideEffects();
      },
    );
    await run(
      "currency: legacy conversion retains its 12-digit ceiling",
      async () => {
        assert.equal(typeof currency.usdPriceToMinor, "function");
        assert.equal(currency.usdPriceToMinor("3990", "vnd"), 103_740_000);
        assert.equal(
          currency.usdPriceToMinor("9999999999.99", "usd"),
          999_999_999_999,
        );
        assert.equal(
          currency.usdPriceToMinor("38461538.46", "vnd"),
          999_999_999_960,
        );
        assert.throws(() => currency.usdPriceToMinor("10000000000", "usd"));
        assert.throws(() => currency.usdPriceToMinor("38461538.47", "vnd"));
        noSideEffects();
      },
    );
    await run(
      "currency: VND authority accepts only positive whole-dong strings within the payment ceiling",
      async () => {
        assert.equal(currency.vndPriceToMinor("69000"), 69_000);
        assert.equal(currency.vndPriceToMinor("690000"), 690_000);
        assert.equal(currency.vndPriceToMinor("1"), 1);
        assert.equal(currency.vndPriceToMinor("999999999999"), 999_999_999_999);
        for (const price of [
          "", " ", "0", "000", "-1", "+69000", "69.000", "69,000",
          "69000.0", "69000vnd", "69000 ", " 69000", "69000\n", "1e5",
          "0x10", "1000000000000", "9007199254740993", "9".repeat(200),
          undefined, null, 69000, 69000n, true, {}, [], new String("69000"),
        ]) {
          assert.throws(() => currency.vndPriceToMinor(price), /Invalid VND price/);
        }
        noSideEffects();
      },
    );
    await run(
      "currency: malformed, nonpositive, non-string, and unsafe amounts fail closed",
      async () => {
        assert.equal(typeof currency.usdPriceToMinor, "function");
        for (const price of [
          "",
          " ",
          "0",
          "0.00",
          "-0",
          "-1",
          "+49",
          "049",
          "00.01",
          ".49",
          "49.",
          "49.999",
          "49usd",
          "49 00",
          "4,900",
          "1e2",
          "Infinity",
          "NaN",
          "0x31",
          "49\u0000",
          "90071992547409.92",
          "34643074056696.13",
          "9".repeat(200),
          undefined,
          null,
          49,
          49n,
          true,
          {},
          [],
          new String("49"),
        ]) {
          for (const code of ["usd", "vnd"]) {
            assert.throws(() => currency.usdPriceToMinor(price, code));
          }
        }
        for (const code of [undefined, null, "USD", "VND", "eur", "", {}, []]) {
          assert.throws(() => currency.usdPriceToMinor("49", code));
        }
        noSideEffects();
      },
    );
    await run(
      "currency: formats USD cents and zero-decimal VND in each locale",
      async () => {
        assert.equal(typeof currency.formatMinorAmount, "function");
        for (const [amount, code, locale, formatted] of [
          [4_900, "usd", "en", "$49"],
          [4_950, "usd", "en", "$49.50"],
          [1, "usd", "en", "$0.01"],
          [0, "usd", "en", "$0"],
          [149_000, "usd", "en", "$1,490"],
          [4_900, "usd", "vi", "49\u00a0US$"],
          [4_950, "usd", "vi", "49,50\u00a0US$"],
          [1_274_000, "vnd", "vi", "1.274.000\u00a0₫"],
          [1_274_000, "vnd", "en", "₫1,274,000"],
          [103_740_000, "vnd", "vi", "103.740.000\u00a0₫"],
          [0, "vnd", "vi", "0\u00a0₫"],
          [-0, "vnd", "en", "₫0"],
        ]) {
          assert.equal(
            currency.formatMinorAmount(amount, code, locale),
            formatted,
          );
        }
        noSideEffects();
      },
    );
    await run(
      "currency: safe-integer formatting preserves large cents without imposing a payment ceiling",
      async () => {
        assert.equal(typeof currency.formatMinorAmount, "function");
        assert.equal(
          currency.formatMinorAmount(Number.MAX_SAFE_INTEGER, "usd", "en"),
          "$90,071,992,547,409.91",
        );
        assert.equal(
          currency.formatMinorAmount(Number.MAX_SAFE_INTEGER, "vnd", "vi"),
          "9.007.199.254.740.991\u00a0₫",
        );
        for (const amount of [
          -1,
          0.5,
          Number.MAX_SAFE_INTEGER + 1,
          Infinity,
          -Infinity,
          NaN,
          "4900",
          null,
          undefined,
          {},
        ]) {
          assert.throws(() => currency.formatMinorAmount(amount, "usd", "en"));
          assert.throws(() => currency.formatMinorAmount(amount, "vnd", "vi"));
        }
        for (const code of ["USD", "VND", "eur", null, undefined, {}]) {
          assert.throws(() => currency.formatMinorAmount(0, code, "en"));
        }
        for (const locale of ["VI", "fr", "vi-VN", null, undefined, {}]) {
          assert.throws(() => currency.formatMinorAmount(0, "vnd", locale));
        }
        noSideEffects();
      },
    );

    await run(
      "pricing: canonical English content retains immutable IDs and approved USD prices",
      async () => {
        assert.deepEqual(
          state.pricing.plans.map(
            ({ plan_id, title, price, yearly_price }) => ({
              plan_id,
              title,
              price,
              yearly_price,
            }),
          ),
          [
            {
              plan_id: "starter",
              title: "Starter",
              price: "2.69",
              yearly_price: "26.90",
            },
            {
              plan_id: "campus",
              title: "Campus",
              price: "3.09",
              yearly_price: "30.90",
            },
            {
              plan_id: "enterprise",
              title: "Enterprise",
              price: "3.89",
              yearly_price: "38.90",
            },
          ],
        );
        noSideEffects();
      },
    );
    for (const row of priceMatrix) {
      for (const code of ["usd", "vnd"]) {
        await run(
          `pricing: resolvePlan("${row.planId}","${row.interval}","${code}") = ${row[code]} from server content`,
          async () => {
            assert.equal(typeof pricingHelpers.resolvePlan, "function");
            assert.deepEqual(
              await pricingHelpers.resolvePlan(row.planId, row.interval, code),
              {
                planId: row.planId,
                title: row.title,
                interval: row.interval,
                currency: code,
                unitAmount: row[code],
              },
            );
            assert.deepEqual(state.entryCalls, [
              { collection: "pricing", id: code === "vnd" ? "vi/-index" : "-index" },
            ]);
            assert.equal(state.constructors.length, 0);
            noSideEffects();
          },
        );
      }
      await run(
        `pricing: legacy ${row.title}/${row.interval} keeps its USD-only return contract`,
        async () => {
          assert.deepEqual(
            await pricingHelpers.checkoutPlan(row.title, row.interval),
            {
              title: row.title,
              interval: row.interval,
              unitAmount: row.usd,
            },
          );
          assert.deepEqual(state.entryCalls, [
            { collection: "pricing", id: "-index" },
          ]);
          noSideEffects();
        },
      );
    }
    await run(
      "pricing: IDs ignore order, client/localized titles, and client price arguments",
      async () => {
        assert.equal(typeof pricingHelpers.resolvePlan, "function");
        state.vndPricing.plans.reverse();
        assert.deepEqual(
          await pricingHelpers.resolvePlan("enterprise", "year", "vnd", {
            planTitle: "Starter",
            localizedTitle: "Gói khởi đầu",
            price: "0.01",
            amount: 1,
            unitAmount: 1,
            currency: "usd",
            provider: "stripe",
          }),
          {
            planId: "enterprise",
            title: "Enterprise",
            interval: "year",
            currency: "vnd",
            unitAmount: 990_000,
          },
        );
        assert.deepEqual(state.entryCalls, [
          { collection: "pricing", id: "vi/-index" },
        ]);
        noSideEffects();
      },
    );
    await run(
      "pricing: unsupported IDs, intervals, and currencies fail before loading configuration",
      async () => {
        assert.equal(typeof pricingHelpers.isPlanId, "function");
        assert.equal(pricingHelpers.isPlanId("starter"), true);
        assert.equal(pricingHelpers.isPlanId("campus"), true);
        assert.equal(pricingHelpers.isPlanId("enterprise"), true);
        for (const id of [
          "Starter",
          "ENTERPRISE",
          "Gói khởi đầu",
          "starter ",
          "",
          "__proto__",
          "constructor",
          null,
          undefined,
          1,
          {},
          [],
        ]) {
          assert.equal(pricingHelpers.isPlanId(id), false);
          await assert.rejects(
            () => pricingHelpers.resolvePlan(id, "month", "usd"),
            (error) =>
              error.name === "InputError" &&
              error.status === 400 &&
              error.code === "unknown_plan",
          );
        }
        for (const interval of [
          "yearly",
          "week",
          " month",
          "",
          null,
          undefined,
          12,
          {},
        ]) {
          await assert.rejects(
            () => pricingHelpers.resolvePlan("starter", interval, "usd"),
            (error) =>
              error.name === "InputError" &&
              error.status === 400 &&
              error.code === "invalid_interval",
          );
        }
        for (const code of ["USD", "VND", "eur", "", null, undefined, {}]) {
          await assert.rejects(
            () => pricingHelpers.resolvePlan("starter", "month", code),
            (error) =>
              error.name === "InputError" &&
              error.status === 400 &&
              error.code === "invalid_currency",
          );
        }
        assert.equal(state.entryCalls.length, 0);
        noSideEffects();
      },
    );
    await run(
      "pricing: each currency recomputes its server content without cross-currency fallback",
      async () => {
        state.pricing.plans[0].price = "2.70";
        state.vndPricing.plans[0].price = "69001";
        assert.equal((await pricingHelpers.resolvePlan("starter", "month", "usd")).unitAmount, 270);
        assert.equal((await pricingHelpers.resolvePlan("starter", "month", "vnd")).unitAmount, 69_001);
        state.pricing = undefined;
        state.vndPricing.plans[0].price = "69002";
        assert.equal((await pricingHelpers.resolvePlan("starter", "month", "vnd")).unitAmount, 69_002);
        state.pricing = structuredClone(pricing);
        state.vndPricing = undefined;
        assert.equal((await pricingHelpers.resolvePlan("starter", "month", "usd")).unitAmount, 269);
        noSideEffects();
      },
    );
    for (const code of ["usd", "vnd"]) {
      const source = code === "vnd" ? "vndPricing" : "pricing";
      for (const [label, mutate] of [
        [
          "missing entry",
          () => {
            state[source] = undefined;
          },
        ],
        [
          "non-array plans",
          () => {
            state[source].plans = {};
          },
        ],
        [
          "missing ID",
          () => {
            delete state[source].plans[0].plan_id;
          },
        ],
        [
          "duplicate IDs with different titles",
          () => {
            state[source].plans[1].plan_id = "starter";
          },
        ],
        [
          "blank configured title",
          () => {
            state[source].plans[0].title = " ";
          },
        ],
        [
          "non-string configured title",
          () => {
            state[source].plans[0].title = 49;
          },
        ],
      ]) {
        await run(
          `pricing: ${code} ${label} fails closed without integrations`,
          async () => {
            assert.equal(typeof pricingHelpers.resolvePlan, "function");
            mutate();
            await assert.rejects(
              () => pricingHelpers.resolvePlan("starter", "month", code),
              (error) => error instanceof Error && error.name !== "InputError",
            );
            assert.equal(state.entryCalls.length, 1);
            noSideEffects();
          },
        );
      }
      const badPrices = code === "vnd" ? [
        "69000vnd", "69000.0", "69.000", "69,000", "0", "-1",
        "69000 ", " 69000", "69000\n", "1e5", "0x10", "1000000000000",
        "9007199254740993", "9".repeat(20), 69000, null, undefined, {},
      ] : [
        "49usd", "049", "0", "-1", "49.999", "10000000000",
        "9".repeat(20), 49, null, undefined, {},
      ];
      for (const badPrice of badPrices) {
        await run(
          `pricing: invalid ${code} content amount ${JSON.stringify(badPrice)} is configuration failure`,
          async () => {
            assert.equal(typeof pricingHelpers.resolvePlan, "function");
            state[source].plans[0].price = badPrice;
            state[source].plans[0].yearly_price = badPrice;
            for (const interval of ["month", "year"]) {
              await assert.rejects(
                () => pricingHelpers.resolvePlan("starter", interval, code),
                /Invalid pricing configuration\./,
              );
            }
            noSideEffects();
          },
        );
      }
    }

    async function invokeGeo(headers = {}, query = "") {
      assert.equal(typeof localeRoute.GET, "function");
      const request = new Request(
        `https://vlabs.example.test/api/locale${query}`,
        { headers },
      );
      return localeRoute.GET({ request, url: new URL(request.url) });
    }
    async function geoBody(response, expected) {
      assert.equal(response.status, 200);
      assert.equal(
        response.headers.get("content-type"),
        "application/json; charset=utf-8",
      );
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      assert.equal(
        response.headers.get("vary"),
        "CF-IPCountry, X-Vercel-IP-Country",
      );
      assert.deepEqual([...response.headers.keys()].sort(), [
        "cache-control",
        "content-type",
        "vary",
      ]);
      const body = await response.json();
      assert.deepEqual(Object.keys(body).sort(), ["currency", "locale"]);
      assert.deepEqual(body, expected);
      assert.deepEqual(state.logs, []);
      assert.equal(state.entryCalls.length, 0);
      assert.equal(state.constructors.length, 0);
      noSideEffects();
      return body;
    }
    await run(
      "locale: GET-only server route needs no environment or external service",
      async () => {
        state.env = {};
        assert.equal(localeRoute.prerender, false);
        assert.equal(typeof localeRoute.GET, "function");
        assert.equal(localeRoute.POST, undefined);
        assert.equal(localeRoute.ALL, undefined);
        await geoBody(await invokeGeo(), { locale: "en", currency: "usd" });
      },
    );
    for (const [country, expectedLocale] of [
      [undefined, "en"],
      ["", "en"],
      ["VN", "vi"],
      ["vn", "vi"],
      ["vN", "vi"],
      [" VN ", "vi"],
      ["\t vn \t", "vi"],
      ["US", "en"],
      ["JP", "en"],
      ["ZZ", "en"],
      ["VN,US", "en"],
      ["VN,VN", "en"],
      ["VN, VN", "en"],
      ["VNM", "en"],
      ["V", "en"],
      ["V1", "en"],
      ["1V", "en"],
      ["V N", "en"],
      ["V-N", "en"],
      ["_VN", "en"],
      ["VN_", "en"],
      ["VÑ", "en"],
      ["Vietnam", "en"],
      ["VN;", "en"],
    ]) {
      await run(
        `locale: country ${JSON.stringify(country)} deliberately normalizes case/outer whitespace only`,
        async () => {
          state.env = {};
          await geoBody(
            await invokeGeo(
              country === undefined ? {} : { "x-vercel-ip-country": country },
            ),
            {
              locale: expectedLocale,
              currency: expectedLocale === "vi" ? "vnd" : "usd",
            },
          );
        },
      );
    }
    await run("locale: duplicate hosting headers fail closed", async () => {
      const headers = new Headers();
      headers.append("x-vercel-ip-country", "VN");
      headers.append("x-vercel-ip-country", "VN");
      await geoBody(await invokeGeo(headers), {
        locale: "en",
        currency: "usd",
      });
    });
    for (const [country, expectedLocale] of [
      ["VN", "vi"],
      ["vn", "vi"],
      [" \t vN \t", "vi"],
      ["US", "en"],
      ["XX", "en"],
      ["T1", "en"],
      ["", "en"],
      ["VN,US", "en"],
      ["VN,VN", "en"],
      ["VNM", "en"],
      ["VÑ", "en"],
      ["V1", "en"],
      ["VN;", "en"],
    ]) {
      await run(
        `locale: Cloudflare ${JSON.stringify(country)} wins over conflicting legacy country`,
        async () => {
          await geoBody(
            await invokeGeo({
              "cf-ipcountry": country,
              "x-vercel-ip-country": expectedLocale === "vi" ? "US" : "VN",
            }),
            {
              locale: expectedLocale,
              currency: expectedLocale === "vi" ? "vnd" : "usd",
            },
          );
        },
      );
    }
    await run(
      "locale: duplicate Cloudflare country headers do not revive legacy hints",
      async () => {
        const headers = new Headers({ "x-vercel-ip-country": "VN" });
        headers.append("cf-ipcountry", "VN");
        headers.append("cf-ipcountry", "VN");
        await geoBody(await invokeGeo(headers), {
          locale: "en",
          currency: "usd",
        });
      },
    );
    await run(
      "locale: ignores browser language, client country/query/cookie hints, and raw IP",
      async () => {
        await geoBody(
          await invokeGeo(
            {
              "Accept-Language": "vi-VN,vi;q=0.9",
              "x-country": "VN",
              "x-vercel-ip-country-region": "VN",
              "x-forwarded-for": "198.51.100.23",
              Cookie: "vlabs-locale-v1=vi",
            },
            "?lang=vi&country=VN",
          ),
          { locale: "en", currency: "usd" },
        );
      },
    );
    await run(
      "locale: concurrent country responses stay request-local and private",
      async () => {
        const [vietnam, other, cloudflareVietnam, cloudflareOther] =
          await Promise.all([
            invokeGeo({ "x-vercel-ip-country": "VN" }),
            invokeGeo({ "x-vercel-ip-country": "US" }),
            invokeGeo({ "cf-ipcountry": "VN", "x-vercel-ip-country": "US" }),
            invokeGeo({ "cf-ipcountry": "US", "x-vercel-ip-country": "VN" }),
          ]);
        await geoBody(vietnam, { locale: "vi", currency: "vnd" });
        await geoBody(other, { locale: "en", currency: "usd" });
        await geoBody(cloudflareVietnam, { locale: "vi", currency: "vnd" });
        await geoBody(cloudflareOther, { locale: "en", currency: "usd" });
      },
    );

    function localizedFormRequest(route, fields, format = "JSON", query = "") {
      if (format === "JSON") {
        return rawRequest(`${route}${query}`, JSON.stringify(fields));
      }
      if (format === "urlencoded") {
        const form = new URLSearchParams();
        for (const [key, value] of Object.entries(fields)) {
          if (value !== undefined) form.append(key, String(value));
        }
        return rawRequest(
          `${route}${query}`,
          form.toString(),
          "application/x-www-form-urlencoded; charset=utf-8",
        );
      }
      const form = new FormData();
      for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined) form.append(key, value);
      }
      return new Request(`https://vlabs.example.test/api/${route}${query}`, {
        method: "POST",
        body: form,
      });
    }
    function localizedDelivery(route) {
      assert.equal(state.fetchCalls.length, 2);
      contactDelivery(
        {
          locationId: fixtureEnv.GHL_LOCATION_ID,
          firstName: "Ada",
          lastName: "Lovelace",
          email: "ada@example.test",
          ...(route === "contact" ? { phone: "" } : {}),
        },
        [
          route === "contact"
            ? "website-contact-form"
            : "website-lead-generation",
        ],
      );
      assert.equal(state.constructors.length, 0);
      assert.equal(state.entryCalls.length, 0);
    }
    const localizedFieldErrors = [
      [
        { name: undefined },
        "Name must be a string.",
        "Tên phải là chuỗi ký tự.",
      ],
      [{ name: "   " }, "Name is required.", "Tên là bắt buộc."],
      [{ name: 42 }, "Name must be a string.", "Tên phải là chuỗi ký tự."],
      [{ name: {} }, "Name must be a string.", "Tên phải là chuỗi ký tự."],
      [{ name: [] }, "Name must be a string.", "Tên phải là chuỗi ký tự."],
      [{ name: null }, "Name must be a string.", "Tên phải là chuỗi ký tự."],
      [{ name: true }, "Name must be a string.", "Tên phải là chuỗi ký tự."],
      [{ name: "n".repeat(201) }, "Name is too long.", "Tên quá dài."],
      [
        { name: "Ada\u0000Lovelace" },
        "Name contains unsupported characters.",
        "Tên chứa ký tự không được hỗ trợ.",
      ],
      [
        { email: undefined },
        "Email must be a string.",
        "Email phải là chuỗi ký tự.",
      ],
      [{ email: " \t " }, "Email is required.", "Email là bắt buộc."],
      [{ email: 42 }, "Email must be a string.", "Email phải là chuỗi ký tự."],
      [{ email: {} }, "Email must be a string.", "Email phải là chuỗi ký tự."],
      [{ email: [] }, "Email must be a string.", "Email phải là chuỗi ký tự."],
      [
        { email: null },
        "Email must be a string.",
        "Email phải là chuỗi ký tự.",
      ],
      [
        { email: `a@${"d".repeat(250)}.test` },
        "Email is too long.",
        "Email quá dài.",
      ],
      [
        { email: "ada\n@example.test" },
        "Email contains unsupported characters.",
        "Email chứa ký tự không được hỗ trợ.",
      ],
      [
        { email: "not-an-email" },
        "A valid email address is required.",
        "Vui lòng nhập địa chỉ email hợp lệ.",
      ],
      [
        { email: `${"e".repeat(65)}@example.test` },
        "A valid email address is required.",
        "Vui lòng nhập địa chỉ email hợp lệ.",
      ],
    ];

    for (const route of ["contact", "lead"]) {
      for (const format of ["JSON", "urlencoded", "multipart"]) {
        await run(
          `${route}: VI ${format} keeps person fields and GHL authority unchanged`,
          async () => {
            const request = localizedFormRequest(
              route,
              {
                ...person,
                locale: "vi",
                provider: "stripe",
                currency: "usd",
                price: "0.01",
                country: "US",
                tags: "paid-customer",
              },
              format,
              "?lang=vi",
            );
            await responseBody(await invoke(route, request), 200, {
              success: true,
            });
            localizedDelivery(route);
          },
        );
      }
      for (const locale of ["en", "vi"]) {
        await run(
          `${route}: ${locale} JSON errors retain exact field validation and response shape`,
          async () => {
            for (const [invalid, english, vietnamese] of localizedFieldErrors) {
              await responseBody(
                await invoke(
                  route,
                  jsonRequest(route, { ...person, ...invalid, locale }),
                ),
                400,
                {
                  success: false,
                  error: locale === "vi" ? vietnamese : english,
                },
              );
            }
            noSideEffects();
          },
        );
      }
      for (const format of ["urlencoded", "multipart"]) {
        await run(
          `${route}: VI ${format} localizes required, length, control, and email errors`,
          async () => {
            for (const [invalid, , vietnamese] of localizedFieldErrors.filter(
              ([fields]) =>
                Object.values(fields).every(
                  (value) => typeof value === "string" || value === undefined,
                ),
            )) {
              await responseBody(
                await invoke(
                  route,
                  localizedFormRequest(
                    route,
                    { ...person, ...invalid, locale: "vi" },
                    format,
                  ),
                ),
                400,
                {
                  success: false,
                  error: vietnamese,
                },
              );
            }
            noSideEffects();
          },
        );
        await run(
          `${route}: VI ${format} rejects invalid language before person validation/configuration`,
          async () => {
            delete state.env.GHL_API_KEY;
            for (const locale of ["", "VI", "vnd", " vi", "vi ", "en-US"]) {
              await responseBody(
                await invoke(
                  route,
                  localizedFormRequest(
                    route,
                    { ...person, name: "", locale },
                    format,
                    "?lang=vi",
                  ),
                ),
                400,
                {
                  success: false,
                  error:
                    "Ngôn ngữ phải là tiếng Anh (en) hoặc tiếng Việt (vi).",
                },
              );
            }
            noSideEffects();
          },
        );
      }
      await run(
        `${route}: invalid JSON locale never reaches upstream or leaks into GHL`,
        async () => {
          delete state.env.GHL_LOCATION_ID;
          for (const locale of [
            null,
            "",
            "VI",
            "EN",
            "vi-VN",
            "en-US",
            "vnd",
            " vi",
            "vi ",
            0,
            true,
            {},
            [],
          ]) {
            await responseBody(
              await invoke(
                route,
                jsonRequest(route, { ...person, name: "", locale }),
              ),
              400,
              {
                success: false,
                error: "Locale must be en or vi.",
              },
            );
          }
          noSideEffects();
        },
      );
      await run(
        `${route}: invalid JSON locale may use valid query language as its safe error hint`,
        async () => {
          await responseBody(
            await invoke(
              route,
              localizedFormRequest(
                route,
                { ...person, locale: "VI" },
                "JSON",
                "?lang=vi",
              ),
            ),
            400,
            {
              success: false,
              error: "Ngôn ngữ phải là tiếng Anh (en) hoặc tiếng Việt (vi).",
            },
          );
          noSideEffects();
        },
      );
      await run(
        `${route}: absent body locale stays legacy English after successful parsing`,
        async () => {
          await responseBody(
            await invoke(
              route,
              localizedFormRequest(
                route,
                { ...person, name: "" },
                "JSON",
                "?lang=vi",
              ),
            ),
            400,
            {
              success: false,
              error: "Name is required.",
            },
          );
          noSideEffects();
        },
      );
      await run(
        `${route}: validated body locale overrides query error language`,
        async () => {
          for (const [locale, query, error] of [
            ["en", "?lang=vi", "Name is required."],
            ["vi", "?lang=en", "Tên là bắt buộc."],
            ["vi", "?lang=fr", "Tên là bắt buộc."],
            ["vi", "?lang=en&lang=vi", "Tên là bắt buộc."],
          ]) {
            await responseBody(
              await invoke(
                route,
                localizedFormRequest(
                  route,
                  { ...person, name: "", locale },
                  "JSON",
                  query,
                ),
              ),
              400,
              {
                success: false,
                error,
              },
            );
          }
          noSideEffects();
        },
      );

      for (const [label, body, type, status, error] of [
        [
          "malformed JSON",
          "{",
          "application/json",
          400,
          "Nội dung JSON không hợp lệ.",
        ],
        [
          "empty JSON",
          "",
          "application/json",
          400,
          "Nội dung JSON không hợp lệ.",
        ],
        [
          "invalid UTF-8 JSON",
          new Uint8Array([0xff, 0xfe]),
          "application/json",
          400,
          "Nội dung JSON không hợp lệ.",
        ],
        [
          "JSON null",
          "null",
          "application/json",
          400,
          "Nội dung yêu cầu phải là một đối tượng.",
        ],
        [
          "JSON array",
          "[]",
          "application/json",
          400,
          "Nội dung yêu cầu phải là một đối tượng.",
        ],
        [
          "JSON scalar",
          '"text"',
          "application/json",
          400,
          "Nội dung yêu cầu phải là một đối tượng.",
        ],
        [
          "malformed multipart",
          "broken",
          "multipart/form-data",
          400,
          "Nội dung biểu mẫu không hợp lệ.",
        ],
        [
          "duplicate name",
          "name=Ada&name=Other&email=ada%40example.test&locale=vi",
          "application/x-www-form-urlencoded",
          400,
          "Các trường biểu mẫu không được lặp lại.",
        ],
        [
          "duplicate locale",
          "name=Ada&email=ada%40example.test&locale=vi&locale=vi",
          "application/x-www-form-urlencoded",
          400,
          "Các trường biểu mẫu không được lặp lại.",
        ],
        [
          "missing content type",
          "{}",
          null,
          415,
          "Loại nội dung không được hỗ trợ.",
        ],
        [
          "unsupported content type",
          "{}",
          "text/plain",
          415,
          "Loại nội dung không được hỗ trợ.",
        ],
        [
          "actual oversized body",
          JSON.stringify({
            ...person,
            locale: "vi",
            unused: "x".repeat(32 * 1024),
          }),
          "application/json",
          413,
          "Nội dung yêu cầu quá lớn.",
        ],
      ]) {
        await run(
          `${route}: query VI localizes ${label} before body locale is available`,
          async () => {
            await responseBody(
              await invoke(route, rawRequest(`${route}?lang=vi`, body, type)),
              status,
              { success: false, error },
            );
            noSideEffects();
          },
        );
      }
      await run(
        `${route}: query VI localizes declared oversized body`,
        async () => {
          const request = localizedFormRequest(
            route,
            { ...person, locale: "vi" },
            "JSON",
            "?lang=vi",
          );
          request.headers.set("content-length", String(32 * 1024 + 1));
          await responseBody(await invoke(route, request), 413, {
            success: false,
            error: "Nội dung yêu cầu quá lớn.",
          });
          noSideEffects();
        },
      );
      await run(
        `${route}: invalid/ambiguous query hints preserve English parse errors`,
        async () => {
          for (const query of [
            "",
            "?lang=",
            "?lang=VI",
            "?lang=vnd",
            "?lang=fr",
            "?lang=%20vi",
            "?lang=vi&lang=en",
            "?lang=vi&lang=vi",
          ]) {
            await responseBody(
              await invoke(route, rawRequest(`${route}${query}`, "{")),
              400,
              {
                success: false,
                error: "Invalid JSON body.",
              },
            );
          }
          noSideEffects();
        },
      );
      await run(
        `${route}: VI multipart file-valued name uses stable field metadata`,
        async () => {
          await responseBody(
            await invoke(
              route,
              localizedFormRequest(
                route,
                {
                  name: new Blob(["Ada"]),
                  email: "ada@example.test",
                  locale: "vi",
                },
                "multipart",
              ),
            ),
            400,
            {
              success: false,
              error: "Tên phải là chuỗi ký tự.",
            },
          );
          noSideEffects();
        },
      );
      await run(
        `${route}: multipart file-valued locale is rejected before upstream`,
        async () => {
          await responseBody(
            await invoke(
              route,
              localizedFormRequest(
                route,
                { ...person, locale: new Blob(["vi"]) },
                "multipart",
                "?lang=vi",
              ),
            ),
            400,
            {
              success: false,
              error: "Ngôn ngữ phải là tiếng Anh (en) hoặc tiếng Việt (vi).",
            },
          );
          noSideEffects();
        },
      );
      for (const key of ["GHL_API_KEY", "GHL_LOCATION_ID"]) {
        await run(
          `${route}: VI missing ${key} is fully localized and has no side effects`,
          async () => {
            delete state.env[key];
            await responseBody(
              await invoke(
                route,
                jsonRequest(route, { ...person, locale: "vi" }),
              ),
              500,
              {
                success: false,
                error: "Không thể gửi thông tin. Vui lòng thử lại.",
              },
            );
            noSideEffects();
          },
        );
      }
      for (const failure of [
        401,
        422,
        503,
        "network",
        "timeout",
        "invalid response",
        "malformed JSON",
      ]) {
        await run(
          `${route}: VI ${failure} remains safe and retryable without upstream details`,
          async () => {
            state.abortGhl = failure === "timeout";
            state.fetchImpl = async () => {
              if (typeof failure === "number")
                return Response.json(
                  { message: privateMarker },
                  { status: failure },
                );
              if (failure === "invalid response")
                return Response.json({ contact: {} });
              if (failure === "malformed JSON")
                return new Response(privateMarker);
              throw new Error(privateMarker);
            };
            await responseBody(
              await invoke(
                route,
                jsonRequest(route, { ...person, locale: "vi" }),
              ),
              502,
              {
                success: false,
                error: "Không thể gửi thông tin. Vui lòng thử lại.",
              },
            );
            assert.equal(state.fetchCalls.length, 1);
            assert.equal(state.stripeCalls.length, 0);
          },
        );
      }
      await run(
        `${route}: VI tag failure then EN retry preserves existing delivery policy and tags`,
        async () => {
          const successfulFetch = state.fetchImpl;
          state.fetchImpl = async (url, options) =>
            url.endsWith("/tags")
              ? new Response(privateMarker, { status: 503 })
              : successfulFetch(url, options);
          await responseBody(
            await invoke(
              route,
              jsonRequest(route, { ...person, locale: "vi" }),
            ),
            502,
            {
              success: false,
              error: "Không thể gửi thông tin. Vui lòng thử lại.",
            },
          );
          preservedTags();
          state.fetchImpl = successfulFetch;
          await responseBody(
            await invoke(
              route,
              jsonRequest(route, { ...person, locale: "en" }),
            ),
            200,
            { success: true },
          );
          assert.equal(state.fetchCalls.length, 4);
          for (const call of state.fetchCalls.filter(({ url }) =>
            url.endsWith("/contacts/upsert"),
          )) {
            assert.equal(Object.hasOwn(call.payload, "locale"), false);
            assert.equal(Object.hasOwn(call.payload, "tags"), false);
          }
          preservedTags(
            route === "contact"
              ? "website-contact-form"
              : "website-lead-generation",
          );
        },
      );
    }

    await run(
      "contact: VI optional fields localize every type, length, and control error",
      async () => {
        for (const [invalid, error] of [
          [{ phone: 42 }, "Số điện thoại phải là chuỗi ký tự."],
          [{ phone: {} }, "Số điện thoại phải là chuỗi ký tự."],
          [{ phone: null }, "Số điện thoại phải là chuỗi ký tự."],
          [{ phone: "1".repeat(51) }, "Số điện thoại quá dài."],
          [
            { phone: "123\u0000" },
            "Số điện thoại chứa ký tự không được hỗ trợ.",
          ],
          [{ message: 42 }, "Nội dung phải là chuỗi ký tự."],
          [{ message: {} }, "Nội dung phải là chuỗi ký tự."],
          [{ message: null }, "Nội dung phải là chuỗi ký tự."],
          [{ message: "m".repeat(5_001) }, "Nội dung quá dài."],
          [{ message: "text\u0000" }, "Nội dung chứa ký tự không được hỗ trợ."],
        ]) {
          await responseBody(
            await invoke(
              "contact",
              jsonRequest("contact", { ...person, ...invalid, locale: "vi" }),
            ),
            400,
            { success: false, error },
          );
        }
        noSideEffects();
      },
    );
    for (const format of ["JSON", "urlencoded", "multipart"]) {
      await run(
        `contact: VI ${format} preserves phone, plain-text notes, and established tags`,
        async () => {
          const message = " <strong>fixture</strong>\r\nDòng thứ hai ";
          await responseBody(
            await invoke(
              "contact",
              localizedFormRequest(
                "contact",
                { ...person, locale: "vi", phone: " +1 555 0100 ", message },
                format,
              ),
            ),
            200,
            { success: true },
          );
          assert.equal(state.fetchCalls.length, 3);
          assert.deepEqual(state.fetchCalls[0].payload, {
            locationId: fixtureEnv.GHL_LOCATION_ID,
            firstName: "Ada",
            lastName: "Lovelace",
            email: "ada@example.test",
            phone: "+1 555 0100",
          });
          assert.deepEqual(state.fetchCalls[1].payload, {
            tags: ["website-contact-form"],
          });
          assert.deepEqual(state.fetchCalls[2].payload, {
            body: `Message from web form:\n\n${message.trim()}`,
          });
          preservedTags("website-contact-form");
          noOutboundMessages();
        },
      );
    }
    await run(
      "contact: VI note failures remain best effort with safe internal logs",
      async () => {
        const successfulFetch = state.fetchImpl;
        state.fetchImpl = async (url, options) =>
          url.endsWith("/notes")
            ? new Response(privateMarker, { status: 503 })
            : successfulFetch(url, options);
        await responseBody(
          await invoke(
            "contact",
            jsonRequest("contact", {
              ...person,
              locale: "vi",
              message: "Xin chào",
            }),
          ),
          200,
          { success: true },
        );
        assert.equal(state.fetchCalls.length, 3);
        assert.ok(
          state.logs.some((log) => log === "Contact note tracking failed."),
        );
        preservedTags("website-contact-form");
      },
    );
    await run(
      "forms: concurrent EN/VI errors keep language request-local",
      async () => {
        const [vietnamese, english] = await Promise.all([
          invoke(
            "contact",
            jsonRequest("contact", { ...person, name: "", locale: "vi" }),
          ),
          invoke(
            "lead",
            jsonRequest("lead", { ...person, name: "", locale: "en" }),
          ),
        ]);
        await responseBody(vietnamese, 400, {
          success: false,
          error: "Tên là bắt buộc.",
        });
        await responseBody(english, 400, {
          success: false,
          error: "Name is required.",
        });
        noSideEffects();
      },
    );
    await run(
      "forms: concurrent EN/VI submissions preserve seeded CRM tags without locale fields",
      async () => {
        const responses = await Promise.all([
          invoke(
            "contact",
            jsonRequest("contact", { ...person, locale: "vi" }),
          ),
          invoke("lead", jsonRequest("lead", { ...person, locale: "en" })),
        ]);
        for (const response of responses)
          await responseBody(response, 200, { success: true });
        assert.equal(state.fetchCalls.length, 4);
        assert.ok(
          state.fetchCalls.every(
            ({ payload }) => !Object.hasOwn(payload, "locale"),
          ),
        );
        preservedTags("website-contact-form", "website-lead-generation");
      },
    );

    await run(
      "errors: stable codes and field metadata localize independently of English text",
      async () => {
        let error;
        try {
          apiHelpers.textField({ name: 42 }, "name", {
            required: true,
            maxLength: 200,
            label: privateMarker,
          });
        } catch (caught) {
          error = caught;
        }
        assert.equal(error.name, "InputError");
        assert.equal(error.status, 400);
        assert.equal(error.code, "field_must_be_string");
        assert.deepEqual(error.metadata, {
          field: "name",
          label: privateMarker,
        });
        assert.equal(error.message, `${privateMarker} must be a string.`);
        await responseBody(
          apiHelpers.failureResponse(error, "fallback", 500, "vi"),
          400,
          {
            success: false,
            error: "Tên phải là chuỗi ký tự.",
          },
        );
        const unrelatedText = new apiHelpers.InputError(
          privateMarker,
          422,
          "field_required",
          { field: "email", label: privateMarker },
        );
        await responseBody(
          apiHelpers.failureResponse(unrelatedText, "fallback", 500, "vi"),
          422,
          {
            success: false,
            error: "Email là bắt buộc.",
          },
        );
        noSideEffects();
      },
    );
    await run(
      "errors: legacy default English messages/status stay exact and VI never guesses from prose",
      async () => {
        const legacy = new apiHelpers.InputError("Name is required.", 422);
        await responseBody(
          apiHelpers.failureResponse(legacy, "fallback"),
          422,
          { success: false, error: "Name is required." },
        );
        await responseBody(
          apiHelpers.failureResponse(
            new Error(privateMarker),
            "Unable to submit. Please try again.",
            502,
          ),
          502,
          {
            success: false,
            error: "Unable to submit. Please try again.",
          },
        );
        await responseBody(
          apiHelpers.failureResponse(legacy, "fallback", 500, "vi"),
          422,
          {
            success: false,
            error: "Thông tin gửi không hợp lệ.",
          },
        );
        noSideEffects();
      },
    );
    await run(
      "errors: unknown codes/fields and upstream failures have safe fully localized fallbacks",
      async () => {
        const unknown = new apiHelpers.InputError(
          privateMarker,
          400,
          "__proto__",
          { field: privateMarker, label: privateMarker },
        );
        await responseBody(
          apiHelpers.failureResponse(unknown, "fallback", 500, "vi"),
          400,
          {
            success: false,
            error: "Thông tin gửi không hợp lệ.",
          },
        );
        const unknownField = new apiHelpers.InputError(
          privateMarker,
          400,
          "field_required",
          { field: privateMarker, label: privateMarker },
        );
        await responseBody(
          apiHelpers.failureResponse(unknownField, "fallback", 500, "vi"),
          400,
          {
            success: false,
            error: "Trường thông tin là bắt buộc.",
          },
        );
        await responseBody(
          apiHelpers.failureResponse(
            new Error(privateMarker),
            privateMarker,
            502,
            "vi",
            "submission_failed",
          ),
          502,
          {
            success: false,
            error: "Không thể gửi thông tin. Vui lòng thử lại.",
          },
        );
        noSideEffects();
      },
    );
    await run(
      "errors: parser emits stable codes while preserving legacy status/text",
      async () => {
        for (const [body, type, status, code, message] of [
          ["{", "application/json", 400, "invalid_json", "Invalid JSON body."],
          [
            "[]",
            "application/json",
            400,
            "body_not_object",
            "Request body must be an object.",
          ],
          [
            "broken",
            "multipart/form-data",
            400,
            "invalid_form",
            "Invalid form body.",
          ],
          [
            "name=Ada&name=Other",
            "application/x-www-form-urlencoded",
            400,
            "duplicate_form_fields",
            "Form fields must not be repeated.",
          ],
          [
            "{}",
            "text/plain",
            415,
            "unsupported_content_type",
            "Unsupported content type.",
          ],
          [
            JSON.stringify({ unused: "x".repeat(32 * 1024) }),
            "application/json",
            413,
            "body_too_large",
            "Request body is too large.",
          ],
        ]) {
          await assert.rejects(
            () =>
              apiHelpers.readFields(rawRequest("contact", body, type), true),
            (error) =>
              error.name === "InputError" &&
              error.status === status &&
              error.code === code &&
              error.message === message,
          );
        }
        assert.throws(
          () => apiHelpers.localeField({ locale: "VI" }),
          (error) =>
            error.name === "InputError" && error.code === "invalid_locale",
        );
        assert.equal(apiHelpers.localeField({}), "en");
        assert.equal(apiHelpers.localeField({ locale: "vi" }), "vi");
        noSideEffects();
      },
    );
    await run(
      "errors: Vietnamese catalog covers non-field input and configuration failures",
      async () => {
        assert.equal(typeof apiMessages.apiMessage, "function");
        for (const [code, expected] of [
          ["body_too_large", "Nội dung yêu cầu quá lớn."],
          ["unsupported_content_type", "Loại nội dung không được hỗ trợ."],
          ["body_not_object", "Nội dung yêu cầu phải là một đối tượng."],
          ["duplicate_form_fields", "Các trường biểu mẫu không được lặp lại."],
          ["invalid_json", "Nội dung JSON không hợp lệ."],
          ["invalid_form", "Nội dung biểu mẫu không hợp lệ."],
          ["invalid_email", "Vui lòng nhập địa chỉ email hợp lệ."],
          [
            "invalid_locale",
            "Ngôn ngữ phải là tiếng Anh (en) hoặc tiếng Việt (vi).",
          ],
          ["unknown_plan", "Không tìm thấy gói dịch vụ."],
          ["invalid_interval", "Chu kỳ thanh toán phải là tháng hoặc năm."],
          ["invalid_currency", "Đơn vị tiền tệ phải là USD hoặc VND."],
          ["invalid_request", "Thông tin gửi không hợp lệ."],
          ["submission_failed", "Không thể gửi thông tin. Vui lòng thử lại."],
          ["internal_error", "Không thể hoàn tất yêu cầu. Vui lòng thử lại."],
        ]) {
          assert.equal(apiMessages.apiMessage("vi", code), expected);
        }
        noSideEffects();
      },
    );
  } finally {
    if (server) await server.close();
    if (previousFixture === undefined) delete globalThis[fixtureKey];
    else globalThis[fixtureKey] = previousFixture;
  }
});
