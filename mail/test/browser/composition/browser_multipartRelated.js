/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that multipart/related messages are handled properly.
 */

"use strict";

var { close_compose_window, open_compose_new_mail, save_compose_message } =
  ChromeUtils.import("resource://testing-common/mozmill/ComposeHelpers.jsm");
var { be_in_folder, get_special_folder, press_delete, select_click_row } =
  ChromeUtils.import(
    "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
  );
var { click_menus_in_sequence, promise_modal_dialog } = ChromeUtils.import(
  "resource://testing-common/mozmill/WindowHelpers.jsm"
);

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
async function getMsgHeaders(aMsgHdr) {
  const msgFolder = aMsgHdr.folder;
  const msgUri = msgFolder.getUriForMsg(aMsgHdr);

  const handler = {
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
  const streamListener = MimeParser.makeStreamListenerParser(handler, {
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
  await TestUtils.waitForCondition(() => handler._done);
  return { headers: handler._data, text: handler._text };
}

/**
 */
add_task(async function test_basic_multipart_related() {
  const compWin = await open_compose_new_mail();
  compWin.focus();
  EventUtils.sendString("someone@example.com", compWin);
  compWin.document.getElementById("msgSubject").focus();
  EventUtils.sendString("multipart/related", compWin);
  compWin.document.getElementById("messageEditor").focus();
  EventUtils.sendString("Here is a prologue.\n", compWin);

  const fname = "data/tb-logo.png";
  const file = new FileUtils.File(getTestFilePath(fname));
  const fileHandler = Services.io
    .getProtocolHandler("file")
    .QueryInterface(Ci.nsIFileProtocolHandler);
  const fileURL = fileHandler.getURLSpecFromActualFile(file);

  // Add a simple image to our dialog
  const dialogPromise = promise_modal_dialog(
    "Mail:image",
    async function (dialog) {
      // Insert the url of the image.
      dialog.focus();
      EventUtils.sendString(fileURL, dialog);
      dialog.document.getElementById("altTextInput").focus();
      EventUtils.sendString("Alt text", dialog);
      await new Promise(resolve => setTimeout(resolve));

      // Accept the dialog
      dialog.document.querySelector("dialog").acceptDialog();
    }
  );

  const insertMenu = compWin.document.getElementById("InsertPopupButton");
  const insertMenuPopup = compWin.document.getElementById("InsertPopup");

  EventUtils.synthesizeMouseAtCenter(insertMenu, {}, insertMenu.ownerGlobal);
  await click_menus_in_sequence(insertMenuPopup, [{ id: "InsertImageItem" }]);

  await dialogPromise;
  await new Promise(resolve => setTimeout(resolve));

  await save_compose_message(compWin);
  await close_compose_window(compWin);
  await TestUtils.waitForCondition(
    () => gDrafts.getTotalMessages(false) == 1,
    "message saved to drafts folder"
  );

  // Make sure that the headers are right on this one.
  await be_in_folder(gDrafts);
  const draftMsg = await select_click_row(0);
  const { headers, text } = await getMsgHeaders(draftMsg, true);
  Assert.equal(headers.get("").contentType.type, "multipart/related");
  Assert.equal(headers.get("1").contentType.type, "text/html");
  Assert.equal(headers.get("2").contentType.type, "image/png");
  Assert.equal(headers.get("2").get("Content-Transfer-Encoding"), "base64");
  Assert.equal(
    headers.get("2").getRawHeader("Content-Disposition")[0],
    'inline; filename="tb-logo.png"'
  );
  const cid = headers.get("2").getRawHeader("Content-ID")[0].slice(1, -1);
  if (!text.get("1").includes('src="cid:' + cid + '"')) {
    throw new Error("Expected HTML to refer to cid " + cid);
  }
  await press_delete(window); // Delete message
});
