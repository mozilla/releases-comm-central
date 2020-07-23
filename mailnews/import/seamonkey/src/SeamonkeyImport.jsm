/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

let { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
let { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
let seamonkeyImportMsgs = Services.strings.createBundle(
  "chrome://messenger/locale/seamonkeyImportMsgs.properties"
);

var EXPORTED_SYMBOLS = ["SeamonkeyImport"];

/**
 * Implements nsIImportGeneric instead of nsIImportAddressBook. The actual
 * importing is delegated to nsSeamonkeyProfileMigrator.
 */
function SeamonkeyImportAddressbook() {
  this.migrator = Cc[
    "@mozilla.org/profile/migrator;1?app=mail&type=seamonkey"
  ].createInstance(Ci.nsIMailProfileMigrator);
  this.sourceProfile = null;
}

SeamonkeyImportAddressbook.prototype = {
  QueryInterface: ChromeUtils.generateQI([Ci.nsIImportGeneric]),

  /**
   * Return the location of addressbook/mail.
   */
  GetData() {
    if (!this.sourceProfile) {
      try {
        this.sourceProfile = this.migrator.sourceProfiles.queryElementAt(
          0,
          Ci.nsISupportsString
        ).data;
      } catch (e) {
        return null;
      }
    }

    // nsIMailProfileMigrator only provides profile names, not profile
    // locations. On the other hand, the frontend only cares if a Seamonkey
    // profile exists, but doesn't use the actual location. So we cheated by
    // returning Thunderbird profile location.
    let profileDir = Services.dirsvc.get("ProfD", Ci.nsIFile);
    return profileDir;
  },

  SetData() {
    return 0;
  },

  WantsProgress() {
    return false;
  },

  GetProgress() {
    return 0;
  },

  GetStatus() {
    return 0;
  },

  CancelImport() {
    return 0;
  },

  ContinueImport() {
    return 0;
  },

  BeginImport(successLog, errorLog) {
    this.migrator.migrate(
      Ci.nsIMailProfileMigrator.ADDRESSBOOK_DATA,
      null,
      this.sourceProfile
    );
    successLog.data = seamonkeyImportMsgs.GetStringFromName(
      "SeamonkeyImportAddressSuccess"
    );
    return true;
  },
};

/**
 * Implements nsIImportSettings. The actual importing is delegated to
 * nsSeamonkeyProfileMigrator.
 */
function SeamonkeyImportSettings() {
  this.migrator = Cc[
    "@mozilla.org/profile/migrator;1?app=mail&type=seamonkey"
  ].createInstance(Ci.nsIMailProfileMigrator);
  this.sourceProfile = null;
}

SeamonkeyImportSettings.prototype = {
  QueryInterface: ChromeUtils.generateQI([Ci.nsIImportSettings]),

  AutoLocate(desc, loc) {
    if (!this.sourceProfile) {
      try {
        this.sourceProfile = this.migrator.sourceProfiles.queryElementAt(
          0,
          Ci.nsISupportsString
        ).data;
      } catch (e) {
        return false;
      }
    }

    // nsIMailProfileMigrator only provides profile names, not profile
    // locations. On the other hand, the frontend only cares if a Seamonkey
    // profile exists, but doesn't use the actual location. So we cheated by
    // returning Thunderbird profile location.
    let profileDir = Services.dirsvc.get("ProfD", Ci.nsIFile);
    loc = profileDir;
    return true;
  },

  Import() {
    this.migrator.migrate(
      Ci.nsIMailProfileMigrator.SETTINGS,
      null,
      this.sourceProfile
    );

    // Reload accounts so that `CheckIfLocalFolderExists` in importDialog works
    MailServices.accounts.UnloadAccounts();
    MailServices.accounts.LoadAccounts();
    return true;
  },
};

/**
 * Implements nsIImportModule so that Seamonkey is shown as an option in the
 * importDialog.xhtml. Currently supports importing addressbook and mail, see
 * the GetImportInterface function.
 */
function SeamonkeyImport() {}

SeamonkeyImport.prototype = {
  QueryInterface: ChromeUtils.generateQI([Ci.nsIImportModule]),

  get name() {
    return seamonkeyImportMsgs.GetStringFromName("SeamonkeyImportName");
  },

  get description() {
    return seamonkeyImportMsgs.GetStringFromName("SeamonkeyImportDescription");
  },

  get supports() {
    return "mail,addressbook";
  },

  get supportsUpgrade() {
    return false;
  },

  GetImportInterface(type) {
    if (type == "addressbook") {
      return new SeamonkeyImportAddressbook();
    } else if (type == "settings") {
      return new SeamonkeyImportSettings();
    }
    return null;
  },
};
