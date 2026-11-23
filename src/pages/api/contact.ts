import type { APIRoute } from "astro";
import { type Locale } from "../../lib/currency";
import {
  failureResponse,
  InputError,
  jsonResponse,
  localeField,
  personFields,
  queryLocale,
  readFields,
  textField,
} from "../../lib/server/api";
import { apiMessage } from "../../lib/server/apiMessages";
import { postGhl, upsertGhlContact } from "../../lib/server/ghl";

// This route is server-rendered; integration settings stay request-local.
export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  let locale: Locale = queryLocale(request);
  try {
    const fields = await readFields(request, true);
    locale = localeField(fields);
    const person = personFields(fields);
    const phone = textField(fields, "phone", { maxLength: 50, label: "Phone" });
    const message = textField(fields, "message", {
      maxLength: 5_000,
      multiline: true,
      label: "Message",
    });
    const GHL_API_KEY = process.env.GHL_API_KEY ?? import.meta.env.GHL_API_KEY;
    const GHL_LOCATION_ID =
      process.env.GHL_LOCATION_ID ?? import.meta.env.GHL_LOCATION_ID;
    if (!GHL_API_KEY || !GHL_LOCATION_ID) {
      console.error("Contact form integration is not configured.");
      return jsonResponse(
        { success: false, error: apiMessage(locale, "submission_failed") },
        500,
      );
    }

    const contactId = await upsertGhlContact(GHL_API_KEY, {
      locationId: GHL_LOCATION_ID,
      ...person,
      phone,
      tags: ["website-contact-form"],
    });

    // Preserve best-effort plain-text notes without sending outbound messages.
    if (message) {
      try {
        const response = await postGhl(
          `/contacts/${encodeURIComponent(contactId)}/notes`,
          GHL_API_KEY,
          { body: `Message from web form:\n\n${message}` },
        );
        await response.body?.cancel().catch(() => {});
      } catch {
        console.error("Contact note tracking failed.");
      }
    }

    return jsonResponse({ success: true });
  } catch (error) {
    if (!(error instanceof InputError)) {
      console.error("Contact form submission failed.");
    }
    return failureResponse(
      error,
      "Unable to submit. Please try again.",
      502,
      locale,
      "submission_failed",
    );
  }
};
