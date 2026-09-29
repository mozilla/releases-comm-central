/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test that the rights from a MYRIGHTS response code are applied to the
 * selected folder without the closing bracket:
 *
 *   * OK [MYRIGHTS lrswipkxtecda] Rights<CR><LF>
 */

var server, incomingServer;

add_setup(async function () {
  const daemon = new ImapDaemon();
  server = makeServer(daemon, "", {
    SELECT(args) {
      return (
        "* OK [MYRIGHTS lrswipkxtecda] Rights\0" +
        IMAP_RFC3501_handler.prototype.SELECT.call(this, args)
      );
    },
  });

  const account = MailServices.accounts.createAccount();
  account.addIdentity(MailServices.accounts.createIdentity());
  incomingServer = account.incomingServer =
    MailServices.accounts.createIncomingServer("user", "localhost", "imap");
  incomingServer.password = "password";
  incomingServer.port = server.port;

  const listener = new PromiseTestUtils.PromiseUrlListener();
  MailServices.imap.discoverAllFolders(
    incomingServer.rootFolder,
    listener,
    null
  );
  await listener.promise;

  registerCleanupFunction(() => {
    incomingServer.closeCachedConnections();
    MailServices.accounts.removeAccount(account, false);
    server.stop();
  });
});

add_task(async function testMyRightsResponseCode() {
  const inbox = incomingServer.rootFolder
    .getChildNamed("INBOX")
    .QueryInterface(Ci.nsIMsgImapMailFolder);
  const listener = new PromiseTestUtils.PromiseUrlListener();
  inbox.updateFolderWithListener(null, listener);
  await listener.promise;

  Assert.equal(
    inbox.getPermissionsForUser(""),
    "lrswipkxtecda",
    "the rights should be applied without the closing bracket"
  );
});
