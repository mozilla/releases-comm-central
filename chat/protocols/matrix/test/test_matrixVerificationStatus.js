/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const {
  canVerifyUserIdentity,
  checkRoomHasUnverifiedDevices,
  checkUserHasUnverifiedDevices,
  userIdentityVerified,
} = ChromeUtils.importESModule("resource:///modules/matrixAccount.sys.mjs");
const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);

const sandbox = sinon.createSandbox();
registerCleanupFunction(() => sandbox.restore());

const USER_ID = "@user:example.com";
const OTHER_USER_ID = "@other:example.com";
const THIRD_USER_ID = "@third:example.com";

/**
 * Build a device object as returned by getUserDeviceInfo.
 *
 * @param {string} deviceId - ID of the device.
 * @param {MatrixSDK.DeviceVerification} verified - Verification state of the device.
 * @param {string} [userId] - ID of the device owner.
 * @returns {object} Device info.
 */
function makeDevice(deviceId, verified, userId = USER_ID) {
  return { deviceId, userId, verified };
}

/**
 * Build a minimal client mock that only implements getCrypto().
 *
 * @param {Map<string, Map<string, object>>} devices - User ID to device ID to
 *   device info.
 * @param {string[]} crossSigningVerified - User IDs whose cross-signing
 *   identity is verified.
 * @param {string[]} [previouslyVerified] - User IDs whose cross-signing
 *   identity was verified before, but isn't anymore.
 * @returns {object} Mock client.
 */
function getMockClient(
  devices,
  crossSigningVerified = [],
  previouslyVerified = []
) {
  return {
    getCrypto() {
      return {
        getUserDeviceInfo: sandbox.stub().callsFake(async userIds => {
          const result = new Map();
          for (const userId of userIds) {
            result.set(userId, devices.get(userId) ?? new Map());
          }
          return result;
        }),
        getUserVerificationStatus: sandbox.stub().callsFake(async userId => {
          return {
            isCrossSigningVerified: () => crossSigningVerified.includes(userId),
            wasCrossSigningVerified: () => previouslyVerified.includes(userId),
          };
        }),
      };
    },
  };
}

add_task(async function test_canVerifyUserIdentity() {
  // Nothing is known about the devices of the user.
  equal(
    await canVerifyUserIdentity(USER_ID, getMockClient(new Map())),
    false,
    "A user without known devices cannot be verified."
  );

  const devices = new Map([
    [
      USER_ID,
      new Map([
        ["DEV1", makeDevice("DEV1", MatrixSDK.DeviceVerification.Unverified)],
      ]),
    ],
  ]);
  ok(
    await canVerifyUserIdentity(USER_ID, getMockClient(devices)),
    "A user with devices can be verified."
  );
});

add_task(async function test_checkUserHasUnverifiedDevices() {
  const allVerified = new Map([
    [
      USER_ID,
      new Map([
        ["DEV1", makeDevice("DEV1", MatrixSDK.DeviceVerification.Verified)],
        ["DEV2", makeDevice("DEV2", MatrixSDK.DeviceVerification.Verified)],
      ]),
    ],
  ]);
  equal(
    await checkUserHasUnverifiedDevices(USER_ID, getMockClient(allVerified)),
    false,
    "All verified devices mean no unverified devices."
  );

  // A single unverified device means there are unverified devices.
  const someUnverified = new Map([
    [
      USER_ID,
      new Map([
        ["DEV1", makeDevice("DEV1", MatrixSDK.DeviceVerification.Verified)],
        ["DEV2", makeDevice("DEV2", MatrixSDK.DeviceVerification.Unverified)],
      ]),
    ],
  ]);
  equal(
    await checkUserHasUnverifiedDevices(USER_ID, getMockClient(someUnverified)),
    true,
    "A single unverified device flags the user."
  );

  // Blocked devices also count as untrusted.
  const blocked = new Map([
    [
      USER_ID,
      new Map([
        ["DEV1", makeDevice("DEV1", MatrixSDK.DeviceVerification.Blocked)],
      ]),
    ],
  ]);
  equal(
    await checkUserHasUnverifiedDevices(USER_ID, getMockClient(blocked)),
    true,
    "Blocked devices also count as unverified."
  );

  // Users without any known devices have no unverified devices.
  equal(
    await checkUserHasUnverifiedDevices(
      OTHER_USER_ID,
      getMockClient(allVerified)
    ),
    false,
    "A user without known devices has none unverified."
  );
});

add_task(async function test_userIdentityVerified() {
  // A verified cross-signing identity counts as a verified user, regardless
  // of any devices.
  equal(
    await userIdentityVerified(USER_ID, getMockClient(new Map(), [USER_ID])),
    true,
    "A verified cross-signing identity counts as verified."
  );

  // Unverified identity, even if all devices are trusted.
  const allVerified = new Map([
    [
      USER_ID,
      new Map([
        ["DEV1", makeDevice("DEV1", MatrixSDK.DeviceVerification.Verified)],
        ["DEV2", makeDevice("DEV2", MatrixSDK.DeviceVerification.Verified)],
      ]),
    ],
  ]);
  equal(
    await userIdentityVerified(USER_ID, getMockClient(allVerified)),
    false,
    "An unverified identity is not verified."
  );
});

add_task(async function test_checkRoomHasUnverifiedDevices() {
  // Two other users plus us, everyone's identity and devices are verified.
  const allUsers = [USER_ID, OTHER_USER_ID, THIRD_USER_ID];
  const everythingVerified = new Map([
    [
      USER_ID,
      new Map([
        ["DEV1", makeDevice("DEV1", MatrixSDK.DeviceVerification.Verified)],
      ]),
    ],
    [
      OTHER_USER_ID,
      new Map([
        ["DEV1", makeDevice("DEV1", MatrixSDK.DeviceVerification.Verified)],
      ]),
    ],
    [
      THIRD_USER_ID,
      new Map([
        ["DEV1", makeDevice("DEV1", MatrixSDK.DeviceVerification.Verified)],
      ]),
    ],
  ]);
  equal(
    await checkRoomHasUnverifiedDevices(
      allUsers,
      USER_ID,
      getMockClient(everythingVerified, [OTHER_USER_ID, THIRD_USER_ID]),
      false
    ),
    false,
    "Verified identities and devices keep a room trusted."
  );

  // An unverified identity makes the room untrusted.
  const onlyOtherVerified = new Map([
    [
      OTHER_USER_ID,
      new Map([
        ["DEV1", makeDevice("DEV1", MatrixSDK.DeviceVerification.Verified)],
      ]),
    ],
  ]);
  equal(
    await checkRoomHasUnverifiedDevices(
      allUsers,
      USER_ID,
      getMockClient(onlyOtherVerified, [OTHER_USER_ID]),
      false
    ),
    true,
    "An unverified identity makes a room untrusted."
  );

  // A previously verified identity that is no longer verified also makes the
  // room untrusted.
  const downgraded = getMockClient(
    onlyOtherVerified,
    [],
    [THIRD_USER_ID, OTHER_USER_ID]
  );
  equal(
    await checkRoomHasUnverifiedDevices(allUsers, USER_ID, downgraded, false),
    true,
    "A no-longer-verified identity makes a room untrusted."
  );

  // An unverified device of an identity-verified user makes the room
  // untrusted.
  const otherUnverifiedDevice = new Map([
    [
      USER_ID,
      new Map([
        ["DEV1", makeDevice("DEV1", MatrixSDK.DeviceVerification.Verified)],
      ]),
    ],
    [
      OTHER_USER_ID,
      new Map([
        ["DEV1", makeDevice("DEV1", MatrixSDK.DeviceVerification.Verified)],
        ["DEV2", makeDevice("DEV2", MatrixSDK.DeviceVerification.Unverified)],
      ]),
    ],
    [
      THIRD_USER_ID,
      new Map([
        ["DEV1", makeDevice("DEV1", MatrixSDK.DeviceVerification.Verified)],
      ]),
    ],
  ]);
  equal(
    await checkRoomHasUnverifiedDevices(
      allUsers,
      USER_ID,
      getMockClient(otherUnverifiedDevice, [OTHER_USER_ID, THIRD_USER_ID]),
      false
    ),
    true,
    "An unverified device of a verified identity makes a room untrusted."
  );

  // Our own unverified devices are ignored for direct message rooms and rooms
  // with two members.
  const selfUnverifiedDevice = new Map([
    [
      USER_ID,
      new Map([
        ["DEV1", makeDevice("DEV1", MatrixSDK.DeviceVerification.Unverified)],
      ]),
    ],
    [
      OTHER_USER_ID,
      new Map([
        ["DEV1", makeDevice("DEV1", MatrixSDK.DeviceVerification.Verified)],
      ]),
    ],
    [
      THIRD_USER_ID,
      new Map([
        ["DEV1", makeDevice("DEV1", MatrixSDK.DeviceVerification.Verified)],
      ]),
    ],
  ]);
  equal(
    await checkRoomHasUnverifiedDevices(
      [USER_ID, OTHER_USER_ID],
      USER_ID,
      getMockClient(selfUnverifiedDevice, [OTHER_USER_ID]),
      true
    ),
    false,
    "Own unverified devices are ignored in a direct message room."
  );
  equal(
    await checkRoomHasUnverifiedDevices(
      [USER_ID, OTHER_USER_ID],
      USER_ID,
      getMockClient(selfUnverifiedDevice, [OTHER_USER_ID]),
      false
    ),
    false,
    "Two-member rooms are treated like direct message rooms."
  );

  // ... but not for other group conversations.
  equal(
    await checkRoomHasUnverifiedDevices(
      allUsers,
      USER_ID,
      getMockClient(selfUnverifiedDevice, [OTHER_USER_ID, THIRD_USER_ID]),
      false
    ),
    true,
    "Group conversations check our own device verification."
  );

  // When we are alone in a room, our own devices are still checked.
  equal(
    await checkRoomHasUnverifiedDevices(
      [USER_ID],
      USER_ID,
      getMockClient(selfUnverifiedDevice, []),
      false
    ),
    true,
    "Alone in a room, our own devices are still checked."
  );
  equal(
    await checkRoomHasUnverifiedDevices(
      [USER_ID],
      USER_ID,
      getMockClient(everythingVerified, []),
      false
    ),
    false,
    "Verified own devices keep a room trusted."
  );
});
