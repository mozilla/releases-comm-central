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
var { MockFilePicker } = ChromeUtils.importESModule(
  "resource://testing-common/MockFilePicker.sys.mjs"
);
var { MockSound } = ChromeUtils.importESModule(
  "resource://testing-common/MockSound.sys.mjs"
);

add_setup(async function () {
  const calendar = CalendarTestUtils.createCalendar("Mochitest", "memory");
  registerCleanupFunction(() => CalendarTestUtils.removeCalendar(calendar));
});

add_task(async function test_mailAlertAndSoundBindings() {
  await testCheckboxes(
    "paneNotifications",
    "mailNotificationsCategory",
    {
      checkboxID: "newMailNotification",
      pref: "mail.biff.play_sound",
      enabledElements: ["#soundType radio"],
    },
    {
      checkboxID: "newMailNotificationAlert",
      pref: "mail.biff.show_alert",
      enabledElements: ["#customizeMailAlert"],
    }
  );
}).skip(AppConstants.platform == "macosx");

add_task(async function test_mailSoundTypeBinding() {
  await SpecialPowers.pushPrefEnv({
    set: [["mail.biff.play_sound", true]],
  });

  await testRadioButtons("paneNotifications", "mailNotificationsCategory", {
    pref: "mail.biff.play_sound.type",
    states: [
      { id: "system", prefValue: 0 },
      {
        id: "custom",
        prefValue: 1,
        enabledElements: ["#soundUrlLocation", "#browseForSound"],
      },
    ],
  });
}).skip(AppConstants.platform == "macosx");

add_task(async function test_systemAlertBinding() {
  const initialStates = [true, false];
  for (const initiallyChecked of initialStates) {
    await using _prefs = await SpecialPowers.prefEnv({
      set: [
        ["mail.biff.show_alert", true],
        ["mail.biff.use_system_alert", initiallyChecked],
      ],
    });

    const { prefsDocument, prefsWindow } = await openNewPrefsTab(
      "paneNotifications",
      "mailNotificationsCategory"
    );
    const checkbox = prefsDocument.getElementById("useSystemNotificationAlert");
    Assert.ok(checkbox, "Notifications should have a system alert checkbox");
    checkbox.scrollIntoView({ block: "center", behavior: "instant" });

    Assert.equal(
      checkbox.checked,
      initiallyChecked,
      "The checkbox should match the initial preference"
    );
    Assert.equal(
      Services.prefs.getBoolPref("mail.biff.use_system_alert"),
      initiallyChecked,
      "The system alert preference should match the checkbox"
    );

    EventUtils.synthesizeMouseAtCenter(checkbox, {}, prefsWindow);
    Assert.equal(
      checkbox.checked,
      !initiallyChecked,
      "The checkbox should toggle"
    );
    Assert.equal(
      Services.prefs.getBoolPref("mail.biff.use_system_alert"),
      !initiallyChecked,
      "The system alert preference should toggle"
    );

    EventUtils.synthesizeMouseAtCenter(checkbox, {}, prefsWindow);
    Assert.equal(
      checkbox.checked,
      initiallyChecked,
      "The checkbox should return to its initial state"
    );
    Assert.equal(
      Services.prefs.getBoolPref("mail.biff.use_system_alert"),
      initiallyChecked,
      "The system alert preference should return to its initial value"
    );

    await closePrefsTab();
  }
}).skip(AppConstants.platform == "macosx");

add_task(async function test_trayIconBinding() {
  const initialStates = [true, false];
  for (const initiallyChecked of initialStates) {
    await using _prefs = await SpecialPowers.prefEnv({
      set: [["mail.biff.show_tray_icon", initiallyChecked]],
    });

    const { prefsDocument, prefsWindow } = await openNewPrefsTab(
      "paneNotifications",
      "mailNotificationsCategory"
    );
    const checkbox = prefsDocument.getElementById(
      "newMailNotificationTrayIcon"
    );
    Assert.ok(checkbox, "Notifications should have a tray icon checkbox");
    checkbox.scrollIntoView({ block: "center", behavior: "instant" });

    Assert.equal(
      checkbox.checked,
      initiallyChecked,
      "The checkbox should match the initial preference"
    );
    Assert.equal(
      Services.prefs.getBoolPref("mail.biff.show_tray_icon"),
      initiallyChecked,
      "The tray icon preference should match the checkbox"
    );

    EventUtils.synthesizeMouseAtCenter(checkbox, {}, prefsWindow);
    Assert.equal(
      checkbox.checked,
      !initiallyChecked,
      "The checkbox should toggle"
    );
    Assert.equal(
      Services.prefs.getBoolPref("mail.biff.show_tray_icon"),
      !initiallyChecked,
      "The tray icon preference should toggle"
    );

    EventUtils.synthesizeMouseAtCenter(checkbox, {}, prefsWindow);
    Assert.equal(
      checkbox.checked,
      initiallyChecked,
      "The checkbox should return to its initial state"
    );
    Assert.equal(
      Services.prefs.getBoolPref("mail.biff.show_tray_icon"),
      initiallyChecked,
      "The tray icon preference should return to its initial value"
    );

    await closePrefsTab();
  }
}).skip(AppConstants.platform != "win");

add_task(async function test_sounds() {
  // To hear the sound in this test, add `--setpref media.volume_scale=1.0` to
  // your command. You won't hear the system sound as nsISound is mocked out.

  await using _prefs = await SpecialPowers.prefEnv({
    set: [
      ["mail.biff.play_sound", true],
      ["mail.biff.play_sound.type", 0],
      ["mail.biff.play_sound.url", ""],
    ],
  });

  MockSound.init();
  registerCleanupFunction(() => MockSound.cleanup());

  const { prefsDocument, prefsWindow } = await openNewPrefsTab(
    "paneNotifications",
    "mailNotificationsCategory"
  );
  const playSoundButton = prefsDocument.getElementById("playSound");
  const soundUrlTextbox = prefsDocument.getElementById("soundUrlLocation");
  const browseButton = prefsDocument.getElementById("browseForSound");

  if (AppConstants.platform != "macosx") {
    const [systemRadio, customRadio] =
      prefsDocument.querySelectorAll("#soundType radio");
    Assert.ok(systemRadio.selected, "The system sound should be selected");
    Assert.ok(!playSoundButton.disabled, "The play button should be enabled");
    EventUtils.synthesizeMouseAtCenter(playSoundButton, {}, prefsWindow);
    Assert.deepEqual(
      MockSound.played,
      [`(event)${Ci.nsISound.EVENT_NEW_MAIL_RECEIVED}`],
      "The system sound should play"
    );
    MockSound.reset();
    EventUtils.synthesizeMouseAtCenter(customRadio, {}, prefsWindow);
  }

  Assert.ok(playSoundButton.disabled, "The play button should be disabled");
  Assert.equal(soundUrlTextbox.value, "", "The sound URL should be empty");

  const soundFile = new FileUtils.File(getTestFilePath("files/complete.oga"));
  const soundUrl = Services.io.newFileURI(soundFile).spec;
  MockFilePicker.init(window);
  registerCleanupFunction(() => MockFilePicker.cleanup());
  MockFilePicker.setFiles([soundFile]);
  MockFilePicker.returnValue = MockFilePicker.returnOK;

  EventUtils.synthesizeMouseAtCenter(browseButton, {}, prefsWindow);
  await TestUtils.waitForCondition(
    () => soundUrlTextbox.value,
    "The selected sound URL should be set"
  );
  Assert.equal(soundUrlTextbox.value, soundUrl, "The sound URL should match");
  Assert.equal(
    Services.prefs.getIntPref("mail.biff.play_sound.type"),
    1,
    "The custom sound type should be stored"
  );

  const audioPromise = TestUtils.topicObserved("notification-audio-ended");
  EventUtils.synthesizeMouseAtCenter(playSoundButton, {}, prefsWindow);
  const [audioElement] = await audioPromise;
  Assert.equal(MockSound.played.length, 0, "No system sound should play");
  Assert.equal(audioElement.src, soundUrl, "The custom sound should play");

  await closePrefsTab();
});

add_task(async function test_newMailAlertDialogs() {
  await using _prefs = await SpecialPowers.prefEnv({
    set: [
      ["mail.biff.show_alert", true],
      ["mail.biff.alert.enabled_actions", "mark-as-read"],
    ],
  });

  const { prefsDocument } = await openNewPrefsTab(
    "paneNotifications",
    "mailNotificationsCategory"
  );

  if (AppConstants.platform != "linux") {
    await promiseSubDialog(
      prefsDocument.getElementById("dockOptions"),
      "chrome://messenger/content/preferences/dockoptions.xhtml",
      () => {},
      "cancel"
    );
  }

  await promiseSubDialog(
    prefsDocument.getElementById("customizeMailAlert"),
    "chrome://messenger/content/preferences/notifications.xhtml",
    dialogWindow => {
      const list = dialogWindow.document.getElementById("enabledActions");
      Assert.deepEqual(
        Array.from(list.children, checkbox => checkbox.id),
        [
          "mark-as-read",
          "delete",
          "mark-as-starred",
          "mark-as-spam",
          "archive",
        ],
        "The alert actions should all be shown in order"
      );
      Assert.deepEqual(
        Array.from(list.children, checkbox => checkbox.checked),
        [true, false, false, false, false],
        "Only the mark-as-read checkbox should be checked"
      );
      EventUtils.synthesizeMouseAtCenter(list.children[0], {}, dialogWindow);
      EventUtils.synthesizeMouseAtCenter(list.children[1], {}, dialogWindow);
      EventUtils.synthesizeMouseAtCenter(list.children[3], {}, dialogWindow);
    },
    "accept"
  );
  Assert.equal(
    Services.prefs.getStringPref("mail.biff.alert.enabled_actions"),
    "delete,mark-as-spam",
    "The selected alert actions should be stored"
  );

  await promiseSubDialog(
    prefsDocument.getElementById("customizeMailAlert"),
    "chrome://messenger/content/preferences/notifications.xhtml",
    dialogWindow => {
      const list = dialogWindow.document.getElementById("enabledActions");
      Assert.deepEqual(
        Array.from(list.children, checkbox => checkbox.id),
        [
          "mark-as-read",
          "delete",
          "mark-as-starred",
          "mark-as-spam",
          "archive",
        ],
        "The alert actions should all be shown in order"
      );
      Assert.deepEqual(
        Array.from(list.children, checkbox => checkbox.checked),
        [false, true, false, true, false],
        "The delete and mark-as-spam checkboxes should be checked"
      );
      EventUtils.synthesizeMouseAtCenter(list.children[0], {}, dialogWindow);
      EventUtils.synthesizeMouseAtCenter(list.children[3], {}, dialogWindow);
    },
    "accept"
  );
  Assert.equal(
    Services.prefs.getStringPref("mail.biff.alert.enabled_actions"),
    "mark-as-read,delete",
    "The selected alert actions should be stored"
  );

  await closePrefsTab();
});

add_task(async function test_notificationsPlacementAndPlatformVisibility() {
  const { prefsDocument, prefsWindow } = await openNewPrefsTab(
    "paneNotifications",
    "mailNotificationsCategory"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(
      prefsDocument.getElementById("newMailNotificationAlert")
    ),
    "The mail alert setting should be visible in Notifications"
  );
  const systemAlert = prefsDocument.getElementById(
    "useSystemNotificationAlert"
  );
  Assert.equal(
    !!systemAlert,
    AppConstants.platform != "macosx",
    "The system alert setting should match platform support"
  );
  const trayIcon = prefsDocument.getElementById("newMailNotificationTrayIcon");
  Assert.equal(
    !!trayIcon,
    AppConstants.platform == "win",
    "The tray icon setting should only exist on Windows"
  );

  await prefsWindow.gotoPref("paneGeneral");
  Assert.equal(
    prefsWindow.gLastCategory.category,
    "paneGeneral",
    "General should be selected"
  );
  const mailAlert = prefsDocument.getElementById("newMailNotificationAlert");
  Assert.ok(mailAlert, "Notifications should have a mail alert setting");
  Assert.ok(
    BrowserTestUtils.isHidden(mailAlert),
    "Mail notification settings should be hidden in General"
  );

  await closePrefsTab();
});

add_task(async function test_calendarDeepLink() {
  const { prefsDocument, prefsWindow } = await openNewPrefsTab(
    "paneNotifications",
    "calendarNotificationSettingsLink"
  );
  const link = prefsDocument.getElementById("calendarNotificationSettingsLink");
  Assert.ok(link, "Notifications should have a Calendar settings link");
  Assert.ok(
    BrowserTestUtils.isVisible(
      prefsDocument.getElementById("calendarNotificationsSection")
    ),
    "The Calendar notifications section should be visible"
  );

  link.scrollIntoView({ block: "center", behavior: "instant" });
  const paneSelected = BrowserTestUtils.waitForEvent(
    prefsDocument,
    "paneSelected"
  );
  EventUtils.synthesizeMouseAtCenter(link, {}, prefsWindow);
  await paneSelected;

  Assert.equal(
    prefsWindow.gLastCategory.category,
    "paneCalendar",
    "Calendar should be selected"
  );
  const calendarNotifications = prefsDocument.querySelector(
    '[data-subcategory="calendarNotifications"]'
  );
  Assert.ok(
    calendarNotifications,
    "Calendar should have notification settings"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(calendarNotifications),
    "The Calendar notification settings should be visible"
  );

  await closePrefsTab();
});

add_task(async function test_noEnabledCalendars() {
  const calendarStates = cal.manager.getCalendars().map(calendar => ({
    calendar,
    isDisabled: calendar.getProperty("disabled"),
  }));

  try {
    for (const { calendar } of calendarStates) {
      calendar.setProperty("disabled", true);
    }

    const { prefsDocument } = await openNewPrefsTab(
      "paneNotifications",
      "mailNotificationsCategory"
    );
    Assert.ok(
      !prefsDocument.getElementById("calendarNotificationsSection"),
      "The Calendar notifications section should be absent when all calendars are disabled"
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
});

add_task(async function test_noChatSettingsLinkWhenChatDisabled() {
  await SpecialPowers.pushPrefEnv({
    set: [["mail.chat.enabled", false]],
  });

  const { prefsDocument } = await openNewPrefsTab("paneNotifications");
  Assert.ok(
    !prefsDocument.getElementById("chatNotificationSettingsLink"),
    "The Chat settings link should be absent when Chat is disabled"
  );

  await closePrefsTab();
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_chatDeepLink() {
  const { prefsDocument, prefsWindow } = await openNewPrefsTab(
    "paneNotifications",
    "chatNotificationSettingsLink"
  );
  const link = prefsDocument.getElementById("chatNotificationSettingsLink");
  Assert.ok(link, "Notifications should have a Chat settings link");

  link.scrollIntoView({ block: "center", behavior: "instant" });
  const paneSelected = BrowserTestUtils.waitForEvent(
    prefsDocument,
    "paneSelected"
  );
  EventUtils.synthesizeMouseAtCenter(link, {}, prefsWindow);
  await paneSelected;

  Assert.equal(
    prefsWindow.gLastCategory.category,
    "paneChat",
    "Chat should be selected"
  );
  const chatNotifications = prefsDocument.querySelector(
    '[data-subcategory="chatNotifications"]'
  );
  Assert.ok(chatNotifications, "Chat should have notification settings");
  Assert.ok(
    BrowserTestUtils.isVisible(chatNotifications),
    "The Chat notification settings should be visible"
  );

  await closePrefsTab();
}).skip(!AppConstants.MOZ_CHAT);
