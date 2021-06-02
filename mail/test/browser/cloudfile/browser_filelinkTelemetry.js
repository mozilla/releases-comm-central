/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * Test telemetry related to filelink.
 */

let { TelemetryTestUtils } = ChromeUtils.import(
  "resource://testing-common/TelemetryTestUtils.jsm"
);
let { gMockFilePicker, gMockFilePickReg } = ChromeUtils.import(
  "resource://testing-common/mozmill/AttachmentHelpers.jsm"
);
let { gMockCloudfileManager } = ChromeUtils.import(
  "resource://testing-common/mozmill/CloudfileHelpers.jsm"
);
let {
  add_attachments,
  add_cloud_attachments,
  close_compose_window,
  open_compose_new_mail,
  setup_msg_contents,
} = ChromeUtils.import("resource://testing-common/mozmill/ComposeHelpers.jsm");
let { mc } = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);
let {
  get_notification_button,
  wait_for_notification_to_stop,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/NotificationBoxHelpers.jsm"
);
let { cloudFileAccounts } = ChromeUtils.import(
  "resource:///modules/cloudFileAccounts.jsm"
);

let cloudType = "default";
let kInsertNotificationPref =
  "mail.compose.big_attachments.insert_notification";

let maxSize =
  Services.prefs.getIntPref("mail.compose.big_attachments.threshold_kb") * 1024;

add_task(function setupModule(module) {
  requestLongerTimeout(2);

  gMockCloudfileManager.register(cloudType);
  gMockFilePickReg.register();

  Services.prefs.setBoolPref(kInsertNotificationPref, true);
});

registerCleanupFunction(function teardownModule(module) {
  gMockCloudfileManager.unregister(cloudType);
  gMockFilePickReg.unregister();
  Services.prefs.clearUserPref(kInsertNotificationPref);
});

let kBoxId = "compose-notification-bottom";
let kNotificationValue = "bigAttachment";

/**
 * Check that we're counting file size uploaded.
 */
add_task(async function test_filelink_uploaded_size() {
  Services.telemetry.clearScalars();
  let testFile1Size = 495;
  let testFile2Size = 637;
  let totalSize = testFile1Size + testFile2Size;

  gMockFilePicker.returnFiles = collectFiles([
    "./data/testFile1",
    "./data/testFile2",
  ]);

  let provider = cloudFileAccounts.getProviderForType(cloudType);
  let cwc = open_compose_new_mail(mc);
  let account = cloudFileAccounts.createAccount(cloudType);

  add_cloud_attachments(cwc, account, false);
  gMockCloudfileManager.resolveUploads();
  wait_for_notification_to_stop(cwc, kBoxId, "bigAttachmentUploading");

  let scalars = TelemetryTestUtils.getProcessScalars("parent", true);
  Assert.equal(
    scalars["tb.filelink.uploaded_size"][provider.displayName],
    totalSize,
    "Count of uploaded size must be correct."
  );
  close_compose_window(cwc);
});

/**
 * Check that we're counting filelink suggestion ignored.
 */
add_task(async function test_filelink_ignored() {
  Services.telemetry.clearScalars();

  let cwc = open_compose_new_mail(mc);
  setup_msg_contents(
    cwc,
    "test@example.org",
    "Testing ignoring filelink suggestion",
    "Hello! "
  );

  // Multiple big attachments should be counted as one ignoring.
  add_attachments(cwc, "http://www.example.com/1", maxSize);
  add_attachments(cwc, "http://www.example.com/2", maxSize + 10);
  add_attachments(cwc, "http://www.example.com/3", maxSize - 1);
  let aftersend = BrowserTestUtils.waitForEvent(cwc.window, "aftersend");
  cwc.click(cwc.e("button-send"));
  await aftersend;
  let scalars = TelemetryTestUtils.getProcessScalars("parent");
  Assert.equal(
    scalars["tb.filelink.ignored"],
    1,
    "Count of ignored times must be correct."
  );
  close_compose_window(cwc, true);
  close_compose_window(cwc);
});
