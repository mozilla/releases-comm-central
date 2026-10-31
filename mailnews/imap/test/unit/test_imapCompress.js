/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Tests IMAP COMPRESS=DEFLATE (RFC 4978). Like Dovecot, the fake server sends
 * an empty deflate block in the same write as the tagged OK to COMPRESS.
 */

const { IMAPServer } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/IMAPServer.sys.mjs"
);

let server, incomingServer;

add_setup(async function () {
  Services.prefs.setBoolPref(
    "mail.server.default.autosync_offline_stores",
    false
  );
  server = new IMAPServer({ extensions: ["RFC2197", "RFC4978"] });
  server.daemon.createMailbox("Archives", { subscribed: true });

  const account = MailServices.accounts.createAccount();
  account.addIdentity(MailServices.accounts.createIdentity());
  incomingServer = MailServices.accounts.createIncomingServer(
    "user",
    "localhost",
    "imap"
  );
  incomingServer.password = "password";
  incomingServer.port = server.port;
  account.incomingServer = incomingServer;

  registerCleanupFunction(() => {
    incomingServer.closeCachedConnections();
    MailServices.accounts.removeAccount(account, false);
  });
});

add_task(async function testDiscoverFolders() {
  const listener = new PromiseTestUtils.PromiseUrlListener();
  MailServices.imap.discoverAllFolders(
    incomingServer.rootFolder,
    listener,
    null
  );
  await listener.promise;

  Assert.ok(
    server.daemon.getConnections().some(handler => handler._compressionActive),
    "the connection should be compressed"
  );
  Assert.ok(
    incomingServer.rootFolder.containsChildNamed("INBOX"),
    "INBOX should have been discovered"
  );
  Assert.ok(
    incomingServer.rootFolder.containsChildNamed("Archives"),
    "Archives should have been discovered"
  );
});

add_task(async function testFetchMessage() {
  // Larger than a deflate stored block and the client's inflate buffer.
  const body = "0123456789abcdef\r\n".repeat(8000);
  await server.addMessages(
    "INBOX",
    [
      "From: Alice <alice@example.com>\r\n" +
        "To: Bob <bob@example.com>\r\n" +
        "Subject: Compressed\r\n" +
        "Message-ID: <compressed@example.com>\r\n" +
        "\r\n" +
        body,
    ],
    false
  );

  const inbox = incomingServer.rootFolder
    .getChildNamed("INBOX")
    .QueryInterface(Ci.nsIMsgImapMailFolder);
  const updateListener = new PromiseTestUtils.PromiseUrlListener();
  inbox.updateFolderWithListener(false, updateListener);
  await updateListener.promise;
  Assert.equal(inbox.getTotalMessages(false), 1, "INBOX should have 1 message");

  const [msg] = [...inbox.messages];
  const uri = inbox.getUriForMsg(msg);
  const streamListener = new PromiseTestUtils.PromiseStreamListener();
  MailServices.messageServiceFromURI(uri).streamMessage(
    uri,
    streamListener,
    null,
    null,
    false,
    "",
    false
  );
  const content = await streamListener.promise;
  Assert.ok(
    content.endsWith(body),
    "the whole message should have been fetched"
  );
});
