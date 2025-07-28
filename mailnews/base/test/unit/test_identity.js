/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const folderTypes = [
  [
    "fccFolderURI",
    "getOrCreateFccFolder",
    "Sent",
    Ci.nsMsgFolderFlags.SentMail,
  ],
  [
    "draftsFolderURI",
    "getOrCreateDraftsFolder",
    "Drafts",
    Ci.nsMsgFolderFlags.Drafts,
  ],
  [
    "archivesFolderURI",
    "getOrCreateArchivesFolder",
    "Archives",
    Ci.nsMsgFolderFlags.Archive,
  ],
  [
    "templatesFolderURI",
    "getOrCreateTemplatesFolder",
    "Templates",
    Ci.nsMsgFolderFlags.Templates,
  ],
];

/**
 * Tests the UID attribute of identities.
 */
add_task(async function testUID() {
  const UUID_REGEXP =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

  // Create an identity and check it the UID is set when accessed.

  const identityA = MailServices.accounts.createIdentity();
  Assert.stringMatches(
    identityA.UID,
    UUID_REGEXP,
    "identity A's UID should exist and be a UUID"
  );
  Assert.equal(
    Services.prefs.getStringPref(`mail.identity.${identityA.key}.uid`),
    identityA.UID,
    "identity A's UID should be saved to the preferences"
  );
  Assert.throws(
    () => (identityA.UID = "00001111-2222-3333-4444-555566667777"),
    /NS_ERROR_ABORT/,
    "identity A's UID should be unchangeable after it is set"
  );

  // Create a second identity and check the two UIDs don't match.

  const identityB = MailServices.accounts.createIdentity();
  Assert.stringMatches(
    identityB.UID,
    UUID_REGEXP,
    "identity B's UID should exist and be a UUID"
  );
  Assert.equal(
    Services.prefs.getStringPref(`mail.identity.${identityB.key}.uid`),
    identityB.UID,
    "identity B's UID should be saved to the preferences"
  );
  Assert.notEqual(
    identityB.UID,
    identityA.UID,
    "identity B's UID should not be the same as identity A's"
  );

  // Create a third identity and set the UID before it is accessed.

  const identityC = MailServices.accounts.createIdentity();
  identityC.UID = "11112222-3333-4444-5555-666677778888";
  Assert.equal(
    identityC.UID,
    "11112222-3333-4444-5555-666677778888",
    "identity C's UID set correctly"
  );
  Assert.equal(
    Services.prefs.getStringPref(`mail.identity.${identityC.key}.uid`),
    "11112222-3333-4444-5555-666677778888",
    "identity C's UID should be saved to the preferences"
  );
  Assert.throws(
    () => (identityC.UID = "22223333-4444-5555-6666-777788889999"),
    /NS_ERROR_ABORT/,
    "identity C's UID should be unchangeable after it is set"
  );
});

add_task(function testFoldersPOP3() {
  const localAccount = MailServices.accounts.createLocalMailAccount();
  const localRoot = localAccount.incomingServer.rootFolder;

  // Test folders on a POP3 account. Because POP3 is a local account, folders
  // will be created as subfolders of the account's root folder.

  const pop3Account = MailServices.accounts.createAccount();
  const pop3Server = MailServices.accounts.createIncomingServer(
    "mike",
    "pop3.localhost",
    "pop3"
  );
  const pop3Identity = MailServices.accounts.createIdentity();
  const pop3Root = pop3Server.rootFolder;
  pop3Account.incomingServer = pop3Server;
  pop3Account.addIdentity(pop3Identity);

  for (const [attribute, func, name, flag] of folderTypes) {
    info(`Testing ${name} folder on POP3 account`);

    Assert.ok(
      !localRoot.getFolderWithFlags(flag),
      `local folders should start with no ${name} folder`
    );
    Assert.ok(
      !pop3Root.getFolderWithFlags(flag),
      `pop3 server should start with no ${name} folder`
    );
    Assert.equal(
      pop3Identity[attribute],
      null,
      `${attribute} should return no value`
    );

    const folder = pop3Identity[func]();
    Assert.equal(folder.parent?.URI, pop3Root.URI);
    Assert.equal(folder.name, name);
    Assert.equal(folder.flags, flag);
    Assert.equal(folder.URI, `mailbox://mike@pop3.localhost/${name}`);
    Assert.equal(
      pop3Identity[attribute],
      folder.URI,
      `${attribute} should now return the folder's URI`
    );

    // Get the folders again, now that it exists and we've stored the URI,
    // to check getting existing folders works.
    Assert.ok(
      !localRoot.getFolderWithFlags(flag),
      `local folders should still have no ${name} folder`
    );
    Assert.ok(
      pop3Root.getFolderWithFlags(flag),
      `pop3 server should now have a ${name} folder`
    );
    Assert.equal(
      pop3Identity[func](),
      folder,
      `${func} should return the same value as before`
    );
  }

  MailServices.accounts.removeAccount(pop3Account, false);
  MailServices.accounts.removeAccount(localAccount, false);
});

add_task(function testFoldersIMAP() {
  const localAccount = MailServices.accounts.createLocalMailAccount();
  const localRoot = localAccount.incomingServer.rootFolder;

  // Test folders on an IMAP account. Without talking to the server to do
  // folder discovery, we don't know if there are existing folders, so we
  // create them on Local Folders.

  const imapAccount = MailServices.accounts.createAccount();
  const imapServer = MailServices.accounts.createIncomingServer(
    "oscar",
    "imap.localhost",
    "imap"
  );
  const imapIdentity = MailServices.accounts.createIdentity();
  imapAccount.incomingServer = imapServer;
  imapAccount.addIdentity(imapIdentity);
  const imapRoot = imapServer.rootFolder;

  for (const [attribute, func, name, flag] of folderTypes) {
    info(`Testing ${name} folder on IMAP account`);

    Assert.ok(
      !imapRoot.getFolderWithFlags(flag),
      `imap server should start with no ${name} folder`
    );
    Assert.equal(
      imapIdentity[attribute],
      null,
      `${attribute} should return no value`
    );

    const folder = imapIdentity[func]();
    Assert.equal(folder.parent?.URI, localRoot.URI);
    Assert.equal(folder.name, name);
    Assert.equal(folder.flags, flag);
    Assert.equal(folder.URI, `mailbox://nobody@Local%20Folders/${name}`);
    Assert.equal(
      imapIdentity[attribute],
      folder.URI,
      `${attribute} should now return the folder's URI`
    );

    // Get the folders again, now that it exists and we've stored the URI,
    // to check getting existing folders works.
    Assert.ok(
      !imapRoot.getFolderWithFlags(flag),
      `imap server should still have no ${name} folder`
    );
    Assert.equal(
      imapIdentity[func](),
      folder,
      `${func} should return the same value as before`
    );
  }

  MailServices.accounts.removeAccount(imapAccount, false);
  MailServices.accounts.removeAccount(localAccount, false);
});

add_task(function testFoldersPresetCreatesFolders() {
  const localAccount = MailServices.accounts.createLocalMailAccount();
  const localRoot = localAccount.incomingServer.rootFolder;

  // Test folders on a POP3 account. Because POP3 is a local account, folders
  // will be created as subfolders of the account's root folder.

  const pop3Account = MailServices.accounts.createAccount();
  const pop3Server = MailServices.accounts.createIncomingServer(
    "papa",
    "pop3.localhost",
    "pop3"
  );
  const pop3Identity = MailServices.accounts.createIdentity();
  const pop3Root = pop3Server.rootFolder;
  pop3Account.incomingServer = pop3Server;
  pop3Account.addIdentity(pop3Identity);

  pop3Identity.fccFolderURI = "mailbox://nobody@Local%20Folders/Anything";
  pop3Identity.draftsFolderURI = "mailbox://nobody@Local%20Folders/Anything";
  pop3Identity.archivesFolderURI = "mailbox://nobody@Local%20Folders/Anything";
  pop3Identity.templatesFolderURI = "mailbox://nobody@Local%20Folders/Anything";

  for (const [attribute, func, name, flag] of folderTypes) {
    info(`Testing ${name} folder on POP3 account`);

    Assert.ok(
      !localRoot.getFolderWithFlags(flag),
      `local folders should start with no ${name} folder`
    );
    Assert.ok(
      !pop3Root.getFolderWithFlags(flag),
      `pop3 server should start with no ${name} folder`
    );
    Assert.equal(
      pop3Identity[attribute],
      "mailbox://nobody@Local%20Folders/Anything",
      `${attribute} should return the preset value`
    );

    const folder = pop3Identity[func]();
    Assert.equal(folder.parent?.URI, localRoot.URI);
    Assert.equal(folder.name, name);
    Assert.equal(folder.flags, flag);
    Assert.equal(folder.URI, `mailbox://nobody@Local%20Folders/${name}`);
    Assert.equal(
      pop3Identity[attribute],
      folder.URI,
      `${attribute} should now return the folder's URI`
    );

    // Get the folders again, now that it exists and we've stored the URI,
    // to check getting existing folders works.
    Assert.ok(
      localRoot.getFolderWithFlags(flag),
      `local folders should now have a ${name} folder`
    );
    Assert.ok(
      !pop3Root.getFolderWithFlags(flag),
      `pop3 server should still have no ${name} folder`
    );
    Assert.equal(
      pop3Identity[func](),
      folder,
      `${func} should return the same value as before`
    );
  }

  MailServices.accounts.removeAccount(pop3Account, false);
  MailServices.accounts.removeAccount(localAccount, false);
});

add_task(function testFoldersPresetUsesExistingFolders() {
  const localAccount = MailServices.accounts.createLocalMailAccount();
  const localRoot = localAccount.incomingServer.rootFolder;
  localRoot.QueryInterface(Ci.nsIMsgLocalMailFolder);
  const localSubfolder = localRoot.createLocalSubfolder("subfolder");
  localSubfolder.QueryInterface(Ci.nsIMsgLocalMailFolder);
  for (const [, , name, flag] of folderTypes) {
    localSubfolder.createLocalSubfolder(name).setFlag(flag);
  }

  // Test folders on a POP3 account. Because POP3 is a local account, folders
  // will be created as subfolders of the account's root folder.

  const pop3Account = MailServices.accounts.createAccount();
  const pop3Server = MailServices.accounts.createIncomingServer(
    "papa",
    "pop3.localhost",
    "pop3"
  );
  const pop3Identity = MailServices.accounts.createIdentity();
  const pop3Root = pop3Server.rootFolder;
  pop3Account.incomingServer = pop3Server;
  pop3Account.addIdentity(pop3Identity);

  pop3Identity.fccFolderURI = "mailbox://nobody@Local%20Folders/Anything";
  pop3Identity.draftsFolderURI = "mailbox://nobody@Local%20Folders/Anything";
  pop3Identity.archivesFolderURI = "mailbox://nobody@Local%20Folders/Anything";
  pop3Identity.templatesFolderURI = "mailbox://nobody@Local%20Folders/Anything";

  for (const [attribute, func, name, flag] of folderTypes) {
    info(`Testing ${name} folder on POP3 account`);

    Assert.ok(
      localRoot.getFolderWithFlags(flag),
      `local folders should start with a ${name} folder`
    );
    Assert.ok(
      !pop3Root.getFolderWithFlags(flag),
      `pop3 server should start with no ${name} folder`
    );
    Assert.equal(
      pop3Identity[attribute],
      "mailbox://nobody@Local%20Folders/Anything",
      `${attribute} should return the preset value`
    );

    const folder = pop3Identity[func]();
    Assert.equal(folder.parent?.URI, localSubfolder.URI);
    Assert.equal(folder.name, name);
    Assert.equal(folder.flags, flag | Ci.nsMsgFolderFlags.Mail);
    Assert.equal(
      folder.URI,
      `mailbox://nobody@Local%20Folders/subfolder/${name}`
    );
    Assert.equal(
      pop3Identity[attribute],
      folder.URI,
      `${attribute} should now return the folder's URI`
    );

    // Get the folders again, now that it exists and we've stored the URI,
    // to check getting existing folders works.
    Assert.ok(
      localRoot.getFolderWithFlags(flag),
      `local folders should now have a ${name} folder`
    );
    Assert.ok(
      !pop3Root.getFolderWithFlags(flag),
      `pop3 server should still have no ${name} folder`
    );
    Assert.equal(
      pop3Identity[func](),
      folder,
      `${func} should return the same value as before`
    );
  }

  MailServices.accounts.removeAccount(pop3Account, false);
  MailServices.accounts.removeAccount(localAccount, false);
});

/**
 * Tests that changing an identity's special folder removes the flag from the
 * old folder, but only if no other identity is using the folder.
 */
add_task(function testOldFolderFlagIsReset() {
  const localAccount = MailServices.accounts.createLocalMailAccount();
  const localRoot = localAccount.incomingServer.rootFolder;
  localRoot.QueryInterface(Ci.nsIMsgLocalMailFolder);

  const drafts1 = localRoot.createLocalSubfolder("drafts 1");
  const drafts2 = localRoot.createLocalSubfolder("drafts 2");
  Assert.ok(
    !drafts1.getFlag(Ci.nsMsgFolderFlags.Drafts),
    "first folder should start without the flag"
  );
  Assert.ok(
    !drafts2.getFlag(Ci.nsMsgFolderFlags.Drafts),
    "second folder should start without the flag"
  );

  const identity1 = MailServices.accounts.createIdentity();
  localAccount.addIdentity(identity1);
  identity1.draftsFolderURI = drafts1.URI;
  Assert.ok(
    drafts1.getFlag(Ci.nsMsgFolderFlags.Drafts),
    "first folder should now have the flag"
  );
  Assert.ok(
    !drafts2.getFlag(Ci.nsMsgFolderFlags.Drafts),
    "second folder should still not have the flag"
  );

  const identity2 = MailServices.accounts.createIdentity();
  localAccount.addIdentity(identity2);
  identity2.draftsFolderURI = drafts1.URI;
  Assert.ok(
    drafts1.getFlag(Ci.nsMsgFolderFlags.Drafts),
    "first folder should still have the flag"
  );
  Assert.ok(
    !drafts2.getFlag(Ci.nsMsgFolderFlags.Drafts),
    "second folder should still not have the flag"
  );

  identity1.draftsFolderURI = drafts2.URI;
  Assert.ok(
    drafts1.getFlag(Ci.nsMsgFolderFlags.Drafts),
    "first folder should still have the flag"
  );
  Assert.ok(
    drafts2.getFlag(Ci.nsMsgFolderFlags.Drafts),
    "second folder should now have the flag"
  );

  identity2.draftsFolderURI = drafts2.URI;
  Assert.ok(
    !drafts1.getFlag(Ci.nsMsgFolderFlags.Drafts),
    "first folder should have lost the flag"
  );
  Assert.ok(
    drafts2.getFlag(Ci.nsMsgFolderFlags.Drafts),
    "second folder should still have the flag"
  );

  identity1.draftsFolderURI = "";
  Assert.ok(
    drafts2.getFlag(Ci.nsMsgFolderFlags.Drafts),
    "second folder should still have the flag"
  );
  identity2.draftsFolderURI = "";
  Assert.ok(
    !drafts2.getFlag(Ci.nsMsgFolderFlags.Drafts),
    "second folder should have lost the flag"
  );

  MailServices.accounts.removeAccount(localAccount, false);
});
