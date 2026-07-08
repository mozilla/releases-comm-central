/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that the renderer collapses a trailing run of empty lines in a plain
 * text body down to a single line break, while keeping interior empty lines.
 * Each scenario runs against both the fixed and format=flowed renderers.
 * See RFC 6376 3.4.3 for the canonicalization this mirrors.
 */

var { FileTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/FileTestUtils.sys.mjs"
);

const SENDER = "sender@example.invalid";
const RECIPIENT = "recipient@example.invalid";

// Stream a raw RFC822 message through the MIME converter and return the
// rendered HTML. sanitize sets mail.body_sanitize_trailing_blank_lines.
// A file channel is used instead of MessageInjection because the mbox store
// appends a newline to a body that ends mid-line, which would defeat the
// missing-final-CRLF scenario.
async function streamMessage(raw, sanitize) {
  Services.prefs.setBoolPref(
    "mail.body_sanitize_trailing_blank_lines",
    sanitize
  );
  const file = FileTestUtils.getTempFile("raw.eml");
  await IOUtils.write(file.path, new TextEncoder().encode(raw));

  const listener = new PromiseTestUtils.PromiseStreamListener();
  const channel = Services.io.newChannelFromURI(
    Services.io.newFileURI(file),
    null,
    Services.scriptSecurityManager.getSystemPrincipal(),
    null,
    Ci.nsILoadInfo.SEC_ALLOW_CROSS_ORIGIN_SEC_CONTEXT_IS_NULL,
    Ci.nsIContentPolicy.TYPE_OTHER
  );
  const converter = Cc["@mozilla.org/streamConverters;1"]
    .getService(Ci.nsIStreamConverterService)
    .asyncConvertData("message/rfc822", "text/html", listener, channel);
  channel.asyncOpen(converter);
  return listener.promise;
}

// Render a single-part text/plain body, fixed or flowed.
async function render({ body, flowed, sanitize }) {
  const contentType = flowed
    ? "text/plain; charset=UTF-8; format=flowed"
    : "text/plain; charset=UTF-8";
  const raw =
    `From: ${SENDER}\r\n` +
    `To: ${RECIPIENT}\r\n` +
    "Subject: Trailing blank line test\r\n" +
    `Content-Type: ${contentType}\r\n` +
    "\r\n" +
    body;
  return streamMessage(raw, sanitize);
}

// Inner HTML of the body container: the moz-text-flowed <div> for flowed text,
// or the last <pre class="moz-quote-pre"> for fixed text.
function renderedBody(html, flowed) {
  if (flowed) {
    const match = html.match(
      /<div class="moz-text-flowed"[^>]*>([\s\S]*?)<\/div>/
    );
    Assert.ok(match, "rendered HTML must contain a flowed body");
    return match[1];
  }
  const matches = [
    ...html.matchAll(/<pre[^>]*moz-quote-pre[^>]*>([\s\S]*?)<\/pre>/g),
  ];
  Assert.greater(matches.length, 0, "rendered HTML must contain a text body");
  return matches[matches.length - 1][1];
}

// Count the trailing line breaks at the end of the body: "\n" for fixed text,
// <br> for flowed. A body ending mid-line returns 0 either way.
function trailingBreaks(html, flowed) {
  const body = renderedBody(html, flowed);
  if (flowed) {
    const run = body.match(/(?:<br>\s*)+$/);
    return run ? (run[0].match(/<br>/g) || []).length : 0;
  }
  return body.replace(/\r/g, "").match(/\n*$/)[0].length;
}

// The rendered markup between two content lines of the body.
function bodyBetween(html, flowed, before, after) {
  const body = renderedBody(html, flowed);
  const beforeIndex = body.indexOf(before);
  Assert.greaterOrEqual(beforeIndex, 0, `"${before}" is in the body`);
  const start = beforeIndex + before.length;
  const end = body.indexOf(after, start);
  Assert.greater(end, start, `"${before}" precedes "${after}" in the body`);
  return body.slice(start, end);
}

// Count the break markup (<br> flowed, "\n" fixed) between two content lines.
// Adjacent lines give one; each empty line between them adds one more.
function breaksBetween(html, flowed, before, after) {
  const between = bodyBetween(html, flowed, before, after);
  if (flowed) {
    return (between.match(/<br>/g) || []).length;
  }
  return (between.replace(/\r/g, "").match(/\n/g) || []).length;
}

// Count the literal newlines between two content lines, ignoring markup; this
// is the view a textContent reader gets.
function textNewlinesBetween(html, flowed, before, after) {
  const text = bodyBetween(html, flowed, before, after).replace(/<[^>]*>/g, "");
  return (text.replace(/\r/g, "").match(/\n/g) || []).length;
}

const PADDED = "Net pay is ready.\r\n" + "\r\n".repeat(100);
const MID_LINE = "No newline at the end of this body.";
const INTERIOR = "First line.\r\n\r\n\r\nSecond line.\r\n" + "\r\n".repeat(100);

// Several content lines with single- and double-empty-line interior gaps, then
// a long trailing run, mirroring the body shape of an unobtrusive-signature
// message: the interior gaps must survive while only the trailing run goes.
const SIGNED_BODY =
  "First line.\r\n\r\n" +
  "Second line.\r\n\r\n" +
  "Third line.\r\n\r\n\r\n" +
  "Fourth line.\r\n" +
  "\r\n".repeat(100);

// The two-dimensional scenario matrix: every combination of scenario and
// renderer runs as its own task, named test_fixed_<id> and test_flowed_<id>.
const SCENARIOS = [
  {
    id: "trailing_run_collapses",
    body: PADDED,
    sanitize: true,
    content: ["Net pay is ready."],
    check: ({ breaks }) =>
      Assert.equal(
        breaks,
        1,
        "a long trailing run collapses to a single break"
      ),
  },
  {
    id: "mid_line_body_gains_a_break",
    body: MID_LINE,
    sanitize: true,
    content: [MID_LINE],
    check: ({ breaks }) =>
      Assert.equal(
        breaks,
        1,
        "a body that ends mid-line still closes with a single break"
      ),
  },
  {
    id: "interior_blank_lines_kept",
    body: INTERIOR,
    sanitize: true,
    content: ["First line.", "Second line."],
    check: ({ breaks, html, flowed }) => {
      // Two empty lines separate the content lines, so three breaks must
      // remain between them: the collapse must touch only the trailing run.
      Assert.equal(
        breaksBetween(html, flowed, "First line.", "Second line."),
        3,
        "the two interior empty lines are kept"
      );
      // The breaks must survive as literal newlines too, not just <br> markup,
      // or textContent readers lose the interior empty lines.
      Assert.equal(
        textNewlinesBetween(html, flowed, "First line.", "Second line."),
        3,
        "the interior empty lines are kept in textContent"
      );
      Assert.equal(
        breaks,
        1,
        "the trailing run still collapses to a single break"
      );
    },
  },
  {
    id: "pref_off_keeps_the_run",
    body: PADDED,
    sanitize: false,
    content: ["Net pay is ready."],
    check: ({ breaks }) =>
      Assert.greater(
        breaks,
        50,
        "with the pref off the trailing empty lines render unchanged"
      ),
  },
];

for (const flowed of [false, true]) {
  const flavor = flowed ? "flowed" : "fixed";
  for (const scenario of SCENARIOS) {
    const task = async function () {
      const html = await render({
        body: scenario.body,
        flowed,
        sanitize: scenario.sanitize,
      });
      const body = renderedBody(html, flowed);
      for (const text of scenario.content) {
        Assert.stringContains(body, text, "body content is rendered");
      }
      scenario.check({ breaks: trailingBreaks(html, flowed), html, flowed });
    };
    Object.defineProperty(task, "name", {
      value: `test_${flavor}_${scenario.id}`,
    });
    add_task(task);
  }
}

add_task(async function test_trailing_blanks_after_quote_close_the_quote() {
  // Dropping back out of a quote reopens the body, so a couple of breaks are
  // expected; the long run that follows the quote must still be collapsed.
  const html = await render({
    body: "> Quoted line.\r\n" + "\r\n".repeat(100),
    flowed: false,
    sanitize: true,
  });
  Assert.stringContains(
    html,
    "</blockquote>",
    "the quote is closed even though the body ends in empty lines"
  );
  Assert.lessOrEqual(
    trailingBreaks(html, false),
    2,
    "the empty lines after a quote are not rendered as a long run"
  );
});

// Raw multipart/mixed message with a "Sig:" header part, the way Thunderbird
// sends an unobtrusive signature. The signed part is text/plain, fixed or flowed.
function unobtrusiveSignedMessage({ flowed, body }) {
  const boundary = "----=_unobtrusive_signature_boundary";
  const contentType = flowed
    ? "text/plain; charset=UTF-8; format=flowed"
    : "text/plain; charset=UTF-8";
  return (
    `From: ${SENDER}\r\n` +
    `To: ${RECIPIENT}\r\n` +
    "Subject: unobtrusive signed, many trailing CRLF\r\n" +
    "MIME-Version: 1.0\r\n" +
    `Content-Type: multipart/mixed; boundary="${boundary}"\r\n` +
    "\r\n" +
    `--${boundary}\r\n` +
    "Sig: t=p; b=AAAA\r\n" +
    `Content-Type: ${contentType}\r\n` +
    "\r\n" +
    body +
    `--${boundary}--\r\n`
  );
}

for (const flowed of [false, true]) {
  const flavor = flowed ? "flowed" : "fixed";
  const task = async function () {
    // The body renders through the same text/plain path as an unsigned
    // message, so the trailing run must collapse and the interior gaps survive.
    const html = await streamMessage(
      unobtrusiveSignedMessage({ flowed, body: SIGNED_BODY }),
      true
    );
    const body = renderedBody(html, flowed);
    Assert.stringContains(body, "First line.", "the signed body is rendered");
    Assert.stringContains(body, "Fourth line.", "the signed body is rendered");
    Assert.equal(
      breaksBetween(html, flowed, "Third line.", "Fourth line."),
      3,
      "the interior empty lines inside the signed part are kept"
    );
    Assert.equal(
      trailingBreaks(html, flowed),
      1,
      "the trailing run inside the unobtrusive signature collapses to one break"
    );
  };
  Object.defineProperty(task, "name", {
    value: `test_unobtrusive_signature_${flavor}`,
  });
  add_task(task);
}

registerCleanupFunction(() => {
  Services.prefs.clearUserPref("mail.body_sanitize_trailing_blank_lines");
});
