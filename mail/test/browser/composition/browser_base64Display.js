/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that messages with "broken" base64 are correctly displayed.
 */

"use strict";

var { get_about_message, open_message_from_file } = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);

add_task(async function test_base64_display() {
  const file = new FileUtils.File(
    getTestFilePath("data/base64-with-whitespace.eml")
  );
  const msgc = await open_message_from_file(file);
  const aboutMessage = get_about_message(msgc);
  const bodyText = aboutMessage.document
    .getElementById("messagepane")
    .contentDocument.querySelector("body").textContent;
  await BrowserTestUtils.closeWindow(msgc);

  Assert.ok(
    bodyText.includes("abcdefghijklmnopqrstuvwxyz"),
    "Decode base64 body from message."
  );
});

add_task(async function test_base64_display2() {
  const file = new FileUtils.File(
    getTestFilePath("data/base64-bug1586890.eml")
  );
  const msgc = await open_message_from_file(file);
  const aboutMessage = get_about_message(msgc);
  const bodyText = aboutMessage.document
    .getElementById("messagepane")
    .contentDocument.querySelector("body").textContent;
  await BrowserTestUtils.closeWindow(msgc);

  Assert.ok(
    bodyText.includes("abcdefghijklm"),
    "Decode base64 body from UTF-16 message with broken charset."
  );
});
