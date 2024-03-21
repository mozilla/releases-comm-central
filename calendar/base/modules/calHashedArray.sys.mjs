/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { data } from "resource:///modules/calendar/utils/calDataUtils.sys.mjs";

/**
 * An unsorted array of hashable items with some extra functions to quickly
 * retrieve the item by its hash id.
 *
 * Performance Considerations:
 *  - Accessing items is fast
 *  - Adding items is fast (they are added to the end)
 *  - Deleting items is O(n)
 *  - Modifying items is fast.
 */
export const HashedArray = function () {
  this.clear();
}; // even though it's defined in calUtils.sys.mjs, import needs this

HashedArray.prototype = {
  mArray: null,
  mHash: null,

  mBatch: 0,
  mFirstDirty: -1,

  /**
   * Returns a copy of the internal array. Note this is a shallow copy.
   */
  get arrayCopy() {
    return this.mArray.concat([]);
  },

  /**
   * The function to retrieve the hashId given the item. This function can be
   * overridden by implementations, in case the added items are not instances
   * of calIItemBase.
   *
   * @param item      The item to get the hashId for
   * @returns The hashId of the item
   */
  hashAccessor(item) {
    return item.hashId;
  },

  /**
   * Returns the item, given its index in the array
   *
   * @param index         The index of the item to retrieve.
   * @returns The retrieved item.
   */
  itemByIndex(index) {
    return this.mArray[index];
  },

  /**
   * Returns the item, given its hashId
   *
   * @param id            The hashId of the item to retrieve.
   * @returns The retrieved item.
   */
  itemById(id) {
    if (this.mBatch > 0) {
      throw new Error("Accessing Array by ID not supported in batch mode");
    }
    return id in this.mHash ? this.mArray[this.mHash[id]] : null;
  },

  /**
   * Returns the index of the given item. This function is cheap performance
   * wise, since it uses the hash
   *
   * @param item          The item to search for.
   * @returns The index of the item.
   */
  indexOf(item) {
    if (this.mBatch > 0) {
      throw new Error("Accessing Array Indexes not supported in batch mode");
    }
    const hashId = this.hashAccessor(item);
    return hashId in this.mHash ? this.mHash[hashId] : -1;
  },

  /**
   * Remove the item with the given hashId.
   *
   * @param id            The id of the item to be removed
   */
  removeById(id) {
    if (this.mBatch > 0) {
      throw new Error("Remvoing by ID in batch mode is not supported"); /* TODO */
    }
    const index = this.mHash[id];
    delete this.mHash[id];
    this.mArray.splice(index, 1);
    this.reindex(index);
  },

  /**
   * Remove the item at the given index.
   *
   * @param index         The index of the item to remove.
   */
  removeByIndex(index) {
    delete this.mHash[this.hashAccessor(this.mArray[index])];
    this.mArray.splice(index, 1);
    this.reindex(index);
  },

  /**
   * Clear the whole array, removing all items. This also resets batch mode.
   */
  clear() {
    this.mHash = {};
    this.mArray = [];
    this.mFirstDirty = -1;
    this.mBatch = 0;
  },

  /**
   * Add the item to the array
   *
   * @param item          The item to add.
   * @returns The index of the added item.
   */
  addItem(item) {
    const index = this.mArray.length;
    this.mArray.push(item);
    this.reindex(index);
    return index;
  },

  /**
   * Modifies the item in the array. If the item is already in the array, then
   * it is replaced by the passed item. Otherwise, the item is added to the
   * array.
   *
   * @param item          The item to modify.
   * @returns The (new) index.
   */
  modifyItem(item) {
    const hashId = this.hashAccessor(item);
    if (hashId in this.mHash) {
      const index = this.mHash[this.hashAccessor(item)];
      this.mArray[index] = item;
      return index;
    }
    return this.addItem(item);
  },

  /**
   * Reindexes the items in the array. This function is mostly used
   * internally. All parameters are inclusive. The ranges are automatically
   * swapped if from > to.
   *
   * @param from      (optional) The index to start indexing from. If left
   *                    out, defaults to 0.
   * @param to        (optional) The index to end indexing on. If left out,
   *                    defaults to the array length.
   */
  reindex(from, to) {
    if (this.mArray.length == 0) {
      return;
    }

    from = from === undefined ? 0 : from;
    to = to === undefined ? this.mArray.length - 1 : to;

    from = Math.min(this.mArray.length - 1, Math.max(0, from));
    to = Math.min(this.mArray.length - 1, Math.max(0, to));

    if (from > to) {
      const tmp = from;
      from = to;
      to = tmp;
    }

    if (this.mBatch > 0) {
      // No indexing in batch mode, but remember from where to index.
      this.mFirstDirty = Math.min(Math.max(0, this.mFirstDirty), from);
      return;
    }

    for (let idx = from; idx <= to; idx++) {
      this.mHash[this.hashAccessor(this.mArray[idx])] = idx;
    }
  },

  startBatch() {
    this.mBatch++;
  },

  endBatch() {
    this.mBatch = Math.max(0, this.mBatch - 1);

    if (this.mBatch == 0 && this.mFirstDirty > -1) {
      this.reindex(this.mFirstDirty);
      this.mFirstDirty = -1;
    }
  },

  /**
   * Iterator to allow iterating the hashed array object.
   */
  *[Symbol.iterator]() {
    yield* this.mArray;
  },
};

/**
 *
 * Sorted hashed array. The array always stays sorted.
 * TODO: unused outside of tests. Remove?
 *
 * Performance Considerations:
 *  - Accessing items is fast
 *  - Adding and deleting items is O(n)
 *  - Modifying items is fast.
 */
export const SortedHashedArray = function (comparator) {
  HashedArray.apply(this, arguments);
  if (!comparator) {
    throw new Error("Sorted Hashed Array needs a comparator");
  }
  this.mCompFunc = comparator;
};

SortedHashedArray.prototype = {
  __proto__: HashedArray.prototype,

  mCompFunc: null,

  addItem(item) {
    const newIndex = data.binaryInsert(this.mArray, item, this.mCompFunc, false);
    this.reindex(newIndex);
    return newIndex;
  },

  modifyItem(item) {
    const hashId = this.hashAccessor(item);
    if (hashId in this.mHash) {
      const cmp = this.mCompFunc(item, this.mArray[this.mHash[hashId]]);
      if (cmp == 0) {
        // The item will be at the same index, we just need to replace it
        this.mArray[this.mHash[hashId]] = item;
        return this.mHash[hashId];
      }
      const oldIndex = this.mHash[hashId];

      const newIndex = data.binaryInsert(this.mArray, item, this.mCompFunc, false);
      this.mArray.splice(oldIndex, 1);
      this.reindex(oldIndex, newIndex);
      return newIndex;
    }
    return this.addItem(item);
  },
};
