/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  MailServices: "resource:///modules/MailServices.sys.mjs",
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

class SmartMailbox {
  #tagsFolder = null;
  #rootFolder = null;
  #server = null;
  #account = null;

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
    let allFlags = 0;
    folderTypes.forEach(folderType => (allFlags |= folderType.flag));

    for (const folderType of folderTypes) {
      let folder = this.getSmartFolder(folderType.name);
      if (folder) {
        continue;
      }
      try {
        const searchFolders = [];

        const recurse = function (mainFolder) {
          let subFolders;
          try {
            subFolders = mainFolder.subFolders;
          } catch (ex) {
            console.error(
              new Error(
                `Unable to access the subfolders of ${mainFolder.URI}`,
                {
                  cause: ex,
                }
              )
            );
          }
          if (!subFolders?.length) {
            return;
          }

          for (const sf of subFolders) {
            // Add all of the subfolders except the ones that belong to
            // a different folder type.
            if (!(sf.flags & allFlags)) {
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

        folder = this.#rootFolder.createLocalSubfolder(folderType.name);
        folder.flags |= Ci.nsMsgFolderFlags.Virtual | folderType.flag;

        const msgDatabase = folder.msgDatabase;
        const folderInfo = msgDatabase.dBFolderInfo;

        folderInfo.setCharProperty("searchStr", "ALL");
        folderInfo.setCharProperty(
          "searchFolderUri",
          searchFolders.map(f => f.URI).join("|")
        );
        folderInfo.setUint32Property("searchFolderFlag", folderType.flag);
        folderInfo.setBooleanProperty("searchOnline", true);
        msgDatabase.summaryValid = true;
        msgDatabase.close(true);

        this.#rootFolder.notifyFolderAdded(folder);
      } catch (ex) {
        console.error(ex);
        continue;
      }
    }

    // Create tag folders, if missing.
    this.#tagsFolder =
      this.#rootFolder.getChildWithURI(
        `${this.#rootFolder.URI}/tags`,
        false,
        false
      ) ?? this.#rootFolder.createLocalSubfolder("tags");
    this.#tagsFolder.QueryInterface(Ci.nsIMsgLocalMailFolder);

    for (const tag of lazy.MailServices.tags.getAllTags()) {
      try {
        this.getTagFolder(tag);
      } catch (ex) {
        console.error(ex);
      }
    }
    lazy.MailServices.accounts.saveVirtualFolders();

    this.#server = smartServer;
    this.#account = lazy.MailServices.accounts.findAccountForServer(
      this.#server
    );
  }

  /**
   * Returns the smart folder with the specified name, if it exists.
   *
   * @param {string} name
   * @returns {?nsIMsgFolder}
   */
  getSmartFolder(name) {
    // Note: folder.getChildNamed(name) throws if the folder does not exist,
    // while folder.getChildWithURI() returns null;
    return this.#rootFolder.getChildWithURI(
      `${this.#rootFolder.URI}/${name}`,
      false,
      true
    );
  }

  /**
   * Returns the virtual folder searching messages for `tag`, creates it if
   * does not exist yet.
   *
   * @param {nsIMsgTag} tag
   * @returns {nsIMsgFolder}
   */
  getTagFolder(tag) {
    let folder = this.#tagsFolder.getChildWithURI(
      this.getTagFolderUriForKey(tag.key),
      false,
      false
    );
    if (folder) {
      return folder;
    }

    folder = this.#tagsFolder.createLocalSubfolder(tag.key);
    folder.flags |= Ci.nsMsgFolderFlags.Virtual;
    folder.prettyName = tag.tag;

    const msgDatabase = folder.msgDatabase;
    const folderInfo = msgDatabase.dBFolderInfo;

    folderInfo.setCharProperty("searchStr", `AND (tag,contains,${tag.key})`);
    folderInfo.setCharProperty("searchFolderUri", "*");
    folderInfo.setUint32Property("searchFolderFlag", Ci.nsMsgFolderFlags.Inbox);
    folderInfo.setBooleanProperty("searchOnline", false);
    msgDatabase.summaryValid = true;
    msgDatabase.close(true);

    this.#tagsFolder.notifyFolderAdded(folder);
    return folder;
  }

  /**
   * Constructs and returns the uri of the tag folder for the specified key.
   *
   * @param {string} key
   * @returns {string}
   */
  getTagFolderUriForKey(key) {
    // Don't use encodeURIComponent, folder URLs escape more characters.
    return `${this.#tagsFolder.URI}/${Services.io.escapeString(
      key,
      Ci.nsINetUtil.ESCAPE_URL_PATH
    )}`;
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
