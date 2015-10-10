/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This module handles migrating mail-specific preferences, etc. Migration has
 * traditionally been a part of msgMail3PaneWindow.js, but separating the code
 * out into a module makes unit testing much easier.
 */

var EXPORTED_SYMBOLS = ["MailMigrator"];

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cu = Components.utils;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource:///modules/mailServices.js");
Cu.import("resource:///modules/IOUtils.js");

var MailMigrator = {
  /**
   * Switch the given fonts to the given encodings, but only if the current fonts
   * are defaults.
   */
  _switchDefaultFonts: function MailMigrator__switchDefaultFonts(aFonts,
                                                                 aEncodings) {
    for each (let [, encoding] in Iterator(aEncodings)) {
      let serifPref = "font.name.serif." + encoding;
      let sansPref = "font.name.sans-serif." + encoding;
      let variableSizePref = "font.size.variable." + encoding;
      // This is expected to be one of sans-serif or serif, and determines what
      // we'll link the variable font size to.
      let isSansDefault = Services.prefs.getCharPref("font.default." + encoding) ==
                            "sans-serif";

      if (!Services.prefs.prefHasUserValue(serifPref)) {
        Services.prefs.setCharPref(serifPref, aFonts.serif);
        if (!isSansDefault)
          Services.prefs.setIntPref(variableSizePref, aFonts.variableSize);
      }

      if (!Services.prefs.prefHasUserValue(sansPref)) {
        Services.prefs.setCharPref(sansPref, aFonts.sans);
        if (isSansDefault)
          Services.prefs.setIntPref(variableSizePref, aFonts.variableSize);
      }

      let monospacePref = "font.name.monospace." + encoding;
      let fixedSizePref = "font.size.fixed." + encoding;
      if (!Services.prefs.prefHasUserValue(monospacePref)) {
        Services.prefs.setCharPref(monospacePref, aFonts.monospace);
        Services.prefs.setIntPref(fixedSizePref, aFonts.fixedSize);
      }
    }
  },

  /**
   * Migrate to ClearType fonts (Cambria, Calibri and Consolas) on Windows Vista
   * and above.
   */
  migrateToClearTypeFonts: function MailMigrator_migrateToClearTypeFonts() {
    // Windows...
    if ("@mozilla.org/windows-registry-key;1" in Components.classes) {
      // Only migrate on Vista (Windows version 6.0) and above
      if (Services.sysinfo.getPropertyAsDouble("version") >= 6.0) {
        let fontPrefVersion =
          Services.prefs.getIntPref("mail.font.windows.version");
        if (fontPrefVersion < 2) {
          let fonts = {
            serif: "Cambria",
            sans: "Calibri",
            monospace: "Consolas",
            variableSize: 17,
            fixedSize: 14,
          };
          // Encodings to switch to the new fonts.
          let encodings = [];
          // (Thunderbird 3.1)
          if (fontPrefVersion < 1)
            encodings.push("x-unicode", "x-western");
          // (Thunderbird 3.2)
          encodings.push("x-cyrillic", "el");

          this._switchDefaultFonts(fonts, encodings);

          Services.prefs.setIntPref("mail.font.windows.version", 2);
        }
      }
    }
  },

  /**
   * Determine if the UI has been upgraded in a way that requires us to reset
   * some user configuration.  If so, performs the resets.
   */
  _migrateUI: function() {
    // The code for this was ported from
    // mozilla/browser/components/nsBrowserGlue.js
    const UI_VERSION = 11;
    const MESSENGER_DOCURL = "chrome://messenger/content/messenger.xul";
    const UI_VERSION_PREF = "mail.ui-rdf.version";
    let currentUIVersion = 0;

    try {
      currentUIVersion = Services.prefs.getIntPref(UI_VERSION_PREF);
    } catch(ex) {}

    if (currentUIVersion >= UI_VERSION)
      return;

    let xulStore = Cc["@mozilla.org/xul/xulstore;1"].getService(Ci.nsIXULStore);

    try {
      // Initially, we checked if currentUIVersion < 1, and stripped the
      // persisted "collapsed" property from folderPaneBox if it wasn't.
      // However, the inital implementation of migrateUI swallowed up
      // exceptions, and bumped the value of UI_VERSION_PREF regardless.
      // Now, instead, we fail to bump the UI_VERSION_PREF if something goes
      // wrong, and we've moved the folderPaneBox operation into
      // currentUIVersion < 2 just in case the operation failed for some of
      // our users the first time.
      if (currentUIVersion < 2) {
        // We want to remove old settings that collapse the folderPaneBox
        if (xulStore.hasValue(MESSENGER_DOCURL, "folderPaneBox", "collapsed")) {
          // We want to override this, and set it to false.  We should really
          // be ignoring this persist attribute, anyhow.
          xulStore.removeValue(MESSENGER_DOCURL, "folderPaneBox", "collapsed");
        }

        // We want to remove the throbber from the menubar on Linux and
        // Windows, and from the mail-toolbar on OSX.
        let mailBarId = (Services.appinfo.OS == "Darwin") ?
          "mail-bar3" : "mail-toolbar-menubar2";
        let cs = xulStore.getValue(MESSENGER_DOCURL, mailBarId, "currentset");

        if (cs && cs.includes("throbber-box")) {
          cs = cs.replace(/(^|,)throbber-box($|,)/, "$1$2");
          xulStore.setValue(MESSENGER_DOCURL, mailBarId, "currentset", cs);
        }
      }

      // In UI version 3, we move the QFB button from the tabbar toolbar to
      // to the mail toolbar.
      if (currentUIVersion < 3) {
        let cs = xulStore.getValue(MESSENGER_DOCURL, "tabbar-toolbar", "currentset");
        if (cs && cs.includes("qfb-show-filter-bar")) {
          cs = cs.replace(/(^|,)qfb-show-filter-bar($|,)/, "$1$2");
          xulStore.setValue(MESSENGER_DOCURL, "tabbar-toolbar", "currentset", cs);
        }

        let cs3 = xulStore.getValue(MESSENGER_DOCURL, "mail-bar3", "currentset");
        if (cs3 && !cs3.includes("qfb-show-filter-bar")) {
          if (cs3.includes("gloda-search")) {
            // Put the QFB toggle before the gloda-search and any of
            // spring / spacer / separator.
            cs3 = cs3.replace(/(^|,)([spring,|spacer,|separator,]*)gloda-search($|,)/,
                             "$1qfb-show-filter-bar,$2gloda-search$3");
          } else {
            // If there's no gloda-search, just put the QFB toggle at the end
            cs3 += ",qfb-show-filter-bar";
          }
          xulStore.setValue(MESSENGER_DOCURL, "mail-bar3", "currentset", cs3);
        }
      }

      // In UI version 4, we add the chat button to the mail toolbar.
      if (currentUIVersion < 4) {
        let cs = xulStore.getValue(MESSENGER_DOCURL, "mail-bar3", "currentset");
        if (cs && !cs.includes("button-chat")) {
          if (cs.includes("button-newmsg")) {
            // Put the chat button after the newmsg button.
            cs = cs.replace(/(^|,)button-newmsg($|,)/,
                            "$1button-newmsg,button-chat$2");
          } else if (cs.includes("button-address")) {
            // If there's no newmsg button, put the chat button before the address book button.
            cs = cs.replace(/(^|,)button-address($|,)/,
                            "$1button-chat,button-address$2");
          } else {
            // Otherwise, just put the chat button at the end.
            cs += ",button-chat";
          }
          xulStore.setValue(MESSENGER_DOCURL, "mail-bar3", "currentset", cs);
        }
      }

      // In UI version 5, we add the AppMenu button to the mail toolbar and
      // collapse the main menu by default if the user has no accounts
      // set up (and the override pref "mail.main_menu.collapse_by_default"
      // is set to true). Checking for 0 accounts is a hack, because we can't
      // think of any better way of determining whether this profile is new
      // or not.
      if (currentUIVersion < 5) {
        /**
         * Helper function that attempts to add the AppMenu button to the
         * end of a toolbar with ID aToolbarID. Fails silently if this is
         * not possible, as is typical within our UI migration code.
         *
         * @param aToolbarID the ID of the toolbar to add the AppMenu to.
         */
        let addButtonToEnd = function(aToolbarID, aButtonID) {
          let cs = xulStore.getValue(MESSENGER_DOCURL, aToolbarID, "currentset");
          if (cs && !cs.includes(aButtonID)) {
            // Put the AppMenu button at the end.
            cs += "," + aButtonID;
            xulStore.setValue(MESSENGER_DOCURL, aToolbarID, "currentset", cs);
          }
        }.bind(this);

        addButtonToEnd("mail-bar3", "button-appmenu");
        addButtonToEnd("chat-toobar", "button-chat-appmenu");

        if (Services.prefs.getBoolPref("mail.main_menu.collapse_by_default") &&
            MailServices.accounts.accounts.length == 0) {
          xulStore.setValue(MESSENGER_DOCURL, "mail-toolbar-menubar2", "autohide", "true");
        }
      }

      // In UI version 6, we move the otherActionsButton button to the
      // header-view-toolbar.
      if (currentUIVersion < 6) {
        let cs = xulStore.getValue(MESSENGER_DOCURL, "header-view-toolbar", "currentset");
        if (cs && !cs.includes("otherActionsButton")) {
          // Put the otherActionsButton button at the end.
          cs = cs + "," + "otherActionsButton";
          xulStore.setValue(MESSENGER_DOCURL, "header-view-toolbar", "currentset", cs);
        }
      }

      // In UI version 7, the three-state doNotTrack setting was reverted back
      // to two-state. This reverts a (no longer supported) setting of "please
      // track me" to the default "don't say anything".
      if (currentUIVersion < 7) {
        try {
          if (Services.prefs.getBoolPref("privacy.donottrackheader.enabled") &&
              Services.prefs.getIntPref("privacy.donottrackheader.value") != 1) {
            Services.prefs.clearUserPref("privacy.donottrackheader.enabled");
            Services.prefs.clearUserPref("privacy.donottrackheader.value");
          }
        }
        catch (ex) {}
      }

      // In UI version 8, we change from boolean browser.display.use_document_colors
      // to the tri-state browser.display.document_color_use.
      if (currentUIVersion < 8) {
        const kOldColorPref = "browser.display.use_document_colors";
        if (Services.prefs.prefHasUserValue(kOldColorPref) &&
            !Services.prefs.getBoolPref(kOldColorPref)) {
          Services.prefs.setIntPref("browser.display.document_color_use", 2);
        }
      }

      // Limit the charset detector pref to values (now) available from the UI.
      if (currentUIVersion < 9) {
        let detector = null;
        try {
          detector = Services.prefs.getComplexValue("intl.charset.detector",
                                                    Ci.nsIPrefLocalizedString).data;
        } catch (ex) { }
        if (!(detector == "" ||
              detector == "ja_parallel_state_machine" ||
              detector == "ruprob" ||
              detector == "ukprob")) {
          // If the encoding detector pref value is not reachable from the UI,
          // reset to default (varies by localization).
          Services.prefs.clearUserPref("intl.charset.detector");
        }
      }

      // Add an expanded entry for All Address Books.
      if (currentUIVersion < 10) {
        const DIR_TREE_FILE = "directoryTree.json";

        // If the file exists, read its contents, prepend the "All ABs" URI
        // and save it, else, just write the "All ABs" URI to the file.
        let data = IOUtils.loadFileToString(DIR_TREE_FILE);
        if (!data || data == "[]") {
          data = "";
        } else if (data.length > 0) {
          data = data.substring(1, data.length - 1);
        }

        data = "[" + "\"moz-abdirectory://?\"" +
               ((data.length > 0) ? ("," + data) : "") + "]";

        IOUtils.saveStringToFile(DIR_TREE_FILE, data);
      }

      // Several Latin language groups were consolidated into x-western.
      if (currentUIVersion < 11) {
        let group = null;
        try {
          group = Services.prefs.getComplexValue("font.language.group",
                                                 Ci.nsIPrefLocalizedString);
        } catch (ex) {}
        if (group &&
            ["tr", "x-baltic", "x-central-euro"].some(g => g == group.data)) {
          group.data = "x-western";
          Services.prefs.setComplexValue("font.language.group",
                                         Ci.nsIPrefLocalizedString, group);
        }
      }

      // Update the migration version.
      Services.prefs.setIntPref(UI_VERSION_PREF, UI_VERSION);

    } catch(e) {
      Cu.reportError("Migrating from UI version " + currentUIVersion + " to " +
                     UI_VERSION + " failed. Error message was: " + e + " -- " +
                     "Will reattempt on next start.");
    }
  },

  /**
   * Perform any migration work that needs to occur after the Account Wizard
   * has had a chance to appear.
   */
  migratePostAccountWizard: function MailMigrator_migratePostAccountWizard() {
    this.migrateToClearTypeFonts();
  },

  /**
   * Perform any migration work that needs to occur once the user profile has
   * been loaded.
   */
  migrateAtProfileStartup: function MailMigrator_migrateAtProfileStartup() {
    this._migrateUI();
  },
};
