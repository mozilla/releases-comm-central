/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Persistent storage for various properties of items on the folder tree.
 * Data is serialised to the file folderTree.json in the profile directory.
 */

const EXPORTED_SYMBOLS = ["FolderTreeProperties"];

const { JSONFile } = ChromeUtils.import("resource://gre/modules/JSONFile.jsm");

var jsonFile = new JSONFile({
  path: PathUtils.join(PathUtils.profileDir, "folderTree.json"),
});
jsonFile.load();

function ensureReady() {
  if (!jsonFile.dataReady) {
    throw new Error("Folder tree properties cache not ready.");
  }
}

var FolderTreeProperties = {
  /**
   * Get the colour associated with a folder.
   *
   * @param {string} folderURI
   * @returns {?string}
   */
  getColor(folderURI) {
    ensureReady();
    jsonFile.data.colors = jsonFile.data.colors ?? {};
    return jsonFile.data.colors[folderURI];
  },

  /**
   * Set the colour associated with a folder.
   *
   * @param {string} folderURI
   * @param {string} color
   */
  setColor(folderURI, color) {
    ensureReady();
    jsonFile.data.colors = jsonFile.data.colors ?? {};
    jsonFile.data.colors[folderURI] = color;
    jsonFile.saveSoon();
  },
};
