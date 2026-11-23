import { isLocale, type Locale } from "../currency";
import {
  apiMessage,
  type ApiErrorCode,
  type ApiErrorMetadata,
} from "./apiMessages";

const MAX_BODY_BYTES = 32 * 1024;

export class InputError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
    public readonly code?: ApiErrorCode,
    public readonly metadata?: ApiErrorMetadata,
  ) {
    super(message);
    this.name = "InputError";
  }
}

export function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export function failureResponse(
  error: unknown,
  message: string,
  status = 500,
  locale: Locale = "en",
  messageCode: ApiErrorCode = "internal_error",
) {
  const responseLocale = isLocale(locale) ? locale : "en";
  return jsonResponse(
    {
      success: false,
      error:
        error instanceof InputError
          ? responseLocale === "en"
            ? error.message
            : apiMessage("vi", error.code ?? "invalid_request", error.metadata)
          : responseLocale === "en"
            ? message
            : apiMessage("vi", messageCode),
    },
    error instanceof InputError ? error.status : status,
  );
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// The query is only an error-language hint until a body has been parsed.
export function queryLocale(request: Request): Locale {
  const values = new URL(request.url).searchParams.getAll("lang");
  return values.length === 1 && isLocale(values[0]) ? values[0] : "en";
}

export function localeField(fields: Record<string, unknown>): Locale {
  if (fields.locale === undefined) return "en";
  if (!isLocale(fields.locale)) {
    throw new InputError("Locale must be en or vi.", 400, "invalid_locale", {
      field: "locale",
    });
  }
  return fields.locale;
}

async function readBody(request: Request) {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength && Number(declaredLength) > MAX_BODY_BYTES) {
    throw new InputError("Request body is too large.", 413, "body_too_large");
  }

  if (!request.body) return new Uint8Array();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => {});
        throw new InputError(
          "Request body is too large.",
          413,
          "body_too_large",
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function readFields(request: Request, allowForm = false) {
  const contentType = request.headers.get("content-type") ?? "";
  const mediaType = contentType.split(";", 1)[0]?.trim().toLowerCase();
  const isJson = mediaType === "application/json";
  const isForm =
    allowForm &&
    (mediaType === "application/x-www-form-urlencoded" ||
      mediaType === "multipart/form-data");

  if (!isJson && !isForm) {
    throw new InputError(
      "Unsupported content type.",
      415,
      "unsupported_content_type",
    );
  }

  try {
    const body = await readBody(request);
    if (isJson) {
      const fields: unknown = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(body),
      );
      if (!isRecord(fields)) {
        throw new InputError(
          "Request body must be an object.",
          400,
          "body_not_object",
        );
      }
      return fields;
    }

    const formData = await new Response(body, {
      headers: { "Content-Type": contentType },
    }).formData();
    const fields: Record<string, unknown> = Object.create(null);
    for (const [key, value] of formData) {
      if (Object.prototype.hasOwnProperty.call(fields, key)) {
        throw new InputError(
          "Form fields must not be repeated.",
          400,
          "duplicate_form_fields",
        );
      }
      fields[key] = value;
    }
    return fields;
  } catch (error) {
    if (error instanceof InputError) throw error;
    throw new InputError(
      isJson ? "Invalid JSON body." : "Invalid form body.",
      400,
      isJson ? "invalid_json" : "invalid_form",
    );
  }
}

interface TextFieldOptions {
  required?: boolean;
  maxLength: number;
  multiline?: boolean;
  label?: string;
}

export function textField(
  fields: Record<string, unknown>,
  key: string,
  {
    required = false,
    maxLength,
    multiline = false,
    label = key,
  }: TextFieldOptions,
) {
  const value = fields[key];
  if (value === undefined && !required) return "";
  if (typeof value !== "string") {
    throw new InputError(
      `${label} must be a string.`,
      400,
      "field_must_be_string",
      {
        field: key,
        label,
      },
    );
  }

  const text = value.trim();
  if (required && !text) {
    throw new InputError(`${label} is required.`, 400, "field_required", {
      field: key,
      label,
    });
  }
  if (value.length > maxLength) {
    throw new InputError(`${label} is too long.`, 400, "field_too_long", {
      field: key,
      label,
    });
  }
  const invalidControls = multiline
    ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/
    : /[\u0000-\u001f\u007f]/;
  if (invalidControls.test(value)) {
    throw new InputError(
      `${label} contains unsupported characters.`,
      400,
      "field_unsupported_characters",
      { field: key, label },
    );
  }
  return text;
}

export function personFields(fields: Record<string, unknown>) {
  const name = textField(fields, "name", {
    required: true,
    maxLength: 200,
    label: "Name",
  });
  const email = textField(fields, "email", {
    required: true,
    maxLength: 254,
    label: "Email",
  });
  const [localPart] = email.split("@");
  if (
    !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) ||
    (localPart?.length ?? 0) > 64
  ) {
    throw new InputError(
      "A valid email address is required.",
      400,
      "invalid_email",
    );
  }

  const nameParts = name.split(/\s+/);
  return {
    email,
    firstName: nameParts[0] ?? "",
    lastName: nameParts.slice(1).join(" "),
  };
}
