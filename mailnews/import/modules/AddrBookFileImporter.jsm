/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["AddrBookFileImporter"];

/**
 * A module to import address book files.
 */
class AddrBookFileImporter {
  /**
   * @param {string} type - Source file type, currently supporting "csv",
   *   "ldif", "vcf" and "mab".
   */
  constructor(type) {
    this._type = type;
  }

  /**
   * Callback for progress updates.
   * @param {number} current - Current imported items count.
   * @param {number} total - Total items count.
   */
  onProgress = () => {};

  _logger = console.createInstance({
    prefix: "mail.import",
    maxLogLevel: "Warn",
    maxLogLevelPref: "mail.import.loglevel",
  });

  /**
   * Actually start importing records into a directory.
   * @param {nsIFile} sourceFile - The source file to import from.
   * @param {nsIAbDirectory} targetDirectory - The directory to import into.
   */
  async startImport(sourceFile, targetDirectory) {
    this._logger.debug(
      `Importing ${this._type} file from ${sourceFile.path} into ${targetDirectory.dirName}`
    );
    this._sourceFile = sourceFile;
    this._targetDirectory = targetDirectory;

    this.onProgress(2, 10);
    switch (this._type) {
      case "mab":
        await this._importMabFile();
        break;
      default:
        throw Components.Exception(
          `Importing ${this._type} file is not supported`,
          Cr.NS_ERROR_NOT_IMPLEMENTED
        );
    }
    this.onProgress(10, 10);
  }

  /**
   * Import the .mab source file into the target directory.
   */
  async _importMabFile() {
    let importMab = Cc[
      "@mozilla.org/import/import-ab-file;1?type=mab"
    ].createInstance(Ci.nsIImportABFile);
    importMab.readFileToDirectory(this._sourceFile, this._targetDirectory);
  }
}
