/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { setTimeout } from "resource://gre/modules/Timer.sys.mjs";

/**
 * An object to represent a source profile to import from.
 *
 * @typedef {object} SourceProfile
 * @property {string} name - The profile name.
 * @property {nsIFile} dir - The profile location.
 *
 * An object to represent items to import.
 * @typedef {object} ImportItems
 * @property {boolean} accounts - Whether to import accounts and settings.
 * @property {boolean} addressBooks - Whether to import address books.
 * @property {boolean} calendars - Whether to import calendars.
 * @property {boolean} mailMessages - Whether to import mail messages.
 */

/**
 * Common interfaces shared by profile importers.
 *
 * @abstract
 */
export class BaseProfileImporter {
  /** @type boolean - Whether to allow importing from a user picked dir. */
  USE_FILE_PICKER = true;

  /** @type ImportItems */
  SUPPORTED_ITEMS = {
    accounts: true,
    addressBooks: true,
    calendars: true,
    mailMessages: true,
  };

  /** When importing from a zip file, ignoring these folders. */
  IGNORE_DIRS = [];

  /**
   * Callback for progress updates.
   *
   * @param {number} current - Current imported items count.
   * @param {number} total - Total items count.
   */
  onProgress = () => {};

  /**
   * @returns {SourceProfile[]} Profiles found on this machine.
   */
  async getSourceProfiles() {
    throw Components.Exception(
      `getSourceProfiles not implemented in ${this.constructor.name}`,
      Cr.NS_ERROR_NOT_IMPLEMENTED
    );
  }

  /**
   * Actually start importing things to the current profile.
   *
   * @param {nsIFile} sourceProfileDir - The source location to import from.
   * @param {ImportItems} items - The items to import.
   * @returns {boolean} Returns true when accounts have been imported, which
   *   means a restart is needed. Otherwise, no restart is needed.
   */
  async startImport() {
    throw Components.Exception(
      `startImport not implemented in ${this.constructor.name}`,
      Cr.NS_ERROR_NOT_IMPLEMENTED
    );
  }

  /**
   * Reset use_without_mail_account, so that imported accounts are correctly
   * rendered in the folderPane.
   */
  _onImportAccounts() {
    Services.prefs.setBoolPref("app.use_without_mail_account", false);
  }

  /**
   * Increase _itemsImportedCount by one, and call onProgress.
   */
  async _updateProgress() {
    this.onProgress(++this._itemsImportedCount, this._itemsTotalCount);
    return new Promise(resolve => setTimeout(resolve));
  }

  _logger = console.createInstance({
    prefix: "mail.import",
    maxLogLevel: "Warn",
    maxLogLevelPref: "mail.import.loglevel",
  });
}
