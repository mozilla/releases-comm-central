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

export function CachedStore(name, engine) {
  Store.call(this, name, engine);
}
CachedStore.prototype = {
  __proto__: Store.prototype,

  async create(record) {
    await setData(this.name, record.id, record.cleartext);
  },

  async remove(record) {
    await setData(this.name, record.id, null);
  },

  async update(record) {
    await setData(this.name, record.id, record.cleartext);
  },

  async itemExists(id) {
    return id in (await this.getAllIDs());
  },

  async getAllIDs() {
    const ids = {};
    const keys = await getDataKeys(this.name);
    for (const k of keys) {
      ids[k] = true;
    }
    return ids;
  },

  async getCreateRecordData(id) {
    return getData(this.name, id);
  },
};
