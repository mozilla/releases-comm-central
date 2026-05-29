/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Tests that the Search Messages keyboard shortcut works when triggered from
 * a standalone message window.
 */

"use strict";

var {
  be_in_folder,
  create_folder,
  open_selected_message_in_new_window,
  select_click_row,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);
var { make_message_sets_in_folders } = ChromeUtils.importESModule(
  "resource://testing-common/mail/MessageInjectionHelpers.sys.mjs"
);

var folder;

add_setup(async function () {
  folder = await create_folder("SearchFromMessageWindow");
  await make_message_sets_in_folders([folder], [{ count: 1 }]);

  registerCleanupFunction(() => {
    folder.deleteSelf(null);
  });
});

add_task(async function test_search_shortcut_from_message_window() {
  await be_in_folder(folder);
  await select_click_row(0);

  const win = await open_selected_message_in_new_window();

  const searchWindowPromise = BrowserTestUtils.domWindowOpenedAndLoaded(
    null,
    w =>
      w.document.documentURI == "chrome://messenger/content/SearchDialog.xhtml"
  );
  // See ShortcutsManager.sys.mjs "search-messages".
  const modifiers =
    AppConstants.platform === "macosx"
      ? { metaKey: true, shiftKey: true }
      : { ctrlKey: true, shiftKey: true };
  EventUtils.synthesizeKey("F", modifiers, win);
  const searchWindow = await searchWindowPromise;
  searchWindow.close();

  await BrowserTestUtils.domWindowClosed(searchWindow);

  await BrowserTestUtils.closeWindow(win);

  Assert.report(
    false,
    undefined,
    undefined,
    "Test ran to completion successfully"
  );
});
