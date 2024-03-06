"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.migrateFromLegacyCrypto = migrateFromLegacyCrypto;
exports.migrateRoomSettingsFromLegacyCrypto = migrateRoomSettingsFromLegacyCrypto;
var RustSdkCryptoJs = _interopRequireWildcard(require("@matrix-org/matrix-sdk-crypto-wasm"));
var _base = require("../crypto/store/base");
var _indexeddbCryptoStore = require("../crypto/store/indexeddb-crypto-store");
var _aes = require("../crypto/aes");
var _backup = require("./backup");
function _getRequireWildcardCache(e) { if ("function" != typeof WeakMap) return null; var r = new WeakMap(), t = new WeakMap(); return (_getRequireWildcardCache = function (e) { return e ? t : r; })(e); }
function _interopRequireWildcard(e, r) { if (!r && e && e.__esModule) return e; if (null === e || "object" != typeof e && "function" != typeof e) return { default: e }; var t = _getRequireWildcardCache(r); if (t && t.has(e)) return t.get(e); var n = { __proto__: null }, a = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var u in e) if ("default" !== u && Object.prototype.hasOwnProperty.call(e, u)) { var i = a ? Object.getOwnPropertyDescriptor(e, u) : null; i && (i.get || i.set) ? Object.defineProperty(n, u, i) : n[u] = e[u]; } return n.default = e, t && t.set(e, n), n; }
/*
Copyright 2023-2024 The Matrix.org Foundation C.I.C.

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

/**
 * Determine if any data needs migrating from the legacy store, and do so.
 *
 * This migrates the base account data, and olm and megolm sessions. It does *not* migrate the room list, which should
 * happen after an `OlmMachine` is created, via {@link migrateRoomSettingsFromLegacyCrypto}.
 *
 * @param args - Arguments object.
 */
async function migrateFromLegacyCrypto(args) {
  const {
    logger,
    legacyStore
  } = args;

  // initialise the rust matrix-sdk-crypto-wasm, if it hasn't already been done
  await RustSdkCryptoJs.initAsync();

  // enable tracing in the rust-sdk
  new RustSdkCryptoJs.Tracing(RustSdkCryptoJs.LoggerLevel.Debug).turnOn();
  if (!(await legacyStore.containsData())) {
    // This store was never used. Nothing to migrate.
    return;
  }
  await legacyStore.startup();
  let migrationState = await legacyStore.getMigrationState();
  if (migrationState >= _base.MigrationState.MEGOLM_SESSIONS_MIGRATED) {
    // All migration is done for now. The room list comes later, once we have an OlmMachine.
    return;
  }
  const nOlmSessions = await countOlmSessions(logger, legacyStore);
  const nMegolmSessions = await countMegolmSessions(logger, legacyStore);
  const totalSteps = 1 + nOlmSessions + nMegolmSessions;
  logger.info(`Migrating data from legacy crypto store. ${nOlmSessions} olm sessions and ${nMegolmSessions} megolm sessions to migrate.`);
  let stepsDone = 0;
  function onProgress(steps) {
    stepsDone += steps;
    args.legacyMigrationProgressListener?.(stepsDone, totalSteps);
  }
  onProgress(0);
  const pickleKey = new TextEncoder().encode(args.legacyPickleKey);
  if (migrationState === _base.MigrationState.NOT_STARTED) {
    logger.info("Migrating data from legacy crypto store. Step 1: base data");
    await migrateBaseData(args.http, args.userId, args.deviceId, legacyStore, pickleKey, args.storeHandle);
    migrationState = _base.MigrationState.INITIAL_DATA_MIGRATED;
    await legacyStore.setMigrationState(migrationState);
  }
  onProgress(1);
  if (migrationState === _base.MigrationState.INITIAL_DATA_MIGRATED) {
    logger.info(`Migrating data from legacy crypto store. Step 2: olm sessions (${nOlmSessions} sessions to migrate).`);
    await migrateOlmSessions(logger, legacyStore, pickleKey, args.storeHandle, onProgress);
    migrationState = _base.MigrationState.OLM_SESSIONS_MIGRATED;
    await legacyStore.setMigrationState(migrationState);
  }
  if (migrationState === _base.MigrationState.OLM_SESSIONS_MIGRATED) {
    logger.info(`Migrating data from legacy crypto store. Step 3: megolm sessions (${nMegolmSessions} sessions to migrate).`);
    await migrateMegolmSessions(logger, legacyStore, pickleKey, args.storeHandle, onProgress);
    migrationState = _base.MigrationState.MEGOLM_SESSIONS_MIGRATED;
    await legacyStore.setMigrationState(migrationState);
  }

  // Migration is done.
  args.legacyMigrationProgressListener?.(-1, -1);
  logger.info("Migration from legacy crypto store complete");
}
async function migrateBaseData(http, userId, deviceId, legacyStore, pickleKey, storeHandle) {
  const migrationData = new RustSdkCryptoJs.BaseMigrationData();
  migrationData.userId = new RustSdkCryptoJs.UserId(userId);
  migrationData.deviceId = new RustSdkCryptoJs.DeviceId(deviceId);
  await legacyStore.doTxn("readonly", [_indexeddbCryptoStore.IndexedDBCryptoStore.STORE_ACCOUNT], txn => legacyStore.getAccount(txn, a => {
    migrationData.pickledAccount = a ?? "";
  }));
  const recoveryKey = await getAndDecryptCachedSecretKey(legacyStore, pickleKey, "m.megolm_backup.v1");

  // If we have a backup recovery key, we need to try to figure out which backup version it is for.
  // All we can really do is ask the server for the most recent version.
  if (recoveryKey) {
    const backupInfo = await (0, _backup.requestKeyBackupVersion)(http);
    if (backupInfo) {
      migrationData.backupVersion = backupInfo.version;
      migrationData.backupRecoveryKey = recoveryKey;
    }
  }
  migrationData.privateCrossSigningMasterKey = await getAndDecryptCachedSecretKey(legacyStore, pickleKey, "master");
  migrationData.privateCrossSigningSelfSigningKey = await getAndDecryptCachedSecretKey(legacyStore, pickleKey, "self_signing");
  migrationData.privateCrossSigningUserSigningKey = await getAndDecryptCachedSecretKey(legacyStore, pickleKey, "user_signing");
  await RustSdkCryptoJs.Migration.migrateBaseData(migrationData, pickleKey, storeHandle);
}
async function countOlmSessions(logger, legacyStore) {
  logger.debug("Counting olm sessions to be migrated");
  let nSessions;
  await legacyStore.doTxn("readonly", [_indexeddbCryptoStore.IndexedDBCryptoStore.STORE_SESSIONS], txn => legacyStore.countEndToEndSessions(txn, n => nSessions = n));
  return nSessions;
}
async function countMegolmSessions(logger, legacyStore) {
  logger.debug("Counting megolm sessions to be migrated");
  return await legacyStore.countEndToEndInboundGroupSessions();
}
async function migrateOlmSessions(logger, legacyStore, pickleKey, storeHandle, onBatchDone) {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const batch = await legacyStore.getEndToEndSessionsBatch();
    if (batch === null) return;
    logger.debug(`Migrating batch of ${batch.length} olm sessions`);
    const migrationData = [];
    for (const session of batch) {
      const pickledSession = new RustSdkCryptoJs.PickledSession();
      pickledSession.senderKey = session.deviceKey;
      pickledSession.pickle = session.session;
      pickledSession.lastUseTime = pickledSession.creationTime = new Date(session.lastReceivedMessageTs);
      migrationData.push(pickledSession);
    }
    await RustSdkCryptoJs.Migration.migrateOlmSessions(migrationData, pickleKey, storeHandle);
    await legacyStore.deleteEndToEndSessionsBatch(batch);
    onBatchDone(batch.length);
  }
}
async function migrateMegolmSessions(logger, legacyStore, pickleKey, storeHandle, onBatchDone) {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const batch = await legacyStore.getEndToEndInboundGroupSessionsBatch();
    if (batch === null) return;
    logger.debug(`Migrating batch of ${batch.length} megolm sessions`);
    const migrationData = [];
    for (const session of batch) {
      const sessionData = session.sessionData;
      const pickledSession = new RustSdkCryptoJs.PickledInboundGroupSession();
      pickledSession.pickle = sessionData.session;
      pickledSession.roomId = new RustSdkCryptoJs.RoomId(sessionData.room_id);
      pickledSession.senderKey = session.senderKey;
      pickledSession.senderSigningKey = sessionData.keysClaimed?.["ed25519"];
      pickledSession.backedUp = !session.needsBackup;

      // The Rust SDK `imported` flag is used to indicate the authenticity status of a Megolm
      // session, which tells us whether we can reliably tell which Olm device is the owner
      // (creator) of the session.
      //
      // If `imported` is true, then we have no cryptographic proof that the session is owned
      // by the device with the identity key `senderKey`.
      //
      // Only Megolm sessions received directly from the owning device via an encrypted
      // `m.room_key` to-device message should have `imported` flag set to false. Megolm
      // sessions received by any other currently available means (i.e. from a
      // `m.forwarded_room_key`, from v1 asymmetric server-side key backup, imported from a
      // file, etc) should have the `imported` flag set to true.
      //
      // Messages encrypted with such Megolm sessions will have a grey shield in the UI
      // ("Authenticity of this message cannot be guaranteed").
      //
      // However, we don't want to bluntly mark all sessions as `imported` during migration
      // because users will suddenly start seeing all their historic messages decorated with a
      // grey shield, which would be seen as a non-actionable regression.
      //
      // In the legacy crypto stack, the flag encoding similar information was called
      // `InboundGroupSessionData.untrusted`. The value of this flag was set as follows:
      //
      // - For outbound Megolm sessions created by our own device, `untrusted` is `undefined`.
      // - For Megolm sessions received via a `m.room_key` to-device message, `untrusted` is
      //   `undefined`.
      // - For Megolm sessions received via a `m.forwarded_room_key` to-device message,
      //   `untrusted` is `true`.
      // - For Megolm sessions imported from a (v1 asymmetric / "legacy") server-side key
      //   backup, `untrusted` is `true`.
      // - For Megolm sessions imported from a file, untrusted is `undefined`.
      //
      // The main difference between the legacy crypto stack and the Rust crypto stack is that
      // the Rust stack considers sessions imported from a file as `imported` (not
      // authenticated). This is because the Megolm session export file format does not
      // encode this authenticity information.
      //
      // Given this migration is only a one-time thing, we make a concession to accept the
      // loss of information in this case, to avoid degrading UX in a non-actionable way.
      pickledSession.imported = sessionData.untrusted === true;
      migrationData.push(pickledSession);
    }
    await RustSdkCryptoJs.Migration.migrateMegolmSessions(migrationData, pickleKey, storeHandle);
    await legacyStore.deleteEndToEndInboundGroupSessionsBatch(batch);
    onBatchDone(batch.length);
  }
}

/**
 * Determine if any room settings need migrating from the legacy store, and do so.
 *
 * @param args - Arguments object.
 */
async function migrateRoomSettingsFromLegacyCrypto({
  logger,
  legacyStore,
  olmMachine
}) {
  if (!(await legacyStore.containsData())) {
    // This store was never used. Nothing to migrate.
    return;
  }
  const migrationState = await legacyStore.getMigrationState();
  if (migrationState >= _base.MigrationState.ROOM_SETTINGS_MIGRATED) {
    // We've already migrated the room settings.
    return;
  }
  let rooms = {};
  await legacyStore.doTxn("readwrite", [_indexeddbCryptoStore.IndexedDBCryptoStore.STORE_ROOMS], txn => {
    legacyStore.getEndToEndRooms(txn, result => {
      rooms = result;
    });
  });
  logger.debug(`Migrating ${Object.keys(rooms).length} sets of room settings`);
  for (const [roomId, legacySettings] of Object.entries(rooms)) {
    try {
      const rustSettings = new RustSdkCryptoJs.RoomSettings();
      if (legacySettings.algorithm !== "m.megolm.v1.aes-sha2") {
        logger.warn(`Room ${roomId}: ignoring room with invalid algorithm ${legacySettings.algorithm}`);
        continue;
      }
      rustSettings.algorithm = RustSdkCryptoJs.EncryptionAlgorithm.MegolmV1AesSha2;
      rustSettings.sessionRotationPeriodMs = legacySettings.rotation_period_ms;
      rustSettings.sessionRotationPeriodMessages = legacySettings.rotation_period_msgs;
      await olmMachine.setRoomSettings(new RustSdkCryptoJs.RoomId(roomId), rustSettings);

      // We don't attempt to clear out the settings from the old store, or record where we've gotten up to,
      // which means that if the app gets restarted while we're in the middle of this migration, we'll start
      // again from scratch. So be it. Given that legacy crypto loads the whole room list into memory on startup
      // anyway, we know it can't be that big.
    } catch (e) {
      logger.warn(`Room ${roomId}: ignoring settings ${JSON.stringify(legacySettings)} which caused error ${e}`);
    }
  }
  logger.debug(`Completed room settings migration`);
  await legacyStore.setMigrationState(_base.MigrationState.ROOM_SETTINGS_MIGRATED);
}
async function getAndDecryptCachedSecretKey(legacyStore, legacyPickleKey, name) {
  let encodedKey = null;
  await legacyStore.doTxn("readonly", "account", txn => {
    legacyStore.getSecretStorePrivateKey(txn, k => {
      encodedKey = k;
    }, name);
  });
  return encodedKey === null ? undefined : await (0, _aes.decryptAES)(encodedKey, legacyPickleKey, name);
}