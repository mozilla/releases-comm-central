/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/**
 * Tests that opening an .eml file the body of the message is correct,
 * that it hasn't been UTF-8 mojibake'd.
 */

"use strict";

var { open_message_from_file } = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);
var { close_window } = ChromeUtils.import(
  "resource://testing-common/mozmill/WindowHelpers.jsm"
);

var gReferenceTextContent;

add_task(async function setupModule(module) {
  gReferenceTextContent = await extract_eml_body_textcontent(
    "./correctEncodingUTF8.eml",
    false
  );
});

async function extract_eml_body_textcontent(eml, autodetect = true) {
  let file = new FileUtils.File(getTestFilePath(`data/${eml}`));
  let msgc = await open_message_from_file(file);
  // Be sure to view message body as Original HTML
  msgc.window.MsgBodyAllowHTML();

  if (autodetect) {
    // Open main application menu
    let appMenu = msgc.window.document.getElementById("appMenu-popup");
    let menuShownPromise = BrowserTestUtils.waitForEvent(appMenu, "popupshown");
    EventUtils.synthesizeMouseAtCenter(
      msgc.window.document.getElementById("button-appmenu"),
      {},
      msgc.window
    );
    await menuShownPromise;

    // Go to "View" sub menu
    let viewShownPromise = BrowserTestUtils.waitForEvent(
      appMenu.querySelector("#appMenu-viewView"),
      "ViewShown"
    );
    EventUtils.synthesizeMouseAtCenter(
      appMenu.querySelector("#appmenu_View"),
      {},
      msgc.window
    );
    await viewShownPromise;

    // Click on the "Repair Text Encoding" item
    let hiddenPromise = BrowserTestUtils.waitForEvent(appMenu, "popuphidden");
    let reloadPromise = BrowserTestUtils.browserLoaded(msgc.contentPane);
    EventUtils.synthesizeMouseAtCenter(
      appMenu.querySelector("#appmenu_charsetRepairMenuitem"),
      {},
      msgc.window
    );
    await hiddenPromise;
    await reloadPromise;
  }

  let textContent =
    msgc.window.msgWindow.messageWindowDocShell.contentViewer.DOMDocument
      .documentElement.textContent;
  close_window(msgc);
  return textContent;
}

/**
 * Checks that the text content is equal for the .eml files.
 */
async function check_eml_textcontent(eml) {
  let textContent = await extract_eml_body_textcontent(eml);
  is(textContent, gReferenceTextContent, eml);
}

add_task(async function test_wronglyDeclaredCharset() {
  await check_eml_textcontent("./wronglyDeclaredUTF8.eml");
  await check_eml_textcontent("./wronglyDeclaredShift_JIS.eml");
});
