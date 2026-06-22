/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { NetUtil } = ChromeUtils.importESModule(
  "resource://gre/modules/NetUtil.sys.mjs"
);
var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

const [daemon, server] = setupServerDaemon();
server.start();
registerCleanupFunction(() => {
  server.stop();
});

/**
 * Helper to get a message header from the inbox folder.
 *
 * @param {nsIMsgLocalMailFolder} inbox
 * @param {number} [expectedCount=1] - Expected message count.
 * @returns {nsIMsgDBHdr}
 */
function getMsgHdr(inbox, expectedCount = 1) {
  const messages = [...inbox.messages];
  Assert.equal(
    messages.length,
    expectedCount,
    `Should have exactly ${expectedCount} message(s)`
  );
  return messages[0];
}

/**
 * Helper to find a message by flags (with or without Partial flag).
 *
 * @param {nsIMsgLocalMailFolder} inbox
 * @param {boolean} partial - If true, find message with Partial flag; if false,
 *   find message without.
 * @returns {nsIMsgDBHdr|null}
 */
function findMsgHdrByPartialFlag(inbox, partial) {
  for (const msgHdr of inbox.messages) {
    const hasPartial = !!(msgHdr.flags & Ci.nsMsgMessageFlags.Partial);
    if (hasPartial === partial) {
      return msgHdr;
    }
  }
  return null;
}

/**
 * Helper to read the full raw content of a message from the folder.
 */
async function readMessageContent(msgHdr) {
  const msgURI = msgHdr.folder.getUriForMsg(msgHdr);
  const streamListener = new PromiseTestUtils.PromiseStreamListener();
  MailServices.messageServiceFromURI(msgURI).streamMessage(
    msgURI,
    streamListener,
    null,
    null,
    false,
    "",
    false
  );
  return streamListener.promise;
}

/**
 * Helper to stream a message through the MIME converter and get HTML output.
 *
 * This goes through the same path as the message pane: message/rfc822 → text/html.
 *
 * @param {string} msgUri - The message URI.
 * @returns {Promise<string>} The HTML output.
 */
async function getMimeHtmlOutput(msgUri) {
  const url = MailServices.messageServiceFromURI(msgUri).getUrlForUri(msgUri);
  const channel = Services.io.newChannelFromURI(
    url,
    null,
    Services.scriptSecurityManager.getSystemPrincipal(),
    null,
    Ci.nsILoadInfo.SEC_ALLOW_CROSS_ORIGIN_SEC_CONTEXT_IS_NULL,
    Ci.nsIContentPolicy.TYPE_OTHER
  );

  const listener = new PromiseTestUtils.PromiseStreamListener();
  const converter = Cc["@mozilla.org/streamConverters;1"]
    .getService(Ci.nsIStreamConverterService)
    .asyncConvertData("message/rfc822", "text/html", listener, channel);

  channel.asyncOpen(converter);
  return listener.promise;
}

/**
 * Test Pop3Channel can download a partial message correctly.
 * Verifies:
 *  1. After headers-only fetch, the message has the Partial flag set.
 *  2. The full message can be downloaded via Pop3Channel.
 *  3. After full download, the Partial flag is cleared.
 *  4. The full message content is correct.
 */
add_task(async function test_fetchPartialMessage() {
  // Set up a test message.
  daemon.setMessages(["message1.eml"]);

  // Read the expected full message content from disk.
  const expectRaw = await IOUtils.readUTF8(
    PathUtils.join(do_get_cwd().path, "data", "message1.eml")
  );

  // Set up the incoming server to fetch headers only.
  const incomingServer = createPop3ServerAndLocalFolders(server.port);
  incomingServer
    .QueryInterface(Ci.nsILocalMailIncomingServer)
    .createDefaultMailboxes();
  incomingServer.headersOnly = true;

  // Use GetNewMail to fetch the headers into the Inbox. Use the same method
  // as Pop3Channel to find the Inbox (getFolderWithFlags) to ensure we're
  // targeting the same folder that Pop3Channel will use for the download.
  const urlListener = new PromiseTestUtils.PromiseUrlListener();
  const inbox = incomingServer.rootMsgFolder.getFolderWithFlags(
    Ci.nsMsgFolderFlags.Inbox
  );
  MailServices.pop3.GetNewMail(
    null,
    urlListener,
    localAccountUtils.inboxFolder,
    incomingServer
  );
  await urlListener.promise;

  // Check TOP is correctly sent.
  let transaction = server.playTransaction();
  do_check_transaction(transaction, [
    "CAPA",
    "AUTH PLAIN",
    "STAT",
    "LIST",
    "UIDL",
    "TOP 1 0",
  ]);

  // Verify the message has the Partial flag set after headers-only fetch.
  const msgHdr = getMsgHdr(inbox);
  Assert.ok(
    msgHdr.flags & Ci.nsMsgMessageFlags.Partial,
    "Message should have the Partial flag set after headers-only download"
  );

  // Verify that after headers-only fetch, the message body is not complete.
  // The headers-only content should NOT contain the full body.
  const partialRaw = await readMessageContent(msgHdr);
  Assert.ok(
    !partialRaw.includes("test message"),
    "Headers-only content should not contain the full message body"
  );

  // Verify the MIME parser generates correct HTML for the partial message.
  // This is what the message pane would display - it should include the
  // "Not Downloaded" banner and the "Download the rest of the message." link.
  // This would have caught the regression from bug 1927290 (blank message
  // pane) and would also catch regressions in the link URL format from
  // nsPop3URL refactoring.
  const partialMsgUri = msgHdr.folder.getUriForMsg(msgHdr);
  const mimeHtml = await getMimeHtmlOutput(partialMsgUri);
  Assert.ok(
    mimeHtml.includes("Not Downloaded"),
    "MIME output should contain 'Not Downloaded' banner for partial messages"
  );
  Assert.ok(
    mimeHtml.includes("Download the rest of the message"),
    "MIME output should contain the download link text"
  );
  // The link URL must contain "uidl=" for Pop3Channel to parse it correctly.
  Assert.ok(
    mimeHtml.includes("uidl="),
    "MIME output link should contain uidl parameter for Pop3Channel"
  );
  // The link URL should reference the message by number (key) so Pop3Channel
  // can find the correct message in the folder.
  Assert.ok(
    mimeHtml.includes("number="),
    "MIME output link should contain number= parameter"
  );
  // Extract and verify the download link href specifically. The link is the
  // one containing "Download the rest", not the stylesheet etc.
  const dlLinkMatch = mimeHtml.match(
    /href="([^"]*\buidl=[^"]+)"[^>]*>[^<]*Download the rest/
  );
  Assert.ok(dlLinkMatch, "MIME output should contain download link with uidl");
  // Verify the link contains uidl= with a non-empty value.
  const uidlMatch = dlLinkMatch[1].match(/[?&]uidl=([^&]+)/);
  Assert.ok(
    uidlMatch,
    "Link href should contain a uidl= parameter with a value"
  );
  Assert.greater(
    uidlMatch[1].length,
    0,
    "Link href uidl value should not be empty"
  );

  // Now simulate clicking the "Download the rest of the message." link.
  // Use the actual mailbox:// URL from the generated HTML rather than
  // constructing a pop3:// URL directly. This exercises the full path:
  //   mailbox:// URL → nsMailboxService::NewChannel → CreatePop3URI → Pop3Channel
  const streamListener = new PromiseTestUtils.PromiseStreamListener();
  const channel = NetUtil.newChannel({
    uri: dlLinkMatch[1],
    loadingPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
    securityFlags: Ci.nsILoadInfo.SEC_ALLOW_CROSS_ORIGIN_SEC_CONTEXT_IS_NULL,
    contentPolicyType: Ci.nsIContentPolicy.TYPE_OTHER,
  });
  channel.asyncOpen(streamListener);
  await streamListener.promise;

  // Check RETR is correctly sent.
  transaction = server.playTransaction();
  do_check_transaction(transaction, [
    "CAPA",
    "AUTH PLAIN",
    "STAT",
    "LIST",
    "UIDL",
    "RETR 1",
    "DELE 1",
  ]);

  // After a full download via Pop3Channel, there may be two messages in the
  // folder: the original partial one and the newly downloaded full one. The
  // partial message is cleaned up asynchronously (during DELE processing).
  // Find the complete message (without Partial flag).
  const completeMsgHdr = findMsgHdrByPartialFlag(inbox, false);
  Assert.ok(
    completeMsgHdr,
    "Should find a message without the Partial flag after full download"
  );

  // Verify the full message content is now available and matches the original.
  const fullRaw = await readMessageContent(completeMsgHdr);
  // Normalize EOLs for comparison.
  const normalizedExpect = expectRaw.replaceAll(/\r\n/g, "\n");
  let normalizedGot = fullRaw.replaceAll(/\r\n/g, "\n");
  // Strip headers that are added by the mail store (X-Account-Key, X-UIDL,
  // X-Mozilla-Status, X-Mozilla-Status2, X-Mozilla-Keys).
  normalizedGot = normalizedGot.replace(
    /^(?:X-Account-Key|X-UIDL|X-Mozilla-Status2?|X-Mozilla-Keys):.*\n/gm,
    ""
  );
  Assert.equal(
    normalizedGot,
    normalizedExpect,
    "Full message content should match the original after download"
  );
  Assert.ok(
    normalizedGot.includes("test message"),
    "Full message body should be present after download"
  );
});
