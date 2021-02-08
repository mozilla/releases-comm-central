/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test that view-source content can be reloaded to change encoding.
 */

"use strict";

var elib = ChromeUtils.import(
  "resource://testing-common/mozmill/elementslib.jsm"
);

var { be_in_folder, create_folder, mc, select_click_row } = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);
var {
  close_window,
  plan_for_new_window,
  wait_for_new_window,
} = ChromeUtils.import("resource://testing-common/mozmill/WindowHelpers.jsm");

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

var folder = null;

add_task(function setup() {
  folder = create_folder("viewsource");
  registerCleanupFunction(() => {
    folder.deleteSelf(null);
  });
});

function addToFolder(aSubject, aBody, aFolder) {
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
    "Subject: " +
    aSubject +
    "\n" +
    "Content-Type: text/plain; charset=ISO-8859-1\n" +
    "Content-Transfer-Encoding: 7bit\n" +
    "\n" +
    aBody +
    "\n";

  aFolder.QueryInterface(Ci.nsIMsgLocalMailFolder);
  aFolder.addMessage(source);

  return aFolder.msgDatabase.getMsgHdrForMessageID(msgId);
}

function checkMenuitems(menu, ...expectedItems) {
  if (expectedItems.length == 0) {
    // Menu should not be shown.
    Assert.equal(menu.state, "closed");
    return;
  }

  Assert.notEqual(menu.state, "closed");

  let actualItems = [];
  for (let item of menu.children) {
    if (["menu", "menuitem"].includes(item.localName) && !item.hidden) {
      actualItems.push(item.id);
    }
  }
  Assert.deepEqual(actualItems, expectedItems);
}

/**
 * Test that the view source character encoding can be changed,
 * which requires content policy is correct for view-source:.
 */
add_task(async function test_view_source_reload() {
  be_in_folder(folder);

  let contentLatin1 = "Testar, ett två tre.";
  let contentUTF8 = "Testar, ett tv� tre";
  let msg = addToFolder("view-source reload test123?", contentLatin1, folder);

  let selMsg = select_click_row(0);
  Assert.ok(msg == selMsg, "Selected msg isn't the same as the generated one.");

  let displayContent = mc.e("messagepane").contentDocument.body.textContent;
  Assert.ok(
    displayContent.includes(contentLatin1),
    "Message content must include the latin1 text"
  );

  plan_for_new_window("navigator:view-source");
  EventUtils.synthesizeKey("U", { shiftKey: false, accelKey: true });
  let vsc = wait_for_new_window("navigator:view-source");

  vsc.waitFor(
    () => vsc.e("content").contentDocument.querySelector("pre") != null,
    "Timeout waiting for the latin1 view-source document to load."
  );

  let source = vsc.e("content").contentDocument.body.textContent;
  Assert.ok(
    source.includes(contentLatin1),
    "View source must contain the latin1 text"
  );

  let doc = vsc.e("content").contentDocument; // keep a ref to the latin1 doc

  // Click the new window to make it receive further events properly.
  vsc.click(vsc.eid("content"));
  await new Promise(resolve => setTimeout(resolve));

  let popupshown = BrowserTestUtils.waitForEvent(
    vsc.e("viewmenu-popup"),
    "popupshown"
  );
  vsc.click(vsc.eid("menu_view"));
  await popupshown;
  vsc.click_menus_in_sequence(vsc.e("viewmenu-popup"), [
    { id: "charsetMenu" },
    { label: "Unicode" },
  ]);

  vsc.waitFor(
    () =>
      vsc.e("content").contentDocument != doc &&
      vsc.e("content").contentDocument.querySelector("pre") != null,
    "Timeout waiting utf-8 encoded view-source document to load."
  );

  source = vsc.e("content").contentDocument.body.textContent;
  Assert.ok(
    source.includes(contentUTF8),
    "View source must contain the utf-8 text"
  );

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

  checkMenuitems(
    contextMenu,
    "cMenu_copy",
    "cMenu_selectAll",
    "cMenu_find",
    "cMenu_findAgain",
  );
  contextMenu.hidePopup();

  close_window(vsc);
});
