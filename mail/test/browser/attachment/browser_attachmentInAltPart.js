/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { get_about_message, open_message_from_file } = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);

/**
 * Check that an attachment inside a multipart/alternative (instead of the
 * standard multipart/mixed) is still shown as an attachment and its content
 * does not leak into the message body.
 */
add_task(async function test_attachment_in_multipart_alternative() {
  // The attachment content is text/plain but marked as application/octet-stream
  // as a placeholder for any binary file type that gets PRIORITY_UNDISPLAYABLE.
  const file = new FileUtils.File(
    getTestFilePath("data/multipart-alternative-with-attachment.eml")
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
    "attachment inside multipart/alternative should be visible"
  );

  const attachmentElem = aboutMessage.document
    .getElementById("attachmentList")
    .getItemAtIndex(0);
  Assert.equal(attachmentElem.attachment.name, "attachment.txt");

  const bodyText =
    aboutMessage.getMessagePaneBrowser().contentDocument.documentElement
      .textContent;
  Assert.stringContains(
    bodyText,
    "This is the plain text body.",
    "plain text body should be displayed"
  );
  Assert.ok(
    !bodyText.includes("Attachment in multipart/alternative."),
    "attachment content must not leak into message body"
  );

  await BrowserTestUtils.closeWindow(msgc);
});
