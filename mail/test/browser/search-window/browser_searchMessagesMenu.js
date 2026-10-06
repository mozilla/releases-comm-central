/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { be_in_folder, create_folder, create_virtual_folder } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
  );

let folder;
let virtualFolder;

add_setup(async function () {
  folder = await create_folder("SearchMessagesMenu");
  virtualFolder = create_virtual_folder("SearchMessagesMenuVirtual", [folder]);

  registerCleanupFunction(() => {
    virtualFolder.deleteSelf(null);
    folder.deleteSelf(null);
  });
});

/**
 * Test that Search Messages is enabled for a normal folder and disabled for a
 * saved search folder.
 */
add_task(async function test_search_messages_menu_state() {
  await be_in_folder(folder);
  window.initSearchMessagesMenu();
  Assert.ok(
    !document.getElementById("searchMailCmd").disabled,
    "Search Messages should be enabled for a normal folder"
  );

  await be_in_folder(virtualFolder);
  window.initSearchMessagesMenu();
  Assert.ok(
    document.getElementById("searchMailCmd").disabled,
    "Search Messages should be disabled for a saved search folder"
  );
});
