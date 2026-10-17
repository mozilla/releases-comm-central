/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { MockFilePicker } = ChromeUtils.importESModule(
  "resource://testing-common/MockFilePicker.sys.mjs"
);
var { MockSound } = ChromeUtils.importESModule(
  "resource://testing-common/MockSound.sys.mjs"
);

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
}).skip(AppConstants.platform == "macosx");

add_task(async () => {
  await SpecialPowers.pushPrefEnv({
    set: [["mail.biff.play_sound", true]],
  });

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
}).skip(AppConstants.platform == "macosx");

add_task(async function test_sounds() {
  // To hear the sound in this test, add `--setpref media.volume_scale=1.0` to
  // your command. You won't hear the system sound as nsISound is mocked out.

  await SpecialPowers.pushPrefEnv({
    set: [
      ["mail.biff.play_sound", true],
      ["mail.biff.play_sound.type", 0],
      ["mail.biff.play_sound.url", ""],
    ],
  });
  MockSound.init();

  const { prefsDocument, prefsWindow } = await openNewPrefsTab(
    "paneGeneral",
    "incomingMailCategory"
  );
  const playSoundButton = prefsDocument.getElementById("playSound");
  const soundUrlTextbox = prefsDocument.getElementById("soundUrlLocation");
  const browseButton = prefsDocument.getElementById("browseForSound");

  if (AppConstants.platform != "macosx") {
    const [systemRadio, customRadio] =
      prefsDocument.querySelectorAll("#soundType radio");
    Assert.ok(systemRadio.selected);
    Assert.ok(!playSoundButton.disabled);
    EventUtils.synthesizeMouseAtCenter(playSoundButton, {}, prefsWindow);
    Assert.deepEqual(
      MockSound.played,
      [`(event)${Ci.nsISound.EVENT_NEW_MAIL_RECEIVED}`],
      "should have played the system sound"
    );
    MockSound.reset();

    EventUtils.synthesizeMouseAtCenter(customRadio, {}, prefsWindow);
  }
  Assert.ok(playSoundButton.disabled);
  Assert.equal(soundUrlTextbox.value, "");

  const soundFile = new FileUtils.File(getTestFilePath("files/complete.oga"));
  const soundUrl = Services.io.newFileURI(soundFile).spec;
  MockFilePicker.init(window);
  MockFilePicker.setFiles([soundFile]);
  MockFilePicker.returnValue = MockFilePicker.returnOK;
  EventUtils.synthesizeMouseAtCenter(browseButton, {}, prefsWindow);
  await TestUtils.waitForCondition(
    () => soundUrlTextbox.value,
    "waiting for sound url to be set"
  );
  Assert.equal(soundUrlTextbox.value, soundUrl);

  Assert.equal(Services.prefs.getIntPref("mail.biff.play_sound.type"), 1);
  const audioPromise = TestUtils.topicObserved("notification-audio-ended");
  EventUtils.synthesizeMouseAtCenter(playSoundButton, {}, prefsWindow);
  const [audioElement] = await audioPromise;
  Assert.equal(MockSound.played.length, 0);
  Assert.equal(audioElement.src, soundUrl);

  await closePrefsTab();

  MockSound.cleanup();
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
  await SpecialPowers.pushPrefEnv({
    set: [["mailnews.mark_message_read.auto", true]],
  });

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

  const { prefsDocument } = await openNewPrefsTab(
    "paneGeneral",
    "formatLocale"
  );
  const appLocale = prefsDocument.getElementById("appLocale");
  const regionalLocale = prefsDocument.getElementById("rsLocale");
  Assert.equal(
    prefsDocument.l10n.getAttributes(appLocale).id,
    "date-time-app-locale"
  );
  Assert.equal(
    prefsDocument.l10n.getAttributes(regionalLocale).id,
    "date-time-regional-locale"
  );
  await closePrefsTab();
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

add_task(async function testApplicationHandlerStrings() {
  const protocol = "web+fluent-handler-test";
  const appName = "Fluent Test Handler";
  const uriTemplate = "https://example.com/?url=%s";
  const externalProtocolService = Cc[
    "@mozilla.org/uriloader/external-protocol-service;1"
  ].getService(Ci.nsIExternalProtocolService);
  const handlerService = Cc[
    "@mozilla.org/uriloader/handler-service;1"
  ].getService(Ci.nsIHandlerService);
  const handlerInfo = externalProtocolService.getProtocolHandlerInfo(protocol);
  const handlerApp = Cc[
    "@mozilla.org/uriloader/web-handler-app;1"
  ].createInstance(Ci.nsIWebHandlerApp);
  handlerApp.name = appName;
  handlerApp.uriTemplate = uriTemplate;
  handlerInfo.alwaysAskBeforeHandling = false;
  handlerInfo.preferredAction = Ci.nsIHandlerInfo.useHelperApp;
  handlerInfo.preferredApplicationHandler = handlerApp;
  handlerInfo.possibleApplicationHandlers.appendElement(handlerApp);
  handlerService.store(handlerInfo);

  let handlerStored = true;
  registerCleanupFunction(() => {
    if (handlerStored) {
      handlerService.remove(handlerInfo);
    }
  });

  await SpecialPowers.pushPrefEnv({ set: [["pdfjs.disabled", false]] });
  const paneLoaded = TestUtils.topicObserved("app-handler-pane-loaded");
  const { prefsDocument, prefsWindow } = await openNewPrefsTab(
    "paneGeneral",
    "filesAttachmentCategory"
  );
  await paneLoaded;

  const handlerRows = [...prefsWindow.gGeneralPane._handlerRows];
  const findHandlerRow = type =>
    handlerRows.find(([handler]) => handler.type == type)?.[1];
  const assertMenuItemL10n = (row, id, args = null) => {
    const item = row.menu.menupopup.querySelector(`[data-l10n-id="${id}"]`);
    Assert.ok(item, `the menu should contain an item using ${id}`);
    Assert.deepEqual(
      prefsDocument.l10n.getAttributes(item),
      { id, args },
      `the ${row.handlerInfoWrapper.type} menu item should use ${id} with the expected arguments`
    );
  };

  const pdfRow = findHandlerRow("application/pdf");
  Assert.ok(pdfRow, "the built-in PDF handler should be listed");
  Assert.equal(
    pdfRow.node.querySelector(".typeDescription").value,
    await prefsDocument.l10n.formatValue("applications-type-pdf"),
    "the PDF handler should display the localized type description"
  );
  for (const id of [
    "applications-preview-in-app",
    "applications-always-ask",
    "applications-save-file",
    "applications-use-other-app",
    "applications-delete-action",
  ]) {
    assertMenuItemL10n(pdfRow, id);
  }

  // Types that share a description are annotated with their MIME type; check
  // that both arguments are substituted into applications-type-details-with-ext.
  const pdfHandlerInfo = pdfRow.handlerInfoWrapper;
  pdfHandlerInfo.disambiguateDescription = true;
  const disambiguatedDescription = pdfHandlerInfo.typeDescription;
  pdfHandlerInfo.disambiguateDescription = false;
  const pdfTypeDescription = await prefsDocument.l10n.formatValue(
    "applications-type-pdf"
  );
  Assert.stringContains(
    disambiguatedDescription,
    pdfTypeDescription,
    "the disambiguated PDF description should contain the localized type description"
  );
  Assert.stringContains(
    disambiguatedDescription,
    "application/pdf",
    "the disambiguated PDF description should contain the MIME type"
  );

  // The "Use <app> (default)" item must provide a tooltip as well: Fluent
  // removes localizable attributes that a message does not define, so a
  // message without a tooltiptext would leave the menu item without one.
  const defaultItem = prefsDocument.createXULElement("menuitem");
  pdfRow.menu.menupopup.appendChild(defaultItem);
  prefsDocument.l10n.setAttributes(defaultItem, "applications-use-default", {
    appName: "Test Default App",
  });
  await prefsDocument.l10n.translateFragment(defaultItem);
  Assert.equal(
    defaultItem.getAttribute("tooltiptext"),
    "Test Default App",
    "the use-default menu item should have a tooltip with the app name"
  );
  defaultItem.remove();

  const protocolRow = findHandlerRow(protocol);
  Assert.ok(protocolRow, "the temporary protocol handler should be listed");
  assertMenuItemL10n(protocolRow, "applications-use-app", {
    appName,
  });
  for (const id of [
    "applications-always-ask",
    "applications-use-other-app",
    "applications-manage-app",
    "applications-delete-action",
  ]) {
    assertMenuItemL10n(protocolRow, id);
  }

  const dialogPromise = BrowserTestUtils.promiseAlertDialogOpen(
    undefined,
    "chrome://messenger/content/preferences/applicationManager.xhtml",
    { isSubDialog: true }
  );
  protocolRow.manageApp({ stopPropagation() {} });
  const dialogWindow = await dialogPromise;
  const dialogDocument = dialogWindow.document;
  const description = protocolRow.handlerInfoWrapper.typeDescription;
  await BrowserTestUtils.waitForMutationCondition(
    dialogDocument.getElementById("appList"),
    { childList: true, subtree: true },
    () => dialogDocument.querySelector("#appList .typeIcon")
  );
  await TestUtils.waitForCondition(
    () => dialogDocument.getElementById("appLocation").value == uriTemplate,
    "the application details dialog should display the web handler URI template"
  );
  Assert.equal(
    dialogDocument.l10n.getAttributes(dialogDocument.querySelector("title")).id,
    "app-manager-dialog-title",
    "the application details dialog should use the localized title"
  );
  Assert.deepEqual(
    dialogDocument.l10n.getAttributes(
      dialogDocument.getElementById("appDescription")
    ),
    {
      id: "app-manager-description-protocol",
      args: { description },
    },
    "the application details description should identify the protocol"
  );
  Assert.equal(
    dialogDocument.l10n.getAttributes(dialogDocument.getElementById("appType"))
      .id,
    "app-manager-web-app",
    "the application details dialog should identify a web application"
  );
  Assert.equal(
    dialogDocument.getElementById("appLocation").value,
    uriTemplate,
    "the application details dialog should display the web handler URI template"
  );
  Assert.equal(
    dialogDocument.querySelector("#appList .typeIcon").getAttribute("src"),
    "https://example.com/favicon.ico",
    "the dialog should show the web app favicon"
  );

  const closePromise = BrowserTestUtils.waitForEvent(
    dialogWindow.browsingContext.topChromeWindow,
    "dialogclose",
    true
  );
  dialogDocument.querySelector("dialog").cancelDialog();
  await closePromise;

  await closePrefsTab();
  handlerService.remove(handlerInfo);
  handlerStored = false;
});

/**
 * Tests the folder name displayed in the "Save files to" field of the
 * attachments section.
 */
add_task(async function testDownloadFolderLabel() {
  const { prefsDocument } = await openNewPrefsTab(
    "paneGeneral",
    "filesAttachmentCategory"
  );
  const downloadFolder = prefsDocument.getElementById("downloadFolder");
  const desktopLabel = await prefsDocument.l10n.formatValue(
    "download-folder-desktop"
  );
  const systemLabel = await prefsDocument.l10n.formatValue(
    "download-folder-system"
  );
  const desktopDir = Services.dirsvc.get("Desk", Ci.nsIFile);
  const downloadsDir = new FileUtils.File(
    await Downloads.getSystemDownloadsDirectory()
  );
  const customDir = PathUtils.join(PathUtils.tempDir, "tb-download-folder");
  await IOUtils.makeDirectory(customDir, { ignoreExisting: true });
  registerCleanupFunction(() =>
    IOUtils.remove(customDir, { recursive: true, ignoreAbsent: true })
  );

  const setDownloadDir = async (path, expected) => {
    await SpecialPowers.pushPrefEnv({ set: [["browser.download.dir", path]] });
    await TestUtils.waitForCondition(
      () => downloadFolder.value == expected,
      `the folder field should display "${expected}" (for ${path}), ` +
        `but displays "${downloadFolder.value}"`
    );
  };

  await setDownloadDir(desktopDir.path, desktopLabel);
  if (desktopDir.equals(downloadsDir)) {
    info("Desktop and Downloads resolve to the same directory");
  } else {
    await setDownloadDir(downloadsDir.path, systemLabel);
  }
  await setDownloadDir(customDir, customDir);
  // Switching back to a predefined folder must replace the custom path.
  await setDownloadDir(desktopDir.path, desktopLabel);

  await closePrefsTab();
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
  await SpecialPowers.pushPrefEnv({
    set: [
      ["mail.biff.show_alert", true],
      ["mail.biff.alert.enabled_actions", "mark-as-read"],
    ],
  });
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

  const removeButton = prefsDocument.getElementById("removeTagButton");
  removeButton.scrollIntoView({ block: "center", behavior: "instant" });
  EventUtils.synthesizeMouseAtCenter(removeButton, {}, prefsWindow);
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
    prefsDocument.documentGlobal.requestAnimationFrame(resolve)
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

add_task(async function test_recent_destinations_options() {
  info("Testing Recent Destinations preference UI");

  // Start with the default recent-destinations settings and
  // they will be restored when the test finishes.
  await SpecialPowers.pushPrefEnv({
    clear: [
      ["mail.folder_widget.recent_sort_order"],
      ["mail.folder_widget.max_recent"],
    ],
  });

  const { prefsDocument, prefsWindow } = await openNewPrefsTab(
    "paneGeneral",
    "generalCategory"
  );

  const recentSortMenu = prefsDocument.getElementById("recentSortOrder");
  const maxRecentNumber = prefsDocument.getElementById("maxRecentNumber");

  // Ensure the element is focused and cleared of any previous state
  recentSortMenu.scrollIntoView({ block: "center", behavior: "instant" });
  recentSortMenu.focus();

  // Check initial state matches default pref.
  Assert.equal(
    recentSortMenu.value,
    Services.prefs
      .getIntPref("mail.folder_widget.recent_sort_order")
      .toString(),
    "Sort menu should match default pref value"
  );

  // Change the menu item (1 = Alphabetically)
  recentSortMenu.scrollIntoView({ block: "end", behavior: "instant" });
  EventUtils.synthesizeMouseAtCenter(recentSortMenu, {}, prefsWindow);
  await BrowserTestUtils.waitForPopupEvent(recentSortMenu.menupopup, "shown");
  recentSortMenu.menupopup.activateItem(recentSortMenu.menupopup.children[1]);
  await BrowserTestUtils.waitForPopupEvent(recentSortMenu.menupopup, "hidden");

  Assert.equal(
    Services.prefs.getIntPref("mail.folder_widget.recent_sort_order"),
    1,
    "Preference should be 1 after selecting Alphabetically"
  );

  // Test the numeric input.
  maxRecentNumber.scrollIntoView({ block: "center", behavior: "instant" });
  maxRecentNumber.focus();
  maxRecentNumber.value = 10;
  maxRecentNumber.dispatchEvent(new Event("change", { bubbles: true }));

  Assert.equal(
    Services.prefs.getIntPref("mail.folder_widget.max_recent"),
    10,
    "Max recent pref should be updated to 10"
  );

  await closePrefsTab();
});
