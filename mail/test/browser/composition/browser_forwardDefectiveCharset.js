/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that messages without properly declared charset are correctly forwarded.
 */

"use strict";

var { close_compose_window, open_compose_with_forward } = ChromeUtils.import(
  "resource://testing-common/mozmill/ComposeHelpers.jsm"
);
var {
  assert_selected_and_displayed,
  be_in_folder,
  create_folder,
  get_about_message,
  open_message_from_file,
  select_click_row,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);
var { click_menus_in_sequence } = ChromeUtils.import(
  "resource://testing-common/mozmill/WindowHelpers.jsm"
);

var folder;

// Some text from defective-charset.eml
const SOME_SPANISH = "estos últimos meses siento";

add_setup(async function () {
  folder = await create_folder("FolderWithDefectiveCharset");
  registerCleanupFunction(() => folder.deleteSelf(null));
});

add_task(async function test_forward_direct() {
  const file = new FileUtils.File(
    getTestFilePath("data/defective-charset.eml")
  );
  const msgc = await open_message_from_file(file);

  const cwc = await open_compose_with_forward(msgc);

  const mailText =
    cwc.document.getElementById("messageEditor").contentDocument.body
      .textContent;

  Assert.ok(
    mailText.includes(SOME_SPANISH),
    "forwarded content should be correctly encoded"
  );

  await close_compose_window(cwc);
  await BrowserTestUtils.closeWindow(msgc);
});

add_task(async function test_forward_from_folder() {
  await be_in_folder(folder);

  const file = new FileUtils.File(
    getTestFilePath("data/defective-charset.eml")
  );
  const msgc = await open_message_from_file(file);
  const aboutMessage = get_about_message(msgc);

  // Copy the message to a folder.
  const documentChild =
    aboutMessage.document.getElementById("messagepane").contentDocument
      .documentElement;
  EventUtils.synthesizeMouseAtCenter(
    documentChild,
    { type: "contextmenu", button: 2 },
    documentChild.ownerGlobal
  );
  await click_menus_in_sequence(
    aboutMessage.document.getElementById("mailContext"),
    [
      { id: "mailContext-copyMenu" },
      { label: "Local Folders" },
      { label: folder.name },
    ]
  );
  await BrowserTestUtils.closeWindow(msgc);

  const msg = await select_click_row(0);
  await assert_selected_and_displayed(window, msg);

  Assert.ok(
    get_about_message()
      .document.getElementById("messagepane")
      .contentDocument.body.textContent.includes(SOME_SPANISH)
  );

  const cwc = await open_compose_with_forward();

  const mailText =
    cwc.document.getElementById("messageEditor").contentDocument.body
      .textContent;

  Assert.ok(
    mailText.includes(SOME_SPANISH),
    "forwarded content should be correctly encoded"
  );

  await close_compose_window(cwc);
});
