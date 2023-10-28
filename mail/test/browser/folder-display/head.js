/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

function getFoldersContext() {
  return document
    .getElementById("tabmail")
    .currentAbout3Pane.document.getElementById("folderPaneContext");
}

function getMailContext() {
  return document
    .getElementById("tabmail")
    .currentAbout3Pane.document.getElementById("mailContext");
}

/**
 * Helper method to switch to a cards view with vertical layout.
 */
async function ensure_cards_view() {
  const { threadTree, threadPane } =
    document.getElementById("tabmail").currentAbout3Pane;

  Services.prefs.setIntPref("mail.pane_config.dynamic", 2);
  Services.xulStore.setValue(
    "chrome://messenger/content/messenger.xhtml",
    "threadPane",
    "view",
    "cards"
  );
  threadPane.updateThreadView("cards");

  await BrowserTestUtils.waitForCondition(
    () => threadTree.getAttribute("rows") == "thread-card",
    "The tree view switched to a cards layout"
  );
}

/**
 * Helper method to switch to a table view with classic layout.
 */
async function ensure_table_view() {
  const { threadTree, threadPane } =
    document.getElementById("tabmail").currentAbout3Pane;

  Services.prefs.setIntPref("mail.pane_config.dynamic", 0);
  Services.xulStore.setValue(
    "chrome://messenger/content/messenger.xhtml",
    "threadPane",
    "view",
    "table"
  );
  threadPane.updateThreadView("table");

  await BrowserTestUtils.waitForCondition(
    () => threadTree.getAttribute("rows") == "thread-row",
    "The tree view switched to a table layout"
  );
}

registerCleanupFunction(() => {
  const tabmail = document.getElementById("tabmail");
  Assert.equal(
    tabmail.tabInfo.length,
    1,
    "only the first tab should remain open"
  );
  tabmail.closeOtherTabs(tabmail.tabInfo[0]);
  tabmail.currentTabInfo.folderPaneVisible = true;
  tabmail.currentTabInfo.messagePaneVisible = true;

  Services.xulStore.removeDocument(
    "chrome://messenger/content/messenger.xhtml"
  );
  Services.prefs.clearUserPref("mail.pane_config.dynamic");
});
