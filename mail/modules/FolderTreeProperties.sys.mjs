/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Persistent storage for various properties of items on the folder tree.
 * Data is serialised to the file folderTree.json in the profile directory.
 */

import { JSONFile } from "resource://gre/modules/JSONFile.sys.mjs";

const jsonFile = new JSONFile({
  path: PathUtils.join(PathUtils.profileDir, "folderTree.json"),
});
const readyPromise = jsonFile.load();

function ensureReady() {
  if (!jsonFile.dataReady) {
    throw new Error("Folder tree properties cache not ready.");
  }
}

export const FolderTreeProperties = {
  get ready() {
    return readyPromise;
  },

  /**
   * Get the colour associated with a folder.
   *
   * @param {string} folderURI
   * @returns {?string}
   */
  getColor(folderURI) {
    ensureReady();
    return jsonFile.data.colors?.[folderURI];
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

  resetColors() {
    ensureReady();
    delete jsonFile.data.colors;
    jsonFile.saveSoon();
  },

  getIsExpanded(folderURI, mode) {
    ensureReady();
    if (!Array.isArray(jsonFile.data.open?.[mode])) {
      return false;
    }
    return jsonFile.data.open[mode].includes(folderURI);
  },

  setIsExpanded(folderURI, mode, isExpanded) {
    ensureReady();
    jsonFile.data.open = jsonFile.data.open ?? {};
    jsonFile.data.open[mode] = jsonFile.data.open[mode] ?? [];
    const index = jsonFile.data.open[mode].indexOf(folderURI);
    if (isExpanded) {
      if (index < 0) {
        jsonFile.data.open[mode].push(folderURI);
      }
    } else if (index >= 0) {
      jsonFile.data.open[mode].splice(index, 1);
    }
    jsonFile.saveSoon();
  },
};
