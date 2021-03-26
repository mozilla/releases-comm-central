/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that multipart/related messages are handled properly.
 */

"use strict";

var utils = ChromeUtils.import("resource://testing-common/mozmill/utils.jsm");

var { close_compose_window, open_compose_new_mail } = ChromeUtils.import(
  "resource://testing-common/mozmill/ComposeHelpers.jsm"
);
var {
  be_in_folder,
  get_special_folder,
  mc,
  press_delete,
  select_click_row,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);
var {
  plan_for_modal_dialog,
  wait_for_modal_dialog,
  wait_for_window_close,
} = ChromeUtils.import("resource://testing-common/mozmill/WindowHelpers.jsm");

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { MimeParser } = ChromeUtils.import("resource:///modules/mimeParser.jsm");

var gDrafts;

add_task(function setupModule(module) {
  gDrafts = get_special_folder(Ci.nsMsgFolderFlags.Drafts, true);
});

/**
 * Helper to get the full message content.
 *
 * @param aMsgHdr: nsIMsgDBHdr object whose text body will be read
 * @return {Map(partnum -> message headers), Map(partnum -> message text)}
 */
function getMsgHeaders(aMsgHdr) {
  let msgFolder = aMsgHdr.folder;
  let msgUri = msgFolder.getUriForMsg(aMsgHdr);

  let messenger = Cc["@mozilla.org/messenger;1"].createInstance(
    Ci.nsIMessenger
  );
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
  messenger
    .messageServiceFromURI(msgUri)
    .streamMessage(msgUri, streamListener, null, null, false, "", false);
  utils.waitFor(() => handler._done);
  return { headers: handler._data, text: handler._text };
}

/**
 */
add_task(function test_basic_multipart_related() {
  let compWin = open_compose_new_mail();
  compWin.type(compWin.window, "someone@example.com");
  compWin.type(compWin.e("msgSubject"), "multipart/related");
  compWin.type(compWin.e("content-frame"), "Here is a prologue.\n");

  const fname = "data/tb-logo.png";
  let file = new FileUtils.File(getTestFilePath(fname));
  let fileHandler = Services.io
    .getProtocolHandler("file")
    .QueryInterface(Ci.nsIFileProtocolHandler);
  let fileURL = fileHandler.getURLSpecFromFile(file);

  // Add a simple image to our dialog
  plan_for_modal_dialog("Mail:image", function(dialog) {
    // Insert the url of the image.
    dialog.type(dialog.window, fileURL);
    dialog.type(dialog.e("altTextInput"), "Alt text");
    dialog.sleep(0);

    // Accept the dialog
    dialog.window.document.querySelector("dialog").acceptDialog();
  });
  compWin.click(compWin.e("insertImage"));
  wait_for_modal_dialog();
  wait_for_window_close();

  // Ctrl+S = save as draft.
  EventUtils.synthesizeKey(
    "s",
    { shiftKey: false, accelKey: true },
    compWin.window
  );
  waitForSaveOperation(compWin);
  close_compose_window(compWin);

  // Make sure that the headers are right on this one.
  be_in_folder(gDrafts);
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
  let cid = headers
    .get("2")
    .getRawHeader("Content-ID")[0]
    .slice(1, -1);
  if (!text.get("1").includes('src="cid:' + cid + '"')) {
    throw new Error("Expected HTML to refer to cid " + cid);
  }
  press_delete(mc); // Delete message
});
