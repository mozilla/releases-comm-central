/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that mailbox: URLs of .eml files only open the file when the channel
 * is read, not when it's created, so that the content policy is consulted
 * before the file is opened.
 */

const { NetUtil } = ChromeUtils.importESModule(
  "resource://gre/modules/NetUtil.sys.mjs"
);

/**
 * @param {string} path
 * @returns {string} A mailbox: URL for the file at `path`.
 */
function mailboxURL(path) {
  const fileURL = Services.io.newURI(PathUtils.toFileURI(path));
  return `mailbox://${fileURL.pathQueryRef}?number=0`;
}

/**
 * @param {string} path
 * @returns {nsIChannel}
 */
function newChannel(path) {
  return NetUtil.newChannel({
    uri: mailboxURL(path),
    loadUsingSystemPrincipal: true,
  });
}

/**
 * @param {nsIChannel} channel
 * @returns {Promise<{status: nsresult, data: string}>}
 */
function readChannel(channel) {
  return new Promise(resolve => {
    try {
      NetUtil.asyncFetch(channel, (stream, status) => {
        resolve({
          status,
          data: Components.isSuccessCode(status)
            ? NetUtil.readInputStreamToString(stream, stream.available())
            : "",
        });
      });
    } catch (ex) {
      resolve({ status: ex.result, data: "" });
    }
  });
}

add_task(async function test_missingFile() {
  const path = PathUtils.join(PathUtils.tempDir, "missing.eml");
  const channel = newChannel(path);
  Assert.ok(channel, "creating a channel should not open the file");
  const { status } = await readChannel(channel);
  Assert.equal(
    status,
    Cr.NS_ERROR_FILE_NOT_FOUND,
    "reading the channel should fail"
  );
});

add_task(async function test_existingFile() {
  const path = PathUtils.join(PathUtils.tempDir, "existing.eml");
  await IOUtils.writeUTF8(
    path,
    "From: sender@example.com\r\nSubject: Deferred open\r\n\r\nBody\r\n"
  );
  registerCleanupFunction(() => IOUtils.remove(path));
  const { status, data } = await readChannel(newChannel(path));
  Assert.equal(status, Cr.NS_OK, "reading the channel should succeed");
  Assert.stringContains(
    data,
    "Subject: Deferred open",
    "the message should be read"
  );
});

add_task(async function test_contentPolicyRejection() {
  // Load the file as an image in another message, which the mail content
  // policy rejects. The file doesn't exist, so the load would fail differently
  // if the file was opened before the content policy was consulted.
  const path = PathUtils.join(PathUtils.tempDir, "rejected.eml");
  const messagePrincipal =
    Services.scriptSecurityManager.createContentPrincipal(
      Services.io.newURI(
        mailboxURL(PathUtils.join(PathUtils.tempDir, "message.eml"))
      ),
      {}
    );
  const channel = NetUtil.newChannel({
    uri: mailboxURL(path),
    loadingPrincipal: messagePrincipal,
    securityFlags: Ci.nsILoadInfo.SEC_ALLOW_CROSS_ORIGIN_INHERITS_SEC_CONTEXT,
    contentPolicyType: Ci.nsIContentPolicy.TYPE_IMAGE,
  });
  const { status } = await readChannel(channel);
  Assert.equal(
    status,
    Cr.NS_ERROR_CONTENT_BLOCKED,
    "the content policy should reject the load before the file is opened"
  );
});
