/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that picking an account on the "copies and folders" page sets the
 * right URI to the right property on the identity.
 */

const { click_account_tree_row, get_account_tree_row, open_advanced_settings } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/AccountManagerHelpers.sys.mjs"
  );

let emptyAccount, existingAccount, altNamedAccount, nestedAccount;
let emptyServer, existingServer, altNamedServer, nestedServer;
let identity;

add_setup(function () {
  // An account without folders. Running this test should not create folders.
  emptyAccount = MailServices.accounts.createAccount();
  emptyServer = emptyAccount.incomingServer =
    MailServices.accounts.createIncomingServer("empty", "localhost", "pop3");
  identity = MailServices.accounts.createIdentity();
  emptyAccount.addIdentity(identity);

  // An account with folders that have the built-in names.
  existingAccount = MailServices.accounts.createAccount();
  existingServer = existingAccount.incomingServer =
    MailServices.accounts.createIncomingServer("existing", "localhost", "pop3");
  const existingRoot = existingAccount.incomingServer.rootFolder;
  existingRoot.QueryInterface(Ci.nsIMsgLocalMailFolder);
  existingRoot
    .createLocalSubfolder("Sent")
    .setFlag(Ci.nsMsgFolderFlags.SentMail);
  existingRoot
    .createLocalSubfolder("Archives")
    .setFlag(Ci.nsMsgFolderFlags.Archive);
  existingRoot
    .createLocalSubfolder("Drafts")
    .setFlag(Ci.nsMsgFolderFlags.Drafts);
  existingRoot
    .createLocalSubfolder("Templates")
    .setFlag(Ci.nsMsgFolderFlags.Templates);

  // An account with folders that don't have the built-in names.
  altNamedAccount = MailServices.accounts.createAccount();
  altNamedServer = altNamedAccount.incomingServer =
    MailServices.accounts.createIncomingServer("altNamed", "localhost", "pop3");
  const altNamedRoot = altNamedAccount.incomingServer.rootFolder;
  altNamedRoot.QueryInterface(Ci.nsIMsgLocalMailFolder);
  altNamedRoot
    .createLocalSubfolder("Sent Messages")
    .setFlag(Ci.nsMsgFolderFlags.SentMail);
  altNamedRoot
    .createLocalSubfolder("Archived Messages")
    .setFlag(Ci.nsMsgFolderFlags.Archive);
  altNamedRoot
    .createLocalSubfolder("Draft Messages")
    .setFlag(Ci.nsMsgFolderFlags.Drafts);
  altNamedRoot
    .createLocalSubfolder("Message Templates")
    .setFlag(Ci.nsMsgFolderFlags.Templates);

  // An account with folders that aren't at the top level.
  nestedAccount = MailServices.accounts.createAccount();
  nestedServer = nestedAccount.incomingServer =
    MailServices.accounts.createIncomingServer("nested", "localhost", "pop3");
  const nestedRoot = nestedAccount.incomingServer.rootFolder;
  nestedRoot.QueryInterface(Ci.nsIMsgLocalMailFolder);
  const nestedParent = nestedRoot.createLocalSubfolder("nested");
  nestedParent.QueryInterface(Ci.nsIMsgLocalMailFolder);
  nestedParent
    .createLocalSubfolder("Sent")
    .setFlag(Ci.nsMsgFolderFlags.SentMail);
  nestedParent
    .createLocalSubfolder("Archives")
    .setFlag(Ci.nsMsgFolderFlags.Archive);
  nestedParent
    .createLocalSubfolder("Drafts")
    .setFlag(Ci.nsMsgFolderFlags.Drafts);
  nestedParent
    .createLocalSubfolder("Templates")
    .setFlag(Ci.nsMsgFolderFlags.Templates);
});

registerCleanupFunction(function () {
  MailServices.accounts.removeAccount(emptyAccount, false);
  MailServices.accounts.removeAccount(existingAccount, false);
  MailServices.accounts.removeAccount(altNamedAccount, false);
  MailServices.accounts.removeAccount(nestedAccount, false);
});

add_task(async function testFccFolders() {
  await open_advanced_settings(async tab => {
    await subtest(
      tab,
      "fcc_selectAccount",
      "msgFccAccountPicker",
      `${emptyServer.serverURI}/Sent`,
      `${existingServer.serverURI}/Sent`,
      `${altNamedServer.serverURI}/Sent%20Messages`,
      `${nestedServer.serverURI}/nested/Sent`,
      "fccFolderURI",
      Ci.nsMsgFolderFlags.SentMail
    );
  });
});

add_task(async function testArchiveFolders() {
  await open_advanced_settings(async tab => {
    await subtest(
      tab,
      "archive_selectAccount",
      "msgArchivesAccountPicker",
      `${emptyServer.serverURI}/Archives`,
      `${existingServer.serverURI}/Archives`,
      `${altNamedServer.serverURI}/Archived%20Messages`,
      `${nestedServer.serverURI}/nested/Archives`,
      "archivesFolderURI",
      Ci.nsMsgFolderFlags.Archive
    );
  });
});

add_task(async function testDraftsFolders() {
  await open_advanced_settings(async tab => {
    await subtest(
      tab,
      "draft_selectAccount",
      "msgDraftsAccountPicker",
      `${emptyServer.serverURI}/Drafts`,
      `${existingServer.serverURI}/Drafts`,
      `${altNamedServer.serverURI}/Draft%20Messages`,
      `${nestedServer.serverURI}/nested/Drafts`,
      "draftsFolderURI",
      Ci.nsMsgFolderFlags.Drafts
    );
  });
});

add_task(async function testTemplatesFolders() {
  await open_advanced_settings(async tab => {
    await subtest(
      tab,
      "tmpl_selectAccount",
      "msgTemplatesAccountPicker",
      `${emptyServer.serverURI}/Templates`,
      `${existingServer.serverURI}/Templates`,
      `${altNamedServer.serverURI}/Message%20Templates`,
      `${nestedServer.serverURI}/nested/Templates`,
      "templatesFolderURI",
      Ci.nsMsgFolderFlags.Templates
    );
  });
});

async function subtest(
  tab,
  radioID,
  pickerID,
  emptyURI,
  existingURI,
  altNamedURI,
  nestedURI,
  identityProperty,
  flag
) {
  const accountRow = get_account_tree_row(
    emptyAccount.key,
    "am-copies.xhtml",
    tab
  );
  await click_account_tree_row(tab, accountRow);

  const { contentWindow: win, contentDocument: doc } =
    tab.browser.contentDocument.getElementById("contentFrame");
  const accountRadio = doc.getElementById(radioID);
  const accountPicker = doc.getElementById(pickerID);

  Assert.ok(
    !MailServices.folderLookup.getFolderForURL(emptyURI),
    "the folder should not exist on the empty account"
  );
  const existingFolder = MailServices.folderLookup.getFolderForURL(existingURI);
  const altNamedFolder = MailServices.folderLookup.getFolderForURL(altNamedURI);
  const nestedFolder = MailServices.folderLookup.getFolderForURL(nestedURI);

  EventUtils.synthesizeMouseAtCenter(accountRadio, {}, win);

  await chooseAccount(accountPicker, emptyServer);
  Assert.equal(
    identity[identityProperty],
    emptyURI,
    `${identityProperty} should point to emptyAccount's folder`
  );

  await chooseAccount(accountPicker, existingServer);
  Assert.equal(
    identity[identityProperty],
    existingFolder.URI,
    `${identityProperty} should point to the existingAccount's folder`
  );
  Assert.ok(
    existingFolder.getFlag(flag),
    "existingAccount's folder should have the flag set"
  );

  await chooseAccount(accountPicker, altNamedServer);
  Assert.equal(
    identity[identityProperty],
    altNamedURI,
    `${identityProperty} should point to the altNamedAccount's folder`
  );
  Assert.ok(
    altNamedFolder.getFlag(flag),
    "altNamedAccount's folder should have the flag set"
  );
  Assert.ok(
    !existingFolder.getFlag(flag),
    "existingAccount's folder should have the flag removed"
  );

  await chooseAccount(accountPicker, nestedServer);
  Assert.equal(
    identity[identityProperty],
    nestedURI,
    `${identityProperty} should point to the nestedAccount's folder`
  );
  Assert.ok(
    nestedFolder.getFlag(flag),
    "nestedAccount's folder should have the flag set"
  );
  Assert.ok(
    !altNamedFolder.getFlag(flag),
    "altNamedAccount's folder should have the flag removed"
  );

  await chooseAccount(accountPicker, emptyServer);
  Assert.equal(
    identity[identityProperty],
    emptyURI,
    `${identityProperty} should point to the emptyAccount's folder`
  );
  Assert.ok(
    !nestedFolder.getFlag(flag),
    "nestedAccount's folder should have the flag removed"
  );

  Assert.ok(
    !MailServices.folderLookup.getFolderForURL(emptyURI),
    "the folder should still not exist on the empty account"
  );
}

async function chooseAccount(accountPicker, server) {
  EventUtils.synthesizeMouseAtCenter(
    accountPicker,
    {},
    accountPicker.documentGlobal
  );
  await BrowserTestUtils.waitForPopupEvent(accountPicker.menupopup, "shown");
  accountPicker.menupopup.activateItem(
    accountPicker.menupopup.querySelector(
      `menuitem[label="${server.prettyName}"]`
    )
  );
  await BrowserTestUtils.waitForPopupEvent(accountPicker.menupopup, "hidden");
}
