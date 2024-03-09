/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that cloudFile attachments are properly restored in re-opened drafts.
 */

"use strict";

var {
  close_compose_window,
  compose_window_ready,
  open_compose_new_mail,
  save_compose_message,
  setup_msg_contents,
} = ChromeUtils.importESModule(
  "resource://testing-common/mozmill/ComposeHelpers.sys.mjs"
);
var { CloudFileTestProvider } = ChromeUtils.importESModule(
  "resource://testing-common/mozmill/CloudfileHelpers.sys.mjs"
);
var {
  be_in_folder,
  get_special_folder,
  get_about_message,
  press_delete,
  select_click_row,
} = ChromeUtils.importESModule(
  "resource://testing-common/mozmill/FolderDisplayHelpers.sys.mjs"
);
var { get_notification, wait_for_notification_to_show } =
  ChromeUtils.importESModule(
    "resource://testing-common/mozmill/NotificationBoxHelpers.sys.mjs"
  );
var { promise_new_window } = ChromeUtils.importESModule(
  "resource://testing-common/mozmill/WindowHelpers.sys.mjs"
);
var { MockFilePicker } = SpecialPowers;

var gDrafts;
var gCloudFileProvider;
const kFiles = ["./data/attachment.txt"];

add_setup(async function () {
  gDrafts = await get_special_folder(Ci.nsMsgFolderFlags.Drafts, true);
  MockFilePicker.init(window.browsingContext);
  // Register an extension based cloudFile provider.
  gCloudFileProvider = new CloudFileTestProvider("testProvider");
  await gCloudFileProvider.register(this);
});

registerCleanupFunction(async function () {
  MockFilePicker.cleanup();
  await gCloudFileProvider.unregister();
});

/**
 * Test reopening a draft with a cloudFile attachment.
 *
 * It must be possible to rename the restored cloudFile attachment.
 * It must be possible to convert the restored cloudFile to a local attachment.
 */
add_task(async function test_draft_with_cloudFile_attachment() {
  // Prepare the mock file picker.
  const files = collectFiles(kFiles);
  MockFilePicker.setFiles(files);

  const cloudFileAccount = await gCloudFileProvider.createAccount(
    "validAccount"
  );
  const draft = await createAndCloseDraftWithCloudAttachment(cloudFileAccount);
  const expectedUpload = { ...draft.upload };

  const cwc = await openDraft();

  const bucket = cwc.document.getElementById("attachmentBucket");
  Assert.equal(
    bucket.itemCount,
    kFiles.length,
    "Should find correct number of attachments."
  );
  const itemFromDraft = [...bucket.children].find(
    e => e.attachment.name == "attachment.txt"
  );
  Assert.ok(itemFromDraft, "Should have found the attachment item");
  Assert.ok(itemFromDraft.attachment.sendViaCloud, "Should be a cloudFile.");
  Assert.equal(
    draft.url,
    itemFromDraft.attachment.url,
    "Should have restored the url of the original attachment, pointing to the local file."
  );
  Assert.ok(
    !itemFromDraft.attachment.temporary,
    "The attachments local file should not be temporary."
  );
  Assert.equal(
    cloudFileAccount.accountKey,
    itemFromDraft.attachment.cloudFileAccountKey,
    "Should have restored the correct account key."
  );

  expectedUpload.immutable = true;
  Assert.deepEqual(
    expectedUpload,
    itemFromDraft.cloudFileUpload,
    "Should have found the existing upload."
  );
  Assert.equal(
    draft.itemIcon,
    itemFromDraft.querySelector("img.attachmentcell-icon").src,
    "CloudFile icon of draft should match CloudFile icon of original email."
  );
  Assert.equal(
    draft.itemSize,
    itemFromDraft.querySelector(".attachmentcell-size").textContent,
    "Attachment size of draft should match attachment size of original email."
  );
  Assert.equal(
    draft.totalSize,
    cwc.document.getElementById("attachmentBucketSize").textContent,
    "Total size of draft should match total size of original email."
  );

  // Rename attachment.
  await cwc.UpdateAttachment(itemFromDraft, { name: "renamed.txt" });
  Assert.equal(
    "renamed.txt",
    itemFromDraft.attachment.name,
    "Renaming a restored cloudFile attachment should succeed."
  );

  // Convert to regular attachment.
  await cwc.UpdateAttachment(itemFromDraft, { cloudFileAccount: null });
  Assert.ok(
    !itemFromDraft.attachment.sendViaCloud,
    "Converting a restored cloudFile attachment to a regular attachment should succeed."
  );

  await close_compose_window(cwc);

  // Delete the leftover draft message.
  await press_delete();

  // Cleanup cloudFile account.
  await gCloudFileProvider.removeAccount(cloudFileAccount);
});

/**
 * Test reopening a draft with a cloudFile attachment, which is not know to the
 * current session.
 *
 * It must be possible to rename the restored cloudFile attachment.
 * It must be possible to convert the restored cloudFile to a local attachment.
 */
add_task(async function test_draft_with_unknown_cloudFile_attachment() {
  // Prepare the mock file picker.
  const files = collectFiles(kFiles);
  MockFilePicker.setFiles(files);

  const cloudFileAccount = await gCloudFileProvider.createAccount(
    "validAccountUnknownUpload"
  );
  const draft = await createAndCloseDraftWithCloudAttachment(cloudFileAccount);
  const expectedUpload = { ...draft.upload };

  // Change the known upload, so the draft comes back as unknown.
  const id1 = cloudFileAccount._uploads.get(1);
  id1.serviceName = "wrongService";
  cloudFileAccount._uploads.set(1, id1);

  const cwc = await openDraft();

  const bucket = cwc.document.getElementById("attachmentBucket");
  Assert.equal(
    bucket.itemCount,
    kFiles.length,
    "Should find correct number of attachments."
  );
  const itemFromDraft = [...bucket.children].find(
    e => e.attachment.name == "attachment.txt"
  );
  Assert.ok(itemFromDraft, "Should have found the attachment item");
  Assert.ok(itemFromDraft.attachment.sendViaCloud, "Should be a cloudFile.");
  Assert.equal(
    draft.url,
    itemFromDraft.attachment.url,
    "Should have restored the url of the original attachment, pointing to the local file."
  );
  Assert.ok(
    !itemFromDraft.attachment.temporary,
    "The attachments local file should not be temporary."
  );
  Assert.equal(
    cloudFileAccount.accountKey,
    itemFromDraft.attachment.cloudFileAccountKey,
    "Should have restored the correct account key."
  );

  expectedUpload.id = 2;
  expectedUpload.immutable = true;
  Assert.deepEqual(
    expectedUpload,
    itemFromDraft.cloudFileUpload,
    "Should have created a new upload with id = 2."
  );
  Assert.equal(
    draft.itemIcon,
    itemFromDraft.querySelector("img.attachmentcell-icon").src,
    "CloudFile icon of draft should match CloudFile icon of original email."
  );
  Assert.equal(
    draft.itemSize,
    itemFromDraft.querySelector(".attachmentcell-size").textContent,
    "Attachment size of draft should match attachment size of original email."
  );
  Assert.equal(
    draft.totalSize,
    cwc.document.getElementById("attachmentBucketSize").textContent,
    "Total size of draft should match total size of original email."
  );

  // Rename attachment.
  await cwc.UpdateAttachment(itemFromDraft, { name: "renamed.txt" });
  Assert.equal(
    "renamed.txt",
    itemFromDraft.attachment.name,
    "Renaming an unknown cloudFile attachment should succeed."
  );

  // Convert to regular attachment.
  await cwc.UpdateAttachment(itemFromDraft, { cloudFileAccount: null });
  Assert.ok(
    !itemFromDraft.attachment.sendViaCloud,
    "Converting an unknown cloudFile attachment to a regular attachment should succeed."
  );

  await close_compose_window(cwc);

  // Delete the leftover draft message.
  await press_delete();

  // Cleanup cloudFile account.
  await gCloudFileProvider.removeAccount(cloudFileAccount);
});

/**
 * Test reopening a draft with a cloudFile attachment, whose account has been
 * deleted.
 *
 * It must NOT be possible to rename the restored cloudFile attachment.
 * It must be possible to convert the restored cloudFile to a local attachment.
 */
add_task(async function test_draft_with_cloudFile_attachment_no_account() {
  // Prepare the mock file picker.
  const files = collectFiles(kFiles);
  MockFilePicker.setFiles(files);

  const cloudFileAccount = await gCloudFileProvider.createAccount(
    "invalidAccount"
  );
  const draft = await createAndCloseDraftWithCloudAttachment(cloudFileAccount);
  const expectedUpload = { ...draft.upload };

  // Remove account.
  await gCloudFileProvider.removeAccount(cloudFileAccount);

  const cwc = await openDraft();

  // Check that the draft has a cloudFile attachment.
  const bucket = cwc.document.getElementById("attachmentBucket");
  Assert.equal(
    bucket.itemCount,
    kFiles.length,
    "Should find correct number of attachments."
  );
  const itemFromDraft = [...bucket.children].find(
    e => e.attachment.name == "attachment.txt"
  );
  Assert.ok(itemFromDraft, "Should have found the attachment item");
  Assert.ok(itemFromDraft.attachment.sendViaCloud, "Should be a cloudFile.");
  Assert.equal(
    draft.url,
    itemFromDraft.attachment.url,
    "Should have restored the url of the original attachment, pointing to the local file."
  );
  Assert.ok(
    !itemFromDraft.attachment.temporary,
    "The attachments local file should not be temporary."
  );
  Assert.equal(
    cloudFileAccount.accountKey,
    itemFromDraft.attachment.cloudFileAccountKey,
    "Should have restored the correct account key."
  );

  delete expectedUpload.id;
  expectedUpload.immutable = false;
  Assert.deepEqual(
    expectedUpload,
    itemFromDraft.cloudFileUpload,
    "Should have restored the upload from the draft without an id and immutable = false."
  );
  Assert.equal(
    draft.itemIcon,
    itemFromDraft.querySelector("img.attachmentcell-icon").src,
    "CloudFile icon of draft should match CloudFile icon of original email."
  );
  Assert.equal(
    draft.itemSize,
    itemFromDraft.querySelector(".attachmentcell-size").textContent,
    "Attachment size of draft should match attachment size of original email."
  );
  Assert.equal(
    draft.totalSize,
    cwc.document.getElementById("attachmentBucketSize").textContent,
    "Total size of draft should match total size of original email."
  );

  // Rename attachment.
  await Assert.rejects(
    cwc.UpdateAttachment(itemFromDraft, { name: "renamed.txt" }),
    /CloudFile Error: Account not found: undefined/,
    "Renaming a restored cloudFile attachment (without account) should not succeed."
  );

  // Convert to regular attachment.
  await cwc.UpdateAttachment(itemFromDraft, { cloudFileAccount: null });
  Assert.ok(
    !itemFromDraft.attachment.sendViaCloud,
    "Converting a restored cloudFile attachment (without account) to a regular attachment should succeed."
  );

  await close_compose_window(cwc);

  // Delete the leftover draft message.
  await press_delete();
});

/**
 * Test reopening a draft with a cloudFile attachment, whose local file has been
 * deleted.
 *
 * It must NOT be possible to rename the restored cloudFile attachment.
 * It must NOT be possible to convert the restored cloudFile to a local attachment.
 */
add_task(async function test_draft_with_cloudFile_attachment_no_file() {
  // Prepare the mock file picker.
  const tempFile = await createAttachmentFile(
    "attachment.txt",
    "This is a sample text."
  );
  MockFilePicker.setFiles([tempFile.file]);

  const cloudFileAccount = await gCloudFileProvider.createAccount(
    "validAccountNoFile"
  );
  const draft = await createAndCloseDraftWithCloudAttachment(cloudFileAccount);
  const expectedUpload = { ...draft.upload };

  // Remove local file of cloudFile attachment.
  await IOUtils.remove(tempFile.path);

  const cwc = await openDraft();

  // Check that the draft has a cloudFile attachment.
  const bucket = cwc.document.getElementById("attachmentBucket");
  Assert.equal(
    bucket.itemCount,
    kFiles.length,
    "Should find correct number of attachments."
  );
  const itemFromDraft = [...bucket.children].find(
    e => e.attachment.name == "attachment.txt"
  );
  Assert.ok(itemFromDraft, "Should have found the attachment item");
  Assert.ok(itemFromDraft.attachment.sendViaCloud, "Should be a cloudFile.");
  Assert.notEqual(
    draft.url,
    itemFromDraft.attachment.url,
    "Should NOT have restored the url of the original attachment."
  );
  Assert.ok(
    itemFromDraft.attachment.url.endsWith(".html"),
    "The attachments url should still point to the html placeholder file."
  );
  Assert.ok(
    itemFromDraft.attachment.temporary,
    "The attachments html placeholder file should be temporary."
  );

  Assert.equal(
    cloudFileAccount.accountKey,
    itemFromDraft.attachment.cloudFileAccountKey,
    "Should have restored the correct account key."
  );

  expectedUpload.immutable = true;
  Assert.deepEqual(
    expectedUpload,
    itemFromDraft.cloudFileUpload,
    "Should have restored the correct upload."
  );
  Assert.equal(
    draft.itemIcon,
    itemFromDraft.querySelector("img.attachmentcell-icon").src,
    "CloudFile icon of draft should match CloudFile icon of original email."
  );
  Assert.equal(
    draft.itemSize,
    itemFromDraft.querySelector(".attachmentcell-size").textContent,
    "Attachment size of draft should match attachment size of original email."
  );
  Assert.equal(
    draft.totalSize,
    cwc.document.getElementById("attachmentBucketSize").textContent,
    "Total size of draft should match total size of original email."
  );

  // Rename attachment.
  await Assert.rejects(
    cwc.UpdateAttachment(itemFromDraft, { name: "renamed.txt" }),
    e => {
      return (
        e.message.startsWith("CloudFile Error: Attachment file not found: ") &&
        e.message.endsWith("attachment.txt")
      );
    },
    "Renaming a restored cloudFile attachment (without local file) should not succeed."
  );

  // Rename attachment.
  await Assert.rejects(
    cwc.UpdateAttachment(itemFromDraft, { name: "renamed.txt" }),
    e => {
      return (
        e.message.startsWith("CloudFile Error: Attachment file not found: ") &&
        e.message.endsWith("attachment.txt")
      );
    },
    "Renaming a restored cloudFile attachment (without local file) should not succeed."
  );

  // Convert to regular attachment.
  await Assert.rejects(
    cwc.UpdateAttachment(itemFromDraft, { cloudFileAccount: null }),
    e => {
      return (
        e.message.startsWith("CloudFile Error: Attachment file not found: ") &&
        e.message.endsWith("attachment.txt")
      );
    },
    "Converting a restored cloudFile attachment (without local file) to a regular attachment should not succeed."
  );

  await close_compose_window(cwc);

  // Delete the leftover draft message.
  await press_delete();

  // Cleanup cloudFile account.
  await gCloudFileProvider.removeAccount(cloudFileAccount);
});

async function createAndCloseDraftWithCloudAttachment(cloudFileAccount) {
  // Open a sample message.
  const cwc = await open_compose_new_mail();
  await setup_msg_contents(
    cwc,
    "test@example.invalid",
    `Testing drafts with cloudFiles for provider ${cloudFileAccount.displayName}!`,
    "Some body..."
  );

  await cwc.attachToCloudNew(cloudFileAccount);

  const bucket = cwc.document.getElementById("attachmentBucket");
  Assert.equal(
    bucket.itemCount,
    kFiles.length,
    "Should find correct number of attachments."
  );
  const item = [...bucket.children].find(
    e => e.attachment.name == "attachment.txt"
  );
  Assert.ok(item, "Should have found the attachment item");
  Assert.ok(item.attachment.sendViaCloud, "Should be a cloudFile.");
  Assert.equal(
    cloudFileAccount.accountKey,
    item.attachment.cloudFileAccountKey,
    "Should have the correct account key."
  );
  Assert.deepEqual(
    cloudFileAccount,
    item.cloudFileAccount,
    "Should have the correct cloudFileAccount."
  );

  const url = item.attachment.url;
  const upload = item.cloudFileUpload;
  const itemIcon = item.querySelector("img.attachmentcell-icon").src;
  const itemSize = item.querySelector(".attachmentcell-size").textContent;
  const totalSize = cwc.document.getElementById(
    "attachmentBucketSize"
  ).textContent;

  Assert.equal(
    itemIcon,
    "chrome://messenger/content/extension.svg",
    "CloudFile icon should be correct."
  );

  // Now close the message with saving it as draft.
  await save_compose_message(cwc);
  await close_compose_window(cwc);

  // The draft message was saved into Local Folders/Drafts.
  await be_in_folder(gDrafts);

  return { upload, url, itemIcon, itemSize, totalSize };
}

async function openDraft() {
  await select_click_row(0);
  const aboutMessage = get_about_message();
  // Wait for the notification with the Edit button.
  await wait_for_notification_to_show(
    aboutMessage,
    "mail-notification-top",
    "draftMsgContent"
  );
  // Edit the draft again...
  const composePromise = promise_new_window("msgcompose");
  const box = get_notification(
    aboutMessage,
    "mail-notification-top",
    "draftMsgContent"
  );
  // ... by clicking Edit in the draft message notification bar.
  EventUtils.synthesizeMouseAtCenter(
    box.buttonContainer.firstElementChild,
    {},
    aboutMessage
  );
  return compose_window_ready(composePromise);
}

function collectFiles(files) {
  return files.map(filename => new FileUtils.File(getTestFilePath(filename)));
}

async function createAttachmentFile(filename, content) {
  const tempPath = PathUtils.join(PathUtils.tempDir, filename);
  await IOUtils.writeUTF8(tempPath, content);
  return {
    path: tempPath,
    file: new FileUtils.File(tempPath),
  };
}
