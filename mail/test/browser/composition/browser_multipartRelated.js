/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that multipart/related messages are handled properly.
 */

"use strict";

var utils = ChromeUtils.import("resource://testing-common/mozmill/utils.jsm");

var { close_compose_window, open_compose_new_mail, save_compose_message } =
  ChromeUtils.import("resource://testing-common/mozmill/ComposeHelpers.jsm");
var { be_in_folder, get_special_folder, mc, press_delete, select_click_row } =
  ChromeUtils.import(
    "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
  );
var {
  click_menus_in_sequence,
  plan_for_modal_dialog,
  wait_for_modal_dialog,
  wait_for_window_close,
} = ChromeUtils.import("resource://testing-common/mozmill/WindowHelpers.jsm");

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { MimeParser } = ChromeUtils.import("resource:///modules/mimeParser.jsm");

var gDrafts;

add_setup(async function () {
  gDrafts = await get_special_folder(Ci.nsMsgFolderFlags.Drafts, true);
});

/**
 * Helper to get the full message content.
 *
 * @param aMsgHdr: nsIMsgDBHdr object whose text body will be read
 * @returns {Map(partnum -> message headers), Map(partnum -> message text)}
 */
function getMsgHeaders(aMsgHdr) {
  let msgFolder = aMsgHdr.folder;
  let msgUri = msgFolder.getUriForMsg(aMsgHdr);

  let handler = {
    _done: false,
    _data: new Map(),
    _text: new Map(),
    endMessage() {
      this._done = true;
    },
    deliverPartData(num, text) {
      this._text.set(num, this._text.get(num) + text);
    },
    startPart(num, headers) {
      this._data.set(num, headers);
      this._text.set(num, "");
    },
  };
  let streamListener = MimeParser.makeStreamListenerParser(handler, {
    strformat: "unicode",
  });
  MailServices.messageServiceFromURI(msgUri).streamMessage(
    msgUri,
    streamListener,
    null,
    null,
    false,
    "",
    false
  );
  utils.waitFor(() => handler._done);
  return { headers: handler._data, text: handler._text };
}

/**
 */
add_task(async function test_basic_multipart_related() {
  let compWin = open_compose_new_mail();
  compWin.window.focus();
  EventUtils.sendString("someone@example.com", compWin.window);
  compWin.window.document.getElementById("msgSubject").focus();
  EventUtils.sendString("multipart/related", compWin.window);
  compWin.window.document.getElementById("messageEditor").focus();
  EventUtils.sendString("Here is a prologue.\n", compWin.window);

  const fname = "data/tb-logo.png";
  let file = new FileUtils.File(getTestFilePath(fname));
  let fileHandler = Services.io
    .getProtocolHandler("file")
    .QueryInterface(Ci.nsIFileProtocolHandler);
  let fileURL = fileHandler.getURLSpecFromActualFile(file);

  // Add a simple image to our dialog
  plan_for_modal_dialog("Mail:image", async function (dialog) {
    // Insert the url of the image.
    dialog.window.focus();
    EventUtils.sendString(fileURL, dialog.window);
    dialog.window.document.getElementById("altTextInput").focus();
    EventUtils.sendString("Alt text", dialog.window);
    await new Promise(resolve => setTimeout(resolve));

    // Accept the dialog
    dialog.window.document.querySelector("dialog").acceptDialog();
  });

  let insertMenu = compWin.window.document.getElementById("InsertPopupButton");
  let insertMenuPopup = compWin.window.document.getElementById("InsertPopup");

  EventUtils.synthesizeMouseAtCenter(insertMenu, {}, insertMenu.ownerGlobal);
  await click_menus_in_sequence(insertMenuPopup, [{ id: "InsertImageItem" }]);

  wait_for_modal_dialog();
  wait_for_window_close();
  await new Promise(resolve => setTimeout(resolve));

  await save_compose_message(compWin.window);
  close_compose_window(compWin);
  await TestUtils.waitForCondition(
    () => gDrafts.getTotalMessages(false) == 1,
    "message saved to drafts folder"
  );

  // Make sure that the headers are right on this one.
  await be_in_folder(gDrafts);
  let draftMsg = select_click_row(0);
  let { headers, text } = getMsgHeaders(draftMsg, true);
  Assert.equal(headers.get("").contentType.type, "multipart/related");
  Assert.equal(headers.get("1").contentType.type, "text/html");
  Assert.equal(headers.get("2").contentType.type, "image/png");
  Assert.equal(headers.get("2").get("Content-Transfer-Encoding"), "base64");
  Assert.equal(
    headers.get("2").getRawHeader("Content-Disposition")[0],
    'inline; filename="tb-logo.png"'
  );
  let cid = headers.get("2").getRawHeader("Content-ID")[0].slice(1, -1);
  if (!text.get("1").includes('src="cid:' + cid + '"')) {
    throw new Error("Expected HTML to refer to cid " + cid);
  }
  press_delete(mc); // Delete message
});
