/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test that a partially downloaded message is discarded once it's no longer
 * on the server. This relies on reading the X-Account-Key and X-UIDL headers
 * back from the stored partial message.
 */

var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

const [daemon, server] = setupServerDaemon();
server.start();
registerCleanupFunction(() => {
  server.stop();
});

async function getNewMail(incomingServer) {
  const urlListener = new PromiseTestUtils.PromiseUrlListener();
  MailServices.pop3.GetNewMail(
    false,
    urlListener,
    localAccountUtils.inboxFolder,
    incomingServer
  );
  await urlListener.promise;
}

add_task(async function test_discardStalePartialMessage() {
  const incomingServer = createPop3ServerAndLocalFolders(server.port);
  incomingServer.headersOnly = true;
  const inbox = localAccountUtils.inboxFolder;

  daemon.setMessages(["message1.eml"]);
  await getNewMail(incomingServer);
  const [partialHdr] = [...inbox.messages];
  Assert.ok(
    partialHdr.flags & Ci.nsMsgMessageFlags.Partial,
    "the first message should be partial"
  );
  const staleMessageId = partialHdr.messageId;

  daemon.setMessages(["message2.eml"]);
  await getNewMail(incomingServer);
  const messageIds = [...inbox.messages].map(hdr => hdr.messageId);
  Assert.ok(
    !messageIds.includes(staleMessageId),
    "the partial message no longer on the server should be discarded"
  );
  Assert.equal(messageIds.length, 1, "only the new message should remain");
});
