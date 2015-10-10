/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that multipart/related messages are handled properly.
 */

// make SOLO_TEST=composition/test-multipart-related.js mozmill-one

var MODULE_NAME = "test-multipart-related";

var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = ["folder-display-helpers", "window-helpers", "compose-helpers"];

var os = {};
Cu.import("resource://mozmill/stdlib/os.js", os);
Cu.import('resource://gre/modules/Services.jsm');
Cu.import("resource:///modules/mailServices.js");
Cu.import("resource:///modules/mimeParser.jsm");
var elib = {};
Cu.import("resource://mozmill/modules/elementslib.js", elib);
var utils = {};
Cu.import("resource://mozmill/modules/utils.js", utils);

var draftsFolder;

function setupModule(module) {
  for (let req of MODULE_REQUIRES) {
    collector.getModule(req).installInto(module);
  }
  let rootFolder = MailServices.accounts.localFoldersServer.rootFolder;
  if (!rootFolder.containsChildNamed("Drafts")) {
     create_folder("Drafts", [Ci.nsMsgFolderFlags.Drafts]);
  }
  draftsFolder = rootFolder.getChildNamed("Drafts");
  if (!draftsFolder) {
    throw new Error("draftsFolder not found");
  }
}

/**
 * Helper to get the full message content.
 *
 * @param aMsgHdr: nsIMsgDBHdr object whose text body will be read
 * @return {Map(partnum -> message headers), Map(partnum -> message text)}
 */
function getMsgHeaders(aMsgHdr) {
  let msgFolder = aMsgHdr.folder;
  let msgUri = msgFolder.getUriForMsg(aMsgHdr);

  let messenger = Cc["@mozilla.org/messenger;1"]
                    .createInstance(Ci.nsIMessenger);
  let handler = {
    _done: false,
    _data: new Map(),
    _text: new Map(),
    endMessage: function () { this._done = true; },
    deliverPartData: function (num, text) {
      this._text.set(num, this._text.get(num) + text);
    },
    startPart: function (num, headers) {
      this._data.set(num, headers);
      this._text.set(num, "");
    },
  };
  let streamListener = MimeParser.makeStreamListenerParser(handler,
    {strformat: "unicode"});
  messenger.messageServiceFromURI(msgUri).streamMessage(msgUri,
                                                        streamListener,
                                                        null,
                                                        null,
                                                        false,
                                                        "",
                                                        false);
  utils.waitFor(() => handler._done);
  return {headers: handler._data, text: handler._text};
}

/**
 */
function test_basic_multipart_related() {
  let compWin = open_compose_new_mail();
  compWin.type(null, "someone@example.com");
  compWin.type(compWin.eid("msgSubject"), "multipart/related");
  compWin.type(compWin.eid("content-frame"), "Here is a prologue.\n");

  // Add a simple image to our dialog
  plan_for_modal_dialog("imageDlg", function (dialog) {
    // Insert the url of the image.
    dialog.type(null, "chrome://global/skin/arrow/arrow-dn.gif");
    dialog.type(dialog.eid("altTextInput"), "Alt text");
    dialog.sleep(0);

    // Accept the dialog
    dialog.window.document.getElementById("imageDlg").acceptDialog();
  });
  compWin.click(compWin.eid("insertImage"));
  wait_for_modal_dialog();
  wait_for_window_close();

  // Ctrl+S = save as draft.
  compWin.keypress(null, "s", {shiftKey: false, accelKey: true});
  close_compose_window(compWin);

  // Make sure that the headers are right on this one.
  be_in_folder(draftsFolder);
  let draftMsg = select_click_row(0);
  let {headers, text} = getMsgHeaders(draftMsg, true);
  assert_equals(headers.get("").contentType.type, "multipart/related");
  assert_equals(headers.get("1").contentType.type, "text/html");
  assert_equals(headers.get("2").contentType.type, "image/gif");
  assert_equals(headers.get("2").get("Content-Transfer-Encoding"), "base64");
  assert_equals(headers.get("2").getRawHeader("Content-Disposition")[0],
    "inline; filename=\"arrow-dn.gif\"");
  let cid = headers.get("2").getRawHeader("Content-ID")[0].slice(1, -1);
  if (!text.get("1").includes("src=\"cid:" + cid + '"')) {
    throw new Error("Expected HTML to refer to cid " + cid);
  }
  press_delete(mc); // Delete message
}

function teardownModule(module) {
  MailServices.accounts.localFoldersServer.rootFolder
              .propagateDelete(draftsFolder, true, null);
}
