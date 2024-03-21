/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests CloudFile alerts on errors.
 */

"use strict";

ChromeUtils.defineLazyGetter(this, "brandShortName", () =>
  Services.strings
    .createBundle("chrome://branding/locale/brand.properties")
    .GetStringFromName("brandShortName")
);

var { select_attachments } = ChromeUtils.importESModule(
  "resource://testing-common/mozmill/AttachmentHelpers.sys.mjs"
);
var { gMockCloudfileManager, MockCloudfileAccount } =
  ChromeUtils.importESModule(
    "resource://testing-common/mozmill/CloudfileHelpers.sys.mjs"
  );
var {
  add_cloud_attachments,
  rename_selected_cloud_attachment,
  close_compose_window,
  open_compose_new_mail,
} = ChromeUtils.importESModule(
  "resource://testing-common/mozmill/ComposeHelpers.sys.mjs"
);
var {
  add_message_to_folder,
  create_message,
  FAKE_SERVER_HOSTNAME,
  get_special_folder,
} = ChromeUtils.importESModule(
  "resource://testing-common/mozmill/FolderDisplayHelpers.sys.mjs"
);
var { MockFilePicker } = SpecialPowers;

var { cloudFileAccounts } = ChromeUtils.importESModule(
  "resource:///modules/cloudFileAccounts.sys.mjs"
);
var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

var kHtmlPrefKey = "mail.identity.default.compose_html";
var kDefaultSigKey = "mail.identity.id1.htmlSigText";
var kFiles = ["./data/testFile1", "./data/testFile2"];

var gInbox;

function test_expected_included(actual, expected, description) {
  Assert.equal(
    actual.length,
    expected.length,
    `${description}: correct length`
  );
  for (let i = 0; i < expected.length; i++) {
    for (const item of Object.keys(expected[i])) {
      Assert.equal(
        actual[i][item],
        expected[i][item],
        `${description}: ${item} exists and is correct`
      );
    }
  }
}

add_setup(async function () {
  requestLongerTimeout(3);

  // These prefs can't be set in the manifest as they contain white-space.
  Services.prefs.setStringPref(
    "mail.identity.id1.htmlSigText",
    "Tinderbox is soo 90ies"
  );
  Services.prefs.setStringPref(
    "mail.identity.id2.htmlSigText",
    "Tinderboxpushlog is the new <b>hotness!</b>"
  );

  // For replies and forwards, we'll work off a message in the Inbox folder
  // of the fake "tinderbox" account.
  const server = MailServices.accounts.findServer(
    "tinderbox",
    FAKE_SERVER_HOSTNAME,
    "pop3"
  );
  gInbox = await get_special_folder(Ci.nsMsgFolderFlags.Inbox, false, server);
  await add_message_to_folder([gInbox], create_message());

  MockFilePicker.init(window.browsingContext);
  gMockCloudfileManager.register();

  Services.prefs.setBoolPref(kHtmlPrefKey, true);

  // Don't create paragraphs in the test.
  // The test fails if it encounters paragraphs <p> instead of breaks <br>.
  Services.prefs.setBoolPref("mail.compose.default_to_paragraph", false);
});

registerCleanupFunction(function () {
  gMockCloudfileManager.unregister();
  MockFilePicker.cleanup();
  Services.prefs.clearUserPref(kDefaultSigKey);
  Services.prefs.clearUserPref(kHtmlPrefKey);
  Services.prefs.clearUserPref("mail.compose.default_to_paragraph");
});

/**
 * Test that we get the correct alert message when the provider reports a custom
 * error during upload operation.
 */
add_task(async function test_custom_error_during_upload() {
  await subtest_errors_during_upload({
    exception: {
      message: "This is a custom error.",
      result: cloudFileAccounts.constants.uploadErrWithCustomMessage,
    },
    expectedAlerts: [
      {
        title: "Uploading testFile1 to providerA Failed",
        message: "This is a custom error.",
      },
      {
        title: "Uploading testFile2 to providerA Failed",
        message: "This is a custom error.",
      },
    ],
  });
});

/**
 * Test that we get the correct alert message when the provider reports a standard
 * error during upload operation.
 */
add_task(async function test_standard_error_during_upload() {
  await subtest_errors_during_upload({
    exception: {
      message: "This is a standard error.",
      result: cloudFileAccounts.constants.uploadErr,
    },
    expectedAlerts: [
      {
        title: "Upload Error",
        message: "Unable to upload testFile1 to providerA.",
      },
      {
        title: "Upload Error",
        message: "Unable to upload testFile2 to providerA.",
      },
    ],
  });
});

/**
 * Test that we get the correct alert message when the provider reports a quota
 * error.
 */
add_task(async function test_quota_error_during_upload() {
  await subtest_errors_during_upload({
    exception: {
      message: "Quota Error.",
      result: cloudFileAccounts.constants.uploadWouldExceedQuota,
    },
    expectedAlerts: [
      {
        title: "Quota Error",
        message:
          "Uploading testFile1 to providerA would exceed your space quota.",
      },
      {
        title: "Quota Error",
        message:
          "Uploading testFile2 to providerA would exceed your space quota.",
      },
    ],
  });
});

/**
 * Test that we get the correct alert message when the provider reports a file
 * size exceeded error.
 */
add_task(async function test_file_size_error_during_upload() {
  await subtest_errors_during_upload({
    exception: {
      message: "File Size Error.",
      result: cloudFileAccounts.constants.uploadExceedsFileLimit,
    },
    expectedAlerts: [
      {
        title: "File Size Error",
        message: "testFile1 exceeds the maximum size for providerA.",
      },
      {
        title: "File Size Error",
        message: "testFile2 exceeds the maximum size for providerA.",
      },
    ],
  });
});

/**
 * Test that we get the connection error in offline mode.
 */
add_task(async function test_offline_error_during_upload() {
  await subtest_errors_during_upload({
    toggleOffline: true,
    expectedAlerts: [
      {
        title: "Connection Error",
        message: `${brandShortName} is offline. Could not connect to providerA.`,
      },
      {
        title: "Connection Error",
        message: `${brandShortName} is offline. Could not connect to providerA.`,
      },
    ],
  });
});

/**
 * Subtest for testing error messages during upload operation.
 *
 * @param error - defines the the thrown exception and the expected alert messages
 * @param error.exception - the exception to be thrown by uploadFile()
 * @param error.expectedAlerts - array with { title, message } objects for expected
 *   alerts for each uploaded file
 */
async function subtest_errors_during_upload(error) {
  MockFilePicker.setFiles(collectFiles(kFiles));
  const provider = new MockCloudfileAccount();
  const config = {
    serviceName: "MochiTest A",
    serviceUrl: "https://www.provider-A.org",
    serviceIcon: "chrome://messenger/skin/icons/globe.svg",
  };
  if (error.exception) {
    config.uploadError = error.exception;
  }
  provider.init("providerA", config);

  const cw = await open_compose_new_mail();

  if (error.toggleOffline) {
    Services.io.offline = true;
  }
  const seenAlerts = await add_cloud_attachments(
    cw,
    provider,
    false,
    error.expectedAlerts.length
  );
  if (error.toggleOffline) {
    Services.io.offline = false;
  }

  Assert.equal(
    seenAlerts.length,
    error.expectedAlerts.length,
    "Should have seen the correct number of alerts."
  );
  for (let i = 0; i < error.expectedAlerts.length; i++) {
    Assert.equal(
      error.expectedAlerts[i].title,
      seenAlerts[i].title,
      "Alert should have the correct title."
    );
    Assert.equal(
      error.expectedAlerts[i].message,
      seenAlerts[i].message,
      "Alert should have the correct message."
    );
  }
  await close_compose_window(cw);
}

/**
 * Test that we get the correct alert message when the provider does not support
 * renaming.
 */
add_task(async function test_nosupport_error_during_rename() {
  await subtest_errors_during_rename({
    exception: {
      message: "Rename not supported.",
      result: cloudFileAccounts.constants.renameNotSupported,
    },
    expectedAlerts: [
      {
        title: "Rename Error",
        message: "providerA does not support renaming already uploaded files.",
      },
      {
        title: "Rename Error",
        message: "providerA does not support renaming already uploaded files.",
      },
    ],
  });
});

/**
 * Test that we get the correct alert message when the provider reports a standard
 * error during rename operation.
 */
add_task(async function test_standard_error_during_rename() {
  await subtest_errors_during_rename({
    exception: {
      message: "Rename error.",
      result: cloudFileAccounts.constants.renameErr,
    },
    expectedAlerts: [
      {
        title: "Rename Error",
        message: "There was a problem renaming testFile1 on providerA.",
      },
      {
        title: "Rename Error",
        message: "There was a problem renaming testFile2 on providerA.",
      },
    ],
  });
});

/**
 * Test that we get the correct alert message when the provider reports a custom
 * error during rename operation.
 */
add_task(async function test_custom_error_during_rename() {
  await subtest_errors_during_rename({
    exception: {
      message: "This is a custom error.",
      result: cloudFileAccounts.constants.renameErrWithCustomMessage,
    },
    expectedAlerts: [
      {
        title: "Renaming testFile1 on providerA Failed",
        message: "This is a custom error.",
      },
      {
        title: "Renaming testFile2 on providerA Failed",
        message: "This is a custom error.",
      },
    ],
  });
});

/**
 * Test that we get the connection error in offline mode.
 */
add_task(async function test_offline_error_during_rename() {
  await subtest_errors_during_rename({
    toggleOffline: true,
    expectedAlerts: [
      {
        title: "Connection Error",
        message: `${brandShortName} is offline. Could not connect to providerA.`,
      },
      {
        title: "Connection Error",
        message: `${brandShortName} is offline. Could not connect to providerA.`,
      },
    ],
  });
});

/**
 * Subtest for testing error messages during rename operation.
 *
 * @param error - defines the the thrown exception and the expected alert messagees
 * @param error.exception - the exception to be thrown by renameFile()
 * @param error.expectedAlerts - array with { title, message } objects for each renamed file
 */
async function subtest_errors_during_rename(error) {
  MockFilePicker.setFiles(collectFiles(kFiles));
  const provider = new MockCloudfileAccount();
  const config = {
    serviceName: "MochiTest A",
    serviceUrl: "https://www.provider-A.org",
    serviceIcon: "chrome://messenger/skin/icons/globe.svg",
  };
  if (error.exception) {
    config.renameError = error.exception;
  }
  provider.init("providerA", config);

  const cw = await open_compose_new_mail();
  const uploads = await add_cloud_attachments(cw, provider);
  test_expected_included(
    uploads,
    [
      {
        url: "https://www.example.com/providerA/testFile1",
        name: "testFile1",
        serviceIcon: "chrome://messenger/skin/icons/globe.svg",
        serviceName: "MochiTest A",
        serviceUrl: "https://www.provider-A.org",
      },
      {
        url: "https://www.example.com/providerA/testFile2",
        name: "testFile2",
        serviceIcon: "chrome://messenger/skin/icons/globe.svg",
        serviceName: "MochiTest A",
        serviceUrl: "https://www.provider-A.org",
      },
    ],
    `Expected values in uploads array before renaming the files`
  );

  // Try to rename each Filelink, ensuring that we get the correct alerts.
  if (error.toggleOffline) {
    Services.io.offline = true;
  }
  const seenAlerts = [];
  for (let i = 0; i < kFiles.length; ++i) {
    select_attachments(cw, i);
    seenAlerts.push(
      await rename_selected_cloud_attachment(cw, "IgnoredNewName")
    );
  }
  if (error.toggleOffline) {
    Services.io.offline = false;
  }

  Assert.equal(
    seenAlerts.length,
    error.expectedAlerts.length,
    "Should have seen the correct number of alerts."
  );
  for (let i = 0; i < error.expectedAlerts.length; i++) {
    Assert.equal(
      error.expectedAlerts[i].title,
      seenAlerts[i].title,
      "Alert should have the correct title."
    );
    Assert.equal(
      error.expectedAlerts[i].message,
      seenAlerts[i].message,
      "Alert should have the correct message."
    );
  }
  await close_compose_window(cw);
}
