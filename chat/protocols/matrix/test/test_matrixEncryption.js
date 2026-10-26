/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

// MatrixAccount, MatrixSDK are provided by head.js.
const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);

const USER_ID = "@user:example.com";

/**
 * Build a mock account providing everything bootstrapSSSS touches.
 *
 * @param {object} [options] - Mock behaviour.
 * @param {string} [options.passphrase] - Value of the backupPassphrase pref.
 * @param {boolean} [options.hasClient] - Whether a connected client exists.
 * @param {object?} [options.backupVersion] - Result of getKeyBackupVersion.
 * @returns {object} Mock account, with sinon spies for the interactions.
 */
function makeAccountMock({
  passphrase = "passphrase",
  hasClient = true,
  backupVersion = null,
} = {}) {
  const sandbox = sinon.createSandbox();
  registerCleanupFunction(() => sandbox.restore());

  const crypto = {
    async getKeyBackupVersion() {
      return backupVersion;
    },
    async bootstrapSecretStorage() {},
    async bootstrapCrossSigning(opts) {
      await opts.authUploadDeviceSigningKeys(async () => {});
    },
    async restoreKeyBackup() {},
  };
  const client = {
    async checkOwnCrossSigningTrust() {},
    getCrypto() {
      return crypto;
    },
  };
  const imAccount = {
    setString: sandbox.spy(),
    save: sandbox.spy(),
  };

  // BootstrapSSSS can be overridden, so we store it separately for spying
  const bootstrapSSSS = sandbox.spy(() => undefined);

  const mock = {
    getString(name) {
      return name === "backupPassphrase" ? passphrase : undefined;
    },
    imAccount,
    setString: imAccount.setString,
    save: imAccount.save,
    _encryptionError: "",
    updateEncryptionStatus: sandbox.spy(),
    _client: hasClient ? client : null,
    get _bootstrapSSSS() {
      return bootstrapSSSS;
    },
    getKeyBackupVersion: sandbox.spy(crypto, "getKeyBackupVersion"),
    bootstrapSecretStorage: sandbox.spy(crypto, "bootstrapSecretStorage"),
    bootstrapCrossSigning: sandbox.spy(crypto, "bootstrapCrossSigning"),
    restoreKeyBackup: sandbox.spy(crypto, "restoreKeyBackup"),
  };
  return mock;
}

add_task(async function test_bootstrapSSSS_noop() {
  // Without a client, startup will do the bootstrapping later.
  let mock = makeAccountMock({ hasClient: false });
  await MatrixAccount.prototype.bootstrapSSSS.call(mock);
  equal(
    mock.bootstrapSecretStorage.callCount,
    0,
    "No keys are recovered without a client."
  );
  equal(
    mock.bootstrapCrossSigning.callCount,
    0,
    "No keys are recovered without a client."
  );
  equal(
    mock.setString.callCount,
    0,
    "No passphrase is cleared without a client."
  );

  // Nothing to do without a passphrase.
  mock = makeAccountMock({ passphrase: "" });
  await MatrixAccount.prototype.bootstrapSSSS.call(mock);
  equal(
    mock.bootstrapSecretStorage.callCount,
    0,
    "No keys are recovered without a passphrase."
  );
  equal(
    mock.bootstrapCrossSigning.callCount,
    0,
    "No keys are recovered without a passphrase."
  );
  equal(mock.setString.callCount, 0, "No passphrase is cleared without keys.");
});

add_task(async function test_bootstrapSSSS_success() {
  const mock = makeAccountMock();
  await MatrixAccount.prototype.bootstrapSSSS.call(mock);

  // Secret storage and cross-signing are bootstrapped, never initially set up.
  equal(
    mock.bootstrapSecretStorage.callCount,
    1,
    "Secret storage is bootstrapped."
  );
  const secretStorageOpts = mock.bootstrapSecretStorage.firstCall.args[0];
  equal(
    secretStorageOpts.setupNewKeyBackup,
    false,
    "New key backup is never set up."
  );

  equal(
    mock.bootstrapCrossSigning.callCount,
    1,
    "Cross-signing is bootstrapped."
  );
  const crossSigningOpts = mock.bootstrapCrossSigning.firstCall.args[0];
  ok(
    crossSigningOpts.authUploadDeviceSigningKeys,
    "Upload authentication is provided."
  );

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
  equal(mock.save.callCount, 1, "The new state is saved.");
  equal(mock._encryptionError, "", "No error is reported.");
  equal(mock.updateEncryptionStatus.callCount, 1, "The status is refreshed.");
});

add_task(async function test_bootstrapSSSS_restoresBackup() {
  // With a session backup, getCrypto().restoreKeyBackup() is invoked.
  const backupVersion = { version: "42" };
  const mock = makeAccountMock({ backupVersion });
  await MatrixAccount.prototype.bootstrapSSSS.call(mock);
  equal(mock.restoreKeyBackup.callCount, 1, "The backup is restored.");
});

add_task(async function test_setString_backupPassphrase() {
  // Setting the passphrase while disconnected is a no-op; bootstrapping gets
  // handled once the client connects.
  const mock = makeAccountMock({ hasClient: false });
  mock.bootstrapSSSS = async () => {
    mock._bootstrapSSSS();
  };
  MatrixAccount.prototype.setString.call(
    mock,
    "backupPassphrase",
    "passphrase"
  );
  equal(mock._bootstrapSSSS.callCount, 0, "No bootstrap while disconnected.");

  // When connected, setting the passphrase triggers bootstrapping.
  const mock2 = makeAccountMock();
  mock2.bootstrapSSSS = async () => {
    mock2._bootstrapSSSS();
  };
  MatrixAccount.prototype.setString.call(
    mock2,
    "backupPassphrase",
    "passphrase"
  );
  equal(
    mock2._bootstrapSSSS.callCount,
    1,
    "Setting the passphrase triggers bootstrapping."
  );
  // Clearing the passphrase doesn't trigger bootstrapping.
  MatrixAccount.prototype.setString.call(mock2, "backupPassphrase", "");
  equal(
    mock2._bootstrapSSSS.callCount,
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
