/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { TelemetryTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TelemetryTestUtils.sys.mjs"
);

var tabmail = document.getElementById("tabmail");
var folders = {};

add_setup(async function() {
  MailServices.accounts.createLocalMailAccount();
  let account = MailServices.accounts.accounts[0];
  let rootFolder = account.incomingServer.rootFolder;

  for (let type of ["Drafts", "SentMail", "Templates", "Junk", "Archive"]) {
    rootFolder.createSubfolder(type, null);
    folders[type] = rootFolder.getChildNamed(type);
    folders[type].setFlag(Ci.nsMsgFolderFlags[type]);
  }
  rootFolder.createSubfolder("just a folder", null);
  folders.Other = rootFolder.getChildNamed("just a folder");

  let tab = tabmail.currentTabInfo;
  let folderPaneVisibleAtStart = tab.folderPaneVisible;
  let messagePaneVisibleAtStart = tab.messagePaneVisible;

  registerCleanupFunction(function() {
    MailServices.accounts.removeAccount(account, true);
    tabmail.closeOtherTabs(tab);
    if (tab.folderPaneVisible != folderPaneVisibleAtStart) {
      goDoCommand("cmd_toggleFolderPane");
    }
    if (tab.messagePaneVisible != messagePaneVisibleAtStart) {
      goDoCommand("cmd_toggleMessagePane");
    }
  });
});

add_task(async function testFolderOpen() {
  Services.telemetry.clearScalars();

  let about3Pane = tabmail.currentAbout3Pane;
  about3Pane.displayFolder(folders.Other.URI);

  let scalarName = "tb.mails.folder_opened";
  let scalars = TelemetryTestUtils.getProcessScalars("parent", true);
  TelemetryTestUtils.assertKeyedScalar(scalars, scalarName, "Other", 1);

  about3Pane.displayFolder(folders.Templates.URI);
  about3Pane.displayFolder(folders.Other.URI);

  scalars = TelemetryTestUtils.getProcessScalars("parent", true);
  TelemetryTestUtils.assertKeyedScalar(scalars, scalarName, "Other", 2);
  TelemetryTestUtils.assertKeyedScalar(scalars, scalarName, "Templates", 1);

  about3Pane.displayFolder(folders.Junk.URI);
  about3Pane.displayFolder(folders.Other.URI);

  scalars = TelemetryTestUtils.getProcessScalars("parent", true);
  TelemetryTestUtils.assertKeyedScalar(scalars, scalarName, "Other", 3);
  TelemetryTestUtils.assertKeyedScalar(scalars, scalarName, "Templates", 1);
  TelemetryTestUtils.assertKeyedScalar(scalars, scalarName, "Junk", 1);

  about3Pane.displayFolder(folders.Junk.URI);
  about3Pane.displayFolder(folders.Templates.URI);
  about3Pane.displayFolder(folders.Archive.URI);
  about3Pane.displayFolder(folders.Other.URI);

  scalars = TelemetryTestUtils.getProcessScalars("parent", true);
  TelemetryTestUtils.assertKeyedScalar(scalars, scalarName, "Other", 4);
  TelemetryTestUtils.assertKeyedScalar(scalars, scalarName, "Templates", 2);
  TelemetryTestUtils.assertKeyedScalar(scalars, scalarName, "Archive", 1);
  TelemetryTestUtils.assertKeyedScalar(scalars, scalarName, "Junk", 2);
});

add_task(async function testPaneVisibility() {
  let tab = tabmail.currentTabInfo;
  tabmail.currentAbout3Pane.displayFolder(folders.Other.URI);
  // Make the folder pane and message pane visible initially.
  if (!tab.folderPaneVisible) {
    goDoCommand("cmd_toggleFolderPane");
  }
  if (!tab.messagePaneVisible) {
    goDoCommand("cmd_toggleMessagePane");
  }
  // The scalar is updated by switching to the folder tab, so open another tab.
  window.openContentTab("about:mozilla");

  Services.telemetry.clearScalars();

  tabmail.switchToTab(0);

  let scalarName = "tb.ui.configuration.pane_visibility";
  let scalars = TelemetryTestUtils.getProcessScalars("parent", true);
  TelemetryTestUtils.assertKeyedScalar(scalars, scalarName, "folderPane", true);
  TelemetryTestUtils.assertKeyedScalar(
    scalars,
    scalarName,
    "messagePane",
    true
  );

  // Hide the folder pane.
  goDoCommand("cmd_toggleFolderPane");
  tabmail.switchToTab(1);
  tabmail.switchToTab(0);

  scalars = TelemetryTestUtils.getProcessScalars("parent", true);
  TelemetryTestUtils.assertKeyedScalar(
    scalars,
    scalarName,
    "folderPane",
    false
  );
  TelemetryTestUtils.assertKeyedScalar(
    scalars,
    scalarName,
    "messagePane",
    true
  );

  // Hide the message pane.
  goDoCommand("cmd_toggleMessagePane");
  tabmail.switchToTab(1);
  tabmail.switchToTab(0);

  scalars = TelemetryTestUtils.getProcessScalars("parent", true);
  TelemetryTestUtils.assertKeyedScalar(
    scalars,
    scalarName,
    "folderPane",
    false
  );
  TelemetryTestUtils.assertKeyedScalar(
    scalars,
    scalarName,
    "messagePane",
    false
  );

  // Show both panes again.
  goDoCommand("cmd_toggleFolderPane");
  goDoCommand("cmd_toggleMessagePane");
  tabmail.switchToTab(1);
  tabmail.switchToTab(0);

  scalars = TelemetryTestUtils.getProcessScalars("parent", true);
  TelemetryTestUtils.assertKeyedScalar(scalars, scalarName, "folderPane", true);
  TelemetryTestUtils.assertKeyedScalar(
    scalars,
    scalarName,
    "messagePane",
    true
  );

  // Close the extra tab.
  tabmail.closeOtherTabs(0);
});
