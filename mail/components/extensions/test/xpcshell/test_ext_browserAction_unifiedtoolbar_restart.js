/* -*- Mode: indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set sts=2 sw=2 et tw=80: */
"use strict";

var { getCachedAllowedSpaces, setCachedAllowedSpaces } =
  ChromeUtils.importESModule(
    "resource:///modules/ExtensionToolbarButtons.sys.mjs"
  );
var { storeState, getState } = ChromeUtils.importESModule(
  "resource:///modules/CustomizationState.mjs"
);
const { AddonManager } = ChromeUtils.importESModule(
  "resource://gre/modules/AddonManager.sys.mjs"
);
var { AddonTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/AddonTestUtils.sys.mjs"
);
const { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);

const {
  createAppInfo,
  createHttpServer,
  createTempXPIFile,
  promiseRestartManager,
  promiseShutdownManager,
  promiseStartupManager,
  promiseCompleteAllInstalls,
  promiseFindAddonUpdates,
} = AddonTestUtils;

// Prepare test environment to be able to load add-on updates.
const PREF_EM_CHECK_UPDATE_SECURITY = "extensions.checkUpdateSecurity";
Services.prefs.setBoolPref(PREF_EM_CHECK_UPDATE_SECURITY, false);

let gProfD = do_get_profile();
let profileDir = gProfD.clone();
profileDir.append("extensions");
const stageDir = profileDir.clone();
stageDir.append("staged");

let server = createHttpServer({
  hosts: ["example.com"],
});

AddonTestUtils.init(this);
AddonTestUtils.overrideCertDB();

createAppInfo("xpcshell@tests.mozilla.org", "XPCShell", "1", "102");

async function enforceState(state) {
  const stateChangeObserved = TestUtils.topicObserved(
    "unified-toolbar-state-change"
  );
  storeState(state);
  await stateChangeObserved;
}

function check(testType, expectedCache, expectedMail, expectedCalendar) {
  let extensionId = `browser_action_spaces_${testType}@mochi.test`;

  Assert.equal(
    getCachedAllowedSpaces().has(extensionId),
    expectedCache != null,
    "CachedAllowedSpaces should include the test extension"
  );
  if (expectedCache != null) {
    Assert.deepEqual(
      getCachedAllowedSpaces().get(extensionId),
      expectedCache,
      "CachedAllowedSpaces should be correct"
    );
  }
  Assert.equal(
    getState().mail.includes(`ext-${extensionId}`),
    expectedMail,
    "The mail state should include the action button of the test extension"
  );
  Assert.equal(
    getState().calendar.includes(`ext-${extensionId}`),
    expectedCalendar,
    "The calendar state should include the action button of the test extension"
  );
}

function addXPI(testType, thisVersion, nextVersion, browser_action) {
  server.registerFile(
    `/addons/${testType}_v${thisVersion}.xpi`,
    createTempXPIFile({
      "manifest.json": {
        manifest_version: 2,
        name: testType,
        version: `${thisVersion}.0`,
        background: { scripts: ["background.js"] },
        applications: {
          gecko: {
            id: `browser_action_spaces_${testType}@mochi.test`,
            update_url: nextVersion
              ? `http://example.com/${testType}_updates_v${nextVersion}.json`
              : null,
          },
        },
        browser_action,
      },
      "background.js": `
          if (browser.runtime.getManifest().name == "delayed") {
              browser.runtime.onUpdateAvailable.addListener(details => {
                  browser.test.sendMessage("update postponed by ${thisVersion}");
              });
          }
          browser.test.log(" ===== ready ${testType} ${thisVersion}");
          browser.test.sendMessage("ready ${thisVersion}");`,
    })
  );
  if (nextVersion) {
    addUpdateJSON(testType, nextVersion);
  }
}

function addUpdateJSON(testType, nextVersion) {
  let extensionId = `browser_action_spaces_${testType}@mochi.test`;

  AddonTestUtils.registerJSON(
    server,
    `/${testType}_updates_v${nextVersion}.json`,
    {
      addons: {
        [extensionId]: {
          updates: [
            {
              version: `${nextVersion}.0`,
              update_link: `http://example.com/addons/${testType}_v${nextVersion}.xpi`,
              applications: {
                gecko: {
                  strict_min_version: "1",
                },
              },
            },
          ],
        },
      },
    }
  );
}

async function checkForExtensionUpdate(testType, extension) {
  let update = await promiseFindAddonUpdates(extension.addon);
  let install = update.updateAvailable;
  await promiseCompleteAllInstalls([install]);

  if (testType == "normal") {
    Assert.equal(
      install.state,
      AddonManager.STATE_INSTALLED,
      "Update should have been installed"
    );
  } else {
    Assert.equal(
      install.state,
      AddonManager.STATE_POSTPONED,
      "Update should have been postponed"
    );
  }
}

async function runTest(testType) {
  // Simulate starting up the app.
  await promiseStartupManager();

  // Set a customized state for the spaces we are working with in this test.
  await enforceState({
    mail: ["spacer", "search-bar", "spacer"],
    calendar: ["spacer", "search-bar", "spacer"],
  });

  // Check conditions before installing the add-on.
  check(testType, null, false, false);

  // Add the required update JSON to our test server, to be able to update to v2.
  addUpdateJSON(testType, 2);
  // Install addon v1 without a browserAction.
  let extension = ExtensionTestUtils.loadExtension({
    useAddonManager: "permanent",
    files: {
      "background.js": function () {
        if (browser.runtime.getManifest().name == "delayed") {
          function handleUpdateAvailable(details) {
            browser.test.sendMessage("update postponed by 1");
          }
          browser.runtime.onUpdateAvailable.addListener(handleUpdateAvailable);
        }
        browser.test.sendMessage("ready 1");
      },
    },
    manifest: {
      background: { scripts: ["background.js"] },
      version: "1.0",
      name: testType,
      applications: {
        gecko: {
          id: `browser_action_spaces_${testType}@mochi.test`,
          update_url: `http://example.com/${testType}_updates_v2.json`,
        },
      },
    },
  });
  await extension.startup();
  await extension.awaitMessage("ready 1");

  // State should not have changed.
  check(testType, null, false, false);

  // v2 will add the mail space and the default space.
  addXPI(testType, 2, 3, { allowed_spaces: ["mail", "default"] });
  await checkForExtensionUpdate(testType, extension);

  if (testType == "delayed") {
    await extension.awaitMessage("update postponed by 1");
    // Restart to install the update v2.
    await promiseRestartManager();
  }

  await extension.awaitStartup();
  await extension.awaitMessage("ready 2");

  // The button should have been added to the mail space.
  check(testType, ["mail", "default"], true, false);

  // Remove our extension button from all customized states.
  await enforceState({
    mail: ["spacer", "search-bar", "spacer"],
    calendar: ["spacer", "search-bar", "spacer"],
  });

  // Simulate restarting the app.
  await promiseRestartManager();
  await extension.awaitStartup();
  await extension.awaitMessage("ready 2");

  // The button should not be re-added to any space after the restart.
  check(testType, ["mail", "default"], false, false);

  // v3 will add the calendar space.
  addXPI(testType, 3, 4, {
    allowed_spaces: ["mail", "calendar", "default"],
  });
  await checkForExtensionUpdate(testType, extension);

  if (testType == "delayed") {
    await extension.awaitMessage("update postponed by 2");
    // Restart to install the update v3.
    await promiseRestartManager();
  }

  await extension.awaitStartup();
  await extension.awaitMessage("ready 3");

  // The button should have been added to the calendar space.
  check(testType, ["mail", "calendar", "default"], false, true);

  // Simulate restarting the app.
  await promiseRestartManager();
  await extension.awaitStartup();
  await extension.awaitMessage("ready 3");

  // Should not have changed.
  check(testType, ["mail", "calendar", "default"], false, true);

  // v4 will remove the calendar space again.
  addXPI(testType, 4, 5, { allowed_spaces: ["mail", "default"] });
  await checkForExtensionUpdate(testType, extension);

  if (testType == "delayed") {
    await extension.awaitMessage("update postponed by 3");
    // Restart to install the update v4.
    await promiseRestartManager();
  }

  await extension.awaitStartup();
  await extension.awaitMessage("ready 4");

  // The calendar space should no longer be known and the button should be removed
  // from the calendar space.
  check(testType, ["mail", "default"], false, false);

  // Simulate restarting the app.
  await promiseRestartManager();
  await extension.awaitStartup();
  await extension.awaitMessage("ready 4");

  // Should not have changed.
  check(testType, ["mail", "default"], false, false);

  // v5 will remove the entire browser_action. Testing the onUpdate code path in
  // ext-browserAction.
  addXPI(testType, 5, 6, null);
  await checkForExtensionUpdate(testType, extension);

  if (testType == "delayed") {
    await extension.awaitMessage("update postponed by 4");
    // Restart to install the update v5.
    await promiseRestartManager();
  }

  await extension.awaitStartup();
  await extension.awaitMessage("ready 5");

  // There should no longer be a cached entry for any known spaces.
  check(testType, null, false, false);

  // Simulate restarting the app.
  await promiseRestartManager();
  await extension.awaitStartup();
  await extension.awaitMessage("ready 5");

  // Should not have changed.
  check(testType, null, false, false);

  // v6 will add the mail space again.
  addXPI(testType, 6, null, { allowed_spaces: ["mail", "default"] });
  await checkForExtensionUpdate(testType, extension);

  if (testType == "delayed") {
    await extension.awaitMessage("update postponed by 5");
    // Restart to install the update v6.
    await promiseRestartManager();
  }

  await extension.awaitStartup();
  await extension.awaitMessage("ready 6");

  // The button should have been added to the mail space.
  check(testType, ["mail", "default"], true, false);

  // Unload the extension. Testing the onUninstall code path in ext-browserAction.
  await extension.unload();

  // There should no longer be a cached entry for any known spaces.
  check(testType, null, false, false);

  await promiseShutdownManager();
}

add_task(async function test_normal_updates() {
  await runTest("normal");
});

add_task(async function test_delayed_updates() {
  await runTest("delayed");
});
