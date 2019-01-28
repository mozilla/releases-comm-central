/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from ../../../../toolkit/mozapps/preferences/fontbuilder.js */
/* import-globals-from preferences.js */
/* import-globals-from subdialogs.js */

var gDisplayPane = {
  mInitialized: false,
  mTagListBox:  null,

  init() {
    if (!(("arguments" in window) && window.arguments[1])) {
      // If no tab was specified, select the last used tab.
      let preference = document.getElementById("mail.preferences.display.selectedTabIndex");
      if (preference.value)
        document.getElementById("displayPrefs").selectedIndex = preference.value;
    }
    this._rebuildFonts();
    this.updateMarkAsReadOptions(document.getElementById("automaticallyMarkAsRead").checked);
    var menulist = document.getElementById("defaultFont");
    if (menulist.selectedIndex == -1) {
      // Prepend menuitem with empty name and value.
      let item = document.createElementNS("http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul", "menuitem");
      item.setAttribute("label", "");
      item.setAttribute("value", "");
      menulist.menupopup.insertBefore(item, menulist.menupopup.firstChild);
      menulist.selectedIndex = 0;
    }

    this.mInitialized = true;

    document.getElementById("citationmenu").value =
      document.getElementById("mail.citation_color").value;

    this.mTagListBox = document.getElementById("tagList");
    this.buildTagList();
  },

  // FONTS

  /**
   * Populates the default font list in UI.
   */
  _rebuildFonts() {
    var langGroupPref = document.getElementById("font.language.group");
    var isSerif = this._readDefaultFontTypeForLanguage(langGroupPref.value) == "serif";
    this._selectDefaultLanguageGroup(langGroupPref.value, isSerif);
  },

  /**
   * Select the default language group.
   */
  _selectDefaultLanguageGroupPromise: Promise.resolve(),

  _selectDefaultLanguageGroup(aLanguageGroup, aIsSerif) {
    this._selectDefaultLanguageGroupPromise = (async () => {
      // Avoid overlapping language group selections by awaiting the resolution
      // of the previous one.  We do this because this function is re-entrant,
      // as inserting <preference> elements into the DOM sometimes triggers a call
      // back into this function.  And since this function is also asynchronous,
      // that call can enter this function before the previous run has completed,
      // which would corrupt the font menulists.  Awaiting the previous call's
      // resolution avoids that fate.
      await this._selectDefaultLanguageGroupPromise;

      const kFontNameFmtSerif         = "font.name.serif.%LANG%";
      const kFontNameFmtSansSerif     = "font.name.sans-serif.%LANG%";
      const kFontNameListFmtSerif     = "font.name-list.serif.%LANG%";
      const kFontNameListFmtSansSerif = "font.name-list.sans-serif.%LANG%";
      const kFontSizeFmtVariable      = "font.size.variable.%LANG%";

      // Make sure font.name-list is created before font.name so that it's
      // available at the time readFontSelection below is called.
      var prefs = [{format: aIsSerif ? kFontNameListFmtSerif : kFontNameListFmtSansSerif,
                    type: "unichar",
                    element: null,
                    fonttype: aIsSerif ? "serif" : "sans-serif" },
                   {format: aIsSerif ? kFontNameFmtSerif : kFontNameFmtSansSerif,
                    type: "fontname",
                    element: "defaultFont",
                    fonttype: aIsSerif ? "serif" : "sans-serif" },
                   {format: kFontSizeFmtVariable,
                    type: "int",
                    element: "defaultFontSize",
                    fonttype: null }];

      var preferences = document.getElementById("displayPreferences");
      for (var i = 0; i < prefs.length; ++i) {
        var preference = document.getElementById(prefs[i].format.replace(/%LANG%/,
                                                                 aLanguageGroup));
        if (!preference) {
          preference = document.createElement("preference");
          var name = prefs[i].format.replace(/%LANG%/, aLanguageGroup);
          preference.id = name;
          preference.setAttribute("name", name);
          preference.setAttribute("type", prefs[i].type);
          preferences.appendChild(preference);

          if (!("setElementValue" in preference)) {
            await new Promise((resolve) => {
              preference.addEventListener("bindingattached", resolve, { once: true });
            });
          }
        }

        if (!prefs[i].element)
          continue;

        var element = document.getElementById(prefs[i].element);
        if (element) {
          // Make sure we have the font list ready for readFontSelection below to
          // work. readFontSelection gets called at onsyncfrompreference, but the
          // exact semantics of when it is called (whether during setAttribute or
          // during setElementValue) aren't obvious.
          if (prefs[i].fonttype)
            await FontBuilder.buildFontList(aLanguageGroup, prefs[i].fonttype, element);

          element.setAttribute("preference", preference.id);

          preference.setElementValue(element);
        }
      }
    })().catch(Cu.reportError);
  },

  /**
   * Returns the type of the current default font for the language denoted by
   * aLanguageGroup.
   */
  _readDefaultFontTypeForLanguage(aLanguageGroup) {
    const kDefaultFontType = "font.default.%LANG%";
    var defaultFontTypePref = kDefaultFontType.replace(/%LANG%/, aLanguageGroup);
    var preference = document.getElementById(defaultFontTypePref);
    if (!preference) {
      preference = document.createElementNS("http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul", "preference");
      preference.id = defaultFontTypePref;
      preference.type = "string";
      preference.name = defaultFontTypePref;
      preference.setAttribute("onchange", "gDisplayPane._rebuildFonts();");
      document.getElementById("displayPreferences").appendChild(preference);
    }

    // We should return preference.value here, but we can't wait for the binding to load,
    // or things get really messy. Fortunately this will give the same answer.
    return Services.prefs.getCharPref(defaultFontTypePref);
  },

  /**
   * Determine the appropriate value to select for defaultFont, for the
   * following cases:
   * - there is no setting
   * - the font selected by the user is no longer present (e.g. deleted from
   *   fonts folder)
   */
  readFontSelection() {
    let element = document.getElementById("defaultFont");
    let preference = document.getElementById(element.getAttribute("preference"));
    if (preference.value) {
      let fontItem = element.querySelector('[value="' + preference.value + '"]');

      // There is a setting that actually is in the list. Respect it.
      if (fontItem)
        return undefined;
    }

    let defaultValue = element.firstChild.firstChild.getAttribute("value");
    let languagePref = document.getElementById("font.language.group");
    let defaultType = this._readDefaultFontTypeForLanguage(languagePref.value);
    let listPref = document.getElementById("font.name-list." + defaultType +
                                           "." + languagePref.value);
    if (!listPref)
      return defaultValue;

    let fontNames = listPref.value.split(",");

    for (let fontName of fontNames) {
      let fontItem = element.querySelector('[value="' + fontName.trim() + '"]');
      if (fontItem)
        return fontItem.getAttribute("value");
    }
    return defaultValue;
  },

  tabSelectionChanged() {
    if (this.mInitialized)
      document.getElementById("mail.preferences.display.selectedTabIndex")
              .valueFromPreferences = document.getElementById("displayPrefs").selectedIndex;
  },

  /**
   * Displays the fonts dialog, where web page font names and sizes can be
   * configured.
   */
  configureFonts() {
    gSubDialog.open("chrome://messenger/content/preferences/fonts.xul");
  },

  /**
   * Displays the colors dialog, where default web page/link/etc. colors can be
   * configured.
   */
  configureColors() {
    gSubDialog.open("chrome://messenger/content/preferences/colors.xul",
                    "resizable=no");
  },


  // appends the tag to the tag list box
  appendTagItem(aTagName, aKey, aColor) {
    let item = this.mTagListBox.appendItem(aTagName, aKey);
    item.style.color = aColor;
    return item;
  },

  buildTagList() {
    let tagArray = MailServices.tags.getAllTags({});
    for (let i = 0; i < tagArray.length; ++i) {
      let taginfo = tagArray[i];
      this.appendTagItem(taginfo.tag, taginfo.key, taginfo.color);
    }
  },

  removeTag() {
    var index = this.mTagListBox.selectedIndex;
    if (index >= 0) {
      var itemToRemove = this.mTagListBox.getItemAtIndex(index);
      MailServices.tags.deleteKey(itemToRemove.getAttribute("value"));
      itemToRemove.remove();
      var numItemsInListBox = this.mTagListBox.getRowCount();
      this.mTagListBox.selectedIndex = index < numItemsInListBox ? index : numItemsInListBox - 1;
    }
  },

  /**
   * Open the edit tag dialog
   */
  editTag() {
    var index = this.mTagListBox.selectedIndex;
    if (index >= 0) {
      var tagElToEdit = this.mTagListBox.getItemAtIndex(index);
      var args = {result: "", keyToEdit: tagElToEdit.getAttribute("value"), okCallback: editTagCallback};
      gSubDialog.open("chrome://messenger/content/newTagDialog.xul", "resizable=no", args);
    }
  },

  addTag() {
    var args = {result: "", okCallback: addTagCallback};
    gSubDialog.open("chrome://messenger/content/newTagDialog.xul", "resizable=no", args);
  },

  onSelect() {
    let btnEdit = document.getElementById("editTagButton");
    let listBox = document.getElementById("tagList");

    if (listBox.selectedCount > 0)
      btnEdit.disabled = false;
    else
      btnEdit.disabled = true;

    document.getElementById("removeTagButton").disabled = btnEdit.disabled;
  },

  /**
   * Enable/disable the options of automatic marking as read depending on the
   * state of the automatic marking feature.
   *
   * @param aEnableRadioGroup  Boolean value indicating whether the feature is enabled.
   */
  updateMarkAsReadOptions(aEnableRadioGroup) {
    let autoMarkAsPref = document.getElementById("mailnews.mark_message_read.delay");
    let autoMarkDisabled = !aEnableRadioGroup || autoMarkAsPref.locked;
    document.getElementById("markAsReadAutoPreferences").disabled = autoMarkDisabled;
    document.getElementById("secondsLabel").disabled = autoMarkDisabled;
    this.updateMarkAsReadTextbox();
  },

  /**
   * Automatically enable/disable delay textbox depending on state of the
   * Mark As Read On Delay feature.
   *
   * @param aFocusTextBox  Boolean value whether Mark As Read On Delay
   *                       option was selected and the textbox should be focused.
   */
  updateMarkAsReadTextbox(aFocusTextBox) {
    let globalCheckbox = document.getElementById("automaticallyMarkAsRead");
    let delayRadioOption = document.getElementById("markAsReadAfterDelay");
    let delayTextbox = document.getElementById("markAsReadDelay");
    let intervalPref = document.getElementById("mailnews.mark_message_read.delay.interval");
    delayTextbox.disabled = !globalCheckbox.checked ||
                            !delayRadioOption.selected || intervalPref.locked;
    if (!delayTextbox.disabled && aFocusTextBox)
      delayTextbox.focus();
  },
};

function addTagCallback(aName, aColor) {
  MailServices.tags.addTag(aName, aColor, "");

  var item = gDisplayPane.appendTagItem(aName, MailServices.tags.getKeyForTag(aName), aColor);
  var tagListBox = document.getElementById("tagList");
  tagListBox.ensureElementIsVisible(item);
  tagListBox.selectItem(item);
  tagListBox.focus();
}

function editTagCallback() {
  // update the values of the selected item
  var tagListEl = document.getElementById("tagList");
  var index = tagListEl.selectedIndex;
  if (index >= 0) {
    var tagElToEdit = tagListEl.getItemAtIndex(index);
    var key = tagElToEdit.getAttribute("value");
    // update the color and label elements
    tagElToEdit.setAttribute("label", MailServices.tags.getTagForKey(key));
    tagElToEdit.style.color = MailServices.tags.getColorForKey(key);
  }
}
