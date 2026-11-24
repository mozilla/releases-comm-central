/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { ServerTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/ServerTestUtils.sys.mjs"
);
const { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);

add_setup(function () {
  localAccountUtils.loadLocalMailAccount();
});

add_task(async function test_localSpamCreation() {
  const server = localAccountUtils.incomingServer;
  const root = server.rootFolder;
  const parent = await root.createSubfolderAsync("Spam parent");
  const name = "Custom spam # ü";
  const uri = `${parent.URI}/${encodeURIComponent(name)}`;
  server.setIntValue(
    "moveTargetMode",
    Ci.nsISpamSettings.MOVE_TARGET_MODE_FOLDER
  );
  server.setStringValue("spamActionTargetFolder", uri);
  server.setBoolValue("moveOnSpam", false);
  const settings = server.spamSettings;
  Assert.equal(settings.spamFolderURI, uri, "Lookup should retain the URI");
  Assert.equal(
    server.getFolderFromURI(uri),
    null,
    "Lookup should leave the missing folder absent"
  );

  let notified = false;
  const listener = {
    folderAdded(addedFolder) {
      if (addedFolder.URI == uri) {
        notified = true;
        Assert.ok(
          addedFolder.getFlag(Ci.nsMsgFolderFlags.Junk),
          "The destination should have its Junk flag when announced"
        );
      }
    },
  };
  MailServices.mfn.addListener(listener, MailServices.mfn.folderAdded);
  registerCleanupFunction(() => MailServices.mfn.removeListener(listener));
  server.setBoolValue("moveOnSpam", true);
  settings.initialize(server);
  Assert.ok(
    notified,
    "Creating the destination should notify folder listeners"
  );
  const folder = server.getFolderFromURI(uri);
  Assert.ok(folder, "Enabling spam moves should create the destination");
  Assert.equal(folder.parent, parent, "The folder should have its real parent");
  Assert.equal(folder.name, name, "Creation should decode the folder name");
  Assert.ok(
    folder.getFlag(Ci.nsMsgFolderFlags.Junk),
    "The created destination should have the Junk flag"
  );

  folder.clearFlag(Ci.nsMsgFolderFlags.Junk);
  settings.initialize(server);
  Assert.ok(
    folder.getFlag(Ci.nsMsgFolderFlags.Junk),
    "An existing destination should regain its Junk flag"
  );
});

add_task(async function test_accountDefaultSpamCase() {
  const server = localAccountUtils.incomingServer;
  const folder =
    await localAccountUtils.rootFolder.createSubfolderAsync("junk");
  server.setIntValue(
    "moveTargetMode",
    Ci.nsISpamSettings.MOVE_TARGET_MODE_ACCOUNT
  );
  server.setStringValue("spamActionTargetAccount", server.rootFolder.URI);
  server.setBoolValue("moveOnSpam", false);
  const settings = server.spamSettings;
  settings.initialize(server);
  Assert.equal(
    settings.spamFolderURI,
    folder.URI,
    "Account-default lookup should retain an existing lower-case spam folder"
  );
  Assert.equal(
    server.getFolderFromURI(`${server.rootFolder.URI}/Junk`),
    null,
    "The general server lookup should remain case-sensitive"
  );
  server.setBoolValue("moveOnSpam", true);
  settings.initialize(server);
  Assert.ok(
    folder.getFlag(Ci.nsMsgFolderFlags.Junk),
    "Enabling spam moves should flag the existing destination"
  );
  Assert.equal(
    server.getFolderFromURI(`${server.rootFolder.URI}/Junk`),
    null,
    "Enabling spam moves should avoid creating a differently cased duplicate"
  );
});

add_task(async function test_imapSpamNamespace() {
  const mockServer = await ServerTestUtils.createServer({
    ...ServerTestUtils.serverDefs.imap.plain,
    options: { extensions: ["RFC2195", "RFC2342", "RFC5258"] },
  });
  const { daemon } = mockServer;
  daemon.inbox.type = 0;
  daemon.inbox.subscribed = true;
  Object.defineProperty(daemon.inbox, "displayName", { value: "INBOX/" });
  daemon.namespaces = [daemon.inbox];
  daemon.createMailbox("INBOX/Bin", { subscribed: true });

  const account = MailServices.accounts.createAccount();
  const server = MailServices.accounts.createIncomingServer(
    "user",
    "localhost",
    "imap"
  );
  server.port = mockServer.port;
  server.password = "password";
  account.incomingServer = server;
  registerCleanupFunction(() => {
    MailServices.accounts.removeAccount(account, false);
    mockServer.close();
  });
  server.performExpand(false);
  await TestUtils.waitForCondition(
    () =>
      server.rootFolder.getChildWithURI(
        `${server.serverURI}/INBOX/Bin`,
        true,
        false
      ),
    "Discovery should find the Trash folder"
  );
  await TestUtils.waitForCondition(
    () => server.QueryInterface(Ci.nsIImapIncomingServer).allConnectionsIdle,
    "Discovery should finish"
  );
  const trash = server.getFolderFromURI(`${server.serverURI}/Bin`);
  Assert.ok(
    trash,
    "Lookup should resolve Trash through the personal namespace"
  );
  server.setStringValue("trash_folder_name", "INBOX/Bin");
  server.deleteModel = Ci.nsMsgImapDeleteModels.MoveToTrash;
  server.deleteModel = Ci.nsMsgImapDeleteModels.IMAPDelete;
  Assert.ok(
    !trash.getFlag(Ci.nsMsgFolderFlags.Trash),
    "Marking deleted messages should clear the Trash flag"
  );
  server.deleteModel = Ci.nsMsgImapDeleteModels.MoveToTrash;
  Assert.ok(
    trash.getFlag(Ci.nsMsgFolderFlags.Trash),
    "Moving deleted messages should restore the Trash flag"
  );

  server.setStringValue("spamActionTargetAccount", server.serverURI);
  server.setIntValue(
    "moveTargetMode",
    Ci.nsISpamSettings.MOVE_TARGET_MODE_ACCOUNT
  );
  server.setBoolValue("moveOnSpam", false);
  const settings = server.spamSettings;
  settings.initialize(server);
  const uri = `${server.serverURI}/INBOX/Junk`;
  Assert.equal(
    settings.spamFolderURI,
    uri,
    "A missing spam destination should use the personal namespace"
  );
  Assert.equal(
    server.getFolderFromURI(uri),
    null,
    "Reading the destination should leave the folder absent"
  );
  Assert.ok(
    !daemon.getMailbox("INBOX/Junk"),
    "Lookup should not create a mailbox"
  );

  server.setBoolValue("moveOnSpam", true);
  settings.initialize(server);
  await TestUtils.waitForCondition(
    () => server.getFolderFromURI(uri)?.getFlag(Ci.nsMsgFolderFlags.Junk),
    "Creation should finish and set the Junk flag"
  );
  const folder = server.getFolderFromURI(uri);
  Assert.equal(
    folder.parent.URI,
    `${server.serverURI}/INBOX`,
    "The created folder should belong to INBOX"
  );
  Assert.equal(
    settings.spamFolderURI,
    folder.URI,
    "Lookup should return the canonical URI after creation"
  );
  Assert.ok(
    daemon.getMailbox("INBOX/Junk"),
    "Creation should create the mailbox"
  );
  await TestUtils.waitForCondition(
    () => server.allConnectionsIdle,
    "Creation should release its connection"
  );
});

add_task(async function test_imapSpamDiscovery() {
  const mockServer = await ServerTestUtils.createServer({
    type: "imap",
    options: { extensions: ["GMAIL", "RFC3348"], username: "spam-discovery" },
  });
  const { daemon } = mockServer;
  daemon.createMailbox("ServerSpam", { flags: ["\\Junk"], subscribed: true });

  const account = MailServices.accounts.createAccount();
  const server = MailServices.accounts.createIncomingServer(
    "spam-discovery",
    "localhost",
    "imap"
  );
  server.port = mockServer.port;
  server.password = "password";
  account.incomingServer = server;
  registerCleanupFunction(() => {
    MailServices.accounts.removeAccount(account, false);
    mockServer.close();
  });

  const folderMode = Ci.nsISpamSettings.MOVE_TARGET_MODE_FOLDER;
  server.setIntValue(
    "moveTargetMode",
    Ci.nsISpamSettings.MOVE_TARGET_MODE_ACCOUNT
  );
  server.setStringValue("spamActionTargetAccount", server.serverURI);
  server.setBoolValue("moveOnSpam", false);
  const settings = server.spamSettings;
  settings.initialize(server);

  const imapServer = server.QueryInterface(Ci.nsIImapIncomingServer);
  const advertisedURI = `${server.serverURI}/ServerSpam`;
  server.performExpand(false);
  await TestUtils.waitForCondition(
    () =>
      settings.spamFolderURI == advertisedURI && imapServer.allConnectionsIdle,
    "Discovery should adopt the advertised Junk folder"
  );
  Assert.equal(
    server.getStringValue("spamActionTargetFolder"),
    advertisedURI,
    "Discovery should persist the advertised destination"
  );
  Assert.equal(
    server.getIntValue("moveTargetMode"),
    folderMode,
    "Discovery should persist the folder destination mode"
  );
  Assert.ok(!daemon.getMailbox("Junk"), "Discovery should not create Junk");

  const localFolder = await localAccountUtils.rootFolder.createSubfolderAsync(
    "Discovery Spam Target"
  );
  server.setStringValue("spamActionTargetFolder", localFolder.URI);
  settings.initialize(server);
  server.performExpand(false);
  await TestUtils.waitForCondition(
    () =>
      localFolder.getFlag(Ci.nsMsgFolderFlags.Junk) &&
      imapServer.allConnectionsIdle,
    "Discovery should flag the configured destination on another account"
  );
  Assert.equal(
    server.getStringValue("spamActionTargetFolder"),
    localFolder.URI,
    "Discovery should preserve the existing configured destination"
  );
});
