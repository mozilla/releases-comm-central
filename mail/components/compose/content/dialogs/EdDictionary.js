/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from ../editorUtilities.js */
/* import-globals-from EdDialogCommon.js */

var gSpellChecker;
var gWordToAdd;

window.addEventListener("load", () => {
  Startup();
});

function Startup() {
  if (!GetCurrentEditor()) {
    window.close();
    return;
  }
  // Get the SpellChecker shell
  if ("gSpellChecker" in window.opener && window.opener.gSpellChecker) {
    gSpellChecker = window.opener.gSpellChecker;
  }

  if (!gSpellChecker) {
    dump("SpellChecker not found!!!\n");
    window.close();
    return;
  }
  // The word to add word is passed as the 2nd extra parameter in window.openDialog()
  gWordToAdd = window.arguments[1];

  gDialog.WordInput = document.getElementById("WordInput");
  gDialog.DictionaryList = document.getElementById("DictionaryList");

  gDialog.WordInput.value = gWordToAdd;
  FillDictionaryList();

  // Select the supplied word if it is already in the list
  SelectWordToAddInList();
  SetTextboxFocus(gDialog.WordInput);
}

function ValidateWordToAdd() {
  gWordToAdd = TrimString(gDialog.WordInput.value);
  if (gWordToAdd.length > 0) {
    return true;
  }
  return false;
}

function SelectWordToAddInList() {
  for (var i = 0; i < gDialog.DictionaryList.getRowCount(); i++) {
    var wordInList = gDialog.DictionaryList.getItemAtIndex(i);
    if (wordInList && gWordToAdd == wordInList.label) {
      gDialog.DictionaryList.selectedIndex = i;
      break;
    }
  }
}

function AddWord() {
  if (ValidateWordToAdd()) {
    try {
      gSpellChecker.AddWordToDictionary(gWordToAdd);
    } catch (e) {
      dump(
        "Exception occurred in gSpellChecker.AddWordToDictionary\nWord to add probably already existed\n"
      );
    }

    // Rebuild the dialog list
    FillDictionaryList();

    SelectWordToAddInList();
    gDialog.WordInput.value = "";
  }
}

function RemoveWord() {
  var selIndex = gDialog.DictionaryList.selectedIndex;
  if (selIndex >= 0) {
    var word = gDialog.DictionaryList.selectedItem.label;

    // Remove word from list
    gDialog.DictionaryList.selectedItem.remove();

    // Remove from dictionary
    try {
      // Not working: BUG 43348
      gSpellChecker.RemoveWordFromDictionary(word);
    } catch (e) {
      dump("Failed to remove word from dictionary\n");
    }

    ResetSelectedItem(selIndex);
  }
}

function FillDictionaryList() {
  var selIndex = gDialog.DictionaryList.selectedIndex;

  // Clear the current contents of the list
  ClearListbox(gDialog.DictionaryList);

  // Get the list from the spell checker
  const wordList = Cc[
    "@mozilla.org/spellchecker/personaldictionary;1"
  ].getService(Ci.mozIPersonalDictionary).wordList;

  if (wordList.hasMore()) {
    while (wordList.hasMore()) {
      const word = wordList.getNext();
      gDialog.DictionaryList.appendItem(word, "");
    }
  } else {
    // XXX: BUG 74467: If list is empty, it doesn't layout to full height correctly
    //     (ignores "rows" attribute) (bug is latered, so we are fixing here for now)
    gDialog.DictionaryList.appendItem("", "");
  }

  ResetSelectedItem(selIndex);
}

function ResetSelectedItem(index) {
  var lastIndex = gDialog.DictionaryList.getRowCount() - 1;
  if (index > lastIndex) {
    index = lastIndex;
  }

  // If we didn't have a selected item,
  //  set it to the first item
  if (index == -1 && lastIndex >= 0) {
    index = 0;
  }

  gDialog.DictionaryList.selectedIndex = index;
}
