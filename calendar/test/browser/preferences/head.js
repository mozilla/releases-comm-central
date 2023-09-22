/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals openPreferencesTab */

async function openNewPrefsTab(paneID, scrollPaneTo, otherArgs) {
  const tabmail = document.getElementById("tabmail");
  const prefsTabMode = tabmail.tabModes.preferencesTab;

  Assert.equal(prefsTabMode.tabs.length, 0, "Prefs tab is not open");

  let prefsDocument = await new Promise(resolve => {
    Services.obs.addObserver(function documentLoaded(subject) {
      if (subject.URL.startsWith("about:preferences")) {
        Services.obs.removeObserver(documentLoaded, "chrome-document-loaded");
        resolve(subject);
      }
    }, "chrome-document-loaded");
    openPreferencesTab(paneID, scrollPaneTo, otherArgs);
  });
  Assert.ok(prefsDocument.URL.startsWith("about:preferences"), "Prefs tab is open");

  prefsDocument = prefsTabMode.tabs[0].browser.contentDocument;
  const prefsWindow = prefsDocument.ownerGlobal;
  prefsWindow.resizeTo(screen.availWidth, screen.availHeight);
  if (paneID) {
    await new Promise(resolve => prefsWindow.setTimeout(resolve));
    Assert.equal(prefsWindow.gLastCategory.category, paneID, `Selected pane is ${paneID}`);
  } else {
    // If we don't wait here for other scripts to run, they
    // could be in a bad state if our test closes the tab.
    await new Promise(resolve => prefsWindow.setTimeout(resolve));
  }

  registerCleanupOnce();

  await new Promise(resolve => prefsWindow.setTimeout(resolve));
  if (scrollPaneTo) {
    Assert.greater(
      prefsDocument.getElementById("preferencesContainer").scrollTop,
      0,
      "Prefs page did scroll when it was supposed to"
    );
  }
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
  const tabmail = document.getElementById("tabmail");
  const prefsTab = tabmail.tabModes.preferencesTab.tabs[0];
  if (prefsTab) {
    tabmail.closeTab(prefsTab);
  }
}
