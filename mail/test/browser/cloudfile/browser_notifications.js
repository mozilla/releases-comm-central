/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that the cloudfile notifications work as they should.
 */

"use strict";

var { select_attachments } = ChromeUtils.importESModule(
  "resource://testing-common/mozmill/AttachmentHelpers.sys.mjs"
);
var { gMockCloudfileManager, MockCloudfileAccount } =
  ChromeUtils.importESModule(
    "resource://testing-common/mozmill/CloudfileHelpers.sys.mjs"
  );
var {
  add_attachments,
  add_cloud_attachments,
  close_compose_window,
  open_compose_new_mail,
  delete_attachment,
} = ChromeUtils.importESModule(
  "resource://testing-common/mozmill/ComposeHelpers.sys.mjs"
);
var {
  assert_notification_displayed,
  close_notification,
  wait_for_notification_to_show,
  wait_for_notification_to_stop,
} = ChromeUtils.importESModule(
  "resource://testing-common/mozmill/NotificationBoxHelpers.sys.mjs"
);
var { gMockPromptService } = ChromeUtils.importESModule(
  "resource://testing-common/mozmill/PromptHelpers.sys.mjs"
);
var { MockFilePicker } = SpecialPowers;

var maxSize, oldInsertNotificationPref;

var kOfferThreshold = "mail.compose.big_attachments.threshold_kb";
var kInsertNotificationPref =
  "mail.compose.big_attachments.insert_notification";

var kBoxId = "compose-notification-bottom";

add_setup(function () {
  requestLongerTimeout(2);

  gMockCloudfileManager.register();
  MockFilePicker.init(window.browsingContext);

  maxSize = Services.prefs.getIntPref(kOfferThreshold, 0) * 1024;
  oldInsertNotificationPref = Services.prefs.getBoolPref(
    kInsertNotificationPref
  );
  Services.prefs.setBoolPref(kInsertNotificationPref, true);
});

registerCleanupFunction(function () {
  gMockCloudfileManager.unregister();
  MockFilePicker.cleanup();
  Services.prefs.setBoolPref(
    kInsertNotificationPref,
    oldInsertNotificationPref
  );
  Services.prefs.setIntPref(kOfferThreshold, maxSize);
});

/**
 * A helper function to assert that the Filelink offer notification is
 * either displayed or not displayed.
 *
 * @param {Window} aWin - The compose window to check.
 * @param {boolean} aDisplayed - True if the notification should be displayed,
 *   false otherwise.
 */
function assert_cloudfile_notification_displayed(aWin, aDisplayed) {
  assert_notification_displayed(aWin, kBoxId, "bigAttachment", aDisplayed);
}

/**
 * A helper function to assert that the Filelink upload notification is
 * either displayed or not displayed.
 *
 * @param {Window} aWin - The compose window to check.
 * @param {boolean} aDisplayed - True if the notification should be displayed,
 *   false otherwise.
 */
function assert_upload_notification_displayed(aWin, aDisplayed) {
  assert_notification_displayed(
    aWin,
    kBoxId,
    "bigAttachmentUploading",
    aDisplayed
  );
}

/**
 * A helper function to assert that the Filelink privacy warning notification
 * is either displayed or not displayed.
 *
 * @param {Window} aWin - The compose window to check.
 * @param {boolean} aDisplayed - True if the notification should be displayed,
 *   false otherwise.
 */
function assert_privacy_warning_notification_displayed(aWin, aDisplayed) {
  assert_notification_displayed(
    aWin,
    kBoxId,
    "bigAttachmentPrivacyWarning",
    aDisplayed
  );
}

/**
 * A helper function to close the Filelink upload notification.
 *
 * @param {Window} aWin - The compose window containing the notification.
 */
function close_upload_notification(aWin) {
  close_notification(aWin, kBoxId, "bigAttachmentUploading");
}

/**
 * A helper function to close the Filelink privacy warning notification.
 *
 * @param {Window} aWin - The compose window containing the notification.
 */
function close_privacy_warning_notification(aWin) {
  close_notification(aWin, kBoxId, "bigAttachmentPrivacyWarning");
}

add_task(async function test_no_notification_for_small_file() {
  const cwc = await open_compose_new_mail(window);
  await add_attachments(cwc, "https://www.example.com/1", 0);
  assert_cloudfile_notification_displayed(cwc, false);

  await add_attachments(cwc, "https://www.example.com/2", 1);
  assert_cloudfile_notification_displayed(cwc, false);

  await add_attachments(cwc, "https://www.example.com/3", 100);
  assert_cloudfile_notification_displayed(cwc, false);

  await add_attachments(cwc, "https://www.example.com/4", 500);
  assert_cloudfile_notification_displayed(cwc, false);

  await close_compose_window(cwc);
});

add_task(async function test_notification_for_big_files() {
  const cwc = await open_compose_new_mail(window);
  await add_attachments(cwc, "https://www.example.com/1", maxSize);
  await wait_for_notification_to_show(cwc, kBoxId, "bigAttachment");

  await add_attachments(cwc, "https://www.example.com/2", maxSize + 1000);
  await wait_for_notification_to_show(cwc, kBoxId, "bigAttachment");

  await add_attachments(cwc, "https://www.example.com/3", maxSize + 10000);
  await wait_for_notification_to_show(cwc, kBoxId, "bigAttachment");

  await add_attachments(cwc, "https://www.example.com/4", maxSize + 100000);
  await wait_for_notification_to_show(cwc, kBoxId, "bigAttachment");

  await close_compose_window(cwc);
});

add_task(async function test_graduate_to_notification() {
  const cwc = await open_compose_new_mail(window);
  await add_attachments(cwc, "https://www.example.com/1", maxSize - 100);
  assert_cloudfile_notification_displayed(cwc, false);

  await add_attachments(cwc, "https://www.example.com/2", maxSize - 25);
  assert_cloudfile_notification_displayed(cwc, false);

  await add_attachments(cwc, "https://www.example.com/3", maxSize);
  await wait_for_notification_to_show(cwc, kBoxId, "bigAttachment");

  await close_compose_window(cwc);
});

add_task(async function test_no_notification_if_disabled() {
  Services.prefs.setBoolPref("mail.cloud_files.enabled", false);
  const cwc = await open_compose_new_mail(window);

  await add_attachments(cwc, "https://www.example.com/1", maxSize);
  assert_cloudfile_notification_displayed(cwc, false);

  await add_attachments(cwc, "https://www.example.com/2", maxSize + 1000);
  assert_cloudfile_notification_displayed(cwc, false);

  await add_attachments(cwc, "https://www.example.com/3", maxSize + 10000);
  assert_cloudfile_notification_displayed(cwc, false);

  await add_attachments(cwc, "https://www.example.com/4", maxSize + 100000);
  assert_cloudfile_notification_displayed(cwc, false);

  await close_compose_window(cwc);
  Services.prefs.setBoolPref("mail.cloud_files.enabled", true);
});

/**
 * Tests that if we upload a single file, we get the link insertion
 * notification bar displayed (unless preffed off).
 */
add_task(async function test_link_insertion_notification_single() {
  MockFilePicker.setFiles(collectFiles(["./data/testFile1"]));
  const provider = new MockCloudfileAccount();
  provider.init("aKey");

  const cwc = await open_compose_new_mail(window);
  await add_cloud_attachments(cwc, provider, false);

  await wait_for_notification_to_show(cwc, kBoxId, "bigAttachmentUploading");
  close_upload_notification(cwc);
  gMockCloudfileManager.resolveUploads();

  Services.prefs.setBoolPref(kInsertNotificationPref, false);
  MockFilePicker.setFiles(collectFiles(["./data/testFile2"]));
  await add_cloud_attachments(cwc, provider, false);

  assert_upload_notification_displayed(cwc, false);
  Services.prefs.setBoolPref(kInsertNotificationPref, true);

  await close_compose_window(cwc);
  gMockCloudfileManager.resolveUploads();
});

/**
 * Tests that if we upload multiple files, we get the link insertion
 * notification bar displayed (unless preffed off).
 */
add_task(async function test_link_insertion_notification_multiple() {
  MockFilePicker.setFiles(
    collectFiles(["./data/testFile1", "./data/testFile2"])
  );
  const provider = new MockCloudfileAccount();
  provider.init("aKey");

  const cwc = await open_compose_new_mail(window);
  await add_cloud_attachments(cwc, provider, false);

  await wait_for_notification_to_show(cwc, kBoxId, "bigAttachmentUploading");
  close_upload_notification(cwc);
  gMockCloudfileManager.resolveUploads();

  Services.prefs.setBoolPref(kInsertNotificationPref, false);
  MockFilePicker.setFiles(
    collectFiles(["./data/testFile3", "./data/testFile4"])
  );
  await add_cloud_attachments(cwc, provider, false);
  assert_upload_notification_displayed(cwc, false);
  Services.prefs.setBoolPref(kInsertNotificationPref, true);

  await close_compose_window(cwc);
  gMockCloudfileManager.resolveUploads();
});

/**
 * Tests that the link insertion notification bar goes away even
 * if we hit an uploading error.
 */
add_task(async function test_link_insertion_goes_away_on_error() {
  gMockPromptService.register();
  gMockPromptService.returnValue = false;
  MockFilePicker.setFiles(
    collectFiles(["./data/testFile1", "./data/testFile2"])
  );
  const provider = new MockCloudfileAccount();
  provider.init("aKey");

  const cwc = await open_compose_new_mail(window);
  await add_cloud_attachments(cwc, provider, false);

  await wait_for_notification_to_show(cwc, kBoxId, "bigAttachmentUploading");
  gMockCloudfileManager.rejectUploads();
  await wait_for_notification_to_stop(cwc, kBoxId, "bigAttachmentUploading");

  await close_compose_window(cwc);
  gMockPromptService.unregister();
});

/**
 * Test that we do not show the Filelink offer notification if we convert
 * a Filelink back into a normal attachment. Also test, that the privacy
 * notification is correctly shown and hidden.
 */
add_task(async function test_no_offer_on_conversion() {
  const kFiles = ["./data/testFile1", "./data/testFile2"];
  // Set the notification threshold to 0 to ensure that we get it.
  Services.prefs.setIntPref(kOfferThreshold, 0);

  // Insert some Filelinks...
  MockFilePicker.setFiles(collectFiles(kFiles));
  const provider = new MockCloudfileAccount();
  provider.init("someKey");

  // Override uploadFile to succeed instantaneously so that we don't have
  // to worry about waiting for the onStopRequest method being called
  // asynchronously.
  provider.uploadFile = function (window, aFile) {
    return Promise.resolve({
      id: 1,
      url: "https://some.cloud.net/1",
      path: aFile.path,
      size: aFile.fileSize,
    });
  };

  const cw = await open_compose_new_mail();
  await add_cloud_attachments(cw, provider, false);

  assert_cloudfile_notification_displayed(cw, false);
  await wait_for_notification_to_show(
    cw,
    kBoxId,
    "bigAttachmentPrivacyWarning"
  );

  // Now convert the file back into a normal attachment
  select_attachments(cw, 0);
  await cw.convertSelectedToRegularAttachment();
  assert_cloudfile_notification_displayed(cw, false);
  await wait_for_notification_to_show(
    cw,
    kBoxId,
    "bigAttachmentPrivacyWarning"
  );

  // Convert also the other file, the privacy notification should no longer
  // be shown as well.
  select_attachments(cw, 1);
  await cw.convertSelectedToRegularAttachment();
  assert_cloudfile_notification_displayed(cw, false);
  assert_privacy_warning_notification_displayed(cw, false);

  await close_compose_window(cw);

  // Now put the old threshold back.
  Services.prefs.setIntPref(kOfferThreshold, maxSize);
});

/**
 * Test that when we kick off an upload via the offer notification, then
 * the upload notification is shown.
 */
add_task(async function test_offer_then_upload_notifications() {
  const kFiles = ["./data/testFile1", "./data/testFile2"];
  // Set the notification threshold to 0 to ensure that we get it.
  Services.prefs.setIntPref(kOfferThreshold, 0);

  // We're going to add attachments to the attachmentbucket, and we'll
  // use the add_attachments helper function to do it.  First, retrieve
  // some file URIs...
  const fileURIs = collectFiles(kFiles).map(
    file => Services.io.newFileURI(file).spec
  );

  // Create our mock provider
  const provider = new MockCloudfileAccount();
  provider.init("someKey");

  // Override uploadFile to succeed instantaneously so that we don't have
  // to worry about waiting for the onStopRequest method being called
  // asynchronously.
  provider.uploadFile = function (window, aFile) {
    return Promise.resolve({
      id: 1,
      url: "https://some.cloud.net/1",
      path: aFile.path,
      size: aFile.fileSize,
    });
  };

  const cw = await open_compose_new_mail();

  // Attach the files, saying that each is 500 bytes large - which should
  // certainly trigger the offer.
  await add_attachments(cw, fileURIs, [500, 500]);
  // Assert that the offer is displayed.
  await wait_for_notification_to_show(cw, kBoxId, "bigAttachment");
  // Select both attachments in the attachmentbucket, and choose to convert
  // them.
  select_attachments(cw, 0, 1);

  // Convert them.
  await cw.convertSelectedToCloudAttachment(provider);

  // The offer should now be gone...
  await Promise.all([
    wait_for_notification_to_stop(cw, kBoxId, "bigAttachment"),
    wait_for_notification_to_show(cw, kBoxId, "bigAttachmentUploading"),
  ]);
  // And the upload notification should be displayed.

  await close_compose_window(cw);

  // Now put the old threshold back.
  Services.prefs.setIntPref(kOfferThreshold, maxSize);
});

/**
 * Test that when we first upload some files, we get the privacy warning
 * message. We should only get this the first time.
 */
add_task(async function test_privacy_warning_notification() {
  gMockPromptService.register();
  gMockPromptService.returnValue = false;
  MockFilePicker.setFiles(
    collectFiles(["./data/testFile1", "./data/testFile2"])
  );
  const provider = new MockCloudfileAccount();
  provider.init("aKey");

  const cwc = await open_compose_new_mail(window);
  await add_cloud_attachments(cwc, provider, false);

  await wait_for_notification_to_show(cwc, kBoxId, "bigAttachmentUploading");
  gMockCloudfileManager.resolveUploads();
  await wait_for_notification_to_stop(cwc, kBoxId, "bigAttachmentUploading");

  // Assert that the warning is displayed.
  await wait_for_notification_to_show(
    cwc,
    kBoxId,
    "bigAttachmentPrivacyWarning"
  );

  // Close the privacy warning notification...
  close_privacy_warning_notification(cwc);

  // And now upload some more files. We shouldn't get the warning again.
  MockFilePicker.setFiles(
    collectFiles(["./data/testFile3", "./data/testFile4"])
  );
  await add_cloud_attachments(cwc, provider, false);
  gMockCloudfileManager.resolveUploads();
  assert_privacy_warning_notification_displayed(cwc, false);

  await close_compose_window(cwc);
  gMockPromptService.unregister();
});

/**
 * Test that when all cloud attachments are removed, the privacy warning will
 * be removed as well.
 */
add_task(async function test_privacy_warning_notification() {
  gMockPromptService.register();
  gMockPromptService.returnValue = false;
  MockFilePicker.setFiles(
    collectFiles(["./data/testFile1", "./data/testFile2"])
  );
  const provider = new MockCloudfileAccount();
  provider.init("aKey");

  const cwc = await open_compose_new_mail(window);
  await add_cloud_attachments(cwc, provider, false);

  await wait_for_notification_to_show(cwc, kBoxId, "bigAttachmentUploading");
  gMockCloudfileManager.resolveUploads();
  await wait_for_notification_to_stop(cwc, kBoxId, "bigAttachmentUploading");

  // Assert that the warning is displayed.
  await wait_for_notification_to_show(
    cwc,
    kBoxId,
    "bigAttachmentPrivacyWarning"
  );

  // Assert that the warning is still displayed, if one attachment is removed.
  delete_attachment(cwc, 1);
  await wait_for_notification_to_show(
    cwc,
    kBoxId,
    "bigAttachmentPrivacyWarning"
  );

  // Assert that the warning is not displayed, after both attachments are removed.
  delete_attachment(cwc, 0);
  assert_privacy_warning_notification_displayed(cwc, false);

  await close_compose_window(cwc);
  gMockPromptService.unregister();
});

/**
 * Test that the privacy warning notification does not persist when closing
 * and re-opening a compose window.
 */
add_task(async function test_privacy_warning_notification_no_persist() {
  gMockPromptService.register();
  gMockPromptService.returnValue = false;
  MockFilePicker.setFiles(
    collectFiles(["./data/testFile1", "./data/testFile2"])
  );
  const provider = new MockCloudfileAccount();
  provider.init("mocktestKey");

  let cwc = await open_compose_new_mail(window);
  await add_cloud_attachments(cwc, provider, false);

  await wait_for_notification_to_show(cwc, kBoxId, "bigAttachmentUploading");
  gMockCloudfileManager.resolveUploads();
  await wait_for_notification_to_stop(cwc, kBoxId, "bigAttachmentUploading");

  // Assert that the warning is displayed.
  await wait_for_notification_to_show(
    cwc,
    kBoxId,
    "bigAttachmentPrivacyWarning"
  );

  // Close the compose window
  await close_compose_window(cwc);

  // Open a new compose window
  cwc = await open_compose_new_mail(window);

  // We shouldn't be displaying the privacy warning.
  assert_privacy_warning_notification_displayed(cwc, false);

  await close_compose_window(cwc);
  gMockPromptService.unregister();
});

/**
 * Test that if we close the privacy warning in a composer, it will still
 * spawn in a new one.
 */
add_task(async function test_privacy_warning_notification_open_after_close() {
  gMockPromptService.register();
  gMockPromptService.returnValue = false;
  MockFilePicker.setFiles(
    collectFiles(["./data/testFile1", "./data/testFile2"])
  );
  const provider = new MockCloudfileAccount();
  provider.init("aKey");

  let cwc = await open_compose_new_mail(window);
  await add_cloud_attachments(cwc, provider, false);

  await wait_for_notification_to_show(cwc, kBoxId, "bigAttachmentUploading");
  gMockCloudfileManager.resolveUploads();
  await wait_for_notification_to_stop(cwc, kBoxId, "bigAttachmentUploading");

  // Assert that the warning is displayed.
  await wait_for_notification_to_show(
    cwc,
    kBoxId,
    "bigAttachmentPrivacyWarning"
  );

  // Close the privacy warning notification...
  close_privacy_warning_notification(cwc);

  await close_compose_window(cwc);

  // Open a new compose window
  cwc = await open_compose_new_mail(window);

  MockFilePicker.setFiles(
    collectFiles(["./data/testFile3", "./data/testFile4"])
  );
  await add_cloud_attachments(cwc, provider, false);

  await wait_for_notification_to_show(cwc, kBoxId, "bigAttachmentUploading");
  gMockCloudfileManager.resolveUploads();
  await wait_for_notification_to_stop(cwc, kBoxId, "bigAttachmentUploading");

  // Assert that the privacy warning notification is displayed again.
  await wait_for_notification_to_show(
    cwc,
    kBoxId,
    "bigAttachmentPrivacyWarning"
  );

  await close_compose_window(cwc);
  gMockPromptService.unregister();

  Assert.report(
    false,
    undefined,
    undefined,
    "Test ran to completion successfully"
  );
});
