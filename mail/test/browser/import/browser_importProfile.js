/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
const { MockFilePicker } = ChromeUtils.importESModule(
  "resource://testing-common/MockFilePicker.sys.mjs"
);

function checkSteps(importDocument, currentStep, totalSteps) {
  const stepNav = importDocument.getElementById("stepNav");
  is(stepNav.childElementCount, totalSteps, "Expected amount of steps");
  ok(
    stepNav
      .querySelector(`*:nth-child(${currentStep})`)
      .classList.contains("current"),
    `Expected step ${currentStep} is active`
  );
}

function checkVisiblePane(importDocument, activePaneId, activeStepId) {
  const panes = importDocument.querySelectorAll(".tabPane");
  for (const pane of panes) {
    if (pane.id === activePaneId) {
      ok(BrowserTestUtils.isVisible(pane), `Pane ${activePaneId} is visible`);
      const steps = pane.querySelectorAll("section");
      for (const step of steps) {
        if (step.id === activeStepId) {
          ok(
            BrowserTestUtils.isVisible(step),
            `Step ${activeStepId} is visible`
          );
        } else {
          ok(BrowserTestUtils.isHidden(step), `Step ${step.id} is hidden`);
        }
      }
    } else {
      ok(BrowserTestUtils.isHidden(pane), `Pane ${pane.id} is not visible`);
    }
  }
}

add_setup(() => {
  MockFilePicker.init(window);
  registerCleanupFunction(() => {
    MockFilePicker.cleanup();
  });
});

add_task(async function testProfileImport() {
  const profileDir = await IOUtils.createUniqueDirectory(
    PathUtils.tempDir,
    "profile-tmp"
  );
  await IOUtils.writeUTF8(
    PathUtils.join(profileDir, "prefs.js"),
    [
      ["mail.smtpserver.smtp1.username", "smtp-user-1"],
      ["mail.smtpservers", "smtp1"],
      ["mail.identity.id1.smtpServer", "smtp1"],
      ["mail.server.server2.type", "none"],
      ["mail.server.server6.type", "imap"],
      ["mail.account.account1.server", "server2"],
      ["mail.account.account2.server", "server6"],
      ["mail.account.account2.identities", "id1"],
      ["mail.accountmanager.accounts", "account2,account1"],
    ]
      .map(
        ([name, value]) =>
          `user_pref(${JSON.stringify(name)}, ${JSON.stringify(value)});`
      )
      .join("\n")
  );
  const filePath = Services.io
    .newURI(PathUtils.toFileURI(profileDir))
    .QueryInterface(Ci.nsIFileURL);
  MockFilePicker.setFiles([filePath.file]);
  registerCleanupFunction(async () => {
    await IOUtils.remove(profileDir, {
      recursive: true,
    });
  });

  const tab = await new Promise(resolve => {
    const tab = window.openTab("contentTab", {
      url: "about:import",
      onLoad() {
        resolve(tab);
      },
    });
  });
  const importDocument = tab.browser.contentDocument;

  ok(
    BrowserTestUtils.isHidden(importDocument.getElementById("exportDocs")),
    "Export docs link is hidden"
  );
  ok(
    BrowserTestUtils.isVisible(importDocument.getElementById("importDocs")),
    "Import docs link is visible"
  );

  checkSteps(importDocument, 1, 4);
  checkVisiblePane(importDocument, "tabPane-start", "start-sources");
  ok(
    importDocument.querySelector('#start-sources input[value="Thunderbird"]')
      .value,
    "Thunderbird profile is selected by default"
  );
  ok(
    BrowserTestUtils.isHidden(importDocument.getElementById("startBackButton")),
    "Back button is hidden in first step"
  );
  await BrowserTestUtils.synthesizeMouseAtCenter(
    "#tabPane-start .continue",
    {},
    tab.browser
  );
  const appPane = importDocument.getElementById("tabPane-app");
  await BrowserTestUtils.waitForMutationCondition(
    appPane,
    {
      attributes: true,
    },
    () => BrowserTestUtils.isVisible(appPane)
  );

  checkSteps(importDocument, 2, 4);
  checkVisiblePane(importDocument, "tabPane-app", "app-profiles");
  ok(
    BrowserTestUtils.isVisible(
      importDocument.getElementById("profileBackButton")
    ),
    "Back button is visible"
  );
  await BrowserTestUtils.synthesizeMouseAtCenter(
    '#filePickerList [value="file-picker-dir"]',
    {},
    tab.browser
  );
  await BrowserTestUtils.synthesizeMouseAtCenter(
    "#profileNextButton",
    {},
    tab.browser
  );
  const itemsStep = importDocument.getElementById("app-items");
  await BrowserTestUtils.waitForMutationCondition(
    itemsStep,
    {
      attributes: true,
    },
    () => BrowserTestUtils.isVisible(itemsStep)
  );

  checkSteps(importDocument, 3, 4);
  checkVisiblePane(importDocument, "tabPane-app", "app-items");
  await BrowserTestUtils.synthesizeMouseAtCenter(
    "#profileNextButton",
    {},
    tab.browser
  );
  const summaryStep = importDocument.getElementById("app-summary");
  await BrowserTestUtils.waitForMutationCondition(
    summaryStep,
    {
      attributes: true,
    },
    () => BrowserTestUtils.isVisible(summaryStep)
  );

  checkSteps(importDocument, 4, 4);
  checkVisiblePane(importDocument, "tabPane-app", "app-summary");
  ok(
    BrowserTestUtils.isHidden(
      importDocument.getElementById("profileNextButton")
    ),
    "Can't advance from summary step"
  );

  await BrowserTestUtils.synthesizeMouseAtCenter(
    "#appStartImport",
    {},
    tab.browser
  );

  const progressPane = importDocument.querySelector(
    "#app-summary .progressPane"
  );
  await BrowserTestUtils.waitForMutationCondition(
    appPane,
    {
      attributes: true,
    },
    () => BrowserTestUtils.isVisible(progressPane)
  );
  ok(
    BrowserTestUtils.isHidden(importDocument.getElementById("appStartImport")),
    "Import button is hidden while import is in progress"
  );

  const finish = importDocument.querySelector("#app-summary .progressFinish");
  await BrowserTestUtils.waitForMutationCondition(
    appPane,
    {
      attributes: true,
    },
    () => BrowserTestUtils.isVisible(finish)
  );
  ok(
    BrowserTestUtils.isVisible(progressPane),
    "When import succeeds and finish is shown, progress is still displayed"
  );

  // We close the tab ourselves instead of hitting the finish button, since
  // restarting Thunderbird within the test is a headache.
  document.getElementById("tabmail").closeTab(tab);
});

add_task(async function testImportLargeZIP() {
  // Writing the fake zip and deleting it can take some time.
  requestLongerTimeout(2);
  const profileDir = await IOUtils.createUniqueDirectory(
    PathUtils.tempDir,
    "profile-tmp"
  );
  const profileZip = PathUtils.join(profileDir, "profile.zip");
  // This block makes sure the ZIP file's fake contents go out of scope once
  // written out.
  {
    const halfAGigabyte = new Uint8Array(2 ** 29);
    await IOUtils.write(profileZip, halfAGigabyte);
    info("ZIP is 0.5 GB big now");
    for (let i = 0; i < 3; ++i) {
      await IOUtils.write(profileZip, halfAGigabyte, { mode: "append" });
      info(`ZIP is ${(i + 2) * 0.5} GB big now`);
    }
  }
  await IOUtils.write(
    profileZip,
    new Uint8Array(2), // These are extra bytes beyond 2 GB
    {
      mode: "append",
    }
  );
  const filePath = Services.io
    .newURI(PathUtils.toFileURI(profileZip))
    .QueryInterface(Ci.nsIFileURL);
  MockFilePicker.setFiles([filePath.file]);
  registerCleanupFunction(async () => {
    await IOUtils.remove(profileDir, {
      recursive: true,
    });
  });

  const tab = await new Promise(resolve => {
    const tab = window.openTab("contentTab", {
      url: "about:import",
      onLoad() {
        resolve(tab);
      },
    });
  });
  const importDocument = tab.browser.contentDocument;

  checkSteps(importDocument, 1, 4);
  checkVisiblePane(importDocument, "tabPane-start", "start-sources");
  ok(
    importDocument.querySelector('#start-sources input[value="Thunderbird"]')
      .value,
    "Thunderbird profile is selected by default"
  );
  ok(
    BrowserTestUtils.isHidden(importDocument.getElementById("startBackButton")),
    "Back button is hidden in first step"
  );
  await BrowserTestUtils.synthesizeMouseAtCenter(
    "#tabPane-start .continue",
    {},
    tab.browser
  );
  const appPane = importDocument.getElementById("tabPane-app");
  await BrowserTestUtils.waitForMutationCondition(
    appPane,
    {
      attributes: true,
    },
    () => BrowserTestUtils.isVisible(appPane)
  );

  checkSteps(importDocument, 2, 4);
  checkVisiblePane(importDocument, "tabPane-app", "app-profiles");
  ok(
    BrowserTestUtils.isVisible(
      importDocument.getElementById("profileBackButton")
    ),
    "Back button is visible"
  );
  await BrowserTestUtils.synthesizeMouseAtCenter(
    "#appFilePickerZip",
    {},
    tab.browser
  );
  await BrowserTestUtils.synthesizeMouseAtCenter(
    "#profileNextButton",
    {},
    tab.browser
  );

  const notificationBox = importDocument.getElementById("errorNotifications");
  await BrowserTestUtils.waitForMutationCondition(
    notificationBox,
    {
      childList: true,
    },
    () => notificationBox.childElementCount > 0
  );

  document.getElementById("tabmail").closeTab(tab);
});
