/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This tests the move/copy to recent folder menus to make sure
 * that they get updated when messages are moved to folders, and
 * don't get updated when we archive.
 */

"use strict";

var {
  archive_selected_messages,
  be_in_folder,
  create_folder,
  get_special_folder,
  make_new_sets_in_folder,
  mc,
  press_delete,
  right_click_on_row,
  select_click_row,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);

var { MailUtils } = ChromeUtils.import("resource:///modules/MailUtils.jsm");
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

var folder1, folder2;
var gInitRecentMenuCount;

add_task(function setupModule(module) {
  // Ensure that there are no updated folders to ensure the recent folder
  // is empty.
  for (let folder of MailServices.accounts.allFolders) {
    folder.setStringProperty("MRMTime", "0");
  }

  // Try to make these folders first in alphabetic order
  folder1 = create_folder("aaafolder1");
  folder2 = create_folder("aaafolder2");

  make_new_sets_in_folder(folder1, [{ count: 3 }]);
});

add_task(async function test_move_message() {
  be_in_folder(folder1);
  let msgHdr = select_click_row(0);
  // This will cause the initial build of the move recent context menu,
  // which should be empty and disabled.
  await right_click_on_row(0);
  let popups = await mc.click_menus_in_sequence(
    mc.e("mailContext"),
    [{ id: "mailContext-moveMenu" }, { label: "Recent" }],
    true
  );
  let recentMenu = popups[popups.length - 2].querySelector('[label="Recent"]');
  Assert.equal(recentMenu.getAttribute("disabled"), "true");
  gInitRecentMenuCount = recentMenu.itemCount;
  Assert.equal(gInitRecentMenuCount, 0);
  let hiddenPromise = BrowserTestUtils.waitForEvent(
    mc.e("mailContext"),
    "popuphidden"
  );
  mc.close_popup_sequence(popups);
  await hiddenPromise;
  await new Promise(resolve => requestAnimationFrame(resolve));
  let copyListener = {
    copyDone: false,
    OnStartCopy() {},
    OnProgress(aProgress, aProgressMax) {},
    SetMessageKey(aKey) {},
    SetMessageId(aMessageId) {},
    OnStopCopy(aStatus) {
      this.copyDone = true;
    },
  };
  MailServices.copy.copyMessages(
    folder1,
    [msgHdr],
    folder2,
    true,
    copyListener,
    mc.window.msgWindow,
    true
  );
  mc.waitFor(
    () => copyListener.copyDone,
    "Timeout waiting for copy to complete",
    10000,
    100
  );
  // We've moved a message to aaafolder2 - it should appear in recent list now.
  // Clicking the menuitem by label is not localizable, but Recent doesn't have an
  // id we can use.
  await right_click_on_row(0);
  popups = await mc.click_menus_in_sequence(
    mc.e("mailContext"),
    [{ id: "mailContext-moveMenu" }, { label: "Recent" }],
    true
  );
  let recentChildren = popups[popups.length - 1].children;
  Assert.equal(
    recentChildren.length,
    gInitRecentMenuCount + 1,
    "recent menu should have one more child after move"
  );
  Assert.equal(
    recentChildren[0].label,
    "aaafolder2",
    "recent menu child should be aaafolder2 after move"
  );
  hiddenPromise = BrowserTestUtils.waitForEvent(
    mc.e("mailContext"),
    "popuphidden"
  );
  mc.close_popup_sequence(popups);
  await hiddenPromise;
  await new Promise(resolve => requestAnimationFrame(resolve));
});

add_task(async function test_delete_message() {
  press_delete(mc);
  // We've deleted a message - we should still just have folder2 in the menu.
  await right_click_on_row(0);
  let popups = await mc.click_menus_in_sequence(
    mc.e("mailContext"),
    [{ id: "mailContext-moveMenu" }, { label: "Recent" }],
    true
  );
  let recentChildren = popups[popups.length - 1].children;
  Assert.equal(
    recentChildren.length,
    gInitRecentMenuCount + 1,
    "delete shouldn't add anything to recent menu"
  );
  Assert.equal(
    recentChildren[0].label,
    "aaafolder2",
    "recent menu should still be aaafolder2 after delete"
  );
  let hiddenPromise = BrowserTestUtils.waitForEvent(
    mc.e("mailContext"),
    "popuphidden"
  );
  mc.close_popup_sequence(popups);
  await hiddenPromise;
  await new Promise(resolve => requestAnimationFrame(resolve));
});

add_task(async function test_archive_message() {
  archive_selected_messages();
  // We've archived a message - we should still just have folder2 in the menu.
  let archive = get_special_folder(Ci.nsMsgFolderFlags.Archive, false, false);
  be_in_folder(archive.descendants[0]);
  await right_click_on_row(0);
  let popups = await mc.click_menus_in_sequence(
    mc.e("mailContext"),
    [{ id: "mailContext-moveMenu" }, { label: "Recent" }],
    true
  );
  let recentChildren = popups[popups.length - 1].children;
  Assert.equal(
    recentChildren.length,
    gInitRecentMenuCount + 1,
    "archive shouldn't add anything to recent menu"
  );
  Assert.equal(
    recentChildren[0].label,
    "aaafolder2",
    "recent menu should still be aaafolder2 after archive"
  );
  let hiddenPromise = BrowserTestUtils.waitForEvent(
    mc.e("mailContext"),
    "popuphidden"
  );
  mc.close_popup_sequence(popups);
  await hiddenPromise;
  await new Promise(resolve => requestAnimationFrame(resolve));
});
