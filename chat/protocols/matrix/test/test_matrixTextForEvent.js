/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

var { getMatrixTextForEvent } = ChromeUtils.importESModule(
  "resource:///modules/matrixTextForEvent.sys.mjs"
);
var l10n = new Localization(["chat/matrix-properties.ftl"], true);

function run_test() {
  add_test(testGetTextForMatrixEvent);
  run_next_test();
}

const SENDER = "@test:example.com";
const FIXTURES = [
  {
    event: makeEvent({
      type: MatrixSDK.EventType.RoomMember,
      content: {
        membership: "ban",
      },
      target: {
        userId: "@foo:example.com",
      },
      sender: SENDER,
    }),
    result: l10n.formatValueSync("message-banned", {
      user: SENDER,
      userBanned: "@foo:example.com",
    }),
    name: "Banned without reason",
  },
  {
    event: makeEvent({
      type: MatrixSDK.EventType.RoomMember,
      content: {
        membership: "ban",
        reason: "test",
      },
      target: {
        userId: "@foo:example.com",
      },
      sender: SENDER,
    }),
    result: l10n.formatValueSync("message-banned-with-reason", {
      user: SENDER,
      userBanned: "@foo:example.com",
      reason: "test",
    }),
    name: "Banned with reason",
  },
  {
    event: makeEvent({
      type: MatrixSDK.EventType.RoomMember,
      content: {
        membership: "invite",
        third_party_invite: {
          display_name: "bar",
        },
      },
      target: {
        userId: "@foo:example.com",
      },
      sender: SENDER,
    }),
    result: l10n.formatValueSync("message-accepted-invite-for", {
      user: "@foo:example.com",
      userWhoSent: "bar",
    }),
    name: "Invite accepted by other user with display name",
  },
  {
    event: makeEvent({
      type: MatrixSDK.EventType.RoomMember,
      content: {
        membership: "invite",
        third_party_invite: {},
      },
      target: {
        userId: "@foo:example.com",
      },
      sender: SENDER,
    }),
    result: l10n.formatValueSync("message-accepted-invite", {
      user: "@foo:example.com",
    }),
    name: "Invite accepted by other user",
  },
  {
    event: makeEvent({
      type: MatrixSDK.EventType.RoomMember,
      content: {
        membership: "invite",
      },
      target: {
        userId: "@foo:example.com",
      },
      sender: SENDER,
    }),
    result: l10n.formatValueSync("message-invited", {
      user: SENDER,
      userWhoGotInvited: "@foo:example.com",
    }),
    name: "User invited",
  },
  {
    event: makeEvent({
      type: MatrixSDK.EventType.RoomMember,
      content: {
        membership: "join",
        displayname: "ipsum",
      },
      prevContent: {
        membership: "join",
        displayname: "lorem",
      },
      sender: SENDER,
    }),
    result: l10n.formatValueSync("message-display-name-changed", {
      user: SENDER,
      oldDisplayName: "lorem",
      newDisplayName: "ipsum",
    }),
    name: "User changed their display name",
  },
  {
    event: makeEvent({
      type: MatrixSDK.EventType.RoomMember,
      content: {
        membership: "join",
        displayname: "ipsum",
      },
      prevContent: {
        membership: "join",
      },
      sender: SENDER,
    }),
    result: l10n.formatValueSync("message-display-name-set", {
      user: SENDER,
      changedName: "ipsum",
    }),
    name: "User set their display name",
  },
  {
    event: makeEvent({
      type: MatrixSDK.EventType.RoomMember,
      content: {
        membership: "join",
      },
      prevContent: {
        membership: "join",
        displayname: "lorem",
      },
      sender: SENDER,
    }),
    result: l10n.formatValueSync("message-display-name-remove", {
      user: SENDER,
      nameRemoved: "lorem",
    }),
    name: "User removed their display name",
  },
  {
    event: makeEvent({
      type: MatrixSDK.EventType.RoomMember,
      content: {
        membership: "join",
      },
      prevContent: {
        membership: "join",
      },
      sender: SENDER,
    }),
    result: null,
    name: "Users join event was edited without relevant changes",
  },
  {
    event: makeEvent({
      type: MatrixSDK.EventType.RoomMember,
      content: {
        membership: "join",
      },
      target: {
        userId: "@foo:example.com",
      },
      sender: SENDER,
    }),
    result: l10n.formatValueSync("message-joined", {
      user: "@foo:example.com",
    }),
    name: "Users joined",
  },
  {
    event: makeEvent({
      type: MatrixSDK.EventType.RoomMember,
      content: {
        membership: "leave",
      },
      prevContent: {
        membership: "invite",
      },
      target: {
        userId: "@test:example.com",
      },
      sender: SENDER,
    }),
    result: l10n.formatValueSync("message-rejected-invite", {
      user: "@test:example.com",
    }),
    name: "Invite rejected",
  },
  {
    event: makeEvent({
      type: MatrixSDK.EventType.RoomMember,
      content: {
        membership: "leave",
      },
      prevContent: {
        membership: "join",
      },
      target: {
        userId: "@test:example.com",
      },
      sender: SENDER,
    }),
    result: l10n.formatValueSync("message-left", { user: "@test:example.com" }),
    name: "Left room",
  },
  {
    event: makeEvent({
      type: MatrixSDK.EventType.RoomMember,
      content: {
        membership: "leave",
      },
      prevContent: {
        membership: "ban",
      },
      target: {
        userId: "@target:example.com",
      },
      sender: SENDER,
    }),
    result: l10n.formatValueSync("message-unbanned", {
      user: SENDER,
      userUnbanned: "@target:example.com",
    }),
    name: "Unbanned",
  },
  {
    event: makeEvent({
      type: MatrixSDK.EventType.RoomMember,
      content: {
        membership: "leave",
      },
      prevContent: {
        membership: "join",
      },
      target: {
        userId: "@target:example.com",
      },
      sender: SENDER,
    }),
    result: l10n.formatValueSync("message-kicked", {
      user: SENDER,
      userGotKicked: "@target:example.com",
    }),
    name: "Kicked without reason",
  },
  {
    event: makeEvent({
      type: MatrixSDK.EventType.RoomMember,
      content: {
        membership: "leave",
        reason: "lorem ipsum",
      },
      prevContent: {
        membership: "join",
      },
      target: {
        userId: "@target:example.com",
      },
      sender: SENDER,
    }),
    result: l10n.formatValueSync("message-kicked-with-reason", {
      user: SENDER,
      userGotKicked: "@target:example.com",
      reason: "lorem ipsum",
    }),
    name: "Kicked with reason",
  },
  {
    event: makeEvent({
      type: MatrixSDK.EventType.RoomMember,
      content: {
        membership: "leave",
        reason: "lorem ipsum",
      },
      prevContent: {
        membership: "invite",
      },
      target: {
        userId: "@target:example.com",
      },
      sender: SENDER,
    }),
    result: l10n.formatValueSync("message-withdrew-invite-with-reason", {
      user: SENDER,
      userInvitationWithdrawn: "@target:example.com",
      reason: "lorem ipsum",
    }),
    name: "Invite withdrawn with reason",
  },
  {
    event: makeEvent({
      type: MatrixSDK.EventType.RoomMember,
      content: {
        membership: "leave",
      },
      prevContent: {
        membership: "invite",
      },
      target: {
        userId: "@target:example.com",
      },
      sender: SENDER,
    }),
    result: l10n.formatValueSync("message-withdrew-invite", {
      user: SENDER,
      userInvitationWithdrawn: "@target:example.com",
    }),
    name: "Invite withdrawn without reason",
  },
  {
    event: makeEvent({
      type: MatrixSDK.EventType.RoomMember,
      content: {
        membership: "leave",
      },
      prevContent: {
        membership: "leave",
      },
      target: {
        userId: "@target:example.com",
      },
      sender: SENDER,
    }),
    result: null,
    name: "No message for leave to leave",
  },
  {
    event: makeEvent({
      type: MatrixSDK.EventType.RoomPowerLevels,
      sender: SENDER,
    }),
    result: null,
    name: "No previous power levels",
  },
  {
    event: makeEvent({
      type: MatrixSDK.EventType.RoomPowerLevels,
      content: {
        users: {
          "@test:example.com": 100,
        },
      },
      prevContent: {
        users: {
          "@test:example.com": 100,
        },
      },
      sender: SENDER,
    }),
    result: null,
    name: "No user power level changes",
  },
  {
    event: makeEvent({
      type: MatrixSDK.EventType.RoomPowerLevels,
      content: {
        users: {
          "@test:example.com": 100,
          "@foo:example.com": 50,
        },
      },
      prevContent: {
        users: {
          "@test:example.com": 100,
        },
      },
      sender: SENDER,
    }),
    result: l10n.formatValueSync("message-power-level-changed", {
      user: SENDER,
      powerLevelChanges: l10n.formatValueSync("message-power-level-from-to", {
        user: "@foo:example.com",
        oldPowerLevel: l10n.formatValueSync("power-level-default") + " (0)",
        newPowerLevel: l10n.formatValueSync("power-level-moderator") + " (50)",
      }),
    }),
    name: "Gave a user power levels",
  },
  {
    event: makeEvent({
      type: MatrixSDK.EventType.RoomPowerLevels,
      content: {
        users: {
          "@test:example.com": 100,
          "@foo:example.com": 50,
        },
        users_default: 10,
      },
      prevContent: {
        users: {
          "@test:example.com": 100,
        },
        users_default: 10,
      },
      sender: SENDER,
    }),
    result: l10n.formatValueSync("message-power-level-changed", {
      user: SENDER,
      powerLevelChanges: l10n.formatValueSync("message-power-level-from-to", {
        user: "@foo:example.com",
        oldPowerLevel: l10n.formatValueSync("power-level-default") + " (10)",
        newPowerLevel: l10n.formatValueSync("power-level-moderator") + " (50)",
      }),
    }),
    name: "Gave a user power levels with default level",
  },
  {
    event: makeEvent({
      type: MatrixSDK.EventType.RoomPowerLevels,
      content: {
        users: {
          "@test:example.com": 100,
          "@foo:example.com": 10,
        },
        users_default: 10,
      },
      prevContent: {
        users: {
          "@test:example.com": 100,
          "@foo:example.com": 0,
        },
        users_default: 10,
      },
      sender: SENDER,
    }),
    result: l10n.formatValueSync("message-power-level-changed", {
      user: SENDER,
      powerLevelChanges: l10n.formatValueSync("message-power-level-from-to", {
        user: "@foo:example.com",
        oldPowerLevel: l10n.formatValueSync("power-level-restricted") + " (0)",
        newPowerLevel: l10n.formatValueSync("power-level-default") + " (10)",
      }),
    }),
    name: "Promote a restricted user to default",
  },
  {
    event: makeEvent({
      type: MatrixSDK.EventType.RoomPowerLevels,
      content: {
        users: {
          "@test:example.com": 100,
          "@foo:example.com": 100,
        },
        users_default: 10,
      },
      prevContent: {
        users: {
          "@test:example.com": 100,
          "@foo:example.com": 50,
        },
      },
      sender: SENDER,
    }),
    result: l10n.formatValueSync("message-power-level-changed", {
      user: SENDER,
      powerLevelChanges: l10n.formatValueSync("message-power-level-from-to", {
        user: "@foo:example.com",
        oldPowerLevel: l10n.formatValueSync("power-level-moderator") + " (50)",
        newPowerLevel: l10n.formatValueSync("power-level-admin") + " (100)",
      }),
    }),
    name: "Prompted user from moderator to admin",
  },
  {
    event: makeEvent({
      type: MatrixSDK.EventType.RoomPowerLevels,
      content: {
        users: {
          "@test:example.com": 100,
          "@foo:example.com": 0,
        },
        users_default: 0,
      },
      prevContent: {
        users: {
          "@test:example.com": 100,
          "@foo:example.com": 100,
        },
      },
      sender: SENDER,
    }),
    result: l10n.formatValueSync("message-power-level-changed", {
      user: SENDER,
      powerLevelChanges: l10n.formatValueSync("message-power-level-from-to", {
        user: "@foo:example.com",
        oldPowerLevel: l10n.formatValueSync("power-level-admin") + " (100)",
        newPowerLevel: l10n.formatValueSync("power-level-default") + " (0)",
      }),
    }),
    name: "Demote user from admin to default",
  },
  {
    event: makeEvent({
      type: MatrixSDK.EventType.RoomPowerLevels,
      content: {
        users: {
          "@test:example.com": 100,
          "@foo:example.com": 50,
          "@bar:example.com": 0,
        },
        users_default: 0,
      },
      prevContent: {
        users: {
          "@test:example.com": 100,
          "@foo:example.com": 0,
          "@bar:example.com": 50,
        },
      },
      sender: SENDER,
    }),
    result: l10n.formatValueSync("message-power-level-changed", {
      user: SENDER,
      powerLevelChanges:
        l10n.formatValueSync("message-power-level-from-to", {
          user: "@foo:example.com",
          oldPowerLevel: l10n.formatValueSync("power-level-default") + " (0)",
          newPowerLevel:
            l10n.formatValueSync("power-level-moderator") + " (50)",
        }) +
        ", " +
        l10n.formatValueSync("message-power-level-from-to", {
          user: "@bar:example.com",
          oldPowerLevel:
            l10n.formatValueSync("power-level-moderator") + " (50)",
          newPowerLevel: l10n.formatValueSync("power-level-default") + " (0)",
        }),
    }),
    name: "Changed multiple users's power level",
  },
  {
    event: makeEvent({
      type: MatrixSDK.EventType.RoomName,
      content: {
        name: "test",
      },
      sender: SENDER,
    }),
    result: l10n.formatValueSync("message-room-name-changed", {
      user: SENDER,
      newRoomName: "test",
    }),
    name: "Set room name",
  },
  {
    event: makeEvent({
      type: MatrixSDK.EventType.RoomName,
      sender: SENDER,
    }),
    result: l10n.formatValueSync("message-room-name-remove", { user: SENDER }),
    name: "Remove room name",
  },
  {
    event: makeEvent({
      type: MatrixSDK.EventType.RoomGuestAccess,
      content: {
        guest_access: MatrixSDK.GuestAccess.Forbidden,
      },
      sender: SENDER,
    }),
    result: l10n.formatValueSync("message-guest-prevented", { user: SENDER }),
    name: "Guest access forbidden",
  },
  {
    event: makeEvent({
      type: MatrixSDK.EventType.RoomGuestAccess,
      content: {
        guest_access: MatrixSDK.GuestAccess.CanJoin,
      },
      sender: SENDER,
    }),
    result: l10n.formatValueSync("message-guest-allowed", { user: SENDER }),
    name: "Guest access allowed",
  },
  {
    event: makeEvent({
      type: MatrixSDK.EventType.RoomHistoryVisibility,
      content: {
        history_visibility: MatrixSDK.HistoryVisibility.WorldReadable,
      },
      sender: SENDER,
    }),
    result: l10n.formatValueSync("message-history-anyone", { user: SENDER }),
    name: "History access granted to anyone",
  },
  {
    event: makeEvent({
      type: MatrixSDK.EventType.RoomHistoryVisibility,
      content: {
        history_visibility: MatrixSDK.HistoryVisibility.Shared,
      },
      sender: SENDER,
    }),
    result: l10n.formatValueSync("message-history-shared", { user: SENDER }),
    name: "History access granted to members, including before they joined",
  },
  {
    event: makeEvent({
      type: MatrixSDK.EventType.RoomHistoryVisibility,
      content: {
        history_visibility: MatrixSDK.HistoryVisibility.Invited,
      },
      sender: SENDER,
    }),
    result: l10n.formatValueSync("message-history-invited", { user: SENDER }),
    name: "History access granted to members, including invited",
  },
  {
    event: makeEvent({
      type: MatrixSDK.EventType.RoomHistoryVisibility,
      content: {
        history_visibility: MatrixSDK.HistoryVisibility.Joined,
      },
      sender: SENDER,
    }),
    result: l10n.formatValueSync("message-history-joined", { user: SENDER }),
    name: "History access granted to members from the point they join",
  },
  {
    event: makeEvent({
      type: MatrixSDK.EventType.RoomCanonicalAlias,
      content: {
        alias: "#test:example.com",
      },
      sender: SENDER,
    }),
    result: l10n.formatValueSync("message-alias-main", {
      user: SENDER,
      oldAddress: "",
      newAddress: "#test:example.com",
    }),
    name: "Room alias added",
  },
  {
    event: makeEvent({
      type: MatrixSDK.EventType.RoomCanonicalAlias,
      content: {
        alias: "#test:example.com",
      },
      prevContent: {
        alias: "#old:example.com",
      },
      sender: SENDER,
    }),
    result: l10n.formatValueSync("message-alias-main", {
      user: SENDER,
      oldAddress: "#old:example.com",
      newAddress: "#test:example.com",
    }),
    name: "Room alias changed",
  },
  {
    event: makeEvent({
      type: MatrixSDK.EventType.RoomCanonicalAlias,
      content: {
        alias: "#test:example.com",
        alt_aliases: ["#foo:example.com"],
      },
      prevContent: {
        alias: "#test:example.com",
      },
      sender: SENDER,
    }),
    result: l10n.formatValueSync("message-alias-added", {
      user: SENDER,
      addresses: "#foo:example.com",
    }),
    name: "Room alt alias added",
  },
  {
    event: makeEvent({
      type: MatrixSDK.EventType.RoomCanonicalAlias,
      content: {
        alias: "#test:example.com",
      },
      prevContent: {
        alias: "#test:example.com",
        alt_aliases: ["#foo:example.com"],
      },
      sender: SENDER,
    }),
    result: l10n.formatValueSync("message-alias-removed", {
      user: SENDER,
      addresses: "#foo:example.com",
    }),
    name: "Room alt alias removed",
  },
  {
    event: makeEvent({
      type: MatrixSDK.EventType.RoomCanonicalAlias,
      content: {
        alias: "#test:example.com",
        alt_aliases: ["#bar:example.com"],
      },
      prevContent: {
        alias: "#test:example.com",
        alt_aliases: ["#foo:example.com", "#bar:example.com"],
      },
      sender: SENDER,
    }),
    result: l10n.formatValueSync("message-alias-removed", {
      user: SENDER,
      addresses: "#foo:example.com",
    }),
    name: "Room alt alias removed with multiple alts",
  },
  {
    event: makeEvent({
      type: MatrixSDK.EventType.RoomCanonicalAlias,
      content: {
        alias: "#test:example.com",
        alt_aliases: ["#foo:example.com", "#bar:example.com"],
      },
      prevContent: {
        alias: "#test:example.com",
        alt_aliases: ["#bar:example.com"],
      },
      sender: SENDER,
    }),
    result: l10n.formatValueSync("message-alias-added", {
      user: SENDER,
      addresses: "#foo:example.com",
    }),
    name: "Room alt alias added with multiple alts",
  },
  {
    event: makeEvent({
      type: MatrixSDK.EventType.RoomCanonicalAlias,
      content: {
        alias: "#test:example.com",
        alt_aliases: [
          "#foo:example.com",
          "#bar:example.com",
          "#baz:example.com",
        ],
      },
      prevContent: {
        alias: "#test:example.com",
        alt_aliases: ["#bar:example.com"],
      },
      sender: SENDER,
    }),
    result: l10n.formatValueSync("message-alias-added", {
      user: SENDER,
      addresses: "#foo:example.com, #baz:example.com",
    }),
    name: "Multiple room alt aliases added with multiple alts",
  },
  {
    event: makeEvent({
      type: MatrixSDK.EventType.RoomCanonicalAlias,
      content: {
        alias: "#test:example.com",
        alt_aliases: ["#foo:example.com", "#bar:example.com"],
      },
      prevContent: {
        alias: "#test:example.com",
        alt_aliases: ["#bar:example.com", "#baz:example.com"],
      },
      sender: SENDER,
    }),
    result: l10n.formatValueSync("message-alias-removed-and-added", {
      user: SENDER,
      removedAddresses: "#baz:example.com",
      addedAddresses: "#foo:example.com",
    }),
    name: "Room alias added and removed",
  },
  {
    event: makeEvent({
      type: MatrixSDK.EventType.RoomCanonicalAlias,
      content: {
        alias: "#test:example.com",
        alt_aliases: [],
      },
      prevContent: {
        alias: "#test:example.com",
      },
      sender: SENDER,
    }),
    result: null,
    name: "No discernible changes to the room aliases",
  },
  {
    event: makeEvent({
      type: MatrixSDK.EventType.RoomMessage,
      content: {
        msgtype: MatrixSDK.MsgType.KeyVerificationRequest,
        to: "@foo:example.com",
      },
      sender: SENDER,
    }),
    result: l10n.formatValueSync("message-verification-request2", {
      user: SENDER,
      userReceiving: "@foo:example.com",
    }),
    name: "Inline key verification request",
  },
  {
    event: makeEvent({
      type: MatrixSDK.EventType.KeyVerificationRequest,
      content: {
        to: "@foo:example.com",
      },
      sender: SENDER,
    }),
    result: l10n.formatValueSync("message-verification-request2", {
      user: SENDER,
      userReceiving: "@foo:example.com",
    }),
    name: "Key verification request",
  },
  {
    event: makeEvent({
      type: MatrixSDK.EventType.KeyVerificationCancel,
      content: {
        reason: "Lorem ipsum",
      },
      sender: SENDER,
    }),
    result: l10n.formatValueSync("message-verification-cancel2", {
      user: SENDER,
      reason: "Lorem ipsum",
    }),
    name: "Key verification cancelled",
  },
  {
    event: makeEvent({
      type: MatrixSDK.EventType.KeyVerificationDone,
      sender: SENDER,
    }),
    result: l10n.formatValueSync("message-verification-done"),
    name: "Key verification done",
  },
  {
    event: makeEvent({
      type: MatrixSDK.EventType.RoomMessageEncrypted,
      content: {
        msgtype: "m.bad.encrypted",
      },
    }),
    result: l10n.formatValueSync("message-decryption-error"),
    name: "Decryption error",
  },
  {
    event: makeEvent({
      type: MatrixSDK.EventType.RoomEncryption,
    }),
    result: l10n.formatValueSync("message-encryption-start"),
    name: "Encryption start",
  },
];

function testGetTextForMatrixEvent() {
  for (const fixture of FIXTURES) {
    const result = getMatrixTextForEvent(fixture.event);
    equal(result, fixture.result, fixture.name);
  }
  run_next_test();
}
