/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { loadCategoryOptions, getCategoryOption } = ChromeUtils.importESModule(
  "moz-src:///comm/mail/components/calendar/content/calendar-event-category-options.mjs"
);
const { cal } = ChromeUtils.importESModule(
  "resource:///modules/calendar/calUtils.sys.mjs"
);

const prefs = [
  "calendar.categories.names",
  "calendar.category.color.work",
  "calendar.category.color.personal",
];

add_setup(function () {
  // Remember unset preferences so cleanup restores defaults without adding
  // user values.
  const previous = prefs.map(name => [
    name,
    Services.prefs.prefHasUserValue(name)
      ? Services.prefs.getStringPref(name)
      : null,
  ]);

  registerCleanupFunction(() => {
    for (const [name, value] of previous) {
      if (value === null) {
        Services.prefs.clearUserPref(name);
      } else {
        Services.prefs.setStringPref(name, value);
      }
    }
  });
});

add_task(async function test_configuredNamesAndColors() {
  // Keep the comma in "Team, East" and include "Work" twice.
  Services.prefs.setStringPref(
    "calendar.categories.names",
    "Work,Team\\, East,Personal,Work"
  );
  Services.prefs.setStringPref("calendar.category.color.work", "#000080");
  Services.prefs.setStringPref("calendar.category.color.personal", "#ffffff");

  const choices = await loadCategoryOptions();

  Assert.deepEqual(
    choices.map(option => option.name),
    ["Personal", "Team, East", "Work"],
    "Choices should sort and deduplicate names while preserving escaped commas"
  );

  Assert.deepEqual(
    choices.find(option => option.name == "Work"),
    { name: "Work", color: "#000080", textColor: "white" },
    "Dark category colors should use the Calendar contrast helper"
  );

  Assert.equal(
    choices[0].textColor,
    "#222",
    "Light category colors should use dark text"
  );

  Assert.equal(
    choices[1].color,
    "",
    "Unconfigured categories should use neutral colors"
  );
});

add_task(function test_unknownAndInvalidColors() {
  Services.prefs.setStringPref("calendar.category.color.work", "transparent");

  Assert.deepEqual(
    getCategoryOption("Work"),
    { name: "Work", color: "", textColor: "" },
    "Non-RGB colors should use neutral styling instead of invalid contrast input"
  );

  Assert.deepEqual(
    getCategoryOption("Unknown event category"),
    { name: "Unknown event category", color: "", textColor: "" },
    "Event categories absent from preferences should keep their names"
  );
});

add_task(async function test_defaultsDoNotWritePreferences() {
  Services.prefs.setStringPref("calendar.categories.names", "");

  const observer = {
    changes: [],
    observe(_subject, _topic, name) {
      this.changes.push(name);
    },
  };

  // This prefix watches both category names and colors.
  Services.prefs.addObserver("calendar.categor", observer);

  registerCleanupFunction(() =>
    Services.prefs.removeObserver("calendar.categor", observer)
  );

  const choices = await loadCategoryOptions();

  Assert.greater(
    choices.length,
    0,
    "Empty configured names should load localized defaults"
  );

  Assert.deepEqual(
    observer.changes,
    [],
    "Loading defaults should not write category preferences"
  );

  Assert.equal(
    Services.prefs.getStringPref("calendar.categories.names"),
    "",
    "Loading defaults should preserve the empty configured preference"
  );

  for (const option of choices) {
    Assert.equal(
      option.color,
      Services.prefs.getStringPref(
        `calendar.category.color.${cal.view.formatStringForCSSRule(option.name)}`,
        cal.view.hashColor(option.name)
      ),
      "Default choices should use configured colors or Calendar hash colors"
    );
  }
});
