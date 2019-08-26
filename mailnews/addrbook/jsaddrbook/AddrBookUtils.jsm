/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

this.EXPORTED_SYMBOLS = ["newUID", "SimpleEnumerator"];

ChromeUtils.defineModuleGetter(this, "XPCOMUtils", "resource://gre/modules/XPCOMUtils.jsm");

XPCOMUtils.defineLazyServiceGetter(
  this, "uuidGenerator", "@mozilla.org/uuid-generator;1", "nsIUUIDGenerator"
);

function SimpleEnumerator(elements) {
  this._elements = elements;
  this._position = 0;
}
SimpleEnumerator.prototype = {
  hasMoreElements() {
    return this._position < this._elements.length;
  },
  getNext() {
    if (this.hasMoreElements()) {
      return this._elements[this._position++];
    }
    throw Cr.NS_ERROR_NOT_AVAILABLE;
  },
  QueryInterface: ChromeUtils.generateQI([Ci.nsISimpleEnumerator]),
  * [Symbol.iterator]() {
    while (this.hasMoreElements()) {
      yield this.getNext();
    }
  },
};

function newUID() {
  return uuidGenerator.generateUUID().toString().substring(1, 37);
}
