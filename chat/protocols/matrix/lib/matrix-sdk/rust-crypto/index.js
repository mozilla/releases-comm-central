"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.initRustCrypto = initRustCrypto;
var _matrixSdkCryptoWasm = _interopRequireWildcard(require("@matrix-org/matrix-sdk-crypto-wasm"));
var RustSdkCryptoJs = _matrixSdkCryptoWasm;
var _rustCrypto = require("./rust-crypto");
var _base = require("../crypto/store/base");
var _libolm_migration = require("./libolm_migration");
function _getRequireWildcardCache(e) { if ("function" != typeof WeakMap) return null; var r = new WeakMap(), t = new WeakMap(); return (_getRequireWildcardCache = function (e) { return e ? t : r; })(e); }
function _interopRequireWildcard(e, r) { if (!r && e && e.__esModule) return e; if (null === e || "object" != typeof e && "function" != typeof e) return { default: e }; var t = _getRequireWildcardCache(r); if (t && t.has(e)) return t.get(e); var n = { __proto__: null }, a = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var u in e) if ("default" !== u && {}.hasOwnProperty.call(e, u)) { var i = a ? Object.getOwnPropertyDescriptor(e, u) : null; i && (i.get || i.set) ? Object.defineProperty(n, u, i) : n[u] = e[u]; } return n.default = e, t && t.set(e, n), n; }
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); } /*
Copyright 2022 The Matrix.org Foundation C.I.C.

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
 * Create a new `RustCrypto` implementation
 *
 * @param args - Parameter object
 * @internal
 */
async function initRustCrypto(args) {
  const {
    logger
  } = args;

  // initialise the rust matrix-sdk-crypto-wasm, if it hasn't already been done
  logger.debug("Initialising Rust crypto-sdk WASM artifact");
  await RustSdkCryptoJs.initAsync();

  // enable tracing in the rust-sdk
  new RustSdkCryptoJs.Tracing(RustSdkCryptoJs.LoggerLevel.Debug).turnOn();
  logger.debug("Opening Rust CryptoStore");
  let storeHandle;
  if (args.storePrefix) {
    if (args.storeKey) {
      storeHandle = await _matrixSdkCryptoWasm.StoreHandle.openWithKey(args.storePrefix, args.storeKey);
    } else {
      storeHandle = await _matrixSdkCryptoWasm.StoreHandle.open(args.storePrefix, args.storePassphrase);
    }
  } else {
    storeHandle = await _matrixSdkCryptoWasm.StoreHandle.open();
  }
  if (args.legacyCryptoStore) {
    // We have a legacy crypto store, which we may need to migrate from.
    await (0, _libolm_migration.migrateFromLegacyCrypto)(_objectSpread({
      legacyStore: args.legacyCryptoStore,
      storeHandle
    }, args));
  }
  const rustCrypto = await initOlmMachine(logger, args.http, args.userId, args.deviceId, args.secretStorage, args.cryptoCallbacks, storeHandle, args.legacyCryptoStore);
  storeHandle.free();
  logger.debug("Completed rust crypto-sdk setup");
  return rustCrypto;
}
async function initOlmMachine(logger, http, userId, deviceId, secretStorage, cryptoCallbacks, storeHandle, legacyCryptoStore) {
  logger.debug("Init OlmMachine");
  const olmMachine = await RustSdkCryptoJs.OlmMachine.initFromStore(new RustSdkCryptoJs.UserId(userId), new RustSdkCryptoJs.DeviceId(deviceId), storeHandle);

  // A final migration step, now that we have an OlmMachine.
  if (legacyCryptoStore) {
    await (0, _libolm_migration.migrateRoomSettingsFromLegacyCrypto)({
      logger,
      legacyStore: legacyCryptoStore,
      olmMachine
    });
  }

  // Disable room key requests, per https://github.com/vector-im/element-web/issues/26524.
  olmMachine.roomKeyRequestsEnabled = false;
  const rustCrypto = new _rustCrypto.RustCrypto(logger, olmMachine, http, userId, deviceId, secretStorage, cryptoCallbacks);
  await olmMachine.registerRoomKeyUpdatedCallback(sessions => rustCrypto.onRoomKeysUpdated(sessions));
  await olmMachine.registerRoomKeysWithheldCallback(withheld => rustCrypto.onRoomKeysWithheld(withheld));
  await olmMachine.registerUserIdentityUpdatedCallback(userId => rustCrypto.onUserIdentityUpdated(userId));
  await olmMachine.registerDevicesUpdatedCallback(userIds => rustCrypto.onDevicesUpdated(userIds));

  // Check if there are any key backup secrets pending processing. There may be multiple secrets to process if several devices have gossiped them.
  // The `registerReceiveSecretCallback` function will only be triggered for new secrets. If the client is restarted before processing them, the secrets will need to be manually handled.
  rustCrypto.checkSecrets("m.megolm_backup.v1");

  // Register a callback to be notified when a new secret is received, as for now only the key backup secret is supported (the cross signing secrets are handled automatically by the OlmMachine)
  await olmMachine.registerReceiveSecretCallback((name, _value) =>
  // Instead of directly checking the secret value, we poll the inbox to get all values for that secret type.
  // Once we have all the values, we can safely clear the secret inbox.
  rustCrypto.checkSecrets(name));

  // Tell the OlmMachine to think about its outgoing requests before we hand control back to the application.
  //
  // This is primarily a fudge to get it to correctly populate the `users_for_key_query` list, so that future
  // calls to getIdentity (etc) block until the key queries are performed.
  //
  // Note that we don't actually need to *make* any requests here; it is sufficient to tell the Rust side to think
  // about them.
  //
  // XXX: find a less hacky way to do this.
  await olmMachine.outgoingRequests();
  if (legacyCryptoStore && (await legacyCryptoStore.containsData())) {
    const migrationState = await legacyCryptoStore.getMigrationState();
    if (migrationState < _base.MigrationState.INITIAL_OWN_KEY_QUERY_DONE) {
      logger.debug(`Performing initial key query after migration`);
      // We need to do an initial keys query so that the rust stack can properly update trust of
      // the user device and identity from the migrated private keys.
      // If not done, there is a short period where the own device/identity trust will be undefined after migration.
      let initialKeyQueryDone = false;
      while (!initialKeyQueryDone) {
        try {
          await rustCrypto.userHasCrossSigningKeys(userId);
          initialKeyQueryDone = true;
        } catch (e) {
          // If the initial key query fails, we retry until it succeeds.
          logger.error("Failed to check for cross-signing keys after migration, retrying", e);
        }
      }

      // If the private master cross-signing key was not cached in the legacy store, the rust session
      // will not be able to establish the trust of the user identity.
      // That means that after migration the session could revert to unverified.
      // In order to avoid asking the users to re-verify their sessions, we need to migrate the legacy local trust
      // (if the legacy session was already verified) to the new session.
      await (0, _libolm_migration.migrateLegacyLocalTrustIfNeeded)({
        legacyCryptoStore,
        rustCrypto,
        logger
      });
      await legacyCryptoStore.setMigrationState(_base.MigrationState.INITIAL_OWN_KEY_QUERY_DONE);
    }
  }
  return rustCrypto;
}