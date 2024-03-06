"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.SESSION_BATCH_SIZE = exports.MigrationState = exports.ACCOUNT_OBJECT_KEY_MIGRATION_STATE = void 0;
/*
Copyright 2021 The Matrix.org Foundation C.I.C.

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
 * Internal module. Definitions for storage for the crypto module
 */

/**
 * Abstraction of things that can store data required for end-to-end encryption
 */

/** Data on a Megolm session */

/** Extended data on a Megolm session */

/** Data on an Olm session */

/**
 * Represents an outgoing room key request
 */

/**
 * Keys for the `account` object store to store the migration state.
 * Values are defined in `MigrationState`.
 * @internal
 */
const ACCOUNT_OBJECT_KEY_MIGRATION_STATE = exports.ACCOUNT_OBJECT_KEY_MIGRATION_STATE = "migrationState";

/**
 * A record of which steps have been completed in the libolm to Rust Crypto migration.
 *
 * Used by {@link CryptoStore#getMigrationState} and {@link CryptoStore#setMigrationState}.
 *
 * @internal
 */
let MigrationState = exports.MigrationState = /*#__PURE__*/function (MigrationState) {
  MigrationState[MigrationState["NOT_STARTED"] = 0] = "NOT_STARTED";
  MigrationState[MigrationState["INITIAL_DATA_MIGRATED"] = 1] = "INITIAL_DATA_MIGRATED";
  MigrationState[MigrationState["OLM_SESSIONS_MIGRATED"] = 2] = "OLM_SESSIONS_MIGRATED";
  MigrationState[MigrationState["MEGOLM_SESSIONS_MIGRATED"] = 3] = "MEGOLM_SESSIONS_MIGRATED";
  MigrationState[MigrationState["ROOM_SETTINGS_MIGRATED"] = 4] = "ROOM_SETTINGS_MIGRATED";
  MigrationState[MigrationState["INITIAL_OWN_KEY_QUERY_DONE"] = 5] = "INITIAL_OWN_KEY_QUERY_DONE";
  return MigrationState;
}({});
/**
 * The size of batches to be returned by {@link CryptoStore#getEndToEndSessionsBatch} and
 * {@link CryptoStore#getEndToEndInboundGroupSessionsBatch}.
 */
const SESSION_BATCH_SIZE = exports.SESSION_BATCH_SIZE = 50;