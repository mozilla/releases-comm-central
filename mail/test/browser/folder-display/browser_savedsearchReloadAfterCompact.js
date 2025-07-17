/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test reload of saved searches over local folders after compaction
 * of local folders.
 */

"use strict";

const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

var {
  be_in_folder,
  create_folder,
  create_virtual_folder,
  get_about_3pane,
  press_delete,
  select_click_row,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);
var { inboxFolder, make_message_sets_in_folders } = ChromeUtils.importESModule(
  "resource://testing-common/mail/MessageInjectionHelpers.sys.mjs"
);

var otherFolder;
var folderVirtual;

/**
 * Add some messages to a folder, delete the first one, and create a saved
 * search over the inbox and the folder. Then, compact folders.
 */
add_task(async function test_setup_virtual_folder_and_compact() {
  otherFolder = await create_folder("otherFolder");
  await make_message_sets_in_folders([otherFolder], [{ count: 2 }]);

  /**
   * We delete the first message in the local folder, so compaction of the
   * folder will invalidate the key of the second message in the folder. Then,
   * we select the second message and issue the compact. This causes saving the
   * selection on the compaction notification to fail. We test the saved search
   * view still gets rebuilt, such that there is a valid msg hdr at row 0.
   */
  await be_in_folder(otherFolder);
  await select_click_row(0);
  await press_delete();

  folderVirtual = create_virtual_folder("SavedSearch", [
    inboxFolder,
    otherFolder,
  ]);

  await be_in_folder(folderVirtual);
  await select_click_row(0);
  if (otherFolder.msgStore.supportsCompaction) {
    const listener = new PromiseTestUtils.PromiseUrlListener();
    otherFolder.compactAll(listener, null);
    await listener.promise;
  }
  // Let the event queue clear.
  await new Promise(resolve => setTimeout(resolve));

  // Check view is still valid
  Assert.ok(
    get_about_3pane().gDBView.getMsgHdrAt(0),
    "view hdr 0 should be ok"
  );
});

registerCleanupFunction(async () => {
  // Fixing possible nsIMsgDBHdr.markHasAttachments onEndMsgDownload runs.
  //  Found in chaosmode.
  var thread = Services.tm.currentThread;
  while (thread.hasPendingEvents()) {
    thread.processNextEvent(true);
  }
  // Cleanup dbView with force.
  get_about_3pane().gDBView.close(true);
  folderVirtual.deleteSelf(null);
  otherFolder.deleteSelf(null);
});
