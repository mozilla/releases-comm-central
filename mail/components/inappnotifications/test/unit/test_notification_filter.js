/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { NotificationFilter } = ChromeUtils.importESModule(
  "resource:///modules/NotificationFilter.sys.mjs"
);
const { AppConstants } = ChromeUtils.importESModule(
  "resource://gre/modules/AppConstants.sys.mjs"
);
const { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);

const SAFETY_MARGIN_MS = 100000;

function getProfileFromAppValues() {
  const platform =
    AppConstants.platform === "linux"
      ? AppConstants.unixstyle
      : AppConstants.platform;
  return {
    locales: [Services.locale.appLocaleAsBCP47, "foo-BAR"],
    versions: [AppConstants.MOZ_APP_VERSION, "0"],
    channels: [AppConstants.MOZ_UPDATE_CHANNEL, "fictional testing channel"],
    operating_systems: [platform, "LCARS"],
    displayed_notifications: [],
    pref_true: [],
    pref_false: [],
  };
}

add_task(function test_isActiveNotification_emptyTargeting() {
  const now = Date.now();
  const notification = {
    end_at: new Date(now + SAFETY_MARGIN_MS).toISOString(),
    start_at: new Date(now - SAFETY_MARGIN_MS).toISOString(),
    targeting: {},
  };
  Assert.ok(NotificationFilter.isActiveNotification(notification, 0, []));
});

add_task(function test_isActiveNotification_timeWindowExpiry() {
  const now = Date.now();
  const mockData = [
    {
      id: "future bar",
      title: "dolor sit amet",
      start_at: new Date(now + SAFETY_MARGIN_MS).toISOString(),
      end_at: new Date(now + 2 * SAFETY_MARGIN_MS).toISOString(),
      targeting: {},
    },
    {
      id: "past bar",
      title: "back home now",
      start_at: new Date(now - 2 * SAFETY_MARGIN_MS).toISOString(),
      end_at: new Date(now - SAFETY_MARGIN_MS).toISOString(),
      targeting: {},
    },
    {
      id: "invalid",
      title: "invalid date strings",
      start_at: "foo",
      end_at: "bar",
      targeting: {},
    },
    {
      id: "invalid start",
      title: "invalid start_at string",
      start_at: "foo",
      end_at: new Date(now + SAFETY_MARGIN_MS).toISOString(),
      targeting: {},
    },
    {
      id: "invalid end",
      title: "invalid end_at string",
      start_at: new Date(now - SAFETY_MARGIN_MS).toISOString(),
      end_at: "bar",
      targeting: {},
    },
  ];

  for (const notification of mockData) {
    Assert.ok(
      !NotificationFilter.isActiveNotification(notification, 100, []),
      `Notification ${notification.id} is inactive`
    );
  }
});

add_task(function test_isActiveNotification_percentChance() {
  const now = Date.now();
  const notification = {
    end_at: new Date(now + SAFETY_MARGIN_MS).toISOString(),
    start_at: new Date(now - SAFETY_MARGIN_MS).toISOString(),
    targeting: {
      percent_chance: null,
    },
  };

  function subtest_seed(transitionAt, reasonChance, middleSeed = 42) {
    Assert.equal(
      NotificationFilter.isActiveNotification(notification, 0, []),
      transitionAt >= 0,
      `Chance of ${reasonChance} with seed 0`
    );
    Assert.equal(
      NotificationFilter.isActiveNotification(notification, middleSeed, []),
      transitionAt >= middleSeed,
      `Chance of ${reasonChance} with seed ${middleSeed}`
    );
    Assert.equal(
      NotificationFilter.isActiveNotification(notification, 100, []),
      transitionAt === 100,
      `Chance of ${reasonChance} with seed 100`
    );
  }

  subtest_seed(0, "null");

  notification.targeting.percent_chance = 0;
  subtest_seed(0, "0", 1);

  notification.targeting.percent_chance = 42;
  subtest_seed(42, "42", 42);

  notification.targeting.percent_chance = 100;
  subtest_seed(100, "100");
});

add_task(function test_isActiveNotification_exclude() {
  const now = Date.now();
  const notification = {
    end_at: new Date(now + SAFETY_MARGIN_MS).toISOString(),
    start_at: new Date(now - SAFETY_MARGIN_MS).toISOString(),
    targeting: {
      exclude: null,
    },
  };

  Assert.ok(
    NotificationFilter.isActiveNotification(notification, 100, []),
    "null exclude keeps the notification active"
  );

  notification.targeting.exclude = [];
  Assert.ok(
    NotificationFilter.isActiveNotification(notification, 100, []),
    "Empty exclude filter keeps the notification active"
  );

  notification.targeting.exclude.push({ locales: [] });
  notification.targeting.exclude.push({ versions: [] });
  Assert.ok(
    NotificationFilter.isActiveNotification(notification, 100, []),
    "Excluded pofile that doesn't match keeps the notification active"
  );

  notification.targeting.exclude.push(getProfileFromAppValues());
  Assert.ok(
    !NotificationFilter.isActiveNotification(notification, 100, []),
    "Excluded profile matching application makes notification inactive"
  );

  notification.targeting.exclude.push({});
  Assert.ok(
    !NotificationFilter.isActiveNotification(notification, 100, []),
    "Matching multiple excluded profiles keeps notification inactive"
  );
});

add_task(function test_isActiveNotification_include() {
  const now = Date.now();
  const notification = {
    end_at: new Date(now + SAFETY_MARGIN_MS).toISOString(),
    start_at: new Date(now - SAFETY_MARGIN_MS).toISOString(),
    targeting: {
      include: null,
    },
  };

  Assert.ok(
    NotificationFilter.isActiveNotification(notification, 100, []),
    "null include keeps the notification active"
  );

  notification.targeting.include = [];
  Assert.ok(
    !NotificationFilter.isActiveNotification(notification, 100, []),
    "Empty include filter makes the notification inactive"
  );

  notification.targeting.include.push({ locales: [] });
  notification.targeting.include.push({ versions: [] });
  Assert.ok(
    !NotificationFilter.isActiveNotification(notification, 100, []),
    "Included pofile that doesn't match keeps the notification inactive"
  );

  notification.targeting.include.push(getProfileFromAppValues());
  Assert.ok(
    NotificationFilter.isActiveNotification(notification, 100, []),
    "Included profile matching application makes notification active"
  );

  notification.targeting.include.push({});
  Assert.ok(
    NotificationFilter.isActiveNotification(notification, 100, []),
    "Matching multiple included profiles keeps notification active"
  );
});

add_task(function test_isActiveNotification_includedAndExcluded() {
  const now = Date.now();
  const profile = getProfileFromAppValues();
  const notification = {
    end_at: new Date(now + SAFETY_MARGIN_MS).toISOString(),
    start_at: new Date(now - SAFETY_MARGIN_MS).toISOString(),
    targeting: {
      exclude: [profile],
      include: [profile],
    },
  };

  Assert.ok(
    !NotificationFilter.isActiveNotification(notification, 100, []),
    "Exclude wins over include condition"
  );
});

add_task(function test_checkProfile_emptyMatch() {
  Assert.ok(
    NotificationFilter.checkProfile({}, []),
    "Empty object always matches"
  );

  function subtest_value(value, matches) {
    const properties = ["locales", "versions", "channels", "operating_systems"];
    for (const property of properties) {
      Assert.equal(
        NotificationFilter.checkProfile({ [property]: value }, []),
        matches,
        `Profile with ${JSON.stringify(value)} ${property} has expected match`
      );
    }
  }

  subtest_value(null, true);
  subtest_value([], false);
});

add_task(function test_checkProfile_displayedNotifications_emptyMatch() {
  Assert.ok(
    NotificationFilter.checkProfile({ displayed_notifications: null }, []),
    "Should match profile with null displayed notifications"
  );
  Assert.ok(
    NotificationFilter.checkProfile({ displayed_notifications: [] }, []),
    "Should match profile with empty displayed notifications"
  );
});

add_task(function test_checkProfile_prefTrue_emptyMatch() {
  Assert.ok(
    NotificationFilter.checkProfile({ pref_true: null }, []),
    "Should match profile with null pref true"
  );
  Assert.ok(
    NotificationFilter.checkProfile({ pref_true: [] }, []),
    "Should match profile with empty pref true"
  );
});

add_task(function test_checkProfile_prefFalse_emptyMatch() {
  Assert.ok(
    NotificationFilter.checkProfile({ pref_false: null }, []),
    "Should match profile with null pref false"
  );
  Assert.ok(
    NotificationFilter.checkProfile({ pref_false: [] }, []),
    "Should match profile with empty pref false"
  );
});

add_task(function test_checkProfile_match() {
  const profile = getProfileFromAppValues();
  Assert.ok(
    NotificationFilter.checkProfile(profile, []),
    "Profile built from current application values matches"
  );

  for (const [key, value] of Object.entries(profile)) {
    Assert.ok(
      NotificationFilter.checkProfile({ [key]: value }, []),
      "Profile built with just a single current application value should match"
    );
  }
});

add_task(function test_checkProfile_displayedNotifications_match() {
  Assert.ok(
    NotificationFilter.checkProfile({ displayed_notifications: ["bar"] }, [
      "foo",
    ]),
    "Should match profile without matching interacted notification ID"
  );
});

add_task(function test_checkProfile_singlePropertyMismatch() {
  const profile = getProfileFromAppValues();

  const mismatchingLocaleProfile = {
    ...profile,
    locales: ["foo-BAR"],
  };
  Assert.ok(
    !NotificationFilter.checkProfile(mismatchingLocaleProfile, []),
    "Profile doesn't match with mismatched language"
  );

  const mismatchingVersionProfile = {
    ...profile,
    versions: ["0"],
  };
  Assert.ok(
    !NotificationFilter.checkProfile(mismatchingVersionProfile, []),
    "Profile doesn't match with mismatched version"
  );

  const mismatchingChannelProfile = {
    ...profile,
    channels: ["fictional testing channel"],
  };
  Assert.ok(
    !NotificationFilter.checkProfile(mismatchingChannelProfile, []),
    "Profile doesn't match with mismatched channel"
  );

  const mismatchingOperatingSystemProfile = {
    ...profile,
    operating_systems: ["LCARS"],
  };
  Assert.ok(
    !NotificationFilter.checkProfile(mismatchingOperatingSystemProfile, []),
    "Profile doesn't match with mismatched operating system"
  );

  const mismatchingDisplayedNotificationsProfile = {
    ...profile,
    displayed_notifications: ["foo"],
  };
  Assert.ok(
    !NotificationFilter.checkProfile(mismatchingDisplayedNotificationsProfile, [
      "foo",
    ]),
    "Shouldn't match profile with a notification ID that has been displayed"
  );

  const mismatchingPrefTrueProfile = {
    ...profile,
    pref_true: ["test.example.inactive"],
  };
  Assert.ok(
    !NotificationFilter.checkProfile(mismatchingPrefTrueProfile, ["foo"]),
    "Shouldn't match profile with a pref that is unset"
  );

  const mismatchingPrefFalseProfile = {
    ...profile,
    pref_false: ["test.example.inactive"],
  };
  Assert.ok(
    !NotificationFilter.checkProfile(mismatchingPrefFalseProfile, ["foo"]),
    "Shouldn't match profile with a pref that is unset"
  );
});

add_task(async function test_isActiveNotification_url() {
  const now = Date.now();
  Assert.ok(
    NotificationFilter.isActiveNotification(
      {
        end_at: new Date(now + SAFETY_MARGIN_MS).toISOString(),
        start_at: new Date(now - SAFETY_MARGIN_MS).toISOString(),
        targeting: {},
        URL: "https://example.com",
      },
      0,
      []
    ),
    "Should allow https URL"
  );

  Assert.ok(
    !NotificationFilter.isActiveNotification(
      {
        end_at: new Date(now + SAFETY_MARGIN_MS).toISOString(),
        start_at: new Date(now - SAFETY_MARGIN_MS).toISOString(),
        targeting: {},
        URL: "http://example.com",
      },
      0,
      []
    ),
    "Should not allow http protocol"
  );

  Assert.ok(
    !NotificationFilter.isActiveNotification(
      {
        end_at: new Date(now + SAFETY_MARGIN_MS).toISOString(),
        start_at: new Date(now - SAFETY_MARGIN_MS).toISOString(),
        targeting: {},
        URL: "example://test/https://",
      },
      0,
      []
    ),
    "Should not allow non-https protocol"
  );

  const consoleErrorPromise = TestUtils.consoleMessageObserved(logMessage =>
    logMessage.wrappedJSObject.arguments?.[0].endsWith?.(
      "Error parsing notification URL:"
    )
  );
  Assert.ok(
    !NotificationFilter.isActiveNotification(
      {
        end_at: new Date(now + SAFETY_MARGIN_MS).toISOString(),
        start_at: new Date(now - SAFETY_MARGIN_MS).toISOString(),
        targeting: {},
        URL: "foo~bar[:/baz]",
      },
      0,
      []
    ),
    "Should not allow invalid URL"
  );
  await consoleErrorPromise;
});

add_task(function test_isActiveNotification_bypassFiltering() {
  const now = Date.now();
  const notification = {
    end_at: new Date(now - SAFETY_MARGIN_MS).toISOString(),
    start_at: new Date(now + SAFETY_MARGIN_MS).toISOString(),
    URL: "skip://me",
    targeting: {
      include: [],
    },
  };

  Assert.ok(
    !NotificationFilter.isActiveNotification(notification, 100, []),
    "Should exclude notification without bypass"
  );

  Services.prefs.setBoolPref("mail.inappnotifications.bypass-filtering", true);

  Assert.ok(
    NotificationFilter.isActiveNotification(notification, 100, []),
    "Should let notification pass with bypass enabled"
  );

  Services.prefs.clearUserPref("mail.inappnotifications.bypass-filtering");
});

add_task(function test_checkProfile_bypassFiltering() {
  const profile = {
    operating_systems: ["LCARS"],
    channels: ["fictional testing channel"],
    versions: ["0"],
    locales: ["foo-BAR"],
  };

  Assert.ok(
    !NotificationFilter.checkProfile(profile, []),
    "Should not accept profile without bypass"
  );

  Services.prefs.setBoolPref("mail.inappnotifications.bypass-filtering", true);

  Assert.ok(
    NotificationFilter.checkProfile(profile, []),
    "Should accept profile with active bypass"
  );

  Services.prefs.clearUserPref("mail.inappnotifications.bypass-filtering");
});

add_task(function test_isActiveNotification_idDisplayed() {
  Assert.ok(
    !NotificationFilter.isActiveNotification(
      {
        id: "foo",
      },
      100,
      ["foo"]
    ),
    "Notification with an ID that was interacted with should not be active"
  );
});

add_task(function test_checkProfile_prefTrue() {
  Services.prefs.setBoolPref("test.example.active", true);
  Services.prefs.setBoolPref("test.example.active.other", true);
  Services.prefs.setBoolPref("test.example.inactive", false);
  Assert.ok(
    !Services.prefs.prefHasUserValue("test.example.unset"),
    "Unset pref should not have a user value"
  );
  Assert.ok(
    !Services.prefs.prefHasDefaultValue("test.example.unset"),
    "Unset pref should not have a default value"
  );

  Assert.ok(
    NotificationFilter.checkProfile({
      pref_true: ["test.example.active"],
    }),
    "Should match with pref that is true"
  );
  Assert.ok(
    NotificationFilter.checkProfile({
      pref_true: ["test.example.active", "test.example.active.other"],
    }),
    "Should match with multiple true prefs"
  );
  Assert.ok(
    !NotificationFilter.checkProfile({
      pref_true: ["test.example.active", "test.example.inactive"],
    }),
    "Should not match with a pref that is false"
  );
  Assert.ok(
    !NotificationFilter.checkProfile({
      pref_true: ["test.example.active", "test.example.unset"],
    }),
    "Should not match with an unset pref"
  );

  Services.prefs.clearUserPref("test.example.active");
  Services.prefs.clearUserPref("test.example.active.other");
  Services.prefs.clearUserPref("test.example.inactive");
});

add_task(function test_checkProfile_prefFalse() {
  Services.prefs.setBoolPref("test.example.active", true);
  Services.prefs.setBoolPref("test.example.inactive", false);
  Services.prefs.setBoolPref("test.example.inactive.other", false);
  Assert.ok(
    !Services.prefs.prefHasUserValue("test.example.unset"),
    "Unset pref should not have a user value"
  );
  Assert.ok(
    !Services.prefs.prefHasDefaultValue("test.example.unset"),
    "Unset pref should not have a default value"
  );

  Assert.ok(
    NotificationFilter.checkProfile({
      pref_false: ["test.example.inactive"],
    }),
    "Should match with a pref that is false"
  );
  Assert.ok(
    NotificationFilter.checkProfile({
      pref_false: ["test.example.inactive", "test.example.inactive.other"],
    }),
    "Should still match with two false prefs"
  );
  Assert.ok(
    !NotificationFilter.checkProfile({
      pref_false: ["test.example.inactive", "test.example.active"],
    }),
    "Should not match with pref that is true"
  );
  Assert.ok(
    !NotificationFilter.checkProfile({
      pref_false: ["test.example.inactive", "test.example.unset"],
    }),
    "Should not match with an unset pref"
  );

  Services.prefs.clearUserPref("test.example.active");
  Services.prefs.clearUserPref("test.example.inactive");
  Services.prefs.clearUserPref("test.example.inactive.other");
});
