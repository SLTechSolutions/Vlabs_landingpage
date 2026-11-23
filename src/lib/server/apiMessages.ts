import type { Locale } from "../currency";

type FieldErrorCode =
  | "field_must_be_string"
  | "field_required"
  | "field_too_long"
  | "field_unsupported_characters";

type GeneralErrorCode =
  | "body_too_large"
  | "unsupported_content_type"
  | "body_not_object"
  | "duplicate_form_fields"
  | "invalid_json"
  | "invalid_form"
  | "invalid_email"
  | "invalid_locale"
  | "unknown_plan"
  | "invalid_interval"
  | "invalid_currency"
  | "invalid_request"
  | "submission_failed"
  | "internal_error";

export type ApiErrorCode = FieldErrorCode | GeneralErrorCode;

export interface ApiErrorMetadata {
  readonly field?: string;
  readonly label?: string;
}

const messages: Record<Locale, Record<GeneralErrorCode, string>> = {
  en: {
    body_too_large: "Request body is too large.",
    unsupported_content_type: "Unsupported content type.",
    body_not_object: "Request body must be an object.",
    duplicate_form_fields: "Form fields must not be repeated.",
    invalid_json: "Invalid JSON body.",
    invalid_form: "Invalid form body.",
    invalid_email: "A valid email address is required.",
    invalid_locale: "Locale must be en or vi.",
    unknown_plan: "Unknown plan.",
    invalid_interval: "Interval must be month or year.",
    invalid_currency: "Currency must be usd or vnd.",
    invalid_request: "Invalid request.",
    submission_failed: "Unable to submit. Please try again.",
    internal_error: "Unable to complete the request. Please try again.",
  },
  vi: {
    body_too_large: "Nội dung yêu cầu quá lớn.",
    unsupported_content_type: "Loại nội dung không được hỗ trợ.",
    body_not_object: "Nội dung yêu cầu phải là một đối tượng.",
    duplicate_form_fields: "Các trường biểu mẫu không được lặp lại.",
    invalid_json: "Nội dung JSON không hợp lệ.",
    invalid_form: "Nội dung biểu mẫu không hợp lệ.",
    invalid_email: "Vui lòng nhập địa chỉ email hợp lệ.",
    invalid_locale: "Ngôn ngữ phải là tiếng Anh (en) hoặc tiếng Việt (vi).",
    unknown_plan: "Không tìm thấy gói dịch vụ.",
    invalid_interval: "Chu kỳ thanh toán phải là tháng hoặc năm.",
    invalid_currency: "Đơn vị tiền tệ phải là USD hoặc VND.",
    invalid_request: "Thông tin gửi không hợp lệ.",
    submission_failed: "Không thể gửi thông tin. Vui lòng thử lại.",
    internal_error: "Không thể hoàn tất yêu cầu. Vui lòng thử lại.",
  },
};

const fieldSuffixes: Record<FieldErrorCode, Record<Locale, string>> = {
  field_must_be_string: {
    en: "must be a string.",
    vi: "phải là chuỗi ký tự.",
  },
  field_required: { en: "is required.", vi: "là bắt buộc." },
  field_too_long: { en: "is too long.", vi: "quá dài." },
  field_unsupported_characters: {
    en: "contains unsupported characters.",
    vi: "chứa ký tự không được hỗ trợ.",
  },
};

const vietnameseFields = new Map([
  ["name", "Tên"],
  ["email", "Email"],
  ["phone", "Số điện thoại"],
  ["message", "Nội dung"],
  ["planTitle", "Gói dịch vụ"],
  ["planId", "Mã gói dịch vụ"],
  ["interval", "Chu kỳ thanh toán"],
  ["locale", "Ngôn ngữ"],
  ["currency", "Đơn vị tiền tệ"],
]);

export function apiMessage(
  locale: Locale,
  code: ApiErrorCode,
  metadata: ApiErrorMetadata = {},
): string {
  if (Object.prototype.hasOwnProperty.call(fieldSuffixes, code)) {
    const field =
      locale === "vi"
        ? (vietnameseFields.get(metadata.field ?? "") ?? "Trường thông tin")
        : (metadata.label ?? metadata.field ?? "Field");
    return `${field} ${fieldSuffixes[code as FieldErrorCode][locale]}`;
  }
  const localized = messages[locale];
  return Object.prototype.hasOwnProperty.call(localized, code)
    ? localized[code as GeneralErrorCode]
    : localized.invalid_request;
}
