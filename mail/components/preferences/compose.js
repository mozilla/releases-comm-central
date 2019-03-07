/* -*- Mode: Javascript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* import-globals-from preferences.js */
/* import-globals-from subdialogs.js */

var {InlineSpellChecker} = ChromeUtils.import("resource://gre/modules/InlineSpellChecker.jsm");

Preferences.addAll([
  { id: "mail.preferences.compose.selectedTabIndex", type: "int" },
  { id: "mail.forward_message_mode", type: "int" },
  { id: "mail.forward_add_extension", type: "bool" },
  { id: "mail.SpellCheckBeforeSend", type: "bool" },
  { id: "mail.spellcheck.inline", type: "bool" },
  { id: "mail.warn_on_send_accel_key", type: "bool" },
  { id: "mail.compose.autosave", type: "bool" },
  { id: "mail.compose.autosaveinterval", type: "int" },
  { id: "mail.enable_autocomplete", type: "bool" },
  { id: "ldap_2.autoComplete.useDirectory", type: "bool" },
  { id: "ldap_2.autoComplete.directoryServer", type: "string" },
  { id: "pref.ldap.disable_button.edit_directories", type: "bool" },
  { id: "mail.collect_email_address_outgoing", type: "bool" },
  { id: "mail.collect_addressbook", type: "string" },
  { id: "spellchecker.dictionary", type: "unichar" },
  { id: "msgcompose.default_colors", type: "bool" },
  { id: "msgcompose.font_face", type: "string" },
  { id: "msgcompose.font_size", type: "string" },
  { id: "msgcompose.text_color", type: "string" },
  { id: "msgcompose.background_color", type: "string" },
  { id: "mail.compose.attachment_reminder", type: "bool" },
  { id: "mail.compose.default_to_paragraph", type: "bool" },
]);

document.getElementById("paneCompose")
        .addEventListener("paneload", function() { gComposePane.init(); });

var gComposePane = {
  mInitialized: false,
  mSpellChecker: null,
  mDictCount: 0,

  init() {
    this.enableAutocomplete();

    this.initLanguageMenu();

    this.populateFonts();

    this.updateAutosave();

    this.updateUseReaderDefaults();

    this.updateAttachmentCheck();

    this.updateEmailCollection();

    this.initAbDefaultStartupDir();

    this.setButtonColors();

    if (!(("arguments" in window) && window.arguments[1])) {
      // If no tab was specified, select the last used tab.
      let preference = Preferences.get("mail.preferences.compose.selectedTabIndex");
      if (preference.value)
        document.getElementById("composePrefs").selectedIndex = preference.value;
    }

    this.mInitialized = true;
  },

  tabSelectionChanged() {
    if (this.mInitialized) {
      var preference = Preferences.get("mail.preferences.compose.selectedTabIndex");
      preference.valueFromPreferences = document.getElementById("composePrefs").selectedIndex;
    }
  },

  sendOptionsDialog() {
    gSubDialog.open("chrome://messenger/content/preferences/sendoptions.xul");
  },

  attachmentReminderOptionsDialog() {
    gSubDialog.open("chrome://messenger/content/preferences/attachmentReminder.xul",
                    "resizable=no");
  },

  updateAutosave() {
    gComposePane.enableElement(
      document.getElementById("autoSaveInterval"),
      Preferences.get("mail.compose.autosave").value
    );
  },

  updateUseReaderDefaults() {
    let useReaderDefaultsChecked = Preferences.get("msgcompose.default_colors").value;
    gComposePane.enableElement(
      document.getElementById("textColorLabel"), !useReaderDefaultsChecked
    );
    gComposePane.enableElement(
      document.getElementById("backgroundColorLabel"), !useReaderDefaultsChecked
    );
    gComposePane.enableElement(
      document.getElementById("textColorButton"), !useReaderDefaultsChecked
    );
    gComposePane.enableElement(
      document.getElementById("backgroundColorButton"), !useReaderDefaultsChecked
    );
  },

  updateAttachmentCheck() {
    gComposePane.enableElement(
      document.getElementById("attachment_reminder_button"),
      Preferences.get("mail.compose.attachment_reminder").value
    );
  },

  updateEmailCollection() {
    gComposePane.enableElement(
      document.getElementById("localDirectoriesList"),
      Preferences.get("mail.collect_email_address_outgoing").value
    );
  },

  enableElement(aElement, aEnable) {
    let pref = aElement.getAttribute("preference");
    let prefIsLocked = pref ? Preferences.get(pref).locked : false;
    aElement.disabled = !aEnable || prefIsLocked;
  },

  enableAutocomplete() {
    let acLDAPPref = Preferences.get("ldap_2.autoComplete.useDirectory").value;
    gComposePane.enableElement(document.getElementById("directoriesList"), acLDAPPref);
    gComposePane.enableElement(document.getElementById("editButton"), acLDAPPref);
  },

  editDirectories() {
    gSubDialog.open("chrome://messenger/content/addressbook/pref-editdirectories.xul");
  },

  initAbDefaultStartupDir() {
    if (!this.startupDirListener.inited)
      this.startupDirListener.load();

    let dirList = document.getElementById("defaultStartupDirList");
    if (Services.prefs.getBoolPref("mail.addr_book.view.startupURIisDefault")) {
      // Some directory is the default.
      let startupURI = Services.prefs.getCharPref("mail.addr_book.view.startupURI");
      let dirItem = dirList.menupopup.querySelector('[value="' + startupURI + '"]');
      // It may happen that the stored URI is not in the list.
      // In that case select the "none" value and let the AB code clear out
      // the invalid value, unless the user selects something here.
      if (dirItem)
        dirList.selectedItem = dirItem;
      else
        dirList.value = "";
    } else {
      // Choose item meaning there is no default startup directory any more.
      dirList.value = "";
    }
  },

  setButtonColors() {
    document.getElementById("textColorButton").value =
      Preferences.get("msgcompose.text_color").value;
    document.getElementById("backgroundColorButton").value =
      Preferences.get("msgcompose.background_color").value;
  },

  setDefaultStartupDir(aDirURI) {
    if (aDirURI) {
      // Some AB directory was selected. Set prefs to make this directory
      // the default view when starting up the main AB.
      Services.prefs.setCharPref("mail.addr_book.view.startupURI", aDirURI);
      Services.prefs.setBoolPref("mail.addr_book.view.startupURIisDefault", true);
    } else {
      // Set pref that there's no default startup view directory any more.
      Services.prefs.setBoolPref("mail.addr_book.view.startupURIisDefault", false);
    }
  },

  initLanguageMenu() {
    var languageMenuList = document.getElementById("languageMenuList");
    this.mSpellChecker = Cc["@mozilla.org/spellchecker/engine;1"].getService(Ci.mozISpellCheckingEngine);
    var o1 = {};
    var o2 = {};

    // Get the list of dictionaries from
    // the spellchecker.

    this.mSpellChecker.getDictionaryList(o1, o2);

    var dictList = o1.value;
    var count    = o2.value;

    // if we don't have any dictionaries installed, disable the menu list
    languageMenuList.disabled = !count;

    // If dictionary count hasn't changed then no need to update the menu.
    if (this.mDictCount == count)
      return;

    // Store current dictionary count.
    this.mDictCount = count;

    var inlineSpellChecker = new InlineSpellChecker();
    var sortedList = inlineSpellChecker.sortDictionaryList(dictList);

    // Remove any languages from the list.
    languageMenuList.removeAllItems();

    // append the dictionaries to the menu list...
    for (var i = 0; i < count; i++)
      languageMenuList.appendItem(sortedList[i].displayName, sortedList[i].localeCode);

    languageMenuList.setInitialSelection();
  },

  populateFonts() {
    var fontsList = document.getElementById("FontSelect");
    try {
      var enumerator = Cc["@mozilla.org/gfx/fontenumerator;1"]
                         .getService(Ci.nsIFontEnumerator);
      var localFontCount = { value: 0 };
      var localFonts = enumerator.EnumerateAllFonts(localFontCount);
      for (let i = 0; i < localFonts.length; ++i) {
        // Remove Linux system generic fonts that collide with CSS generic fonts.
        if (localFonts[i] != "" && localFonts[i] != "serif" &&
            localFonts[i] != "sans-serif" && localFonts[i] != "monospace")
          fontsList.appendItem(localFonts[i], localFonts[i]);
      }
    } catch (e) { }
    // Choose the item after the list is completely generated.
    var preference = Preferences.get(fontsList.getAttribute("preference"));
    fontsList.value = preference.value;
  },

   restoreHTMLDefaults() {
     // reset throws an exception if the pref value is already the default so
     // work around that with some try/catch exception handling
     try {
       Preferences.get("msgcompose.font_face").reset();
     } catch (ex) {}

     try {
       Preferences.get("msgcompose.font_size").reset();
     } catch (ex) {}

     try {
       Preferences.get("msgcompose.text_color").reset();
     } catch (ex) {}

     try {
       Preferences.get("msgcompose.background_color").reset();
     } catch (ex) {}

     try {
       Preferences.get("msgcompose.default_colors").reset();
     } catch (ex) {}

     this.updateUseReaderDefaults();
     this.setButtonColors();
  },

  startupDirListener: {
    inited: false,
    domain: "mail.addr_book.view.startupURI",
    observe(subject, topic, prefName) {
      if (topic != "nsPref:changed")
        return;

      // If the default startup directory prefs have changed,
      // reinitialize the default startup dir picker to show the new value.
      gComposePane.initAbDefaultStartupDir();
    },
    load() {
      // Observe changes of our prefs.
      Services.prefs.addObserver(this.domain, this);
      // Unload the pref observer when preferences window is closed.
      window.addEventListener("unload", this.unload, true);
      this.inited = true;
    },

    unload(event) {
      Services.prefs.removeObserver(gComposePane.startupDirListener.domain,
                                    gComposePane.startupDirListener);
    },
  },
};

Preferences.get("mail.compose.autosave").on("change", gComposePane.updateAutosave);
Preferences.get("mail.compose.attachment_reminder").on("change", gComposePane.updateAttachmentCheck);
Preferences.get("msgcompose.default_colors").on("change", gComposePane.updateUseReaderDefaults);
Preferences.get("ldap_2.autoComplete.useDirectory").on("change", gComposePane.enableAutocomplete);
Preferences.get("mail.collect_email_address_outgoing").on("change", gComposePane.updateEmailCollection);
