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
 */
class NormalizedMap extends Map {
  constructor(aNormalize, aIterable = []) {
    if (typeof(aNormalize) != "function")
      throw "NormalizedMap must have a normalize function!";
    // Create the wrapped Map; use the provided iterable after normalizing the
    // keys.
    let entries = [...aIterable].map(([key, val]) => [aNormalize(key), val]);
    super(entries);
    // Note: In derived classes, super() must be called before using 'this'.
    this._normalize = aNormalize;
  }

  // Dummy normalize function.
  _normalize(aKey) { return aKey; }

  // Anything that accepts a key as an input needs to be manually overridden.
  delete(key) { return super.delete(this._normalize(key)); }
  get(key) { return super.get(this._normalize(key)); }
  has(key) { return super.has(this._normalize(key)); }
  set(key, val) {
    super.set(this._normalize(key), val);
    return this;
  }
};
