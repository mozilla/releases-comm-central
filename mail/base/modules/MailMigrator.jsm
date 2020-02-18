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

ChromeUtils.defineModuleGetter(
  this,
  "AddrBookDirectory",
  "resource:///modules/AddrBookDirectory.jsm"
);
const { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
const { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
const { IOUtils } = ChromeUtils.import("resource:///modules/IOUtils.jsm");

var MailMigrator = {
  /**
   * Switch the given fonts to the given encodings, but only if the current fonts
   * are defaults.
   */
  _switchDefaultFonts(aFonts, aEncodings) {
    for (let encoding of aEncodings) {
      let serifPref = "font.name.serif." + encoding;
      let sansPref = "font.name.sans-serif." + encoding;
      let variableSizePref = "font.size.variable." + encoding;
      // This is expected to be one of sans-serif or serif, and determines what
      // we'll link the variable font size to.
      let isSansDefault =
        Services.prefs.getCharPref("font.default." + encoding) == "sans-serif";

      if (!Services.prefs.prefHasUserValue(serifPref)) {
        Services.prefs.setCharPref(serifPref, aFonts.serif);
        if (!isSansDefault) {
          Services.prefs.setIntPref(variableSizePref, aFonts.variableSize);
        }
      }

      if (!Services.prefs.prefHasUserValue(sansPref)) {
        Services.prefs.setCharPref(sansPref, aFonts.sans);
        if (isSansDefault) {
          Services.prefs.setIntPref(variableSizePref, aFonts.variableSize);
        }
      }

      let monospacePref = "font.name.monospace." + encoding;
      let fixedSizePref = "font.size.monospace." + encoding;
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
  migrateToClearTypeFonts() {
    // Windows...
    if ("@mozilla.org/windows-registry-key;1" in Cc) {
      // Only migrate on Vista (Windows version 6.0) and above
      if (Services.sysinfo.getPropertyAsDouble("version") >= 6.0) {
        let fontPrefVersion = Services.prefs.getIntPref(
          "mail.font.windows.version"
        );
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
          if (fontPrefVersion < 1) {
            encodings.push("x-unicode", "x-western");
          }
          // (Thunderbird 3.2)
          encodings.push("x-cyrillic", "el");

          this._switchDefaultFonts(fonts, encodings);

          Services.prefs.setIntPref("mail.font.windows.version", 2);
        }
      }
    }
  },

  _migrateXULStoreForDocument(fromURL, toURL) {
    Array.from(Services.xulStore.getIDsEnumerator(fromURL)).forEach(id => {
      Array.from(Services.xulStore.getAttributeEnumerator(fromURL, id)).forEach(
        attr => {
          let value = Services.xulStore.getValue(fromURL, id, attr);
          Services.xulStore.setValue(toURL, id, attr, value);
        }
      );
    });
  },

  /* eslint-disable complexity */
  /**
   * Determine if the UI has been upgraded in a way that requires us to reset
   * some user configuration.  If so, performs the resets.
   */
  _migrateUI() {
    // The code for this was ported from
    // mozilla/browser/components/nsBrowserGlue.js
    const UI_VERSION = 19;
    const MESSENGER_DOCURL = "chrome://messenger/content/messenger.xhtml";
    const MESSENGERCOMPOSE_DOCURL =
      "chrome://messenger/content/messengercompose/messengercompose.xhtml";
    const UI_VERSION_PREF = "mail.ui-rdf.version";
    let currentUIVersion = Services.prefs.getIntPref(UI_VERSION_PREF, 0);

    if (currentUIVersion >= UI_VERSION) {
      return;
    }

    let xulStore = Services.xulStore;

    let newProfile = currentUIVersion == 0;
    if (newProfile) {
      // Collapse the main menu by default if the override pref
      // "mail.main_menu.collapse_by_default" is set to true.
      if (Services.prefs.getBoolPref("mail.main_menu.collapse_by_default")) {
        xulStore.setValue(
          MESSENGER_DOCURL,
          "mail-toolbar-menubar2",
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

      // Limit the charset detector pref to values (now) available from the UI.
      if (currentUIVersion < 9) {
        let detector = null;
        try {
          detector = Services.prefs.getComplexValue(
            "intl.charset.detector",
            Ci.nsIPrefLocalizedString
          ).data;
        } catch (ex) {}
        if (
          !(
            detector == "" ||
            detector == "ja_parallel_state_machine" ||
            detector == "ruprob" ||
            detector == "ukprob"
          )
        ) {
          // If the encoding detector pref value is not reachable from the UI,
          // reset to default (varies by localization).
          Services.prefs.clearUserPref("intl.charset.detector");
        }
      }

      // This one is needed also in all new profiles.
      // Add an expanded entry for All Address Books.
      if (currentUIVersion < 10 || newProfile) {
        const DIR_TREE_FILE = "directoryTree.json";

        // If the file exists, read its contents, prepend the "All ABs" URI
        // and save it, else, just write the "All ABs" URI to the file.
        let data = IOUtils.loadFileToString(DIR_TREE_FILE);
        if (!data || data == "[]") {
          data = "";
        } else if (data.length > 0) {
          data = data.substring(1, data.length - 1);
        }

        data =
          '["moz-abdirectory://?"' + (data.length > 0 ? "," + data : "") + "]";

        IOUtils.saveStringToFile(DIR_TREE_FILE, data);
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
        let permissionsDB = Services.dirsvc.get("ProfD", Ci.nsIFile);
        permissionsDB.append("permissions.sqlite");
        let db = Services.storage.openDatabase(permissionsDB);

        try {
          let statement = db.createStatement(
            "select origin,permission from moz_perms where " +
              // Avoid 'like' here which needs to be escaped.
              "substr(origin, 1, 28)='chrome://messenger/content/?';"
          );
          try {
            while (statement.executeStep()) {
              let origin = statement.getUTF8String(0);
              let permission = statement.getInt32(1);
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
        var { AppConstants } = ChromeUtils.import(
          "resource://gre/modules/AppConstants.jsm"
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
            let locale = Services.prefs.getComplexValue(
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
          let csArray = cs.split(",");
          let attachButtonIndex = csArray.indexOf("button-attach");
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
        for (let url of [
          "chrome://calendar/content/calendar-event-dialog-attendees.xul",
          "chrome://calendar/content/calendar-event-dialog.xul",
          "chrome://messenger/content/addressbook/addressbook.xul",
          "chrome://messenger/content/messageWindow.xhtml",
          "chrome://messenger/content/messenger.xul",
          "chrome://messenger/content/messengercompose/messengercompose.xul",
        ]) {
          this._migrateXULStoreForDocument(
            url,
            url.replace(/\.xul$/, ".xhtml")
          );
        }
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
          let httpProxy = Services.prefs.getCharPref("network.proxy.http", "");
          let httpPort = Services.prefs.getIntPref(
            "network.proxy.http_port",
            0
          );
          let socksProxy = Services.prefs.getCharPref(
            "network.proxy.socks",
            ""
          );
          let socksPort = Services.prefs.getIntPref(
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

      // Update the migration version.
      Services.prefs.setIntPref(UI_VERSION_PREF, UI_VERSION);
    } catch (e) {
      Cu.reportError(
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
   * RSS subscriptions and items used to be stored in .rdf files, but now
   * we've changed to use JSON files instead. This migration routine checks
   * for the old format files and upgrades them as appropriate.
   * The feeds and items migration are handled as separate (hopefully atomic)
   * steps. It is careful to not overwrite new-style .json files.
   *
   * @returns {void}
   */
  _migrateRSS() {
    // Find all the RSS IncomingServers.
    let rssServers = [];
    let allServers = MailServices.accounts.allServers;
    for (let i = 0; i < allServers.length; i++) {
      let server = allServers.queryElementAt(i, Ci.nsIMsgIncomingServer);
      if (server && server.type == "rss") {
        rssServers.push(server);
      }
    }

    // For each one...
    for (let server of rssServers) {
      this._migrateRSSServer(server);
    }
  },

  _migrateRSSServer(server) {
    let rssServer = server.QueryInterface(Ci.nsIRssIncomingServer);

    // Convert feeds.rdf to feeds.json (if needed).
    let feedsFile = rssServer.subscriptionsPath;
    let legacyFeedsFile = server.localPath;
    legacyFeedsFile.append("feeds.rdf");
    if (!feedsFile.exists() && legacyFeedsFile.exists()) {
      try {
        this._migrateRSSSubscriptions(legacyFeedsFile, feedsFile);
      } catch (err) {
        Cu.reportError(
          "Failed to migrate '" +
            feedsFile.path +
            "' to '" +
            legacyFeedsFile.path +
            "': " +
            err
        );
      }
    }
    // Convert feeditems.rdf to feeditems.json (if needed).
    let itemsFile = rssServer.feedItemsPath;
    let legacyItemsFile = server.localPath;
    legacyItemsFile.append("feeditems.rdf");
    if (!itemsFile.exists() && legacyItemsFile.exists()) {
      try {
        this._migrateRSSItems(legacyItemsFile, itemsFile);
      } catch (err) {
        Cu.reportError(
          "Failed to migrate '" +
            itemsFile.path +
            "' to '" +
            legacyItemsFile.path +
            "': " +
            err
        );
      }
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
   * @throws Will throw an error if the conversion fails.
   */
  _migrateRSSSubscriptions(legacyFile, jsonFile) {
    // Load .rdf file into an XMLDocument.
    let rawXMLRDF = IOUtils.loadFileToString(legacyFile);
    let parser = new DOMParser();
    let doc = parser.parseFromString(rawXMLRDF, "text/xml");

    let feeds = [];
    // Skip the fz:root->fz:feeds->etc structure. Just grab fz:feed nodes.
    let feedNodes = doc.documentElement.getElementsByTagNameNS(
      this.FZ_NS,
      "feed"
    );

    let toBool = function(val) {
      return val == "true";
    };

    // Map RDF feed property names to js.
    let propMap = [
      { ns: this.DC_NS, name: "title", dest: "title" },
      { ns: this.DC_NS, name: "lastModified", dest: "lastModified" },
      { ns: this.DC_NS, name: "identifier", dest: "url" },
      { ns: this.FZ_NS, name: "quickMode", dest: "quickMode", cook: toBool },
      { ns: this.FZ_NS, name: "options", dest: "options", cook: JSON.parse },
      { ns: this.FZ_NS, name: "destFolder", dest: "destFolder" },
      { ns: this.RSS_NS, name: "link", dest: "link" },
    ];

    for (let f of feedNodes) {
      let feed = {};
      for (let p of propMap) {
        // The data could be in either an attribute or an element.
        let val = f.getAttributeNS(p.ns, p.name);
        if (!val) {
          let el = f.getElementsByTagNameNS(p.ns, p.name).item(0);
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

    let data = JSON.stringify(feeds);
    IOUtils.saveStringToFile(jsonFile, data);
    legacyFile.remove(false);
  },

  /**
   * Convert a legacy feeditems.rdf file into feeditems.json.
   * If the conversion is successful, the legacy file will be removed.
   *
   * @param {nsIFile} legacyFile - Location of the rdf file.
   * @param {nsIFile} jsonFile - Location for the output JSON file.
   * @returns {void}
   * @throws Will throw an error if the conversion fails.
   */
  _migrateRSSItems(legacyFile, jsonFile) {
    // Load .rdf file into an XMLDocument.
    let rawXMLRDF = IOUtils.loadFileToString(legacyFile);
    let parser = new DOMParser();
    let doc = parser.parseFromString(rawXMLRDF, "text/xml");

    let items = {};

    let demangleURL = function(itemURI) {
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

    let toBool = function(s) {
      return s == "true";
    };

    let toInt = function(s) {
      let t = parseInt(s);
      return Number.isNaN(t) ? 0 : t;
    };

    let itemNodes = doc.documentElement.getElementsByTagNameNS(
      this.RDF_SYNTAX_NS,
      "Description"
    );

    // Map RDF feed property names to js.
    let propMap = [
      { ns: this.FZ_NS, name: "stored", dest: "stored", cook: toBool },
      { ns: this.FZ_NS, name: "valid", dest: "valid", cook: toBool },
      {
        ns: this.FZ_NS,
        name: "last-seen-timestamp",
        dest: "lastSeenTime",
        cook: toInt,
      },
    ];

    for (let itemNode of itemNodes) {
      let item = {};
      for (let p of propMap) {
        // The data could be in either an attribute or an element.
        let val = itemNode.getAttributeNS(p.ns, p.name);
        if (!val) {
          let elements = itemNode.getElementsByTagNameNS(p.ns, p.name);
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
      let feedNodes = itemNode.getElementsByTagNameNS(this.FZ_NS, "feed");
      for (let feedNode of feedNodes) {
        let feedURL = feedNode.getAttributeNS(this.RDF_SYNTAX_NS, "resource");
        item.feedURLs.push(feedURL);
      }

      let id = itemNode.getAttributeNS(this.RDF_SYNTAX_NS, "about");
      id = demangleURL(id);
      if (id) {
        items[id] = item;
      }
    }

    let data = JSON.stringify(items);
    IOUtils.saveStringToFile(jsonFile, data);
    legacyFile.remove(false);
  },

  /**
   * Perform any migration work that needs to occur after the Account Wizard
   * has had a chance to appear.
   */
  migratePostAccountWizard() {
    this.migrateToClearTypeFonts();
  },

  /**
   * Migrate address books from Mork to JS/SQLite.
   *
   * All Mork address books found in the prefs are converted to JS/SQLite
   * address books and the prefs updated. Migrated Mork files in the profile
   * are renamed with the extension ".mab.bak" to avoid confusion.
   */
  async _migrateAddressBooks() {
    async function migrateBook(fileName, notFoundThrows = true) {
      let oldFile = profileDir.clone();
      oldFile.append(`${fileName}.mab`);
      if (!oldFile.exists()) {
        if (notFoundThrows) {
          throw Cr.NS_ERROR_NOT_AVAILABLE;
        }
        return;
      }

      console.log(`Creating new ${fileName}.sqlite`);
      let newBook = new AddrBookDirectory();
      newBook.init(`jsaddrbook://${fileName}.sqlite`);

      let database = Cc[
        "@mozilla.org/addressbook/carddatabase;1"
      ].createInstance(Ci.nsIAddrDatabase);
      database.dbPath = oldFile;
      database.openMDB(oldFile, false);

      let directory = Cc[
        "@mozilla.org/addressbook/directoryproperty;1"
      ].createInstance(Ci.nsIAbDirectory);

      let cardMap = new Map();
      for (let card of database.enumerateCards(directory)) {
        if (!card.isMailList) {
          cardMap.set(card.localId, card);
        }
      }
      if (cardMap.size > 0) {
        await newBook._bulkAddCards(cardMap.values());

        for (let card of database.enumerateCards(directory)) {
          if (card.isMailList) {
            let mailList = Cc[
              "@mozilla.org/addressbook/directoryproperty;1"
            ].createInstance(Ci.nsIAbDirectory);
            mailList.isMailList = true;
            mailList.dirName = card.displayName;
            mailList.listNickName = card.getProperty("NickName", "");
            mailList.description = card.getProperty("Notes", "");
            mailList = newBook.addMailList(mailList);

            for (let listCard of database.enumerateListAddresses(
              directory,
              card.localId
            )) {
              listCard.QueryInterface(Ci.nsIAbCard);
              if (cardMap.has(listCard.localId)) {
                mailList.addCard(cardMap.get(listCard.localId));
              }
            }
          }
        }
      }

      database.closeMDB(false);
      database.forceClosed();

      let backupFile = profileDir.clone();
      backupFile.append(`${fileName}.mab.bak`);
      backupFile.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, 0o644);
      console.log(`Renaming ${fileName}.mab to ${backupFile.leafName}`);
      oldFile.renameTo(profileDir, backupFile.leafName);
    }

    let profileDir = Services.dirsvc.get("ProfD", Ci.nsIFile);
    for (let name of Services.prefs.getChildList("ldap_2.servers.")) {
      try {
        if (name.endsWith(".uri")) {
          let uri = Services.prefs.getStringPref(name);
          if (uri.startsWith("ldap://") || uri.startsWith("ldaps://")) {
            let prefName = name.substring(0, name.length - 4);
            let fileName = Services.prefs.getStringPref(
              `${prefName}.filename`,
              ""
            );
            if (fileName.endsWith(".mab")) {
              fileName = fileName.replace(/\.mab$/, "");
              Services.prefs.setStringPref(
                `${prefName}.filename`,
                `${fileName}.sqlite`
              );
              await migrateBook(fileName);
            }
          }
        } else if (
          name.endsWith(".dirType") &&
          Services.prefs.getIntPref(name) == 2
        ) {
          let prefName = name.substring(0, name.length - 8);
          let fileName = Services.prefs.getStringPref(`${prefName}.filename`);
          fileName = fileName.replace(/\.mab$/, "");

          Services.prefs.setIntPref(`${prefName}.dirType`, 101);
          Services.prefs.setStringPref(
            `${prefName}.filename`,
            `${fileName}.sqlite`
          );
          if (Services.prefs.prefHasUserValue(`${prefName}.uri`)) {
            Services.prefs.setStringPref(
              `${prefName}.uri`,
              `jsaddrbook://${fileName}.sqlite`
            );
          }
          await migrateBook(fileName);
        }
      } catch (ex) {
        Cu.reportError(ex);
      }
    }

    try {
      await migrateBook("abook", false);
    } catch (ex) {
      Cu.reportError(ex);
    }
    try {
      await migrateBook("history", false);
    } catch (ex) {
      Cu.reportError(ex);
    }

    for (let prefName of [
      "mail.collect_addressbook",
      "mail.server.default.whiteListAbURI",
    ]) {
      try {
        if (Services.prefs.prefHasUserValue(prefName)) {
          let uri = Services.prefs.getStringPref(prefName);
          uri = uri.replace(
            /^moz-abmdbdirectory:\/\/(.*).mab$/,
            "jsaddrbook://$1.sqlite"
          );
          Services.prefs.setStringPref(prefName, uri);
        }
      } catch (ex) {
        Cu.reportError(ex);
      }
    }

    Services.obs.notifyObservers(null, "addrbook-reload");
  },

  /**
   * Perform any migration work that needs to occur once the user profile has
   * been loaded.
   */
  async migrateAtProfileStartup() {
    await this._migrateAddressBooks();
    this._migrateUI();
    this._migrateRSS();
  },
};
