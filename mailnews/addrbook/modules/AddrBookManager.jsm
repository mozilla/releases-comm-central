/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["AddrBookManager"];

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  AppConstants: "resource://gre/modules/AppConstants.jsm",
  clearTimeout: "resource://gre/modules/Timer.jsm",
  compareAddressBooks: "resource:///modules/AddrBookUtils.jsm",
  Services: "resource://gre/modules/Services.jsm",
  setTimeout: "resource://gre/modules/Timer.jsm",
});
XPCOMUtils.defineLazyServiceGetter(
  this,
  "env",
  "@mozilla.org/process/environment;1",
  "nsIEnvironment"
);

/** Test for valid directory URIs. */
const URI_REGEXP = /^([\w-]+):\/\/([\w\.-]*)([/:].*|$)/;

/**
 * When initialized, a map of nsIAbDirectory objects. Keys to this map are
 * the directories' URIs.
 */
let store = null;

/** Valid address book types. This differs by operating system. */
let types = ["jsaddrbook", "jscarddav", "moz-abldapdirectory"];
if (AppConstants.platform == "macosx") {
  types.push("moz-abosxdirectory");
} else if (AppConstants.platform == "win") {
  types.push("moz-aboutlookdirectory");
}

/**
 * A pre-sorted list of directories in the right order, to be returned by
 * AddrBookManager.directories. That function is called a lot, and there's
 * no need to sort the list every time.
 *
 * Call updateSortedDirectoryList after `store` changes and before any
 * notifications happen.
 */
let sortedDirectoryList = [];
function updateSortedDirectoryList() {
  sortedDirectoryList = [...store.values()];
  sortedDirectoryList.sort(compareAddressBooks);
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
    throw Components.Exception(
      `Unexpected uri: ${uri}`,
      Cr.NS_ERROR_MALFORMED_URI
    );
  }

  let [, scheme] = uriParts;
  let dir = Cc[
    `@mozilla.org/addressbook/directory;1?type=${scheme}`
  ].createInstance(Ci.nsIAbDirectory);

  try {
    if (shouldStore) {
      // This must happen before .init is called, or the OS X provider breaks
      // in some circumstances. If .init fails, we'll remove it again.
      // The Outlook provider also needs this since during the initialisation
      // of the top-most directory, contained mailing lists already need
      // to loop that directory.
      store.set(uri, dir);
    }
    dir.init(uri);
  } catch (ex) {
    if (shouldStore) {
      store.delete(uri);
    }
    throw ex;
  }

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
    try {
      if (pref.endsWith(".uri")) {
        let uri = Services.prefs.getStringPref(pref);
        if (uri.startsWith("ldap://") || uri.startsWith("ldaps://")) {
          let prefName = pref.substring(0, pref.length - 4);

          uri = `moz-abldapdirectory://${prefName}`;
          createDirectoryObject(uri, true);
        }
      } else if (pref.endsWith(".dirType")) {
        let prefName = pref.substring(0, pref.length - 8);
        let dirType = Services.prefs.getIntPref(pref);
        let fileName = Services.prefs.getStringPref(`${prefName}.filename`, "");
        let uri = Services.prefs.getStringPref(`${prefName}.uri`, "");

        switch (dirType) {
          case Ci.nsIAbManager.MAPI_DIRECTORY_TYPE:
            if (env.exists("MOZ_AUTOMATION")) {
              break;
            }
            if (Services.prefs.getIntPref(`${prefName}.position`, 1) < 1) {
              // Migration: the previous address book manager set the position
              // value to 0 to indicate the removal of an address book.
              Services.prefs.clearUserPref(`${prefName}.position`);
              Services.prefs.setIntPref(pref, -1);
              break;
            }
            if (AppConstants.platform == "macosx") {
              createDirectoryObject(uri, true);
            } else if (AppConstants.platform == "win") {
              let outlookInterface = Cc[
                "@mozilla.org/addressbook/outlookinterface;1"
              ].getService(Ci.nsIAbOutlookInterface);
              for (let folderURI of outlookInterface.getFolderURIs(uri)) {
                createDirectoryObject(folderURI, true);
              }
            }
            break;
          case Ci.nsIAbManager.JS_DIRECTORY_TYPE:
            if (fileName) {
              let uri = `jsaddrbook://${fileName}`;
              createDirectoryObject(uri, true);
            }
            break;
          case Ci.nsIAbManager.CARDDAV_DIRECTORY_TYPE:
            if (fileName) {
              let uri = `jscarddav://${fileName}`;
              createDirectoryObject(uri, true);
            }
            break;
        }
      }
    } catch (ex) {
      Cu.reportError(ex);
    }
  }

  updateSortedDirectoryList();
}

// Force the manager to shut down. For tests only.
Services.obs.addObserver(async () => {
  // Allow directories to tidy up.
  for (let directory of store.values()) {
    await directory.cleanUp();
  }
  // Clear the store. The next call to ensureInitialized will recreate it.
  store = null;
  Services.obs.notifyObservers(null, "addrbook-reloaded");
}, "addrbook-reload");

/** Cache for the cardForEmailAddress function, and timer to clear it. */
let addressCache = new Map();
let addressCacheTimer = null;

/**
 * @implements nsIAbManager
 * @implements nsICommandLineHandler
 */
function AddrBookManager() {}
AddrBookManager.prototype = {
  QueryInterface: ChromeUtils.generateQI([
    "nsIAbManager",
    "nsICommandLineHandler",
  ]),
  classID: Components.ID("{224d3ef9-d81c-4d94-8826-a79a5835af93}"),

  /* nsIAbManager */

  get directories() {
    ensureInitialized();
    return sortedDirectoryList.slice();
  },
  getDirectory(uri) {
    if (uri.startsWith("moz-abdirectory://")) {
      throw new Components.Exception(
        "The root address book no longer exists",
        Cr.NS_ERROR_FAILURE
      );
    }

    ensureInitialized();
    if (store.has(uri)) {
      return store.get(uri);
    }

    let uriParts = URI_REGEXP.exec(uri);
    if (!uriParts) {
      throw Components.Exception(
        `Unexpected uri: ${uri}`,
        Cr.NS_ERROR_MALFORMED_URI
      );
    }
    let [, scheme, fileName, tail] = uriParts;
    if (tail && types.includes(scheme)) {
      if (
        (scheme == "jsaddrbook" && tail.startsWith("/")) ||
        scheme == "moz-aboutlookdirectory"
      ) {
        let parent;
        if (scheme == "jsaddrbook") {
          parent = this.getDirectory(`${scheme}://${fileName}`);
        } else {
          parent = this.getDirectory(`${scheme}:///${tail.split("/")[1]}`);
        }
        for (let list of parent.childNodes) {
          list.QueryInterface(Ci.nsIAbDirectory);
          if (list.URI == uri) {
            return list;
          }
        }
        throw Components.Exception(
          `No ${scheme} directory for uri=${uri}`,
          Cr.NS_ERROR_UNEXPECTED
        );
      } else if (scheme == "jscarddav") {
        throw Components.Exception(
          `No ${scheme} directory for uri=${uri}`,
          Cr.NS_ERROR_UNEXPECTED
        );
      }
      // `tail` could point to a mailing list.
      return createDirectoryObject(uri);
    }
    throw Components.Exception(
      `No directory for uri=${uri}`,
      Cr.NS_ERROR_FAILURE
    );
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
  getDirectoryFromUID(uid) {
    ensureInitialized();
    for (let dir of store.values()) {
      if (dir.UID == uid) {
        return dir;
      }
    }
    return null;
  },
  getMailListFromName(name) {
    ensureInitialized();
    for (let dir of store.values()) {
      let hit = dir.getMailListFromName(name);
      if (hit) {
        return hit;
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
      throw new Components.Exception(
        "dirName must be specified",
        Cr.NS_ERROR_INVALID_ARG
      );
    }

    ensureInitialized();

    switch (type) {
      case Ci.nsIAbManager.LDAP_DIRECTORY_TYPE: {
        let file = Services.dirsvc.get("ProfD", Ci.nsIFile);
        file.append("ldap.sqlite");
        file.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, 0o644);

        ensureUniquePrefName();
        Services.prefs.setStringPref(`${prefName}.description`, dirName);
        Services.prefs.setStringPref(`${prefName}.filename`, file.leafName);
        Services.prefs.setStringPref(`${prefName}.uri`, uri);

        uri = `moz-abldapdirectory://${prefName}`;
        let dir = createDirectoryObject(uri, true);
        updateSortedDirectoryList();
        Services.obs.notifyObservers(dir, "addrbook-directory-created");
        break;
      }
      case Ci.nsIAbManager.MAPI_DIRECTORY_TYPE: {
        if (AppConstants.platform == "macosx") {
          uri = "moz-abosxdirectory:///";
          if (store.has(uri)) {
            throw Components.Exception(
              `Can't create new ab of type=${type} - already exists`,
              Cr.NS_ERROR_UNEXPECTED
            );
          }
          prefName = "ldap_2.servers.osx";
        } else if (AppConstants.platform == "win") {
          uri = "moz-aboutlookdirectory:///";
          if (store.has(uri)) {
            throw Components.Exception(
              `Can't create new ab of type=${type} - already exists`,
              Cr.NS_ERROR_UNEXPECTED
            );
          }
          prefName = "ldap_2.servers.outlook";
        } else {
          throw Components.Exception(
            "Can't create new ab of type=MAPI_DIRECTORY_TYPE",
            Cr.NS_ERROR_UNEXPECTED
          );
        }

        Services.prefs.setIntPref(
          `${prefName}.dirType`,
          Ci.nsIAbManager.MAPI_DIRECTORY_TYPE
        );
        Services.prefs.setStringPref(
          `${prefName}.description`,
          "chrome://messenger/locale/addressbook/addressBook.properties"
        );
        Services.prefs.setStringPref(`${prefName}.uri`, uri);

        if (AppConstants.platform == "macosx") {
          let dir = createDirectoryObject(uri, true);
          updateSortedDirectoryList();
          Services.obs.notifyObservers(dir, "addrbook-directory-created");
        } else if (AppConstants.platform == "win") {
          let outlookInterface = Cc[
            "@mozilla.org/addressbook/outlookinterface;1"
          ].getService(Ci.nsIAbOutlookInterface);
          for (let folderURI of outlookInterface.getFolderURIs(uri)) {
            let dir = createDirectoryObject(folderURI, true);
            updateSortedDirectoryList();
            Services.obs.notifyObservers(dir, "addrbook-directory-created");
          }
        }
        break;
      }
      case Ci.nsIAbManager.JS_DIRECTORY_TYPE:
      case Ci.nsIAbManager.CARDDAV_DIRECTORY_TYPE: {
        let file = Services.dirsvc.get("ProfD", Ci.nsIFile);
        file.append("abook.sqlite");
        file.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, 0o644);

        ensureUniquePrefName();
        Services.prefs.setStringPref(`${prefName}.description`, dirName);
        Services.prefs.setIntPref(`${prefName}.dirType`, type);
        Services.prefs.setStringPref(`${prefName}.filename`, file.leafName);

        let scheme =
          type == Ci.nsIAbManager.JS_DIRECTORY_TYPE
            ? "jsaddrbook"
            : "jscarddav";
        uri = `${scheme}://${file.leafName}`;
        let dir = createDirectoryObject(uri, true);
        updateSortedDirectoryList();
        Services.obs.notifyObservers(dir, "addrbook-directory-created");
        break;
      }
      default:
        throw Components.Exception(
          `Unexpected directory type: ${type}`,
          Cr.NS_ERROR_UNEXPECTED
        );
    }

    return prefName;
  },
  addAddressBook(dir) {
    if (
      !dir.URI ||
      !dir.dirName ||
      !dir.UID ||
      dir.isMailList ||
      dir.isQuery ||
      dir.dirPrefId
    ) {
      throw new Components.Exception(
        "Invalid directory",
        Cr.NS_ERROR_INVALID_ARG
      );
    }

    ensureInitialized();
    if (store.has(dir.URI)) {
      throw new Components.Exception(
        "Directory already exists",
        Cr.NS_ERROR_UNEXPECTED
      );
    }

    store.set(dir.URI, dir);
    updateSortedDirectoryList();
    Services.obs.notifyObservers(dir, "addrbook-directory-created");
  },
  deleteAddressBook(uri) {
    let uriParts = URI_REGEXP.exec(uri);
    if (!uriParts) {
      throw Components.Exception("", Cr.NS_ERROR_MALFORMED_URI);
    }

    let [, scheme, fileName, tail] = uriParts;
    if (tail && tail.startsWith("/")) {
      let dir;
      if (scheme == "jsaddrbook") {
        dir = store.get(`${scheme}://${fileName}`);
      } else if (scheme == "moz-aboutlookdirectory") {
        dir = store.get(`${scheme}:///${tail.split("/")[1]}`);
      }
      let list = this.getDirectory(uri);
      if (dir && list) {
        dir.deleteDirectory(list);
        return;
      }
    }

    let dir = store.get(uri);
    if (!dir) {
      throw new Components.Exception(
        `Address book not found: ${uri}`,
        Cr.NS_ERROR_UNEXPECTED
      );
    }

    let prefName = dir.dirPrefId;
    if (prefName) {
      let dirType = Services.prefs.getIntPref(`${prefName}.dirType`, 0);
      fileName = dir.fileName;

      // Deleting the built-in address books is very bad.
      if (["ldap_2.servers.pab", "ldap_2.servers.history"].includes(prefName)) {
        throw new Components.Exception(
          "Refusing to delete a built-in address book",
          Cr.NS_ERROR_FAILURE
        );
      }

      for (let name of Services.prefs.getChildList(`${prefName}.`)) {
        Services.prefs.clearUserPref(name);
      }
      if (dirType == Ci.nsIAbManager.MAPI_DIRECTORY_TYPE) {
        // The prefs for this directory type are defaults. Setting the dirType
        // to -1 ensures the directory is ignored.
        Services.prefs.setIntPref(`${prefName}.dirType`, -1);
      }
    }

    store.delete(uri);
    updateSortedDirectoryList();

    // Clear this reference to the deleted address book.
    if (Services.prefs.getStringPref("mail.collect_addressbook") == uri) {
      Services.prefs.clearUserPref("mail.collect_addressbook");
    }

    dir.cleanUp().then(() => {
      if (fileName) {
        let file = Services.dirsvc.get("ProfD", Ci.nsIFile);
        file.append(fileName);
        if (file.exists()) {
          file.remove(false);
        }
      }

      Services.obs.notifyObservers(dir, "addrbook-directory-deleted");
    });
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
  /**
   * Finds out if the directory name already exists.
   * @param {string} name - The name of a directory to check for.
   */
  directoryNameExists(name) {
    ensureInitialized();
    for (let dir of store.values()) {
      if (dir.dirName.toLowerCase() === name.toLowerCase()) {
        return true;
      }
    }
    return false;
  },
  cardForEmailAddress(emailAddress) {
    if (!emailAddress) {
      return null;
    }

    if (addressCacheTimer) {
      clearTimeout(addressCacheTimer);
    }
    addressCacheTimer = setTimeout(() => {
      addressCacheTimer = null;
      addressCache.clear();
    }, 60000);

    if (addressCache.has(emailAddress)) {
      return addressCache.get(emailAddress);
    }

    for (let directory of sortedDirectoryList) {
      try {
        let card = directory.cardForEmailAddress(emailAddress);
        if (card) {
          addressCache.set(emailAddress, card);
          return card;
        }
      } catch (ex) {
        // Directories can throw, that's okay.
      }
    }

    addressCache.set(emailAddress, null);
    return null;
  },

  /* nsICommandLineHandler */

  get helpInfo() {
    return "  -addressbook       Open the address book at startup.\n";
  },
  handle(commandLine) {
    let found = commandLine.handleFlag("addressbook", false);
    if (!found) {
      return;
    }

    Services.ww.openWindow(
      null,
      "chrome://messenger/content/addressbook/addressbook.xhtml",
      "_blank",
      "chrome,extrachrome,menubar,resizable,scrollbars,status,toolbar",
      null
    );
    commandLine.preventDefault = true;
  },
};
