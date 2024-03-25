/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that the plain text part of multipart/alternative messages can be correctly viewed.
 */

"use strict";

var { open_message_from_file } = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);

/**
 * Retrieve the textual content of the message and compare it.
 *
 * @param aWindow         Message window.
 * @param aExpected       Expected content.
 * @param aDontWantToSee  Content of other MIME parts we don't want to see.
 */
function check_content(aWindow, aExpected, aDontWantToSee) {
  const messageContent = aWindow.content.document.documentElement.textContent;

  if (aExpected != aDontWantToSee) {
    Assert.ok(
      messageContent.includes(aExpected),
      "Didn't find expected content"
    );
    Assert.ok(
      !messageContent.includes(aDontWantToSee),
      "Found content that shouldn't be there"
    );
  } else {
    const ind = messageContent.indexOf(aExpected);
    Assert.ok(ind >= 0, "Didn't find expected content");
    if (ind >= 0) {
      Assert.ok(
        !messageContent.substr(ind + aExpected.length).includes(aExpected),
        "Found content a second time"
      );
    }
  }
}

/**
 * Load a message from a file and display it as plain text and HTML. Check that the
 * correct MIME part is displayed.
 *
 * @param aFilePath            Path to the file containing the message to load and display.
 * @param aExpectedPlainText   Expected content when viewed as plain text.
 * @param aExpectedHTML        Expected content when viewed as HTML.
 */
async function checkSingleMessage(
  aFilePath,
  aExpectedPlainText,
  aExpectedHTML
) {
  const file = new FileUtils.File(getTestFilePath(`data/${aFilePath}`));

  // Load and display as plain text.
  Services.prefs.setBoolPref("mailnews.display.prefer_plaintext", true);
  Services.prefs.setIntPref("mailnews.display.html_as", 1);
  let msgc = await open_message_from_file(file);
  check_content(msgc, aExpectedPlainText, aExpectedHTML);
  await BrowserTestUtils.closeWindow(msgc);

  // Load and display as HTML.
  Services.prefs.setBoolPref("mailnews.display.prefer_plaintext", false);
  Services.prefs.setIntPref("mailnews.display.html_as", 0);
  msgc = await open_message_from_file(file);
  check_content(msgc, aExpectedHTML, aExpectedPlainText);
  await BrowserTestUtils.closeWindow(msgc);
}

/**
 * Tests that messages with various MIME parts are shown correctly when displayed
 * as plain text or HTML.
 */
add_task(async function test_view() {
  // First the straight forward tests:
  // 1) multipart/alternative
  // 2) multipart/alternative with embedded multipart/related
  // 3) multipart/alternative with embedded multipart/related embedded in multipart/mixed
  await checkSingleMessage("./test-alt.eml", "Plain Text", "HTML Body");
  await checkSingleMessage("./test-alt-rel.eml", "Plain Text", "HTML Body");
  await checkSingleMessage(
    "./test-alt-rel-with-attach.eml",
    "Plain Text",
    "HTML Body"
  );

  // 4) HTML part missing
  // 5) Plain part missing
  await checkSingleMessage(
    "./test-alt-HTML-missing.eml",
    "Plain Text",
    "Plain Text"
  );
  await checkSingleMessage(
    "./test-alt-plain-missing.eml",
    "HTML Body",
    "HTML Body"
  );

  // 6) plain and HTML parts reversed in order
  await checkSingleMessage(
    "./test-alt-plain-HTML-reversed.eml",
    "Plain Text",
    "HTML Body"
  );

  // 7) 3 alt. parts with 2 plain and 1 HTML part
  await checkSingleMessage("./test-triple-alt.eml", "Plain Text", "HTML Body");

  // 8) 3 alt. parts with 2 plain and 1 multipart/related
  await checkSingleMessage(
    "./test-alt-rel-text.eml",
    "Plain Text",
    "HTML Body"
  );

  // Now some cases that don't work yet.
  // 9) multipart/related with embedded multipart/alternative
  await checkSingleMessage("./test-rel-alt.eml", "HTML Body", "HTML Body");

  // Bug 1367156: Rogue message which has an image as the last part.
  await checkSingleMessage("./test-alt-rogue.eml", "Plain Text", "HTML Body");
  await checkSingleMessage("./test-alt-rogue2.eml", "Plain Text", "HTML Body");
});

registerCleanupFunction(function () {
  Services.prefs.clearUserPref("mailnews.display.prefer_plaintext");
  Services.prefs.clearUserPref("mailnews.display.html_as");
});
