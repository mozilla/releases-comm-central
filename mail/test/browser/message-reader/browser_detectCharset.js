/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/**
 * Tests that opening an .eml file the body of the message is correct,
 * that it hasn't been UTF-8 mojibake'd.
 */

"use strict";

var { get_about_message, open_message_from_file } = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);

var gReferenceTextContent;

add_setup(async function () {
  Services.prefs.setBoolPref("mailnews.display.prefer_plaintext", false);
  Services.prefs.setIntPref("mailnews.display.html_as", 0);
  Services.prefs.setIntPref("mailnews.display.disallow_mime_handlers", 0);

  const { textContent } = await extract_eml_body_textcontent(
    "./correctEncodingUTF8.eml",
    false
  );
  gReferenceTextContent = textContent;
});

async function check_display_charset(eml, expectedCharset) {
  const file = new FileUtils.File(getTestFilePath(`data/${eml}`));
  const msgc = await open_message_from_file(file);
  const aboutMessage = get_about_message(msgc);
  is(aboutMessage.currentCharacterSet, expectedCharset);
  await BrowserTestUtils.closeWindow(msgc);
}

async function extract_eml_body_textcontent(eml, autodetect = true) {
  const file = new FileUtils.File(getTestFilePath(`data/${eml}`));
  const msgc = await open_message_from_file(file);
  const aboutMessage = get_about_message(msgc);

  if (autodetect) {
    // Open other actions menu.
    const popup = aboutMessage.document.getElementById("otherActionsPopup");
    const popupShown = BrowserTestUtils.waitForEvent(popup, "popupshown");
    EventUtils.synthesizeMouseAtCenter(
      aboutMessage.document.getElementById("otherActionsButton"),
      {},
      aboutMessage
    );
    await popupShown;

    // Click on the "Repair Text Encoding" item.
    const hiddenPromise = BrowserTestUtils.waitForEvent(popup, "popuphidden");
    const reloadPromise = BrowserTestUtils.browserLoaded(
      aboutMessage.getMessagePaneBrowser()
    );
    EventUtils.synthesizeMouseAtCenter(
      aboutMessage.document.getElementById("charsetRepairMenuitem"),
      {},
      aboutMessage
    );
    await hiddenPromise;
    await reloadPromise;
  }

  const textContent =
    aboutMessage.getMessagePaneBrowser().contentDocument.documentElement
      .textContent;
  const charset = aboutMessage.currentCharacterSet;
  await BrowserTestUtils.closeWindow(msgc);
  return { textContent, charset };
}

/**
 * Checks that the text content is equal for the .eml files and that
 * the expected charset was detected.
 */
async function check_eml_textcontent(eml, expectedCharset) {
  const { textContent, charset } = await extract_eml_body_textcontent(eml);
  is(textContent, gReferenceTextContent);
  is(charset, expectedCharset);
}

add_task(async function test_noCharset() {
  await check_display_charset("./noCharsetKOI8U.eml", "KOI8-U");
  await check_display_charset("./noCharsetWindows1252.eml", "windows-1252");
});

add_task(async function test_wronglyDeclaredCharset() {
  await check_eml_textcontent("./wronglyDeclaredUTF8.eml", "UTF-8");
  await check_eml_textcontent("./wronglyDeclaredShift_JIS.eml", "Shift_JIS");
});
