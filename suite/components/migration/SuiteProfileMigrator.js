/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { XPCOMUtils } =
  ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");
const { FileUtils } =
  ChromeUtils.import("resource://gre/modules/FileUtils.jsm");
const { AppConstants } =
  ChromeUtils.import('resource://gre/modules/AppConstants.jsm');

ChromeUtils.defineModuleGetter(this, "FileUtils",
  "resource://gre/modules/FileUtils.jsm");

function ProfileMigrator() {
}

ProfileMigrator.prototype = {
  migrate: function PM_migrate(aStartup) {
    // By opening the wizard with a supplied migrator, it will automatically
    // migrate from it.
    let [key, migrator] = this._getDefaultMigrator();
    if (!key)
        return;

    let params = Cc["@mozilla.org/array;1"]
                   .createInstance(Ci.nsIMutableArray);
    params.appendElement(this._toString(key));
    params.appendElement(migrator);
    params.appendElement(aStartup);

    Services.ww.openWindow(null,
                           "chrome://communicator/content/migration/migration.xul",
                           "_blank",
                           "chrome,dialog,modal,centerscreen,titlebar",
                           params);
  },

  _toString: function PM__toString(aStr) {
    let str = Cc["@mozilla.org/supports-string;1"]
                .createInstance(Ci.nsISupportsString);
    str.data = aStr;
    return str;
  },

  _getMigratorIfSourceExists: function PM__getMigratorIfSourceExists(aKey) {
    let cid = "@mozilla.org/profile/migrator;1?app=suite&type=" + aKey;
    let migrator = Cc[cid].createInstance(Ci.nsISuiteProfileMigrator);
    if (migrator.sourceExists)
      return migrator;
    return null;
  },

  // We don't yet support checking for the default browser on all platforms,
  // needless to say we don't have migrators for all browsers.  Thus, for each
  // platform, there's a fallback list of migrators used in these cases.
  _PLATFORM_FALLBACK_LIST:
     ["thunderbird"],

  _getDefaultMigrator: function PM__getDefaultMigrator() {

    let migratorsOrdered = Array.from(this._PLATFORM_FALLBACK_LIST);

    // FIXME This is all so not working currently.
    // There are currently no migrators for browsers available.
    // See Bug 739056.
    if (false) {
      let defaultBrowser = "";

      if (AppConstants.platform == "win") {
        try {
          const REG_KEY = "SOFTWARE\\Classes\\HTTP\\shell\\open\\command";
          let regKey = Cc["@mozilla.org/windows-registry-key;1"]
                         .createInstance(Ci.nsIWindowsRegKey);
          regKey.open(regKey.ROOT_KEY_LOCAL_MACHINE, REG_KEY,
                      regKey.ACCESS_READ);
          let value = regKey.readStringValue("").toLowerCase();
          let pathMatches = value.match(/^"?(.+?\.exe)"?/);
          if (!pathMatches) {
            throw new Error("Could not extract path from " +
                            REG_KEY + "(" + value + ")");
          }

          // We want to find out what the default browser is but the path in and of
          // itself isn't enough.  Why? Because sometimes on Windows paths get
          // truncated like so: C:\PROGRA~1\MOZILL~2\MOZILL~1.EXE.  How do we know
          // what product that is? Mozilla's file objects do nothing to 'normalize'
          // the path so we need to attain an actual product descriptor from the
          // file somehow, and in this case it means getting the "InternalName"
          // field of the file's VERSIONINFO resource.
          //
          // In the file's resource segment there is a VERSIONINFO section that is
          // laid out like this:
          //
          // VERSIONINFO
          //   StringFileInfo
          //     <TranslationID>
          //       InternalName           "iexplore"
          //   VarFileInfo
          //     Translation              <TranslationID>
          //
          // By Querying the VERSIONINFO section for its Tranlations, we can find
          // out where the InternalName lives (A file can have more than one
          // translation of its VERSIONINFO segment, but we just assume the first
          // one).
          let file = FileUtils.File(pathMatches[1])
                              .QueryInterface(Ci.nsILocalFileWin);
          switch (file.getVersionInfoField("InternalName").toLowerCase()) {
            case "iexplore":
              defaultBrowser = "ie";
              break;
            case "chrome":
              defaultBrowser = "chrome";
              break;
          }
        }
        catch (ex) {
          Cu.reportError("Could not retrieve default browser: " + ex);
        }
      }

      // If we found the default browser and we have support for that browser,
      // make sure to check it before any other browser, by moving it to the head
      // of the array.
      if (defaultBrowser) {
        migratorsOrdered.sort((a, b) => b == defaultBrowser ? 1 : 0); 
      }
    }

    for (let key of migratorsOrdered) {
      let migrator = this._getMigratorIfSourceExists(key);
      if (migrator) {
        return [key, migrator];
      }
    }

    return ["", null];
  },

  QueryInterface: XPCOMUtils.generateQI([Ci.nsIProfileMigrator]),
  classDescription: "Profile Migrator",
  contractID: "@mozilla.org/toolkit/profile-migrator;1",
  classID: Components.ID("{d5148b7c-ba4e-4f7a-a80b-1ae48b90b910}"),
};

var NSGetFactory = XPCOMUtils.generateNSGetFactory([ProfileMigrator]);
