/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { CalendarTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/calendar/CalendarTestUtils.sys.mjs"
);

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [["mail.offer_experimental_features", false]],
  });

  const calendar = CalendarTestUtils.createCalendar("Mochitest", "memory");

  registerCleanupFunction(async () => {
    CalendarTestUtils.removeCalendar(calendar);
  });
});

add_task(async function test_experimentalFeatures_disabled() {
  let { prefsDocument } = await openNewPrefsTab();

  const conversationViewExperimental = prefsDocument.getElementById(
    "conversationViewExperimental"
  );

  if (conversationViewExperimental) {
    Assert.ok(
      conversationViewExperimental.hidden,
      "The conversation view experimental option in the 'General' settings tab should be hidden"
    );
  }

  await closePrefsTab();

  ({ prefsDocument } = await openNewPrefsTab(
    "paneCalendar",
    "calendarPaneCategory"
  ));

  Assert.ok(
    prefsDocument.getElementById("newCalendarDialogExperimental").hidden,
    "The new calendar dialog experimental option in the 'Calendar' settings tab should be hidden"
  );

  await closePrefsTab();
});
