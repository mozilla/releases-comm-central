/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

add_task(async () => {
  requestLongerTimeout(2);

  // Temporarily disable `Once` StaticPrefs check for this test so that we
  // can change layers.acceleration.disabled without debug builds failing.
  await SpecialPowers.pushPrefEnv({
    set: [["preferences.force-disable.check.once.policy", true]],
  });
});

add_task(async () => {
  await testCheckboxes(
    "paneGeneral",
    "generalCategory",
    {
      checkboxID: "mailnewsStartPageEnabled",
      pref: "mailnews.start_page.enabled",
      enabledElements: [
        "#mailnewsStartPageUrl",
        "#mailnewsStartPageUrl + button",
      ],
    },
    {
      checkboxID: "alwaysCheckDefault",
      pref: "mail.shell.checkDefaultClient",
    }
  );
});

add_task(async () => {
  await testCheckboxes(
    "paneGeneral",
    "scrollingGroup",
    {
      checkboxID: "useAutoScroll",
      pref: "general.autoScroll",
    },
    {
      checkboxID: "useSmoothScrolling",
      pref: "general.smoothScroll",
    }
  );
});

add_task(async () => {
  await testCheckboxes(
    "paneGeneral",
    "enableGloda",
    {
      checkboxID: "enableGloda",
      pref: "mailnews.database.global.indexer.enabled",
    },
    {
      checkboxID: "allowHWAccel",
      pref: "layers.acceleration.disabled",
      prefValues: [true, false],
    }
  );
});

add_task(async () => {
  if (AppConstants.platform != "macosx") {
    await testCheckboxes(
      "paneGeneral",
      "incomingMailCategory",
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
  }
});

add_task(async () => {
  if (AppConstants.platform == "macosx") {
    return;
  }

  Services.prefs.setBoolPref("mail.biff.play_sound", true);

  await testRadioButtons("paneGeneral", "incomingMailCategory", {
    pref: "mail.biff.play_sound.type",
    states: [
      {
        id: "system",
        prefValue: 0,
      },
      {
        id: "custom",
        prefValue: 1,
        enabledElements: ["#soundUrlLocation", "#browseForSound"],
      },
    ],
  });
});

add_task(async () => {
  Services.prefs.setIntPref("mail.displayname.version", 1);

  await testCheckboxes("paneGeneral", "fontsGroup", {
    checkboxID: "displayGlyph",
    pref: "mail.display_glyph",
  });

  await testCheckboxes(
    "paneGeneral",
    "readingAndDisplayCategory",
    {
      checkboxID: "automaticallyMarkAsRead",
      pref: "mailnews.mark_message_read.auto",
      enabledElements: ["#markAsReadAutoPreferences radio"],
    },
    {
      checkboxID: "closeMsgOnMoveOrDelete",
      pref: "mail.close_message_window.on_delete",
    },
    {
      checkboxID: "showCondensedAddresses",
      pref: "mail.showCondensedAddresses",
    }
  );
});

add_task(async () => {
  Services.prefs.setBoolPref("mailnews.mark_message_read.auto", true);

  await testRadioButtons(
    "paneGeneral",
    "mark_read_immediately",
    {
      pref: "mailnews.mark_message_read.delay",
      states: [
        {
          id: "mark_read_immediately",
          prefValue: false,
        },
        {
          id: "markAsReadAfterDelay",
          prefValue: true,
          enabledElements: ["#markAsReadDelay"],
        },
      ],
    },
    {
      pref: "mail.openMessageBehavior",
      states: [
        {
          id: "newTab",
          prefValue: 2,
        },
        {
          id: "newWindow",
          prefValue: 0,
        },
        {
          id: "existingWindow",
          prefValue: 1,
        },
      ],
    }
  );
});

add_task(async () => {
  // We don't want to wake up the platform search for this test.
  // if (AppConstants.platform == "macosx") {
  //   tests.push({
  //     checkboxID: "searchIntegration",
  //     pref: "mail.spotlight.enable",
  //   });
  // } else if (AppConstants.platform == "win") {
  //   tests.push({
  //     checkboxID: "searchIntegration",
  //     pref: "mail.winsearch.enable",
  //   });
  // }

  await testCheckboxes(
    "paneGeneral",
    "allowSmartSize",
    {
      checkboxID: "allowSmartSize",
      pref: "browser.cache.disk.smart_size.enabled",
      prefValues: [true, false],
      enabledElements: ["#cacheSize"],
    },
    {
      checkboxID: "offlineCompactFolder",
      pref: "mail.prompt_purge_threshhold",
      enabledElements: [
        "#offlineCompactFolderMin",
        "#offlineCompactFolderAutomatically",
      ],
    }
  );
});

add_task(async () => {
  await testRadioButtons("paneGeneral", "formatLocale", {
    pref: "intl.regional_prefs.use_os_locales",
    states: [
      {
        id: "appLocale",
        prefValue: false,
      },
      {
        id: "rsLocale",
        prefValue: true,
      },
    ],
  });
});

add_task(async () => {
  await testRadioButtons("paneGeneral", "filesAttachmentCategory", {
    pref: "browser.download.useDownloadDir",
    states: [
      {
        id: "saveTo",
        prefValue: true,
        enabledElements: ["#downloadFolder", "#chooseFolder"],
      },
      {
        id: "alwaysAsk",
        prefValue: false,
      },
    ],
  });
});
