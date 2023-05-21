/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that UTF-8 messages are correctly forwarded.
 */

"use strict";

var { close_compose_window, get_compose_body, open_compose_with_forward } =
  ChromeUtils.import("resource://testing-common/mozmill/ComposeHelpers.jsm");
var {
  assert_selected_and_displayed,
  be_in_folder,
  create_folder,
  get_about_message,
  mc,
  open_message_from_file,
  press_delete,
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

var folderToSendFrom;

add_setup(async function () {
  requestLongerTimeout(2);
  folderToSendFrom = await create_folder("FolderWithUTF8");
});

function check_content(window) {
  let mailBody = get_compose_body(window);

  let node = mailBody.firstChild;
  while (node) {
    if (node.classList.contains("moz-forward-container")) {
      // We found the forward container. Let's look for our text.
      node = node.firstChild;
      while (node) {
        // We won't find the exact text in the DOM but we'll find our string.
        if (node.nodeName == "#text" && node.nodeValue.includes("áóúäöüß")) {
          return;
        }
        node = node.nextSibling;
      }
      // Text not found in the forward container.
      Assert.ok(false, "Failed to find forwarded text");
      return;
    }
    node = node.nextSibling;
  }

  Assert.ok(false, "Failed to find forward container");
}

async function forwardDirect(aFilePath) {
  let file = new FileUtils.File(getTestFilePath(`data/${aFilePath}`));
  let msgc = await open_message_from_file(file);

  let cwc = open_compose_with_forward(msgc);

  check_content(cwc);

  close_compose_window(cwc);
  close_window(msgc);
}

async function forwardViaFolder(aFilePath) {
  await be_in_folder(folderToSendFrom);

  let file = new FileUtils.File(getTestFilePath(`data/${aFilePath}`));
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
      { label: "FolderWithUTF8" },
    ]
  );
  close_window(msgc);

  let msg = select_click_row(0);
  assert_selected_and_displayed(mc, msg);

  Assert.ok(
    get_about_message()
      .document.getElementById("messagepane")
      .contentDocument.body.textContent.includes("áóúäöüß")
  );

  let fwdWin = open_compose_with_forward();

  check_content(fwdWin);

  close_compose_window(fwdWin);

  press_delete(mc);
}

add_task(async function test_utf8_forwarding_from_opened_file() {
  await forwardDirect("./content-utf8-rel-only.eml");
  await forwardDirect("./content-utf8-rel-alt.eml");
  await forwardDirect("./content-utf8-alt-rel.eml");

  Assert.report(
    false,
    undefined,
    undefined,
    "Test ran to completion successfully"
  );
});

add_task(async function test_utf8_forwarding_from_via_folder() {
  await forwardViaFolder("./content-utf8-rel-only.eml");
  await forwardViaFolder("./content-utf8-rel-alt.eml"); // Also tests HTML part without <html> tag.
  await forwardViaFolder("./content-utf8-alt-rel.eml"); // Also tests <html attr>.
  await forwardViaFolder("./content-utf8-alt-rel2.eml"); // Also tests content before <html>.

  // Repeat the last three in simple HTML view.
  Services.prefs.setIntPref("mailnews.display.html_as", 3);
  await forwardViaFolder("./content-utf8-rel-alt.eml"); // Also tests HTML part without <html> tag.
  await forwardViaFolder("./content-utf8-alt-rel.eml"); // Also tests <html attr>.
  await forwardViaFolder("./content-utf8-alt-rel2.eml"); // Also tests content before <html>.
});

registerCleanupFunction(function () {
  Services.prefs.clearUserPref("mailnews.display.html_as");
});
