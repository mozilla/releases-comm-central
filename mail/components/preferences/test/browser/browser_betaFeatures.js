/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { cal } = ChromeUtils.importESModule(
  "resource:///modules/calendar/calUtils.sys.mjs"
);
var { CalendarTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/calendar/CalendarTestUtils.sys.mjs"
);

add_setup(async function () {
  const calendar = CalendarTestUtils.createCalendar("Mochitest", "memory");
  registerCleanupFunction(() => CalendarTestUtils.removeCalendar(calendar));
});

add_task(async function test_noCalendarDialogWhenCalendarsDisabled() {
  const calendarStates = cal.manager.getCalendars().map(calendar => ({
    calendar,
    isDisabled: calendar.getProperty("disabled"),
  }));

  try {
    for (const { calendar } of calendarStates) {
      calendar.setProperty("disabled", true);
    }

    const { prefsDocument } = await openNewPrefsTab("paneBetaFeatures");
    Assert.ok(
      !prefsDocument.getElementById("calendarDialog"),
      "The Calendar Event Dialog setting should be absent when calendars are disabled"
    );
  } finally {
    try {
      await closePrefsTab();
    } finally {
      for (const { calendar, isDisabled } of calendarStates) {
        if (isDisabled === null) {
          calendar.setProperty("disabled", false);
          calendar.deleteProperty("disabled");
        } else {
          calendar.setProperty("disabled", isDisabled);
        }
      }
    }
  }
}).skip(AppConstants.IS_ESR);

add_task(async function test_emptyStateWithoutFeatures() {
  const { prefsDocument } = await openNewPrefsTab("paneBetaFeatures");
  const content = prefsDocument.querySelector(".beta-features-content");
  const emptyState = prefsDocument.querySelector(".beta-features-empty");
  Assert.ok(content, "Beta Features should have a content container");
  Assert.ok(emptyState, "Beta Features should have an empty state");

  const title = emptyState.querySelector("h2");
  const description = emptyState.querySelector("p");
  Assert.ok(title, "The empty state should have a title");
  Assert.ok(description, "The empty state should have a description");
  Assert.equal(
    prefsDocument.l10n.getAttributes(title).id,
    "beta-features-empty-title",
    "The empty state title should be localized"
  );
  Assert.equal(
    prefsDocument.l10n.getAttributes(description).id,
    "beta-features-empty-description",
    "The empty state description should be localized"
  );

  const features = content.querySelectorAll(".beta-feature");
  for (const feature of features) {
    feature.classList.remove("beta-feature");
  }
  Assert.ok(
    BrowserTestUtils.isVisible(emptyState),
    "The empty state should be visible when no features are available"
  );

  const feature = prefsDocument.createElement("div");
  feature.classList.add("beta-feature");
  content.append(feature);
  Assert.ok(
    BrowserTestUtils.isHidden(emptyState),
    "The empty state should be hidden when a feature is available"
  );
  feature.remove();
  for (const originalFeature of features) {
    originalFeature.classList.add("beta-feature");
  }
  await closePrefsTab();
});

add_task(async function test_conversationViewBinding() {
  for (const initiallyChecked of [true, false]) {
    await using _prefs = await SpecialPowers.prefEnv({
      set: [
        ["mail.experimental_features_settings.enabled", true],
        ["mail.thread.conversation.enabled", initiallyChecked],
      ],
    });
    const { prefsDocument, prefsWindow } = await openNewPrefsTab(
      "paneBetaFeatures",
      "betaFeaturesCategory"
    );

    const checkbox = prefsDocument.getElementById("conversationView");
    Assert.ok(
      checkbox,
      "Beta Features should have a Conversation View checkbox"
    );
    checkbox.scrollIntoView({ block: "center", behavior: "instant" });

    Assert.equal(
      checkbox.checked,
      initiallyChecked,
      "The checkbox state should match the initial preference state"
    );

    EventUtils.synthesizeMouseAtCenter(checkbox, {}, prefsWindow);
    Assert.equal(
      checkbox.checked,
      !initiallyChecked,
      "The checkbox should toggle"
    );
    Assert.equal(
      Services.prefs.getBoolPref("mail.thread.conversation.enabled"),
      !initiallyChecked,
      "The Conversation View preference should toggle"
    );

    EventUtils.synthesizeMouseAtCenter(checkbox, {}, prefsWindow);
    Assert.equal(
      checkbox.checked,
      initiallyChecked,
      "The checkbox should return to its initial state"
    );
    Assert.equal(
      Services.prefs.getBoolPref("mail.thread.conversation.enabled"),
      initiallyChecked,
      "The Conversation View preference should return to its initial value"
    );
    await closePrefsTab();
  }
}).skip(!AppConstants.NIGHTLY_BUILD);

add_task(async function test_newCalendarEventDialogBinding() {
  for (const initiallyChecked of [true, false]) {
    await using _prefs = await SpecialPowers.prefEnv({
      set: [
        ["mail.experimental_features_settings.enabled", true],
        ["calendar.dialogs.new.enabled", initiallyChecked],
      ],
    });
    const { prefsDocument, prefsWindow } = await openNewPrefsTab(
      "paneBetaFeatures",
      "betaFeaturesCategory"
    );
    const checkbox = prefsDocument.getElementById("calendarDialog");
    Assert.ok(
      checkbox,
      "Beta Features should have a Calendar Event Dialog checkbox"
    );
    checkbox.scrollIntoView({ block: "center", behavior: "instant" });

    Assert.equal(
      checkbox.checked,
      initiallyChecked,
      "The checkbox should match the initial preference state"
    );

    EventUtils.synthesizeMouseAtCenter(checkbox, {}, prefsWindow);
    Assert.equal(
      checkbox.checked,
      !initiallyChecked,
      "The checkbox should toggle"
    );
    Assert.equal(
      Services.prefs.getBoolPref("calendar.dialogs.new.enabled"),
      !initiallyChecked,
      "The Calendar Event Dialog preference should toggle"
    );
    EventUtils.synthesizeMouseAtCenter(checkbox, {}, prefsWindow);
    Assert.equal(
      checkbox.checked,
      initiallyChecked,
      "The checkbox should return to its initial state"
    );
    Assert.equal(
      Services.prefs.getBoolPref("calendar.dialogs.new.enabled"),
      initiallyChecked,
      "The Calendar Event Dialog preference should return to its initial value"
    );
    await closePrefsTab();
  }
}).skip(AppConstants.IS_ESR);

add_task(async function test_conversationViewLinksToBetaFeatures() {
  await using _prefs = await SpecialPowers.prefEnv({
    set: [["mail.experimental_features_settings.enabled", true]],
  });

  try {
    const { prefsDocument, prefsWindow } =
      await openNewPrefsTab("paneAppearance");
    const link = prefsDocument.getElementById("conversationViewSettingsLink");

    Assert.ok(link, "Appearance should have a Conversation View settings link");

    link.scrollIntoView({ block: "center", behavior: "instant" });

    const paneSelected = BrowserTestUtils.waitForEvent(
      prefsDocument,
      "paneSelected"
    );
    EventUtils.synthesizeMouseAtCenter(link, {}, prefsWindow);
    await paneSelected;

    Assert.equal(
      prefsWindow.gLastCategory.category,
      "paneBetaFeatures",
      "Beta Features should be selected"
    );
    const conversationView = prefsDocument.querySelector(
      '[data-subcategory="conversationView"]'
    );
    Assert.ok(
      conversationView,
      "Beta Features should have a Conversation View setting"
    );
    Assert.ok(
      BrowserTestUtils.isVisible(conversationView),
      "The Conversation View setting should be visible"
    );
  } finally {
    await closePrefsTab();
  }
}).skip(!AppConstants.NIGHTLY_BUILD);

add_task(async function test_calendarEventDialogLinksToBetaFeatures() {
  await using _prefs = await SpecialPowers.prefEnv({
    set: [["mail.experimental_features_settings.enabled", true]],
  });

  try {
    const { prefsDocument, prefsWindow } = await openNewPrefsTab(
      "paneCalendar",
      "newCalendarDialogSettingsLink"
    );
    const link = prefsDocument.getElementById("newCalendarDialogSettingsLink");

    Assert.ok(link, "Calendar should have a New Calendar Event Dialog link");

    link.scrollIntoView({ block: "center", behavior: "instant" });

    const paneSelected = BrowserTestUtils.waitForEvent(
      prefsDocument,
      "paneSelected"
    );
    EventUtils.synthesizeMouseAtCenter(link, {}, prefsWindow);
    await paneSelected;

    Assert.equal(
      prefsWindow.gLastCategory.category,
      "paneBetaFeatures",
      "Beta Features should be selected"
    );

    const newCalendarDialog = prefsDocument.querySelector(
      '[data-subcategory="newCalendarDialog"]'
    );
    Assert.ok(
      newCalendarDialog,
      "Beta Features should have a Calendar Event Dialog setting"
    );
    Assert.ok(
      BrowserTestUtils.isVisible(newCalendarDialog),
      "The Calendar Event Dialog setting should be visible"
    );
  } finally {
    await closePrefsTab();
  }
}).skip(AppConstants.IS_ESR);
