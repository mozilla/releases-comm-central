/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals openPreferencesTab */ // From mail/base/content/utilityOverlay.js

async function openNewPrefsTab(paneID, scrollPaneTo, otherArgs) {
  const tabmail = document.getElementById("tabmail");
  const prefsTabMode = tabmail.tabModes.preferencesTab;

  is(prefsTabMode.tabs.length, 0, "Prefs tab should not open from start");

  const prefsWindow = await openPreferencesTab(paneID, scrollPaneTo, otherArgs);
  ok(
    prefsWindow.location.href.startsWith("about:preferences"),
    "Prefs tab should be open after openPreferencesTab()"
  );

  const prefsDocument = prefsTabMode.tabs[0].browser.contentDocument;
  is(prefsWindow, prefsDocument.ownerGlobal, "prefsWindow should be correct");
  window.resizeTo(screen.availWidth, screen.availHeight);

  // If we don't wait here for other scripts to run, they
  // could be in a bad state if our test closes the tab.
  await new Promise(resolve => prefsWindow.setTimeout(resolve));
  if (paneID) {
    is(prefsWindow.gLastCategory.category, paneID, `Selected pane is ${paneID}`);
  }

  registerCleanupOnce();

  await new Promise(resolve => prefsWindow.setTimeout(resolve));
  const container = prefsDocument.getElementById("preferencesContainer");
  if (scrollPaneTo && container.scrollHeight > container.clientHeight) {
    await new Promise(resolve => prefsWindow.requestAnimationFrame(resolve));
    if (container.scrollTop == 0) {
      info("Page did not scroll yet, will wait for scrollend");
      await BrowserTestUtils.waitForEvent(container, "scrollend");
    }
    Assert.greater(container.scrollTop, 0, "Prefs page did scroll when it was supposed to");
  }
  await new Promise(resolve => prefsWindow.setTimeout(resolve));
  info(`Opened new prefs tab; paneID=${paneID}, scrollPaneTo=${scrollPaneTo}`);
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
