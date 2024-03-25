/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that opening an .eml file with empty subject works.
 */

"use strict";

var { open_message_from_file } = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);

async function check_eml_window_title(subject, eml) {
  const file = new FileUtils.File(getTestFilePath(`data/${eml}`));
  const msgc = await open_message_from_file(file);

  const brandBundle = Services.strings.createBundle(
    "chrome://branding/locale/brand.properties"
  );
  const productName = brandBundle.GetStringFromName("brandFullName");
  let expectedTitle = subject;
  if (expectedTitle && AppConstants.platform != "macosx") {
    expectedTitle += " - ";
  }

  if (!expectedTitle || AppConstants.platform != "macosx") {
    expectedTitle += productName;
  }

  await TestUtils.waitForCondition(() => msgc.document.title == expectedTitle);
  Assert.equal(msgc.document.title, expectedTitle);
  await BrowserTestUtils.closeWindow(msgc);
}

add_task(async function test_eml_empty_subject() {
  await check_eml_window_title("", "./emptySubject.eml");
});

add_task(async function test_eml_normal_subject() {
  await check_eml_window_title("An email", "./evil.eml");
});
