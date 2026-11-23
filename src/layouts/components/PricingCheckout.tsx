import { useEffect, useId, useRef, useState, type SubmitEvent } from "react";
import { FaXmark } from "react-icons/fa6";
import {
  currencyForLocale,
  formatMinorAmount,
  type Locale,
} from "@/lib/currency";
import type { CheckoutCopy } from "@/lib/messages";
import type { PlanId } from "@/types";

interface PricingCheckoutProps {
  readonly locale: Locale;
  readonly planId: PlanId;
  readonly planTitle: string;
  readonly monthlyAmountMinor: number;
  readonly yearlyAmountMinor: number;
  readonly buttonLabel: string;
  readonly copy: CheckoutCopy;
}

type CheckoutResult =
  | { success: true; provider: "paypal"; url: string; orderId: string }
  | {
      success: true;
      provider: "sepay";
      url: string;
      method: "POST";
      fields: Record<string, string>;
      orderId: string;
    };

type FieldErrors = Partial<Record<"name" | "email", string>>;
const emailPattern = String.raw`[^\s@]+@[^\s@]+\.[^\s@]+`;
const paypalOrigins = new Set([
  "https://www.paypal.com",
  "https://www.sandbox.paypal.com",
]);
const sepayCheckoutUrls = new Set([
  "https://pay.sepay.vn/v1/checkout/init",
  "https://pay-sandbox.sepay.vn/v1/checkout/init",
]);
const sepayFieldNames = new Set([
  "merchant",
  "operation",
  "payment_method",
  "order_invoice_number",
  "order_amount",
  "currency",
  "order_description",
  "customer_id",
  "success_url",
  "error_url",
  "cancel_url",
  "custom_data",
  "signature",
  "lang",
]);
const requiredSepayFields = [
  "merchant",
  "operation",
  "order_invoice_number",
  "order_amount",
  "currency",
  "signature",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function checkoutResult(value: unknown, locale: Locale): CheckoutResult | null {
  if (
    !isRecord(value) ||
    value.success !== true ||
    value.provider !== (locale === "vi" ? "sepay" : "paypal") ||
    typeof value.url !== "string" ||
    typeof value.orderId !== "string" ||
    !value.orderId.trim()
  ) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(value.url);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password) return null;

  if (value.provider === "paypal") {
    if (
      !paypalOrigins.has(url.origin) ||
      url.pathname !== "/webapps/billing/subscriptions" ||
      url.hash
    ) {
      return null;
    }
    return {
      success: true,
      provider: "paypal",
      url: url.href,
      orderId: value.orderId,
    };
  }

  if (
    !sepayCheckoutUrls.has(value.url) ||
    value.method !== "POST" ||
    !isRecord(value.fields)
  ) {
    return null;
  }
  const fields = value.fields;
  if (
    Object.entries(fields).some(
      ([name, field]) =>
        !sepayFieldNames.has(name) || typeof field !== "string",
    ) ||
    requiredSepayFields.some(
      (name) => typeof fields[name] !== "string" || !fields[name].trim(),
    ) ||
    fields.operation !== "PURCHASE" ||
    fields.currency !== "VND"
  ) {
    return null;
  }

  return {
    success: true,
    provider: "sepay",
    url: value.url,
    method: "POST",
    // Keep every signed value and its insertion order exactly as returned.
    fields: fields as Record<string, string>,
    orderId: value.orderId,
  };
}

export default function PricingCheckout({
  locale,
  planId,
  planTitle,
  monthlyAmountMinor,
  yearlyAmountMinor,
  buttonLabel,
  copy,
}: PricingCheckoutProps) {
  const id = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const hostedFormRef = useRef<HTMLFormElement | null>(null);
  const pendingRef = useRef(false);
  const [hydrated, setHydrated] = useState(false);
  const [interval, setInterval] = useState<"month" | "year">("month");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [unavailable, setUnavailable] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const amountMinor =
    interval === "year" ? yearlyAmountMinor : monthlyAmountMinor;
  const currency = currencyForLocale(locale);
  const amount = formatMinorAmount(
    amountMinor,
    currency,
    locale,
  );
  const summary = (
    interval === "year" ? copy.yearlySummary : copy.monthlySummary
  ).replace("{amount}", () => amount);
  const localePrefix = locale === "vi" ? "/vi" : "";

  useEffect(() => {
    setHydrated(true);
    const cleanup = () => {
      requestRef.current?.abort();
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      hostedFormRef.current?.remove();
      hostedFormRef.current = null;
    };
    window.addEventListener("pagehide", cleanup);
    return () => {
      window.removeEventListener("pagehide", cleanup);
      cleanup();
    };
  }, []);

  const abortRequest = () => {
    requestRef.current?.abort();
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    hostedFormRef.current?.remove();
    hostedFormRef.current = null;
  };

  const fieldError = (input: HTMLInputElement, field: "name" | "email") => {
    if (input.required && !input.value.trim()) {
      return field === "name" ? copy.requiredName : copy.requiredEmail;
    }
    if (
      input.validity.tooLong ||
      (input.maxLength >= 0 && input.value.length > input.maxLength)
    ) {
      return copy.tooLong;
    }
    if (
      field === "email" &&
      (input.validity.typeMismatch || input.validity.patternMismatch)
    ) {
      return copy.invalidEmail;
    }
    return "";
  };

  const markInvalid = (input: HTMLInputElement, field: "name" | "email") => {
    setUnavailable(false);
    const message =
      fieldError(input, field) ||
      (field === "name" ? copy.requiredName : copy.invalidEmail);
    input.setCustomValidity(message);
    setFieldErrors((current) => ({ ...current, [field]: message }));
    setError(copy.review);
  };

  const openDialog = () => {
    const dialog = dialogRef.current;
    if (!hydrated || !dialog || dialog.open) return;
    const selected = triggerRef.current
      ?.closest("[data-pricing-section]")
      ?.querySelector<HTMLInputElement>(
        "input[name='billing-interval']:checked",
      );
    setInterval(selected?.value === "year" ? "year" : "month");
    setError("");
    setUnavailable(false);
    dialog.showModal();
    // Focus the heading, not an input, so mobile keyboards do not obscure context.
    headingRef.current?.focus();
  };

  const closeDialog = () => {
    // Native close events are queued, so abort before dismissing the dialog.
    abortRequest();
    dialogRef.current?.close();
  };

  const resetAfterClose = () => {
    abortRequest();
    requestRef.current = null;
    pendingRef.current = false;
    setLoading(false);
    setError("");
    setUnavailable(false);
    triggerRef.current?.focus();
  };

  const handleCheckout = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!hydrated || pendingRef.current) return;

    const form = event.currentTarget;
    const formData = new FormData(form);
    const name = String(formData.get("name") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim();
    setUnavailable(false);
    setFieldErrors({});
    for (const field of ["name", "email"] as const) {
      const input = form.elements.namedItem(field) as HTMLInputElement;
      input.setCustomValidity("");
      input.setCustomValidity(fieldError(input, field));
    }
    if (!form.reportValidity()) return;

    pendingRef.current = true;
    setLoading(true);
    setError("");
    const controller = new AbortController();
    requestRef.current = controller;
    let timedOut = false;
    timeoutRef.current = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 20_000);

    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, planId, interval, locale }),
        signal: controller.signal,
      });
      const result: unknown = await response.json().catch(() => null);
      if (controller.signal.aborted) throw controller.signal.reason;
      if (!response.ok || !isRecord(result) || result.success !== true) {
        if (
          response.status === 409 &&
          isRecord(result) &&
          result.success === false &&
          result.code === "checkout_unavailable"
        ) {
          // Render trusted localized copy, not upstream details or a retry hint.
          setUnavailable(true);
          return;
        }
        setError(
          isRecord(result) &&
            typeof result.error === "string" &&
            result.error.trim()
            ? `${result.error} ${copy.retry}`
            : copy.failed,
        );
        return;
      }

      const checkout = checkoutResult(result, locale);
      if (!checkout) {
        setError(copy.invalidLink);
        return;
      }
      if (!dialogRef.current?.open) return;
      if (checkout.provider === "paypal") {
        window.location.assign(checkout.url);
      } else {
        const hostedForm = document.createElement("form");
        hostedForm.method = "POST";
        hostedForm.action = checkout.url;
        hostedForm.hidden = true;
        for (const [name, value] of Object.entries(checkout.fields)) {
          const input = document.createElement("input");
          input.type = "hidden";
          input.name = name;
          input.value = value;
          hostedForm.append(input);
        }
        hostedFormRef.current?.remove();
        hostedFormRef.current = hostedForm;
        document.body.append(hostedForm);
        HTMLFormElement.prototype.submit.call(hostedForm);
      }
    } catch {
      if (
        requestRef.current === controller &&
        dialogRef.current?.open &&
        (!controller.signal.aborted || timedOut)
      ) {
        hostedFormRef.current?.remove();
        hostedFormRef.current = null;
        setError(timedOut ? copy.timeout : copy.connection);
      }
    } finally {
      if (requestRef.current === controller) {
        if (timeoutRef.current !== null)
          window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
        requestRef.current = null;
        pendingRef.current = false;
        setLoading(false);
      }
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={!hydrated}
        onClick={openDialog}
        className="btn btn-primary w-full"
        aria-haspopup="dialog"
      >
        {buttonLabel}
      </button>
      <dialog
        ref={dialogRef}
        className="checkout-dialog"
        lang={locale}
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-summary ${id}-terms`}
        onCancel={abortRequest}
        onClose={resetAfterClose}
        onClick={(event) => {
          if (event.target === event.currentTarget) closeDialog();
        }}
      >
        <div className="dialog-body">
          <div className="dialog-header">
            <h2
              id={`${id}-title`}
              ref={headingRef}
              tabIndex={-1}
              className="text-2xl"
            >
              {copy.title.replace("{plan}", () => planTitle)}
            </h2>
            <button
              type="button"
              onClick={closeDialog}
              className="icon-button"
              aria-label={copy.close}
            >
              <FaXmark aria-hidden="true" />
            </button>
          </div>
          <p id={`${id}-summary`} className="my-5">
            {summary}
          </p>
          <p id={`${id}-terms`} className="form-help mb-6">
            {copy.terms}
          </p>
          <form
            onSubmit={handleCheckout}
            aria-busy={loading}
            className="enquiry-form"
          >
            <p className="text-sm text-text-dark">{copy.allRequired}</p>
            <div className="form-field">
              <label className="form-label" htmlFor={`${id}-name`}>
                {copy.name}
              </label>
              <input
                id={`${id}-name`}
                className="form-input"
                name="name"
                type="text"
                autoComplete="name"
                maxLength={200}
                required
                readOnly={loading}
                aria-invalid={fieldErrors.name ? true : undefined}
                aria-describedby={`${id}-name-error`}
                onInvalid={(event) => {
                  markInvalid(event.currentTarget, "name");
                }}
                onInput={(event) => {
                  event.currentTarget.setCustomValidity("");
                  if (fieldErrors.name)
                    setFieldErrors((current) => ({ ...current, name: "" }));
                }}
              />
              <span id={`${id}-name-error`} className="field-error">
                {fieldErrors.name}
              </span>
            </div>
            <div className="form-field">
              <label className="form-label" htmlFor={`${id}-email`}>
                {copy.email}
              </label>
              <input
                id={`${id}-email`}
                className="form-input"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                spellCheck={false}
                maxLength={254}
                pattern={emailPattern}
                required
                readOnly={loading}
                aria-invalid={fieldErrors.email ? true : undefined}
                aria-describedby={`${id}-email-error`}
                onInvalid={(event) => {
                  markInvalid(event.currentTarget, "email");
                }}
                onInput={(event) => {
                  event.currentTarget.setCustomValidity("");
                  if (fieldErrors.email)
                    setFieldErrors((current) => ({ ...current, email: "" }));
                }}
              />
              <span id={`${id}-email-error`} className="field-error">
                {fieldErrors.email}
              </span>
            </div>
            <p className="form-help">
              {copy.privacy}{" "}
              <a className="link" href={`${localePrefix}/privacy-policy`}>
                {copy.privacyLink}
              </a>{" "}
              {copy.and}{" "}
              <a className="link" href={`${localePrefix}/term-and-condition`}>
                {copy.termsLink}
              </a>
              .
            </p>
            <button
              type="submit"
              disabled={!hydrated || loading}
              className="btn btn-primary w-full"
            >
              {loading ? copy.loading : copy.continue}
            </button>
            <p
              className="form-status"
              role="status"
              aria-live="polite"
              aria-atomic="true"
              data-state={
                unavailable ? "unavailable" : error ? "error" : "pending"
              }
            >
              {unavailable
                ? copy.unavailable
                : error || (loading ? copy.pending : "")}
            </p>
            <a className="link text-sm" href={`${localePrefix}/contact`}>
              {unavailable ? copy.unavailableContact : copy.contact}
            </a>
          </form>
        </div>
      </dialog>
    </>
  );
}
