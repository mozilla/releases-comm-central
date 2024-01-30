/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

const lazy = {};

XPCOMUtils.defineLazyModuleGetters(lazy, {
  MailServices: "resource:///modules/MailServices.jsm",
});

const messengerBundle = Services.strings.createBundle(
  "chrome://messenger/locale/messenger.properties"
);

export const SmartServerUtils = {
  folderTypes: [
    { flag: Ci.nsMsgFolderFlags.Inbox, name: "Inbox" },
    { flag: Ci.nsMsgFolderFlags.Drafts, name: "Drafts" },
    { flag: Ci.nsMsgFolderFlags.Templates, name: "Templates" },
    { flag: Ci.nsMsgFolderFlags.SentMail, name: "Sent" },
    { flag: Ci.nsMsgFolderFlags.Archive, name: "Archives" },
    { flag: Ci.nsMsgFolderFlags.Junk, name: "Junk" },
    { flag: Ci.nsMsgFolderFlags.Trash, name: "Trash" },
    // { flag: Ci.nsMsgFolderFlags.Queue, name: "Outbox" },
  ],

  getSmartServer() {
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
    const smartRoot = smartServer.rootFolder.QueryInterface(
      Ci.nsIMsgLocalMailFolder
    );

    let allFlags = 0;
    this.folderTypes.forEach(folderType => (allFlags |= folderType.flag));

    for (const folderType of this.folderTypes) {
      let folder = smartRoot.getChildWithURI(
        `${smartRoot.URI}/${folderType.name}`,
        false,
        true
      );
      if (folder) {
        continue;
      }
      try {
        const searchFolders = [];

        function recurse(folder) {
          let subFolders;
          try {
            subFolders = folder.subFolders;
          } catch (ex) {
            console.error(
              new Error(`Unable to access the subfolders of ${folder.URI}`, {
                cause: ex,
              })
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
        }

        for (const server of lazy.MailServices.accounts.allServers) {
          for (const f of server.rootFolder.getFoldersWithFlags(
            folderType.flag
          )) {
            searchFolders.push(f);
            recurse(f);
          }
        }

        folder = smartRoot.createLocalSubfolder(folderType.name);
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

        smartRoot.notifyFolderAdded(folder);
      } catch (ex) {
        console.error(ex);
        continue;
      }
    }
    return smartServer;
  },
};
