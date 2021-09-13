"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.RoomList = void 0;

var _indexeddbCryptoStore = require("./store/indexeddb-crypto-store");

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

/* eslint-enable camelcase */

/**
 * @alias module:crypto/RoomList
 */
class RoomList {
  // Object of roomId -> room e2e info object (body of the m.room.encryption event)
  constructor(cryptoStore) {
    this.cryptoStore = cryptoStore;

    _defineProperty(this, "roomEncryption", {});
  }

  async init() {
    await this.cryptoStore.doTxn('readwrite', [_indexeddbCryptoStore.IndexedDBCryptoStore.STORE_ROOMS], txn => {
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
    await this.cryptoStore.doTxn('readwrite', [_indexeddbCryptoStore.IndexedDBCryptoStore.STORE_ROOMS], txn => {
      this.cryptoStore.storeEndToEndRoom(roomId, roomInfo, txn);
    });
  }

}

exports.RoomList = RoomList;