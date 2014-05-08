/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["NormalizedMap"];

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
  delete: function(aKey) this._map.delete(this._normalize(aKey)),
  get: function(aKey) this._map.get(this._normalize(aKey)),
  has: function(aKey) this._map.has(this._normalize(aKey)),
  set: function(aKey, aValue) this._map.set(this._normalize(aKey), aValue),

  // Properties must be manually forwarded.
  get size() this._map.size,

  // Here's where the magic happens. If a method is called that isn't defined
  // here, just pass it to the internal _map object.
  __noSuchMethod__: function(aId, aArgs) this._map[aId].apply(this._map, aArgs)
};
