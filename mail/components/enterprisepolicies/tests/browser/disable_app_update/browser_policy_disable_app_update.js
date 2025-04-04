/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";
var updateService = Cc["@mozilla.org/updates/update-service;1"].getService(
  Ci.nsIApplicationUpdateService
);

add_task(async function test_updates_post_policy() {
  is(
    Services.policies.isAllowed("appUpdate"),
    false,
    "appUpdate should be disabled by policy."
  );

  is(
    updateService.canCheckForUpdates,
    false,
    "Should not be able to check for updates with DisableAppUpdate enabled."
  );
});

add_task(async function test_update_preferences_ui() {
  const tabmail = document.getElementById("tabmail");
  const prefsTabMode = tabmail.tabModes.preferencesTab;

  const prefsDocument = await new Promise(resolve => {
    Services.obs.addObserver(function documentLoaded(subject) {
      if (subject.URL == "about:preferences") {
        Services.obs.removeObserver(documentLoaded, "chrome-document-loaded");
        resolve(subject);
      }
    }, "chrome-document-loaded");
    window.openPreferencesTab("paneGeneral", "updateApp");
  });

  await new Promise(resolve => setTimeout(resolve));

  const setting = prefsDocument.getElementById("updateSettingsContainer");
  is(
    setting.hidden,
    true,
    "Update choices should be disabled when app update is locked by policy"
  );

  tabmail.closeTab(prefsTabMode.tabs[0]);
});

add_task(async function test_update_about_ui() {
  const aboutDialog = await waitForAboutDialog();
  const panelId = "policyDisabled";

  await BrowserTestUtils.waitForCondition(
    () =>
      aboutDialog.gAppUpdater.selectedPanel &&
      aboutDialog.gAppUpdater.selectedPanel.id == panelId,
    'Waiting for expected panel ID - expected "' + panelId + '"'
  );
  is(
    aboutDialog.gAppUpdater.selectedPanel.id,
    panelId,
    "The About Dialog panel Id should equal " + panelId
  );

  // Make sure that we still remain on the "disabled by policy" panel after
  // `AppUpdater.stop()` is called.
  aboutDialog.gAppUpdater._appUpdater.stop();
  is(
    aboutDialog.gAppUpdater.selectedPanel.id,
    panelId,
    "The About Dialog panel Id should still equal " + panelId
  );

  aboutDialog.close();
});

/**
 * Waits for the About Dialog to load.
 *
 * @returns {Promise<Window>} A promise that returns the domWindow for the
 *   About Dialog and resolves when the About Dialog loads.
 */
function waitForAboutDialog() {
  return new Promise(resolve => {
    var listener = {
      onOpenWindow: aAppWindow => {
        Services.wm.removeListener(listener);

        async function aboutDialogOnLoad() {
          domwindow.removeEventListener("load", aboutDialogOnLoad, true);
          const chromeURI = "chrome://messenger/content/aboutDialog.xhtml";
          is(
            domwindow.document.location.href,
            chromeURI,
            "About dialog appeared"
          );
          resolve(domwindow);
        }

        var domwindow = aAppWindow.docShell.domWindow;
        domwindow.addEventListener("load", aboutDialogOnLoad, true);
      },
      onCloseWindow: () => {},
    };

    Services.wm.addListener(listener);
    openAboutDialog();
  });
}
