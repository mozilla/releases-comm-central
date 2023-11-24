/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["AddrBookManager"];

const { AppConstants } = ChromeUtils.importESModule(
  "resource://gre/modules/AppConstants.sys.mjs"
);
const { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  clearTimeout: "resource://gre/modules/Timer.sys.mjs",
  setTimeout: "resource://gre/modules/Timer.sys.mjs",
});

XPCOMUtils.defineLazyModuleGetters(lazy, {
  compareAddressBooks: "resource:///modules/AddrBookUtils.jsm",
  MailGlue: "resource:///modules/MailGlue.jsm",
});

/** Test for valid directory URIs. */
const URI_REGEXP = /^([\w-]+):\/\/([\w\.-]*)([/:].*|$)/;

/**
 * When initialized, a map of nsIAbDirectory objects. Keys to this map are
 * the directories' URIs.
 */
let store = null;

/** Valid address book types. This differs by operating system. */
const types = ["jsaddrbook", "jscarddav", "moz-abldapdirectory"];
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
  sortedDirectoryList.sort(lazy.compareAddressBooks);
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
  const uriParts = URI_REGEXP.exec(uri);
  if (!uriParts) {
    throw Components.Exception(
      `Unexpected uri: ${uri}`,
      Cr.NS_ERROR_MALFORMED_URI
    );
  }

  const [, scheme] = uriParts;
  const dir = Cc[
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
  if (lazy.MailGlue.isToolboxProcess) {
    throw new Components.Exception(
      "AddrBookManager tried to start in the Developer Tools process!",
      Cr.NS_ERROR_UNEXPECTED
    );
  }

  store = new Map();

  for (const pref of Services.prefs.getChildList("ldap_2.servers.")) {
    try {
      if (pref.endsWith(".uri")) {
        let uri = Services.prefs.getStringPref(pref);
        if (uri.startsWith("ldap://") || uri.startsWith("ldaps://")) {
          const prefName = pref.substring(0, pref.length - 4);

          uri = `moz-abldapdirectory://${prefName}`;
          createDirectoryObject(uri, true);
        }
      } else if (pref.endsWith(".dirType")) {
        const prefName = pref.substring(0, pref.length - 8);
        const dirType = Services.prefs.getIntPref(pref);
        const fileName = Services.prefs.getStringPref(
          `${prefName}.filename`,
          ""
        );
        const uri = Services.prefs.getStringPref(`${prefName}.uri`, "");

        switch (dirType) {
          case Ci.nsIAbManager.MAPI_DIRECTORY_TYPE:
            if (
              Cu.isInAutomation ||
              Services.env.exists("XPCSHELL_TEST_PROFILE_DIR")
            ) {
              // Don't load the OS Address Book in tests.
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
              const outlookInterface = Cc[
                "@mozilla.org/addressbook/outlookinterface;1"
              ].getService(Ci.nsIAbOutlookInterface);
              for (const folderURI of outlookInterface.getFolderURIs(uri)) {
                createDirectoryObject(folderURI, true);
              }
            }
            break;
          case Ci.nsIAbManager.JS_DIRECTORY_TYPE:
            if (fileName) {
              const uri = `jsaddrbook://${fileName}`;
              createDirectoryObject(uri, true);
            }
            break;
          case Ci.nsIAbManager.CARDDAV_DIRECTORY_TYPE:
            if (fileName) {
              const uri = `jscarddav://${fileName}`;
              createDirectoryObject(uri, true);
            }
            break;
        }
      }
    } catch (ex) {
      console.error(ex);
    }
  }

  updateSortedDirectoryList();
}

// Force the manager to shut down. For tests only.
Services.obs.addObserver(async () => {
  // Allow directories to tidy up.
  for (const directory of store.values()) {
    await directory.cleanUp();
  }
  // Clear the store. The next call to ensureInitialized will recreate it.
  store = null;
  Services.obs.notifyObservers(null, "addrbook-reloaded");
}, "addrbook-reload");

/** Cache for the cardForEmailAddress function, and timer to clear it. */
const addressCache = new Map();
let addressCacheTimer = null;

// Throw away cached cards if the display name properties change, so we can
// get the updated version of the card that changed.
Services.prefs.addObserver("mail.displayname.version", () => {
  addressCache.clear();
  Services.obs.notifyObservers(null, "addrbook-displayname-changed");
});

// When this prefence has been updated, we need to update the
// mail.displayname.version, which notifies its preference observer (above).
// This will then notify the addrbook-displayname-changed observer, and change
// the displayname in the thread tree and message header.
Services.prefs.addObserver("mail.showCondensedAddresses", () => {
  Services.prefs.setIntPref(
    "mail.displayname.version",
    Services.prefs.getIntPref("mail.displayname.version") + 1
  );
});

/**
 * @implements {nsIAbManager}
 * @implements {nsICommandLineHandler}
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

    const uriParts = URI_REGEXP.exec(uri);
    if (!uriParts) {
      throw Components.Exception(
        `Unexpected uri: ${uri}`,
        Cr.NS_ERROR_MALFORMED_URI
      );
    }
    const [, scheme, fileName, tail] = uriParts;
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
        for (const list of parent.childNodes) {
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
    for (const dir of store.values()) {
      if (dir.dirPrefId == dirPrefId) {
        return dir;
      }
    }
    return null;
  },
  getDirectoryFromUID(uid) {
    ensureInitialized();
    for (const dir of store.values()) {
      if (dir.UID == uid) {
        return dir;
      }
    }
    return null;
  },
  getMailListFromName(name) {
    ensureInitialized();
    for (const dir of store.values()) {
      const hit = dir.getMailListFromName(name);
      if (hit) {
        return hit;
      }
    }
    return null;
  },
  newAddressBook(dirName, uri, type, uid) {
    function ensureUniquePrefName() {
      let leafName = dirName.replace(/\W/g, "");
      if (!leafName) {
        leafName = "_nonascii";
      }

      const existingNames = Array.from(store.values(), dir => dir.dirPrefId);
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
    if (uid && this.getDirectoryFromUID(uid)) {
      throw new Components.Exception(
        `An address book with the UID ${uid} already exists`,
        Cr.NS_ERROR_ABORT
      );
    }

    let prefName;
    ensureInitialized();

    switch (type) {
      case Ci.nsIAbManager.LDAP_DIRECTORY_TYPE: {
        const file = Services.dirsvc.get("ProfD", Ci.nsIFile);
        file.append("ldap.sqlite");
        file.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, 0o644);

        ensureUniquePrefName();
        Services.prefs.setStringPref(`${prefName}.description`, dirName);
        Services.prefs.setStringPref(`${prefName}.filename`, file.leafName);
        Services.prefs.setStringPref(`${prefName}.uri`, uri);
        if (uid) {
          Services.prefs.setStringPref(`${prefName}.uid`, uid);
        }

        uri = `moz-abldapdirectory://${prefName}`;
        const dir = createDirectoryObject(uri, true);
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
        if (uid) {
          Services.prefs.setStringPref(`${prefName}.uid`, uid);
        }

        if (AppConstants.platform == "macosx") {
          const dir = createDirectoryObject(uri, true);
          updateSortedDirectoryList();
          Services.obs.notifyObservers(dir, "addrbook-directory-created");
        } else if (AppConstants.platform == "win") {
          const outlookInterface = Cc[
            "@mozilla.org/addressbook/outlookinterface;1"
          ].getService(Ci.nsIAbOutlookInterface);
          for (const folderURI of outlookInterface.getFolderURIs(uri)) {
            const dir = createDirectoryObject(folderURI, true);
            updateSortedDirectoryList();
            Services.obs.notifyObservers(dir, "addrbook-directory-created");
          }
        }
        break;
      }
      case Ci.nsIAbManager.JS_DIRECTORY_TYPE:
      case Ci.nsIAbManager.CARDDAV_DIRECTORY_TYPE: {
        const file = Services.dirsvc.get("ProfD", Ci.nsIFile);
        file.append("abook.sqlite");
        file.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, 0o644);

        ensureUniquePrefName();
        Services.prefs.setStringPref(`${prefName}.description`, dirName);
        Services.prefs.setIntPref(`${prefName}.dirType`, type);
        Services.prefs.setStringPref(`${prefName}.filename`, file.leafName);
        if (uid) {
          Services.prefs.setStringPref(`${prefName}.uid`, uid);
        }

        const scheme =
          type == Ci.nsIAbManager.JS_DIRECTORY_TYPE
            ? "jsaddrbook"
            : "jscarddav";
        uri = `${scheme}://${file.leafName}`;
        const dir = createDirectoryObject(uri, true);
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
    const uriParts = URI_REGEXP.exec(uri);
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
      const list = this.getDirectory(uri);
      if (dir && list) {
        dir.deleteDirectory(list);
        return;
      }
    }

    const dir = store.get(uri);
    if (!dir) {
      throw new Components.Exception(
        `Address book not found: ${uri}`,
        Cr.NS_ERROR_UNEXPECTED
      );
    }

    const prefName = dir.dirPrefId;
    if (prefName) {
      const dirType = Services.prefs.getIntPref(`${prefName}.dirType`, 0);
      fileName = dir.fileName;

      // Deleting the built-in address books is very bad.
      if (["ldap_2.servers.pab", "ldap_2.servers.history"].includes(prefName)) {
        throw new Components.Exception(
          "Refusing to delete a built-in address book",
          Cr.NS_ERROR_FAILURE
        );
      }

      for (const name of Services.prefs.getChildList(`${prefName}.`)) {
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
        const file = Services.dirsvc.get("ProfD", Ci.nsIFile);
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
    for (const dir of store.values()) {
      if (dir.hasMailListWithName(name)) {
        return true;
      }
    }
    return false;
  },
  /**
   * Finds out if the directory name already exists.
   *
   * @param {string} name - The name of a directory to check for.
   */
  directoryNameExists(name) {
    ensureInitialized();
    for (const dir of store.values()) {
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
      lazy.clearTimeout(addressCacheTimer);
    }
    addressCacheTimer = lazy.setTimeout(() => {
      addressCacheTimer = null;
      addressCache.clear();
    }, 60000);

    if (addressCache.has(emailAddress)) {
      return addressCache.get(emailAddress);
    }

    for (const directory of sortedDirectoryList) {
      try {
        const card = directory.cardForEmailAddress(emailAddress);
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
};
