/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
var tabmail = document.getElementById("tabmail");
var folders = {};

add_setup(async function () {
  const account = MailServices.accounts.createLocalMailAccount();
  const rootFolder = account.incomingServer.rootFolder.QueryInterface(
    Ci.nsIMsgLocalMailFolder
  );

  for (const type of ["Drafts", "SentMail", "Templates", "Junk", "Archive"]) {
    folders[type] = rootFolder.createLocalSubfolder(`telemetry${type}`);
    folders[type].setFlag(Ci.nsMsgFolderFlags[type]);
  }
  folders.Other = rootFolder.createLocalSubfolder("telemetryPlain");

  const { paneLayout } = tabmail.currentAbout3Pane;
  const folderPaneVisibleAtStart = paneLayout.folderPaneVisible;
  const messagePaneVisibleAtStart = paneLayout.messagePaneVisible;

  registerCleanupFunction(function () {
    MailServices.accounts.removeAccount(account, false);
    tabmail.closeOtherTabs(0);
    if (paneLayout.folderPaneVisible != folderPaneVisibleAtStart) {
      goDoCommand("cmd_toggleFolderPane");
    }
    if (paneLayout.messagePaneVisible != messagePaneVisibleAtStart) {
      goDoCommand("cmd_toggleMessagePane");
    }
  });
});

add_task(async function testFolderOpen() {
  Services.fog.testResetFOG();

  const about3Pane = tabmail.currentAbout3Pane;
  about3Pane.displayFolder(folders.Other.URI);

  Assert.equal(
    Glean.tb.folderOpened.Other.testGetValue(),
    1,
    "should have recorded opening Other"
  );

  about3Pane.displayFolder(folders.Templates.URI);
  about3Pane.displayFolder(folders.Other.URI);

  Assert.equal(
    Glean.tb.folderOpened.Other.testGetValue(),
    2,
    "should have recorded opening Other once more"
  );
  Assert.equal(
    Glean.tb.folderOpened.Templates.testGetValue(),
    1,
    "should have recorded opening Templates"
  );

  about3Pane.displayFolder(folders.Junk.URI);
  about3Pane.displayFolder(folders.Other.URI);

  Assert.equal(Glean.tb.folderOpened.Other.testGetValue(), 3);
  Assert.equal(Glean.tb.folderOpened.Templates.testGetValue(), 1);
  Assert.equal(Glean.tb.folderOpened.Junk.testGetValue(), 1);

  about3Pane.displayFolder(folders.Junk.URI);
  about3Pane.displayFolder(folders.Templates.URI);
  about3Pane.displayFolder(folders.Archive.URI);
  about3Pane.displayFolder(folders.Other.URI);

  Assert.equal(Glean.tb.folderOpened.Other.testGetValue(), 4);
  Assert.equal(Glean.tb.folderOpened.Templates.testGetValue(), 2);
  Assert.equal(Glean.tb.folderOpened.Archive.testGetValue(), 1);
  Assert.equal(Glean.tb.folderOpened.Junk.testGetValue(), 2);
});

add_task(async function testPaneVisibility() {
  const { paneLayout, displayFolder } = tabmail.currentAbout3Pane;
  displayFolder(folders.Other.URI);
  // Make the folder pane and message pane visible initially.
  if (!paneLayout.folderPaneVisible) {
    goDoCommand("cmd_toggleFolderPane");
  }
  if (!paneLayout.messagePaneVisible) {
    goDoCommand("cmd_toggleMessagePane");
  }
  // The scalar is updated by switching to the folder tab, so open another tab.
  window.openContentTab("about:mozilla");

  Services.fog.testResetFOG();

  tabmail.switchToTab(0);

  const fpValue =
    Glean.tb.uiConfigurationPaneVisibility.folderPane.testGetValue();
  Assert.equal(fpValue, true, "folderPane visibility should be correct");
  const mpValue =
    Glean.tb.uiConfigurationPaneVisibility.messagePane.testGetValue();
  Assert.equal(mpValue, true, "messagePane visibility should be correct");

  // Hide the folder pane.
  goDoCommand("cmd_toggleFolderPane");
  tabmail.switchToTab(1);
  tabmail.switchToTab(0);

  const fpValue2 =
    Glean.tb.uiConfigurationPaneVisibility.folderPane.testGetValue();
  Assert.equal(fpValue2, false, "folderPane visibility should be correct");
  const mpValue2 =
    Glean.tb.uiConfigurationPaneVisibility.messagePane.testGetValue();
  Assert.equal(mpValue2, true, "messagePane visibility should be correct");

  // Hide the message pane.
  goDoCommand("cmd_toggleMessagePane");
  tabmail.switchToTab(1);
  tabmail.switchToTab(0);

  const fpValue3 =
    Glean.tb.uiConfigurationPaneVisibility.folderPane.testGetValue();
  Assert.equal(fpValue3, false, "folderPane visibility should be correct");
  const mpValue3 =
    Glean.tb.uiConfigurationPaneVisibility.messagePane.testGetValue();
  Assert.equal(mpValue3, false, "messagePane visibility should be correct");

  // Show both panes again.
  goDoCommand("cmd_toggleFolderPane");
  goDoCommand("cmd_toggleMessagePane");
  tabmail.switchToTab(1);
  tabmail.switchToTab(0);

  const fpValue4 =
    Glean.tb.uiConfigurationPaneVisibility.folderPane.testGetValue();
  Assert.equal(fpValue4, true, "folderPane visibility should be correct");
  const mpValue4 =
    Glean.tb.uiConfigurationPaneVisibility.messagePane.testGetValue();
  Assert.equal(mpValue4, true, "messagePane visibility should be correct");

  // Close the extra tab.
  tabmail.closeOtherTabs(0);
});
