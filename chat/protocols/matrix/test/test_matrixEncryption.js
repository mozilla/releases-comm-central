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

  const client = {
    async getKeyBackupVersion() {
      return backupVersion;
    },
    async keyBackupKeyFromPassword() {
      return "key";
    },
    async bootstrapSecretStorage() {},
    async bootstrapCrossSigning(opts) {
      await opts.authUploadDeviceSigningKeys(async () => {});
    },
    async checkOwnCrossSigningTrust() {},
    async restoreKeyBackupWithSecretStorage() {},
  };
  const imAccount = {
    setString: sandbox.spy(),
    save: sandbox.spy(),
    get WARN() {
      return _msg => {
        // Silent ignore in tests
      };
    },
  };

  // BootstrapSSSS can be overridden, so we store it separately for spying
  const bootstrapSSSS = sandbox.spy(() => undefined);

  const mock = {
    getString(name) {
      return name === "backupPassphrase" ? passphrase : undefined;
    },
    imAccount,
    setString(_name, _value) {
      // Call original bootstrapSSSS if available
      return bootstrapSSSS();
    },
    save: imAccount.save,
    _encryptionError: "",
    updateEncryptionStatus: sandbox.spy(),
    _client: hasClient ? client : null,
    get _bootstrapSSSS() {
      return bootstrapSSSS;
    },
    getKeyBackupVersion: sandbox.spy(client, "getKeyBackupVersion"),
    bootstrapSecretStorage: sandbox.spy(client, "bootstrapSecretStorage"),
    bootstrapCrossSigning: sandbox.spy(client, "bootstrapCrossSigning"),
    restoreKeyBackup: sandbox.spy(client, "restoreKeyBackupWithSecretStorage"),
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
  ok(
    secretStorageOpts.getKeyBackupPassphrase,
    "The passphrase is provided as a callback."
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
  const backupVersion = { version: "42" };
  const mock = makeAccountMock({ backupVersion });
  await MatrixAccount.prototype.bootstrapSSSS.call(mock);
  equal(mock.restoreKeyBackup.callCount, 1, "The backup is restored.");
  Assert.deepEqual(
    mock.restoreKeyBackup.firstCall.args[0],
    backupVersion,
    "The backup version is passed through."
  );
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

function getSessionsClient(
  devices,
  currentDeviceId,
  crossSigningVerified = true
) {
  const sandbox = sinon.createSandbox();
  registerCleanupFunction(() => sandbox.restore());
  return {
    isCryptoEnabled: sandbox.stub().returns(true),
    getStoredDevicesForUser: sandbox.stub().callsFake(userId => {
      equal(userId, USER_ID, "The own user's devices are requested.");
      return devices;
    }),
    getDeviceId: sandbox.stub().returns(currentDeviceId),
    checkDeviceTrust: sandbox.stub().callsFake((ownerId, _deviceId) => {
      equal(ownerId, USER_ID, "The own user's trust is checked.");
      return {
        isCrossSigningVerified() {
          return crossSigningVerified;
        },
      };
    }),
  };
}

add_task(async function test_getSessions() {
  // Without crypto enabled there are no sessions.
  let account = getAccount({ isCryptoEnabled: sinon.stub().returns(false) });
  Assert.deepEqual(
    await account.getSessions(),
    [],
    "Without crypto there are no sessions."
  );

  const devices = [
    {
      deviceId: "DEV1",
      getDisplayName() {
        return "";
      },
    },
    {
      deviceId: "DEV2",
      getDisplayName() {
        return "Phone";
      },
    },
  ];
  // The current device is trusted, the other is trusted as well when
  // cross-signing is verified.
  account = getAccount(getSessionsClient(devices, "DEV1"));
  const sessions = await account.getSessions();
  equal(sessions.length, 2, "One session per device.");
  const [desktop, phone] = sessions;
  equal(desktop._id, "DEV1", "The current device is listed first.");
  ok(desktop._currentSession, "The current device is flagged.");
  ok(desktop._trusted, "A cross-signing verified device is trusted.");
  ok(phone._id.includes("DEV2"), "The device ID is part of the session ID.");
  ok(
    phone._id.includes("Phone"),
    "The display name is part of the session ID."
  );
  ok(!phone._currentSession, "Other devices are not the current one.");
  ok(phone._trusted, "A cross-signing verified device is trusted.");

  // A device is reported as untrusted when cross-signing is not verified.
  account = getAccount(getSessionsClient(devices, "DEV1", false));
  const untrusted = await account.getSessions();
  ok(!untrusted[0]._trusted, "A device is not trusted without cross-signing.");
});
