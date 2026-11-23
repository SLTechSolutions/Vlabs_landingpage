import { isRecord } from "./api";

export interface GHLContactPayload {
  locationId: string;
  firstName?: string;
  lastName?: string;
  email: string;
  phone?: string;
  tags: string[];
  customFields?: Array<{ key: string; field_value: string }>;
}

export async function postGhl(path: string, apiKey: string, payload: unknown) {
  const response = await fetch(`https://services.leadconnectorhq.com${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Version: "2021-07-28",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(5_000),
  });

  if (!response.ok) {
    // Upstream bodies and exception objects can contain credentials or PII.
    console.error("GHL request failed with status:", response.status);
    await response.body?.cancel().catch(() => {});
    throw new Error("GHL request failed.");
  }
  // Callers must consume or cancel successful response bodies.
  return response;
}

export async function upsertGhlContact(
  apiKey: string,
  payload: GHLContactPayload,
) {
  // Upsert tags replace existing CRM tags. Use the additive endpoint instead.
  const { tags, ...contact } = payload;
  const response = await postGhl("/contacts/upsert", apiKey, contact);
  const result: unknown = await response.json();
  if (!isRecord(result) || !isRecord(result.contact)) {
    throw new Error("Invalid GHL contact response.");
  }
  const contactId = result.contact.id;
  if (
    typeof contactId !== "string" ||
    !contactId.trim() ||
    contactId.length > 200
  ) {
    throw new Error("Invalid GHL contact response.");
  }
  const id = contactId.trim();
  if (tags.length > 0) {
    // Required delivery: let callers apply their existing failure/retry policy.
    const tagResponse = await postGhl(
      `/contacts/${encodeURIComponent(id)}/tags`,
      apiKey,
      { tags },
    );
    await tagResponse.body?.cancel().catch(() => {});
  }
  return id;
}
