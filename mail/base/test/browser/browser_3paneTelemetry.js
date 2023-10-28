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

add_setup(async function () {
  MailServices.accounts.createLocalMailAccount();
  const account = MailServices.accounts.accounts[0];
  const rootFolder = account.incomingServer.rootFolder;

  for (const type of ["Drafts", "SentMail", "Templates", "Junk", "Archive"]) {
    rootFolder.createSubfolder(`telemetry${type}`, null);
    folders[type] = rootFolder.getChildNamed(`telemetry${type}`);
    folders[type].setFlag(Ci.nsMsgFolderFlags[type]);
  }
  rootFolder.createSubfolder("telemetryPlain", null);
  folders.Other = rootFolder.getChildNamed("telemetryPlain");

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
  Services.telemetry.clearScalars();

  const about3Pane = tabmail.currentAbout3Pane;
  about3Pane.displayFolder(folders.Other.URI);

  const scalarName = "tb.mails.folder_opened";
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

  Services.telemetry.clearScalars();

  tabmail.switchToTab(0);

  const scalarName = "tb.ui.configuration.pane_visibility";
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
