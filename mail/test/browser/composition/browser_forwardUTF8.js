/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that UTF-8 messages are correctly forwarded.
 */

"use strict";

var { close_compose_window, get_compose_body, open_compose_with_forward } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/ComposeHelpers.sys.mjs"
  );
var {
  assert_selected_and_displayed,
  be_in_folder,
  create_folder,
  get_about_message,
  open_message_from_file,
  press_delete,
  select_click_row,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);
var { click_menus_in_sequence } = ChromeUtils.importESModule(
  "resource://testing-common/mail/WindowHelpers.sys.mjs"
);

var folderToSendFrom;

add_setup(async function () {
  requestLongerTimeout(2);
  folderToSendFrom = await create_folder("FolderWithUTF8");
});

function check_content(window) {
  const mailBody = get_compose_body(window);

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
  const file = new FileUtils.File(getTestFilePath(`data/${aFilePath}`));
  const msgc = await open_message_from_file(file);

  const cwc = await open_compose_with_forward(msgc);

  check_content(cwc);

  await close_compose_window(cwc);
  await BrowserTestUtils.closeWindow(msgc);
}

async function forwardViaFolder(aFilePath) {
  await be_in_folder(folderToSendFrom);

  const file = new FileUtils.File(getTestFilePath(`data/${aFilePath}`));
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
      { label: "FolderWithUTF8" },
    ]
  );
  await BrowserTestUtils.closeWindow(msgc);

  const msg = await select_click_row(0);
  await assert_selected_and_displayed(window, msg);

  Assert.ok(
    get_about_message()
      .document.getElementById("messagepane")
      .contentDocument.body.textContent.includes("áóúäöüß")
  );

  const fwdWin = await open_compose_with_forward();

  check_content(fwdWin);

  await close_compose_window(fwdWin);

  await press_delete(window);
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
