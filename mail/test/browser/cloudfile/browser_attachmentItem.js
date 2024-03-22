/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests Filelink attachment item behaviour.
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
  add_cloud_attachments,
  convert_selected_to_cloud_attachment,
  close_compose_window,
  open_compose_new_mail,
} = ChromeUtils.importESModule(
  "resource://testing-common/mozmill/ComposeHelpers.sys.mjs"
);
var { close_popup } = ChromeUtils.importESModule(
  "resource://testing-common/mozmill/FolderDisplayHelpers.sys.mjs"
);
var { MockFilePicker } = SpecialPowers;

var { cloudFileAccounts } = ChromeUtils.importESModule(
  "resource:///modules/cloudFileAccounts.sys.mjs"
);

var kAttachmentItemContextID = "msgComposeAttachmentItemContext";

// Prepare the mock prompt.
var originalPromptService = Services.prompt;
var mockPromptService = {
  alertCount: 0,
  alert() {
    this.alertCount++;
  },
  QueryInterface: ChromeUtils.generateQI(["nsIPromptService"]),
};

add_setup(function () {
  Services.prompt = mockPromptService;
  MockFilePicker.init(window.browsingContext);
  gMockCloudfileManager.register();
});

registerCleanupFunction(function () {
  gMockCloudfileManager.unregister();
  MockFilePicker.cleanup();
  Services.prompt = originalPromptService;
});

/**
 * Test that when an upload has been started, we can cancel and restart
 * the upload, and then cancel again.  For this test, we repeat this
 * 3 times.
 */
add_task(async function test_upload_cancel_repeat() {
  const kFile = "./data/testFile1";

  const provider = new MockCloudfileAccount();
  provider.init("someKey");
  const cw = await open_compose_new_mail(window);

  // Prepare the mock file picker to return our test file.
  const file = new FileUtils.File(getTestFilePath(kFile));
  MockFilePicker.setFiles([file]);
  await new Promise(resolve => {
    MockFilePicker.afterOpenCallback = resolve;
    // We've got a compose window open, and our mock Filelink provider
    // ready.  Let's attach a file...
    cw.AttachFile();
  });

  // Now we override the uploadFile function of the MockCloudfileAccount
  // so that we're perpetually uploading...
  let promise;
  let started;
  provider.uploadFile = function () {
    return new Promise((resolve, reject) => {
      promise = { resolve, reject };
      started = true;
    });
  };

  const kAttempts = 3;
  for (let i = 0; i < kAttempts; i++) {
    promise = null;
    started = false;

    const bucket = cw.document.getElementById("attachmentBucket");
    Assert.equal(
      bucket.itemCount,
      1,
      "Should find correct number of attachments before converting."
    );

    // Select the attachment, and choose to convert it to a Filelink
    select_attachments(cw, 0)[0];
    cw.convertSelectedToCloudAttachment(provider);
    await TestUtils.waitForCondition(() => started);

    await assert_can_cancel_upload(cw, provider, promise, file);
    await new Promise(resolve => setTimeout(resolve));

    // A cancelled conversion must not remove the attachment.
    Assert.equal(
      bucket.itemCount,
      1,
      "Should find correct number of attachments after converting."
    );
  }

  await close_compose_window(cw);
});

/**
 * Test that we can cancel a whole series of files being uploaded at once.
 */
add_task(async function test_upload_multiple_and_cancel() {
  const kFiles = ["./data/testFile1", "./data/testFile2", "./data/testFile3"];

  // Prepare the mock file picker to return our test file.
  const files = collectFiles(kFiles);
  MockFilePicker.setFiles(files);

  const provider = new MockCloudfileAccount();
  provider.init("someKey");
  const cw = await open_compose_new_mail();

  const promises = {};
  provider.uploadFile = function (window, aFile) {
    return new Promise((resolve, reject) => {
      promises[aFile.leafName] = { resolve, reject };
    });
  };

  await add_cloud_attachments(cw, provider, false);

  const bucket = cw.document.getElementById("attachmentBucket");
  Assert.equal(
    bucket.itemCount,
    kFiles.length,
    "Should find correct number of attachments before uploading."
  );

  for (let i = files.length - 1; i >= 0; --i) {
    await assert_can_cancel_upload(
      cw,
      provider,
      promises[files[i].leafName],
      files[i]
    );
  }

  // The cancelled attachment uploads should have been removed.
  Assert.equal(
    bucket.itemCount,
    0,
    "Should find correct number of attachments after uploading."
  );

  await close_compose_window(cw);
});

/**
 * Helper function that takes an upload in progress, and cancels it,
 * ensuring that the nsIMsgCloudFileProvider.uploadCanceled status message
 * is returned to the passed in listener.
 *
 * @param {Window} aWin - The compose window to use.
 * @param {object} aProvider - A MockCloudfileAccount for which the uploads
 *   have already started.
 * @param {nsIRequestObserver} aListener - The observer passed to aProvider's
 *   uploadFile function.
 * @param {nsIFile} aTargetFile - The file to cancel the upload for.
 */
async function assert_can_cancel_upload(
  aWin,
  aProvider,
  aPromise,
  aTargetFile
) {
  let cancelled = false;

  // Override the provider's cancelFileUpload function.  We can do this because
  // it's assumed that the provider is a MockCloudfileAccount.
  aProvider.cancelFileUpload = function (window, aFileToCancel) {
    if (aTargetFile.equals(aFileToCancel)) {
      aPromise.reject(
        Components.Exception(
          "Upload cancelled.",
          cloudFileAccounts.constants.uploadCancelled
        )
      );
      cancelled = true;
    }
  };

  // Retrieve the attachment bucket index for the target file...
  const index = get_attachmentitem_index_for_file(aWin, aTargetFile);

  // Select that attachmentitem in the bucket
  select_attachments(aWin, index)[0];

  // Bring up the context menu, and click cancel.
  const cmd = aWin.document.getElementById("cmd_cancelUpload");
  aWin.updateAttachmentItems();

  Assert.ok(!cmd.hidden, "cmd_cancelUpload should be shown");
  Assert.ok(!cmd.disabled, "cmd_cancelUpload should be enabled");

  const attachmentItem =
    aWin.document.getElementById("attachmentBucket").selectedItem;
  const contextMenu = aWin.document.getElementById(
    "msgComposeAttachmentItemContext"
  );

  const popupPromise = BrowserTestUtils.waitForEvent(contextMenu, "popupshown");
  EventUtils.synthesizeMouseAtCenter(
    attachmentItem,
    { type: "contextmenu", button: 2 },
    attachmentItem.ownerGlobal
  );
  await popupPromise;

  const cancelItem = aWin.document.getElementById(
    "composeAttachmentContext_cancelUploadItem"
  );
  if (AppConstants.platform == "macosx") {
    // We need to use click() since the synthesizeMouseAtCenter doesn't work for
    // context menu items on macos.
    cancelItem.click();
  } else {
    EventUtils.synthesizeMouseAtCenter(cancelItem, {}, cancelItem.ownerGlobal);
    await new Promise(resolve => setTimeout(resolve));
  }

  // Close the popup, and wait for the cancellation to be complete.
  await close_popup(
    aWin,
    aWin.document.getElementById(kAttachmentItemContextID)
  );
  await TestUtils.waitForCondition(() => cancelled);
}

/**
 * A helper function to find the attachment bucket index for a particular
 * nsIFile. Returns null if no attachmentitem is found.
 *
 * @param aWin the compose window to use.
 * @param aFile the nsIFile to search for.
 */
function get_attachmentitem_index_for_file(aWin, aFile) {
  // Get the fileUrl from the file.
  const fileUrl = aWin.FileToAttachment(aFile).url;

  // Get the bucket, and go through each item looking for the matching
  // attachmentitem.
  const bucket = aWin.document.getElementById("attachmentBucket");
  for (let i = 0; i < bucket.getRowCount(); ++i) {
    const attachmentitem = bucket.getItemAtIndex(i);
    if (attachmentitem.attachment.url == fileUrl) {
      return i;
    }
  }
  return null;
}

/**
 * Helper function to start uploads and check number and icon of attachments
 * after successful or failed uploads.
 *
 * @param error - to be returned error by uploadFile in case of failure
 * @param expectedAttachments - number of expected attachments at the end of the test
 * @param expectedAlerts - number of expected alerts at the end of the test
 */
async function test_upload(cw, error, expectedAttachments, expectedAlerts = 0) {
  const kFiles = ["./data/testFile1", "./data/testFile2", "./data/testFile3"];

  // Prepare the mock file picker to return our test file.
  const files = collectFiles(kFiles);
  MockFilePicker.setFiles(files);

  const provider = new MockCloudfileAccount();
  provider.init("someKey");

  // Override the uploadFile function of the MockCloudfileAccount.
  const promises = [];
  provider.uploadFile = function (window, aFile) {
    return new Promise((resolve, reject) => {
      promises.push({
        resolve,
        reject,
        upload: {
          url: `https://example.org/${aFile.leafName}`,
          size: aFile.fileSize,
          path: aFile.path,
        },
      });
    });
  };

  await add_cloud_attachments(cw, provider, false);
  await TestUtils.waitForCondition(() => promises.length == kFiles.length);

  const bucket = cw.document.getElementById("attachmentBucket");
  Assert.equal(
    bucket.itemCount,
    kFiles.length,
    "Should find correct number of attachments before uploading."
  );

  for (const item of bucket.itemChildren) {
    is(
      item.querySelector("img.attachmentcell-icon").src,
      "chrome://global/skin/icons/loading.png",
      "CloudFile icon should be the loading spinner."
    );
  }

  for (const promise of promises) {
    if (error) {
      promise.reject(error);
    } else {
      promise.resolve(promise.upload);
    }
  }
  await new Promise(resolve => setTimeout(resolve));

  Assert.equal(
    bucket.itemCount,
    expectedAttachments,
    "Should find correct number of attachments after uploading."
  );
  // Check if the spinner is no longer shown, but the expected moz-icon.
  for (const item of bucket.itemChildren) {
    ok(
      item
        .querySelector("img.attachmentcell-icon")
        .src.startsWith("moz-icon://testFile"),
      "CloudFile icon should be correct."
    );
  }

  // Check and reset the prompt mock service.
  is(
    expectedAlerts,
    Services.prompt.alertCount,
    "Number of expected alert prompts should be correct."
  );
  Services.prompt.alertCount = 0;
}

/**
 * Check if attachment is removed if upload failed.
 */
add_task(async function test_error_upload() {
  const cw = await open_compose_new_mail();
  await test_upload(
    cw,
    Components.Exception(
      "Upload error.",
      cloudFileAccounts.constants.uploadErr
    ),
    0,
    3
  );
  await close_compose_window(cw);
});

/**
 * Check if attachment is not removed if upload is successful.
 */
add_task(async function test_successful_upload() {
  const cw = await open_compose_new_mail();
  await test_upload(cw, null, 3, 0);
  await close_compose_window(cw);
});

/**
 * Check if the original cloud attachment is kept, after converting it to another
 * provider failed.
 */
add_task(async function test_error_conversion() {
  const cw = await open_compose_new_mail();
  const bucket = cw.document.getElementById("attachmentBucket");

  // Upload 3 files to the standard provider.
  await test_upload(cw, null, 3, 0);

  // Define another provider.
  const providerB = new MockCloudfileAccount();
  providerB.init("someOtherKey");

  let uploadPromise = null;
  providerB.uploadFile = function () {
    return new Promise((resolve, reject) => {
      uploadPromise = { resolve, reject };
    });
  };

  select_attachments(cw, 0);
  await convert_selected_to_cloud_attachment(cw, providerB, false);

  const uploadError = new Promise(resolve => {
    bucket.addEventListener("attachment-move-failed", resolve, {
      once: true,
    });
  });

  // Reject the upload, causing the conversion to fail.
  uploadPromise.reject(
    new Components.Exception(
      "Upload error.",
      cloudFileAccounts.constants.uploadErr
    )
  );
  await uploadError;

  // Wait for the showLocalizedCloudFileAlert() to localize the error message.
  await new Promise(resolve => setTimeout(resolve));

  is(
    Services.prompt.alertCount,
    1,
    "Number of expected alert prompts should be correct."
  );
  Services.prompt.alertCount = 0;

  // Check that we still have the 3 attachments we started with.
  Assert.equal(
    bucket.itemCount,
    3,
    "Should find correct number of attachments."
  );
  for (let i = 0; i < bucket.itemCount; i++) {
    const item = bucket.itemChildren[i];
    Assert.equal(
      item.attachment.sendViaCloud,
      true,
      "Attachment should be a cloud attachment."
    );
    Assert.equal(
      item.attachment.cloudFileAccountKey,
      "someKey",
      "Attachment should be hosted by the correct provider."
    );
  }

  await close_compose_window(cw);
});
