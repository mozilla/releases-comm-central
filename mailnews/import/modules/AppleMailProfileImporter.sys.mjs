/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { BaseProfileImporter } from "resource:///modules/BaseProfileImporter.sys.mjs";

import { setTimeout } from "resource://gre/modules/Timer.sys.mjs";

/**
 * A module to import things from an apple mail profile dir into the current
 * profile.
 */
export class AppleMailProfileImporter extends BaseProfileImporter {
  USE_FILE_PICKER = true;

  SUPPORTED_ITEMS = {
    accounts: false,
    addressBooks: false,
    calendars: false,
    mailMessages: true,
  };

  async getSourceProfiles() {
    this._importModule = Cc[
      "@mozilla.org/import/import-applemail;1"
    ].createInstance(Ci.nsIImportModule);
    this._importMailGeneric = this._importModule
      .GetImportInterface("mail")
      .QueryInterface(Ci.nsIImportGeneric);
    const importMail = this._importMailGeneric
      .GetData("mailInterface")
      .QueryInterface(Ci.nsIImportMail);
    const outLocation = {};
    const outFound = {};
    const outUserVerify = {};
    importMail.GetDefaultLocation(outLocation, outFound, outUserVerify);
    if (outLocation.value) {
      return [{ dir: outLocation.value }];
    }
    return [];
  }

  async startImport(sourceProfileDir, items) {
    this._logger.debug(
      `Start importing from ${sourceProfileDir.path}, items=${JSON.stringify(
        items
      )}`
    );
    this._itemsTotalCount = Object.values(items).filter(Boolean).length;
    this._itemsImportedCount = 0;

    const successStr = Cc["@mozilla.org/supports-string;1"].createInstance(
      Ci.nsISupportsString
    );
    const errorStr = Cc["@mozilla.org/supports-string;1"].createInstance(
      Ci.nsISupportsString
    );

    if (items.mailMessages) {
      // @see nsIImportGeneric.
      this._importMailGeneric.SetData("mailLocation", sourceProfileDir);
      const wantsProgress = this._importMailGeneric.WantsProgress();
      this._importMailGeneric.BeginImport(successStr, errorStr);
      if (wantsProgress) {
        while (this._importMailGeneric.GetProgress() < 100) {
          this._logger.debug(
            "Import mail messages progress:",
            this._importMailGeneric.GetProgress()
          );
          await new Promise(resolve => setTimeout(resolve, 50));
          this._importMailGeneric.ContinueImport();
        }
      }
      if (successStr.data) {
        this._logger.debug(
          "Finished importing mail messages:",
          successStr.data
        );
      }
      if (errorStr.data) {
        this._logger.error("Failed to import mail messages:", errorStr.data);
        throw new Error(errorStr.data);
      }
      await this._updateProgress();
    }
  }
}
