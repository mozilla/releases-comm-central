/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This has become a "mixed bag" of tests for various bugs.
 *
 * Bug 1026989:
 * Tests that the reply to a message picks up the charset from the body
 * and not from an attachment. Also test "Edit as new", forward inline and
 * forward as attachment.
 *
 * Bug 961983:
 * Tests that UTF-16 is not used in a composition.
 *
 * Bug 1323377:
 * Tests that the correct charset is used, even if the message
 * wasn't viewed before answering/forwarding.
 * For good measure some tests are included for charset overriding
 * and enforcing the charset default.
 */

// make SOLO_TEST=composition/test-reply-multipart-charset.js mozmill-one

var MODULE_NAME = "test-reply-multipart-charset";

var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = ["folder-display-helpers", "compose-helpers", "window-helpers"];

var elib = {};
Cu.import('resource://mozmill/modules/elementslib.js', elib);
var os = {};
Cu.import('resource://mozmill/stdlib/os.js', os);

var folderToStoreMessages;

function setupModule(module) {
  for (let lib of MODULE_REQUIRES) {
    collector.getModule(lib).installInto(module);
  }

  folderToStoreMessages = create_folder("FolderWithMessages");
}

function subtest_replyEditAsNewForward_charset(aAction, aFile, aCharset,
                                               aOverride = null,
                                               aViewed = true) {
  be_in_folder(folderToStoreMessages);

  let file = os.getFileForPath(os.abspath(aFile,
                               os.getFileForPath(__file__)));
  let msgc = open_message_from_file(file);

  // Copy the message to a folder. We run the message through a folder
  // since replying/editing as new/forwarding directly to the message
  // opened from a file gives different results on different platforms.
  // All platforms behave the same when using a folder-stored message.
  let documentChild = msgc.e("messagepane").contentDocument.firstChild;
  msgc.rightClick(new elib.Elem(documentChild));
  msgc.click_menus_in_sequence(msgc.e("mailContext"), [
    {id: "mailContext-copyMenu"},
    {label: "Local Folders"},
    {label: "FolderWithMessages"},
  ]);
  close_window(msgc);

  let msg = select_click_row(0);
  if (aViewed) {
    // Only if the preview pane is on, we can check the following.
    assert_selected_and_displayed(mc, msg);
  }

  if (aOverride) {
    // Display the message using the override charset.
    // Use the app menu which is also available on Mac.
    mc.click(mc.eid("button-appmenu"));
    mc.click_menus_in_sequence(mc.e("appmenu-popup"), [
      {label: "View"},
      {label: "Text Encoding"},
      {label: aOverride},
    ]);
  }

  let fwdWin;
  switch (aAction) {
  case 1: // Reply.
    fwdWin = open_compose_with_reply();
    break;
  case 2: // Edit as new.
    fwdWin = open_compose_with_edit_as_new();
    break;
  case 3: // Forward inline.
    fwdWin = open_compose_with_forward();
    break;
  case 4: // Forward as attachment.
    fwdWin = open_compose_with_forward_as_attachments();
    break;
  }

  // Check the charset in the compose window. Somehow the property
  // is returned lower case.
  let charset = fwdWin.e("content-frame").contentDocument.charset;
  assert_equals(charset, aCharset.toLowerCase(),
                "Compose window has the wrong charset");
  close_compose_window(fwdWin);

  press_delete(mc);
}

function test_replyEditAsNewForward_charsetFromBody() {
  // Check that the charset is taken from the message body (bug 1026989).
  subtest_replyEditAsNewForward_charset(1, "./multipart-charset.eml", "EUC-KR");
  subtest_replyEditAsNewForward_charset(2, "./multipart-charset.eml", "EUC-KR");
  subtest_replyEditAsNewForward_charset(3, "./multipart-charset.eml", "EUC-KR");
  // For "forward as attachment" we use the default charset (which is UTF-8).
  subtest_replyEditAsNewForward_charset(4, "./multipart-charset.eml", "UTF-8");
}

function test_reply_noUTF16() {
  // Check that a UTF-16 encoded e-mail is forced to UTF-8 when replying (bug 961983).
  subtest_replyEditAsNewForward_charset(1, "./body-utf16.eml", "UTF-8");
}

function test_replyEditAsNewForward_override() {
  // Check that the override is honoured (inspired by bug 1323377).
  subtest_replyEditAsNewForward_charset(1, "./multipart-charset.eml", "UTF-8", "Unicode");
  subtest_replyEditAsNewForward_charset(2, "./multipart-charset.eml", "windows-1252", "Western");
  subtest_replyEditAsNewForward_charset(3, "./multipart-charset.eml", "ISO-8859-7", "Greek (ISO)");
}

function test_replyEditAsNewForward_enforceDefault() {
  // Check that the default is honoured (inspired by bug 1323377).
  Services.prefs.setBoolPref("mailnews.reply_in_default_charset", true);
  Services.prefs.setCharPref("mailnews.send_default_charset", "ISO-8859-7");
  subtest_replyEditAsNewForward_charset(1, "./multipart-charset.eml", "ISO-8859-7");
  subtest_replyEditAsNewForward_charset(2, "./multipart-charset.eml", "ISO-8859-7");
  subtest_replyEditAsNewForward_charset(3, "./multipart-charset.eml", "ISO-8859-7");
  Services.prefs.clearUserPref("mailnews.reply_in_default_charset");
  Services.prefs.clearUserPref("mailnews.send_default_charset");
}

function test_replyEditAsNewForward_noPreview() {
  // Check that it works even if the message wasn't viewed before, so
  // switch off the preview pane (bug 1323377).
  be_in_folder(folderToStoreMessages);
  mc.window.goDoCommand("cmd_toggleMessagePane");

  subtest_replyEditAsNewForward_charset(1, "./format-flowed.eml", "windows-1252", null, false);
  subtest_replyEditAsNewForward_charset(2, "./body-greek.eml", "ISO-8859-7", null, false);
  subtest_replyEditAsNewForward_charset(3, "./multipart-charset.eml", "EUC-KR", null, false);
}
