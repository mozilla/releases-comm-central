/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that a local account, server, and identity defined in preferences are
 * correctly set up. This is much like test_localServerFromPrefs.js except that
 * the folders already exist in the database when the account manager starts.
 */

add_task(async function () {
  do_get_profile();
  Services.prefs.setStringPref("mail.account.account1.identities", "id1");
  Services.prefs.setStringPref("mail.account.account1.server", "server1");
  Services.prefs.setStringPref("mail.accountmanager.accounts", "account1");
  Services.prefs.setStringPref("mail.identity.id1.fullName", "Test User");
  Services.prefs.setStringPref("mail.identity.id1.useremail", "test@localhost");
  Services.prefs.setStringPref("mail.server.server1.hostname", "Local Folders");
  Services.prefs.setStringPref("mail.server.server1.type", "none");
  Services.prefs.setStringPref("mail.server.server1.userName", "nobody");
  await installDB(`
    INSERT INTO folders (id, parent, name, flags) VALUES
      (1, 0, 'server1', 0),
      (2, 1, 'Trash', 260),
      (3, 1, 'Unsent Messages', 2052);
  `);

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

  const localServer = MailServices.accounts.localFoldersServer;
  Assert.equal(localServer.key, "server1");
  Assert.equal(localServer.hostName, "Local Folders");
  Assert.equal(localServer.type, "none");
  Assert.equal(localServer.username, "nobody");

  const localAccount = MailServices.accounts.findAccountForServer(localServer);
  const localIdentity = localAccount.defaultIdentity;
  Assert.equal(localIdentity.key, "id1");
  Assert.equal(localIdentity.email, "test@localhost");
  Assert.equal(localIdentity.fullName, "Test User");
  Assert.equal(localIdentity.valid, true);

  const localRoot = localServer.rootFolder;
  const localFolders = localRoot.subFolders;
  Assert.equal(localFolders.length, 2);
  Assert.equal(
    localFolders[0].flags,
    Ci.nsMsgFolderFlags.Trash | Ci.nsMsgFolderFlags.Mail
  );
  Assert.equal(localFolders[0].name, "Trash");
  Assert.equal(localFolders[0].localizedName, "Trash");
  Assert.equal(localFolders[0].URI, "mailbox://nobody@Local%20Folders/Trash");
  Assert.equal(
    localFolders[1].flags,
    Ci.nsMsgFolderFlags.Queue | Ci.nsMsgFolderFlags.Mail
  );
  Assert.equal(localFolders[1].name, "Unsent Messages");
  Assert.equal(localFolders[1].localizedName, "Outbox");
  Assert.equal(
    localFolders[1].URI,
    "mailbox://nobody@Local%20Folders/Unsent%20Messages"
  );

  Assert.ok(folderDB.getFolderByPath("server1"));
  Assert.deepEqual(
    folderDB
      .getFolderChildren(folderDB.getFolderByPath("server1"))
      .map(c => folderDB.getFolderName(c)),
    ["Trash", "Unsent Messages"]
  );

  const stmt = database.connectionForTests.createStatement(
    "SELECT name, flags FROM folders ORDER BY name"
  );
  const dbFolders = {};
  while (stmt.executeStep()) {
    dbFolders[stmt.row.name] = stmt.row.flags;
  }
  Assert.deepEqual(dbFolders, {
    server1: 0,
    Trash: Ci.nsMsgFolderFlags.Trash | Ci.nsMsgFolderFlags.Mail,
    "Unsent Messages": Ci.nsMsgFolderFlags.Queue | Ci.nsMsgFolderFlags.Mail,
  });
  stmt.reset();
  stmt.finalize();
});
