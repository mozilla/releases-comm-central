/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const AREAS = ["keyboard", "calendar", "chat", "message_display", "toolbox"];

// Checks that the correct number of clicks are registered against the correct
// keys in the scalars.
function assertInteractionScalars(expectedAreas) {
  let processScalars =
    Services.telemetry.getSnapshotForKeyedScalars("main", true)?.parent ?? {};

  for (let source of AREAS) {
    let scalars = processScalars?.[`tb.ui.interaction.${source}`] ?? {};

    let expected = expectedAreas[source] ?? {};

    let expectedKeys = new Set(
      Object.keys(scalars).concat(Object.keys(expected))
    );
    for (let key of expectedKeys) {
      Assert.equal(
        scalars[key],
        expected[key],
        `Expected to see the correct value for ${key} in ${source}.`
      );
    }
  }
}

add_task(async function() {
  Services.telemetry.clearScalars();

  EventUtils.synthesizeMouseAtCenter(
    document.getElementById("calendar-tab-button"),
    {},
    window
  );

  let calendarWindowPromise = BrowserTestUtils.promiseAlertDialog(
    "cancel",
    "chrome://calendar/content/calendar-creation.xhtml"
  );
  EventUtils.synthesizeMouseAtCenter(
    document.querySelector("#calendar-list-pane .calendar-list-create"),
    {},
    window
  );
  await calendarWindowPromise;

  EventUtils.synthesizeMouseAtCenter(
    document.querySelector("#tabmail-tabs tab:nth-child(2) .tab-close-button"),
    {},
    window
  );

  assertInteractionScalars({
    calendar: {
      "calendar-new-calendar-command": 1,
    },
    toolbox: {
      "calendar-tab-button": 1,
      "tab-close-button": 1,
    },
  });
});
