/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

const { FolderUtils } = ChromeUtils.importESModule(
  "resource:///modules/FolderUtils.sys.mjs"
);
import {
  TreeDataAdapter,
  TreeDataRow,
} from "chrome://messenger/content/TreeDataAdapter.mjs";

export class FolderSelectionDataAdapter extends TreeDataAdapter {
  /**
   * @param {nsIMsgIncomingServer|nsIMsgIncomingServer[]} [serverOrServers]
   *   - a server, or an array of servers, or nothing. If a single server:
   *   only that server is listed, and the root folder is not displayed.
   *   If an array of servers: the servers are listed, with their root folders.
   *   If nothing, all servers are listed, with their root folders.
   */
  constructor(serverOrServers) {
    super();

    const recurseFolder = (folder, parentRow) => {
      if (folder.getFlag(Ci.nsMsgFolderFlags.Virtual)) {
        return;
      }

      const properties = new Set();

      const folderType = FolderUtils.getSpecialFolderString(folder);
      if (folder.isServer) {
        properties.add(`server-type-${folder.server.type}`);
        if (folder.server.isSecure) {
          properties.add("server-secure");
        }
      } else if (folderType != "none") {
        properties.add(`folder-type-${folderType.toLowerCase()}`);
      } else if (folder.server.type == "nntp") {
        properties.add("folder-type-news");
      }

      if (folder.noSelect) {
        properties.add("noselect");
      }

      const row = new TreeDataRow(
        { name: folder.localizedName },
        undefined,
        properties
      );
      row._folder = folder;
      if (parentRow) {
        parentRow.appendRow(row);
      } else {
        this._rowMap.push(row);
      }

      const subFolders = folder.subFolders;
      for (let i = 0; i < subFolders.length; i++) {
        if (
          subFolders[i] instanceof Ci.nsIMsgImapMailFolder &&
          subFolders[i].isGmailFolder
        ) {
          subFolders.splice(i, 1, ...subFolders[i].subFolders);
          break;
        }
      }
      for (const subFolder of subFolders.toSorted(FolderUtils.compareFolders)) {
        recurseFolder(subFolder, row);
      }
    };

    if (serverOrServers instanceof Ci.nsIMsgIncomingServer) {
      // Just this server. No row for the root folder.
      const subFolders = serverOrServers.rootFolder.subFolders;
      for (let i = 0; i < subFolders.length; i++) {
        if (
          subFolders[i] instanceof Ci.nsIMsgImapMailFolder &&
          subFolders[i].isGmailFolder
        ) {
          subFolders.splice(i, 1, ...subFolders[i].subFolders);
          break;
        }
      }
      for (const folder of subFolders.toSorted(FolderUtils.compareFolders)) {
        recurseFolder(folder);
      }
    } else {
      if (!serverOrServers) {
        // All the servers.
        serverOrServers = Array.from(
          FolderUtils.allAccountsSorted(),
          a => a.incomingServer
        );
      }
      for (const server of serverOrServers) {
        recurseFolder(server.rootFolder);
      }
    }
  }

  /**
   * Get all folders which are selected.
   *
   * @returns {Set<nsIMsgFolder>}
   */
  get selectedFolders() {
    const selected = new Set();

    const recurse = row => {
      if (row.hasProperty("folderSelected")) {
        selected.add(row._folder);
      }
      for (const childRow of row.children) {
        recurse(childRow);
      }
    };

    for (const topLevelRow of this._rowMap) {
      recurse(topLevelRow);
    }

    return selected;
  }

  /**
   * Set the selected folders, and open all ancestor rows of selected folders.
   *
   * Setting @name and @private explicitly to work around jsdoc/sphinx-js
   * treating this setter as the same symbol as the getter.
   *
   * @name FolderSelectionDataAdapter#setSelectedFolders
   * @private
   * @param {Set<nsIMsgFolder>} selected
   */
  set selectedFolders(selected) {
    const recurse = row => {
      let selectionWithin = selected.has(row._folder);
      if (selectionWithin) {
        row.addProperty("folderSelected");
      }
      for (const childRow of row.children) {
        if (recurse(childRow)) {
          row.open = true;
          selectionWithin = true;
        }
      }
      return selectionWithin;
    };

    for (const topLevelRow of this._rowMap) {
      recurse(topLevelRow);
    }
  }
}
