/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This module handles migrating mail-specific preferences, etc. Migration has
 * traditionally been a part of messenger.js, but separating the code out into
 * a module makes unit testing much easier.
 */

const EXPORTED_SYMBOLS = ["MailMigrator", "MigrationTasks"];

const { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

const { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  EventEmitter: "resource://gre/modules/EventEmitter.sys.mjs",
  setTimeout: "resource://gre/modules/Timer.sys.mjs",
  migrateToolbarForSpace: "resource:///modules/ToolbarMigration.sys.mjs",
  clearXULToolbarState: "resource:///modules/ToolbarMigration.sys.mjs",
});

XPCOMUtils.defineLazyModuleGetters(lazy, {
  FolderUtils: "resource:///modules/FolderUtils.jsm",
  migrateMailnews: "resource:///modules/MailnewsMigrator.jsm",
});

var MailMigrator = {
  _migrateXULStoreForDocument(fromURL, toURL) {
    Array.from(Services.xulStore.getIDsEnumerator(fromURL)).forEach(id => {
      Array.from(Services.xulStore.getAttributeEnumerator(fromURL, id)).forEach(
        attr => {
          const value = Services.xulStore.getValue(fromURL, id, attr);
          Services.xulStore.setValue(toURL, id, attr, value);
        }
      );
    });
  },

  _migrateXULStoreForElement(url, fromID, toID) {
    Array.from(Services.xulStore.getAttributeEnumerator(url, fromID)).forEach(
      attr => {
        const value = Services.xulStore.getValue(url, fromID, attr);
        Services.xulStore.setValue(url, toID, attr, value);
        Services.xulStore.removeValue(url, fromID, attr);
      }
    );
  },

  /* eslint-disable complexity */
  /**
   * Determine if the UI has been upgraded in a way that requires us to reset
   * some user configuration.  If so, performs the resets.
   */
  _migrateUI() {
    // The code for this was ported from
    // mozilla/browser/components/nsBrowserGlue.js
    const UI_VERSION = 41;
    const MESSENGER_DOCURL = "chrome://messenger/content/messenger.xhtml";
    const MESSENGERCOMPOSE_DOCURL =
      "chrome://messenger/content/messengercompose/messengercompose.xhtml";
    const UI_VERSION_PREF = "mail.ui-rdf.version";
    let currentUIVersion = Services.prefs.getIntPref(UI_VERSION_PREF, 0);

    if (currentUIVersion >= UI_VERSION) {
      return;
    }

    const xulStore = Services.xulStore;

    const newProfile = currentUIVersion == 0;
    if (newProfile) {
      // Collapse the main menu by default if the override pref
      // "mail.main_menu.collapse_by_default" is set to true.
      if (Services.prefs.getBoolPref("mail.main_menu.collapse_by_default")) {
        xulStore.setValue(
          MESSENGER_DOCURL,
          "toolbar-menubar",
          "autohide",
          "true"
        );
      }

      // Set to current version to skip all the migration below.
      currentUIVersion = UI_VERSION;
    }

    try {
      // UI versions below 5 could only exist in an old profile with localstore.rdf
      // file used for the XUL store. Since TB55 this file is no longer read.
      // Since UI version 5, the xulstore.json file is being used, so we only
      // support those versions here, see bug 1371898.

      // In UI version 6, we move the otherActionsButton button to the
      // header-view-toolbar.
      if (currentUIVersion < 6) {
        let cs = xulStore.getValue(
          MESSENGER_DOCURL,
          "header-view-toolbar",
          "currentset"
        );
        if (cs && !cs.includes("otherActionsButton")) {
          // Put the otherActionsButton button at the end.
          cs = cs + ",otherActionsButton";
          xulStore.setValue(
            MESSENGER_DOCURL,
            "header-view-toolbar",
            "currentset",
            cs
          );
        }
      }

      // In UI version 7, the three-state doNotTrack setting was reverted back
      // to two-state. This reverts a (no longer supported) setting of "please
      // track me" to the default "don't say anything".
      if (currentUIVersion < 7) {
        try {
          if (
            Services.prefs.getBoolPref("privacy.donottrackheader.enabled") &&
            Services.prefs.getIntPref("privacy.donottrackheader.value") != 1
          ) {
            Services.prefs.clearUserPref("privacy.donottrackheader.enabled");
            Services.prefs.clearUserPref("privacy.donottrackheader.value");
          }
        } catch (ex) {}
      }

      // In UI version 8, we change from boolean browser.display.use_document_colors
      // to the tri-state browser.display.document_color_use.
      if (currentUIVersion < 8) {
        const kOldColorPref = "browser.display.use_document_colors";
        if (
          Services.prefs.prefHasUserValue(kOldColorPref) &&
          !Services.prefs.getBoolPref(kOldColorPref)
        ) {
          Services.prefs.setIntPref("browser.display.document_color_use", 2);
        }
      }

      // This one is needed also in all new profiles.
      // Add an expanded entry for All Address Books.
      if (currentUIVersion < 10 || newProfile) {
        // If the file exists, read its contents, prepend the "All ABs" URI
        // and save it, else, just write the "All ABs" URI to the file.
        const spec = PathUtils.join(
          Services.dirsvc.get("ProfD", Ci.nsIFile).path,
          "directoryTree.json"
        );
        IOUtils.readJSON(spec)
          .then(data => {
            data.unshift("moz-abdirectory://?");
            IOUtils.writeJSON(spec, data);
          })
          .catch(ex => {
            if (["NotFoundError"].includes(ex.name)) {
              IOUtils.writeJSON(spec, ["moz-abdirectory://?"]);
            } else {
              console.error(ex);
            }
          });
      }

      // Several Latin language groups were consolidated into x-western.
      if (currentUIVersion < 11) {
        let group = null;
        try {
          group = Services.prefs.getComplexValue(
            "font.language.group",
            Ci.nsIPrefLocalizedString
          );
        } catch (ex) {}
        if (
          group &&
          ["tr", "x-baltic", "x-central-euro"].some(g => g == group.data)
        ) {
          group.data = "x-western";
          Services.prefs.setComplexValue(
            "font.language.group",
            Ci.nsIPrefLocalizedString,
            group
          );
        }
      }

      // Untangle starting in Paragraph mode from Enter key preference.
      if (currentUIVersion < 13) {
        Services.prefs.setBoolPref(
          "mail.compose.default_to_paragraph",
          Services.prefs.getBoolPref("editor.CR_creates_new_p")
        );
        Services.prefs.clearUserPref("editor.CR_creates_new_p");
      }

      // Migrate remote content exceptions for email addresses which are
      // encoded as chrome URIs.
      if (currentUIVersion < 14) {
        const permissionsDB = Services.dirsvc.get("ProfD", Ci.nsIFile);
        permissionsDB.append("permissions.sqlite");
        const db = Services.storage.openDatabase(permissionsDB);

        try {
          const statement = db.createStatement(
            "select origin,permission from moz_perms where " +
              // Avoid 'like' here which needs to be escaped.
              "substr(origin, 1, 28)='chrome://messenger/content/?';"
          );
          try {
            while (statement.executeStep()) {
              let origin = statement.getUTF8String(0);
              const permission = statement.getInt32(1);
              Services.perms.removeFromPrincipal(
                Services.scriptSecurityManager.createContentPrincipal(
                  Services.io.newURI(origin),
                  {}
                ),
                "image"
              );
              origin = origin.replace(
                "chrome://messenger/content/?",
                "chrome://messenger/content/messenger.xhtml"
              );
              Services.perms.addFromPrincipal(
                Services.scriptSecurityManager.createContentPrincipal(
                  Services.io.newURI(origin),
                  {}
                ),
                "image",
                permission
              );
            }
          } finally {
            statement.finalize();
          }

          // Sadly we still need to clear the database manually. Experiments
          // showed that the permissions manager deleted only one record.
          db.defaultTransactionType =
            Ci.mozIStorageConnection.TRANSACTION_EXCLUSIVE;
          db.beginTransaction();
          try {
            db.executeSimpleSQL(
              "delete from moz_perms where " +
                "substr(origin, 1, 28)='chrome://messenger/content/?';"
            );
            db.commitTransaction();
          } catch (ex) {
            db.rollbackTransaction();
            throw ex;
          }
        } finally {
          db.close();
        }
      }

      // Changed notification sound behaviour on OS X.
      if (currentUIVersion < 15) {
        var { AppConstants } = ChromeUtils.importESModule(
          "resource://gre/modules/AppConstants.sys.mjs"
        );
        if (AppConstants.platform == "macosx") {
          // For people updating from versions < 52 who had "Play system sound"
          // selected for notifications. As TB no longer plays system sounds,
          // uncheck the pref to match the new behaviour.
          const soundPref = "mail.biff.play_sound";
          if (
            Services.prefs.getBoolPref(soundPref) &&
            Services.prefs.getIntPref(soundPref + ".type") == 0
          ) {
            Services.prefs.setBoolPref(soundPref, false);
          }
        }
      }

      if (currentUIVersion < 16) {
        // Migrate the old requested locales prefs to use the new model
        const SELECTED_LOCALE_PREF = "general.useragent.locale";
        const MATCHOS_LOCALE_PREF = "intl.locale.matchOS";

        if (
          Services.prefs.prefHasUserValue(MATCHOS_LOCALE_PREF) ||
          Services.prefs.prefHasUserValue(SELECTED_LOCALE_PREF)
        ) {
          if (Services.prefs.getBoolPref(MATCHOS_LOCALE_PREF, false)) {
            Services.locale.requestedLocales = [];
          } else {
            const locale = Services.prefs.getComplexValue(
              SELECTED_LOCALE_PREF,
              Ci.nsIPrefLocalizedString
            );
            if (locale) {
              try {
                Services.locale.requestedLocales = [locale.data];
              } catch (e) {
                /* Don't panic if the value is not a valid locale code. */
              }
            }
          }
          Services.prefs.clearUserPref(SELECTED_LOCALE_PREF);
          Services.prefs.clearUserPref(MATCHOS_LOCALE_PREF);
        }
      }

      if (currentUIVersion < 17) {
        // Move composition's [Attach |v] button to the right end of Composition
        // Toolbar (unless the button was removed by user), so that it is
        // right above the attachment pane.
        // First, get value of currentset (string of comma-separated button ids).
        let cs = xulStore.getValue(
          MESSENGERCOMPOSE_DOCURL,
          "composeToolbar2",
          "currentset"
        );
        if (cs && cs.includes("button-attach")) {
          // Get array of button ids from currentset string.
          const csArray = cs.split(",");
          const attachButtonIndex = csArray.indexOf("button-attach");
          // Remove attach button id from current array position.
          csArray.splice(attachButtonIndex, 1);
          // If the currentset string does not contain a spring which causes
          // elements after the spring to be right-aligned, add it now at the
          // end of the array. Note: Prior to this UI version, only MAC OS
          // defaultset contained a spring; in any case, user might have added
          // or removed it via customization.
          if (!cs.includes("spring")) {
            csArray.push("spring");
          }
          // Add attach button id to the end of the array.
          csArray.push("button-attach");
          // Join array values back into comma-separated string.
          cs = csArray.join(",");
          // Apply changes to currentset.
          xulStore.setValue(
            MESSENGERCOMPOSE_DOCURL,
            "composeToolbar2",
            "currentset",
            cs
          );
        }
      }

      if (currentUIVersion < 18) {
        for (const url of [
          "chrome://calendar/content/calendar-event-dialog-attendees.xul",
          "chrome://calendar/content/calendar-event-dialog.xul",
          "chrome://messenger/content/addressbook/addressbook.xul",
          "chrome://messenger/content/messageWindow.xul",
          "chrome://messenger/content/messenger.xul",
          "chrome://messenger/content/messengercompose/messengercompose.xul",
        ]) {
          this._migrateXULStoreForDocument(
            url,
            url.replace(/\.xul$/, ".xhtml")
          );
        }
        // See bug 1653168. messagepanebox is the problematic one, but ensure
        // messagepaneboxwrapper doesn't cause problems as well.
        Services.xulStore.removeValue(
          "chrome://messenger/content/messenger.xhtml",
          "messagepanebox",
          "collapsed"
        );
        Services.xulStore.removeValue(
          "chrome://messenger/content/messenger.xhtml",
          "messagepaneboxwrapper",
          "collapsed"
        );

        Services.xulStore.removeValue(
          "chrome://messenger/content/messageWindow.xhtml",
          "messagepanebox",
          "collapsed"
        );
        Services.xulStore.removeValue(
          "chrome://messenger/content/messageWindow.xhtml",
          "messagepaneboxwrapper",
          "collapsed"
        );
      }

      if (currentUIVersion < 19) {
        // Clear socks proxy values if they were shared from http, to prevent
        // websocket breakage after bug 1577862 (see bug 1606679).
        if (
          Services.prefs.getBoolPref(
            "network.proxy.share_proxy_settings",
            false
          ) &&
          Services.prefs.getIntPref("network.proxy.type", 0) == 1
        ) {
          const httpProxy = Services.prefs.getCharPref(
            "network.proxy.http",
            ""
          );
          const httpPort = Services.prefs.getIntPref(
            "network.proxy.http_port",
            0
          );
          const socksProxy = Services.prefs.getCharPref(
            "network.proxy.socks",
            ""
          );
          const socksPort = Services.prefs.getIntPref(
            "network.proxy.socks_port",
            0
          );
          if (httpProxy && httpProxy == socksProxy && httpPort == socksPort) {
            Services.prefs.setCharPref(
              "network.proxy.socks",
              Services.prefs.getCharPref("network.proxy.backup.socks", "")
            );
            Services.prefs.setIntPref(
              "network.proxy.socks_port",
              Services.prefs.getIntPref("network.proxy.backup.socks_port", 0)
            );
          }
        }
      }

      // Clear unused socks proxy backup values - see bug 1625773.
      if (currentUIVersion < 20) {
        const backup = Services.prefs.getCharPref(
          "network.proxy.backup.socks",
          ""
        );
        const backupPort = Services.prefs.getIntPref(
          "network.proxy.backup.socks_port",
          0
        );
        const socksProxy = Services.prefs.getCharPref(
          "network.proxy.socks",
          ""
        );
        const socksPort = Services.prefs.getIntPref(
          "network.proxy.socks_port",
          0
        );
        if (backup == socksProxy) {
          Services.prefs.clearUserPref("network.proxy.backup.socks");
        }
        if (backupPort == socksPort) {
          Services.prefs.clearUserPref("network.proxy.backup.socks_port");
        }
      }

      // Make "bad" msgcompose.font_face value "tt" be "monospace" instead.
      if (currentUIVersion < 21) {
        if (Services.prefs.getStringPref("msgcompose.font_face") == "tt") {
          Services.prefs.setStringPref("msgcompose.font_face", "monospace");
        }
      }

      // Migrate Yahoo users to OAuth2, since "normal password" is going away
      // on October 20, 2020.
      if (currentUIVersion < 22) {
        this._migrateIncomingToOAuth2("mail.yahoo.com");
        this._migrateSMTPToOAuth2("mail.yahoo.com");
      }
      // ... and same thing for AOL users.
      if (currentUIVersion < 23) {
        this._migrateIncomingToOAuth2("imap.aol.com");
        this._migrateIncomingToOAuth2("pop.aol.com");
        this._migrateSMTPToOAuth2("smtp.aol.com");
      }

      // Version 24 was used and backed out.

      // Some elements changed ID, move their persisted values to the new ID.
      if (currentUIVersion < 25) {
        const url = "chrome://messenger/content/messenger.xhtml";
        this._migrateXULStoreForElement(url, "view-deck", "view-box");
        this._migrateXULStoreForElement(url, "displayDeck", "displayBox");
      }

      // Migrate the old Folder Pane modes dropdown.
      if (currentUIVersion < 26) {
        this._migrateXULStoreForElement(
          "chrome://messenger/content/messenger.xhtml",
          "folderPane-toolbar",
          "folderPaneHeader"
        );
      }

      if (currentUIVersion < 27) {
        const accountList = MailServices.accounts.accounts.filter(
          a => a.incomingServer
        );
        accountList.sort(lazy.FolderUtils.compareAccounts);
        const accountKeyList = accountList.map(account => account.key);
        try {
          MailServices.accounts.reorderAccounts(accountKeyList);
        } catch (error) {
          console.error(
            "Migrating account list order failed. Error message was: " +
              error +
              " -- Will not reattempt migration."
          );
        }
      }

      // Migrating the preference of the font size in the message compose window
      // to use in document.execCommand.
      if (currentUIVersion < 28) {
        const fontSize = Services.prefs.getCharPref("msgcompose.font_size");
        let newFontSize;
        switch (fontSize) {
          case "x-small":
            newFontSize = "1";
            break;
          case "small":
            newFontSize = "2";
            break;
          case "medium":
            newFontSize = "3";
            break;
          case "large":
            newFontSize = "4";
            break;
          case "x-large":
            newFontSize = "5";
            break;
          case "xx-large":
            newFontSize = "6";
            break;
          default:
            newFontSize = "3";
        }
        Services.prefs.setCharPref("msgcompose.font_size", newFontSize);
      }

      // Migrate mail.biff.use_new_count_in_mac_dock to
      // mail.biff.use_new_count_in_badge.
      if (currentUIVersion < 29) {
        if (
          Services.prefs.getBoolPref(
            "mail.biff.use_new_count_in_mac_dock",
            false
          )
        ) {
          Services.prefs.setBoolPref("mail.biff.use_new_count_in_badge", true);
          Services.prefs.clearUserPref("mail.biff.use_new_count_in_mac_dock");
        }
      }

      // Clear ui.systemUsesDarkTheme after bug 1736252.
      if (currentUIVersion < 30) {
        Services.prefs.clearUserPref("ui.systemUsesDarkTheme");
      }

      if (currentUIVersion < 32) {
        this._migrateIncomingToOAuth2("imap.gmail.com");
        this._migrateIncomingToOAuth2("pop.gmail.com");
        this._migrateSMTPToOAuth2("smtp.gmail.com");
      }

      if (currentUIVersion < 33) {
        // Put button-encryption and button-encryption-options on the
        // Composition Toolbar.
        // First, get value of currentset (string of comma-separated button ids).
        let cs = xulStore.getValue(
          MESSENGERCOMPOSE_DOCURL,
          "composeToolbar2",
          "currentset"
        );
        if (cs) {
          // Button ids from currentset string.
          const buttonIds = cs.split(",");

          // We want to insert the two buttons at index 2 and 3.
          buttonIds.splice(2, 0, "button-encryption");
          buttonIds.splice(3, 0, "button-encryption-options");

          cs = buttonIds.join(",");
          // Apply changes to currentset.
          xulStore.setValue(
            MESSENGERCOMPOSE_DOCURL,
            "composeToolbar2",
            "currentset",
            cs
          );
        }
      }

      if (currentUIVersion < 34) {
        // Migrate from
        // + mailnews.sendformat.auto_downgrade - Whether we should
        //   auto-downgrade to plain text when the message is plain.
        // + mail.default_html_action - The default sending format if we didn't
        //   auto-downgrade.
        // to mail.default_send_format
        const defaultHTMLAction = Services.prefs.getIntPref(
          "mail.default_html_action",
          3
        );
        Services.prefs.clearUserPref("mail.default_html_action");
        const autoDowngrade = Services.prefs.getBoolPref(
          "mailnews.sendformat.auto_downgrade",
          true
        );
        Services.prefs.clearUserPref("mailnews.sendformat.auto_downgrade");

        let sendFormat;
        switch (defaultHTMLAction) {
          case 0:
            // Was AskUser. Move to the new Auto default.
            sendFormat = Ci.nsIMsgCompSendFormat.Auto;
            break;
          case 1:
            // Was PlainText only. Keep as plain text. Note, autoDowngrade has
            // no effect on this option.
            sendFormat = Ci.nsIMsgCompSendFormat.PlainText;
            break;
          case 2:
            // Was HTML. Keep as HTML if autoDowngrade was false, otherwise use
            // the Auto default.
            sendFormat = autoDowngrade
              ? Ci.nsIMsgCompSendFormat.Auto
              : Ci.nsIMsgCompSendFormat.HTML;
            break;
          case 3:
            // Was Both. If autoDowngrade was true, this is the same as the
            // new Auto default. Otherwise, keep as Both.
            sendFormat = autoDowngrade
              ? Ci.nsIMsgCompSendFormat.Auto
              : Ci.nsIMsgCompSendFormat.Both;
            break;
          default:
            sendFormat = Ci.nsIMsgCompSendFormat.Auto;
            break;
        }
        Services.prefs.setIntPref("mail.default_send_format", sendFormat);
      }

      if (currentUIVersion < 35) {
        // Both IMAP and POP settings currently use this domain
        this._migrateIncomingToOAuth2("outlook.office365.com");
        this._migrateSMTPToOAuth2("smtp.office365.com");
      }

      if (currentUIVersion < 36) {
        lazy.migrateToolbarForSpace("mail");
      }

      if (currentUIVersion < 37) {
        if (!Services.prefs.prefHasUserValue("mail.uidensity")) {
          Services.prefs.setIntPref("mail.uidensity", 0);
        }
      }

      if (currentUIVersion < 38) {
        lazy.migrateToolbarForSpace("calendar");
        lazy.migrateToolbarForSpace("tasks");
        lazy.migrateToolbarForSpace("chat");
        lazy.migrateToolbarForSpace("settings");
        lazy.migrateToolbarForSpace("addressbook");
        // Clear menubar and tabbar XUL toolbar state.
        lazy.clearXULToolbarState("tabbar-toolbar");
        lazy.clearXULToolbarState("toolbar-menubar");
      }

      if (currentUIVersion < 39) {
        // Set old defaults for message header customization in existing
        // profiles without any customization settings.
        if (
          !Services.xulStore.hasValue(
            "chrome://messenger/content/messenger.xhtml",
            "messageHeader",
            "layout"
          )
        ) {
          Services.xulStore.setValue(
            "chrome://messenger/content/messenger.xhtml",
            "messageHeader",
            "layout",
            JSON.stringify({
              showAvatar: false,
              showBigAvatar: false,
              showFullAddress: false,
              hideLabels: false,
              subjectLarge: false,
              buttonStyle: "default",
            })
          );
        }
      }

      if (currentUIVersion < 40) {
        // Keep the view to table for existing profiles if the user never
        // customized the thread pane view.
        if (
          !Services.xulStore.hasValue(
            "chrome://messenger/content/messenger.xhtml",
            "threadPane",
            "view"
          )
        ) {
          Services.xulStore.setValue(
            "chrome://messenger/content/messenger.xhtml",
            "threadPane",
            "view",
            "table"
          );
        }

        // Maintain the default horizontal layout for existing profiles if the
        // user never changed it.
        if (!Services.prefs.prefHasUserValue("mail.pane_config.dynamic")) {
          Services.prefs.setIntPref("mail.pane_config.dynamic", 0);
        }
      }

      if (currentUIVersion < 41) {
        // Maintain the default ascending order for existing profiles if the
        // user never changed it.
        if (!Services.prefs.prefHasUserValue("mailnews.default_sort_order")) {
          Services.prefs.setIntPref("mailnews.default_sort_order", 1);
        }
        if (
          !Services.prefs.prefHasUserValue("mailnews.default_news_sort_order")
        ) {
          Services.prefs.setIntPref("mailnews.default_news_sort_order", 1);
        }
      }

      // Migration tasks that may take a long time are not run immediately, but
      // added to the MigrationTasks object then run at the end.
      //
      // See the documentation on MigrationTask and MigrationTasks for how to
      // add a task.
      MigrationTasks.runTasks();

      // Update the migration version.
      Services.prefs.setIntPref(UI_VERSION_PREF, UI_VERSION);
    } catch (e) {
      console.error(
        "Migrating from UI version " +
          currentUIVersion +
          " to " +
          UI_VERSION +
          " failed. Error message was: " +
          e +
          " -- " +
          "Will reattempt on next start."
      );
    }
  },
  /* eslint-enable complexity */

  /**
   * Migrate incoming server to using OAuth2 as authMethod.
   *
   * @param {string} hostnameHint - What the hostname should end with.
   */
  _migrateIncomingToOAuth2(hostnameHint) {
    for (const account of MailServices.accounts.accounts) {
      // Skip if not a matching account.
      if (!account.incomingServer.hostName.endsWith(hostnameHint)) {
        continue;
      }

      // Change Incoming server to OAuth2.
      account.incomingServer.authMethod = Ci.nsMsgAuthMethod.OAuth2;
    }
  },

  /**
   * Migrate outgoing server to using OAuth2 as authMethod.
   *
   * @param {string} hostnameHint - What the hostname should end with.
   */
  _migrateSMTPToOAuth2(hostnameHint) {
    for (const server of MailServices.smtp.servers) {
      // Skip if not a matching server.
      if (!server.hostname.endsWith(hostnameHint)) {
        continue;
      }

      // Change Outgoing SMTP server to OAuth2.
      server.authMethod = Ci.nsMsgAuthMethod.OAuth2;
    }
  },

  /**
   * RSS subscriptions and items used to be stored in .rdf files, but now
   * we've changed to use JSON files instead. This migration routine checks
   * for the old format files and upgrades them as appropriate.
   * The feeds and items migration are handled as separate (hopefully atomic)
   * steps. It is careful to not overwrite new-style .json files.
   *
   * @returns {void}
   */
  async _migrateRSS() {
    // Find all the RSS IncomingServers.
    const rssServers = [];
    for (const server of MailServices.accounts.allServers) {
      if (server && server.type == "rss") {
        rssServers.push(server);
      }
    }

    // For each one...
    for (const server of rssServers) {
      await this._migrateRSSServer(server);
    }
  },

  async _migrateRSSServer(server) {
    const rssServer = server.QueryInterface(Ci.nsIRssIncomingServer);

    // Convert feeds.rdf to feeds.json (if needed).
    const feedsFile = rssServer.subscriptionsPath;
    const legacyFeedsFile = server.localPath;
    legacyFeedsFile.append("feeds.rdf");

    try {
      await this._migrateRSSSubscriptions(legacyFeedsFile, feedsFile);
    } catch (err) {
      console.error(
        "Failed to migrate '" +
          feedsFile.path +
          "' to '" +
          legacyFeedsFile.path +
          "': " +
          err
      );
    }

    // Convert feeditems.rdf to feeditems.json (if needed).
    const itemsFile = rssServer.feedItemsPath;
    const legacyItemsFile = server.localPath;
    legacyItemsFile.append("feeditems.rdf");
    try {
      await this._migrateRSSItems(legacyItemsFile, itemsFile);
    } catch (err) {
      console.error(
        "Failed to migrate '" +
          itemsFile.path +
          "' to '" +
          legacyItemsFile.path +
          "': " +
          err
      );
    }
  },

  // Assorted namespace strings required for the feed migrations.
  FZ_NS: "urn:forumzilla:",
  DC_NS: "http://purl.org/dc/elements/1.1/",
  RSS_NS: "http://purl.org/rss/1.0/",
  RDF_SYNTAX_NS: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
  RDF_SYNTAX_TYPE: "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",

  /**
   * Convert rss subscriptions in a legacy feeds.rdf file into feeds.json.
   * If the conversion is successful, the legacy file will be removed.
   *
   * @param {nsIFile} legacyFile - Location of the rdf file.
   * @param {nsIFile} jsonFile - Location for the output JSON file.
   * @returns {void}
   */
  async _migrateRSSSubscriptions(legacyFile, jsonFile) {
    // Load .rdf file into an XMLDocument.
    let rawXMLRDF;
    try {
      rawXMLRDF = await IOUtils.readUTF8(legacyFile.path);
    } catch (ex) {
      if (["NotFoundError"].includes(ex.name)) {
        return; // nothing legacy file to migrate
      }
    }
    const parser = new DOMParser();
    const doc = parser.parseFromString(rawXMLRDF, "text/xml");

    const feeds = [];
    // Skip the fz:root->fz:feeds->etc structure. Just grab fz:feed nodes.
    const feedNodes = doc.documentElement.getElementsByTagNameNS(
      this.FZ_NS,
      "feed"
    );

    const toBool = function (val) {
      return val == "true";
    };

    // Map RDF feed property names to js.
    const propMap = [
      { ns: this.DC_NS, name: "title", dest: "title" },
      { ns: this.DC_NS, name: "lastModified", dest: "lastModified" },
      { ns: this.DC_NS, name: "identifier", dest: "url" },
      { ns: this.FZ_NS, name: "quickMode", dest: "quickMode", cook: toBool },
      { ns: this.FZ_NS, name: "options", dest: "options", cook: JSON.parse },
      { ns: this.FZ_NS, name: "destFolder", dest: "destFolder" },
      { ns: this.RSS_NS, name: "link", dest: "link" },
    ];

    for (const f of feedNodes) {
      const feed = {};
      for (const p of propMap) {
        // The data could be in either an attribute or an element.
        let val = f.getAttributeNS(p.ns, p.name);
        if (!val) {
          const el = f.getElementsByTagNameNS(p.ns, p.name).item(0);
          if (el) {
            // Might be a RDF:resource...
            val = el.getAttributeNS(this.RDF_SYNTAX_NS, "resource");
            if (!val) {
              // ...or a literal string.
              val = el.textContent;
            }
          }
        }
        if (!val) {
          // log.warn(`feeds.rdf: ${p.name} missing`);
          continue;
        }
        // Conversion needed?
        if ("cook" in p) {
          val = p.cook(val);
        }
        feed[p.dest] = val;
      }

      if (feed.url) {
        feeds.push(feed);
      }
    }

    await IOUtils.writeJSON(jsonFile.path, feeds);
    legacyFile.remove(false);
  },

  /**
   * Convert a legacy feeditems.rdf file into feeditems.json.
   * If the conversion is successful, the legacy file will be removed.
   *
   * @param {nsIFile} legacyFile - Location of the rdf file.
   * @param {nsIFile} jsonFile - Location for the output JSON file.
   * @returns {void}
   */
  async _migrateRSSItems(legacyFile, jsonFile) {
    // Load .rdf file into an XMLDocument.
    let rawXMLRDF;
    try {
      rawXMLRDF = await IOUtils.readUTF8(legacyFile.path);
    } catch (ex) {
      if (["NotFoundError"].includes(ex.name)) {
        return; // nothing legacy file to migrate
      }
    }
    const parser = new DOMParser();
    const doc = parser.parseFromString(rawXMLRDF, "text/xml");

    const items = {};

    const demangleURL = function (itemURI) {
      // Reverse the mapping that originally turned links/guids into URIs.
      let url = itemURI;
      url = url.replace("urn:feeditem:", "");
      url = url.replace(/%23/g, "#");
      url = url.replace(/%2f/g, "/");
      url = url.replace(/%3f/g, "?");
      url = url.replace(/%26/g, "&");
      url = url.replace(/%7e/g, "~");
      url = decodeURI(url);
      return url;
    };

    const toBool = function (s) {
      return s == "true";
    };

    const toInt = function (s) {
      const t = parseInt(s);
      return Number.isNaN(t) ? 0 : t;
    };

    const itemNodes = doc.documentElement.getElementsByTagNameNS(
      this.RDF_SYNTAX_NS,
      "Description"
    );

    // Map RDF feed property names to js.
    const propMap = [
      { ns: this.FZ_NS, name: "stored", dest: "stored", cook: toBool },
      { ns: this.FZ_NS, name: "valid", dest: "valid", cook: toBool },
      {
        ns: this.FZ_NS,
        name: "last-seen-timestamp",
        dest: "lastSeenTime",
        cook: toInt,
      },
    ];

    for (const itemNode of itemNodes) {
      const item = {};
      for (const p of propMap) {
        // The data could be in either an attribute or an element.
        let val = itemNode.getAttributeNS(p.ns, p.name);
        if (!val) {
          const elements = itemNode.getElementsByTagNameNS(p.ns, p.name);
          if (elements.length > 0) {
            val = elements.item(0).textContent;
          }
        }
        if (!val) {
          // log.warn(`feeditems.rdf: ${p.name} missing`);
          continue;
        }
        // Conversion needed?
        if ("cook" in p) {
          val = p.cook(val);
        }
        item[p.dest] = val;
      }

      item.feedURLs = [];
      const feedNodes = itemNode.getElementsByTagNameNS(this.FZ_NS, "feed");
      for (const feedNode of feedNodes) {
        const feedURL = feedNode.getAttributeNS(this.RDF_SYNTAX_NS, "resource");
        item.feedURLs.push(feedURL);
      }

      let id = itemNode.getAttributeNS(this.RDF_SYNTAX_NS, "about");
      id = demangleURL(id);
      if (id) {
        items[id] = item;
      }
    }

    await IOUtils.writeJSON(jsonFile.path, items);
    legacyFile.remove(false);
  },

  /**
   * Perform any migration work that needs to occur once the user profile has
   * been loaded.
   */
  migrateAtProfileStartup() {
    lazy.migrateMailnews();
    this._migrateUI();
    this._migrateRSS();
  },
};

/**
 * Controls migration tasks, including (if the migration is taking a while)
 * presenting the user with a pop-up window showing the current status.
 */
var MigrationTasks = {
  _finished: false,
  _progressWindow: null,
  _start: null,
  _tasks: [],
  _waitThreshold: 1000,

  /**
   * Adds a simple task to be completed.
   *
   * @param {string} [fluentID] - The name of this task. If specified, a string
   *   for this name MUST be in migration.ftl. If not specified, this task
   *   won't appear in the list of migration tasks.
   * @param {Function} action
   */
  addSimpleTask(fluentID, action) {
    this._tasks.push(new MigrationTask(fluentID, action));
  },

  /**
   * Adds a task to be completed. Subclasses of MigrationTask are allowed,
   * allowing more complex tasks than `addSimpleTask`.
   *
   * @param {MigrationTask} task
   */
  addComplexTask(task) {
    if (!(task instanceof MigrationTask)) {
      throw new Error("Task is not a MigrationTask");
    }
    this._tasks.push(task);
  },

  /**
   * Runs the tasks in sequence.
   */
  async _runTasksInternal() {
    this._start = Date.now();

    // Do not optimise this for-loop. More tasks could be added.
    for (let t = 0; t < this._tasks.length; t++) {
      const task = this._tasks[t];
      task.status = "running";

      await task.action();

      for (let i = 0; i < task.subTasks.length; i++) {
        task.emit("progress", i, task.subTasks.length);
        const subTask = task.subTasks[i];
        subTask.status = "running";

        await subTask.action();
        subTask.status = "finished";
      }
      if (task.subTasks.length) {
        task.emit("progress", task.subTasks.length, task.subTasks.length);
        // Pause long enough for the user to see the progress bar at 100%.
        await new Promise(resolve => lazy.setTimeout(resolve, 150));
      }

      task.status = "finished";
    }

    this._tasks.length = 0;
    this._finished = true;
  },

  /**
   * Runs the migration tasks. Controls the opening and closing of the pop-up.
   */
  runTasks() {
    this._runTasksInternal();

    Services.tm.spinEventLoopUntil("MigrationTasks", () => {
      if (this._finished) {
        return true;
      }

      if (
        !this._progressWindow &&
        Date.now() - this._start > this._waitThreshold
      ) {
        this._progressWindow = Services.ww.openWindow(
          null,
          "chrome://messenger/content/migrationProgress.xhtml",
          "_blank",
          "centerscreen,width=640",
          Services.ww
        );
        this.addSimpleTask(undefined, async () => {
          await new Promise(r => lazy.setTimeout(r, 1000));
          this._progressWindow.close();
        });
      }

      return false;
    });

    delete this._progressWindow;
  },

  /**
   * @type MigrationTask[]
   */
  get tasks() {
    return this._tasks;
  },
};

/**
 * A single task to be completed.
 */
class MigrationTask {
  /**
   * The name of this task. If specified, a string for this name MUST be in
   * migration.ftl. If not specified, this task won't appear in the list of
   * migration tasks.
   *
   * @type string
   */
  fluentID = null;

  /**
   * Smaller tasks for this task. If there are sub-tasks, a progress bar will
   * be displayed to the user, showing how many sub-tasks are complete.
   *
   * @note A sub-task may not have sub-sub-tasks.
   *
   * @type MigrationTask[]
   */
  subTasks = [];

  /**
   * Current status of the task. Either "pending", "running" or "finished".
   *
   * @type string
   */
  _status = "pending";

  /**
   * @param {string} [fluentID]
   * @param {Function} action
   */
  constructor(fluentID, action) {
    this.fluentID = fluentID;
    this.action = action;
    lazy.EventEmitter.decorate(this);
  }

  /**
   * Current status of the task. Either "pending", "running" or "finished".
   * Emits a "status-change" notification on change.
   *
   * @type string
   */
  get status() {
    return this._status;
  }

  set status(value) {
    this._status = value;
    this.emit("status-change", value);
  }
}
