/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Tests for custom folder tree modes. The test mode is provided by the test
 * extension in the test-extension subdirectory.
 */

"use strict";

var {
  assert_folder_mode,
  assert_folder_visible,
  FAKE_SERVER_HOSTNAME,
  get_special_folder,
  mc,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);
var {
  close_window,
  plan_for_new_window,
  wait_for_new_window,
} = ChromeUtils.import("resource://testing-common/mozmill/WindowHelpers.jsm");

var { ExtensionSupport } = ChromeUtils.import(
  "resource:///modules/ExtensionSupport.jsm"
);
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { MailUtils } = ChromeUtils.import("resource:///modules/MailUtils.jsm");

var gInbox;

add_task(function setupModule(module) {
  let server = MailServices.accounts.FindServer(
    "tinderbox",
    FAKE_SERVER_HOSTNAME,
    "pop3"
  );
  gInbox = get_special_folder(Ci.nsMsgFolderFlags.Inbox, false, server);

  ExtensionSupport.registerWindowListener("mochitest", {
    chromeURLs: ["chrome://messenger/content/messenger.xhtml"],
    onLoadWindow(aWindow) {
      let testFolderTreeMode = {
        __proto__: aWindow.IFolderTreeMode,
        generateMap(aFTV) {
          var { MailServices } = ChromeUtils.import(
            "resource:///modules/MailServices.jsm"
          );
          // Pick the tinderbox@foo.invalid inbox and use it as the only folder
          let server = MailServices.accounts.FindServer(
            "tinderbox",
            "tinderbox123",
            "pop3"
          );
          let item = [];
          let inbox = new aWindow.FtvItem(
            server.rootFolder.getChildNamed("Inbox")
          );
          inbox.__defineGetter__("children", () => []);
          item.push(inbox);

          if (aWindow.gFolderTreeView.activeModes.length > 1) {
            item.unshift(new aWindow.FtvItemHeader("Test%20Mode", "testmode"));
          }

          return item;
        },
      };

      aWindow.gFolderTreeView.registerFolderTreeMode(
        "testmode",
        testFolderTreeMode,
        "Test Mode"
      );
    },
  });
});

// Provided by the extension in test-extension.
var kTestModeID = "testmode";

/**
 * Switch to the mode and verify that it displays correctly.
 */
add_task(function test_switch_to_test_mode() {
  mc.folderTreeView.activeModes = kTestModeID;
  // Hide the all folder view mode.
  mc.folderTreeView.activeModes = "all";

  assert_folder_mode(kTestModeID);
  assert_folder_visible(gInbox);
});

/**
 * Open a new 3-pane window while the custom mode is selected, and make sure
 * that the mode displayed in the new window is the custom mode.
 */
add_task(async function test_open_new_window_with_custom_mode() {
  // Our selection may get lost while changing modes, and be_in_folder is
  // not sufficient to ensure actual selection.
  mc.folderTreeView.selectFolder(gInbox);

  plan_for_new_window("mail:3pane");
  mc.window.MsgOpenNewWindowForFolder(null, -1);
  let mc2 = wait_for_new_window("mail:3pane");

  await TestUtils.waitForCondition(() => mc2.folderTreeView.isInited);
  assert_folder_mode(kTestModeID, mc2);
  assert_folder_visible(gInbox, mc2);

  close_window(mc2);
});

/**
 * Switch back to all folders.
 */
add_task(function test_switch_to_all_folders() {
  // Hide the test mode view enabled in the previous test. The activeModes
  // setter should take care of restoring the "all" view and prevent and empty
  // Folder pane.
  mc.folderTreeView.activeModes = kTestModeID;
  assert_folder_mode("all");
});

registerCleanupFunction(() => {
  mc.window.gFolderTreeView.unregisterFolderTreeMode(kTestModeID);
  ExtensionSupport.unregisterWindowListener("mochitest");
  Assert.report(
    false,
    undefined,
    undefined,
    "Test ran to completion successfully"
  );

  // Some tests that open new windows don't return focus to the main window
  // in a way that satisfies mochitest, and the test times out.
  Services.focus.focusedWindow = window;
  window.gFolderDisplay.tree.focus();
});
