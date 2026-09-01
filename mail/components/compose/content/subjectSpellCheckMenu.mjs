/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global EditContextMenu, MozXULElement */

const { InlineSpellChecker } = ChromeUtils.importESModule(
  "resource://gre/modules/InlineSpellChecker.sys.mjs"
);

/**
 * Spellchecking for the subject field, contributed to the text context menu
 * the field shares with the window's other inputs. The suggestions and
 * add-to-dictionary items sit above the standard items and the enable toggle
 * and dictionary list below, the layout the browser context menu uses too.
 */

let spellChecker = null;
let clearListenerAdded = false;

/**
 * Resolves the word the menu was opened over. Both item sets call this, so
 * neither depends on the other having run first.
 *
 * @param {Element} input
 * @param {MouseEvent} event
 * @returns {?InlineSpellChecker}
 *   Null while there's nothing to spellcheck, which includes the input not
 *   having an editor yet.
 */
function initSpellChecker(input, event) {
  if (!spellChecker && input.editor) {
    spellChecker = new InlineSpellChecker(input.editor);
  }
  if (!spellChecker?.canSpellCheck) {
    return null;
  }
  spellChecker.initFromEvent(event.rangeParent, event.rangeOffset);
  return spellChecker;
}

/**
 * The suggestions and the dictionary list are built into the menu on every
 * open, so they have to come back out on every close. The menu is shared, and
 * a stale suggestion left in it would show up for another input.
 *
 * @param {Element} popup
 */
function ensureClearedOnHiding(popup) {
  if (clearListenerAdded) {
    return;
  }
  clearListenerAdded = true;
  popup.addEventListener("popuphiding", () => {
    spellChecker?.clearSuggestionsFromMenu();
    spellChecker?.clearDictionaryListFromMenu();
  });
}

const matches = input => input == document.getElementById("msgSubject");

EditContextMenu.addItems({
  matches,
  before: "edit-contextmenu-undo",
  createItems() {
    return MozXULElement.parseXULToFragment(`
      <menuitem id="subject-spell-no-suggestions"
                data-l10n-id="text-action-spell-no-suggestions" disabled=""/>
      <menuitem id="subject-spell-add-to-dictionary"
                data-l10n-id="text-action-spell-add-to-dictionary"/>
      <menuitem id="subject-spell-undo-add-to-dictionary"
                data-l10n-id="text-action-spell-undo-add-to-dictionary"/>
      <menuseparator id="subject-spell-suggestions-separator"/>
    `);
  },
  onShowing(input, items, event) {
    const [noSuggestions, addToDictionary, undoAddToDictionary, separator] =
      items;

    const checker = initSpellChecker(input, event);
    if (!checker) {
      for (const item of items) {
        item.hidden = true;
      }
      return;
    }
    ensureClearedOnHiding(noSuggestions.parentNode);

    // Reassigned on every open so they act on the current word.
    addToDictionary.oncommand = () => checker.addToDictionary();
    undoAddToDictionary.oncommand = () => checker.undoAddToDictionary();

    const overMisspelling = checker.overMisspelling;
    const canUndo = checker.canUndo();
    addToDictionary.hidden = !overMisspelling;
    undoAddToDictionary.hidden = !canUndo;
    separator.hidden = !overMisspelling && !canUndo;

    const suggestions = checker.addSuggestionsToMenuOnParent(
      noSuggestions.parentNode,
      noSuggestions,
      5
    );
    noSuggestions.hidden = !overMisspelling || !!suggestions;
  },
});

EditContextMenu.addItems({
  matches,
  after: "edit-contextmenu-select-all",
  createItems() {
    return MozXULElement.parseXULToFragment(`
      <menuseparator id="subject-spell-separator"/>
      <menuitem id="subject-spell-check-enabled"
                data-l10n-id="text-action-spell-check-toggle" type="checkbox"/>
      <menu id="subject-spell-dictionaries"
            data-l10n-id="text-action-spell-dictionaries">
        <menupopup id="subject-spell-dictionaries-menu"/>
      </menu>
    `);
  },
  onShowing(input, items, event) {
    const [separator, enabled, dictionaries] = items;

    const checker = initSpellChecker(input, event);
    if (!checker) {
      for (const item of items) {
        item.hidden = true;
      }
      return;
    }

    enabled.oncommand = () => checker.toggleEnabled();
    enabled.toggleAttribute("checked", checker.enabled);
    separator.hidden = false;
    enabled.hidden = false;

    const dictionaryCount = checker.addDictionaryListToMenu(
      dictionaries.firstElementChild,
      null
    );
    dictionaries.hidden = !checker.enabled || dictionaryCount <= 1;
  },
});
