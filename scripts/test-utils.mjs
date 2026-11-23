import assert from "node:assert/strict";
import test from "node:test";
import {
  markdownify,
  plainify,
  sanitizeRenderedHtml,
} from "../src/lib/utils/textConverter.ts";

test("inline Markdown stays inline and synchronous", () => {
  assert.equal(markdownify("**VLABS**"), "<strong>VLABS</strong>");
});

test("block Markdown returns synchronous HTML", () => {
  assert.equal(
    markdownify("A learning platform.", true),
    "<p>A learning platform.</p>\n",
  );
});

test("plain metadata strips tags and decodes non-breaking spaces", () => {
  assert.equal(
    plainify("<strong>VLABS</strong> &amp; STEM&nbsp;labs"),
    "VLABS & STEM labs",
  );
});

test("plain metadata separates headings and paragraphs with spaces", () => {
  assert.equal(
    plainify("# Smarter learning\n\nFor schools"),
    "Smarter learning For schools",
  );
});

test("plain metadata decodes supported quotes and escaped brackets", () => {
  assert.equal(
    plainify("&lt;lab&gt; &quot;course&quot; &#39;teacher&#39;"),
    "<lab> \"course\" 'teacher'",
  );
});

test("empty content stays empty", () => {
  assert.equal(markdownify(""), "");
  assert.equal(plainify(""), "");
});

test("rendered Markdown is sanitized before HTML sinks", () => {
  const rendered = markdownify(
    "[safe](https://example.com) [unsafe](javascript:alert(1)) <img src=x onerror=alert(2)>",
  );
  assert.match(rendered, /https:\/\/example\.com/);
  assert.doesNotMatch(rendered, /javascript:|onerror|<img/i);
  assert.doesNotMatch(
    sanitizeRenderedHtml('<svg onload="alert(1)"><script>x</script></svg>'),
    /svg|script|onload/i,
  );
});
