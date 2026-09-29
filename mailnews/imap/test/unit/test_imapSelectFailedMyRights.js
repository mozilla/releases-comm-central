/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test that a failed SELECT leaves no mailbox selected, so an unsolicited
 * MYRIGHTS response code sent later on the connection isn't applied to the
 * folder that failed to open.
 */

var server, incomingServer, deniedFolder;
var sendMyRights = false;

add_setup(async function () {
  const daemon = new ImapDaemon();
  daemon.createMailbox("Denied", { subscribed: true });
  server = makeServer(daemon, "", {
    SELECT(args) {
      if (args[0] == "Denied") {
        return "NO [NOPERM] Access denied";
      }
      return IMAP_RFC3501_handler.prototype.SELECT.call(this, args);
    },
    LIST(args) {
      const response = IMAP_RFC3501_handler.prototype.LIST.call(this, args);
      return sendMyRights
        ? "* OK [MYRIGHTS lrswipkxtecda] Rights\0" + response
        : response;
    },
  });

  const account = MailServices.accounts.createAccount();
  incomingServer = account.incomingServer =
    MailServices.accounts.createIncomingServer("user", "localhost", "imap");
  incomingServer.password = "password";
  incomingServer.port = server.port;
  incomingServer.QueryInterface(
    Ci.nsIImapIncomingServer
  ).maximumConnectionsNumber = 1;

  await discoverFolders();
  deniedFolder = incomingServer.rootFolder
    .getChildNamed("Denied")
    .QueryInterface(Ci.nsIMsgImapMailFolder);

  registerCleanupFunction(() => {
    incomingServer.closeCachedConnections();
    MailServices.accounts.removeAccount(account, false);
    server.stop();
  });
});

async function discoverFolders() {
  const listener = new PromiseTestUtils.PromiseUrlListener();
  MailServices.imap.discoverAllFolders(
    incomingServer.rootFolder,
    listener,
    null
  );
  await listener.promise;
}

add_task(async function testMyRightsAfterFailedSelect() {
  const listener = new PromiseTestUtils.PromiseUrlListener();
  deniedFolder.updateFolderWithListener(null, listener);
  await Assert.rejects(listener.promise, /./, "selecting should fail");

  sendMyRights = true;
  await discoverFolders();
  Assert.equal(
    deniedFolder.getPermissionsForUser(""),
    "",
    "rights should not be applied to the folder that failed to open"
  );
});
