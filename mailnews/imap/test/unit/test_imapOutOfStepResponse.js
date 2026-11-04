/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Tests that a connection is dropped once a response doesn't match the
 * command, rather than taking every later response as the answer to the
 * wrong command, and that folder discovery on it doesn't remove folders.
 */

/* import-globals-from ../../../test/resources/alertTestUtils.js */
load("../../../resources/alertTestUtils.js");

const { IMAPServer } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/IMAPServer.sys.mjs"
);
const { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);

const { ID } = IMAP_RFC2197_extension;

let server, incomingServer;

/* exported alertPS to alertTestUtils.js */
function alertPS() {}

add_setup(async function () {
  Services.prefs.setBoolPref(
    "mail.server.default.autosync_offline_stores",
    false
  );
  server = new IMAPServer({ extensions: ["RFC2197"] });
  server.daemon.createMailbox("Archives", { subscribed: true });
  server.daemon.createMailbox("Trash", { subscribed: true });

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
  registerAlertTestUtils();

  registerCleanupFunction(() => {
    IMAP_RFC2197_extension.ID = ID;
    incomingServer.closeCachedConnections();
    MailServices.accounts.removeAccount(account, false);
  });
});

async function discoverFolders() {
  const listener = new PromiseTestUtils.PromiseUrlListener();
  MailServices.imap.discoverAllFolders(
    incomingServer.rootFolder,
    listener,
    null
  );
  try {
    await listener.promise;
    return true;
  } catch (e) {
    return false;
  }
}

add_task(async function testResponseWithWrongTag() {
  Assert.ok(await discoverFolders(), "discovery should succeed");
  Assert.ok(
    incomingServer.rootFolder.containsChildNamed("Archives"),
    "Archives should have been discovered"
  );
  incomingServer.closeCachedConnections();
  await TestUtils.waitForCondition(
    () => !server.daemon.getConnections().length,
    "the cached connection should close"
  );

  // As after a restart, the folder isn't known to exist on the server yet.
  incomingServer.rootFolder
    .getChildNamed("Archives")
    .QueryInterface(Ci.nsIMsgImapMailFolder).verifiedAsOnlineFolder = false;

  // Put the responses one command behind, as happened when stray bytes ended
  // up in front of the response to ID.
  IMAP_RFC2197_extension.ID = function (args) {
    this._reader.send("X1 OK Not the response you're looking for");
    return ID.call(this, args);
  };
  const discovered = await discoverFolders();
  Assert.ok(
    incomingServer.rootFolder.containsChildNamed("Archives"),
    "Archives should not have been removed"
  );
  Assert.ok(!discovered, "discovery should fail");
  await TestUtils.waitForCondition(
    () => !server.daemon.getConnections().length,
    "the connection should have been closed"
  );

  IMAP_RFC2197_extension.ID = ID;
  Assert.ok(await discoverFolders(), "discovery should succeed again");
  Assert.ok(
    incomingServer.rootFolder.containsChildNamed("Archives"),
    "Archives should still be there"
  );
});
