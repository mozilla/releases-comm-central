/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* globals module */

/*
 * Per the Node.js documentation, a Buffer is an instance of Uint8Array, but
 * additional class methods are missing for it.
 *
 * https://nodejs.org/docs/latest/api/buffer.html#buffer_buffers_and_typedarray
 */
var Buffer = {
  isBuffer(obj) {
    return obj.constructor == Uint8Array;
  },

  // Note that this doesn't fully implement allocate, only enough is implemented
  // for the base-x package to function properly.
  alloc(size, fill, encoding) {
    return new Uint8Array(size);
  },

  allocUnsafe(size) {
    return new Uint8Array(size);
  },
};

module.exports = {
  Buffer,
};
