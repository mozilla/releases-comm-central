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
  /** @type {boolean} - Whether to allow importing from a user picked dir. */
  USE_FILE_PICKER = true;

  /** @type {ImportItems} */
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
   * @param {number} _current - Current imported items count.
   * @param {number} _total - Total items count.
   */
  onProgress = (_current, _total) => {};

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
   * Test `sourceProfileDir` for required files and prevent progress if they
   * are not present. Override this in subclasses.
   *
   * @param {nsIFile} _sourceProfileDir - A directory or file (likely but not
   *   necessarily a zip file) to be imported.
   * @returns {boolean} False if importing this source should not continue.
   */
  validateSource(_sourceProfileDir) {
    return true;
  }

  /**
   * Test a zip file for required files.
   *
   * @param {nsIZipReader} _zipReader - A reader already opened on the file
   *   to be imported.
   * @param {string} [_prefix=""] - A prefix to apply to all paths being checked.
   * @returns {boolean} False if importing this source should not continue.
   */
  validateZipSource(_zipReader, _prefix = "") {
    return true;
  }

  /**
   * @callback ProgressCallback
   * @param {number} progress - A value between 0 and 1.
   */
  /**
   * Extract a zip file to a temporary directory.
   *
   * @param {nsIFile} sourceFile
   * @param {ProgressCallback} progressCallback
   * @returns {nsIFile}
   */
  async extractZipFile(sourceFile, progressCallback) {
    // Extract the zip file to a tmp dir.
    const targetDir = Services.dirsvc.get("TmpD", Ci.nsIFile);
    targetDir.append("tmp-profile");
    targetDir.createUnique(Ci.nsIFile.DIRECTORY_TYPE, 0o755);

    const zipReader = Cc["@mozilla.org/libjar/zip-reader;1"].createInstance(
      Ci.nsIZipReader
    );
    zipReader.open(sourceFile);

    // The profile data could be at the top level, or inside a lone folder at
    // the top level. Find out which.
    let depth = 0;
    const entries = [...zipReader.findEntries(null)];
    const rootEntries = entries.filter(e => e.match(/^[^\/]*\/?$/));
    if (
      entries.length > 1 &&
      rootEntries.length == 1 &&
      rootEntries[0].endsWith("/") &&
      this.validateZipSource(zipReader, rootEntries[0])
    ) {
      this._logger.debug(`Found an inner directory ${rootEntries[0]}`);
      depth = 1;
    }

    let extractedFileCount = 0;
    for (const entry of entries) {
      extractedFileCount++;
      const parts = entry.split("/").slice(depth);
      if (
        parts.length == 0 ||
        this.IGNORE_DIRS.includes(parts[0]) ||
        entry.endsWith("/")
      ) {
        this._logger.debug(`Skipping ${entry}`);
        continue;
      }
      // Folders can not be unzipped recursively, have to iterate and
      // extract all file entries one by one.
      const target = targetDir.clone();
      for (const part of parts) {
        // Drop the root folder name in the zip file.
        target.append(part);
      }
      if (!target.parent.exists()) {
        target.parent.create(Ci.nsIFile.DIRECTORY_TYPE, 0o755);
      }
      try {
        this._logger.debug(`Extracting ${entry} to ${target.path}`);
        zipReader.extract(entry, target);
        // Update the progress callback, and yield the main thread to avoid jank.
        if (extractedFileCount % 10 == 0) {
          const progress = Math.min(extractedFileCount / entries.length, 1);
          progressCallback(progress);
          await new Promise(resolve => setTimeout(resolve));
        }
      } catch (e) {
        this._logger.error(e);
      }
    }
    progressCallback(1);
    return targetDir;
  }

  /**
   * Actually start importing things to the current profile.
   *
   * @param {nsIFile} _sourceProfileDir - The source location to import from.
   * @param {ImportItems} _items - The items to import.
   * @returns {boolean} Returns true when accounts have been imported, which
   *   means a restart is needed. Otherwise, no restart is needed.
   */
  async startImport(_sourceProfileDir, _items) {
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
