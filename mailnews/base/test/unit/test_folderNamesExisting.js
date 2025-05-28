/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests folders which should have a localised name that is different from the
 * folder's name, even if there is a name stored in the folder cache or
 * summary file from an earlier version.
 */

const { ProfileCreator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/ProfileCreator.sys.mjs"
);

let folderCachePath, inboxSummaryPath, draftsSummaryPath;

add_setup(async function () {
  // Set up a profile with an account.

  const profile = new ProfileCreator(do_get_profile());
  const server = profile.addLocalServer();

  // Create the mail files.

  const inbox = await server.rootFolder.addMailFolder("Inbox", {
    summary: do_get_file("data/frenchInbox.msf"),
  });
  inboxSummaryPath = inbox.summaryFilePath;

  const drafts = await server.rootFolder.addMailFolder("Drafts", {
    summary: do_get_file("data/frenchDrafts.msf"),
  });
  draftsSummaryPath = drafts.summaryFilePath;

  // Add the Inbox folder to the folder cache, to check what happens if the
  // name is in the folder cache. Don't add the Drafts folder, to check what
  // happens if the name isn't in the folder cache.

  profile.addFile(
    "folderCache.json",
    JSON.stringify({
      [inboxSummaryPath]: { flags: 0x1004, folderName: "Courrier entrant" },
    })
  );

  folderCachePath = PathUtils.join(profile.path, "folderCache.json");
});

add_task(async function () {
  // Get the localized strings. This test should work in any locale.
  // (Except French, because the names are already in French.)

  const bundle = Services.strings.createBundle(
    "chrome://messenger/locale/messenger.properties"
  );
  const inboxFolderName = bundle.GetStringFromName("inboxFolderName");
  const draftsFolderName = bundle.GetStringFromName("draftsFolderName");

  // Start the account manager.

  Cc["@mozilla.org/msgFolder/msgFolderService;1"]
    .getService(Ci.nsIMsgFolderService)
    .initializeFolderStrings();

  MailServices.accounts.accounts;
  const server = MailServices.accounts.localFoldersServer;
  const rootFolder = server.rootFolder;

  // Check the Inbox folder is correctly localized.

  const inboxFolder = rootFolder.getChildNamed("Inbox");
  Assert.equal(
    inboxFolder.flags,
    Ci.nsMsgFolderFlags.Inbox | Ci.nsMsgFolderFlags.Mail,
    "flags should be loaded from the folder cache"
  );
  Assert.equal(
    inboxFolder.name,
    "Inbox",
    "inbox folder's name should be from the file name"
  );
  Assert.equal(
    inboxFolder.localizedName,
    inboxFolderName,
    "inbox folder's localized name should be localized"
  );
  Assert.notEqual(
    inboxFolder.msgDatabase.dBFolderInfo.folderName,
    inboxFolderName,
    "inbox folder name should not have been updated in the summary file"
  );

  // Check the Drafts folder is correctly localized.

  const draftsFolder = rootFolder.getChildNamed("Drafts");
  Assert.equal(
    draftsFolder.flags,
    Ci.nsMsgFolderFlags.Drafts | Ci.nsMsgFolderFlags.Mail,
    "flags should be loaded from the summary file"
  );
  Assert.equal(
    draftsFolder.name,
    "Drafts",
    "drafts folder's name should be from the file name"
  );
  Assert.equal(
    draftsFolder.localizedName,
    draftsFolderName,
    "drafts folder's localized name should be localized"
  );
  Assert.notEqual(
    draftsFolder.msgDatabase.dBFolderInfo.folderName,
    draftsFolderName,
    "drafts folder name should not have been updated in the summary file"
  );

  // Check that the localised name was not written to the folder cache.

  MailServices.accounts.folderCache.flush();
  const folderCache = await IOUtils.readJSON(folderCachePath);
  Assert.notEqual(
    folderCache[inboxSummaryPath].folderName,
    inboxFolderName,
    "inbox folder name should not have been updated in the folder cache"
  );
  Assert.notEqual(
    folderCache[draftsSummaryPath]?.folderName,
    draftsFolderName,
    "drafts folder name should not have been updated in the folder cache"
  );
});
