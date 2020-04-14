/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals openPreferencesTab */

async function openNewPrefsTab(paneID, scrollPaneTo, otherArgs) {
  let tabmail = document.getElementById("tabmail");
  let prefsTabMode = tabmail.tabModes.preferencesTab;

  Assert.equal(prefsTabMode.tabs.length, 0, "Prefs tab is not open");

  let prefsDocument = await new Promise(resolve => {
    Services.obs.addObserver(function documentLoaded(subject) {
      if (subject.URL == "about:preferences") {
        Services.obs.removeObserver(documentLoaded, "chrome-document-loaded");
        resolve(subject);
      }
    }, "chrome-document-loaded");
    openPreferencesTab(paneID, scrollPaneTo, otherArgs);
  });
  Assert.ok(prefsDocument.URL == "about:preferences", "Prefs tab is open");

  let prefsWindow = prefsDocument.ownerGlobal;
  if (paneID) {
    if (prefsWindow.getCurrentPaneID() != paneID) {
      let pane = prefsDocument.getElementById(paneID);
      await new Promise(resolve => {
        pane.addEventListener("paneSelected", resolve, { once: true });
      });
    }

    await new Promise(resolve => prefsWindow.setTimeout(resolve));
    Assert.equal(prefsWindow.getCurrentPaneID(), paneID, `Selected pane is ${paneID}`);
  } else {
    // If we don't wait here for other scripts to run, they
    // could be in a bad state if our test closes the tab.
    await new Promise(resolve => prefsWindow.setTimeout(resolve));
  }

  registerCleanupOnce();

  await new Promise(resolve => prefsWindow.setTimeout(resolve));
  return { prefsDocument, prefsWindow };
}

function registerCleanupOnce() {
  if (registerCleanupOnce.alreadyRegistered) {
    return;
  }
  registerCleanupFunction(closePrefsTab);
  registerCleanupOnce.alreadyRegistered = true;
}

async function closePrefsTab() {
  info("Closing prefs tab");
  let tabmail = document.getElementById("tabmail");
  let prefsTab = tabmail.tabModes.preferencesTab.tabs[0];
  if (prefsTab) {
    tabmail.closeTab(prefsTab);
  }
}
