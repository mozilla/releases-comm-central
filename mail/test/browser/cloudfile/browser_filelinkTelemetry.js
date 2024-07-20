/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * Test telemetry related to filelink.
 */

const { TelemetryTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TelemetryTestUtils.sys.mjs"
);
const { gMockCloudfileManager } = ChromeUtils.importESModule(
  "resource://testing-common/mail/CloudfileHelpers.sys.mjs"
);
const {
  add_attachments,
  add_cloud_attachments,
  close_compose_window,
  open_compose_new_mail,
  setup_msg_contents,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/ComposeHelpers.sys.mjs"
);
const { wait_for_notification_to_stop } = ChromeUtils.importESModule(
  "resource://testing-common/mail/NotificationBoxHelpers.sys.mjs"
);
const { cloudFileAccounts } = ChromeUtils.importESModule(
  "resource:///modules/cloudFileAccounts.sys.mjs"
);
var { MockFilePicker } = SpecialPowers;

const cloudType = "default";
const kInsertNotificationPref =
  "mail.compose.big_attachments.insert_notification";

const maxSize =
  Services.prefs.getIntPref("mail.compose.big_attachments.threshold_kb") * 1024;

add_setup(function () {
  requestLongerTimeout(2);

  gMockCloudfileManager.register(cloudType);
  MockFilePicker.init(window.browsingContext);

  Services.prefs.setBoolPref(kInsertNotificationPref, true);
});

registerCleanupFunction(function () {
  gMockCloudfileManager.unregister(cloudType);
  MockFilePicker.cleanup();
  Services.prefs.clearUserPref(kInsertNotificationPref);
});

const kBoxId = "compose-notification-bottom";

/**
 * Check that we're counting file size uploaded.
 */
add_task(async function test_filelink_uploaded_size() {
  Services.fog.testResetFOG();
  const testFile1Size = 495;
  const testFile2Size = 637;
  const totalSize = testFile1Size + testFile2Size;

  MockFilePicker.setFiles(
    collectFiles(["./data/testFile1", "./data/testFile2"])
  );

  const provider = cloudFileAccounts.getProviderForType(cloudType);
  const cwc = await open_compose_new_mail(window);
  const account = cloudFileAccounts.createAccount(cloudType);

  await add_cloud_attachments(cwc, account, false);
  gMockCloudfileManager.resolveUploads();
  await wait_for_notification_to_stop(cwc, kBoxId, "bigAttachmentUploading");

  const value =
    Glean.filelink.uploadedSize[provider.displayName].testGetValue();
  Assert.equal(value, totalSize, "Count of uploaded size must be correct.");
  await close_compose_window(cwc);
});

/**
 * Check that we're counting filelink suggestion ignored.
 */
add_task(async function test_filelink_ignored() {
  Services.fog.testResetFOG();

  const cwc = await open_compose_new_mail(window);
  await setup_msg_contents(
    cwc,
    "test@example.org",
    "Testing ignoring filelink suggestion",
    "Hello! "
  );

  // Multiple big attachments should be counted as one ignoring.
  await add_attachments(cwc, "https://www.example.com/1", maxSize);
  await add_attachments(cwc, "https://www.example.com/2", maxSize + 10);
  await add_attachments(cwc, "https://www.example.com/3", maxSize - 1);
  const aftersend = BrowserTestUtils.waitForEvent(cwc, "aftersend");
  // Send Later to avoid uncatchable errors from the SMTP code.
  cwc.goDoCommand("cmd_sendLater");
  await aftersend;
  const count = Glean.filelink.filelinkIgnored.testGetValue();
  Assert.equal(count, 1, "Count of ignored times must be correct.");
});
