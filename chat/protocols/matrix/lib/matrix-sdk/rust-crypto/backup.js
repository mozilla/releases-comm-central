"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.RustBackupManager = exports.RustBackupDecryptor = void 0;
exports.requestKeyBackupVersion = requestKeyBackupVersion;
var RustSdkCryptoJs = _interopRequireWildcard(require("@matrix-org/matrix-sdk-crypto-wasm"));
var _logger = require("../logger");
var _httpApi = require("../http-api");
var _crypto = require("../crypto");
var _typedEventEmitter = require("../models/typed-event-emitter");
var _utils = require("../utils");
function _getRequireWildcardCache(e) { if ("function" != typeof WeakMap) return null; var r = new WeakMap(), t = new WeakMap(); return (_getRequireWildcardCache = function (e) { return e ? t : r; })(e); }
function _interopRequireWildcard(e, r) { if (!r && e && e.__esModule) return e; if (null === e || "object" != typeof e && "function" != typeof e) return { default: e }; var t = _getRequireWildcardCache(r); if (t && t.has(e)) return t.get(e); var n = { __proto__: null }, a = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var u in e) if ("default" !== u && {}.hasOwnProperty.call(e, u)) { var i = a ? Object.getOwnPropertyDescriptor(e, u) : null; i && (i.get || i.set) ? Object.defineProperty(n, u, i) : n[u] = e[u]; } return n.default = e, t && t.set(e, n), n; }
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); } /*
Copyright 2023 The Matrix.org Foundation C.I.C.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/
/** Authentification of the backup info, depends on algorithm */

/**
 * Holds information of a created keybackup.
 * Useful to get the generated private key material and save it securely somewhere.
 */

/**
 * @internal
 */
class RustBackupManager extends _typedEventEmitter.TypedEventEmitter {
  constructor(olmMachine, http, outgoingRequestProcessor) {
    super();
    this.olmMachine = olmMachine;
    this.http = http;
    this.outgoingRequestProcessor = outgoingRequestProcessor;
    /** Have we checked if there is a backup on the server which we can use */
    _defineProperty(this, "checkedForBackup", false);
    /**
     * The latest backup version on the server, when we last checked.
     *
     * If there was no backup on the server, `null`. If our attempt to check resulted in an error, `undefined`.
     *
     * Note that the backup was not necessarily verified.
     */
    _defineProperty(this, "serverBackupInfo", undefined);
    _defineProperty(this, "activeBackupVersion", null);
    _defineProperty(this, "stopped", false);
    /** whether {@link backupKeysLoop} is currently running */
    _defineProperty(this, "backupKeysLoopRunning", false);
    _defineProperty(this, "keyBackupCheckInProgress", null);
  }

  /**
   * Tells the RustBackupManager to stop.
   * The RustBackupManager is scheduling background uploads of keys to the backup, this
   * call allows to cancel the process when the client is stoppped.
   */
  stop() {
    this.stopped = true;
  }

  /**
   * Get the backup version we are currently backing up to, if any
   */
  async getActiveBackupVersion() {
    if (!(await this.olmMachine.isBackupEnabled())) return null;
    return this.activeBackupVersion;
  }

  /**
   * Return the details of the latest backup on the server, when we last checked.
   *
   * This normally returns a cached value, but if we haven't yet made a request to the server, it will fire one off.
   * It will always return the details of the active backup if key backup is enabled.
   *
   * If there was no backup on the server, `null`. If our attempt to check resulted in an error, `undefined`.
   */
  async getServerBackupInfo() {
    // Do a validity check if we haven't already done one. The check is likely to fail if we don't yet have the
    // backup keys -- but as a side-effect, it will populate `serverBackupInfo`.
    await this.checkKeyBackupAndEnable(false);
    return this.serverBackupInfo;
  }

  /**
   * Determine if a key backup can be trusted.
   *
   * @param info - key backup info dict from {@link MatrixClient#getKeyBackupVersion}.
   */
  async isKeyBackupTrusted(info) {
    const signatureVerification = await this.olmMachine.verifyBackup(info);
    const backupKeys = await this.olmMachine.getBackupKeys();
    const decryptionKey = backupKeys?.decryptionKey;
    const backupMatchesSavedPrivateKey = !!decryptionKey && backupInfoMatchesBackupDecryptionKey(info, decryptionKey);
    return {
      matchesDecryptionKey: backupMatchesSavedPrivateKey,
      trusted: signatureVerification.trusted()
    };
  }

  /**
   * Re-check the key backup and enable/disable it as appropriate.
   *
   * @param force - whether we should force a re-check even if one has already happened.
   */
  checkKeyBackupAndEnable(force) {
    if (!force && this.checkedForBackup) {
      return Promise.resolve(null);
    }

    // make sure there is only one check going on at a time
    if (!this.keyBackupCheckInProgress) {
      this.keyBackupCheckInProgress = this.doCheckKeyBackup().finally(() => {
        this.keyBackupCheckInProgress = null;
      });
    }
    return this.keyBackupCheckInProgress;
  }

  /**
   * Handles a backup secret received event and store it if it matches the current backup version.
   *
   * @param secret - The secret as received from a `m.secret.send` event for secret `m.megolm_backup.v1`.
   * @returns true if the secret is valid and has been stored, false otherwise.
   */
  async handleBackupSecretReceived(secret) {
    // Currently we only receive the decryption key without any key backup version. It is important to
    // check that the secret is valid for the current version before storing it.
    // We force a check to ensure to have the latest version. We also want to check that the backup is trusted
    // as we don't want to store the secret if the backup is not trusted, and eventually import megolm keys later from an untrusted backup.
    const backupCheck = await this.checkKeyBackupAndEnable(true);
    if (!backupCheck?.backupInfo?.version || !backupCheck.trustInfo.trusted) {
      // There is no server-side key backup, or the backup is not signed by a trusted cross-signing key or trusted own device.
      // This decryption key is useless to us.
      _logger.logger.warn("handleBackupSecretReceived: Received a backup decryption key, but there is no trusted server-side key backup");
      return false;
    }
    try {
      const backupDecryptionKey = RustSdkCryptoJs.BackupDecryptionKey.fromBase64(secret);
      const privateKeyMatches = backupInfoMatchesBackupDecryptionKey(backupCheck.backupInfo, backupDecryptionKey);
      if (!privateKeyMatches) {
        _logger.logger.warn(`handleBackupSecretReceived: Private decryption key does not match the public key of the current remote backup.`);
        // just ignore the secret
        return false;
      }
      _logger.logger.info(`handleBackupSecretReceived: A valid backup decryption key has been received and stored in cache.`);
      await this.saveBackupDecryptionKey(backupDecryptionKey, backupCheck.backupInfo.version);
      return true;
    } catch (e) {
      _logger.logger.warn("handleBackupSecretReceived: Invalid backup decryption key", e);
    }
    return false;
  }
  async saveBackupDecryptionKey(backupDecryptionKey, version) {
    await this.olmMachine.saveBackupDecryptionKey(backupDecryptionKey, version);
    // Emit an event that we have a new backup decryption key, so that the sdk can start
    // importing keys from backup if needed.
    this.emit(_crypto.CryptoEvent.KeyBackupDecryptionKeyCached, version);
  }

  /**
   * Import a list of room keys previously exported by exportRoomKeys
   *
   * @param keys - a list of session export objects
   * @param opts - options object
   * @returns a promise which resolves once the keys have been imported
   */
  async importRoomKeys(keys, opts) {
    await this.importRoomKeysAsJson(JSON.stringify(keys), opts);
  }

  /**
   * Import a list of room keys previously exported by exportRoomKeysAsJson
   *
   * @param keys - a JSON string encoding a list of session export objects,
   *    each of which is an IMegolmSessionData
   * @param opts - options object
   * @returns a promise which resolves once the keys have been imported
   */
  async importRoomKeysAsJson(jsonKeys, opts) {
    await this.olmMachine.importExportedRoomKeys(jsonKeys, (progress, total) => {
      const importOpt = {
        total: Number(total),
        successes: Number(progress),
        stage: "load_keys",
        failures: 0
      };
      opts?.progressCallback?.(importOpt);
    });
  }

  /**
   * Implementation of {@link CryptoBackend#importBackedUpRoomKeys}.
   */
  async importBackedUpRoomKeys(keys, backupVersion, opts) {
    const keysByRoom = new Map();
    for (const key of keys) {
      const roomId = new RustSdkCryptoJs.RoomId(key.room_id);
      if (!keysByRoom.has(roomId)) {
        keysByRoom.set(roomId, new Map());
      }
      keysByRoom.get(roomId).set(key.session_id, key);
    }
    await this.olmMachine.importBackedUpRoomKeys(keysByRoom, (progress, total, failures) => {
      const importOpt = {
        total: Number(total),
        successes: Number(progress),
        stage: "load_keys",
        failures: Number(failures)
      };
      opts?.progressCallback?.(importOpt);
    }, backupVersion);
  }
  /** Helper for `checkKeyBackup` */
  async doCheckKeyBackup() {
    _logger.logger.log("Checking key backup status...");
    let backupInfo;
    try {
      backupInfo = await this.requestKeyBackupVersion();
    } catch (e) {
      _logger.logger.warn("Error checking for active key backup", e);
      this.serverBackupInfo = undefined;
      return null;
    }
    this.checkedForBackup = true;
    if (backupInfo && !backupInfo.version) {
      _logger.logger.warn("active backup lacks a useful 'version'; ignoring it");
      backupInfo = undefined;
    }
    this.serverBackupInfo = backupInfo;
    const activeVersion = await this.getActiveBackupVersion();
    if (!backupInfo) {
      if (activeVersion !== null) {
        _logger.logger.log("No key backup present on server: disabling key backup");
        await this.disableKeyBackup();
      } else {
        _logger.logger.log("No key backup present on server: not enabling key backup");
      }
      return null;
    }
    const trustInfo = await this.isKeyBackupTrusted(backupInfo);
    if (!trustInfo.trusted) {
      if (activeVersion !== null) {
        _logger.logger.log("Key backup present on server but not trusted: disabling key backup");
        await this.disableKeyBackup();
      } else {
        _logger.logger.log("Key backup present on server but not trusted: not enabling key backup");
      }
    } else {
      if (activeVersion === null) {
        _logger.logger.log(`Found usable key backup v${backupInfo.version}: enabling key backups`);
        await this.enableKeyBackup(backupInfo);
      } else if (activeVersion !== backupInfo.version) {
        _logger.logger.log(`On backup version ${activeVersion} but found version ${backupInfo.version}: switching.`);
        // This will remove any pending backup request, remove the backup key and reset the backup state of each room key we have.
        await this.disableKeyBackup();
        // Enabling will now trigger re-upload of all the keys
        await this.enableKeyBackup(backupInfo);
      } else {
        _logger.logger.log(`Backup version ${backupInfo.version} still current`);
      }
    }
    return {
      backupInfo,
      trustInfo
    };
  }
  async enableKeyBackup(backupInfo) {
    // we know for certain it must be a Curve25519 key, because we have verified it and only Curve25519
    // keys can be verified.
    //
    // we also checked it has a valid `version`.
    await this.olmMachine.enableBackupV1(backupInfo.auth_data.public_key, backupInfo.version);
    this.activeBackupVersion = backupInfo.version;
    this.emit(_crypto.CryptoEvent.KeyBackupStatus, true);
    this.backupKeysLoop();
  }

  /**
   * Restart the backup key loop if there is an active trusted backup.
   * Doesn't try to check the backup server side. To be called when a new
   * megolm key is known locally.
   */
  async maybeUploadKey() {
    if (this.activeBackupVersion != null) {
      this.backupKeysLoop();
    }
  }
  async disableKeyBackup() {
    await this.olmMachine.disableBackup();
    this.activeBackupVersion = null;
    this.emit(_crypto.CryptoEvent.KeyBackupStatus, false);
  }
  async backupKeysLoop(maxDelay = 10000) {
    if (this.backupKeysLoopRunning) {
      _logger.logger.log(`Backup loop already running`);
      return;
    }
    this.backupKeysLoopRunning = true;
    _logger.logger.log(`Backup: Starting keys upload loop for backup version:${this.activeBackupVersion}.`);

    // wait between 0 and `maxDelay` seconds, to avoid backup
    // requests from different clients hitting the server all at
    // the same time when a new key is sent
    const delay = Math.random() * maxDelay;
    await (0, _utils.sleep)(delay);
    try {
      // number of consecutive network failures for exponential backoff
      let numFailures = 0;
      // The number of keys left to back up. (Populated lazily: see more comments below.)
      let remainingToUploadCount = null;
      // To avoid computing the key when only a few keys were added (after a sync for example),
      // we compute the count only when at least two iterations are needed.
      let isFirstIteration = true;
      while (!this.stopped) {
        // Get a batch of room keys to upload
        let request = null;
        try {
          request = await (0, _utils.logDuration)(_logger.logger, "BackupRoomKeys: Get keys to backup from rust crypto-sdk", async () => {
            return await this.olmMachine.backupRoomKeys();
          });
        } catch (err) {
          _logger.logger.error("Backup: Failed to get keys to backup from rust crypto-sdk", err);
        }
        if (!request || this.stopped || !this.activeBackupVersion) {
          _logger.logger.log(`Backup: Ending loop for version ${this.activeBackupVersion}.`);
          if (!request) {
            // nothing more to upload
            this.emit(_crypto.CryptoEvent.KeyBackupSessionsRemaining, 0);
          }
          return;
        }
        try {
          await this.outgoingRequestProcessor.makeOutgoingRequest(request);
          numFailures = 0;
          if (this.stopped) break;

          // Key count performance (`olmMachine.roomKeyCounts()`) can be pretty bad on some configurations.
          // In particular, we detected on some M1 macs that when the object store reaches a threshold, the count
          // performance stops growing in O(n) and suddenly becomes very slow (40s, 60s or more).
          // For reference, the performance drop occurs around 300-400k keys on the platforms where this issue is observed.
          // Even on other configurations, the count can take several seconds.
          // This will block other operations on the database, like sending messages.
          //
          // This is a workaround to avoid calling `olmMachine.roomKeyCounts()` too often, and only when necessary.
          // We don't call it on the first loop because there could be only a few keys to upload, and we don't want to wait for the count.
          if (!isFirstIteration && remainingToUploadCount === null) {
            try {
              const keyCount = await this.olmMachine.roomKeyCounts();
              remainingToUploadCount = keyCount.total - keyCount.backedUp;
            } catch (err) {
              _logger.logger.error("Backup: Failed to get key counts from rust crypto-sdk", err);
            }
          }
          if (remainingToUploadCount !== null) {
            this.emit(_crypto.CryptoEvent.KeyBackupSessionsRemaining, remainingToUploadCount);
            const keysCountInBatch = this.keysCountInBatch(request);
            // `OlmMachine.roomKeyCounts` is called only once for the current backupKeysLoop. But new
            // keys could be added during the current loop (after a sync for example).
            // So the count can get out of sync with the real number of remaining keys to upload.
            // Depending on the number of new keys imported and the time to complete the loop,
            // this could result in multiple events being emitted with a remaining key count of 0.
            remainingToUploadCount = Math.max(remainingToUploadCount - keysCountInBatch, 0);
          }
        } catch (err) {
          numFailures++;
          _logger.logger.error("Backup: Error processing backup request for rust crypto-sdk", err);
          if (err instanceof _httpApi.MatrixError) {
            const errCode = err.data.errcode;
            if (errCode == "M_NOT_FOUND" || errCode == "M_WRONG_ROOM_KEYS_VERSION") {
              _logger.logger.log(`Backup: Failed to upload keys to current vesion: ${errCode}.`);
              try {
                await this.disableKeyBackup();
              } catch (error) {
                _logger.logger.error("Backup: An error occurred while disabling key backup:", error);
              }
              this.emit(_crypto.CryptoEvent.KeyBackupFailed, err.data.errcode);
              // There was an active backup and we are out of sync with the server
              // force a check server side
              this.backupKeysLoopRunning = false;
              this.checkKeyBackupAndEnable(true);
              return;
            } else if (errCode == "M_LIMIT_EXCEEDED") {
              // wait for that and then continue?
              const waitTime = err.data.retry_after_ms;
              if (waitTime > 0) {
                await (0, _utils.sleep)(waitTime);
                continue;
              } // else go to the normal backoff
            }
          }

          // Some other errors (mx, network, or CORS or invalid urls?) anyhow backoff
          // exponential backoff if we have failures
          await (0, _utils.sleep)(1000 * Math.pow(2, Math.min(numFailures - 1, 4)));
        }
        isFirstIteration = false;
      }
    } finally {
      this.backupKeysLoopRunning = false;
    }
  }

  /**
   * Utility method to count the number of keys in a backup request, in order to update the remaining keys count.
   * This should be the chunk size of the backup request for all requests but the last, but we don't have access to it
   * (it's static in the Rust SDK).
   * @param batch - The backup request to count the keys from.
   *
   * @returns The number of keys in the backup request.
   */
  keysCountInBatch(batch) {
    const parsedBody = JSON.parse(batch.body);
    let count = 0;
    for (const {
      sessions
    } of Object.values(parsedBody.rooms)) {
      count += Object.keys(sessions).length;
    }
    return count;
  }

  /**
   * Get information about the current key backup from the server
   *
   * @returns Information object from API or null if there is no active backup.
   */
  async requestKeyBackupVersion() {
    return await requestKeyBackupVersion(this.http);
  }

  /**
   * Creates a new key backup by generating a new random private key.
   *
   * If there is an existing backup server side it will be deleted and replaced
   * by the new one.
   *
   * @param signObject - Method that should sign the backup with existing device and
   * existing identity.
   * @returns a KeyBackupCreationInfo - All information related to the backup.
   */
  async setupKeyBackup(signObject) {
    // Clean up any existing backup
    await this.deleteAllKeyBackupVersions();
    const randomKey = RustSdkCryptoJs.BackupDecryptionKey.createRandomKey();
    const pubKey = randomKey.megolmV1PublicKey;
    const authData = {
      public_key: pubKey.publicKeyBase64
    };
    await signObject(authData);
    const res = await this.http.authedRequest(_httpApi.Method.Post, "/room_keys/version", undefined, {
      algorithm: pubKey.algorithm,
      auth_data: authData
    }, {
      prefix: _httpApi.ClientPrefix.V3
    });
    await this.saveBackupDecryptionKey(randomKey, res.version);
    return {
      version: res.version,
      algorithm: pubKey.algorithm,
      authData: authData,
      decryptionKey: randomKey
    };
  }

  /**
   * Deletes all key backups.
   *
   * Will call the API to delete active backup until there is no more present.
   */
  async deleteAllKeyBackupVersions() {
    // there could be several backup versions. Delete all to be safe.
    let current = (await this.requestKeyBackupVersion())?.version ?? null;
    while (current != null) {
      await this.deleteKeyBackupVersion(current);
      current = (await this.requestKeyBackupVersion())?.version ?? null;
    }

    // XXX: Should this also update Secret Storage and delete any existing keys?
  }

  /**
   * Deletes the given key backup.
   *
   * @param version - The backup version to delete.
   */
  async deleteKeyBackupVersion(version) {
    _logger.logger.debug(`deleteKeyBackupVersion v:${version}`);
    const path = (0, _utils.encodeUri)("/room_keys/version/$version", {
      $version: version
    });
    await this.http.authedRequest(_httpApi.Method.Delete, path, undefined, undefined, {
      prefix: _httpApi.ClientPrefix.V3
    });
  }

  /**
   * Creates a new backup decryptor for the given private key.
   * @param decryptionKey - The private key to use for decryption.
   */
  createBackupDecryptor(decryptionKey) {
    return new RustBackupDecryptor(decryptionKey);
  }
}

/**
 * Checks if the provided backup info matches the given private key.
 *
 * @param info - The backup info to check.
 * @param backupDecryptionKey - The `BackupDecryptionKey` private key to check against.
 * @returns `true` if the private key can decrypt the backup, `false` otherwise.
 */
exports.RustBackupManager = RustBackupManager;
function backupInfoMatchesBackupDecryptionKey(info, backupDecryptionKey) {
  if (info.algorithm !== "m.megolm_backup.v1.curve25519-aes-sha2") {
    _logger.logger.warn("backupMatchesPrivateKey: Unsupported backup algorithm", info.algorithm);
    return false;
  }
  return info.auth_data?.public_key === backupDecryptionKey.megolmV1PublicKey.publicKeyBase64;
}

/**
 * Implementation of {@link BackupDecryptor} for the rust crypto backend.
 */
class RustBackupDecryptor {
  constructor(decryptionKey) {
    _defineProperty(this, "decryptionKey", void 0);
    _defineProperty(this, "sourceTrusted", void 0);
    this.decryptionKey = decryptionKey;
    this.sourceTrusted = false;
  }

  /**
   * Implements {@link BackupDecryptor#decryptSessions}
   */
  async decryptSessions(ciphertexts) {
    const keys = [];
    for (const [sessionId, sessionData] of Object.entries(ciphertexts)) {
      try {
        const decrypted = JSON.parse(this.decryptionKey.decryptV1(sessionData.session_data.ephemeral, sessionData.session_data.mac, sessionData.session_data.ciphertext));
        decrypted.session_id = sessionId;
        keys.push(decrypted);
      } catch (e) {
        _logger.logger.log("Failed to decrypt megolm session from backup", e, sessionData);
      }
    }
    return keys;
  }

  /**
   * Implements {@link BackupDecryptor#free}
   */
  free() {
    this.decryptionKey.free();
  }
}
exports.RustBackupDecryptor = RustBackupDecryptor;
async function requestKeyBackupVersion(http) {
  try {
    return await http.authedRequest(_httpApi.Method.Get, "/room_keys/version", undefined, undefined, {
      prefix: _httpApi.ClientPrefix.V3
    });
  } catch (e) {
    if (e.errcode === "M_NOT_FOUND") {
      return null;
    } else {
      throw e;
    }
  }
}