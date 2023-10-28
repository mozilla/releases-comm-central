/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

function getStoredLastSelected() {
  return Services.xulStore.getValue(
    "about:preferences",
    "paneDeck",
    "lastSelected"
  );
}

add_task(async () => {
  // Check that openPreferencesTab with no arguments and no stored value opens the first pane.
  Services.xulStore.removeDocument("about:preferences");

  const { prefsWindow } = await openNewPrefsTab();
  is(prefsWindow.gLastCategory.category, "paneGeneral");

  await closePrefsTab();
});

add_task(async () => {
  // Check that openPreferencesTab with one argument opens the right pane…
  Services.xulStore.removeDocument("about:preferences");

  await openNewPrefsTab("panePrivacy");
  is(getStoredLastSelected(), "panePrivacy");

  await closePrefsTab();

  // … even with a value in the XULStore.
  await openNewPrefsTab("paneCompose");
  is(getStoredLastSelected(), "paneCompose");

  await closePrefsTab();
});
