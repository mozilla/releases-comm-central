/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Forwarding inline with all headers shown must handle a final header whose
 * value is only whitespace. See bug 2046137.
 */

var { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);

add_task(async function testForwardInlineAllHeadersTrailingWhitespace() {
  localAccountUtils.loadLocalMailAccount();
  const server = setupServerDaemon();
  server.start();
  registerCleanupFunction(() => server.stop());

  const identity = getSmtpIdentity(
    "from@tinderbox.invalid",
    getBasicSmtpServer(server.port)
  );
  localAccountUtils.msgAccount.addIdentity(identity);
  localAccountUtils.msgAccount.defaultIdentity = identity;

  Services.prefs.setIntPref(
    "mail.show_headers",
    Ci.nsMimeHeaderDisplayTypes.AllHeaders
  );
  registerCleanupFunction(() =>
    Services.prefs.clearUserPref("mail.show_headers")
  );

  const messageSource =
    "From: a@b.invalid\r\n" +
    "To: c@d.invalid\r\n" +
    "Subject: whitespace header\r\n" +
    "Message-ID: <whitespace-header@e.invalid>\r\n" +
    "X-Last-Whitespace: \t\r\n" +
    "\r\n" +
    "MIME with invisible box\r\n";
  localAccountUtils.inboxFolder
    .QueryInterface(Ci.nsIMsgLocalMailFolder)
    .addMessage(messageSource);

  MailServices.compose.forwardMessage(
    "to@local.invalid",
    mailTestUtils.firstMsgHdr(localAccountUtils.inboxFolder),
    null,
    localAccountUtils.incomingServer,
    Ci.nsIMsgComposeService.kForwardInline
  );

  await TestUtils.waitForCondition(
    () => server._daemon.post,
    "waiting for forwarded message"
  );

  Assert.ok(
    server._daemon.post.includes("X-Last-Whitespace"),
    "The forwarded message should include the whitespace header"
  );
  Assert.ok(
    server._daemon.post.includes("MIME with invisible box"),
    "The forwarded message should include the original body"
  );
});
