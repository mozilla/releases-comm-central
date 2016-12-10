/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that the reply to a message picks up the charset from the body
 * and not from an attachment. Also test "Edit as new", forward inline and
 * forward as attachment.
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

function subtest_replyEditAsNewForward_charset(aAction, aFile, aCharset) {
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
  assert_selected_and_displayed(mc, msg);

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

function test_replyEditAsNewForward_charset() {
  // Check that the charset is taken from the message body.
  subtest_replyEditAsNewForward_charset(1, "./multipart-charset.eml", "EUC-KR");
  subtest_replyEditAsNewForward_charset(2, "./multipart-charset.eml", "EUC-KR");
  subtest_replyEditAsNewForward_charset(3, "./multipart-charset.eml", "EUC-KR");
  subtest_replyEditAsNewForward_charset(4, "./multipart-charset.eml", "EUC-KR");
}
