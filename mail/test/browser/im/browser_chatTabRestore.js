/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var utils = ChromeUtils.import("resource://testing-common/mozmill/utils.jsm");

var { assert_tab_mode_name, mc } = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);

/**
 * Create a new chat tab, making that tab the current tab. We block until the
 * message finishes loading. (Inspired by open_selected_message_in_new_tab)
 */
async function open_chat_tab() {
  // Get the current tab count so we can make sure the tab actually opened.
  let preCount =
    mc.window.document.getElementById("tabmail").tabContainer.allTabs.length;

  mc.window.document.getElementById("tabmail").openTab("chat", {});
  await wait_for_chat_tab_to_open(mc);

  if (
    mc.window.document.getElementById("tabmail").tabContainer.allTabs.length !=
    preCount + 1
  ) {
    throw new Error("The tab never actually got opened!");
  }

  let newTab = mc.window.document.getElementById("tabmail").tabInfo[preCount];
  return newTab;
}

async function wait_for_chat_tab_to_open(aController) {
  if (aController == null) {
    aController = mc;
  }

  utils.waitFor(
    function () {
      let chatTabFound = false;
      for (let tab of mc.window.document.getElementById("tabmail").tabInfo) {
        if (tab.mode.type == "chat") {
          chatTabFound = true;
          break;
        }
      }
      return chatTabFound;
    },
    "Timeout waiting for chat tab to open",
    1000,
    50
  );

  // The above may return immediately, meaning the event queue might not get a
  // chance. Give it a chance now.
  await new Promise(resolve => setTimeout(resolve));
}

/**
 * This tests that the chat tab is restored properly after tabs are
 * serialized. As for folder tabs, we can't test a restart (can we ?), so we
 * just test the persist/restore cycle.
 */
add_task(async function test_chat_tab_restore() {
  // Close everything but the first tab.
  let closeTabs = function () {
    while (mc.window.document.getElementById("tabmail").tabInfo.length > 1) {
      mc.window.document.getElementById("tabmail").closeTab(1);
    }
  };

  await open_chat_tab();
  let state = mc.window.document.getElementById("tabmail").persistTabs();
  closeTabs();
  mc.window.document.getElementById("tabmail").restoreTabs(state);

  if (
    mc.window.document.getElementById("tabmail").tabContainer.allTabs.length < 2
  ) {
    throw new Error("The tab is not restored!");
  }

  let tabTypes = ["mail3PaneTab", "chat"];
  for (let i in tabTypes) {
    assert_tab_mode_name(
      mc.window.document.getElementById("tabmail").tabInfo[i],
      tabTypes[i]
    );
  }

  closeTabs();

  Assert.report(
    false,
    undefined,
    undefined,
    "Test ran to completion successfully"
  );
});
