/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

this.EXPORTED_SYMBOLS = ["AddrBookFactory"];

ChromeUtils.defineModuleGetter(
  this,
  "FileUtils",
  "resource://gre/modules/FileUtils.jsm"
);
ChromeUtils.defineModuleGetter(
  this,
  "MailServices",
  "resource:///modules/MailServices.jsm"
);
ChromeUtils.defineModuleGetter(
  this,
  "closeConnectionTo",
  "resource:///modules/AddrBookDirectory.jsm"
);

/**
 * Address book factory. This looks like it should be a useful for keeping
 * reference to all JS directories, but in reality it's not used for most
 * methods of accessing a directory, and nsAbManager has a cache anyway.
 *
 * @implements {nsIAbDirFactory}
 */
function AddrBookFactory() {}
AddrBookFactory.prototype = {
  QueryInterface: ChromeUtils.generateQI([Ci.nsIAbDirFactory]),
  classID: Components.ID("{567c1f22-bae5-4bc9-9951-885678dc14a5}"),

  /* nsIAbDirFactory */

  getDirectories(dirName, uri, prefName) {
    let directory = MailServices.ab.getDirectory(uri);
    directory.dirPrefId = prefName;

    return {
      _position: 0,
      hasMoreElements() {
        return this._position == 0;
      },
      getNext() {
        if (this.hasMoreElements()) {
          this._position++;
          return directory;
        }
        throw Cr.NS_ERROR_NOT_AVAILABLE;
      },
      QueryInterface: ChromeUtils.generateQI([Ci.nsISimpleEnumerator]),
      *[Symbol.iterator]() {
        while (this.hasMoreElements()) {
          yield this.getNext();
        }
      },
    };
  },
  async deleteDirectory(directory) {
    let file = FileUtils.getFile("ProfD", [directory.fileName]);
    if (file.exists()) {
      await closeConnectionTo(file);
      file.remove(false);
    }
  },
};
