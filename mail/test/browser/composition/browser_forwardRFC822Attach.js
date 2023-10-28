/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that attached messages (message/rfc822) are correctly sent.
 * It's easiest to test the forward case.
 */

"use strict";

var {
  close_compose_window,
  get_msg_source,
  open_compose_with_forward_as_attachments,
  save_compose_message,
} = ChromeUtils.import("resource://testing-common/mozmill/ComposeHelpers.jsm");
var {
  be_in_folder,
  get_special_folder,
  open_message_from_file,
  press_delete,
  select_click_row,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);

var gDrafts;

add_setup(async function () {
  gDrafts = await get_special_folder(Ci.nsMsgFolderFlags.Drafts, true);
});

async function forwardDirect(aFilePath, aExpectedText) {
  const file = new FileUtils.File(getTestFilePath(`data/${aFilePath}`));
  const msgc = await open_message_from_file(file);

  const cwc = await open_compose_with_forward_as_attachments(msgc);

  await save_compose_message(cwc);
  await close_compose_window(cwc);
  await BrowserTestUtils.closeWindow(msgc);

  await be_in_folder(gDrafts);
  const draftMsg = await select_click_row(0);

  const draftMsgContent = await get_msg_source(draftMsg);

  Assert.ok(
    draftMsgContent.includes(aExpectedText),
    "Failed to find expected text"
  );

  await press_delete(window); // clean up the created draft
}

add_task(async function test_forwarding_long_html_line_as_attachment() {
  await forwardDirect("./long-html-line.eml", "We like writing long lines.");
});

add_task(async function test_forwarding_feed_message_as_attachment() {
  await forwardDirect("./feed-message.eml", "We like using linefeeds only.");
});
