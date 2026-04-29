/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { get_about_message, open_message_from_file } = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);

async function checkAttachmentVisible(expectedBodyText, missingBodyText) {
  const file = new FileUtils.File(
    getTestFilePath("data/malformed_hidden_alt_attachment.eml")
  );
  const msgc = await open_message_from_file(file);
  const aboutMessage = get_about_message(msgc);

  const messageContent =
    aboutMessage.getMessagePaneBrowser().contentDocument.documentElement
      .textContent;
  Assert.ok(
    messageContent.includes(expectedBodyText),
    `should show ${expectedBodyText}`
  );
  Assert.ok(
    !messageContent.includes(missingBodyText),
    `should not show ${missingBodyText}`
  );

  EventUtils.synthesizeMouseAtCenter(
    aboutMessage.document.getElementById("attachmentToggle"),
    {},
    aboutMessage
  );

  const attachmentList = aboutMessage.document.getElementById("attachmentList");
  Assert.equal(attachmentList.itemCount, 1, "should have one attachment");

  const attachmentElem = attachmentList.getItemAtIndex(0);
  Assert.equal(attachmentElem.attachment.name, "binary.bin");

  await BrowserTestUtils.closeWindow(msgc);
}

add_task(async function test_attachment_in_hidden_alternative_plaintext() {
  Services.prefs.setBoolPref("mailnews.display.prefer_plaintext", true);
  Services.prefs.setIntPref("mailnews.display.html_as", 1);
  await checkAttachmentVisible(
    "This is the plain text part",
    "This is the HTML part"
  );
});

add_task(async function test_attachment_in_hidden_alternative_html() {
  Services.prefs.setBoolPref("mailnews.display.prefer_plaintext", false);
  Services.prefs.setIntPref("mailnews.display.html_as", 0);
  await checkAttachmentVisible(
    "This is the HTML part",
    "This is the plain text part"
  );
});

registerCleanupFunction(function () {
  Services.prefs.clearUserPref("mailnews.display.prefer_plaintext");
  Services.prefs.clearUserPref("mailnews.display.html_as");
});
