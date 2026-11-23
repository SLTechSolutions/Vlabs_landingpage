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
} from "../../lib/server/api";
import { apiMessage } from "../../lib/server/apiMessages";
import { upsertGhlContact } from "../../lib/server/ghl";

// This route is server-rendered; integration settings stay request-local.
export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  let locale: Locale = queryLocale(request);
  try {
    const fields = await readFields(request, true);
    locale = localeField(fields);
    const person = personFields(fields);
    const GHL_API_KEY = process.env.GHL_API_KEY ?? import.meta.env.GHL_API_KEY;
    const GHL_LOCATION_ID =
      process.env.GHL_LOCATION_ID ?? import.meta.env.GHL_LOCATION_ID;
    if (!GHL_API_KEY || !GHL_LOCATION_ID) {
      console.error("Lead form integration is not configured.");
      return jsonResponse(
        { success: false, error: apiMessage(locale, "submission_failed") },
        500,
      );
    }

    await upsertGhlContact(GHL_API_KEY, {
      locationId: GHL_LOCATION_ID,
      ...person,
      tags: ["website-lead-generation"],
    });

    return jsonResponse({ success: true });
  } catch (error) {
    if (!(error instanceof InputError)) {
      console.error("Lead form submission failed.");
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
