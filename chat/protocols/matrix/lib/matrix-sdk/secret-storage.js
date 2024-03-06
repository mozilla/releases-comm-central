"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ServerSideSecretStorageImpl = exports.SECRET_STORAGE_ALGORITHM_V1_AES = void 0;
exports.trimTrailingEquals = trimTrailingEquals;
var _client = require("./client");
var _aes = require("./crypto/aes");
var _randomstring = require("./randomstring");
var _logger = require("./logger");
/*
Copyright 2021-2023 The Matrix.org Foundation C.I.C.

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
 * Implementation of server-side secret storage
 *
 * @see https://spec.matrix.org/v1.6/client-server-api/#storage
 */

const SECRET_STORAGE_ALGORITHM_V1_AES = exports.SECRET_STORAGE_ALGORITHM_V1_AES = "m.secret_storage.v1.aes-hmac-sha2";

/**
 * Common base interface for Secret Storage Keys.
 *
 * The common properties for all encryption keys used in server-side secret storage.
 *
 * @see https://spec.matrix.org/v1.6/client-server-api/#key-storage
 */

/**
 * Properties for a SSSS key using the `m.secret_storage.v1.aes-hmac-sha2` algorithm.
 *
 * Corresponds to `AesHmacSha2KeyDescription` in the specification.
 *
 * @see https://spec.matrix.org/v1.6/client-server-api/#msecret_storagev1aes-hmac-sha2
 */

/**
 * Union type for secret storage keys.
 *
 * For now, this is only {@link SecretStorageKeyDescriptionAesV1}, but other interfaces may be added in future.
 */

/**
 * Information on how to generate the key from a passphrase.
 *
 * @see https://spec.matrix.org/v1.6/client-server-api/#deriving-keys-from-passphrases
 */

/**
 * Options for {@link ServerSideSecretStorageImpl#addKey}.
 */

/**
 * Return type for {@link ServerSideSecretStorageImpl#getKey}.
 */

/**
 * Return type for {@link ServerSideSecretStorageImpl#addKey}.
 */

/** Interface for managing account data on the server.
 *
 * A subset of {@link MatrixClient}.
 */

/**
 *  Application callbacks for use with {@link SecretStorage.ServerSideSecretStorageImpl}
 */

/**
 * Interface provided by SecretStorage implementations
 *
 * Normally this will just be an {@link ServerSideSecretStorageImpl}, but for backwards
 * compatibility some methods allow other implementations.
 */

/**
 * Implementation of Server-side secret storage.
 *
 * Secret *sharing* is *not* implemented here: this class is strictly about the storage component of
 * SSSS.
 *
 * @see https://spec.matrix.org/v1.6/client-server-api/#storage
 */
class ServerSideSecretStorageImpl {
  /**
   * Construct a new `SecretStorage`.
   *
   * Normally, it is unnecessary to call this directly, since MatrixClient automatically constructs one.
   * However, it may be useful to construct a new `SecretStorage`, if custom `callbacks` are required, for example.
   *
   * @param accountDataAdapter - interface for fetching and setting account data on the server. Normally an instance
   *   of {@link MatrixClient}.
   * @param callbacks - application level callbacks for retrieving secret keys
   */
  constructor(accountDataAdapter, callbacks) {
    this.accountDataAdapter = accountDataAdapter;
    this.callbacks = callbacks;
  }

  /**
   * Get the current default key ID for encrypting secrets.
   *
   * @returns The default key ID or null if no default key ID is set
   */
  async getDefaultKeyId() {
    const defaultKey = await this.accountDataAdapter.getAccountDataFromServer("m.secret_storage.default_key");
    if (!defaultKey) return null;
    return defaultKey.key;
  }

  /**
   * Set the default key ID for encrypting secrets.
   *
   * @param keyId - The new default key ID
   */
  setDefaultKeyId(keyId) {
    return new Promise((resolve, reject) => {
      const listener = ev => {
        if (ev.getType() === "m.secret_storage.default_key" && ev.getContent().key === keyId) {
          this.accountDataAdapter.removeListener(_client.ClientEvent.AccountData, listener);
          resolve();
        }
      };
      this.accountDataAdapter.on(_client.ClientEvent.AccountData, listener);
      this.accountDataAdapter.setAccountData("m.secret_storage.default_key", {
        key: keyId
      }).catch(e => {
        this.accountDataAdapter.removeListener(_client.ClientEvent.AccountData, listener);
        reject(e);
      });
    });
  }

  /**
   * Add a key for encrypting secrets.
   *
   * @param algorithm - the algorithm used by the key.
   * @param opts - the options for the algorithm.  The properties used
   *     depend on the algorithm given.
   * @param keyId - the ID of the key.  If not given, a random
   *     ID will be generated.
   *
   * @returns An object with:
   *     keyId: the ID of the key
   *     keyInfo: details about the key (iv, mac, passphrase)
   */
  async addKey(algorithm, opts, keyId) {
    if (algorithm !== SECRET_STORAGE_ALGORITHM_V1_AES) {
      throw new Error(`Unknown key algorithm ${algorithm}`);
    }
    const keyInfo = {
      algorithm
    };
    if (opts.name) {
      keyInfo.name = opts.name;
    }
    if (opts.passphrase) {
      keyInfo.passphrase = opts.passphrase;
    }
    const {
      iv,
      mac
    } = await (0, _aes.calculateKeyCheck)(opts.key);
    keyInfo.iv = iv;
    keyInfo.mac = mac;

    // Create a unique key id. XXX: this is racey.
    if (!keyId) {
      do {
        keyId = (0, _randomstring.randomString)(32);
      } while (await this.accountDataAdapter.getAccountDataFromServer(`m.secret_storage.key.${keyId}`));
    }
    await this.accountDataAdapter.setAccountData(`m.secret_storage.key.${keyId}`, keyInfo);
    return {
      keyId,
      keyInfo
    };
  }

  /**
   * Get the key information for a given ID.
   *
   * @param keyId - The ID of the key to check
   *     for. Defaults to the default key ID if not provided.
   * @returns If the key was found, the return value is an array of
   *     the form [keyId, keyInfo].  Otherwise, null is returned.
   *     XXX: why is this an array when addKey returns an object?
   */
  async getKey(keyId) {
    if (!keyId) {
      keyId = await this.getDefaultKeyId();
    }
    if (!keyId) {
      return null;
    }
    const keyInfo = await this.accountDataAdapter.getAccountDataFromServer("m.secret_storage.key." + keyId);
    return keyInfo ? [keyId, keyInfo] : null;
  }

  /**
   * Check whether we have a key with a given ID.
   *
   * @param keyId - The ID of the key to check
   *     for. Defaults to the default key ID if not provided.
   * @returns Whether we have the key.
   */
  async hasKey(keyId) {
    const key = await this.getKey(keyId);
    return Boolean(key);
  }

  /**
   * Check whether a key matches what we expect based on the key info
   *
   * @param key - the key to check
   * @param info - the key info
   *
   * @returns whether or not the key matches
   */
  async checkKey(key, info) {
    if (info.algorithm === SECRET_STORAGE_ALGORITHM_V1_AES) {
      if (info.mac) {
        const {
          mac
        } = await (0, _aes.calculateKeyCheck)(key, info.iv);
        return trimTrailingEquals(info.mac) === trimTrailingEquals(mac);
      } else {
        // if we have no information, we have to assume the key is right
        return true;
      }
    } else {
      throw new Error("Unknown algorithm");
    }
  }

  /**
   * Store an encrypted secret on the server.
   *
   * Details of the encryption keys to be used must previously have been stored in account data
   * (for example, via {@link ServerSideSecretStorageImpl#addKey}. {@link SecretStorageCallbacks#getSecretStorageKey} will be called to obtain a secret storage
   * key to decrypt the secret.
   *
   * @param name - The name of the secret - i.e., the "event type" to be stored in the account data
   * @param secret - The secret contents.
   * @param keys - The IDs of the keys to use to encrypt the secret, or null/undefined to use the default key.
   */
  async store(name, secret, keys) {
    const encrypted = {};
    if (!keys) {
      const defaultKeyId = await this.getDefaultKeyId();
      if (!defaultKeyId) {
        throw new Error("No keys specified and no default key present");
      }
      keys = [defaultKeyId];
    }
    if (keys.length === 0) {
      throw new Error("Zero keys given to encrypt with!");
    }
    for (const keyId of keys) {
      // get key information from key storage
      const keyInfo = await this.accountDataAdapter.getAccountDataFromServer("m.secret_storage.key." + keyId);
      if (!keyInfo) {
        throw new Error("Unknown key: " + keyId);
      }

      // encrypt secret, based on the algorithm
      if (keyInfo.algorithm === SECRET_STORAGE_ALGORITHM_V1_AES) {
        const keys = {
          [keyId]: keyInfo
        };
        const [, encryption] = await this.getSecretStorageKey(keys, name);
        encrypted[keyId] = await encryption.encrypt(secret);
      } else {
        _logger.logger.warn("unknown algorithm for secret storage key " + keyId + ": " + keyInfo.algorithm);
        // do nothing if we don't understand the encryption algorithm
      }
    }

    // save encrypted secret
    await this.accountDataAdapter.setAccountData(name, {
      encrypted
    });
  }

  /**
   * Get a secret from storage, and decrypt it.
   *
   * {@link SecretStorageCallbacks#getSecretStorageKey} will be called to obtain a secret storage
   * key to decrypt the secret.
   *
   * @param name - the name of the secret - i.e., the "event type" stored in the account data
   *
   * @returns the decrypted contents of the secret, or "undefined" if `name` is not found in
   *    the user's account data.
   */
  async get(name) {
    const secretInfo = await this.accountDataAdapter.getAccountDataFromServer(name);
    if (!secretInfo) {
      return;
    }
    if (!secretInfo.encrypted) {
      throw new Error("Content is not encrypted!");
    }

    // get possible keys to decrypt
    const keys = {};
    for (const keyId of Object.keys(secretInfo.encrypted)) {
      // get key information from key storage
      const keyInfo = await this.accountDataAdapter.getAccountDataFromServer("m.secret_storage.key." + keyId);
      const encInfo = secretInfo.encrypted[keyId];
      // only use keys we understand the encryption algorithm of
      if (keyInfo?.algorithm === SECRET_STORAGE_ALGORITHM_V1_AES) {
        if (encInfo.iv && encInfo.ciphertext && encInfo.mac) {
          keys[keyId] = keyInfo;
        }
      }
    }
    if (Object.keys(keys).length === 0) {
      throw new Error(`Could not decrypt ${name} because none of ` + `the keys it is encrypted with are for a supported algorithm`);
    }

    // fetch private key from app
    const [keyId, decryption] = await this.getSecretStorageKey(keys, name);
    const encInfo = secretInfo.encrypted[keyId];
    return decryption.decrypt(encInfo);
  }

  /**
   * Check if a secret is stored on the server.
   *
   * @param name - the name of the secret
   *
   * @returns map of key name to key info the secret is encrypted
   *     with, or null if it is not present or not encrypted with a trusted
   *     key
   */
  async isStored(name) {
    // check if secret exists
    const secretInfo = await this.accountDataAdapter.getAccountDataFromServer(name);
    if (!secretInfo?.encrypted) return null;
    const ret = {};

    // filter secret encryption keys with supported algorithm
    for (const keyId of Object.keys(secretInfo.encrypted)) {
      // get key information from key storage
      const keyInfo = await this.accountDataAdapter.getAccountDataFromServer("m.secret_storage.key." + keyId);
      if (!keyInfo) continue;
      const encInfo = secretInfo.encrypted[keyId];

      // only use keys we understand the encryption algorithm of
      if (keyInfo.algorithm === SECRET_STORAGE_ALGORITHM_V1_AES) {
        if (encInfo.iv && encInfo.ciphertext && encInfo.mac) {
          ret[keyId] = keyInfo;
        }
      }
    }
    return Object.keys(ret).length ? ret : null;
  }
  async getSecretStorageKey(keys, name) {
    if (!this.callbacks.getSecretStorageKey) {
      throw new Error("No getSecretStorageKey callback supplied");
    }
    const returned = await this.callbacks.getSecretStorageKey({
      keys
    }, name);
    if (!returned) {
      throw new Error("getSecretStorageKey callback returned falsey");
    }
    if (returned.length < 2) {
      throw new Error("getSecretStorageKey callback returned invalid data");
    }
    const [keyId, privateKey] = returned;
    if (!keys[keyId]) {
      throw new Error("App returned unknown key from getSecretStorageKey!");
    }
    if (keys[keyId].algorithm === SECRET_STORAGE_ALGORITHM_V1_AES) {
      const decryption = {
        encrypt: function (secret) {
          return (0, _aes.encryptAES)(secret, privateKey, name);
        },
        decrypt: function (encInfo) {
          return (0, _aes.decryptAES)(encInfo, privateKey, name);
        }
      };
      return [keyId, decryption];
    } else {
      throw new Error("Unknown key type: " + keys[keyId].algorithm);
    }
  }
}

/** trim trailing instances of '=' from a string
 *
 * @internal
 *
 * @param input - input string
 */
exports.ServerSideSecretStorageImpl = ServerSideSecretStorageImpl;
function trimTrailingEquals(input) {
  // according to Sonar and CodeQL, a regex such as /=+$/ is superlinear.
  // Not sure I believe it, but it's easy enough to work around.

  // find the number of characters before the trailing =
  let i = input.length;
  while (i >= 1 && input.charCodeAt(i - 1) == 0x3d) i--;

  // trim to the calculated length
  if (i < input.length) {
    return input.substring(0, i);
  } else {
    return input;
  }
}