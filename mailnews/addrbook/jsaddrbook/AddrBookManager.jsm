/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["AddrBookManager"];

ChromeUtils.defineModuleGetter(
  this,
  "AppConstants",
  "resource://gre/modules/AppConstants.jsm"
);
ChromeUtils.defineModuleGetter(
  this,
  "closeConnectionTo",
  "resource:///modules/AddrBookDirectory.jsm"
);
ChromeUtils.defineModuleGetter(
  this,
  "Services",
  "resource://gre/modules/Services.jsm"
);
ChromeUtils.defineModuleGetter(
  this,
  "SimpleEnumerator",
  "resource:///modules/AddrBookUtils.jsm"
);

/** Directory type constants, as defined in nsDirPrefs.h. */
const LDAP_DIRECTORY_TYPE = 0;
const MAPI_DIRECTORY_TYPE = 3;
const JS_DIRECTORY_TYPE = 101;

/** Test for valid directory URIs. */
const URI_REGEXP = /^([\w-]+):\/\/([\w\.-]*)([?/:].*|$)/;

/**
 * All registered nsIAbListener objects. Keys to this map are the listeners
 * themselves; values are a bitmap of events to notify. See nsIAbListener.idl.
 */
let listeners = new Map();

/**
 * When initialized, a map of nsIAbDirectory objects. Keys to this map are
 * the directories' URIs.
 */
let store = null;

/** Valid address book types. This differs by operating system. */
let types = ["jsaddrbook", "moz-abldapdirectory"];
if (AppConstants.platform == "macosx") {
  types.push("moz-abosxdirectory");
} else if (AppConstants.platform == "win") {
  types.push("moz-aboutlookdirectory");
}

/**
 * Initialise an address book directory by URI.
 *
 * @param {string} uri - URI for the directory.
 * @param {boolean} shouldStore - Whether to keep a reference to this address
 *   book in the store.
 * @returns {nsIAbDirectory}
 */
function createDirectoryObject(uri, shouldStore = false) {
  let uriParts = URI_REGEXP.exec(uri);
  if (!uriParts) {
    throw Cr.NS_ERROR_UNEXPECTED;
  }

  let [, scheme] = uriParts;
  let dir = Cc[
    `@mozilla.org/addressbook/directory;1?type=${scheme}`
  ].createInstance(Ci.nsIAbDirectory);
  if (shouldStore) {
    store.set(uri, dir);
  }
  dir.init(uri);
  return dir;
}

/**
 * Read the preferences and create any address books defined there.
 */
function ensureInitialized() {
  if (store !== null) {
    return;
  }

  store = new Map();

  for (let pref of Services.prefs.getChildList("ldap_2.servers.")) {
    if (pref.endsWith(".dirType")) {
      let prefName = pref.substring(0, pref.length - 8);
      let dirType = Services.prefs.getIntPref(pref);
      let fileName = Services.prefs.getStringPref(`${prefName}.filename`, "");
      if (dirType == JS_DIRECTORY_TYPE && fileName) {
        let uri = `jsaddrbook://${fileName}`;
        createDirectoryObject(uri, true);
      }
    }
  }
}

Services.obs.addObserver(() => {
  // Clear the store. The next call to ensureInitialized will recreate it.
  store = null;
}, "addrbook-reload");

/** @implements nsIAbManager */
function AddrBookManager() {}
AddrBookManager.prototype = {
  QueryInterface: ChromeUtils.generateQI([Ci.nsIAbManager]),
  classID: Components.ID("{224d3ef9-d81c-4d94-8826-a79a5835af93}"),

  get directories() {
    ensureInitialized();
    let dirs = [...store.values()];
    dirs.sort((a, b) => {
      let aPosition = a.getIntValue("position", 0);
      let bPosition = b.getIntValue("position", 0);
      if (aPosition != bPosition) {
        return aPosition - bPosition;
      }
      return a.URI < b.URI ? -1 : 1;
    });
    return new SimpleEnumerator(dirs);
  },
  getDirectory(uri) {
    if (uri.startsWith("moz-abdirectory://")) {
      return null;
    }

    ensureInitialized();
    if (store.has(uri)) {
      return store.get(uri);
    }

    let uriParts = URI_REGEXP.exec(uri);
    if (!uriParts) {
      throw Cr.NS_ERROR_UNEXPECTED;
    }
    let [, , , tail] = uriParts;
    if (tail) {
      // `tail` could either point to a mailing list or a query.
      // Both of these will be handled differently in future.
      return createDirectoryObject(uri);
    }
    return null;
  },
  getDirectoryFromId(dirPrefId) {
    ensureInitialized();
    for (let dir of store.values()) {
      if (dir.dirPrefId == dirPrefId) {
        return dir;
      }
    }
    return null;
  },
  newAddressBook(dirName, uri, type, prefName) {
    function ensureUniquePrefName() {
      let leafName = dirName.replace(/\W/g, "");
      if (!leafName) {
        leafName = "_nonascii";
      }

      let existingNames = Array.from(store.values(), dir => dir.dirPrefId);
      let uniqueCount = 0;
      prefName = `ldap_2.servers.${leafName}`;
      while (existingNames.includes(prefName)) {
        prefName = `ldap_2.servers.${leafName}_${++uniqueCount}`;
      }
    }

    if (!dirName) {
      throw Cr.NS_ERROR_UNEXPECTED;
    }

    ensureInitialized();

    let file = Services.dirsvc.get("ProfD", Ci.nsIFile);
    file.append("abook.sqlite");
    file.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, 0o644);
    file.remove(false);
    uri = `jsaddrbook://${file.leafName}`;

    ensureUniquePrefName();
    Services.prefs.setStringPref(`${prefName}.description`, dirName);
    Services.prefs.setIntPref(`${prefName}.dirType`, type);
    Services.prefs.setStringPref(`${prefName}.filename`, file.leafName);
    Services.prefs.setStringPref(`${prefName}.uri`, uri);

    uri = `jsaddrbook://${file.leafName}`;
    let dir = createDirectoryObject(uri, true);
    this.notifyDirectoryItemAdded(null, dir);
    return prefName;
  },
  deleteAddressBook(uri) {
    let uriParts = URI_REGEXP.exec(uri);
    if (!uriParts) {
      throw Cr.NS_ERROR_UNEXPECTED;
    }

    let [, scheme, fileName, tail] = uriParts;
    if (tail) {
      if (tail.startsWith("/MailList")) {
        let dir = store.get(`${scheme}://${fileName}`);
        let list = this.getDirectory(uri);
        if (dir && list) {
          dir.deleteDirectory(list);
          return;
        }
      }
      throw Cr.NS_ERROR_UNEXPECTED;
    }

    let dir = this.getDirectory(uri);
    if (!dir) {
      return;
    }

    let prefName = dir.dirPrefId;
    fileName = dir.fileName;

    Services.prefs.clearUserPref(`${prefName}.description`);
    Services.prefs.clearUserPref(`${prefName}.dirType`);
    Services.prefs.clearUserPref(`${prefName}.filename`);
    Services.prefs.clearUserPref(`${prefName}.uid`);
    Services.prefs.clearUserPref(`${prefName}.uri`);
    store.delete(`jsaddrbook://${fileName}`);

    let file = Services.dirsvc.get("ProfD", Ci.nsIFile);
    file.append(fileName);
    closeConnectionTo(file).then(() => {
      if (file.exists()) {
        file.remove(false);
      }
      this.notifyDirectoryDeleted(null, dir);
    });
  },
  exportAddressBook(parentWin, directory) {
    throw Cr.NS_ERROR_NOT_IMPLEMENTED;
  },
  addAddressBookListener(listener, notifyFlags) {
    listeners.set(listener, notifyFlags);
  },
  removeAddressBookListener(listener) {
    listeners.delete(listener);
  },
  notifyItemPropertyChanged(item, property, oldValue, newValue) {
    for (let [listener, notifyFlags] of listeners.entries()) {
      if (notifyFlags & Ci.nsIAbListener.itemChanged) {
        try {
          listener.onItemPropertyChanged(item, property, oldValue, newValue);
        } catch (ex) {
          Cu.reportError(ex);
        }
      }
    }
  },
  notifyDirectoryItemAdded(parentDirectory, item) {
    for (let [listener, notifyFlags] of listeners.entries()) {
      if (notifyFlags & Ci.nsIAbListener.itemAdded) {
        try {
          listener.onItemAdded(parentDirectory, item);
        } catch (ex) {
          Cu.reportError(ex);
        }
      }
    }
  },
  notifyDirectoryItemDeleted(parentDirectory, item) {
    for (let [listener, notifyFlags] of listeners.entries()) {
      if (notifyFlags & Ci.nsIAbListener.directoryItemRemoved) {
        try {
          listener.onItemRemoved(parentDirectory, item);
        } catch (ex) {
          Cu.reportError(ex);
        }
      }
    }
  },
  notifyDirectoryDeleted(parentDirectory, directory) {
    for (let [listener, notifyFlags] of listeners.entries()) {
      if (notifyFlags & Ci.nsIAbListener.directoryRemoved) {
        try {
          listener.onItemRemoved(parentDirectory, directory);
        } catch (ex) {
          Cu.reportError(ex);
        }
      }
    }
  },
  mailListNameExists(name) {
    ensureInitialized();
    for (let dir of store.values()) {
      if (dir.hasMailListWithName(name)) {
        return true;
      }
    }
    return false;
  },
  escapedVCardToAbCard(escapedVCardStr) {
    throw Cr.NS_ERROR_NOT_IMPLEMENTED;
  },
  generateUUID(directoryId, localId) {
    return `${directoryId}#${localId}`;
  },
};
