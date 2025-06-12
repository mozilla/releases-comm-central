/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
const { SearchIntegration } = ChromeUtils.importESModule(
  "resource:///modules/SearchIntegration.sys.mjs"
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
  if (AppConstants.platform == "macosx") {
    return;
  }
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
  await testCheckboxes("paneGeneral", "readingAndDisplayCategory", {
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
    },
    {
      checkboxID: "darkReader",
      pref: "mail.dark-reader.enabled",
    },
    {
      checkboxID: "darkReaderToggle",
      pref: "mail.dark-reader.show-toggle",
    }
  );

  // Nightly experimental prefs.
  if (AppConstants.NIGHTLY_BUILD) {
    await testCheckboxes("paneGeneral", "readingAndDisplayCategory", {
      checkboxID: "conversationView",
      pref: "mail.thread.conversation.enabled",
    });
  }
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

add_task(async function test_searchIntegrationDisabled() {
  const { prefsDocument } = await openNewPrefsTab(
    "paneGeneral",
    "generalCategory"
  );

  const checkbox = prefsDocument.getElementById("searchIntegration");

  Assert.ok(checkbox.disabled, "Checkbox should be disabled");
  Assert.ok(!checkbox.checked, "Checkbox should appear unchecked");

  await closePrefsTab();
}).skip(!SearchIntegration || !SearchIntegration.osComponentsNotRunning);

add_task(async function test_searchIntegration() {
  const { prefsDocument, prefsWindow } = await openNewPrefsTab(
    "paneGeneral",
    "generalCategory"
  );

  const checkbox = prefsDocument.getElementById("searchIntegration");
  checkbox.scrollIntoView({ block: "end", behavior: "instant" });

  Assert.equal(
    checkbox.checked,
    SearchIntegration.prefEnabled,
    "Initial state should match search integration"
  );
  const initialState = checkbox.checked;

  EventUtils.synthesizeMouseAtCenter(checkbox, {}, prefsWindow);

  Assert.notEqual(
    checkbox.checked,
    initialState,
    "Checkbox should have toggled value"
  );
  Assert.equal(
    SearchIntegration.prefEnabled,
    checkbox.checked,
    "Checkbox state should be mirrored to search integration"
  );

  EventUtils.synthesizeMouseAtCenter(checkbox, {}, prefsWindow);

  Assert.equal(
    checkbox.checked,
    initialState,
    "Checkbox should have toggled back"
  );
  Assert.equal(
    SearchIntegration.prefEnabled,
    checkbox.checked,
    "Checkbox state should again be mirrored to search integration"
  );

  await closePrefsTab();
}).skip(!SearchIntegration || SearchIntegration.osComponentsNotRunning);

add_task(async function test_searchIntegrationUnavailable() {
  const { prefsDocument } = await openNewPrefsTab(
    "paneGeneral",
    "generalCategory"
  );

  Assert.ok(
    BrowserTestUtils.isHidden(
      prefsDocument.getElementById("searchIntegration")
    ),
    "Search integration should be hidden"
  );

  await closePrefsTab();
}).skip(SearchIntegration);

add_task(async () => {
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
      pref: "mail.prompt_purge_threshold",
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
 * Tests the language and fonts dialogs.
 */
add_task(async function testLanguageAndFontsDialogs() {
  const { prefsDocument } = await openNewPrefsTab(
    "paneGeneral",
    "languageAndFontsCategory"
  );
  await promiseSubDialog(
    prefsDocument.getElementById("advancedFonts"),
    "chrome://messenger/content/preferences/fonts.xhtml",
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
  Services.prefs.setStringPref(
    "mail.biff.alert.enabled_actions",
    "mark-as-read"
  );
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
  await promiseSubDialog(
    prefsDocument.getElementById("customizeMailAlert"),
    "chrome://messenger/content/preferences/notifications.xhtml",
    async dialogWindow => {
      const dialogDocument = dialogWindow.document;
      const list = dialogDocument.getElementById("enabledActions");
      Assert.deepEqual(
        Array.from(list.children, cb => cb.id),
        [
          "mark-as-read",
          "delete",
          "mark-as-starred",
          "mark-as-spam",
          "archive",
        ],
        "actions checkboxes should all be shown and in order"
      );
      Assert.deepEqual(
        Array.from(list.children, cb => cb.checked),
        [true, false, false, false, false],
        "only the mark-as-read checkbox should be checked"
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
    "preference should have been updated"
  );
  await promiseSubDialog(
    prefsDocument.getElementById("customizeMailAlert"),
    "chrome://messenger/content/preferences/notifications.xhtml",
    async dialogWindow => {
      const dialogDocument = dialogWindow.document;
      const list = dialogDocument.getElementById("enabledActions");
      Assert.deepEqual(
        Array.from(list.children, cb => cb.id),
        [
          "mark-as-read",
          "delete",
          "mark-as-starred",
          "mark-as-spam",
          "archive",
        ],
        "actions checkboxes should all be shown and in order"
      );
      Assert.deepEqual(
        Array.from(list.children, cb => cb.checked),
        [false, true, false, true, false],
        "the delete and mark-as-spam checkboxes should be checked"
      );
      EventUtils.synthesizeMouseAtCenter(list.children[0], {}, dialogWindow);
      EventUtils.synthesizeMouseAtCenter(list.children[3], {}, dialogWindow);
    },
    "accept"
  );
  Assert.equal(
    Services.prefs.getStringPref("mail.biff.alert.enabled_actions"),
    "mark-as-read,delete",
    "preference should have been updated"
  );
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
  prefsDocument.getElementById("showReturnReceipts").scrollIntoView({
    behavior: "instant",
    block: "center",
  });
  await new Promise(resolve =>
    prefsDocument.ownerGlobal.requestAnimationFrame(resolve)
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
}).skip(
  AppConstants.platform === "win" &&
    Services.sysinfo.getProperty("hasWinPackageId")
); // The updates panel is disabled in MSIX builds.

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
