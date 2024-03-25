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
 */

"use strict";

var {
  close_compose_window,
  open_compose_with_edit_as_new,
  open_compose_with_forward,
  open_compose_with_forward_as_attachments,
  open_compose_with_reply,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/ComposeHelpers.sys.mjs"
);
var {
  assert_selected_and_displayed,
  be_in_folder,
  create_folder,
  get_about_message,
  open_message_from_file,
  press_delete,
  select_click_row,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);
var { click_menus_in_sequence } = ChromeUtils.importESModule(
  "resource://testing-common/mail/WindowHelpers.sys.mjs"
);

var folder;

add_setup(async function () {
  requestLongerTimeout(2);
  folder = await create_folder("FolderWithMessages");
});

async function subtest_replyEditAsNewForward_charset(
  aAction,
  aFile,
  aViewed = true
) {
  await be_in_folder(folder);

  const file = new FileUtils.File(getTestFilePath(`data/${aFile}`));
  const msgc = await open_message_from_file(file);
  // We need to be sure the ContextMenu actors are ready before trying to open a
  // context menu from the message. I can't find a way to be sure, so let's wait.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 500));

  // Copy the message to a folder. We run the message through a folder
  // since replying/editing as new/forwarding directly to the message
  // opened from a file gives different results on different platforms.
  // All platforms behave the same when using a folder-stored message.
  const documentChild = msgc.content.document.documentElement;
  EventUtils.synthesizeMouseAtCenter(
    documentChild,
    { type: "contextmenu", button: 2 },
    documentChild.ownerGlobal
  );
  const aboutMessage = get_about_message(msgc);
  await click_menus_in_sequence(
    aboutMessage.document.getElementById("mailContext"),
    [
      { id: "mailContext-copyMenu" },
      { label: "Local Folders" },
      { label: "FolderWithMessages" },
    ]
  );
  await BrowserTestUtils.closeWindow(msgc);

  const msg = await select_click_row(0);
  if (aViewed) {
    // Only if the preview pane is on, we can check the following.
    await assert_selected_and_displayed(window, msg);
  }

  let fwdWin;
  switch (aAction) {
    case 1: // Reply.
      fwdWin = await open_compose_with_reply();
      break;
    case 2: // Edit as new.
      fwdWin = await open_compose_with_edit_as_new();
      break;
    case 3: // Forward inline.
      fwdWin = await open_compose_with_forward();
      break;
    case 4: // Forward as attachment.
      fwdWin = await open_compose_with_forward_as_attachments();
      break;
  }

  // Check the charset in the compose window.
  const charset =
    fwdWin.document.getElementById("messageEditor").contentDocument.charset;
  Assert.equal(charset, "UTF-8", "Compose window has the wrong charset");
  await close_compose_window(fwdWin);

  await press_delete(window);
}

add_task(async function test_replyEditAsNewForward_charsetFromBody() {
  // Check that the charset is taken from the message body (bug 1026989).
  await subtest_replyEditAsNewForward_charset(1, "./multipart-charset.eml");
  await subtest_replyEditAsNewForward_charset(2, "./multipart-charset.eml");
  await subtest_replyEditAsNewForward_charset(3, "./multipart-charset.eml");
  // For "forward as attachment" we use the default charset (which is UTF-8).
  await subtest_replyEditAsNewForward_charset(4, "./multipart-charset.eml");
});

add_task(async function test_reply_noUTF16() {
  // Check that a UTF-16 encoded e-mail is forced to UTF-8 when replying (bug 961983).
  await subtest_replyEditAsNewForward_charset(1, "./body-utf16.eml", "UTF-8");
});

add_task(async function test_replyEditAsNewForward_noPreview() {
  // Check that it works even if the message wasn't viewed before, so
  // switch off the preview pane (bug 1323377).
  await be_in_folder(folder);
  window.goDoCommand("cmd_toggleMessagePane");

  await subtest_replyEditAsNewForward_charset(1, "./format-flowed.eml", false);
  await subtest_replyEditAsNewForward_charset(2, "./body-greek.eml", false);
  await subtest_replyEditAsNewForward_charset(
    3,
    "./multipart-charset.eml",
    false
  );

  window.goDoCommand("cmd_toggleMessagePane");
});

registerCleanupFunction(() => {
  folder.deleteSelf(null);
});
