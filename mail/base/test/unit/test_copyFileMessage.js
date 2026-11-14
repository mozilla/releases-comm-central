/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
const { MailStringUtils } = ChromeUtils.importESModule(
  "resource:///modules/MailStringUtils.sys.mjs"
);
const { MailUtils } = ChromeUtils.importESModule(
  "resource:///modules/MailUtils.sys.mjs"
);
const { AttachmentInfo } = ChromeUtils.importESModule(
  "resource:///modules/AttachmentInfo.sys.mjs"
);

let copyRequest;
const targetFolder = {};

add_setup(function () {
  const originalCopy = MailServices.copy;
  MailServices.copy = {
    copyFileMessage(...args) {
      copyRequest.resolve(args);
    },
  };
  registerCleanupFunction(() => {
    MailServices.copy = originalCopy;
  });
});

/**
 * Start an import and wait for the prepared file to reach the copy service.
 *
 * @param {string} input - Message bytes as a byte string.
 * @returns {Promise<{sourcePath: string, file: nsIFile,
 *   listener: nsIMsgCopyServiceListener, completion: Promise<void>}>}
 *   The source path, copy arguments, and pending import promise.
 */
async function startCopy(input) {
  const sourcePath = await IOUtils.createUniqueFile(
    PathUtils.profileDir,
    "message.eml",
    0o600
  );
  registerCleanupFunction(() => IOUtils.remove(sourcePath));
  await IOUtils.write(
    sourcePath,
    MailStringUtils.byteStringToUint8Array(input)
  );
  copyRequest = Promise.withResolvers();
  const completion = MailUtils.copyFileMessageAsync(
    await IOUtils.getFile(sourcePath),
    targetFolder,
    null
  );
  const args = await Promise.race([
    copyRequest.promise,
    completion.then(() => {
      throw new Error("The import should wait for the copy listener");
    }),
  ]);
  const file = args[0];
  Assert.equal(args[1], targetFolder, "The destination should be preserved");
  Assert.equal(
    args[4],
    Ci.nsMsgMessageFlags.Read,
    "The imported message should be marked read"
  );
  if (file.path !== sourcePath) {
    registerCleanupFunction(() =>
      IOUtils.remove(file.path, { ignoreAbsent: true })
    );
  }
  return { sourcePath, file, listener: args[6], completion };
}

/**
 * Check the prepared bytes and complete a successful import.
 *
 * @param {string} input - Source message bytes as a byte string.
 * @param {string} expected - Expected message bytes as a byte string.
 */
async function checkCopy(input, expected) {
  const { sourcePath, file, listener, completion } = await startCopy(input);
  const prepared = await IOUtils.read(file.path);
  const matchesExpected =
    MailStringUtils.uint8ArrayToByteString(prepared) === expected;
  Assert.ok(
    matchesExpected,
    "The prepared file should contain exactly the expected message bytes"
  );
  const needsPreparation = input !== expected;
  Assert.equal(
    file.path === sourcePath,
    !needsPreparation,
    "The original file should be used when no preparation is needed"
  );
  listener.onStopCopy(Cr.NS_OK);
  await completion;
  const exists = await IOUtils.exists(file.path);
  Assert.equal(
    exists,
    !needsPreparation,
    "Cleanup should remove only a prepared temporary file"
  );
  const original = await IOUtils.read(sourcePath);
  const sourceUnchanged =
    MailStringUtils.uint8ArrayToByteString(original) === input;
  Assert.ok(sourceUnchanged, "The original file should remain unchanged");
}

add_task(async function test_lineEndings() {
  for (const ending of ["\n", "\r", "\r\n"]) {
    await checkCopy(
      ["Subject: Test", "\tcontinued", "", "Body", "", ""].join(ending),
      "Subject: Test\r\n\tcontinued\r\n\r\nBody\r\n\r\n"
    );
  }
  await checkCopy(
    "Subject: Test\r\n\rBody\nLast",
    "Subject: Test\r\n\r\nBody\r\nLast"
  );
  await checkCopy("Body\r", "Body\r\n");
  await checkCopy("Body", "Body");
  await checkCopy("", "");
});

add_task(async function test_preserveMessageBytes() {
  await checkCopy(
    "From: sender@example.invalid\nSubject: Test\n\n\x80\xff\xe9\t \nFrom body",
    "From: sender@example.invalid\r\nSubject: Test\r\n\r\n\x80\xff\xe9\t \r\nFrom body"
  );
});

add_task(async function test_removeEnvelope() {
  const expected =
    "From: sender@example.invalid\r\nSubject: Test\r\n\r\nFrom body\r\n>From escaped\r\nLast";
  for (const [envelope, ending] of [
    ["From - Sat Oct 13 13:34:31 2007", "\r\n"],
    ["From sender@example.invalid Sa Okt 13 13:34:31 2007", "\n"],
    ["From ", "\r"],
  ]) {
    const input = `${envelope}${ending}${expected.replace(/\r\n/g, ending)}`;
    await checkCopy(input, expected);
  }
});

add_task(async function test_preserveOtherFromLines() {
  for (const firstLine of [
    "From: sender@example.invalid",
    ">From sender@example.invalid Sat Oct 13 13:34:31 2007",
    " From sender@example.invalid Sat Oct 13 13:34:31 2007",
    "X-Note: From sender@example.invalid",
  ]) {
    const input = `${firstLine}\r\nSubject: Test\r\n\r\nFrom body\r\n`;
    await checkCopy(input, input);
  }
  await checkCopy("From unterminated", "From unterminated");
  await checkCopy(
    "From - first\r\nFrom - second\r\nSubject: Test\r\n\r\nBody",
    "From - second\r\nSubject: Test\r\n\r\nBody"
  );
});

add_task(async function test_copyFailure() {
  for (const input of [
    "Subject: Test\n\nBody\n",
    "Subject: Test\r\n\r\nBody\r\n",
  ]) {
    const { sourcePath, file, listener, completion } = await startCopy(input);
    const existsBeforeCompletion = await IOUtils.exists(file.path);
    Assert.ok(
      existsBeforeCompletion,
      "The copied file should exist until the copy finishes"
    );
    listener.onStopCopy(Cr.NS_ERROR_FAILURE);
    await Assert.rejects(
      completion,
      /Copy file message failed/,
      "The import should reject when copying fails"
    );
    const exists = await IOUtils.exists(file.path);
    Assert.equal(
      exists,
      file.path === sourcePath,
      "Failure cleanup should remove only a prepared temporary file"
    );
    const original = await IOUtils.read(sourcePath);
    Assert.equal(
      MailStringUtils.uint8ArrayToByteString(original),
      input,
      "The original file should remain unchanged after failure"
    );
  }
});

/**
 * Replace a temporary file with a nonempty directory so cleanup fails.
 *
 * @param {string} path - Path of the temporary file.
 */
async function blockCleanup(path) {
  await IOUtils.remove(path);
  await IOUtils.makeDirectory(path);
  registerCleanupFunction(() =>
    IOUtils.remove(path, { recursive: true, ignoreAbsent: true })
  );
  await IOUtils.writeUTF8(PathUtils.join(path, "keep"), "cleanup failure");
}

add_task(async function test_cleanupFailurePreservesCopyResult() {
  for (const status of [Cr.NS_OK, Cr.NS_ERROR_FAILURE]) {
    const { sourcePath, file, listener, completion } = await startCopy(
      "Subject: Test\n\nBody\n"
    );
    await blockCleanup(file.path);
    listener.onStopCopy(status);
    if (Components.isSuccessCode(status)) {
      await completion;
    } else {
      await Assert.rejects(
        completion,
        /Copy file message failed with error 0x80004005/,
        "The copy error should survive a cleanup failure"
      );
    }
    const original = await IOUtils.readUTF8(sourcePath);
    Assert.equal(
      original,
      "Subject: Test\n\nBody\n",
      "The source file should remain unchanged when cleanup fails"
    );
  }
});

add_task(async function test_attachmentCleanupFailurePreservesCopyResult() {
  for (const status of [Cr.NS_OK, Cr.NS_ERROR_FAILURE]) {
    const attachment = new AttachmentInfo({
      contentType: "message/rfc822",
      url: "file:///message.eml",
      name: "message.eml",
      uri: "",
    });
    attachment.fetchAttachment = async () =>
      MailStringUtils.byteStringToUint8Array("Subject: Test\r\n\r\nBody\r\n")
        .buffer;
    const path = await IOUtils.createUniqueFile(
      PathUtils.profileDir,
      "attachment.eml",
      0o600
    );
    registerCleanupFunction(() => IOUtils.remove(path, { ignoreAbsent: true }));
    attachment.setupTempFile = async () => IOUtils.getFile(path);

    copyRequest = Promise.withResolvers();
    const completion = attachment.importToFolder(targetFolder);
    const args = await Promise.race([copyRequest.promise, completion]);
    Assert.equal(
      args[0].path,
      path,
      "The CRLF attachment file should be reused"
    );
    await blockCleanup(path);
    args[6].onStopCopy(status);
    if (Components.isSuccessCode(status)) {
      await completion;
    } else {
      await Assert.rejects(
        completion,
        /Copy file message failed with error 0x80004005/,
        "The copy error should survive attachment cleanup failure"
      );
    }
  }
});

add_task(async function test_importAttachment() {
  const input = "Subject: Test\n\n\xe9\n";
  const attachment = new AttachmentInfo({
    contentType: "message/rfc822",
    url: "file:///message.eml",
    name: "message.eml",
    uri: "",
  });
  attachment.fetchAttachment = async () =>
    MailStringUtils.byteStringToUint8Array(input).buffer;
  const attachmentPath = await IOUtils.createUniqueFile(
    PathUtils.profileDir,
    "attachment.eml",
    0o600
  );
  registerCleanupFunction(() =>
    IOUtils.remove(attachmentPath, { ignoreAbsent: true })
  );
  attachment.setupTempFile = async () => IOUtils.getFile(attachmentPath);

  copyRequest = Promise.withResolvers();
  const completion = attachment.importToFolder(targetFolder);
  const args = await Promise.race([copyRequest.promise, completion]);
  const file = args[0];
  registerCleanupFunction(() =>
    IOUtils.remove(file.path, { ignoreAbsent: true })
  );
  Assert.notEqual(
    file.path,
    attachmentPath,
    "The LF attachment should be prepared in a separate temporary file"
  );
  const prepared = await IOUtils.read(file.path);
  Assert.equal(
    MailStringUtils.uint8ArrayToByteString(prepared),
    "Subject: Test\r\n\r\n\xe9\r\n",
    "The attached message should be imported with CRLF line endings"
  );
  args[6].onStopCopy(Cr.NS_OK);
  await completion;
  const attachmentExists = await IOUtils.exists(attachmentPath);
  Assert.ok(
    !attachmentExists,
    "The attachment temporary file should be removed"
  );
  const preparedExists = await IOUtils.exists(file.path);
  Assert.ok(!preparedExists, "The prepared temporary file should be removed");
});
