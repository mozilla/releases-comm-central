/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests various special messages.
 */

var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);
var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
var {
  assert_selected_and_displayed,
  be_in_folder,
  create_folder,
  inboxFolder,
  select_click_row,
} = ChromeUtils.importESModule(
  "resource://testing-common/mozmill/FolderDisplayHelpers.sys.mjs"
);

/**
 * Tests that a message containing an invalid vcard can be displayed.
 */
add_task(async function testMarkedAsRead() {
  const folder = await create_folder("SpecialMsgs");
  Services.prefs.setBoolPref("mailnews.mark_message_read.auto", true);

  const file = new FileUtils.File(
    getTestFilePath("data/test-invalid-vcard.eml")
  );
  Assert.ok(file.exists(), "test data file should exist");
  const promiseCopyListener = new PromiseTestUtils.PromiseCopyListener();
  // Copy gIncomingMailFile into the Inbox.
  MailServices.copy.copyFileMessage(
    file,
    folder,
    null,
    false,
    0,
    "",
    promiseCopyListener,
    null
  );
  await promiseCopyListener.promise;
  await be_in_folder(folder);
  const msg = await select_click_row(0);
  await assert_selected_and_displayed(0);
  // Make sure it's the msg we want.
  Assert.equal(msg.subject, "this contains an invalid vcard");
  // The message should get marked as read.
  await BrowserTestUtils.waitForCondition(
    () => msg.isRead,
    "should get marked as read"
  );
  await be_in_folder(inboxFolder);
  folder.deleteSelf(null);
  Services.prefs.clearUserPref("mailnews.mark_message_read.auto");
});
