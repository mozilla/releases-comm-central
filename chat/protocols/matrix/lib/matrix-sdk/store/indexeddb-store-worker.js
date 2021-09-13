"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.IndexedDBStoreWorker = void 0;

var _indexeddbLocalBackend = require("./indexeddb-local-backend");

var _logger = require("../logger");

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

/**
 * This class lives in the webworker and drives a LocalIndexedDBStoreBackend
 * controlled by messages from the main process.
 *
 * It should be instantiated by a web worker script provided by the application
 * in a script, for example:
 *
 * import {IndexedDBStoreWorker} from 'matrix-js-sdk/lib/indexeddb-worker.js';
 * const remoteWorker = new IndexedDBStoreWorker(postMessage);
 * onmessage = remoteWorker.onMessage;
 *
 * Note that it is advisable to import this class by referencing the file directly to
 * avoid a dependency on the whole js-sdk.
 *
 */
class IndexedDBStoreWorker {
  /**
   * @param {function} postMessage The web worker postMessage function that
   * should be used to communicate back to the main script.
   */
  constructor(postMessage) {
    this.postMessage = postMessage;

    _defineProperty(this, "backend", null);

    _defineProperty(this, "onMessage", ev => {
      const msg = ev.data;
      let prom;

      switch (msg.command) {
        case '_setupWorker':
          // this is the 'indexedDB' global (where global != window
          // because it's a web worker and there is no window).
          this.backend = new _indexeddbLocalBackend.LocalIndexedDBStoreBackend(indexedDB, msg.args[0]);
          prom = Promise.resolve();
          break;

        case 'connect':
          prom = this.backend.connect();
          break;

        case 'isNewlyCreated':
          prom = this.backend.isNewlyCreated();
          break;

        case 'clearDatabase':
          prom = this.backend.clearDatabase();
          break;

        case 'getSavedSync':
          prom = this.backend.getSavedSync(false);
          break;

        case 'setSyncData':
          prom = this.backend.setSyncData(msg.args[0]);
          break;

        case 'syncToDatabase':
          prom = this.backend.syncToDatabase(msg.args[0]);
          break;

        case 'getUserPresenceEvents':
          prom = this.backend.getUserPresenceEvents();
          break;

        case 'getNextBatchToken':
          prom = this.backend.getNextBatchToken();
          break;

        case 'getOutOfBandMembers':
          prom = this.backend.getOutOfBandMembers(msg.args[0]);
          break;

        case 'clearOutOfBandMembers':
          prom = this.backend.clearOutOfBandMembers(msg.args[0]);
          break;

        case 'setOutOfBandMembers':
          prom = this.backend.setOutOfBandMembers(msg.args[0], msg.args[1]);
          break;

        case 'getClientOptions':
          prom = this.backend.getClientOptions();
          break;

        case 'storeClientOptions':
          prom = this.backend.storeClientOptions(msg.args[0]);
          break;
      }

      if (prom === undefined) {
        this.postMessage({
          command: 'cmd_fail',
          seq: msg.seq,
          // Can't be an Error because they're not structured cloneable
          error: "Unrecognised command"
        });
        return;
      }

      prom.then(ret => {
        this.postMessage.call(null, {
          command: 'cmd_success',
          seq: msg.seq,
          result: ret
        });
      }, err => {
        _logger.logger.error("Error running command: " + msg.command);

        _logger.logger.error(err);

        this.postMessage.call(null, {
          command: 'cmd_fail',
          seq: msg.seq,
          // Just send a string because Error objects aren't cloneable
          error: {
            message: err.message,
            name: err.name
          }
        });
      });
    });
  }
  /**
   * Passes a message event from the main script into the class. This method
   * can be directly assigned to the web worker `onmessage` variable.
   *
   * @param {Object} ev The message event
   */


}

exports.IndexedDBStoreWorker = IndexedDBStoreWorker;