/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["ProfileExporter"];

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  Services: "resource://gre/modules/Services.jsm",
  setTimeout: "resource://gre/modules/Timer.jsm",
});

// No need to backup those paths, they are not used when importing.
const IGNORE_PATHS = [
  "cache2",
  "chrome_debugger_profile",
  "crashes",
  "datareporting",
  "extensions",
  "extension-store",
  "logs",
  "lock",
  "minidumps",
  "parent.lock",
  "shader-cache",
  "saved-telemetry-pings",
  "security_state",
  "storage",
  "xulstore",
];

/**
 * A module to export the current profile to a zip file.
 */
class ProfileExporter {
  _logger = console.createInstance({
    prefix: "mail.export",
    maxLogLevel: "Warn",
    maxLogLevelPref: "mail.export.loglevel",
  });

  /**
   * Callback for progress updates.
   * @param {number} current - Current imported items count.
   * @param {number} total - Total items count.
   */
  onProgress = () => {};

  /**
   * Export the current profile to the specified target zip file.
   * @param {nsIFile} targetFile - A target zip file to write to.
   */
  async startExport(targetFile) {
    let zipW = Components.Constructor(
      "@mozilla.org/zipwriter;1",
      "nsIZipWriter"
    )();
    // MODE_WRONLY (0x02) and MODE_CREATE (0x08)
    zipW.open(targetFile, 0x02 | 0x08);
    let profileDir = Services.dirsvc.get("ProfD", Ci.nsIFile);
    let rootPathCount = PathUtils.split(profileDir.parent.path).length;
    let zipEntryMap = new Map();
    await this._collectFilesToZip(zipEntryMap, rootPathCount, profileDir);

    let totalEntries = zipEntryMap.size;
    let i = 0;
    for (let [path, file] of zipEntryMap) {
      this._logger.debug("Adding entry file:", path);
      zipW.addEntryFile(
        path,
        0, // no compression, bigger file but much faster
        file,
        false
      );
      if (++i % 10 === 0) {
        this.onProgress(i, totalEntries);
        await new Promise(resolve => setTimeout(resolve));
      }
    }
    this.onProgress(totalEntries, totalEntries);
    zipW.close();
  }

  /**
   * Recursively collect files to be zipped, save the entries into zipEntryMap.
   * @param {Map<string, nsIFile>} zipEntryMap - Collection of files to be zipped.
   * @param {number} rootPathCount - The count of rootPath parts.
   * @param {nsIFile} folder - The folder to search for files to zip.
   */
  async _collectFilesToZip(zipEntryMap, rootPathCount, folder) {
    for (let file of folder.directoryEntries) {
      if (file.isDirectory()) {
        await this._collectFilesToZip(zipEntryMap, rootPathCount, file);
      } else {
        // We don't want to include the rootPath part in the zip file.
        let parts = PathUtils.split(file.path).slice(rootPathCount);
        // Parts look like this: ["profile-default", "lock"].
        if (IGNORE_PATHS.includes(parts[1])) {
          continue;
        }
        // Path separator inside a zip file is always "/".
        zipEntryMap.set(parts.join("/"), file);
      }
    }
  }
}
