/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * A remote folder to sync from the server. While initiating a test, an array of
 * folders is given to the server, which will use it to populate the contents of
 * responses to operations.
 */
export class RemoteFolder {
  /**
   * The unique identifier for this folder.
   *
   * @type {string}
   */
  id;

  /**
   * An optional distinguished ID if this is a special folder (e.g. Inbox, root
   * folder, etc.).
   *
   * @type {?string}
   */
  distinguishedId;

  /**
   * The display name for the folder. Defaults to its ID.
   *
   * @type {string}
   */
  displayName;

  /**
   * The identifier for the parent of this folder. Only the root folder
   * should be allowed to not have a parent.
   *
   * @type {?string}
   */
  parentId;

  /**
   * The value of the FolderClass attribute to use for this folder.
   * Defaults to `IPF.Note`, the correct value for Exchange folders.
   *
   * @type {?string}
   */
  folderClass;

  constructor(
    folderId,
    parentId = null,
    displayName = null,
    distinguishedFolderId = null
  ) {
    this.id = folderId;
    this.parentId = parentId;
    this.displayName = displayName || folderId;
    this.distinguishedId = distinguishedFolderId;
  }
}

/**
 * Information about an item (Message, Meeting, etc.)
 */
export class ItemInfo {
  /**
   * @type {string}
   */
  id;

  /**
   * @type {string}
   */
  parentId;

  /**
   * @type {SyntheticMessage}
   */
  syntheticMessage;

  /**
   * Construct a new item within the given parent.
   *
   * @param {string} id
   * @param {string} parentId
   * @param {SyntheticMessage} [syntheticMessage] - Message data from
   *   MessageGenerator, if this item is a message.
   */
  constructor(id, parentId, syntheticMessage) {
    this.id = id;
    this.parentId = parentId;
    this.syntheticMessage = syntheticMessage;
  }
}

export class MockServer {
  /**
   * The folders registered on this server.
   *
   * @type {RemoteFolder[]}
   */
  folders = [];

  /**
   * The folders flagged to be deleted on this server.
   *
   * @type {RemoteFolder[]}
   */
  deletedFolders = [];

  /**
   * The ids of folders that have had updates applied.
   *
   * @type {string[]}
   */
  updatedFolderIds = [];

  /**
   * A list of all changes that happened to folders.
   *
   * @type {Array<string, string>} - Each item in this array is two strings.
   *   The first is "create" or "update" or "delete". The second is the id of
   *   the folder that changed.
   */
  folderChanges = [];

  /**
   * A mapping from identifier to folder specification.
   *
   * @type {Map<string, RemoteFolder>}
   */
  #idToFolder = new Map();

  /**
   * A mapping from distinguished identifier to folder specification.
   *
   * @type {Map<string, RemoteFolder>}
   */
  #distinguishedIdToFolder = new Map();

  /**
   * A mapping from item id to its containing folder id.
   *
   * @type {Map<string, ItemInfo>}
   */
  #itemIdToItemInfo = new Map();

  /**
   * A list of all changes that happened to items.
   *
   * @type {Array<string, string, string>} - Each item is three elements:
   *   - "create" or "delete".
   *   - The id of the folder where the change occurred.
   *   - The id of the item that changed.
   */
  itemChanges = [];

  /**
   * The total number of items created by this server.
   *
   * @type {number}
   */
  itemsCreated = 0;

  /**
   * The content of the last outgoing message sent to this server.
   *
   * @type {?string}
   */
  lastSentMessage = null;

  /**
   * The number of times a message has been moved in the server's lifespan.
   *
   * @type {number}
   * @private
   */
  #movedItems = 0;

  /**
   * Return the item information for the specified `itemId`, or
   * null if it can't be found.
   *
   * @param {string} itemId
   * @returns {ItemInfo?}
   */
  getItemInfo(itemId) {
    if (this.#itemIdToItemInfo.has(itemId)) {
      return this.#itemIdToItemInfo.get(itemId);
    }
    return null;
  }

  /**
   * Return an iterator through all items in this server.
   *
   * @returns {Iterator<[string, ItemInfo]>}
   */
  items() {
    return this.#itemIdToItemInfo.entries();
  }

  /**
   * Return the folder for the specified `folderId`, or
   * `null` if it can't be found.
   *
   * @param {string} folderId
   * @returns {RemoteFolder?}
   */
  getFolder(folderId) {
    if (this.#idToFolder.has(folderId)) {
      return this.#idToFolder.get(folderId);
    }
    return null;
  }

  /**
   * Return the folder for the specified `distinguishedFolderId`,
   * or `null` if it can't be found.
   *
   * @param {string} distinguishedFolderId
   * @returns {RemoteFolder?}
   */
  getDistinguishedFolder(distinguishedFolderId) {
    if (this.#distinguishedIdToFolder.has(distinguishedFolderId)) {
      return this.#distinguishedIdToFolder.get(distinguishedFolderId);
    }
    return null;
  }

  /**
   * Set the exhaustive list of folders this server should use to generate
   * responses. If this method is called more than once, the previous list of
   * folders is replaced by the new one.
   *
   * @param {RemoteFolder[]} folders
   */
  setRemoteFolders(folders) {
    this.folders = [];
    this.folderChanges = [];
    this.#idToFolder.clear();
    this.#distinguishedIdToFolder.clear();

    folders.forEach(folder => {
      this.appendRemoteFolder(folder);
    });
  }

  /**
   * Add a new remote folder to the server to include in future responses.
   *
   * @param {RemoteFolder} folder
   */
  appendRemoteFolder(folder) {
    this.folders.push(folder);
    this.#idToFolder.set(folder.id, folder);
    if (folder.distinguishedId) {
      this.#distinguishedIdToFolder.set(folder.distinguishedId, folder);
    }
    if (folder.distinguishedId != "msgfolderroot") {
      this.folderChanges.push(["create", folder.id]);
    }
  }

  /**
   * Delete a remote folder given its id.
   *
   * @param {string} id
   */
  deleteRemoteFolderById(id) {
    const folderToDelete = this.folders.find(value => value.id == id);
    if (folderToDelete) {
      const indexOfDeletedFolder = this.folders.indexOf(folderToDelete);
      this.folders.splice(indexOfDeletedFolder, 1);
      this.#idToFolder.delete(folderToDelete.id);
      if (folderToDelete.distinguishedId) {
        this.#distinguishedIdToFolder.delete(folderToDelete.distinguishedId);
      }
      this.deletedFolders.push(folderToDelete);
      this.folderChanges.push(["delete", id]);
    }
  }

  /**
   * Empty a remote folder given its id.
   *
   * @param {string} id
   */
  emptyRemoteFolderById(id) {
    const itemsToDelete = this.getItemsInFolder(id);
    for (const item of itemsToDelete) {
      this.deleteItem(item.id);
    }
    const foldersToDelete = this.folders.filter(value => value.parentId == id);
    for (const folder of foldersToDelete) {
      this.deleteRemoteFolderById(folder.id);
    }
  }

  /**
   * Rename a folder given its id and a new name.
   *
   * @param {string} id
   * @param {string} newName
   */
  renameFolderById(id, newName) {
    const folder = this.#idToFolder.get(id);
    if (folder) {
      folder.displayName = newName;
      this.updatedFolderIds.push(id);
      this.folderChanges.push(["update", id]);
    }
  }

  /**
   * Change the parent folder of a folder.
   *
   * @param {string} id - The id of the folder to change the parent of.
   * @param {string} newParentId - The id of the new parent folder.
   */
  reparentFolderById(id, newParentId) {
    const childFolder = this.#idToFolder.get(id);
    if (!!childFolder && this.#idToFolder.has(newParentId)) {
      childFolder.parentId = newParentId;
      this.updatedFolderIds.push(id);
      this.folderChanges.push(["update", id]);
    }
  }

  /**
   * Removes all items from the server.
   */
  clearItems() {
    this.#itemIdToItemInfo.clear();
    this.itemChanges = [];
  }

  /**
   * Add a new item to a folder.
   *
   * @param {string} itemId
   * @param {string} folderId
   * @param {?SyntheticMessage} syntheticMessage - Message data from
   *   MessageGenerator.
   */
  addItemToFolder(itemId, folderId, syntheticMessage) {
    let itemInfo = this.#itemIdToItemInfo.get(itemId);
    if (itemInfo) {
      throw Error(`an item already exists with ID ${itemId}`);
    }

    itemInfo = new ItemInfo(itemId, folderId, syntheticMessage);
    this.itemChanges.push(["create", folderId, itemId]);
    this.itemsCreated++;
    this.#itemIdToItemInfo.set(itemId, itemInfo);
  }

  /**
   * Moves an existing message to a destination folder.
   *
   * @param {string} itemId - The unique identifier for the message to move
   * @param {string} folderId - The unique identifier for the destination folder
   * @returns {string} - The unique identifier for the message once the move has
   *   been done, which can change in the process.
   */
  moveItemToFolder(itemId, folderId) {
    const itemInfo = this.#itemIdToItemInfo.get(itemId);
    if (!itemInfo) {
      throw Error("cannot find existing message with ID to move");
    }

    // Register changes that describe the move.
    const newId = `moved-item-${this.#movedItems}`;
    itemInfo.id = newId;
    this.itemChanges.push(["delete", itemInfo.parentId, itemId]);
    this.itemChanges.push(["create", folderId, newId]);

    // Set the destination folder ID, and move the item's entry in
    // `#itemIdToItemInfo` from the old item ID to the new one.
    itemInfo.parentId = folderId;
    this.#itemIdToItemInfo.delete(itemId);
    this.#itemIdToItemInfo.set(newId, itemInfo);

    this.#movedItems++;

    return newId;
  }

  /**
   * Add messages to a folder. To be used with MessageGenerator.
   *
   * Exchange identifiers use URL-safe base encoding with the following rules:
   * 1. Replace '+' with '-'
   * 2. Replace '/' with '_'
   * 3. Replace padding '=' with the number of pad characters at the end.
   *
   * This function modifies the input messages so the ID is a URL safe exchange
   * identifier.
   *
   * @param {string} folderId
   * @param {SyntheticMessage[]} messages
   */
  addMessages(folderId, messages) {
    for (const message of messages) {
      let urlSafeId = btoa(message.messageId)
        .replace("+", "-")
        .replace("/", "_");
      const padStart = urlSafeId.indexOf("=");
      if (padStart >= 0) {
        const padLength = urlSafeId.length - padStart;
        urlSafeId = urlSafeId.substring(0, padStart) + padLength.toString();
      }
      message.messageId = urlSafeId;
      this.addItemToFolder(urlSafeId, folderId, message);
    }
  }

  /**
   * Deletes an item from the server.
   *
   * @param {string} itemId
   */
  deleteItem(itemId) {
    const itemInfo = this.#itemIdToItemInfo.get(itemId);
    if (itemInfo) {
      this.itemChanges.push(["delete", itemInfo.parentId, itemId]);
      this.#itemIdToItemInfo.delete(itemId);
    }
  }

  /**
   * Get the item with the given id.
   *
   * @param {string} itemId
   * @returns {ItemInfo}
   */
  getItem(itemId) {
    return this.#itemIdToItemInfo.get(itemId);
  }

  /**
   * Get the id of the folder containing the item with the given id.
   *
   * @param {string} itemId
   */
  getContainingFolderId(itemId) {
    return this.#itemIdToItemInfo.get(itemId).parentId;
  }

  /**
   * Get all of the items in a folder.
   *
   * @param {string} folderId
   * @returns {ItemInfo[]}
   */
  getItemsInFolder(folderId) {
    const items = [];
    for (const item of this.#itemIdToItemInfo.values()) {
      if (item.parentId === folderId) {
        items.push(item);
      }
    }
    return items;
  }

  /**
   * Get all the item changes starting from a given position.
   *
   * This method also "flattens" creation and deletion: if a message was created
   * and then deleted in the range covered by the changes returned here, the
   * creation and deletion are
   *
   * @param {number} offset - The position in the change stream to sync from.
   * @param {string} folderId - The folder for which we want to sync new
   *   changes.
   * @param {number} maxItems - An optional maximum number of items to include.
   *   The resulting list of changes might be smaller than this number, e.g. if
   *   the end of `this.itemChanges` has been reached, or if changes have been
   *   "flattened" out.
   * @returns {Array<Array<string, string, string>, boolean>} - An array with a
   *   list of changes as the first element, and a boolean indicating whether
   *   more changes are available as the second. See the documentation for
   *   `MockServer.itemChanges` for the structure of the first element.
   */
  getChangesSince(offset, folderId, maxItems) {
    let changes = this.itemChanges
      .slice(offset)
      .filter(([, parentId]) => parentId === folderId);

    let truncated = false;

    if (Number.isFinite(maxItems)) {
      changes = changes.slice(0, maxItems);

      if (offset + maxItems < this.itemChanges.length - 1) {
        truncated = true;
      }
    }

    const createdInRange = new Set();
    const currentStateById = new Map();
    for (const change of changes) {
      const changeKind = change[0];
      const itemId = change[2];
      if (changeKind == "create") {
        createdInRange.add(itemId);
      }
      currentStateById.set(itemId, changeKind);
    }

    const flattenedChanges = changes.filter(([kind, _parentId, itemId]) => {
      switch (kind) {
        case "create":
        case "update":
        case "readflag":
          // If the change is an item creation, remove it if the item was
          // deleted afterwards.
          return currentStateById.get(itemId) != "delete";
        case "delete":
          // If the change is an item deletion, don't include it if the item was
          // also created in this range (and is still deleted).
          return (
            !createdInRange.has(itemId) &&
            currentStateById.get(itemId) == "delete"
          );
        default:
          return true;
      }
    });

    return [flattenedChanges, truncated];
  }
}
