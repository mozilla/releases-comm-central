/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { CalendarTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/calendar/CalendarTestUtils.sys.mjs"
);

add_setup(async function () {
  const calendar = CalendarTestUtils.createCalendar("Mochitest", "memory");

  registerCleanupFunction(async () => {
    CalendarTestUtils.removeCalendar(calendar);
  });
});

add_task(async function test_experimentalFeaturesDisabled() {
  await using _prefs = await SpecialPowers.prefEnv({
    set: [["mail.experimental_features_settings.enabled", false]],
  });

  let { prefsDocument } = await openNewPrefsTab(
    "paneAppearance",
    "appearanceCategory"
  );

  Assert.ok(
    !prefsDocument.getElementById("category-beta-features"),
    "Beta Features should not be shown in navigation when experimental features are disabled"
  );
  Assert.ok(
    !prefsDocument.getElementById("paneBetaFeatures"),
    "Beta Features should not have a pane when experimental features are disabled"
  );
  Assert.ok(
    !prefsDocument.getElementById("conversationViewSettingsLink"),
    "Appearance should not link to Conversation View when experimental features are disabled"
  );

  await closePrefsTab();

  ({ prefsDocument } = await openNewPrefsTab(
    "paneCalendar",
    "calendarPaneCategory"
  ));

  Assert.ok(
    !prefsDocument.getElementById("newCalendarDialogSettingsLink"),
    "Calendar should not link to Calendar Event Dialog when experimental features are disabled"
  );

  await closePrefsTab();
});
