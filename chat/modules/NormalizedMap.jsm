/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

this.EXPORTED_SYMBOLS = ["NormalizedMap"];

/*
 * A Map that automatically normalizes keys before accessing the values.
 *
 * The constructor takes two parameters:
 *  aNormalize:   A function which takes a string and returns the "normalized"
 *                version of it.
 *  aIterable:    A iterable to prefill the map with, keys will be normalized.
 *
 * Returns a Map object that will automatically run aNormalize on any operations
 * involving keys.
 *
 * This implementation should be able to be significantly simplified once bug
 * 838540 is fixed and native inheritance of a JavaScript built-in is possible.
 */
function NormalizedMap(aNormalize, aIterable = []) {
  if (typeof(aNormalize) != "function")
    throw "NormalizedMap must have a normalize function!";
  this._normalize = aNormalize;
  // Create the wrapped Map; use the provided iterable after normalizing the
  // keys.
  this._map = new Map([[aNormalize(key), val] for ([key, val] of aIterable)]);
}
NormalizedMap.prototype = {
  _map: null,
  // The function to apply to all keys.
  _normalize: null,

  // Anything that accepts a key as an input needs to be manually overridden.
  delete(key) { return this._map.delete(this._normalize(key)); },
  get(key) { return this._map.get(this._normalize(key)); },
  has(key) { return this._map.has(this._normalize(key)); },
  set(key, val) {
    this._map.set(this._normalize(key), val);
    return this;
  },

  // The remaining methods are unaffected. Delegate until super is available.
  get size() { return this._map.size; },
  [Symbol.iterator]() { return this._map[Symbol.iterator](); },
  entries() { return this._map.entries(); },
  keys() { return this._map.keys(); },
  values() { return this._map.values(); },
  clear() { this._map.clear(); },
  forEach(aCallback, aThis) { this._map.forEach(aCallback, aThis); }
};
