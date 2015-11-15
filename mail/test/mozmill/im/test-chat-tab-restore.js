/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var MODULE_NAME = 'test-chat-tab-restore';

var RELATIVE_ROOT = '../shared-modules';
var MODULE_REQUIRES = ['folder-display-helpers'];

/**
 * Create a new chat tab, making that tab the current tab. We block until the
 * message finishes loading. (Inspired by open_selected_message_in_new_tab)
 */
function open_chat_tab() {
  // Get the current tab count so we can make sure the tab actually opened.
  let preCount = mc.tabmail.tabContainer.childNodes.length;

  mc.tabmail.openTab("chat", {});
  mark_action("imh", "open_chat_tab", []);
  wait_for_chat_tab_to_open(mc);

  if (mc.tabmail.tabContainer.childNodes.length != preCount + 1)
    throw new Error("The tab never actually got opened!");

  let newTab = mc.tabmail.tabInfo[preCount];
  return newTab;
}

function wait_for_chat_tab_to_open(aController) {
  if (aController == null)
    aController = mc;

  mark_action("imh", "wait_for_chat_tab_to_open", [aController]);
  utils.waitFor(function() {
    let chatTabFound = false;
    for (let tab of mc.tabmail.tabInfo) {
      if (tab.mode.type == "chat") {
        chatTabFound = true;
        break;
      }
    }
    return chatTabFound;
  }, "Timeout waiting for chat tab to open", 1000, 50);

  // The above may return immediately, meaning the event queue might not get a
  // chance. Give it a chance now.
  aController.sleep(0);
  mark_action("imh", "/wait_for_chat_tab_to_open", []);
}

function setupModule(module) {
  collector.getModule('folder-display-helpers').installInto(module);
}

/*
 * This tests that the chat tab is restored properly after tabs are
 * serialized. As for folder tabs, we can't test a restart (can we ?), so we
 * just test the persist/restore cycle.
 */
function test_chat_tab_restore() {
  // Close everything but the first tab.
  let closeTabs = function() {
    while (mc.tabmail.tabInfo.length > 1)
      mc.tabmail.closeTab(1);
  };

  open_chat_tab();
  let state = mc.tabmail.persistTabs();
  closeTabs();
  mc.tabmail.restoreTabs(state);

  if (mc.tabmail.tabContainer.childNodes.length < 2)
    throw new Error("The tab is not restored!");

  let tabTypes = ["folder", "chat"];
  for (let i in tabTypes) {
    assert_tab_mode_name(mc.tabmail.tabInfo[i], tabTypes[i]);
  }
}
