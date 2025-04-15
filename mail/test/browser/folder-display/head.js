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
