/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from ../../../../base/content/utilityOverlay.js */
/* import-globals-from ../editorUtilities.js */
/* import-globals-from EdDialogCommon.js */

var { InlineSpellChecker } = ChromeUtils.importESModule(
  "resource://gre/modules/InlineSpellChecker.sys.mjs"
);

var gMisspelledWord;
var gSpellChecker = null;
var gAllowSelectWord = true;
var gPreviousReplaceWord = "";
var gFirstTime = true;
var gDictCount = 0;

document.addEventListener("dialogaccept", doDefault);
document.addEventListener("dialogcancel", CancelSpellCheck);

function Startup() {
  var editor = GetCurrentEditor();
  if (!editor) {
    window.close();
    return;
  }

  // Get the spellChecker shell
  gSpellChecker = Cu.createSpellChecker();
  if (!gSpellChecker) {
    dump("SpellChecker not found!!!\n");
    window.close();
    return;
  }

  // Start the spell checker module.
  try {
    var skipBlockQuotes = window.arguments[1];
    var enableSelectionChecking = window.arguments[2];

    gSpellChecker.setFilterType(
      skipBlockQuotes
        ? Ci.nsIEditorSpellCheck.FILTERTYPE_MAIL
        : Ci.nsIEditorSpellCheck.FILTERTYPE_NORMAL
    );
    gSpellChecker.InitSpellChecker(
      editor,
      enableSelectionChecking,
      spellCheckStarted
    );
  } catch (ex) {
    dump("*** Exception error: InitSpellChecker\n");
    window.close();
  }
}

function spellCheckStarted() {
  gDialog.MisspelledWordLabel = document.getElementById("MisspelledWordLabel");
  gDialog.MisspelledWord = document.getElementById("MisspelledWord");
  gDialog.ReplaceButton = document.getElementById("Replace");
  gDialog.IgnoreButton = document.getElementById("Ignore");
  gDialog.StopButton = document.getElementById("Stop");
  gDialog.CloseButton = document.getElementById("Close");
  gDialog.ReplaceWordInput = document.getElementById("ReplaceWordInput");
  gDialog.SuggestedList = document.getElementById("SuggestedList");
  gDialog.LanguageMenulist = document.getElementById("LanguageMenulist");

  // Fill in the language menulist and sync it up
  // with the spellchecker's current language.

  var curLangs;

  try {
    curLangs = new Set(gSpellChecker.getCurrentDictionaries());
  } catch (ex) {
    curLangs = new Set();
  }

  InitLanguageMenu(curLangs);

  // Get the first misspelled word and setup all UI
  NextWord();

  // When startup param is true, setup different UI when spell checking
  //   just before sending mail message
  if (window.arguments[0]) {
    // If no misspelled words found, simply close dialog and send message
    if (!gMisspelledWord) {
      onClose();
      return;
    }

    // Hide "Close" button and use "Send" instead
    gDialog.CloseButton.hidden = true;
    gDialog.CloseButton = document.getElementById("Send");
    gDialog.CloseButton.hidden = false;
  } else {
    // Normal spell checking - hide the "Stop" button
    // (Note that this button is the "Cancel" button for
    //  Esc keybinding and related window close actions)
    gDialog.StopButton.hidden = true;
  }

  // Clear flag that determines message when
  //  no misspelled word is found
  //  (different message when used for the first time)
  gFirstTime = false;

  window.sizeToContent();
}

/**
 * Populate the dictionary language selector menu.
 *
 * @param {Set<string>} activeDictionaries - Currently active dictionaries.
 */
function InitLanguageMenu(activeDictionaries) {
  // Get the list of dictionaries from
  // the spellchecker.

  var dictList;
  try {
    dictList = gSpellChecker.GetDictionaryList();
  } catch (ex) {
    dump("Failed to get DictionaryList!\n");
    return;
  }

  // If we're not just starting up and dictionary count
  // hasn't changed then no need to update the menu.
  if (gDictCount == dictList.length) {
    return;
  }

  // Store current dictionary count.
  gDictCount = dictList.length;

  var inlineSpellChecker = new InlineSpellChecker();
  var sortedList = inlineSpellChecker.sortDictionaryList(dictList);

  // Remove any languages from the list.
  const list = document.getElementById("dictionary-list");
  const template = document.getElementById("language-item");

  list.replaceChildren(
    ...sortedList.map(({ displayName, localeCode }) => {
      const item = template.content.cloneNode(true);
      item.querySelector(".checkbox-label").textContent = displayName;
      const input = item.querySelector("input");
      input.addEventListener("input", () => {
        SelectLanguage(localeCode);
      });
      input.checked = activeDictionaries.has(localeCode);
      return item;
    })
  );
}

function DoEnabling() {
  if (!gMisspelledWord) {
    // No more misspelled words
    gDialog.MisspelledWord.setAttribute(
      "value",
      GetString(gFirstTime ? "NoMisspelledWord" : "CheckSpellingDone")
    );

    gDialog.ReplaceButton.removeAttribute("default");
    gDialog.IgnoreButton.removeAttribute("default");

    gDialog.CloseButton.setAttribute("default", "true");
    // Shouldn't have to do this if "default" is true?
    gDialog.CloseButton.focus();

    SetElementEnabledById("MisspelledWordLabel", false);
    SetElementEnabledById("ReplaceWordLabel", false);
    SetElementEnabledById("ReplaceWordInput", false);
    SetElementEnabledById("CheckWord", false);
    SetElementEnabledById("SuggestedListLabel", false);
    SetElementEnabledById("SuggestedList", false);
    SetElementEnabledById("Ignore", false);
    SetElementEnabledById("IgnoreAll", false);
    SetElementEnabledById("Replace", false);
    SetElementEnabledById("ReplaceAll", false);
    SetElementEnabledById("AddToDictionary", false);
  } else {
    SetElementEnabledById("MisspelledWordLabel", true);
    SetElementEnabledById("ReplaceWordLabel", true);
    SetElementEnabledById("ReplaceWordInput", true);
    SetElementEnabledById("CheckWord", true);
    SetElementEnabledById("SuggestedListLabel", true);
    SetElementEnabledById("SuggestedList", true);
    SetElementEnabledById("Ignore", true);
    SetElementEnabledById("IgnoreAll", true);
    SetElementEnabledById("AddToDictionary", true);

    gDialog.CloseButton.removeAttribute("default");
    SetReplaceEnable();
  }
}

function NextWord() {
  gMisspelledWord = gSpellChecker.GetNextMisspelledWord();
  SetWidgetsForMisspelledWord();
}

function SetWidgetsForMisspelledWord() {
  gDialog.MisspelledWord.setAttribute("value", gMisspelledWord);

  // Initial replace word is misspelled word
  gDialog.ReplaceWordInput.value = gMisspelledWord;
  gPreviousReplaceWord = gMisspelledWord;

  // This sets gDialog.ReplaceWordInput to first suggested word in list
  FillSuggestedList(gMisspelledWord);

  DoEnabling();

  if (gMisspelledWord) {
    SetTextboxFocus(gDialog.ReplaceWordInput);
  }
}

function CheckWord() {
  var word = gDialog.ReplaceWordInput.value;
  if (word) {
    if (gSpellChecker.CheckCurrentWord(word)) {
      FillSuggestedList(word);
      SetReplaceEnable();
    } else {
      ClearListbox(gDialog.SuggestedList);
      var item = gDialog.SuggestedList.appendItem(
        GetString("CorrectSpelling"),
        ""
      );
      if (item) {
        item.setAttribute("disabled", "true");
      }
      // Suppress being able to select the message text
      gAllowSelectWord = false;
    }
  }
}

function SelectSuggestedWord() {
  if (gAllowSelectWord) {
    if (gDialog.SuggestedList.selectedItem) {
      var selValue = gDialog.SuggestedList.selectedItem.label;
      gDialog.ReplaceWordInput.value = selValue;
      gPreviousReplaceWord = selValue;
    } else {
      gDialog.ReplaceWordInput.value = gPreviousReplaceWord;
    }
    SetReplaceEnable();
  }
}

function ChangeReplaceWord() {
  // Calling this triggers SelectSuggestedWord(),
  //  so temporarily suppress the effect of that
  var saveAllow = gAllowSelectWord;
  gAllowSelectWord = false;

  // Select matching word in list
  var newSelectedItem;
  var replaceWord = TrimString(gDialog.ReplaceWordInput.value);
  if (replaceWord) {
    for (var i = 0; i < gDialog.SuggestedList.getRowCount(); i++) {
      var item = gDialog.SuggestedList.getItemAtIndex(i);
      if (item.label == replaceWord) {
        newSelectedItem = item;
        break;
      }
    }
  }
  gDialog.SuggestedList.selectedItem = newSelectedItem;

  gAllowSelectWord = saveAllow;

  // Remember the new word
  gPreviousReplaceWord = gDialog.ReplaceWordInput.value;

  SetReplaceEnable();
}

function Ignore() {
  NextWord();
}

function IgnoreAll() {
  if (gMisspelledWord) {
    gSpellChecker.IgnoreWordAllOccurrences(gMisspelledWord);
  }
  NextWord();
}

function Replace(newWord) {
  if (!newWord) {
    return;
  }

  if (gMisspelledWord && gMisspelledWord != newWord) {
    var editor = GetCurrentEditor();
    editor.beginTransaction();
    try {
      gSpellChecker.ReplaceWord(gMisspelledWord, newWord, false);
    } catch (e) {}
    editor.endTransaction();
  }
  NextWord();
}

function ReplaceAll() {
  var newWord = gDialog.ReplaceWordInput.value;
  if (gMisspelledWord && gMisspelledWord != newWord) {
    var editor = GetCurrentEditor();
    editor.beginTransaction();
    try {
      gSpellChecker.ReplaceWord(gMisspelledWord, newWord, true);
    } catch (e) {}
    editor.endTransaction();
  }
  NextWord();
}

function AddToDictionary() {
  if (gMisspelledWord) {
    gSpellChecker.AddWordToDictionary(gMisspelledWord);
  }
  NextWord();
}

function EditDictionary() {
  window.openDialog(
    "chrome://messenger/content/messengercompose/EdDictionary.xhtml",
    "_blank",
    "chrome,close,titlebar,modal",
    "",
    gMisspelledWord
  );
}

/**
 * Change the selection state of the given dictionary language.
 *
 * @param {string} language
 */
function SelectLanguage(language) {
  const activeDictionaries = new Set(gSpellChecker.getCurrentDictionaries());
  if (activeDictionaries.has(language)) {
    activeDictionaries.delete(language);
  } else {
    activeDictionaries.add(language);
  }
  const activeDictionariesArray = Array.from(activeDictionaries);
  gSpellChecker.setCurrentDictionaries(activeDictionariesArray);
  // For compose windows we need to set the "lang" attribute so the
  // core editor uses the correct dictionary for the inline spell check.
  if (window.arguments[1]) {
    if ("ComposeChangeLanguage" in window.opener) {
      // We came here from a compose window.
      window.opener.ComposeChangeLanguage(activeDictionariesArray);
    } else if (activeDictionaries.size === 1) {
      window.opener.document.documentElement.setAttribute(
        "lang",
        activeDictionariesArray[0]
      );
    } else {
      window.opener.document.documentElement.setAttribute("lang", "");
    }
  }
}

function Recheck() {
  var recheckLanguages;

  function finishRecheck() {
    gSpellChecker.setCurrentDictionaries(recheckLanguages);
    gMisspelledWord = gSpellChecker.GetNextMisspelledWord();
    SetWidgetsForMisspelledWord();
  }

  // TODO: Should we bother to add a "Recheck" method to interface?
  try {
    recheckLanguages = gSpellChecker.getCurrentDictionaries();
    gSpellChecker.UninitSpellChecker();
    // Clear the ignore all list.
    Cc["@mozilla.org/spellchecker/personaldictionary;1"]
      .getService(Ci.mozIPersonalDictionary)
      .endSession();
    gSpellChecker.InitSpellChecker(GetCurrentEditor(), false, finishRecheck);
  } catch (ex) {
    console.error(ex);
  }
}

function FillSuggestedList(misspelledWord) {
  var list = gDialog.SuggestedList;

  // Clear the current contents of the list
  gAllowSelectWord = false;
  ClearListbox(list);
  var item;

  if (misspelledWord.length > 0) {
    // Get suggested words until an empty string is returned
    var count = 0;
    do {
      var word = gSpellChecker.GetSuggestedWord();
      if (word.length > 0) {
        list.appendItem(word, "");
        count++;
      }
    } while (word.length > 0);

    if (count == 0) {
      // No suggestions - show a message but don't let user select it
      item = list.appendItem(GetString("NoSuggestedWords"));
      if (item) {
        item.setAttribute("disabled", "true");
      }
      gAllowSelectWord = false;
    } else {
      gAllowSelectWord = true;
      // Initialize with first suggested list by selecting it
      gDialog.SuggestedList.selectedIndex = 0;
    }
  } else {
    item = list.appendItem("", "");
    if (item) {
      item.setAttribute("disabled", "true");
    }
  }
}

function SetReplaceEnable() {
  // Enable "Change..." buttons only if new word is different than misspelled
  var newWord = gDialog.ReplaceWordInput.value;
  var enable = newWord.length > 0 && newWord != gMisspelledWord;
  SetElementEnabledById("Replace", enable);
  SetElementEnabledById("ReplaceAll", enable);
  if (enable) {
    gDialog.ReplaceButton.setAttribute("default", "true");
    gDialog.IgnoreButton.removeAttribute("default");
  } else {
    gDialog.IgnoreButton.setAttribute("default", "true");
    gDialog.ReplaceButton.removeAttribute("default");
  }
}

function doDefault(event) {
  if (gDialog.ReplaceButton.getAttribute("default") == "true") {
    Replace(gDialog.ReplaceWordInput.value);
  } else if (gDialog.IgnoreButton.getAttribute("default") == "true") {
    Ignore();
  } else if (gDialog.CloseButton.getAttribute("default") == "true") {
    onClose();
  }

  event.preventDefault();
}

function ExitSpellChecker() {
  if (gSpellChecker) {
    try {
      gSpellChecker.UninitSpellChecker();
      // now check the document over again with the new dictionary
      // if we have an inline spellchecker
      if (
        "InlineSpellCheckerUI" in window.opener &&
        window.opener.InlineSpellCheckerUI.enabled
      ) {
        window.opener.InlineSpellCheckerUI.mInlineSpellChecker.spellCheckRange(
          null
        );
      }
    } finally {
      gSpellChecker = null;
    }
  }
}

function CancelSpellCheck() {
  ExitSpellChecker();

  // Signal to calling window that we canceled
  window.opener.cancelSendMessage = true;
}

function onClose() {
  ExitSpellChecker();

  window.opener.cancelSendMessage = false;
  window.close();
}
