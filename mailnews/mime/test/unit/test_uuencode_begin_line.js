/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Messages with no Content-Type are handled by MimeUntypedText, which sniffs
 * the body for uuencode "begin" lines. Check that degenerate begin lines do
 * not take the filename parser out of bounds, and that a well-formed one is
 * still recognised.
 */

const { MessageInjection } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageInjection.sys.mjs"
);

const kBodyMarker = "Hello World";

const messageInjection = new MessageInjection({ mode: "local" });

/**
 * Build a message with no Content-Type header, so that libmime routes the body
 * through MimeUntypedText.
 *
 * @param {string[]} bodyLines - Body lines, joined with CRLF.
 * @param {boolean} [trailingCRLF=true] - Whether the last body line is
 *   terminated. An unterminated last line reaches parse_line via parse_eof.
 * @returns {string} The raw message.
 */
function makeUntypedMessage(bodyLines, trailingCRLF = true) {
  const lines = [
    "From: sender@example.invalid",
    "To: recipient@example.invalid",
    "Subject: uuencode begin line",
    "",
    kBodyMarker,
    ...bodyLines,
  ];
  return lines.join("\r\n") + (trailingCRLF ? "\r\n" : "");
}

async function streamMessage(message) {
  const folder = await messageInjection.makeEmptyFolder();
  folder.QueryInterface(Ci.nsIMsgLocalMailFolder);
  folder.addMessage(message);

  const msgHdr = [...folder.messages][0];
  const msgURI = folder.getUriForMsg(msgHdr);
  const msgService = MailServices.messageServiceFromURI(msgURI);
  const streamListener = new PromiseTestUtils.PromiseStreamListener();

  msgService.streamMessage(
    msgURI,
    streamListener,
    null,
    null,
    true,
    "filter",
    false
  );

  return streamListener.promise;
}

/**
 * Stream a message and check it renders, which it cannot do if libmime
 * crashed or aborted part way through.
 *
 * @param {string[]} bodyLines - Body lines, joined with CRLF.
 * @param {string} description - What the fixture is, for assertion messages.
 * @param {boolean} [trailingCRLF=true] - See makeUntypedMessage().
 * @returns {string} The streamed output.
 */
async function assertStreamsCleanly(bodyLines, description, trailingCRLF) {
  const streamedData = await streamMessage(
    makeUntypedMessage(bodyLines, trailingCRLF)
  );

  Assert.ok(
    streamedData.includes(kBodyMarker),
    `${description} should stream to completion and render the body`
  );

  return streamedData;
}

add_task(async function test_empty_filename() {
  await assertStreamsCleanly(["begin 644 ", "end"], "an empty filename");
});

add_task(async function test_whitespace_only_filename() {
  await assertStreamsCleanly(
    ["begin 644    ", "end"],
    "a whitespace-only filename"
  );
});

add_task(async function test_four_digit_mode_empty_filename() {
  await assertStreamsCleanly(
    ["begin 0644 ", "end"],
    "a four-digit mode with an empty filename"
  );
});

add_task(async function test_unterminated_begin_line() {
  await assertStreamsCleanly(
    ["begin 644 "],
    "an unterminated begin line",
    false
  );
});

add_task(async function test_truncated_begin_line() {
  await assertStreamsCleanly(["begin 64"], "a truncated begin line");
});

add_task(async function test_well_formed_begin_line_is_consumed() {
  const streamedData = await assertStreamsCleanly(
    ["begin 644 attachment.txt", "`", "end"],
    "a well-formed begin line"
  );

  Assert.ok(
    !streamedData.includes("begin 644 attachment.txt"),
    "a well-formed begin line should open a uuencode part rather than render as body text"
  );
});
