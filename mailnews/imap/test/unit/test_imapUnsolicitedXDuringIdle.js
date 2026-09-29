/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test that an unknown untagged X response sent while the connection is
 * idling, when no url is running, is ignored:
 *
 *   * XFOO bar<CR><LF>
 */

const { IMAPServer } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/IMAPServer.sys.mjs"
);
const { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);

let incomingServer;
let server;
let inbox;

async function updateInbox() {
  const listener = new PromiseTestUtils.PromiseUrlListener();
  inbox.updateFolderWithListener(null, listener);
  await listener.promise;
}

add_setup(async function () {
  server = new IMAPServer({ extensions: ["RFC2177"] });

  const account = MailServices.accounts.createAccount();
  account.addIdentity(MailServices.accounts.createIdentity());
  incomingServer = MailServices.accounts.createIncomingServer(
    "user",
    "localhost",
    "imap"
  );
  incomingServer.password = "password";
  incomingServer.port = server.port;
  incomingServer.QueryInterface(Ci.nsIImapIncomingServer).useIdle = true;
  account.incomingServer = incomingServer;

  const listener = new PromiseTestUtils.PromiseUrlListener();
  MailServices.imap.discoverAllFolders(
    incomingServer.rootFolder,
    listener,
    null
  );
  await listener.promise;

  inbox = incomingServer.rootFolder
    .getChildNamed("INBOX")
    .QueryInterface(Ci.nsIMsgImapMailFolder);
  await updateInbox();

  registerCleanupFunction(() => {
    incomingServer.closeCachedConnections();
    MailServices.accounts.removeIncomingServer(incomingServer, false);
  });
});

add_task(async function unsolicitedXResponseWhileIdle() {
  await TestUtils.waitForCondition(
    () => server.daemon.getConnections("INBOX").some(h => h.idling),
    "INBOX connection should enter IDLE"
  );
  await server.addMessages("INBOX", [gMessageGenerator.makeMessage()], false);
  const messageAdded = PromiseTestUtils.promiseFolderNotification(
    inbox,
    "msgAdded"
  );
  Assert.equal(
    server.daemon.sendUnsolicited("INBOX", ["* XFOO bar", "* 1 EXISTS"]),
    1,
    "the idling connection should receive the X response"
  );

  // The message is fetched in response to the EXISTS, so the X response
  // before it was handled while idling.
  await messageAdded;
  Assert.equal(inbox.getTotalMessages(false), 1, "the message should arrive");
});
