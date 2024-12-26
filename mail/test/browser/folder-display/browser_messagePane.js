/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test that the message pane behaves properly when showing and hiding messages
 */

"use strict";

var {
  archive_messages,
  assert_message_pane_visible,
  be_in_folder,
  create_folder,
  make_message_sets_in_folders,
  select_click_row,
  select_shift_click_row,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);

let about3Pane, folderSingle, folderMulti;

add_setup(async function () {
  folderSingle = await create_folder("folderSingle");
  await make_message_sets_in_folders([folderSingle], [{ count: 1 }]);

  folderMulti = await create_folder("folderMulti");
  await make_message_sets_in_folders([folderMulti], [{ count: 3 }]);

  about3Pane = document.getElementById("tabmail").currentAbout3Pane;

  registerCleanupFunction(() => {
    folderSingle.deleteSelf(null);
    folderMulti.deleteSelf(null);
  });
});

add_task(async function test_clear_single_message() {
  const messageBrowser = about3Pane.messageBrowser;

  await be_in_folder(folderSingle);
  assert_message_pane_visible();
  const message = await select_click_row(0);

  Assert.ok(
    BrowserTestUtils.isVisible(messageBrowser),
    "The message browser should be visible"
  );

  await archive_messages([message]);

  Assert.ok(
    !BrowserTestUtils.isVisible(messageBrowser),
    "The message browser should be hidden"
  );
});

add_task(async function test_clear_multi_messages() {
  const multiMessageBrowser = about3Pane.multiMessageBrowser;

  await be_in_folder(folderMulti);
  assert_message_pane_visible();
  await select_click_row(0);
  const messages = await select_shift_click_row(2);

  Assert.ok(
    BrowserTestUtils.isVisible(multiMessageBrowser),
    "The multi message browser should be visible"
  );

  await archive_messages(messages);

  Assert.ok(
    !BrowserTestUtils.isVisible(multiMessageBrowser),
    "The multi message browser should be hidden"
  );
});
