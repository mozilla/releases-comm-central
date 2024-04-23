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

add_task(async function testTagDialog() {
  const { prefsDocument, prefsWindow } = await openNewPrefsTab(
    "paneGeneral",
    "tagsCategory"
  );

  const newTagDialogPromise = BrowserTestUtils.promiseAlertDialogOpen(
    undefined,
    "chrome://messenger/content/newTagDialog.xhtml",
    {
      isSubDialog: true,
      async callback(dialogWindow) {
        await TestUtils.waitForCondition(
          () => Services.focus.focusedWindow == dialogWindow,
          "waiting for subdialog to be focused"
        );

        const dialogDocument = dialogWindow.document;

        EventUtils.sendString("tbird", dialogWindow);
        // "#000080" == rgb(0, 0, 128);
        dialogDocument.getElementById("tagColorPicker").value = "#000080";

        EventUtils.synthesizeMouseAtCenter(
          dialogDocument.querySelector("dialog").getButton("accept"),
          {},
          dialogWindow
        );
        await new Promise(r => setTimeout(r));
      },
    }
  );

  const newTagButton = prefsDocument.getElementById("newTagButton");
  EventUtils.synthesizeMouseAtCenter(newTagButton, {}, prefsWindow);
  await newTagDialogPromise;

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

  const editTagDialogPromise = BrowserTestUtils.promiseAlertDialogOpen(
    undefined,
    "chrome://messenger/content/newTagDialog.xhtml",
    {
      isSubDialog: true,
      async callback(dialogWindow) {
        await TestUtils.waitForCondition(
          () => Services.focus.focusedWindow == dialogWindow,
          "waiting for subdialog to be focused"
        );

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

        EventUtils.synthesizeMouseAtCenter(
          dialogDocument.querySelector("dialog").getButton("accept"),
          {},
          dialogWindow
        );
        await new Promise(r => setTimeout(r));
      },
    }
  );

  const editTagButton = prefsDocument.getElementById("editTagButton");
  EventUtils.synthesizeMouseAtCenter(editTagButton, {}, prefsWindow);
  await editTagDialogPromise;

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
