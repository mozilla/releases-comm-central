/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  MailServices: "resource:///modules/MailServices.sys.mjs",
  VirtualFolderHelper: "resource:///modules/VirtualFolderWrapper.sys.mjs",
});

const messengerBundle = Services.strings.createBundle(
  "chrome://messenger/locale/messenger.properties"
);

const folderTypes = [
  { flag: Ci.nsMsgFolderFlags.Inbox, name: "Inbox", type: "inbox" },
  { flag: Ci.nsMsgFolderFlags.Drafts, name: "Drafts", type: "drafts" },
  { flag: Ci.nsMsgFolderFlags.Templates, name: "Templates", type: "templates" },
  { flag: Ci.nsMsgFolderFlags.SentMail, name: "Sent", type: "sent" },
  { flag: Ci.nsMsgFolderFlags.Archive, name: "Archives", type: "archives" },
  { flag: Ci.nsMsgFolderFlags.Junk, name: "Junk", type: "junk" },
  { flag: Ci.nsMsgFolderFlags.Trash, name: "Trash", type: "trash" },
  // { flag: Ci.nsMsgFolderFlags.Queue, name: "Outbox", type: "outbox" },
];
const allSpecialFolderFlags =
  Ci.nsMsgFolderFlags.SpecialUse | Ci.nsMsgFolderFlags.Virtual;

class SmartMailbox {
  #tagsFolder = null;
  #rootFolder = null;
  #server = null;
  #account = null;
  #TagFolderURIs = new Map();

  constructor() {
    this.verify();
  }

  /**
   * Returns the server of the smart mailbox account.
   *
   * @returns {nsIMsgIncomingServer}
   */
  get server() {
    return this.#server;
  }

  /**
   * Returns the smart mailbox account.
   *
   * @returns {nsIMsgAccount}
   */
  get account() {
    return this.#account;
  }

  /**
   * Returns the root folder of the smart mailbox account.
   *
   * @returns {nsIMsgFolder}
   */
  get rootFolder() {
    return this.#rootFolder;
  }

  /**
   * Returns the tags folder of the smart mailbox account.
   *
   * @returns {nsIMsgFolder}
   */
  get tagsFolder() {
    return this.#tagsFolder;
  }

  /**
   * Creates or updates the smart mailbox server.
   */
  verify() {
    let smartServer = lazy.MailServices.accounts.findServer(
      "nobody",
      "smart mailboxes",
      "none"
    );
    if (!smartServer) {
      smartServer = lazy.MailServices.accounts.createIncomingServer(
        "nobody",
        "smart mailboxes",
        "none"
      );
      // We don't want the "smart" server/account leaking out into the ui in
      // other places, so set it as hidden.
      smartServer.hidden = true;
      const account = lazy.MailServices.accounts.createAccount();
      account.incomingServer = smartServer;
    }
    smartServer.prettyName =
      messengerBundle.GetStringFromName("unifiedAccountName");
    this.#rootFolder = smartServer.rootFolder.QueryInterface(
      Ci.nsIMsgLocalMailFolder
    );

    // Create smart folders, if missing.
    for (const folderType of folderTypes) {
      this.getSmartFolder(folderType.name);
    }

    // Create root tag folder, if missing.
    this.#tagsFolder =
      this.#rootFolder.getChildWithURI(
        `${this.#rootFolder.URI}/tags`,
        false,
        false
      ) ?? this.#rootFolder.createLocalSubfolder("tags");
    this.#tagsFolder.QueryInterface(Ci.nsIMsgLocalMailFolder);

    // Remove obsolete tag folders.
    const tags = lazy.MailServices.tags.getAllTags();
    const obsoleteFolders = this.#tagsFolder.subFolders.filter(
      folder => !tags.some(t => t.tag == folder.name)
    );
    for (const folder of obsoleteFolders) {
      folder.deleteSelf(null);
    }

    // Create tag folders, if missing.
    for (const tag of tags) {
      this.getTagFolder(tag);
    }

    lazy.MailServices.accounts.saveVirtualFolders();
    this.#server = smartServer;
    this.#account = lazy.MailServices.accounts.findAccountForServer(
      this.#server
    );
  }

  /**
   * Returns the smart folder with the specified name. Attempts to create it, if
   * it does not exist yet.
   *
   * @param {string} name
   * @returns {?nsIMsgFolder}
   */
  getSmartFolder(name) {
    // Note: Smart folder URIs use the names as listed in the folderTypes array
    // (e.g.: mailbox://nobody@smart%20mailboxes/Inbox), but their actual names
    // will be localized. A folder lookup here via getChildNamed() will therefore
    // fail on localized systems (unless the localized name is used for the lookup).
    const folderType = folderTypes.find(f => f.name == name);
    const folderFromUri = this.#rootFolder.getChildWithURI(
      `${this.#rootFolder.URI}/${folderType.name}`,
      false,
      true
    );
    if (folderFromUri) {
      return folderFromUri;
    }

    try {
      const searchFolders = [];

      const recurse = function (mainFolder) {
        let subFolders;
        try {
          subFolders = mainFolder.subFolders;
        } catch (ex) {
          console.error(
            new Error(`Unable to access the subfolders of ${mainFolder.URI}`, {
              cause: ex,
            })
          );
        }
        if (!subFolders?.length) {
          return;
        }

        for (const sf of subFolders) {
          // Add all real subfolders except the ones that belong to
          // a different folder type.
          if (!(sf.flags & allSpecialFolderFlags)) {
            searchFolders.push(sf);
            recurse(sf);
          }
        }
      };

      for (const server of lazy.MailServices.accounts.allServers) {
        for (const f of server.rootFolder.getFoldersWithFlags(
          folderType.flag
        )) {
          searchFolders.push(f);
          recurse(f);
        }
      }

      const wrapper = lazy.VirtualFolderHelper.createNewVirtualFolder(
        folderType.name,
        this.#rootFolder,
        searchFolders,
        "ALL",
        true
      );
      const folder = wrapper.virtualFolder;
      folder.setFlag(folderType.flag);

      const msgDatabase = folder.msgDatabase;
      const folderInfo = msgDatabase.dBFolderInfo;
      folderInfo.setUint32Property("searchFolderFlag", folderType.flag);
      msgDatabase.summaryValid = true;
      msgDatabase.close(true);

      this.#rootFolder.notifyFolderAdded(folder);
    } catch (ex) {
      console.error(`Failed to create smart folder <${folderType.name}>`, ex);
    }

    return null;
  }

  /**
   * Returns the virtual folder searching messages for `tag`, creates it if
   * does not exist yet.
   *
   * @param {nsIMsgTag} tag
   * @returns {nsIMsgFolder}
   */
  getTagFolder(tag) {
    // Use getChildWithURI() to get the folder via its known URI.
    const uri = this.#TagFolderURIs.get(tag.key);
    if (uri) {
      const folderFromUri = this.#tagsFolder.getChildWithURI(uri, false, true);
      if (folderFromUri) {
        return folderFromUri;
      }
    }

    // Use folder.getChildNamed() to identify the tag folder by its name.
    const folderFromName = this.#tagsFolder.getChildNamed(tag.tag);
    if (folderFromName) {
      this.#TagFolderURIs.set(tag.key, folderFromName.URI);
      return folderFromName;
    }

    try {
      const folder = this.#tagsFolder.createLocalSubfolder(tag.key);
      folder.flags |= Ci.nsMsgFolderFlags.Virtual;
      folder.name = tag.tag;
      this.#TagFolderURIs.set(tag.key, folder.URI);

      const msgDatabase = folder.msgDatabase;
      const folderInfo = msgDatabase.dBFolderInfo;

      folderInfo.setCharProperty("searchStr", `AND (tag,contains,${tag.key})`);
      folderInfo.setCharProperty("searchFolderUri", "*");
      folderInfo.setUint32Property(
        "searchFolderFlag",
        Ci.nsMsgFolderFlags.Inbox
      );
      folderInfo.setBooleanProperty("searchOnline", false);
      msgDatabase.summaryValid = true;
      msgDatabase.close(true);

      this.#tagsFolder.notifyFolderAdded(folder);
      return folder;
    } catch (ex) {
      console.error(`Failed to create tag folder <${tag.tag}>`, ex);
    }

    return null;
  }

  /**
   * Returns the currently known URI of the tag folder associated with a given
   * key. The folder does not necessarily have to exist.
   *
   * @param {string} key
   * @returns {string}
   */
  getTagFolderUriForKey(key) {
    return this.#TagFolderURIs.get(key);
  }
}

let smartMailboxInstance = null;

export const SmartMailboxUtils = {
  /**
   * @returns {SmartMailbox}
   */
  getSmartMailbox() {
    if (!smartMailboxInstance) {
      smartMailboxInstance = new SmartMailbox();
    } else {
      smartMailboxInstance.verify();
    }
    return smartMailboxInstance;
  },

  /**
   * Remove the smart mailbox account (including the server), if it exists.
   *
   * @param {boolean} [removeFiles=false] - Remove data directory (local directory).
   */
  removeAll(removeFiles = false) {
    const smartServer = lazy.MailServices.accounts.findServer(
      "nobody",
      "smart mailboxes",
      "none"
    );
    if (!smartServer) {
      return;
    }
    const account =
      lazy.MailServices.accounts.findAccountForServer(smartServer);
    if (account) {
      lazy.MailServices.accounts.removeAccount(account, removeFiles);
    } else {
      lazy.MailServices.accounts.removeIncomingServer(smartServer, removeFiles);
    }
  },

  /**
   * Returns a clone of the folder type array defined at the top of this module.
   *
   * @returns {object[]}
   */
  getFolderTypes() {
    return folderTypes.map(folderType => ({ ...folderType }));
  },
};
