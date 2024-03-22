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
class Buffer extends Uint8Array {
  static isBuffer(obj) {
    return obj instanceof Uint8Array;
  }

  // Note that this doesn't fully implement allocate, only enough is implemented
  // for the base-x package to function properly.
  static alloc(size) {
    return new Buffer(size);
  }

  static allocUnsafe(size) {
    return new Buffer(size);
  }

  // These methods are required for the base64 encoding used by the SDK. If we
  // didn't have to provide a global Buffer implementation, these two methods
  // would not be used.
  static from(value, type) {
    if (type === "base64") {
      return super.from(
        atob(value.replaceAll("-", "+").replaceAll("_", "/")),
        c => c.charCodeAt(0)
      );
    }
    return super.from(value);
  }

  toString(type) {
    if (type === "base64") {
      return btoa(
        this.reduce((acc, current) => acc + String.fromCharCode(current), "")
      );
    }
    return super.toString();
  }
}

module.exports = {
  Buffer,
};
