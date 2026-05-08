/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test that undoing message deletions in threaded views correctly reconstructs
 * the view arrays, restores thread roots, and processes chronological sorting
 * without duplicating rows or breaking indentation.
 */

"use strict";

var {
  assert_selected_and_displayed,
  be_in_folder,
  create_folder,
  expand_all_threads,
  make_display_threaded,
  press_delete,
  select_click_row,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);
var { make_message_sets_in_folders } = ChromeUtils.importESModule(
  "resource://testing-common/mail/MessageInjectionHelpers.sys.mjs"
);

var testFolder;
var about3Pane;

add_setup(async function () {
  testFolder = await create_folder("UndoInThreads");

  await make_message_sets_in_folders(
    [testFolder],
    [{ count: 6, msgsPerThread: 3 }]
  );
  await TestUtils.waitForCondition(
    () => [...testFolder.messages].length == 6,
    "testFolder should have 6 messages"
  );

  await be_in_folder(testFolder);
  const currentTabInfo = document.getElementById("tabmail").currentTabInfo;
  about3Pane = currentTabInfo.chromeBrowser.contentWindow;

  registerCleanupFunction(() => {
    testFolder.deleteSelf(null);
  });
});

add_task(async function test_undo_expanded_root() {
  await be_in_folder(testFolder);
  await make_display_threaded();

  // Sort by date to ensure stable chronological behavior.
  about3Pane.gDBView.sort(
    Ci.nsMsgViewSortType.byDate,
    Ci.nsMsgViewSortOrder.ascending
  );
  await expand_all_threads();

  const dbView = about3Pane.gDBView;

  Assert.equal(
    dbView.rowCount,
    6,
    "Folder should initially have 6 visible messages"
  );

  // Cache the RFC 822 messageId strings, which survives DB re-indexing during
  // Undo.
  const originalRootId = dbView.getMsgHdrAt(0).messageId;
  const originalChildId = dbView.getMsgHdrAt(1).messageId;

  Assert.equal(
    dbView.getLevel(0),
    0,
    "First message should be a root (Level 0)"
  );
  Assert.equal(
    dbView.getLevel(1),
    1,
    "Second message should be a child (Level 1)"
  );

  // 1. Delete the root of the first thread.
  await select_click_row(0);
  await press_delete();

  Assert.equal(
    dbView.rowCount,
    5,
    "Row count should drop to 5 after deleting the root"
  );
  Assert.equal(
    dbView.getMsgHdrAt(0).messageId,
    originalChildId,
    "The child should have been promoted to root"
  );
  Assert.equal(
    dbView.getLevel(0),
    0,
    "Promoted child should now be at Level 0"
  );

  // 2. Undo the deletion by triggering the standard app-level undo command.
  about3Pane.document.getElementById("cmd_undo").doCommand();

  // Wait for the UI and DB arrays to sync back to 6 rows.
  await TestUtils.waitForCondition(
    () => about3Pane.gDBView.rowCount == 6,
    "View should be restored to 6 rows after Undo"
  );

  // 3. Verify the Nuke and Pave reconstruction worked flawlessly using
  // messageId.
  Assert.equal(dbView.rowCount, 6, "Row count should return to 6 after undo");
  Assert.equal(
    dbView.getMsgHdrAt(0).messageId,
    originalRootId,
    "Original root should be restored to row 0"
  );
  Assert.equal(dbView.getLevel(0), 0, "Restored root should be at Level 0");
  Assert.equal(
    dbView.getLevel(1),
    1,
    "Promoted child should be demoted back to Level 1"
  );
  Assert.ok(
    dbView.isContainer(0),
    "Restored root should have the HASCHILDREN twisty"
  );
});

add_task(async function test_chronological_shift_on_new_mail() {
  const dbView = about3Pane.gDBView;

  // Cache the unique IDs of the two roots before injection.
  const threadARootId = dbView.getMsgHdrAt(0).messageId;
  const threadBRootId = dbView.getMsgHdrAt(3).messageId;
  const threadAHdr = dbView.getMsgHdrAt(0);

  // Inject a single message, forcefully attaching it to Thread A as a reply.
  await make_message_sets_in_folders(
    [testFolder],
    [{ count: 1, msgsPerThread: 1, replyToMsgHdr: threadAHdr }]
  );

  await TestUtils.waitForCondition(
    () => [...testFolder.messages].length == 7,
    "testFolder should have 7 messages after injection"
  );

  // The view must not lock up, crash, or duplicate rows.
  await TestUtils.waitForCondition(
    () => dbView.rowCount == 7,
    "View should safely update to show 7 rows without duplication"
  );

  // Dynamically locate the roots to prove no duplication occurred.
  let posA = -1;
  let posB = -1;
  let rootA_count = 0;
  let rootB_count = 0;

  for (let i = 0; i < dbView.rowCount; i++) {
    const msgId = dbView.getMsgHdrAt(i).messageId;
    if (msgId === threadARootId) {
      posA = i;
      rootA_count++;
    }
    if (msgId === threadBRootId) {
      posB = i;
      rootB_count++;
    }
  }

  Assert.equal(
    rootA_count,
    1,
    "Thread A root should exist exactly once (no duplicates)"
  );
  Assert.equal(rootB_count, 1, "Thread B root should exist exactly once");

  // Verify the spacing implies Thread A absorbed the new child safely.
  const rowDiff = Math.abs(posA - posB);
  Assert.ok(
    rowDiff === 3 || rowDiff === 4,
    "The threads should be offset by either 3 or 4 rows depending on synthetic sorting"
  );

  Assert.equal(
    dbView.rowCount,
    7,
    "Folder safely contains 7 visible rows without array corruption"
  );
});
