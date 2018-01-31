/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that we do the right thing wrt. message encoding when editing or
 * replying to messages.
 */

// make SOLO_TEST=composition/test-charset-edit.js mozmill-one

var MODULE_NAME = "test-charset-edit";

var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = ["folder-display-helpers", "compose-helpers",
                       "window-helpers", "notificationbox-helpers"];

var os = {};
ChromeUtils.import("resource://mozmill/stdlib/os.js", os);
ChromeUtils.import('resource://gre/modules/Services.jsm');
ChromeUtils.import("resource:///modules/mailServices.js");
ChromeUtils.import("resource:///modules/mimeParser.jsm");
var elib = {};
ChromeUtils.import("resource://mozmill/modules/elementslib.js", elib);
var utils = {};
ChromeUtils.import("resource://mozmill/modules/utils.js", utils);

var gDrafts;

function setupModule(module) {
  for (let req of MODULE_REQUIRES) {
    collector.getModule(req).installInto(module);
  }

  gDrafts = get_special_folder(Ci.nsMsgFolderFlags.Drafts, true);

  // Ensure reply charset isn't UTF-8, otherwise there's no need to upgrade,
  // which is what this test tests.
  let str = Components.classes["@mozilla.org/pref-localizedstring;1"]
                      .createInstance(Components.interfaces.nsIPrefLocalizedString);
  str.data = "windows-1252";
  Services.prefs.setComplexValue("mailnews.send_default_charset",
                                 Components.interfaces.nsIPrefLocalizedString, str);
}

/**
 * Helper to get the full message content.
 *
 * @param aMsgHdr: nsIMsgDBHdr object whose text body will be read
 * @param aGetText: if true, return header objects. if false, return body data.
 * @return Map(partnum -> message headers)
 */
function getMsgHeaders(aMsgHdr, aGetText=false) {
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
  return aGetText ? handler._text : handler._data;
}

/**
 * Test that if we reply to a message in x-mac-croatian, we don't try to compose
 * in x-mac-croatian. Instead, we should be using the default charset (set to
 * not be UTF-8 in this test).
 */
function test_wrong_reply_charset() {
  let folder = gDrafts;
  let msg0 = create_message({
    bodyPart: new SyntheticPartLeaf("Some text",
      {charset: "x-mac-croatian"})
  });
  add_message_to_folder(folder, msg0);
  be_in_folder(folder);
  let msg = select_click_row(0);
  assert_selected_and_displayed(mc, msg);
  assert_equals(getMsgHeaders(msg).get("").charset, "x-mac-croatian");

  let rwc = open_compose_with_reply();
  // Ctrl+S = save as draft.
  rwc.keypress(null, "s", {shiftKey: false, accelKey: true});
  close_compose_window(rwc);

  let draftMsg = select_click_row(1);
  assert_equals(getMsgHeaders(draftMsg).get("").charset, "windows-1252");
  press_delete(mc); // Delete message

  // Edit the original message. Charset should be windows-1252 now.
  msg = select_click_row(0);

  // Wait for the notification with the Edit button.
  wait_for_notification_to_show(mc, "msgNotificationBar", "draftMsgContent");

  plan_for_new_window("msgcompose");
  mc.click(mc.eid("msgNotificationBar", {tagName: "button", label: "Edit"}));
  rwc = wait_for_compose_window();
  rwc.keypress(null, "s", {shiftKey: false, accelKey: true});
  close_compose_window(rwc);
  msg = select_click_row(0);
  assert_equals(getMsgHeaders(msg).get("").charset, "windows-1252");
  press_delete(mc); // Delete message
}

/**
 * Test that replying to bad charsets don't screw up the existing text.
 * UTF-16 can be decoded but is not a valid reply charset.
 */
function test_no_mojibake() {
  let folder = gDrafts;
  let nonASCII = "€€€"; // U+20AC
  let UTF16    = "\xAC\x20\xAC\x20\xAC\x20";
  let msg0 = create_message({
    bodyPart: new SyntheticPartLeaf(UTF16, {charset: "UTF-16LE"})
  });
  add_message_to_folder(folder, msg0);
  be_in_folder(folder);
  let msg = select_click_row(0);
  assert_selected_and_displayed(mc, msg);
  assert_equals(getMsgHeaders(msg).get("").charset, "UTF-16LE");
  // We need to check for includes() here since the message
  // also contains CRLF, which is interpreted as invalid UTF-16.
  // UTF-16 isn't the perfect charset for this test, but after UTF-7 is no
  // longer supported, it's the only one which can be decoded but is invalid
  // to use.
  assert_true(getMsgHeaders(msg, true).get("").includes(nonASCII));

  let rwc = open_compose_with_reply();
  // Ctrl+S = save as draft.
  rwc.keypress(null, "s", {shiftKey: false, accelKey: true});
  close_compose_window(rwc);

  let draftMsg = select_click_row(1);
  assert_equals(getMsgHeaders(draftMsg).get("").charset.toUpperCase(), "UTF-8");
  let text = getMsgHeaders(draftMsg, true).get("");
  // Delete message first before throwing so subsequent tests are not affected.
  press_delete(mc);
  if (!text.includes(nonASCII))
    throw new Error("Expected to find " + nonASCII + " in " + text);

  // Edit the original message. Charset should be UTF-8 now.
  msg = select_click_row(0);

  // Wait for the notification with the Edit button.
  wait_for_notification_to_show(mc, "msgNotificationBar", "draftMsgContent");

  plan_for_new_window("msgcompose");
  mc.click(mc.eid("msgNotificationBar", {tagName: "button", label: "Edit"}));
  rwc = wait_for_compose_window();
  rwc.keypress(null, "s", {shiftKey: false, accelKey: true});
  close_compose_window(rwc);
  msg = select_click_row(0);
  assert_equals(getMsgHeaders(msg).get("").charset.toUpperCase(), "UTF-8");
  assert_true(getMsgHeaders(msg, true).get("").includes(nonASCII));
  press_delete(mc); // Delete message
}

function teardownModule(module) {
  Services.prefs.clearUserPref("mailnews.send_default_charset");
}
