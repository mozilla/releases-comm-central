/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { SyntheticMessage } from "resource://testing-common/mailnews/MessageGenerator.sys.mjs";

/**
 * A snapshot of a change in a folder or item log.
 *
 * @typedef {object} ChangeRecord
 * @property {string} kind - The change type. One of "create", "update",
 *   "delete", or "readflag".
 * @property {string} parentId - The parent folder or calendar ID.
 * @property {string} id - The changed folder or item ID.
 */

/**
 * A page of changes from a folder or item log.
 *
 * @typedef {object} ChangePage
 * @property {ChangeRecord[]} changes - Changes in this page.
 * @property {boolean} hasMore - Whether another page is available.
 * @property {number} nextOffset - The next offset in the unfiltered log.
 */

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
   * @type {ChangeRecord[]}
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
   * @type {ChangeRecord[]}
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
   * The latest requested maximum page size in responses when synchronizing
   * message lists.
   *
   * This does not necessarily represent how many results are actually returned
   * by the mock server, but rather how many were requested by the client.
   *
   * @type {?number}
   */
  lastMaxMessagePageSize = null;

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
   * @returns {Iterator<Array<string|ItemInfo>>} A collection of 2-element
   *   arrays, where the first element is an item ID and the second is the
   *   corresponding `ItemInfo`.
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
      this.folderChanges.push({
        kind: "create",
        parentId: folder.parentId,
        id: folder.id,
      });
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
      this.folderChanges.push({
        kind: "delete",
        parentId: folderToDelete.parentId,
        id,
      });
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
      this.folderChanges.push({
        kind: "update",
        parentId: folder.parentId,
        id,
      });
    }
  }

  /**
   * Change the parent folder of a folder.
   *
   * This allows selection of whether the resulting ID is stable because we have
   * observed that Graph and EWS differ in how they handle folder moves: EWS IDs
   * appear to be stable while Graph IDs appear to change.
   *
   * @param {string} id - The id of the folder to change the parent of.
   * @param {string} newParentId - The id of the new parent folder.
   * @param {boolean} idStable - Whether or not to assign a new ID.
   *
   * @returns {string} The resulting ID.
   */
  reparentFolderById(id, newParentId, idStable = true) {
    const childFolder = this.#idToFolder.get(id);
    const newParentFolder = this.#idToFolder.get(newParentId);

    if (!childFolder) {
      throw new Error(`Folder ${id} does not exist.`);
    }

    if (!newParentFolder) {
      throw new Error(`Folder ${newParentId} does not exist.`);
    }

    const oldParentId = childFolder.parentId;
    childFolder.parentId = newParentId;

    let newId;
    if (idStable) {
      newId = id;
      this.folderChanges.push({ kind: "update", parentId: newParentId, id });
    } else {
      newId = `moved-folder-${id}`;

      // Update the child items of the moved folder.
      for (const item of this.getItemsInFolder(childFolder.id)) {
        item.parentId = newId;
      }
      childFolder.id = newId;

      // Update the child folders of the moved folder.
      for (const folder of this.folders) {
        if (folder.parentId == id) {
          folder.parentId = newId;
        }
      }

      this.#idToFolder.delete(id);
      this.#idToFolder.set(newId, childFolder);
      this.folderChanges.push({ kind: "delete", parentId: oldParentId, id });
      this.folderChanges.push({
        kind: "create",
        parentId: newParentId,
        id: newId,
      });
    }

    this.updatedFolderIds.push(newId);

    return newId;
  }

  /**
   * Copy the given source folder into the destination folder with the given id.
   *
   * @param {RemoteFolder} sourceFolder
   * @param {string} destinationFolderId
   *
   * @returns {string} The ID of the newly copied folder.
   */
  copyFolderToId(sourceFolder, destinationFolderId) {
    const sourceFolderId = sourceFolder.id;
    const newFolderId = `${sourceFolderId}_copy`;
    const folderCopy = new RemoteFolder(
      newFolderId,
      destinationFolderId,
      sourceFolder.displayName,
      newFolderId
    );
    this.appendRemoteFolder(folderCopy);
    // Make copies of the items that belong to the source folder
    // and place them in the destination folder.
    for (const [itemId, itemInfo] of this.items()) {
      if (itemInfo.parentId === sourceFolderId) {
        const newItemId = `${itemId}_copy`;
        this.addItemToFolder(
          newItemId,
          newFolderId,
          itemInfo.syntheticMessage
            ? new SyntheticMessage(
                itemInfo.syntheticMessage.headers,
                itemInfo.syntheticMessage.bodyPart,
                itemInfo.syntheticMessage.metaState
              )
            : null
        );
      }
    }
    return newFolderId;
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
    this.itemChanges.push({ kind: "create", parentId: folderId, id: itemId });
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
    this.itemChanges.push({
      kind: "delete",
      parentId: itemInfo.parentId,
      id: itemId,
    });
    this.itemChanges.push({ kind: "create", parentId: folderId, id: newId });

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
      this.itemChanges.push({
        kind: "delete",
        parentId: itemInfo.parentId,
        id: itemId,
      });
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
   * Get a page of changes starting from a given position.
   *
   * This method also "flattens" creation and deletion: if an item was created
   * and then deleted in the requested range, neither change is returned.
   *
   * @param {ChangeRecord[]} changeLog - The log to read from.
   * @param {number} offset - The position in the change stream to sync from.
   * @param {number} maxItems - The maximum number of changes to include. The
   *   resulting list of changes might be smaller than this number, e.g. if the
   *   end of `changeLog` has been reached, possibly because changes have
   *   been "flattened" out. Defaults to `Infinity` if < 1.
   * @param {function(ChangeRecord):boolean} [filter] - Filter used to select
   *   which changes should be included.
   * @returns {ChangePage} The requested page of changes.
   */
  #getChangesFromLog(changeLog, offset, maxItems, filter = () => true) {
    if (maxItems < 1) {
      maxItems = Infinity;
    }
    const changes = changeLog
      .slice(offset)
      .map((change, index) => [change, offset + index])
      .filter(([change]) => filter(change));

    // We have to flatten after we slice the changeLog, to avoid modifying
    // indexes between requests, but before we paginate, to avoid returning
    // deleted items when the deletion is past the current page. Our current
    // algorithm will generate "delete"s on items the client doesn't know about
    // whenever we skip a "create" but the corresponding "delete" falls on a
    // later page after flattening, since the slice above will prevent the next
    // flattening from knowing about the "create". Our clients are supposed to
    // be able to handle this, since it's a documented possibility for Graph. If
    // we ever decide to change this, sync state tokens will need to store more
    // than just the offset.

    const createdInRange = new Set();
    const currentStateById = new Map();

    for (const [{ kind, id }] of changes) {
      if (kind == "create") {
        createdInRange.add(id);
      }
      currentStateById.set(id, kind);
    }

    const flattenedChanges = changes.filter(([{ kind, id }]) => {
      switch (kind) {
        case "create":
        case "update":
        case "readflag":
          // Skip any changes if the item ends up deleted.
          return currentStateById.get(id) != "delete";

        case "delete":
          // If the change is a deletion, don't include it if the item was
          // also created in this range (and is still deleted).
          return (
            !createdInRange.has(id) && currentStateById.get(id) == "delete"
          );
        default:
          return true;
      }
    });

    const truncatedChanges = flattenedChanges.slice(0, maxItems);
    const hasMore = flattenedChanges.length > truncatedChanges.length;
    const nextOffset = hasMore
      ? truncatedChanges.at(-1)[1] + 1
      : changeLog.length;

    return {
      changes: truncatedChanges.map(c => c[0]),
      hasMore,
      nextOffset,
    };
  }

  /**
   * Get all the item changes starting from a given position.
   *
   * This method also "flattens" creation and deletion: if an item was created
   * and then deleted in the requested range, neither change is returned.
   *
   * @param {number} offset - The position in the change stream to sync from.
   * @param {string} folderId - The folder for which we want to sync new
   *   changes.
   * @param {number} maxItems - The maximum number of changes to include. The
   *   resulting list of changes might be smaller than this number, e.g. if the
   *   end of `this.itemChanges` has been reached, possibly because changes have
   *   been "flattened" out. Defaults to `Infinity` if < 1.
   * @returns {ChangePage} The requested page of item changes.
   */
  getChangesSince(offset, folderId, maxItems) {
    return this.#getChangesFromLog(
      this.itemChanges,
      offset,
      maxItems,
      change => change.parentId == folderId
    );
  }

  /**
   * Get changes to folders starting from a given position.
   *
   * This method is analogous to `getChangesSince`, but on the folder hierarchy
   * instead of items.
   *
   * @param {number} offset - The position in the folder change log.
   * @param {number} maxItems - The maximum number of changes to return.
   *    Defaults to `Infinity` if < 1.
   * @returns {ChangePage} The requested page of folder changes.
   */
  getFolderChangesSince(offset, maxItems) {
    return this.#getChangesFromLog(this.folderChanges, offset, maxItems);
  }
}
