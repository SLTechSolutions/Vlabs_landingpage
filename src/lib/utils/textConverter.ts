import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

const entities: Record<string, string> = {
  "&nbsp;": " ",
  "&lt;": "<",
  "&gt;": ">",
  "&amp;": "&",
  "&quot;": '"',
  "&#39;": "'",
};

export const sanitizeRenderedHtml = (content: string): string =>
  sanitizeHtml(content, {
    allowedTags: [
      "p",
      "br",
      "strong",
      "em",
      "b",
      "i",
      "ul",
      "ol",
      "li",
      "a",
      "code",
      "blockquote",
      "h2",
      "h3",
      "h4",
    ],
    allowedAttributes: { a: ["href", "title", "rel"] },
    allowedSchemes: ["https", "mailto", "tel"],
    allowProtocolRelative: false,
    transformTags: {
      a: (_tagName, attributes) => ({
        tagName: "a",
        attribs: { ...attributes, rel: "noopener noreferrer" },
      }),
    },
  });

export const markdownify = (content: string, block = false): string => {
  const rendered = block
    ? marked.parse(content, { async: false })
    : marked.parseInline(content, { async: false });
  return sanitizeRenderedHtml(rendered);
};

export const plainify = (content: string): string => {
  return marked
    .parse(content, { async: false })
    .replace(/<\/?[^>]+(>|$)/g, "")
    .replace(
      /&nbsp;|&lt;|&gt;|&amp;|&quot;|&#39;/g,
      (entity) => entities[entity] ?? entity,
    )
    .replace(/\s+/g, " ")
    .trim();
};
