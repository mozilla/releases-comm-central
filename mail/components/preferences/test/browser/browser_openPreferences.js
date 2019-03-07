/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

function getStoredLastSelected() {
  return Services.xulStore.getValue("about:preferences", "MailPreferences", "lastSelected");
}

add_task(async () => {
  // Check that openPreferencesTab with no arguments and no stored value opens the first pane.
  Services.xulStore.removeDocument("about:preferences");

  let { prefsWindow } = await openNewPrefsTab();
  is(prefsWindow.getCurrentPaneID(), "paneGeneral");

  await closePrefsTab();
});

add_task(async () => {
  // Check that openPreferencesTab with one argument opens the right pane…
  Services.xulStore.removeDocument("about:preferences");

  await openNewPrefsTab("panePrivacy");
  is(getStoredLastSelected(), "panePrivacy");

  await closePrefsTab();

  // … even with a value in the XULStore.
  await openNewPrefsTab("paneAdvanced");
  is(getStoredLastSelected(), "paneAdvanced");

  await closePrefsTab();
});

add_task(async () => {
  // Check that openPreferencesTab with no second argument opens the right tab on a tabbed pane.
  Services.xulStore.removeDocument("about:preferences");
  Services.prefs.clearUserPref("mail.preferences.display.selectedTabIndex");

  await openNewPrefsTab("paneDisplay");
  is(getStoredLastSelected(), "paneDisplay");
  is(Services.prefs.getIntPref("mail.preferences.display.selectedTabIndex", -1), 0);

  await closePrefsTab();
});

add_task(async () => {
  // Check that openPreferencesTab with a second argument opens the right tab on a tabbed pane…
  Services.xulStore.removeDocument("about:preferences");
  Services.prefs.clearUserPref("mail.preferences.display.selectedTabIndex");

  let prefsDocument;
  ({ prefsDocument } = await openNewPrefsTab("paneDisplay", "tagTab"));
  is(getStoredLastSelected(), "paneDisplay");
  prefsDocument.getElementById("displayPrefs").selectedTab.id = "tagTab";
  is(Services.prefs.getIntPref("mail.preferences.display.selectedTabIndex", -1), 1);

  await closePrefsTab();

  // … even with a value in the prefs.
  ({ prefsDocument } = await openNewPrefsTab("paneDisplay", "displayTab"));
  is(getStoredLastSelected(), "paneDisplay");
  prefsDocument.getElementById("displayPrefs").selectedTab.id = "displayTab";
  is(Services.prefs.getIntPref("mail.preferences.display.selectedTabIndex", -1), 2);

  await closePrefsTab();
});
