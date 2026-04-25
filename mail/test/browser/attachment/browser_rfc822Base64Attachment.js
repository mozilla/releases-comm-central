/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { get_about_message, open_message_from_file } = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);

/**
 * Check that a message/rfc822 attachment encoded with base64 (technically
 * invalid per RFC 2046 but produced by real-world senders) is decoded and
 * shown as a non-empty attachment rather than raw base64 data.
 */
add_task(async function test_rfc822_base64_attachment_decoded() {
  const file = new FileUtils.File(
    getTestFilePath("data/rfc822_base64_attachment.eml")
  );
  const msgc = await open_message_from_file(file);
  const aboutMessage = get_about_message(msgc);

  EventUtils.synthesizeMouseAtCenter(
    aboutMessage.document.getElementById("attachmentToggle"),
    {},
    aboutMessage
  );
  Assert.equal(
    aboutMessage.document.getElementById("attachmentList").itemCount,
    1,
    "base64-encoded message/rfc822 attachment should be visible"
  );

  const attachmentElem = aboutMessage.document
    .getElementById("attachmentList")
    .getItemAtIndex(0);
  Assert.equal(
    attachmentElem.attachment.contentType,
    "message/rfc822",
    "attachment content type should be message/rfc822"
  );
  // Name is derived from the inner message subject; falls back to
  // "ForwardedMessage.eml" if the inner message was not parsed correctly.
  Assert.equal(
    attachmentElem.attachment.name,
    "Hi.eml",
    "attachment name should be derived from inner message subject"
  );
  // Size matches the decoded inner message, not the raw base64 blob; proxy for
  // successful CTE decoding.
  Assert.equal(
    attachmentElem.attachment.size,
    160,
    "attachment size should match decoded inner message byte count"
  );
  Assert.ok(
    attachmentElem.attachment.hasFile,
    "attachment should have file content"
  );
  Assert.ok(
    !(await attachmentElem.attachment.isEmpty()),
    "base64-encoded message/rfc822 attachment should not be empty"
  );

  await BrowserTestUtils.closeWindow(msgc);
});
