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
  mc,
  open_message_from_file,
  select_click_row,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);
var { click_menus_in_sequence, close_window } = ChromeUtils.import(
  "resource://testing-common/mozmill/WindowHelpers.jsm"
);

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

var folder;

// Some text from defective-charset.eml
const SOME_SPANISH = "estos últimos meses siento";

add_setup(async function () {
  folder = await create_folder("FolderWithDefectiveCharset");
  registerCleanupFunction(() => folder.deleteSelf(null));
});

add_task(async function test_forward_direct() {
  let file = new FileUtils.File(getTestFilePath("data/defective-charset.eml"));
  let msgc = await open_message_from_file(file);

  let cwc = open_compose_with_forward(msgc);

  let mailText =
    cwc.window.document.getElementById("messageEditor").contentDocument.body
      .textContent;

  Assert.ok(
    mailText.includes(SOME_SPANISH),
    "forwarded content should be correctly encoded"
  );

  close_compose_window(cwc);
  close_window(msgc);
});

add_task(async function test_forward_from_folder() {
  await be_in_folder(folder);

  let file = new FileUtils.File(getTestFilePath("data/defective-charset.eml"));
  let msgc = await open_message_from_file(file);
  let aboutMessage = get_about_message(msgc.window);

  // Copy the message to a folder.
  let documentChild =
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
  close_window(msgc);

  let msg = select_click_row(0);
  assert_selected_and_displayed(mc, msg);

  Assert.ok(
    get_about_message()
      .document.getElementById("messagepane")
      .contentDocument.body.textContent.includes(SOME_SPANISH)
  );

  let cwc = open_compose_with_forward();

  let mailText =
    cwc.window.document.getElementById("messageEditor").contentDocument.body
      .textContent;

  Assert.ok(
    mailText.includes(SOME_SPANISH),
    "forwarded content should be correctly encoded"
  );

  close_compose_window(cwc);
});
