/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test that body search bounds how much body text it holds in memory at once,
 * as set by mail.search_max_body_bytes. See bug 2073247.
 */

const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

// Small enough to keep the test messages small, big enough that a marker
// always fits inside one chunk.
const LIMIT = 4096;

/**
 * Build a message with a text/html body holding `earlyMarker` right at the
 * start and `lateMarker` `padding` bytes further in.
 *
 * @param {string} subject
 * @param {number} padding - Bytes of filler between the two markers.
 * @returns {string}
 */
function htmlMessage(subject, padding) {
  const filler = "<p>filler filler filler filler filler filler filler</p>\r\n";
  let body = "<html><body>\r\n<p>earlyMarker</p>\r\n";
  while (body.length < padding) {
    body += filler;
  }
  body += "<p>lateMarker</p>\r\n</body></html>\r\n";

  return (
    "From: sender@test.invalid\r\n" +
    "To: recipient@test.invalid\r\n" +
    `Subject: ${subject}\r\n` +
    `Message-ID: <${subject}@test.invalid>\r\n` +
    "Content-Type: text/html; charset=UTF-8\r\n" +
    "\r\n" +
    body
  );
}

/**
 * Build a quoted-printable message whose body is one endless run of soft line
 * breaks, i.e. a single logical line several times longer than the limit.
 *
 * @param {string} subject
 * @param {number} padding - Bytes of filler between the two markers.
 * @returns {string}
 */
function softBreakMessage(subject, padding) {
  // Every line ends in "=", so the decoded body has no line breaks at all.
  const filler = "fillerfillerfillerfillerfillerfillerfillerfillerfiller=\r\n";
  let body = "earlyMarker=\r\n";
  while (body.length < padding) {
    body += filler;
  }
  body += "lateMarker\r\n";

  return (
    "From: sender@test.invalid\r\n" +
    "To: recipient@test.invalid\r\n" +
    `Subject: ${subject}\r\n` +
    `Message-ID: <${subject}@test.invalid>\r\n` +
    "Content-Type: text/plain; charset=UTF-8\r\n" +
    "Content-Transfer-Encoding: quoted-printable\r\n" +
    "\r\n" +
    body
  );
}

/**
 * Build a message whose whole body is a single line, with no line break
 * between the two markers for the reader to break the body at.
 *
 * @param {string} subject
 * @param {boolean} html - Whether the body is HTML, which the body handler
 *   accumulates, rather than plain text, which it hands over a line at a time.
 * @param {number} padding - Bytes of filler between the two markers.
 * @returns {string}
 */
function singleLineMessage(subject, html, padding) {
  let body = html ? "<html><body><p>earlyMarker</p>" : "earlyMarker";
  while (body.length < padding) {
    body += html ? "<p>filler filler filler</p>" : " filler filler filler";
  }
  body += html ? "<p>lateMarker</p></body></html>\r\n" : " lateMarker\r\n";

  return (
    "From: sender@test.invalid\r\n" +
    "To: recipient@test.invalid\r\n" +
    `Subject: ${subject}\r\n` +
    `Message-ID: <${subject}@test.invalid>\r\n` +
    `Content-Type: text/${html ? "html" : "plain"}; charset=UTF-8\r\n` +
    "\r\n" +
    body
  );
}

/**
 * Run a "body contains" search over the inbox.
 *
 * @param {string} needle
 * @returns {string[]} The subjects of the matching messages.
 */
async function bodySearch(needle) {
  const searchSession = Cc[
    "@mozilla.org/messenger/searchSession;1"
  ].createInstance(Ci.nsIMsgSearchSession);
  searchSession.addScopeTerm(
    Ci.nsMsgSearchScope.offlineMail,
    localAccountUtils.inboxFolder
  );

  const searchTerm = searchSession.createTerm();
  searchTerm.attrib = Ci.nsMsgSearchAttrib.Body;
  const value = searchTerm.value;
  value.attrib = Ci.nsMsgSearchAttrib.Body;
  value.str = needle;
  searchTerm.value = value;
  searchTerm.op = Ci.nsMsgSearchOp.Contains;
  searchTerm.booleanAnd = false;
  searchSession.appendTerm(searchTerm);

  const hits = [];
  const listener = new PromiseTestUtils.PromiseSearchNotify(searchSession, {
    onSearchHit(header) {
      hits.push(header.subject);
    },
  });
  searchSession.search(null);
  await listener.promise;
  return hits.sort();
}

add_setup(function () {
  Services.prefs.setIntPref("mail.search_max_body_bytes", LIMIT);
  localAccountUtils.loadLocalMailAccount();
  const inbox = localAccountUtils.inboxFolder;
  inbox.addMessage(htmlMessage("small html", LIMIT / 2));
  inbox.addMessage(htmlMessage("big html", LIMIT * 3));
  inbox.addMessage(softBreakMessage("big soft break", LIMIT * 3));
  inbox.addMessage(singleLineMessage("big single line html", true, LIMIT * 3));
  inbox.addMessage(singleLineMessage("big single line text", false, LIMIT * 3));
});

add_task(async function testBodyLimit() {
  Assert.deepEqual(
    await bodySearch("earlyMarker"),
    [
      "big html",
      "big single line html",
      "big single line text",
      "big soft break",
      "small html",
    ],
    "text at the start of a body should be found whatever the body's size"
  );

  // An HTML part can only be tag stripped as a whole, so it is accumulated up
  // to the limit and the rest of it goes unsearched. Text held together by
  // soft line breaks is matched in chunks instead, so all of it is searched.
  // A body written as one long line is cut at the limit either way, since
  // there is no line break to chunk it at.
  Assert.deepEqual(
    await bodySearch("lateMarker"),
    ["big soft break", "small html"],
    "text past the limit should be missed, however the body is laid out"
  );
});

registerCleanupFunction(function () {
  Services.prefs.clearUserPref("mail.search_max_body_bytes");
});
