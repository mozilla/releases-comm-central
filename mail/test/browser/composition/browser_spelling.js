/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { close_compose_window, open_compose_new_mail } = ChromeUtils.import(
  "resource://testing-common/mozmill/ComposeHelpers.jsm"
);
var { onSpellCheck } = ChromeUtils.import(
  "resource://testing-common/AsyncSpellCheckTestHelper.jsm"
);

async function checkMisspelledWords(editor, ...words) {
  await new Promise(resolve => onSpellCheck({ editor }, resolve));

  let selection = editor.selectionController.getSelection(
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

add_task(async function() {
  // Install en-NZ dictionary.

  let dictionary = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
  dictionary.initWithPath(getTestFilePath("data/en_NZ"));

  let hunspell = Cc["@mozilla.org/spellchecker/engine;1"].getService(
    Ci.mozISpellCheckingEngine
  );
  hunspell.addDirectory(dictionary);

  // Open a compose window and write a message.

  let cwc = open_compose_new_mail();
  let composeWindow = cwc.window;
  let composeDocument = composeWindow.document;

  cwc.type(cwc.e("msgSubject"), "I went to the harbor in an aluminium boat");
  cwc.type(cwc.e("content-frame"), "I maneuvered to the center.\n");
  cwc.type(
    cwc.e("content-frame"),
    "The sky was the colour of ochre and the stars shone like jewelry.\n"
  );

  // Check initial spelling.

  let subjectEditor = composeDocument.getElementById("msgSubject").editor;
  let editorBrowser = composeWindow.GetCurrentEditorElement();
  let bodyEditor = composeWindow.GetCurrentEditor();
  let saveButton = composeDocument.getElementById("button-save");

  await checkMisspelledWords(subjectEditor, "aluminium");
  await checkMisspelledWords(bodyEditor, "colour", "ochre");

  // Check menu items are displayed correctly.

  let shownPromise, hiddenPromise;
  let contextMenu = composeDocument.getElementById("msgComposeContext");
  let contextMenuEnabled = composeDocument.getElementById("spellCheckEnable");
  let optionsMenu = composeDocument.getElementById("optionsMenu");
  let optionsMenuEnabled = composeDocument.getElementById(
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

  // Switch language.

  let statusButton = composeDocument.getElementById("languageStatusButton");
  let languageList = composeDocument.getElementById("languageMenuList");

  shownPromise = BrowserTestUtils.waitForEvent(languageList, "popupshown");
  EventUtils.synthesizeMouseAtCenter(statusButton, {}, composeWindow);
  await shownPromise;

  Assert.equal(languageList.childElementCount, 2);
  Assert.equal(languageList.children[0].value, "en-NZ");
  Assert.equal(languageList.children[1].value, "en-US");

  hiddenPromise = BrowserTestUtils.waitForEvent(languageList, "popuphidden");
  languageList.activateItem(languageList.children[0]);
  await hiddenPromise;

  await checkMisspelledWords(subjectEditor, "harbor");
  let words = await checkMisspelledWords(
    bodyEditor,
    "maneuvered",
    "center",
    "jewelry"
  );

  // Check that opening the context menu on a spelling error works as expected.

  let box = words.getRangeAt(1).getBoundingClientRect();
  shownPromise = BrowserTestUtils.waitForEvent(contextMenu, "popupshown");
  BrowserTestUtils.synthesizeMouseAtPoint(
    box.left + box.width / 2,
    box.top + box.height / 2,
    { type: "contextmenu" },
    editorBrowser
  );
  await shownPromise;

  let menuItem = composeDocument.getElementById("spellCheckNoSuggestions");
  Assert.ok(BrowserTestUtils.is_hidden(menuItem));

  let suggestions = contextMenu.querySelectorAll(".spell-suggestion");
  Assert.greater(suggestions.length, 0);
  Assert.equal(suggestions[0].value, "centre");

  for (let id of [
    "spellCheckAddSep",
    "spellCheckAddToDictionary",
    "spellCheckIgnoreWord",
    "spellCheckSuggestionsSeparator",
  ]) {
    menuItem = composeDocument.getElementById(id);
    Assert.ok(BrowserTestUtils.is_visible(menuItem));
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

  close_compose_window(cwc);
  hunspell.removeDirectory(dictionary);
});
