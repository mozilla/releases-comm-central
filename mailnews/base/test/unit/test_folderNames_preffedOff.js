/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests local folders which should have a localised name that is different
 * from the folder's name.
 *
 * This version of the test runs with mail.useLocalizedFolderNames set to false.
 * It's the same as the version with the pref set to true, as the pref has no
 * effect on local folders.
 */

add_task(function () {
  // Get the localized strings. This test should work in any locale, or if you
  // change the string values in messenger.properties/messenger.ftl.

  const bundle = Services.strings.createBundle(
    "chrome://messenger/locale/messenger.properties"
  );
  const inboxFolderName = bundle.GetStringFromName("inboxFolderName");
  const trashFolderName = bundle.GetStringFromName("trashFolderName");
  const sentFolderName = bundle.GetStringFromName("sentFolderName");
  const draftsFolderName = bundle.GetStringFromName("draftsFolderName");
  const templatesFolderName = bundle.GetStringFromName("templatesFolderName");
  const outboxFolderName = bundle.GetStringFromName("outboxFolderName");
  const archivesFolderName = bundle.GetStringFromName("archivesFolderName");

  const l10n = new Localization(["messenger/messenger.ftl"], true);
  const spamFolderName = l10n.formatValueSync("folder-name-spam");

  Cc["@mozilla.org/msgFolder/msgFolderService;1"]
    .getService(Ci.nsIMsgFolderService)
    .initializeFolderStrings();

  const panorama = Services.prefs.getBoolPref("mail.panorama.enabled", false);
  const account = MailServices.accounts.createLocalMailAccount();

  const rootFolder = account.incomingServer.rootFolder;
  rootFolder.QueryInterface(Ci.nsIMsgLocalMailFolder);
  Assert.equal(rootFolder.name, "Local Folders");
  Assert.equal(rootFolder.localizedName, "Local Folders");

  const inboxFolder = rootFolder.createLocalSubfolder("Inbox");
  inboxFolder.setFlag(Ci.nsMsgFolderFlags.Inbox);
  Assert.equal(inboxFolder.name, "Inbox");
  Assert.equal(inboxFolder.localizedName, inboxFolderName);
  Assert.equal(
    inboxFolder.msgDatabase.dBFolderInfo.folderName,
    panorama ? "Inbox" : ""
  );

  // Normal sent mail folder as created by us.
  const sentFolder1 = rootFolder.createLocalSubfolder("Sent");
  sentFolder1.setFlag(Ci.nsMsgFolderFlags.SentMail);
  Assert.equal(sentFolder1.name, "Sent");
  Assert.equal(sentFolder1.localizedName, sentFolderName);
  Assert.equal(
    sentFolder1.msgDatabase.dBFolderInfo.folderName,
    panorama ? "Sent" : ""
  );

  const sentFolder2 = rootFolder.createLocalSubfolder("Sent Mail");
  sentFolder2.setFlag(Ci.nsMsgFolderFlags.SentMail);
  Assert.equal(sentFolder2.name, "Sent Mail");
  Assert.equal(sentFolder2.localizedName, "Sent Mail");

  const sentFolder3 = rootFolder.createLocalSubfolder("Outbox");
  sentFolder3.setFlag(Ci.nsMsgFolderFlags.SentMail);
  Assert.equal(sentFolder3.name, "Outbox");
  Assert.equal(sentFolder3.localizedName, "Outbox");

  // Normal drafts folder as created by us, but with weird capitalisation to
  // prove it works. The case is "corrected" by nsMsgDBFolder::AddSubfolder.
  const draftsFolder1 = rootFolder.createLocalSubfolder("drAfTs");
  draftsFolder1.setFlag(Ci.nsMsgFolderFlags.Drafts);
  Assert.equal(draftsFolder1.name, "Drafts");
  Assert.equal(draftsFolder1.localizedName, draftsFolderName);
  Assert.equal(
    draftsFolder1.msgDatabase.dBFolderInfo.folderName,
    panorama ? "Drafts" : ""
  );

  const draftsFolder2 = rootFolder.createLocalSubfolder("Draft");
  draftsFolder2.setFlag(Ci.nsMsgFolderFlags.Drafts);
  Assert.equal(draftsFolder2.name, "Draft");
  Assert.equal(draftsFolder2.localizedName, "Draft");
  Assert.equal(
    draftsFolder2.msgDatabase.dBFolderInfo.folderName,
    panorama ? "Draft" : ""
  );

  const templatesFolder = rootFolder.createLocalSubfolder("Templates");
  templatesFolder.setFlag(Ci.nsMsgFolderFlags.Templates);
  Assert.equal(templatesFolder.name, "Templates");
  Assert.equal(templatesFolder.localizedName, templatesFolderName);
  Assert.equal(
    templatesFolder.msgDatabase.dBFolderInfo.folderName,
    panorama ? "Templates" : ""
  );

  const trashFolder1 = rootFolder.getChildNamed("Trash");
  Assert.equal(trashFolder1.name, "Trash");
  Assert.equal(trashFolder1.localizedName, trashFolderName);
  Assert.equal(
    trashFolder1.msgDatabase.dBFolderInfo.folderName,
    panorama ? "Trash" : ""
  );

  const trashFolder2 = rootFolder.createLocalSubfolder("Bin");
  trashFolder2.setFlag(Ci.nsMsgFolderFlags.Trash);
  Assert.equal(trashFolder2.name, "Bin");
  Assert.equal(trashFolder2.localizedName, "Bin");
  Assert.equal(
    trashFolder2.msgDatabase.dBFolderInfo.folderName,
    panorama ? "Bin" : ""
  );

  const trashFolder3 = rootFolder.createLocalSubfolder("Deleted");
  trashFolder3.setFlag(Ci.nsMsgFolderFlags.Trash);
  Assert.equal(trashFolder3.name, "Deleted");
  Assert.equal(trashFolder3.localizedName, "Deleted");
  Assert.equal(
    trashFolder3.msgDatabase.dBFolderInfo.folderName,
    panorama ? "Deleted" : ""
  );

  const outboxFolder = rootFolder.getChildNamed("Unsent Messages");
  outboxFolder.setFlag(Ci.nsMsgFolderFlags.Queue);
  Assert.equal(outboxFolder.name, "Unsent Messages");
  Assert.equal(outboxFolder.localizedName, outboxFolderName);
  Assert.equal(
    outboxFolder.msgDatabase.dBFolderInfo.folderName,
    panorama ? "Unsent Messages" : ""
  );

  const junkFolder = rootFolder.createLocalSubfolder("Junk");
  junkFolder.setFlag(Ci.nsMsgFolderFlags.Junk);
  Assert.equal(junkFolder.name, "Junk");
  Assert.equal(junkFolder.localizedName, spamFolderName);
  Assert.equal(
    junkFolder.msgDatabase.dBFolderInfo.folderName,
    panorama ? "Junk" : ""
  );

  const archivesFolder1 = rootFolder.createLocalSubfolder("Archives");
  archivesFolder1.setFlag(Ci.nsMsgFolderFlags.Archive);
  Assert.equal(archivesFolder1.name, "Archives");
  Assert.equal(archivesFolder1.localizedName, archivesFolderName);
  Assert.equal(
    archivesFolder1.msgDatabase.dBFolderInfo.folderName,
    panorama ? "Archives" : ""
  );

  const archivesFolder2 = rootFolder.createLocalSubfolder("Archive");
  archivesFolder2.setFlag(Ci.nsMsgFolderFlags.Archive);
  Assert.equal(archivesFolder2.name, "Archive");
  Assert.equal(archivesFolder2.localizedName, "Archive");
  Assert.equal(
    archivesFolder2.msgDatabase.dBFolderInfo.folderName,
    panorama ? "Archive" : ""
  );
});
