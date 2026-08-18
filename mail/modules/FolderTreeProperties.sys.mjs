/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Persistent storage for various properties of items on the folder tree.
 * Data is serialised to the file folderTree.json in the profile directory.
 */

import { JSONFile } from "resource://gre/modules/JSONFile.sys.mjs";
import { MailServices } from "resource:///modules/MailServices.sys.mjs";

const jsonFile = new JSONFile({
  path: PathUtils.join(PathUtils.profileDir, "folderTree.json"),
});
const readyPromise = jsonFile.load();

function ensureReady() {
  if (!jsonFile.dataReady) {
    throw new Error("Folder tree properties cache not ready.");
  }
}

/**
 * Re-key the stored color of a folder and its descendants after the folder's
 * URI changed, so they aren't orphaned under the previous URI.
 *
 * @param {string} oldURI
 * @param {string} newURI
 */
function followFolderURIChange(oldURI, newURI) {
  if (!jsonFile.dataReady) {
    // Retried once only; dataReady also goes false at shutdown.
    readyPromise.then(() => {
      if (jsonFile.dataReady) {
        followFolderURIChange(oldURI, newURI);
      }
    }, console.error);
    return;
  }
  // Equal URIs would delete the entry it just wrote.
  if (oldURI == newURI || !jsonFile.data.colors) {
    return;
  }

  const movedURIs = [];
  for (const uri of Object.keys(jsonFile.data.colors)) {
    // The trailing slash keeps a sibling with a longer name out of this.
    if (uri != oldURI && !uri.startsWith(`${oldURI}/`)) {
      continue;
    }
    const movedURI = newURI + uri.substring(oldURI.length);
    jsonFile.data.colors[movedURI] = jsonFile.data.colors[uri];
    delete jsonFile.data.colors[uri];
    movedURIs.push(movedURI);
  }
  if (!movedURIs.length) {
    return;
  }
  jsonFile.saveSoon();

  // Notify without a color so the rows re-read this store. Depending on the
  // folder type they were built before this point, from the old keys.
  for (const movedURI of movedURIs) {
    const folder = MailServices.folderLookup.getFolderForURL(movedURI);
    if (folder) {
      Services.obs.notifyObservers(folder, "folder-color-changed");
    }
  }
}

const folderListener = {
  folderRenamed(oldFolder, newFolder) {
    followFolderURIChange(oldFolder.URI, newFolder.URI);
  },
};

MailServices.mfn.addListener(folderListener, MailServices.mfn.folderRenamed);

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
