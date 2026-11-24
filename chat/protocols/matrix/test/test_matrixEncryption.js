/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

// MatrixAccount, MatrixSDK are provided by head.js.
const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);
const { deriveSecretStorageKey } = ChromeUtils.importESModule(
  "resource:///modules/matrixAccount.sys.mjs"
);

const USER_ID = "@user:example.com";

/**
 * Bytes that encodeRecoveryKey turns into a deterministic security key.
 *
 * @returns {Uint8Array}
 */
function makePrivateKey() {
  // 32-byte array from 0 to 31. (Arbitrary for the tests.)
  return Uint8Array.from([...Array(32).keys()]);
}

add_task(async function test_deriveSecretStorageKeyFromSecurityKey() {
  const privateKey = makePrivateKey();
  // encodeRecoveryKey returns the base58 representation in groups of four
  // characters separated by spaces.
  const securityKey = MatrixSDK.Crypto.encodeRecoveryKey(privateKey);
  Assert.stringMatches(securityKey, /^Es/, "Security keys start with 'Es'");
  Assert.stringContains(securityKey, " ", "Security keys contain spaces");

  // Without a default key, the first available key is used.
  let [keyId, decoded] = await deriveSecretStorageKey(
    { KEY1: {}, KEY2: {} },
    null,
    securityKey
  );
  equal(keyId, "KEY1");
  Assert.deepEqual(
    Array.from(decoded),
    Array.from(privateKey),
    "First key is used if no default"
  );

  // Whitespace is optional.
  [keyId, decoded] = await deriveSecretStorageKey(
    { KEY1: {} },
    null,
    securityKey.replaceAll(" ", "")
  );
  equal(keyId, "KEY1");
  Assert.deepEqual(
    Array.from(decoded),
    Array.from(privateKey),
    "Whitespace in keys is ignored"
  );

  // The default key is preferred over the first entry.
  [keyId] = await deriveSecretStorageKey(
    { KEY1: {}, KEY2: {} },
    "KEY2",
    securityKey
  );
  equal(keyId, "KEY2", "Default key is used if provided");

  // A missing default falls back to the first entry.
  [keyId] = await deriveSecretStorageKey(
    { KEY1: {} },
    "KEY_MISSING",
    securityKey
  );
  equal(keyId, "KEY1", "Unknown default key is ignored");
});

add_task(async function test_deriveSecretStorageKeyFromPhrase() {
  const keys = {
    KEY1: { passphrase: { salt: "some salt", iterations: 10000 } },
  };
  const [keyId, derived] = await deriveSecretStorageKey(
    keys,
    null,
    "correct horse battery staple"
  );
  equal(keyId, "KEY1");
  equal(derived.length, 32);

  // Derivation is deterministic.
  const [, again] = await deriveSecretStorageKey(
    keys,
    null,
    "correct horse battery staple"
  );
  Assert.deepEqual(Array.from(derived), Array.from(again));

  // A different phrase derives a different key.
  const [, other] = await deriveSecretStorageKey(keys, null, "other phrase");
  Assert.notDeepEqual(Array.from(derived), Array.from(other));
});

add_task(async function test_deriveSecretStorageKeyErrors() {
  // A phrase can not be used when the key wasn't set up from one.
  await Assert.rejects(
    deriveSecretStorageKey({ KEY1: {} }, null, "correct horse battery staple"),
    /passphrase/
  );

  // Without any key info there is nothing to unlock the storage with.
  await Assert.rejects(
    deriveSecretStorageKey({}, null, "correct horse battery staple"),
    /No usable secret storage key/
  );
});

/**
 * Build a mock account providing everything bootstrapSSSS touches.
 *
 * @param {object} [options] - Mock behaviour.
 * @param {string} [options.passphrase] - Value of the backupPassphrase pref.
 * @param {boolean} [options.hasClient] - Whether a connected client exists.
 * @param {object?} [options.storedKeys] - Result of secretStorage.isStored for
 *   the cross-signing keys.
 * @param {object?} [options.backupVersion] - Result of getKeyBackupVersion.
 * @param {boolean} [options.failAuth] - Make the interactive authentication of
 *   the key upload fail.
 * @returns {object} Mock account, with sinon spies for the interactions.
 */
function makeAccountMock({
  passphrase = "passphrase",
  hasClient = true,
  storedKeys = { KEY1: {} },
  backupVersion = null,
  failAuth = false,
} = {}) {
  const sandbox = sinon.createSandbox();
  registerCleanupFunction(() => sandbox.restore());

  const crypto = {
    async bootstrapCrossSigning(opts) {
      await opts.authUploadDeviceSigningKeys(async () => {
        if (failAuth) {
          throw new Error("Authentication failed");
        }
      });
    },
  };
  const client = {
    secretStorage: {
      getDefaultKeyId: sandbox.stub().resolves("KEY1"),
      isStored: sandbox.stub().callsFake(async secretName => {
        equal(
          secretName,
          "m.cross_signing.master",
          "The master cross-signing key is requested."
        );
        return storedKeys;
      }),
    },
    getCrypto() {
      return crypto;
    },
    async getKeyBackupVersion() {
      return backupVersion;
    },
    async restoreKeyBackupWithCache() {},
  };

  const imAccount = {
    setString: sandbox.spy(),
    save: sandbox.spy(),
  };

  return {
    WARN: sandbox.spy(),
    getString(name) {
      return name === "backupPassphrase" ? passphrase : undefined;
    },
    imAccount,
    setString: imAccount.setString,
    save: imAccount.save,
    _encryptionError: "",
    updateEncryptionStatus: sandbox.spy(),
    _client: hasClient ? client : null,
    bootstrapCrossSigning: sandbox.spy(crypto, "bootstrapCrossSigning"),
    getKeyBackupVersion: sandbox.spy(client, "getKeyBackupVersion"),
    restoreKeyBackup: sandbox.spy(client, "restoreKeyBackupWithCache"),
  };
}

add_task(async function test_bootstrapSSSS_noop() {
  // Without a client, startup will do the bootstrapping later.
  let mock = makeAccountMock({ hasClient: false });
  await MatrixAccount.prototype.bootstrapSSSS.call(mock);
  equal(
    mock.setString.callCount,
    0,
    "No passphrase is cleared without a client."
  );
  equal(
    mock.bootstrapCrossSigning.callCount,
    0,
    "No keys are recovered without a client."
  );

  // Nothing to do without a passphrase.
  mock = makeAccountMock({ passphrase: "" });
  await MatrixAccount.prototype.bootstrapSSSS.call(mock);
  equal(
    mock.bootstrapCrossSigning.callCount,
    0,
    "No keys are recovered without a passphrase."
  );
  equal(mock.setString.callCount, 0, "No passphrase is cleared without keys.");
});

add_task(async function test_bootstrapSSSS_keysNotInStorage() {
  // Cross-signing keys were never uploaded to secret storage, recovering
  // them is impossible and creating new ones is not supported.
  const mock = makeAccountMock({ storedKeys: null });
  await MatrixAccount.prototype.bootstrapSSSS.call(mock);
  equal(
    mock.bootstrapCrossSigning.callCount,
    0,
    "No keys are created when none are stored."
  );
  ok(mock._encryptionError, "An error was reported to the UI.");
  equal(mock.updateEncryptionStatus.callCount, 1, "The status is refreshed.");
  // The passphrase is kept so it can be used later.
  equal(mock.setString.callCount, 0, "The passphrase is kept for later use.");
});

add_task(async function test_bootstrapSSSS_success() {
  const mock = makeAccountMock();
  await MatrixAccount.prototype.bootstrapSSSS.call(mock);

  // Cross-signing keys are recovered, never newly created.
  equal(mock.bootstrapCrossSigning.callCount, 1, "The keys are recovered.");
  const opts = mock.bootstrapCrossSigning.firstCall.args[0];
  ok(opts.authUploadDeviceSigningKeys, "Upload authentication is provided.");
  ok(!("setupNewCrossSigning" in opts), "New keys are never created.");

  // No session backup exists, nothing to restore.
  equal(
    mock.restoreKeyBackup.callCount,
    0,
    "Nothing is restored when there is no backup."
  );

  // Success clears the passphrase and refreshes the status.
  ok(
    mock.setString.calledWithExactly("backupPassphrase", ""),
    "The passphrase is cleared after success."
  );
  equal(mock.setString.callCount, 1, "The passphrase is cleared once.");
  equal(mock.save.callCount, 1, "The new state is saved.");
  equal(mock._encryptionError, "", "No error is reported.");
  equal(mock.updateEncryptionStatus.callCount, 1, "The status is refreshed.");
});

add_task(async function test_bootstrapSSSS_restoresBackup() {
  const backupVersion = { version: "42" };
  const mock = makeAccountMock({ backupVersion });
  await MatrixAccount.prototype.bootstrapSSSS.call(mock);
  equal(
    mock.getKeyBackupVersion.callCount,
    1,
    "The backup version is checked."
  );
  Assert.deepEqual(
    await mock.getKeyBackupVersion.firstCall.returnValue,
    backupVersion,
    "The stubbed backup version is returned."
  );
  equal(mock.restoreKeyBackup.callCount, 1, "The backup is restored.");
});

add_task(async function test_bootstrapSSSS_authFailure() {
  const mock = makeAccountMock({ failAuth: true });
  await MatrixAccount.prototype.bootstrapSSSS.call(mock);
  ok(mock._encryptionError, "The failure is reported to the UI.");
  equal(mock.updateEncryptionStatus.callCount, 1, "The status is refreshed.");
  // The passphrase survives failed attempts.
  equal(
    mock.setString.callCount,
    0,
    "The passphrase survives failed attempts."
  );
  equal(mock.save.callCount, 0, "Nothing is saved on failure.");
});

add_task(async function test_setString_backupPassphrase() {
  // While disconnected, bootstrapping waits until connect.
  let mock = makeAccountMock({ hasClient: false });
  let bootstrapped = 0;
  mock.bootstrapSSSS = async () => {
    bootstrapped++;
  };
  MatrixAccount.prototype.setString.call(
    mock,
    "backupPassphrase",
    "passphrase"
  );
  equal(bootstrapped, 0, "No bootstrap while disconnected.");
  ok(mock.WARN.calledOnce, "A warning is shown while disconnected.");
  ok(
    mock.WARN.firstCall.args[0].includes("not connected"),
    "The warning mentions the missing connection."
  );

  // When connected, setting the passphrase triggers bootstrapping.
  mock = makeAccountMock();
  bootstrapped = 0;
  mock.bootstrapSSSS = async () => {
    bootstrapped++;
  };
  MatrixAccount.prototype.setString.call(
    mock,
    "backupPassphrase",
    "passphrase"
  );
  equal(bootstrapped, 1, "Setting the passphrase triggers bootstrapping.");
  // Clearing the passphrase doesn't trigger bootstrapping.
  MatrixAccount.prototype.setString.call(mock, "backupPassphrase", "");
  equal(
    bootstrapped,
    1,
    "Clearing the passphrase does not trigger bootstrapping."
  );
});

/**
 * Build an account whose client reports the given own devices.
 *
 * @param {Map<string, object>} devices - Device ID to device info.
 * @param {string} [currentDeviceId] - Device ID reported by getDeviceId.
 * @returns {MatrixAccount}
 */
function getSessionsAccount(devices, currentDeviceId) {
  return getAccount({
    getCrypto() {
      return {
        getUserDeviceInfo: sinon.stub().callsFake(async userIds => {
          Assert.deepEqual(userIds, [USER_ID], "The own user is requested.");
          return new Map([[USER_ID, devices]]);
        }),
      };
    },
    getDeviceId: sinon.stub().returns(currentDeviceId),
  });
}

add_task(async function test_getSessions() {
  // Without crypto there are no sessions.
  let account = getAccount({ getCrypto: sinon.stub().returns(null) });
  Assert.deepEqual(
    await account.getSessions(),
    [],
    "No sessions without crypto."
  );

  // An unknown user also has no sessions.
  account = getAccount({
    getCrypto() {
      return {
        getUserDeviceInfo: sinon.stub().resolves(new Map()),
      };
    },
  });
  Assert.deepEqual(
    await account.getSessions(),
    [],
    "No sessions for an unknown user."
  );

  const devices = new Map([
    [
      "DEV1",
      { deviceId: "DEV1", verified: MatrixSDK.DeviceVerification.Verified },
    ],
    [
      "DEV2",
      {
        deviceId: "DEV2",
        displayName: "Phone",
        verified: MatrixSDK.DeviceVerification.Unverified,
      },
    ],
  ]);
  account = getSessionsAccount(devices, "DEV1");
  const sessions = await account.getSessions();
  equal(sessions.length, 2, "One session per device.");

  // The current device is flagged, trusted follows the verification state.
  const [desktop, phone] = sessions;
  equal(desktop._id, "DEV1", "The current device is listed first.");
  ok(desktop._currentSession, "The current device is flagged.");
  ok(desktop._trusted, "A verified device is trusted.");

  // Display names are included in the session ID.
  ok(phone._id.includes("DEV2"), "The device ID is part of the session ID.");
  ok(
    phone._id.includes("Phone"),
    "The display name is part of the session ID."
  );
  ok(!phone._currentSession, "Other devices are not the current one.");
  ok(!phone._trusted, "An unverified device is not trusted.");
});
