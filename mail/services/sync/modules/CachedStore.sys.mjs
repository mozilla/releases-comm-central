/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This is a cache of all records that go to or from the storage servers from
 * subclasses (i.e. the Thunderbird stores, but not the toolkit stores). It is
 * used to provide compatibility with future versions of Thunderbird. A store
 * must be able to round-trip information it doesn't understand or has chosen
 * to ignore, so this class stores the information in the profile directory
 * for retrieval when required.
 */

import { Store } from "resource://services-sync/engines.sys.mjs";
import { JSONFile } from "resource://gre/modules/JSONFile.sys.mjs";

const jsonFile = new JSONFile({
  path: PathUtils.join(PathUtils.profileDir, "syncDataCache.lz4"),
  compression: true,
});

async function getEngineData(engine) {
  await jsonFile.load();
  if (!jsonFile.data[engine]) {
    jsonFile.data[engine] = {};
  }
  return jsonFile.data[engine];
}

async function getDataKeys(engine) {
  return Object.keys(await getEngineData(engine));
}

async function getData(engine, key) {
  return (await getEngineData(engine))[key];
}

async function setData(engine, key, value) {
  const data = await getEngineData(engine);
  if (value) {
    data[key] = value;
  } else {
    delete data[key];
  }
  jsonFile.saveSoon();
}

/**
 * An engine store that automatically caches data sent to and from the server.
 *
 * @extends {Store}
 * @see {engines.sys.mjs}
 */
export function CachedStore(name, engine) {
  Store.call(this, name, engine);
}
CachedStore.prototype = {
  __proto__: Store.prototype,
  _deleted: new Set(),

  /**
   * Apply a single record against the store.
   *
   * @param {CryptoWrapper} record
   */
  async create(record) {
    await setData(this.name, record.id, record.cleartext);
  },

  /**
   * Remove an item in the store from a record.
   *
   * @param {CryptoWrapper} record
   */
  async remove(record) {
    await setData(this.name, record.id, null);
  },

  /**
   * Remove record data from the cache, but first record the record's ID as
   * deleted, so we can return immediately.
   *
   * @param {string} id
   */
  markDeleted(id) {
    this._deleted.add(id);
    setData(this.name, id, null).then(() => this._deleted.delete(id));
  },

  /**
   * Update an item from a record.
   *
   * @param {CryptoWrapper} record
   */
  async update(record) {
    await setData(this.name, record.id, record.cleartext);
  },

  /**
   * Determine whether a record with the specified ID exists.
   *
   * @param {string} id
   * @return {boolean}
   */
  async itemExists(id) {
    return id in (await this.getAllIDs());
  },

  /**
   * Obtain the set of all known record IDs.
   *
   * @return {object}
   */
  async getAllIDs() {
    const ids = {};
    const keys = await getDataKeys(this.name);
    for (const k of keys) {
      if (!this._deleted.has(ids[k])) {
        ids[k] = true;
      }
    }
    return ids;
  },

  /**
   * Get record data from the cache, but not if the ID is marked as deleted.
   *
   * @return {object}
   */
  async getCreateRecordData(id) {
    if (this._deleted.has(id)) {
      return null;
    }
    return getData(this.name, id);
  },
};
