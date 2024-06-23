/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

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
  await testRadioButtons("paneGeneral", "changeAddressDisplayFormat", {
    pref: "mail.addressDisplayFormat",
    states: [
      {
        id: "displayFull",
        prefValue: 0,
      },
      {
        id: "displayEmail",
        prefValue: 1,
      },
      {
        id: "displayName",
        prefValue: 2,
      },
    ],
  });
});

add_task(async () => {
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

/**
 * Tests the system integration dialog.
 */
add_task(async function testSystemIntegrationDialog() {
  const { prefsDocument } = await openNewPrefsTab(
    "paneGeneral",
    "generalCategory"
  );
  await promiseSubDialog(
    prefsDocument.getElementById("checkDefaultButton"),
    "chrome://messenger/content/systemIntegrationDialog.xhtml",
    () => {},
    "cancel"
  );
  await closePrefsTab();
});

/**
 * Tests the language and appearance dialogs.
 */
add_task(async function testLanguageAndAppearanceDialogs() {
  const { prefsDocument } = await openNewPrefsTab(
    "paneGeneral",
    "languageAndAppearanceCategory"
  );
  await promiseSubDialog(
    prefsDocument.getElementById("advancedFonts"),
    "chrome://messenger/content/preferences/fonts.xhtml",
    () => {},
    "cancel"
  );
  await promiseSubDialog(
    prefsDocument.getElementById("colors"),
    "chrome://messenger/content/preferences/colors.xhtml",
    () => {},
    "cancel"
  );
  await promiseSubDialog(
    prefsDocument.getElementById("manageMessengerLanguagesButton"),
    "chrome://messenger/content/preferences/messengerLanguages.xhtml",
    () => {},
    "cancel"
  );
  await closePrefsTab();
});

/**
 * Tests the new mail alert dialogs.
 */
add_task(async function testNewMailAlertDialogs() {
  Services.prefs.setBoolPref("mail.biff.show_alert", true);
  const { prefsDocument } = await openNewPrefsTab(
    "paneGeneral",
    "incomingMailCategory"
  );
  if (AppConstants.platform != "linux") {
    await promiseSubDialog(
      prefsDocument.getElementById("dockOptions"),
      "chrome://messenger/content/preferences/dockoptions.xhtml",
      () => {},
      "cancel"
    );
  }
  if (AppConstants.platform != "macosx") {
    await promiseSubDialog(
      prefsDocument.getElementById("customizeMailAlert"),
      "chrome://messenger/content/preferences/notifications.xhtml",
      () => {},
      "cancel"
    );
  }
  await closePrefsTab();
});

/**
 * Tests the tag dialog.
 */
add_task(async function testTagDialog() {
  const { prefsDocument, prefsWindow } = await openNewPrefsTab(
    "paneGeneral",
    "tagsCategory"
  );

  await promiseSubDialog(
    prefsDocument.getElementById("newTagButton"),
    "chrome://messenger/content/newTagDialog.xhtml",
    async function (dialogWindow) {
      const dialogDocument = dialogWindow.document;

      EventUtils.sendString("tbird", dialogWindow);
      // "#000080" == rgb(0, 0, 128);
      dialogDocument.getElementById("tagColorPicker").value = "#000080";
    }
  );

  const tagList = prefsDocument.getElementById("tagList");

  Assert.ok(
    tagList.querySelector('richlistitem[value="tbird"]'),
    "new tbird tag should be in the list"
  );
  Assert.equal(
    tagList.querySelector('richlistitem[value="tbird"]').style.color,
    "rgb(0, 0, 128)",
    "tbird tag color should be correct"
  );
  Assert.equal(
    tagList.querySelectorAll('richlistitem[value="tbird"]').length,
    1,
    "new tbird tag should be in the list exactly once"
  );

  Assert.equal(
    tagList.querySelector('richlistitem[value="tbird"]'),
    tagList.selectedItem,
    "tbird tag should be selected"
  );

  // Now edit the tag. The key should stay the same, name and color will change.

  await promiseSubDialog(
    prefsDocument.getElementById("editTagButton"),
    "chrome://messenger/content/newTagDialog.xhtml",
    async function (dialogWindow) {
      const dialogDocument = dialogWindow.document;

      Assert.equal(
        dialogDocument.getElementById("name").value,
        "tbird",
        "should have existing tbird tag name prefilled"
      );
      Assert.equal(
        dialogDocument.getElementById("tagColorPicker").value,
        "#000080",
        "should have existing tbird tag color prefilled"
      );

      EventUtils.sendString("-xx", dialogWindow); // => tbird-xx
      // "#FFD700" == rgb(255, 215, 0);
      dialogDocument.getElementById("tagColorPicker").value = "#FFD700";
    }
  );

  Assert.ok(
    tagList.querySelector(
      'richlistitem[value="tbird"] > label[value="tbird-xx"]'
    ),
    "tbird-xx tag should be in the list"
  );
  Assert.equal(
    tagList.querySelector('richlistitem[value="tbird"]').style.color,
    "rgb(255, 215, 0)",
    "tbird-xx tag color should be correct"
  );
  Assert.equal(
    tagList.querySelectorAll('richlistitem[value="tbird"]').length,
    1,
    "tbird-xx tag should be in the list exactly once"
  );

  // And remove it.

  EventUtils.synthesizeMouseAtCenter(
    prefsDocument.getElementById("removeTagButton"),
    {},
    prefsWindow
  );
  await new Promise(r => setTimeout(r));

  Assert.equal(
    tagList.querySelector('richlistitem[value="tbird"]'),
    null,
    "tbird-xx (with key tbird) tag should have been removed from the list"
  );

  await closePrefsTab();
});

/**
 * Tests the receipts dialog.
 */
add_task(async function testReceiptsDialog() {
  const { prefsDocument } = await openNewPrefsTab(
    "paneGeneral",
    "readingAndDisplayCategory"
  );
  await promiseSubDialog(
    prefsDocument.getElementById("showReturnReceipts"),
    "chrome://messenger/content/preferences/receipts.xhtml",
    () => {},
    "cancel"
  );
  await closePrefsTab();
});

/**
 * Tests the update history dialog.
 */
add_task(async function testUpdateHistoryDialog() {
  const { prefsDocument } = await openNewPrefsTab(
    "paneGeneral",
    "updatesCategory"
  );
  await promiseSubDialog(
    prefsDocument.getElementById("showUpdateHistory"),
    "chrome://mozapps/content/update/history.xhtml",
    () => {},
    "cancel"
  );
  await closePrefsTab();
});

/**
 * Tests the network dialogs.
 */
add_task(async function testNetworkDialogs() {
  const { prefsDocument } = await openNewPrefsTab(
    "paneGeneral",
    "networkAndDiskspaceCategory"
  );
  await promiseSubDialog(
    prefsDocument.getElementById("catProxiesButton"),
    "chrome://messenger/content/preferences/connection.xhtml",
    () => {},
    "cancel"
  );
  await promiseSubDialog(
    prefsDocument.getElementById("offlineSettingsButton"),
    "chrome://messenger/content/preferences/offline.xhtml",
    () => {},
    "cancel"
  );
  await closePrefsTab();
});
