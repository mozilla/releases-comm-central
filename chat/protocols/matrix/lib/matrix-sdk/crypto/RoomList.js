"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.RoomList = void 0;
var _indexeddbCryptoStore = require("./store/indexeddb-crypto-store");
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); } /*
Copyright 2018 - 2021 The Matrix.org Foundation C.I.C.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/ /**
 * Manages the list of encrypted rooms
 */
/* eslint-disable camelcase */

/* eslint-enable camelcase */

/**
 * Information about the encryption settings of rooms. Loads this information
 * from the supplied crypto store when `init()` is called, and saves it to the
 * crypto store whenever it is updated via `setRoomEncryption()`. Can supply
 * full information about a room's encryption via `getRoomEncryption()`, or just
 * answer whether or not a room has encryption via `isRoomEncrypted`.
 */
class RoomList {
  constructor(cryptoStore) {
    this.cryptoStore = cryptoStore;
    // Object of roomId -> room e2e info object (body of the m.room.encryption event)
    _defineProperty(this, "roomEncryption", {});
  }
  async init() {
    await this.cryptoStore.doTxn("readwrite", [_indexeddbCryptoStore.IndexedDBCryptoStore.STORE_ROOMS], txn => {
      this.cryptoStore.getEndToEndRooms(txn, result => {
        this.roomEncryption = result;
      });
    });
  }
  getRoomEncryption(roomId) {
    return this.roomEncryption[roomId] || null;
  }
  isRoomEncrypted(roomId) {
    return Boolean(this.getRoomEncryption(roomId));
  }
  async setRoomEncryption(roomId, roomInfo) {
    // important that this happens before calling into the store
    // as it prevents the Crypto::setRoomEncryption from calling
    // this twice for consecutive m.room.encryption events
    this.roomEncryption[roomId] = roomInfo;
    await this.cryptoStore.doTxn("readwrite", [_indexeddbCryptoStore.IndexedDBCryptoStore.STORE_ROOMS], txn => {
      this.cryptoStore.storeEndToEndRoom(roomId, roomInfo, txn);
    });
  }
}
exports.RoomList = RoomList;