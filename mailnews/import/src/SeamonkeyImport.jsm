/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
const seamonkeyImportMsgs = Services.strings.createBundle(
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
  this.sourceProfileName = null;
  this.sourceProfileLocation = null;
}

SeamonkeyImportAddressbook.prototype = {
  QueryInterface: ChromeUtils.generateQI(["nsIImportGeneric"]),

  /**
   * Return the location of addressbook.
   */
  GetData() {
    if (!this.sourceProfileName || !this.sourceProfileLocation) {
      try {
        this.sourceProfileName = this.migrator.sourceProfiles[0];
        this.sourceProfileLocation = this.migrator.sourceProfileLocations[0];
      } catch (e) {
        return null;
      }
    }

    return this.sourceProfileLocation;
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
      this.sourceProfileName
    );
    successLog.data = seamonkeyImportMsgs.GetStringFromName(
      "SeamonkeyImportAddressSuccess"
    );
    return true;
  },
};

/**
 * Implements nsIImportMail. The importing process is managed by nsImportMail.
 */
function SeamonkeyImportMail() {}

SeamonkeyImportMail.prototype = {
  QueryInterface: ChromeUtils.generateQI(["nsIImportMail"]),

  GetDefaultLocation(location, found, userVerify) {
    const migrator = Cc[
      "@mozilla.org/profile/migrator;1?app=mail&type=seamonkey"
    ].createInstance(Ci.nsIMailProfileMigrator);

    try {
      const sourceProfile = migrator.sourceProfileLocations[0];
      location.value = sourceProfile;
      found.value = true;
    } catch (e) {
      found.value = false;
    }
    userVerify.value = false;
  },

  _createMailboxDescriptor(path, name, depth) {
    const importService = Cc[
      "@mozilla.org/import/import-service;1"
    ].createInstance(Ci.nsIImportService);
    const descriptor = importService.CreateNewMailboxDescriptor();
    descriptor.size = 100;
    descriptor.depth = depth;
    descriptor.SetDisplayName(name);
    descriptor.file.initWithPath(path);

    return descriptor;
  },

  _collectMailboxesInDirectory(directory, depth) {
    const result = [];
    let name = directory.leafName;
    if (depth > 0 && !name.endsWith(".msf") && !name.endsWith(".dat")) {
      if (name.endsWith(".sbd")) {
        name = name.slice(0, name.lastIndexOf("."));
      }
      const descriptor = this._createMailboxDescriptor(
        directory.path,
        name,
        depth
      );
      result.push(descriptor);
    }
    if (directory.isDirectory()) {
      for (const entry of directory.directoryEntries) {
        if (
          (depth == 0 &&
            entry.leafName != "ImapMail" &&
            entry.leafName != "Mail") ||
          (depth == 1 && entry.leafName == "Feeds")
        ) {
          continue;
        }
        result.push(...this._collectMailboxesInDirectory(entry, depth + 1));
      }
    }
    return result;
  },

  // Collect mailboxes in a Seamonkey profile.
  findMailboxes(location) {
    return this._collectMailboxesInDirectory(location, 0);
  },

  // Copy mailboxes a Seamonkey profile to Thunderbird profile.
  ImportMailbox(source, dstFolder, errorLog, successLog, fatalError) {
    if (source.file.isFile()) {
      source.file.copyTo(
        dstFolder.filePath.parent,
        dstFolder.filePath.leafName
      );
      successLog.value = `Import ${source.file.leafName} succeeded.\n`;
    }
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
  this.sourceProfileName = null;
  this.sourceProfileLocation = null;
}

SeamonkeyImportSettings.prototype = {
  QueryInterface: ChromeUtils.generateQI(["nsIImportSettings"]),

  AutoLocate(desc, loc) {
    if (!this.sourceProfileName || !this.sourceProfileLocation) {
      try {
        this.sourceProfileName = this.migrator.sourceProfiles[0];
        this.sourceProfileLocation = this.migrator.sourceProfileLocations[0];
      } catch (e) {
        return false;
      }
    }
    loc = this.sourceProfileLocation;
    return true;
  },

  Import() {
    this.migrator.migrate(
      Ci.nsIMailProfileMigrator.SETTINGS,
      null,
      this.sourceProfileName
    );

    // Reload accounts so that `CheckIfLocalFolderExists` in importDialog works
    MailServices.accounts.unloadAccounts();
    MailServices.accounts.loadAccounts();
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
  QueryInterface: ChromeUtils.generateQI(["nsIImportModule"]),

  get name() {
    return seamonkeyImportMsgs.GetStringFromName("SeamonkeyImportName");
  },

  get description() {
    return seamonkeyImportMsgs.GetStringFromName("SeamonkeyImportDescription");
  },

  get supports() {
    return "addressbook,mail,settings";
  },

  get supportsUpgrade() {
    return false;
  },

  GetImportInterface(type) {
    if (type == "addressbook") {
      return new SeamonkeyImportAddressbook();
    } else if (type == "mail") {
      const importService = Cc[
        "@mozilla.org/import/import-service;1"
      ].createInstance(Ci.nsIImportService);
      const genericInterface = importService.CreateNewGenericMail();
      genericInterface.SetData("mailInterface", new SeamonkeyImportMail());
      const name = Cc["@mozilla.org/supports-string;1"].createInstance(
        Ci.nsISupportsString
      );
      name.data = "SeaMonkey";
      genericInterface.SetData("name", name);
      return genericInterface;
    } else if (type == "settings") {
      return new SeamonkeyImportSettings();
    }
    return null;
  },
};
