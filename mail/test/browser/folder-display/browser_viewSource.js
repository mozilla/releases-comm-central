/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test that view-source content can be reloaded to change encoding.
 */

"use strict";

var utils = ChromeUtils.import("resource://testing-common/mozmill/utils.jsm");
var { be_in_folder, create_folder, get_about_message, mc, select_click_row } =
  ChromeUtils.import(
    "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
  );
var {
  click_menus_in_sequence,
  close_window,
  plan_for_new_window,
  wait_for_new_window,
} = ChromeUtils.import("resource://testing-common/mozmill/WindowHelpers.jsm");

var folder;

// Message content as stored in the message folder. Non-ASCII characters as
// escape codes for clarity.
var contentLatin1 = "Testar, ett tv\xE5 tre.";
var contentUTF8 = "Testar, ett tv\xC3\xA5 tre.";
// Message content as it should be displayed to the user.
var contentReadable = "Testar, ett två tre.";
// UTF-8 content displayed as Latin1.
var contentGarbled = "Testar, ett tvÃ¥ tre.";
// Latin1 content displayed as UTF-8.
var contentReplaced = "Testar, ett tv� tre.";

add_setup(async function () {
  folder = await create_folder("viewsource");
  addToFolder("ISO-8859-1 header/ISO-8859-1 body", "ISO-8859-1", contentLatin1);
  addToFolder("ISO-8859-1 header/UTF-8 body", "ISO-8859-1", contentUTF8);
  addToFolder("UTF-8 header/ISO-8859-1 body", "UTF-8", contentLatin1);
  addToFolder("UTF-8 header/UTF-8 body", "UTF-8", contentUTF8);

  await be_in_folder(folder);
});

registerCleanupFunction(() => {
  folder.deleteSelf(null);
});

/** Header matches the body. Should be readable in both places. */
add_task(async function latin1Header_with_latin1Body() {
  await subtest(0, contentReadable, contentReadable);
});
/** Header doesn't match the body. Unicode characters should be displayed. */
add_task(async function latin1Header_with_utf8Body() {
  await subtest(1, contentGarbled, contentGarbled);
});
/**
 * Header doesn't match the body. Unreadable characters should be replaced
 * in both places, but the view-source display defaults to windows-1252.
 */
add_task(async function utf8Header_with_latin1Body() {
  await subtest(2, contentReplaced, contentReadable);
});
/**
 * Header matches the body. Should be readable in both places, but the
 * view-source display defaults to windows-1252.
 */
add_task(async function utf8Header_with_utf8Body() {
  await subtest(3, contentReadable, contentGarbled);
});

function addToFolder(subject, charset, body) {
  let msgId = Services.uuid.generateUUID() + "@invalid";

  let source =
    "From - Sat Nov  1 12:39:54 2008\n" +
    "X-Mozilla-Status: 0001\n" +
    "X-Mozilla-Status2: 00000000\n" +
    "Message-ID: <" +
    msgId +
    ">\n" +
    "Date: Wed, 11 Jun 2008 20:32:02 -0400\n" +
    "From: Tester <tests@mozillamessaging.invalid>\n" +
    "MIME-Version: 1.0\n" +
    "To: anna@example.com\n" +
    `Subject: ${subject}` +
    "\n" +
    `Content-Type: text/plain; charset=${charset}\n` +
    "Content-Transfer-Encoding: 8bit\n" +
    "\n" +
    body +
    "\n";

  folder.QueryInterface(Ci.nsIMsgLocalMailFolder);
  folder.addMessage(source);

  return folder.msgDatabase.getMsgHdrForMessageID(msgId);
}

async function subtest(row, expectedDisplayed, expectedSource) {
  select_click_row(row);

  let aboutMessage = get_about_message();
  let displayContent =
    aboutMessage.getMessagePaneBrowser().contentDocument.body.textContent;
  Assert.stringContains(
    displayContent,
    expectedDisplayed,
    "Message content must include the readable text"
  );
  Assert.equal(
    aboutMessage.document.getElementById("messagepane").docShell.charset,
    "UTF-8"
  );

  plan_for_new_window("navigator:view-source");
  EventUtils.synthesizeKey("U", { shiftKey: false, accelKey: true });
  let viewSourceController = wait_for_new_window("navigator:view-source");

  utils.waitFor(
    () =>
      viewSourceController.window.document
        .getElementById("content")
        .contentDocument.querySelector("pre") != null,
    "Timeout waiting for the latin1 view-source document to load."
  );

  let source =
    viewSourceController.window.document.getElementById("content")
      .contentDocument.body.textContent;
  Assert.stringContains(
    source,
    expectedSource,
    "View source must contain the readable text"
  );

  let popupshown;

  // We can't use the menu on macOS.
  if (AppConstants.platform != "macosx") {
    let theContent =
      viewSourceController.window.document.getElementById("content");
    // Keep a reference to the originally loaded document.
    let doc = theContent.contentDocument;

    // Click the new window to make it receive further events properly.
    EventUtils.synthesizeMouseAtCenter(theContent, {}, theContent.ownerGlobal);
    await new Promise(resolve => setTimeout(resolve));

    popupshown = BrowserTestUtils.waitForEvent(
      viewSourceController.window.document.getElementById("viewmenu-popup"),
      "popupshown"
    );
    let menuView =
      viewSourceController.window.document.getElementById("menu_view");
    EventUtils.synthesizeMouseAtCenter(menuView, {}, menuView.ownerGlobal);
    await popupshown;

    Assert.equal(
      viewSourceController.window.document.getElementById(
        "repair-text-encoding"
      ).disabled,
      expectedSource == contentReadable
    );

    await click_menus_in_sequence(
      viewSourceController.window.document.getElementById("viewmenu-popup"),
      [{ id: "repair-text-encoding" }]
    );

    if (expectedSource != contentReadable) {
      utils.waitFor(
        () =>
          viewSourceController.window.document.getElementById("content")
            .contentDocument != doc &&
          viewSourceController.window.document
            .getElementById("content")
            .contentDocument.querySelector("pre") != null,
        "Timeout waiting utf-8 encoded view-source document to load."
      );

      source =
        viewSourceController.window.document.getElementById("content")
          .contentDocument.body.textContent;
      Assert.stringContains(
        source,
        contentReadable,
        "View source must contain the readable text"
      );
    }
  }

  // Check the context menu while were here.
  let browser = viewSourceController.window.document.getElementById("content");
  let contextMenu = viewSourceController.window.document.getElementById(
    "viewSourceContextMenu"
  );
  popupshown = BrowserTestUtils.waitForEvent(contextMenu, "popupshown");
  await BrowserTestUtils.synthesizeMouseAtCenter(
    "body",
    { type: "contextmenu" },
    browser
  );
  await popupshown;

  let actualItems = [];
  for (let item of contextMenu.children) {
    if (item.localName == "menuitem" && !item.hidden) {
      actualItems.push(item.id);
    }
  }
  Assert.deepEqual(actualItems, [
    "cMenu_copy",
    "cMenu_selectAll",
    "cMenu_find",
    "cMenu_findAgain",
  ]);
  contextMenu.hidePopup();

  close_window(viewSourceController);
}
