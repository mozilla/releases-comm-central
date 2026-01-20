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
   * Add a new item to a folder or move an existing item to a new folder.
   *
   * If the given  `itemId` is already on the server, then it is moved
   * from its current location to the newly specified `folderId`. If the
   * given `itemId` does not yet exist on the server, it is added to the
   * specified `folderId`.
   *
   * @param {string} itemId
   * @param {string} folderId
   * @param {SyntheticMessage} [syntheticMessage] - Message data from
   *   MessageGenerator, if this item is a message.
   */
  addNewItemOrMoveItemToFolder(itemId, folderId, syntheticMessage) {
    let itemInfo = this.#itemIdToItemInfo.get(itemId);
    if (itemInfo) {
      this.itemChanges.push(["delete", itemInfo.parentId, itemId]);
      itemInfo.parentId = folderId;
      this.itemChanges.push(["create", folderId, itemId]);
    } else {
      itemInfo = new ItemInfo(itemId, folderId, syntheticMessage);
      this.itemChanges.push(["create", folderId, itemId]);
    }
    this.#itemIdToItemInfo.set(itemId, itemInfo);
  }

  /**
   * Add messages to a folder. To be used with MessageGenerator.
   *
   * @param {string} folderId
   * @param {SyntheticMessage[]} messages
   */
  addMessages(folderId, messages) {
    for (const message of messages) {
      this.addNewItemOrMoveItemToFolder(
        btoa(message.messageId),
        folderId,
        message
      );
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
}
