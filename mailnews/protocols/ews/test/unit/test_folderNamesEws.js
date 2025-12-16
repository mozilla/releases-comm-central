/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests folders which should have a localised name that is different from the
 * folder's name, when those folders come from an EWS server.
 */

const { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

add_task(async function () {
  // Get the localized strings. This test should work in any locale, or if you
  // change the string values in messenger.properties/messenger.ftl.

  const bundle = Services.strings.createBundle(
    "chrome://messenger/locale/messenger.properties"
  );
  const inboxFolderName = bundle.GetStringFromName("inboxFolderName");
  const trashFolderName = bundle.GetStringFromName("trashFolderName");
  const sentFolderName = bundle.GetStringFromName("sentFolderName");
  const draftsFolderName = bundle.GetStringFromName("draftsFolderName");
  const archivesFolderName = bundle.GetStringFromName("archivesFolderName");

  const l10n = new Localization(["messenger/messenger.ftl"], true);
  const spamFolderName = l10n.formatValueSync("folder-name-spam");

  const [ewsServer, incomingServer] = setupBasicEwsTestServer({});
  ewsServer.setRemoteFolders(ewsServer.getWellKnownFolders());

  const rootFolder = incomingServer.rootFolder;
  await syncFolder(incomingServer, rootFolder);

  const inboxFolder = rootFolder.getChildNamed("Inbox");
  Assert.ok(inboxFolder.flags & Ci.nsMsgFolderFlags.Inbox);
  Assert.equal(inboxFolder.name, "Inbox");
  Assert.equal(inboxFolder.localizedName, inboxFolderName);

  const sentFolder = rootFolder.getChildNamed("Sent");
  Assert.ok(sentFolder.flags & Ci.nsMsgFolderFlags.SentMail);
  Assert.equal(sentFolder.name, "Sent");
  Assert.equal(sentFolder.localizedName, sentFolderName);

  const draftsFolder = rootFolder.getChildNamed("Drafts");
  Assert.ok(draftsFolder.flags & Ci.nsMsgFolderFlags.Drafts);
  Assert.equal(draftsFolder.name, "Drafts");
  Assert.equal(draftsFolder.localizedName, draftsFolderName);

  const trashFolder = rootFolder.getChildNamed("Deleted Items");
  Assert.ok(trashFolder.flags & Ci.nsMsgFolderFlags.Trash);
  Assert.equal(trashFolder.name, "Deleted Items");
  Assert.equal(trashFolder.localizedName, trashFolderName);

  const spamFolder = rootFolder.getChildNamed("Junk");
  Assert.ok(spamFolder.flags & Ci.nsMsgFolderFlags.Junk);
  Assert.equal(spamFolder.name, "Junk");
  Assert.equal(spamFolder.localizedName, spamFolderName);

  const archivesFolder = rootFolder.getChildNamed("Archives");
  Assert.ok(archivesFolder.flags & Ci.nsMsgFolderFlags.Archive);
  Assert.equal(archivesFolder.name, "Archives");
  Assert.equal(archivesFolder.localizedName, archivesFolderName);
});
