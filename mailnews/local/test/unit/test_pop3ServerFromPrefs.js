/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that a local account, server, and identity defined in preferences
 * are correctly set up.
 */

add_task(async function () {
  do_get_profile();
  Services.prefs.setStringPref("mail.account.account1.identities", "id1");
  Services.prefs.setStringPref("mail.account.account1.server", "server1");
  Services.prefs.setStringPref("mail.accountmanager.accounts", "account1");
  Services.prefs.setStringPref("mail.identity.id1.fullName", "Test User");
  Services.prefs.setStringPref(
    "mail.identity.id1.useremail",
    "test@test.invalid"
  );
  Services.prefs.setStringPref("mail.server.server1.hostname", "test.invalid");
  Services.prefs.setStringPref("mail.server.server1.type", "pop3");
  Services.prefs.setStringPref("mail.server.server1.userName", "test");

  Assert.deepEqual(
    Array.from(MailServices.accounts.accounts, a => a.key),
    ["account1"]
  );
  Assert.deepEqual(
    Array.from(MailServices.accounts.allServers, s => s.key),
    ["server1"]
  );
  Assert.deepEqual(
    Array.from(MailServices.accounts.allIdentities, i => i.key),
    ["id1"]
  );

  Assert.throws(
    () => MailServices.accounts.localFoldersServer,
    /NS_ERROR_UNEXPECTED/
  );
  const pop3Server = MailServices.accounts.getIncomingServer("server1");
  Assert.equal(pop3Server.key, "server1");
  Assert.equal(pop3Server.hostName, "test.invalid");
  Assert.equal(pop3Server.type, "pop3");
  Assert.equal(pop3Server.username, "test");

  const pop3Account = MailServices.accounts.findAccountForServer(pop3Server);
  const pop3Identity = pop3Account.defaultIdentity;
  Assert.equal(pop3Identity.key, "id1");
  Assert.equal(pop3Identity.email, "test@test.invalid");
  Assert.equal(pop3Identity.fullName, "Test User");
  Assert.equal(pop3Identity.valid, true);

  const pop3Root = pop3Server.rootFolder;
  const pop3Folders = pop3Root.subFolders;
  Assert.equal(pop3Folders.length, 2);
  Assert.equal(
    pop3Folders[0].flags,
    Ci.nsMsgFolderFlags.Inbox | Ci.nsMsgFolderFlags.Mail
  );
  Assert.equal(pop3Folders[0].name, "Inbox");
  Assert.equal(pop3Folders[0].URI, "mailbox://test@test.invalid/Inbox");
  Assert.equal(
    pop3Folders[1].flags,
    Ci.nsMsgFolderFlags.Trash | Ci.nsMsgFolderFlags.Mail
  );
  Assert.equal(pop3Folders[1].name, "Trash");
  Assert.equal(pop3Folders[1].URI, "mailbox://test@test.invalid/Trash");

  if (Services.prefs.getBoolPref("mail.panorama.enabled", false)) {
    const database = Cc["@mozilla.org/mailnews/database-core;1"].getService(
      Ci.nsIDatabaseCore
    );
    Assert.ok(database.folders.getFolderById(1));
    Assert.ok(database.folders.getFolderByPath("server1"));
    Assert.deepEqual(
      database.folders.getFolderByPath("server1").children.map(c => c.name),
      ["Inbox", "Trash"]
    );

    const stmt = database.connection.createStatement(
      "SELECT name, flags FROM folders ORDER BY name"
    );
    const dbFolders = {};
    while (stmt.executeStep()) {
      dbFolders[stmt.row.name] = stmt.row.flags;
    }
    Assert.deepEqual(dbFolders, {
      server1: 0,
      Inbox: Ci.nsMsgFolderFlags.Inbox | Ci.nsMsgFolderFlags.Mail,
      Trash: Ci.nsMsgFolderFlags.Trash | Ci.nsMsgFolderFlags.Mail,
    });
    stmt.reset();
    stmt.finalize();
  }
});
