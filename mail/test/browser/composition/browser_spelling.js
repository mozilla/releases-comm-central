/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { close_compose_window, open_compose_new_mail } = ChromeUtils.import(
  "resource://testing-common/mozmill/ComposeHelpers.jsm"
);
var { maybeOnSpellCheck } = ChromeUtils.importESModule(
  "resource://testing-common/AsyncSpellCheckTestHelper.sys.mjs"
);

async function checkMisspelledWords(editor, ...words) {
  await new Promise(resolve => maybeOnSpellCheck({ editor }, resolve));

  const selection = editor.selectionController.getSelection(
    Ci.nsISelectionController.SELECTION_SPELLCHECK
  );
  Assert.equal(
    selection.rangeCount,
    words.length,
    "correct number of misspellings"
  );
  for (let i = 0; i < words.length; i++) {
    Assert.equal(selection.getRangeAt(i).toString(), words[i]);
  }
  return selection;
}

add_task(async function () {
  // Install en-NZ dictionary.

  const dictionary = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
  dictionary.initWithPath(getTestFilePath("data/en_NZ"));

  const hunspell = Cc["@mozilla.org/spellchecker/engine;1"].getService(
    Ci.mozISpellCheckingEngine
  );
  hunspell.addDirectory(dictionary);

  // Open a compose window and write a message.

  const cwc = await open_compose_new_mail();
  const composeWindow = cwc;
  const composeDocument = composeWindow.document;

  cwc.document.getElementById("msgSubject").focus();
  EventUtils.sendString("I went to the harbor in an aluminium boat", cwc);
  cwc.document.getElementById("messageEditor").focus();
  EventUtils.sendString("I maneuvered to the center.\n", cwc);
  cwc.document.getElementById("messageEditor").focus();
  EventUtils.sendString(
    "The sky was the colour of ochre and the stars shone like jewelry.\n",
    cwc
  );

  // Check initial spelling.

  const subjectEditor = composeDocument.getElementById("msgSubject").editor;
  const editorBrowser = composeWindow.GetCurrentEditorElement();
  const bodyEditor = composeWindow.GetCurrentEditor();
  const saveButton = composeDocument.getElementById("button-save");

  await checkMisspelledWords(subjectEditor, "aluminium");
  await checkMisspelledWords(bodyEditor, "colour", "ochre");

  // Check menu items are displayed correctly.

  let shownPromise, hiddenPromise;
  const contextMenu = composeDocument.getElementById("msgComposeContext");
  const contextMenuEnabled = composeDocument.getElementById("spellCheckEnable");
  const optionsMenu = composeDocument.getElementById("optionsMenu");
  const optionsMenuEnabled = composeDocument.getElementById(
    "menu_inlineSpellCheck"
  );

  if (AppConstants.platform != "macosx") {
    shownPromise = BrowserTestUtils.waitForEvent(optionsMenu, "popupshown");
    EventUtils.synthesizeMouseAtCenter(optionsMenu, {}, composeWindow);
    await shownPromise;
    Assert.equal(
      optionsMenuEnabled.getAttribute("checked"),
      "true",
      "options menu item is checked"
    );
    hiddenPromise = BrowserTestUtils.waitForEvent(optionsMenu, "popuphidden");
    EventUtils.synthesizeKey("VK_ESCAPE", {}, composeWindow);
    await hiddenPromise;
  }

  shownPromise = BrowserTestUtils.waitForEvent(contextMenu, "popupshown");
  await BrowserTestUtils.synthesizeMouseAtCenter(
    "body",
    { type: "contextmenu" },
    editorBrowser
  );
  await shownPromise;
  Assert.equal(
    contextMenuEnabled.getAttribute("checked"),
    "true",
    "context menu item is checked"
  );

  // Disable the spell checker.

  hiddenPromise = BrowserTestUtils.waitForEvent(contextMenu, "popuphidden");
  contextMenu.activateItem(contextMenuEnabled);
  await hiddenPromise;

  await checkMisspelledWords(subjectEditor);
  await checkMisspelledWords(bodyEditor);

  // Save the message. The spell checking state shouldn't change.

  EventUtils.synthesizeMouseAtCenter(saveButton, {}, composeWindow);
  // Clicking the button sets gWindowLocked to true synchronously, so if
  // gWindowLocked is false, we know that saving has completed.
  await TestUtils.waitForCondition(
    () => !composeWindow.gWindowLocked,
    "window unlocked after saving"
  );

  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 500));

  await checkMisspelledWords(subjectEditor);
  await checkMisspelledWords(bodyEditor);

  // Check menu items are displayed correctly.

  if (AppConstants.platform != "macosx") {
    shownPromise = BrowserTestUtils.waitForEvent(optionsMenu, "popupshown");
    EventUtils.synthesizeMouseAtCenter(optionsMenu, {}, composeWindow);
    await shownPromise;
    Assert.ok(
      !optionsMenuEnabled.hasAttribute("checked"),
      "options menu item is not checked"
    );
    hiddenPromise = BrowserTestUtils.waitForEvent(optionsMenu, "popuphidden");
    EventUtils.synthesizeKey("VK_ESCAPE", {}, composeWindow);
    await hiddenPromise;
  }

  shownPromise = BrowserTestUtils.waitForEvent(contextMenu, "popupshown");
  await BrowserTestUtils.synthesizeMouseAtCenter(
    "body",
    { type: "contextmenu" },
    editorBrowser
  );
  await shownPromise;
  Assert.equal(
    contextMenuEnabled.getAttribute("checked"),
    "false",
    "context menu item is not checked"
  );

  // Enable the spell checker.

  hiddenPromise = BrowserTestUtils.waitForEvent(contextMenu, "popuphidden");
  contextMenu.activateItem(contextMenuEnabled);
  await hiddenPromise;

  await checkMisspelledWords(subjectEditor, "aluminium");
  await checkMisspelledWords(bodyEditor, "colour", "ochre");

  // Save the message. The spell checking state shouldn't change.

  EventUtils.synthesizeMouseAtCenter(saveButton, {}, composeWindow);
  // Clicking the button sets gWindowLocked to true synchronously, so if
  // gWindowLocked is false, we know that saving has completed.
  await TestUtils.waitForCondition(
    () => !composeWindow.gWindowLocked,
    "window unlocked after saving"
  );

  await checkMisspelledWords(subjectEditor, "aluminium");
  await checkMisspelledWords(bodyEditor, "colour", "ochre");

  // Add language.

  const statusButton = composeDocument.getElementById("languageStatusButton");
  const languageList = composeDocument.getElementById("languageMenuList");

  shownPromise = BrowserTestUtils.waitForEvent(languageList, "popupshown");
  EventUtils.synthesizeMouseAtCenter(statusButton, {}, composeWindow);
  await shownPromise;

  Assert.equal(languageList.childElementCount, 4);
  Assert.equal(languageList.children[0].value, "en-NZ");
  Assert.equal(languageList.children[0].getAttribute("checked"), "false");
  Assert.equal(languageList.children[1].value, "en-US");
  Assert.equal(languageList.children[1].getAttribute("checked"), "true");
  Assert.equal(languageList.children[2].localName, "menuseparator");
  Assert.equal(
    languageList.children[3].dataset.l10nId,
    "spell-add-dictionaries"
  );

  hiddenPromise = BrowserTestUtils.waitForEvent(languageList, "popuphidden");
  languageList.activateItem(languageList.children[0]);
  await TestUtils.waitForCondition(
    () => languageList.children[0].getAttribute("checked") == "true",
    "en-NZ menu item checked"
  );
  await TestUtils.waitForCondition(
    () => composeWindow.gActiveDictionaries.has("en-NZ"),
    "en-NZ added to dictionaries"
  );
  languageList.hidePopup();
  await hiddenPromise;

  Assert.deepEqual(
    [...composeWindow.gActiveDictionaries],
    ["en-US", "en-NZ"],
    "correct dictionaries active"
  );
  await checkMisspelledWords(subjectEditor);
  await checkMisspelledWords(bodyEditor);

  // Remove language.

  shownPromise = BrowserTestUtils.waitForEvent(languageList, "popupshown");
  EventUtils.synthesizeMouseAtCenter(statusButton, {}, composeWindow);
  await shownPromise;

  Assert.equal(languageList.childElementCount, 4);
  Assert.equal(languageList.children[0].value, "en-NZ");
  Assert.equal(languageList.children[0].getAttribute("checked"), "true");
  Assert.equal(languageList.children[1].value, "en-US");
  Assert.equal(languageList.children[1].getAttribute("checked"), "true");
  Assert.equal(languageList.children[2].localName, "menuseparator");
  Assert.equal(
    languageList.children[3].dataset.l10nId,
    "spell-add-dictionaries"
  );

  hiddenPromise = BrowserTestUtils.waitForEvent(languageList, "popuphidden");
  languageList.activateItem(languageList.children[1]);
  await TestUtils.waitForCondition(
    () => !languageList.children[1].hasAttribute("checked"),
    "en-US menu item unchecked"
  );
  await TestUtils.waitForCondition(
    () => !composeWindow.gActiveDictionaries.has("en-US"),
    "en-US removed from dictionaries"
  );
  languageList.hidePopup();
  await hiddenPromise;

  Assert.deepEqual(
    [...composeWindow.gActiveDictionaries],
    ["en-NZ"],
    "correct dictionaries active"
  );
  await checkMisspelledWords(subjectEditor, "harbor");
  const words = await checkMisspelledWords(
    bodyEditor,
    "maneuvered",
    "center",
    "jewelry"
  );

  // Check that opening the context menu on a spelling error works as expected.

  const box = words.getRangeAt(1).getBoundingClientRect();
  shownPromise = BrowserTestUtils.waitForEvent(contextMenu, "popupshown");
  BrowserTestUtils.synthesizeMouseAtPoint(
    box.left + box.width / 2,
    box.top + box.height / 2,
    { type: "contextmenu" },
    editorBrowser
  );
  await shownPromise;

  let menuItem = composeDocument.getElementById("spellCheckNoSuggestions");
  Assert.ok(BrowserTestUtils.isHidden(menuItem));

  const suggestions = contextMenu.querySelectorAll(".spell-suggestion");
  Assert.greater(suggestions.length, 0);
  Assert.equal(suggestions[0].value, "centre");

  for (const id of [
    "spellCheckAddSep",
    "spellCheckAddToDictionary",
    "spellCheckIgnoreWord",
    "spellCheckSuggestionsSeparator",
  ]) {
    menuItem = composeDocument.getElementById(id);
    Assert.ok(BrowserTestUtils.isVisible(menuItem));
  }

  hiddenPromise = BrowserTestUtils.waitForEvent(contextMenu, "popuphidden");
  contextMenu.activateItem(suggestions[0]);
  await hiddenPromise;

  await checkMisspelledWords(bodyEditor, "maneuvered", "jewelry");
  await SpecialPowers.spawn(editorBrowser, [], () => {
    Assert.ok(
      content.document.body.textContent.startsWith(
        "I maneuvered to the centre."
      )
    );
  });

  // Clean up.

  await close_compose_window(cwc);
  hunspell.removeDirectory(dictionary);
});
