/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This tests various methods and attributes on nsIMsgAccountManager.
 */
var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

add_task(async function () {
  // Create a couple of test accounts.
  const acc1 = MailServices.accounts.createAccount();
  acc1.incomingServer = MailServices.accounts.createIncomingServer(
    "bob_imap",
    "imap.example.com",
    "imap"
  );
  const id1 = MailServices.accounts.createIdentity();
  id1.email = "bob_imap@example.com";
  acc1.addIdentity(id1);

  const acc2 = MailServices.accounts.createAccount();
  acc2.incomingServer = MailServices.accounts.createIncomingServer(
    "bob_pop3",
    "pop3.EXAMPLE.com.", // note trailing dot
    "pop3"
  );
  const id2 = MailServices.accounts.createIdentity();
  id2.email = "bob_pop3@example.com";
  acc2.addIdentity(id2);

  // Add an identity shared by both accounts.
  const id3 = MailServices.accounts.createIdentity();
  id3.email = "bob_common@example.com";
  acc1.addIdentity(id3);
  acc2.addIdentity(id3);

  // The special "Local Folders" account and server (server type is "none").
  MailServices.accounts.createLocalMailAccount();

  // Setup done. Now check that things are as we expect.

  // At this point we should have 3 accounts and servers (imap, pop, local).
  Assert.equal(
    MailServices.accounts.accounts.length,
    3,
    "should have correct number of accounts"
  );
  Assert.equal(
    MailServices.accounts.allServers.length,
    3,
    "should have correct number of servers"
  );

  // The identities we explicitly created.
  Assert.equal(
    MailServices.accounts.allIdentities.length,
    3,
    "should have correct number of identities"
  );

  // Check we find the right number of identities associated with each server.
  Assert.equal(
    MailServices.accounts.getIdentitiesForServer(acc1.incomingServer).length,
    2,
    "should have correct number identities associated with acc1 server"
  );
  Assert.equal(
    MailServices.accounts.getIdentitiesForServer(acc2.incomingServer).length,
    2,
    "should have correct number identities associated with acc2 server"
  );
  Assert.equal(
    MailServices.accounts.getIdentitiesForServer(
      MailServices.accounts.localFoldersServer
    ).length,
    0,
    "should have correct number identities associated with localFoldersServer"
  );

  // id1 and id2 are on separate accounts (and servers).
  Assert.equal(
    MailServices.accounts.getServersForIdentity(id1).length,
    1,
    "id1 should be for one server"
  );
  Assert.equal(
    MailServices.accounts.getServersForIdentity(id2).length,
    1,
    "id2 should be for one server"
  );
  // id3 is shared.
  Assert.equal(
    MailServices.accounts.getServersForIdentity(id3).length,
    2,
    "id3 should be a shared identity"
  );

  // Does allFolders return the default folders we'd expect?
  // IMAP has Inbox only.
  // POP3 and local accounts both have Inbox and Trash.
  Assert.equal(
    MailServices.accounts.allFolders.length,
    1 + 2 + 2,
    "allFolders should return expected folder count"
  );

  // Let's ditch the IMAP account.
  MailServices.accounts.removeAccount(acc1);

  Assert.equal(MailServices.accounts.accounts.length, 2);
  Assert.equal(MailServices.accounts.allServers.length, 2);

  // It should have taken the imap-specific identity with it.
  Assert.equal(MailServices.accounts.allIdentities.length, 2);

  // Test a special hostname.
  const acc4 = MailServices.accounts.createAccount();
  acc4.incomingServer = MailServices.accounts.createIncomingServer(
    "bob_unavail",
    "0.0.0.0.", // Note ending dot which would not do anything for an IP.
    "pop3"
  );
  const id4 = MailServices.accounts.createIdentity();
  id4.email = "bob_unavail@example.com";
  acc4.addIdentity(id4);

  Assert.equal(
    MailServices.accounts.accounts.length,
    3,
    "acc4 should be in accounts"
  );

  // Test that an account with empty server hostname doesn't even get listed.
  const serverKey = acc4.incomingServer.key;
  Services.prefs.setStringPref(`mail.server.${serverKey}.hostname`, "");
  MailServices.accounts.unloadAccounts();
  MailServices.accounts.loadAccounts();
  Assert.equal(
    MailServices.accounts.accounts.length,
    2,
    "invalid acc4 should have been removed"
  );
  Assert.equal(
    Services.prefs.getCharPref("mail.accountmanager.accounts"),
    "account2,account3",
    "listed accounts should be correct after testing blank host"
  );

  // Test that an account that had punycode hostname entered is found.
  const acc5 = MailServices.accounts.createAccount();
  acc5.incomingServer = MailServices.accounts.createIncomingServer(
    "bob_imap5",
    "xn--thnderbird-beb.test",
    "imap"
  );
  const id5 = MailServices.accounts.createIdentity();
  id5.email = "bob_imap5@xn--thnderbird-beb.test";
  acc5.addIdentity(id5);

  MailServices.accounts.unloadAccounts();
  MailServices.accounts.loadAccounts();

  Assert.equal(
    MailServices.accounts.accounts.length,
    3,
    "added acc5 should still be listed"
  );

  Assert.equal(
    Services.prefs.getCharPref("mail.accountmanager.accounts"),
    "account2,account5,account3",
    "listed accounts should be correct after testing punycode host"
  );
  const punyServer = MailServices.accounts.findServerByURI(
    Services.io.newURI("imap://xn--thnderbird-beb.test:143/INBOX")
  );
  Assert.ok(
    punyServer?.hostName,
    "should find server by uri for punycode hostname"
  );

  const punyServer2 = MailServices.accounts.findServerByURI(
    Services.io.newURI("imap://thünderbird.test:143/INBOX")
  );
  Assert.ok(
    punyServer2?.hostName,
    "should find ACE server by normalized IDN hostname"
  );

  // Test that an account with IDN hostname entered is found.
  const acc6 = MailServices.accounts.createAccount();
  acc6.incomingServer = MailServices.accounts.createIncomingServer(
    "bob_imap6",
    "thünderbird.example",
    "imap"
  );
  const id6 = MailServices.accounts.createIdentity();
  id6.email = "bob_imap6@thünderbird.example";
  acc6.addIdentity(id6);

  MailServices.accounts.unloadAccounts();
  MailServices.accounts.loadAccounts();

  Assert.equal(
    MailServices.accounts.accounts.length,
    4,
    "added acc6 should still be listed"
  );

  Assert.equal(
    Services.prefs.getCharPref("mail.accountmanager.accounts"),
    "account2,account5,account6,account3",
    "listed accounts should be correct after testing IDN host"
  );
  const idnServer = MailServices.accounts.findServerByURI(
    Services.io.newURI("imap://thünderbird.example:143/INBOX")
  );
  Assert.ok(idnServer?.hostName, "should find server by uri for IDN hostname");

  const idnServer2 = MailServices.accounts.findServerByURI(
    Services.io.newURI("imap://xn--thnderbird-beb.example:143/INBOX")
  );
  Assert.ok(
    idnServer2?.hostName,
    "should find idn server by by ACE encodeed uri"
  );

  // Test hostname "2"
  const acc7 = MailServices.accounts.createAccount();
  acc7.incomingServer = MailServices.accounts.createIncomingServer(
    "bob_2",
    "2", // Will be normalized to 0.0.0.2 in URL
    "imap"
  );
  const id7 = MailServices.accounts.createIdentity();
  id7.email = "bob_2@example.com";
  acc7.addIdentity(id7);

  Assert.equal(
    MailServices.accounts.accounts.length,
    5,
    "acc7 should be in accounts"
  );

  const twoServer = MailServices.accounts.findServerByURI(
    Services.io.newURI("imap://2:143/INBOX")
  );
  Assert.ok(twoServer?.hostName, "should find server by uri for hostname '2'");

  const twoServerNorm = MailServices.accounts.findServerByURI(
    Services.io.newURI("imap://0.0.0.2:143/INBOX")
  );
  Assert.ok(
    twoServerNorm?.hostName,
    "should find server by uri for normalized hostname '2'"
  );

  MailServices.accounts.createIncomingServer(
    "nobody",
    "smart mailboxes",
    "none"
  );

  function checkBadHostname(hostname, error = /NS_ERROR_MALFORMED_URI/) {
    Assert.throws(
      () =>
        MailServices.accounts.createIncomingServer("nobody", hostname, "none"),
      error,
      `bad hostname "${hostname}" should fail for "none" type servers`
    );
    Assert.throws(
      () =>
        MailServices.accounts.createIncomingServer("nobody", hostname, "imap"),
      /NS_ERROR_MALFORMED_URI/,
      `bad hostname "${hostname}" should fail for "imap" type servers`
    );
  }

  checkBadHostname(" bad.test ");
  checkBadHostname("b%61d.test");
  checkBadHostname("b/d.test");
  checkBadHostname("b:d.test");
  checkBadHostname("b@d.test");
  checkBadHostname("b d.test");
  // Valid for "none" type, but already exists.
  checkBadHostname("Local Folders", /NS_ERROR_FAILURE/);
  checkBadHostname("Local Folders 2");
  checkBadHostname("Local%20Folders");
  // Valid for "none" type, but already exists.
  checkBadHostname("smart mailboxes", /NS_ERROR_FAILURE/);
  checkBadHostname("smart%20mailboxes");
});
