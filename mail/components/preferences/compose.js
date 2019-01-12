/* -*- Mode: Javascript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

ChromeUtils.import("resource://gre/modules/InlineSpellChecker.jsm");

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
      let preference = document.getElementById("mail.preferences.compose.selectedTabIndex");
      if (preference.value)
        document.getElementById("composePrefs").selectedIndex = preference.value;
    }

    this.mInitialized = true;
  },

  tabSelectionChanged() {
    if (this.mInitialized) {
      var preference = document.getElementById("mail.preferences.compose.selectedTabIndex");
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
    this.enableElement(document.getElementById("autoSaveInterval"),
      document.getElementById("autoSave").checked);
  },

  updateUseReaderDefaults() {
    let useReaderDefaultsChecked = document.getElementById("useReaderDefaults").checked;
    this.enableElement(document.getElementById("textColorLabel"),
      !useReaderDefaultsChecked);
    this.enableElement(document.getElementById("backgroundColorLabel"),
      !useReaderDefaultsChecked);
    this.enableElement(document.getElementById("textColorButton"),
      !useReaderDefaultsChecked);
    this.enableElement(document.getElementById("backgroundColorButton"),
      !useReaderDefaultsChecked);
  },

  updateAttachmentCheck() {
    this.enableElement(document.getElementById("attachment_reminder_button"),
      document.getElementById("attachment_reminder_label").checked);
  },

  updateEmailCollection() {
    this.enableElement(document.getElementById("localDirectoriesList"),
      document.getElementById("emailCollectionOutgoing").checked);
  },

  enableElement(aElement, aEnable) {
    let pref = aElement.getAttribute("preference");
    let prefIsLocked = pref ? document.getElementById(pref).locked : false;
    aElement.disabled = !aEnable || prefIsLocked;
  },

  enableAutocomplete() {
    var acLDAPPref = document.getElementById("ldap_2.autoComplete.useDirectory")
                             .value;

    this.enableElement(document.getElementById("directoriesList"), acLDAPPref);
    this.enableElement(document.getElementById("editButton"), acLDAPPref);
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
      document.getElementById("msgcompose.text_color").value;
    document.getElementById("backgroundColorButton").value =
      document.getElementById("msgcompose.background_color").value;
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
    var preference = document.getElementById(fontsList.getAttribute("preference"));
    fontsList.value = preference.value;
  },

   restoreHTMLDefaults() {
     // reset throws an exception if the pref value is already the default so
     // work around that with some try/catch exception handling
     try {
       document.getElementById("msgcompose.font_face").reset();
     } catch (ex) {}

     try {
       document.getElementById("msgcompose.font_size").reset();
     } catch (ex) {}

     try {
       document.getElementById("msgcompose.text_color").reset();
     } catch (ex) {}

     try {
       document.getElementById("msgcompose.background_color").reset();
     } catch (ex) {}

     try {
       document.getElementById("msgcompose.default_colors").reset();
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
