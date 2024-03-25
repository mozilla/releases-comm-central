/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { get_about_message, open_message_from_file } = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);

/**
 * Bug 1358565
 * Check that a non-empty image is shown as attachment and is detected as non-empty
 * when message is viewed as plain text.
 */
add_task(async function test_attachment_not_empty() {
  Services.prefs.setBoolPref("mailnews.display.prefer_plaintext", true);

  const file = new FileUtils.File(getTestFilePath("data/bug1358565.eml"));

  const msgc = await open_message_from_file(file);
  const aboutMessage = get_about_message(msgc);

  EventUtils.synthesizeMouseAtCenter(
    aboutMessage.document.getElementById("attachmentToggle"),
    {},
    aboutMessage
  );
  Assert.equal(
    aboutMessage.document.getElementById("attachmentList").itemCount,
    1
  );

  const attachmentElem = aboutMessage.document
    .getElementById("attachmentList")
    .getItemAtIndex(0);
  Assert.equal(attachmentElem.attachment.contentType, "image/jpeg");
  Assert.equal(attachmentElem.attachment.name, "bug.png");
  Assert.ok(attachmentElem.attachment.hasFile);
  Assert.ok(
    !(await attachmentElem.attachment.isEmpty()),
    "Attachment incorrectly determined empty"
  );

  await BrowserTestUtils.closeWindow(msgc);

  Services.prefs.clearUserPref("mailnews.display.prefer_plaintext");
});
