/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test that displaying messages in folder tabs works correctly with folder
 * modes. This includes:
 * - switching to the default folder mode if the folder isn't present in the
 *   current folder mode
 * - not switching otherwise
 * - making sure that we're able to expand the right folders in the smart folder
 *   mode
 */

"use strict";

var {
  assert_folder_child_in_view,
  assert_folder_collapsed,
  assert_folder_expanded,
  assert_folder_mode,
  assert_folder_not_visible,
  assert_folder_selected_and_displayed,
  assert_folder_tree_view_row_count,
  assert_folder_visible,
  assert_message_not_in_view,
  assert_selected_and_displayed,
  be_in_folder,
  collapse_folder,
  display_message_in_folder_tab,
  get_smart_folder_named,
  inboxFolder,
  make_message_sets_in_folders,
  select_none,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);

var folder;
var dummyFolder;
var inbox2Folder;
var smartInboxFolder;

var msgHdr;

add_setup(async function () {
  assert_folder_mode("all");
  assert_folder_tree_view_row_count(7);

  // This is a subfolder of the inbox so that
  // test_display_message_in_smart_folder_mode_works is able to test that we
  // don't attempt to expand any inboxes.
  inboxFolder.createSubfolder("DisplayMessageWithFolderModesA", null);
  folder = inboxFolder.getChildNamed("DisplayMessageWithFolderModesA");
  // This second folder is meant to act as a dummy folder to switch to when we
  // want to not be in folder.
  inboxFolder.createSubfolder("DisplayMessageWithFolderModesB", null);
  dummyFolder = inboxFolder.getChildNamed("DisplayMessageWithFolderModesB");
  await make_message_sets_in_folders([folder], [{ count: 5 }]);
  // The message itself doesn't really matter, as long as there's at least one
  // in the inbox.  We will delete this in teardownModule because the inbox
  // is a shared resource and it's not okay to leave stuff in there.
  await make_message_sets_in_folders([inboxFolder], [{ count: 1 }]);

  // Create another subfolder on the top level that is not a parent of the
  // 2 folders so that it is not visible in Favorite mode.
  inboxFolder.server.rootFolder.createSubfolder("Inbox2", null);
  inbox2Folder = inboxFolder.server.rootFolder.getChildNamed("Inbox2");

  await be_in_folder(folder);
  msgHdr = window.gFolderDisplay.view.dbView.getMsgHdrAt(0);
});

/**
 * Test that displaying a message causes a switch to the default folder mode if
 * the folder isn't present in the current folder mode.
 */
add_task(
  async function test_display_message_with_folder_not_present_in_current_folder_mode() {
    // Make sure the folder doesn't appear in the favorite folder mode just
    // because it was selected last before switching
    await be_in_folder(inboxFolder);

    // Enable the favorite folders view. This folder isn't currently a favorite
    // folder.
    window.folderTreeView.activeModes = "favorite";
    // Hide the all folders view. The activeModes setter takes care of removing
    // the mode is is already visible.
    window.folderTreeView.activeModes = "all";

    assert_folder_not_visible(folder);
    assert_folder_not_visible(inboxFolder);
    assert_folder_not_visible(inbox2Folder);

    // Try displaying a message
    await display_message_in_folder_tab(msgHdr);

    assert_folder_mode("favorite");
    assert_folder_selected_and_displayed(folder);
    await assert_selected_and_displayed(msgHdr);
  }
);

/**
 * Test that displaying a message _does not_ cause a switch to the default
 * folder mode if the folder is present in the current folder mode.
 */
add_task(
  async function test_display_message_with_folder_present_in_current_folder_mode() {
    // Mark the folder as a favorite
    folder.setFlag(Ci.nsMsgFolderFlags.Favorite);
    // Also mark the dummy folder as a favorite, in preparation for
    // test_display_message_in_smart_folder_mode_works
    dummyFolder.setFlag(Ci.nsMsgFolderFlags.Favorite);

    // Make sure the folder doesn't appear in the favorite folder mode just
    // because it was selected last before switching
    await be_in_folder(inboxFolder);

    // Hide the all folders view. The activeModes setter takes care of removing
    // the mode if is already visible.
    window.folderTreeView.activeModes = "all";

    // Select the folder to open the parent row.
    await be_in_folder(folder);

    assert_folder_visible(folder);
    assert_folder_visible(dummyFolder);
    // Also their parent folder should be visible.
    assert_folder_visible(inboxFolder);
    // But not a sibling of their parent, which is not Favorite.
    assert_folder_not_visible(inbox2Folder);

    // Try displaying a message
    await display_message_in_folder_tab(msgHdr);

    assert_folder_mode("favorite");
    assert_folder_selected_and_displayed(folder);
    await assert_selected_and_displayed(msgHdr);

    // Now unset the flags so that we don't affect later tests.
    folder.clearFlag(Ci.nsMsgFolderFlags.Favorite);
    dummyFolder.clearFlag(Ci.nsMsgFolderFlags.Favorite);
  }
);

/**
 * Test that displaying a message in smart folders mode causes the parent in the
 * view to expand.
 */
add_task(async function test_display_message_in_smart_folder_mode_works() {
  // Clear the message selection, otherwise msgHdr will still be displayed and
  // display_message_in_folder_tab(msgHdr) will be a no-op.
  await select_none();
  // Show the smart folder view before removing the favorite view.
  window.folderTreeView.activeModes = "smart";
  // Hide the favorite view. The activeModes setter takes care of removing a
  // view if is currently active.
  window.folderTreeView.activeModes = "favorite";

  // Switch to the dummy folder, otherwise msgHdr will be in the view and the
  // display message in folder tab logic will simply select the message without
  // bothering to expand any folders.
  await be_in_folder(dummyFolder);

  const rootFolder = folder.server.rootFolder;
  // Check that the folder is actually the child of the account root
  assert_folder_child_in_view(folder, rootFolder);

  // Collapse everything
  smartInboxFolder = get_smart_folder_named("Inbox");
  collapse_folder(smartInboxFolder);
  assert_folder_collapsed(smartInboxFolder);
  collapse_folder(rootFolder);
  assert_folder_collapsed(rootFolder);
  assert_folder_not_visible(folder);

  // Try displaying the message
  await display_message_in_folder_tab(msgHdr);

  // Check that the right folders have expanded
  assert_folder_mode("smart");
  assert_folder_collapsed(smartInboxFolder);
  assert_folder_expanded(rootFolder);
  assert_folder_selected_and_displayed(folder);
  await assert_selected_and_displayed(msgHdr);
});

/**
 * Test that displaying a message in an inbox in smart folders mode causes the
 * message to be displayed in the smart inbox.
 */
add_task(
  async function test_display_inbox_message_in_smart_folder_mode_works() {
    await be_in_folder(inboxFolder);
    const inboxMsgHdr = window.gFolderDisplay.view.dbView.getMsgHdrAt(0);

    // Collapse everything
    collapse_folder(smartInboxFolder);
    assert_folder_collapsed(smartInboxFolder);
    assert_folder_not_visible(inboxFolder);
    const rootFolder = folder.server.rootFolder;
    collapse_folder(rootFolder);
    assert_folder_collapsed(rootFolder);

    // Move to a different folder
    await be_in_folder(get_smart_folder_named("Trash"));
    assert_message_not_in_view(inboxMsgHdr);

    // Try displaying the message
    await display_message_in_folder_tab(inboxMsgHdr);

    // Check that nothing has expanded, and that the right folder is selected
    assert_folder_mode("smart");
    assert_folder_collapsed(smartInboxFolder);
    assert_folder_collapsed(rootFolder);
    assert_folder_selected_and_displayed(smartInboxFolder);
    await assert_selected_and_displayed(inboxMsgHdr);
  }
);

/**
 * Move back to the all folders mode.
 */
add_task(function test_switch_to_all_folders() {
  // Hide the smart folders view enabled in the previous test. The activeModes
  // setter should take care of restoring the "all" view and prevent and empty
  // Folder pane.
  window.folderTreeView.activeModes = "smart";
  assert_folder_mode("all");
  assert_folder_tree_view_row_count(10);
});

registerCleanupFunction(function () {
  // Remove our folders
  inboxFolder.propagateDelete(folder, true);
  inboxFolder.propagateDelete(dummyFolder, true);
  inboxFolder.server.rootFolder.propagateDelete(inbox2Folder, true);
  assert_folder_tree_view_row_count(7);

  document.getElementById("folderTree").focus();

  Assert.report(
    false,
    undefined,
    undefined,
    "Test ran to completion successfully"
  );
});
