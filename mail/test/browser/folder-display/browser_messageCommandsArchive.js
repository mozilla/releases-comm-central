/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This tests the archive command on messages in the front-end.
 */

"use strict";

var { promise_content_tab_load } = ChromeUtils.importESModule(
  "resource://testing-common/mail/ContentTabHelpers.sys.mjs"
);
var {
  archive_selected_messages,
  assert_selected_and_displayed,
  be_in_folder,
  create_folder,
  empty_folder,
  get_about_3pane,
  get_about_message,
  get_special_folder,
  make_display_unthreaded,
  make_message_sets_in_folders,
  select_click_row,
  select_control_click_row,
  select_shift_click_row,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);
var { click_menus_in_sequence } = ChromeUtils.importESModule(
  "resource://testing-common/mail/WindowHelpers.sys.mjs"
);

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
var { MailUtils } = ChromeUtils.importESModule(
  "resource:///modules/MailUtils.sys.mjs"
);

var archiveSrcFolder, inboxFolder;

// Adjust timeout to take care of code coverage runs needing twice as long.
requestLongerTimeout(AppConstants.MOZ_CODE_COVERAGE ? 2 : 1);

add_setup(async function () {
  archiveSrcFolder = await create_folder("ArchiveSrc");
  inboxFolder = await get_special_folder(
    Ci.nsMsgFolderFlags.Inbox,
    true,
    null,
    true
  );

  // Create messages from 20 different months, which will mean 2 different
  // years as well.
  await make_message_sets_in_folders(
    [archiveSrcFolder],
    [{ count: 20, age_incr: { weeks: 5 } }]
  );
  await make_message_sets_in_folders(
    [inboxFolder],
    [{ count: 40, age_incr: { weeks: 5 } }]
  );
});

function enable_archiving(enabled) {
  Services.prefs.setBoolPref("mail.identity.default.archive_enabled", enabled);
}

add_task(async function test_yearly_archive() {
  await yearly_archive(archiveSrcFolder);
  await yearly_archive(inboxFolder);
});

async function yearly_archive(srcFolder, expectedSubfolderName = "") {
  await be_in_folder(srcFolder);
  await make_display_unthreaded();

  const win = get_about_3pane();
  win.sortController.sortThreadPane("dateCol");
  win.sortController.sortAscending();

  const identity = MailServices.accounts.getFirstIdentityForServer(
    win.gDBView.getMsgHdrAt(0).folder.server
  );
  identity.archiveGranularity = Ci.nsIMsgIdentity.perYearArchiveFolders;
  // We need to get all the info about the messages before we do the archive,
  // because deleting the headers could make extracting values from them fail.
  const firstMsgHdr = win.gDBView.getMsgHdrAt(0);
  const lastMsgHdr = win.gDBView.getMsgHdrAt(12);
  const firstMsgHdrMsgId = firstMsgHdr.messageId;
  const lastMsgHdrMsgId = lastMsgHdr.messageId;
  const firstMsgDate = new Date(firstMsgHdr.date / 1000);
  const firstMsgYear = firstMsgDate.getFullYear().toString();
  const lastMsgDate = new Date(lastMsgHdr.date / 1000);
  const lastMsgYear = lastMsgDate.getFullYear().toString();

  win.threadTree.scrollToIndex(0, true);
  await TestUtils.waitForCondition(
    () => win.threadTree.getRowAtIndex(0),
    "Row 0 scrolled into view"
  );
  await select_click_row(0);
  win.threadTree.scrollToIndex(12, true);
  await TestUtils.waitForCondition(
    () => win.threadTree.getRowAtIndex(12),
    "Row 12 scrolled into view"
  );
  await select_control_click_row(12);

  // Press the archive key. The results should go into two separate years.
  await archive_selected_messages();

  // Figure out where the messages should have gone.
  const archiveRoot = "mailbox://nobody@Local%20Folders/Archives";
  let firstArchiveUri = archiveRoot + "/" + firstMsgYear;
  let lastArchiveUri = archiveRoot + "/" + lastMsgYear;
  firstArchiveUri += expectedSubfolderName;
  lastArchiveUri += expectedSubfolderName;
  const firstArchiveFolder = MailUtils.getOrCreateFolder(firstArchiveUri);
  const lastArchiveFolder = MailUtils.getOrCreateFolder(lastArchiveUri);
  await be_in_folder(firstArchiveFolder);
  Assert.ok(
    win.gDBView.getMsgHdrAt(0).messageId == firstMsgHdrMsgId,
    `Message should have been archived to ${firstArchiveUri}`
  );
  await be_in_folder(lastArchiveFolder);
  Assert.ok(
    win.gDBView.getMsgHdrAt(0).messageId == lastMsgHdrMsgId,
    `Message should have been archived to ${lastArchiveUri}`
  );
  await empty_folder(firstArchiveFolder);
  await empty_folder(lastArchiveFolder);
}

add_task(async function test_monthly_archive() {
  enable_archiving(true);
  await monthly_archive(archiveSrcFolder);
});

async function monthly_archive(srcFolder, expectedSubfolderName = "") {
  await be_in_folder(srcFolder);

  const win = get_about_3pane();
  const identity = MailServices.accounts.getFirstIdentityForServer(
    win.gDBView.getMsgHdrAt(0).folder.server
  );
  identity.archiveGranularity = Ci.nsIMsgIdentity.perMonthArchiveFolders;
  await select_click_row(0);
  await select_control_click_row(1);

  const firstMsgHdr = win.gDBView.getMsgHdrAt(0);
  const lastMsgHdr = win.gDBView.getMsgHdrAt(1);
  const firstMsgHdrMsgId = firstMsgHdr.messageId;
  const lastMsgHdrMsgId = lastMsgHdr.messageId;
  const firstMsgDate = new Date(firstMsgHdr.date / 1000);
  const firstMsgYear = firstMsgDate.getFullYear().toString();
  const firstMonthFolderName =
    firstMsgYear +
    "-" +
    (firstMsgDate.getMonth() + 1).toString().padStart(2, "0");
  const lastMsgDate = new Date(lastMsgHdr.date / 1000);
  const lastMsgYear = lastMsgDate.getFullYear().toString();
  const lastMonthFolderName =
    lastMsgYear +
    "-" +
    (lastMsgDate.getMonth() + 1).toString().padStart(2, "0");

  // Press the archive key. The results should go into two separate months.
  await archive_selected_messages();

  // Figure out where the messages should have gone.
  const archiveRoot = "mailbox://nobody@Local%20Folders/Archives";
  let firstArchiveUri =
    archiveRoot + "/" + firstMsgYear + "/" + firstMonthFolderName;
  let lastArchiveUri =
    archiveRoot + "/" + lastMsgYear + "/" + lastMonthFolderName;
  firstArchiveUri += expectedSubfolderName;
  lastArchiveUri += expectedSubfolderName;
  const firstArchiveFolder = MailUtils.getOrCreateFolder(firstArchiveUri);
  const lastArchiveFolder = MailUtils.getOrCreateFolder(lastArchiveUri);
  await be_in_folder(firstArchiveFolder);
  Assert.ok(
    win.gDBView.getMsgHdrAt(0).messageId == firstMsgHdrMsgId,
    `Message should have been archived to ${firstArchiveUri}`
  );
  await be_in_folder(lastArchiveFolder);
  Assert.ok(
    win.gDBView.getMsgHdrAt(0).messageId == lastMsgHdrMsgId,
    `Message should have been archived to ${lastArchiveUri}`
  );
  await empty_folder(firstArchiveFolder);
  await empty_folder(lastArchiveFolder);
}

add_task(async function test_folder_structure_archiving() {
  enable_archiving(true);
  Services.prefs.setBoolPref(
    "mail.identity.default.archive_keep_folder_structure",
    true
  );
  await monthly_archive(archiveSrcFolder, "/ArchiveSrc");
  await yearly_archive(archiveSrcFolder, "/ArchiveSrc");
  await monthly_archive(inboxFolder);
  await yearly_archive(inboxFolder);
  Services.prefs.setBoolPref(
    "mail.identity.default.archive_recreate_inbox",
    true
  );
  await monthly_archive(inboxFolder, "/Inbox");
  await yearly_archive(inboxFolder, "/Inbox");
});

add_task(async function test_selection_after_archive() {
  const win = get_about_3pane();
  enable_archiving(true);
  await be_in_folder(archiveSrcFolder);
  const identity = MailServices.accounts.getFirstIdentityForServer(
    win.gDBView.getMsgHdrAt(0).folder.server
  );
  identity.archiveGranularity = Ci.nsIMsgIdentity.perMonthArchiveFolders;
  // We had a bug where we would always select the 0th message after an
  // archive, so test that we'll actually select the next remaining message
  // by archiving rows 1 & 2 and verifying that the 3rd message gets selected.
  const hdrToSelect = await select_click_row(3);
  await select_click_row(1);
  await select_control_click_row(2);
  await archive_selected_messages();
  await assert_selected_and_displayed(hdrToSelect);
});

add_task(async function test_disabled_archive() {
  enable_archiving(false);
  await be_in_folder(archiveSrcFolder);

  // test single message
  let current = await select_click_row(0);
  EventUtils.synthesizeKey("a", {});
  await assert_selected_and_displayed(current);

  Assert.ok(
    get_about_message().document.getElementById("hdrArchiveButton").disabled,
    "Archive button should be disabled when archiving is disabled!"
  );

  // test message summaries
  await select_click_row(0);
  current = await select_shift_click_row(2);
  EventUtils.synthesizeKey("a", {});
  await assert_selected_and_displayed(current);

  const multiMsgView = get_about_3pane().multiMessageBrowser;

  Assert.ok(
    multiMsgView.contentDocument.getElementById("hdrArchiveButton").hidden,
    "Multi-message archive button should be disabled when " +
      "archiving is disabled!"
  );

  // test message summaries with "large" selection (see bug 975795)
  const { MessageArchiver } = ChromeUtils.importESModule(
    "resource:///modules/MessageArchiver.sys.mjs"
  );
  MessageArchiver.MAX_COUNT_FOR_CAN_ARCHIVE_CHECK = 1;
  await select_click_row(0);
  current = await select_shift_click_row(2);
  EventUtils.synthesizeKey("a", {});
  await assert_selected_and_displayed(current);
  MessageArchiver.MAX_COUNT_FOR_CAN_ARCHIVE_CHECK = 100;

  Assert.ok(
    multiMsgView.contentDocument.getElementById("hdrArchiveButton").hidden,
    "Multi-message archive button should be disabled when " +
      "archiving is disabled!"
  );
});

registerCleanupFunction(function () {
  // Make sure archiving is enabled at the end
  enable_archiving(true);
  Services.prefs.setBoolPref(
    "mail.identity.default.archive_keep_folder_structure",
    false
  );
  Services.prefs.setBoolPref(
    "mail.identity.default.archive_recreate_inbox",
    false
  );
});
