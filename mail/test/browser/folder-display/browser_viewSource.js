/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test that view-source content can be reloaded to change encoding.
 */

"use strict";

var { be_in_folder, create_folder, mc, select_click_row } = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);
var {
  close_window,
  plan_for_new_window,
  wait_for_new_window,
} = ChromeUtils.import("resource://testing-common/mozmill/WindowHelpers.jsm");

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

var folder = create_folder("viewsource");
registerCleanupFunction(() => {
  folder.deleteSelf(null);
});

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

addToFolder("ISO-8859-1 header/ISO-8859-1 body", "ISO-8859-1", contentLatin1);
addToFolder("ISO-8859-1 header/UTF-8 body", "ISO-8859-1", contentUTF8);
addToFolder("UTF-8 header/ISO-8859-1 body", "UTF-8", contentLatin1);
addToFolder("UTF-8 header/UTF-8 body", "UTF-8", contentUTF8);

be_in_folder(folder);

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
  let msgId =
    Cc["@mozilla.org/uuid-generator;1"]
      .getService(Ci.nsIUUIDGenerator)
      .generateUUID() + "@invalid";

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

  let displayContent = mc.e("messagepane").contentDocument.body.textContent;
  Assert.stringContains(
    displayContent,
    expectedDisplayed,
    "Message content must include the readable text"
  );
  Assert.equal(mc.e("messagepane").docShell.charset, "UTF-8");

  plan_for_new_window("navigator:view-source");
  EventUtils.synthesizeKey("U", { shiftKey: false, accelKey: true });
  let vsc = wait_for_new_window("navigator:view-source");

  vsc.waitFor(
    () => vsc.e("content").contentDocument.querySelector("pre") != null,
    "Timeout waiting for the latin1 view-source document to load."
  );

  let source = vsc.e("content").contentDocument.body.textContent;
  Assert.stringContains(
    source,
    expectedSource,
    "View source must contain the readable text"
  );

  let popupshown;

  // We can't use the menu on macOS.
  if (AppConstants.platform != "macosx") {
    // Keep a reference to the originally loaded document.
    let doc = vsc.e("content").contentDocument;

    // Click the new window to make it receive further events properly.
    vsc.click(vsc.e("content"));
    await new Promise(resolve => setTimeout(resolve));

    popupshown = BrowserTestUtils.waitForEvent(
      vsc.e("viewmenu-popup"),
      "popupshown"
    );
    vsc.click(vsc.e("menu_view"));
    await popupshown;
    Assert.equal(
      vsc.e("repair-text-encoding").disabled,
      expectedSource == contentReadable
    );
    await vsc.click_menus_in_sequence(vsc.e("viewmenu-popup"), [
      { id: "repair-text-encoding" },
    ]);

    if (expectedSource != contentReadable) {
      vsc.waitFor(
        () =>
          vsc.e("content").contentDocument != doc &&
          vsc.e("content").contentDocument.querySelector("pre") != null,
        "Timeout waiting utf-8 encoded view-source document to load."
      );

      source = vsc.e("content").contentDocument.body.textContent;
      Assert.stringContains(
        source,
        contentReadable,
        "View source must contain the readable text"
      );
    }
  }

  // Check the context menu while were here.
  let browser = vsc.e("content");
  let contextMenu = vsc.window.document.getElementById("viewSourceContextMenu");
  popupshown = BrowserTestUtils.waitForEvent(contextMenu, "popupshown");
  await BrowserTestUtils.synthesizeMouseAtCenter(
    browser.contentDocument.body,
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

  close_window(vsc);
}
