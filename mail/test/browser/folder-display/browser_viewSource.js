/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test that view-source content can be reloaded to change encoding.
 */

"use strict";

var { be_in_folder, create_folder, get_about_message, select_click_row } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
  );
var { click_menus_in_sequence, promise_new_window } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/WindowHelpers.sys.mjs"
  );

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
  const msgId = Services.uuid.generateUUID() + "@invalid";

  const source =
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
  await select_click_row(row);

  const aboutMessage = get_about_message();
  const displayContent =
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

  const viewSourcePromise = promise_new_window("navigator:view-source");
  EventUtils.synthesizeKey("U", { shiftKey: false, accelKey: true });
  const viewSourceWin = await viewSourcePromise;

  await TestUtils.waitForCondition(
    () =>
      viewSourceWin.document
        .getElementById("content")
        .contentDocument.querySelector("pre") != null,
    "Timeout waiting for the latin1 view-source document to load."
  );

  let source =
    viewSourceWin.document.getElementById("content").contentDocument.body
      .textContent;
  Assert.stringContains(
    source,
    expectedSource,
    "View source must contain the readable text"
  );

  let popupshown;

  // We can't use the menu on macOS.
  if (AppConstants.platform != "macosx") {
    const theContent = viewSourceWin.document.getElementById("content");
    // Keep a reference to the originally loaded document.
    const doc = theContent.contentDocument;

    // Click the new window to make it receive further events properly.
    EventUtils.synthesizeMouseAtCenter(theContent, {}, theContent.ownerGlobal);
    await new Promise(resolve => setTimeout(resolve));

    popupshown = BrowserTestUtils.waitForEvent(
      viewSourceWin.document.getElementById("viewmenu-popup"),
      "popupshown"
    );
    const menuView = viewSourceWin.document.getElementById("menu_view");
    EventUtils.synthesizeMouseAtCenter(menuView, {}, menuView.ownerGlobal);
    await popupshown;

    Assert.equal(
      viewSourceWin.document.getElementById("repair-text-encoding").disabled,
      expectedSource == contentReadable
    );

    await click_menus_in_sequence(
      viewSourceWin.document.getElementById("viewmenu-popup"),
      [{ id: "repair-text-encoding" }]
    );

    if (expectedSource != contentReadable) {
      await TestUtils.waitForCondition(
        () =>
          viewSourceWin.document.getElementById("content").contentDocument !=
            doc &&
          viewSourceWin.document
            .getElementById("content")
            .contentDocument.querySelector("pre") != null,
        "Timeout waiting utf-8 encoded view-source document to load."
      );

      source =
        viewSourceWin.document.getElementById("content").contentDocument.body
          .textContent;
      Assert.stringContains(
        source,
        contentReadable,
        "View source must contain the readable text"
      );
    }
  }

  // Check the context menu while were here.
  const browser = viewSourceWin.document.getElementById("content");
  const contextMenu = viewSourceWin.document.getElementById(
    "viewSourceContextMenu"
  );
  popupshown = BrowserTestUtils.waitForEvent(contextMenu, "popupshown");
  await BrowserTestUtils.synthesizeMouseAtCenter(
    "body",
    { type: "contextmenu" },
    browser
  );
  await popupshown;

  const actualItems = [];
  for (const item of contextMenu.children) {
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

  await BrowserTestUtils.closeWindow(viewSourceWin);
}
