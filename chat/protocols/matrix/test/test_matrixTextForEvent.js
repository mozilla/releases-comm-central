/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

var { getMatrixTextForEvent } = ChromeUtils.importESModule(
  "resource:///modules/matrixTextForEvent.sys.mjs"
);
var { l10nHelper } = ChromeUtils.importESModule(
  "resource:///modules/imXPCOMUtils.sys.mjs"
);
var _ = l10nHelper("chrome://chat/locale/matrix.properties");

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
    result: _("message.banned", SENDER, "@foo:example.com"),
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
    result: _("message.bannedWithReason", SENDER, "@foo:example.com", "test"),
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
    result: _("message.acceptedInviteFor", "@foo:example.com", "bar"),
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
    result: _("message.acceptedInvite", "@foo:example.com"),
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
    result: _("message.invited", SENDER, "@foo:example.com"),
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
    result: _("message.displayName.changed", SENDER, "lorem", "ipsum"),
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
    result: _("message.displayName.set", SENDER, "ipsum"),
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
    result: _("message.displayName.remove", SENDER, "lorem"),
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
    result: _("message.joined", "@foo:example.com"),
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
    result: _("message.rejectedInvite", "@test:example.com"),
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
    result: _("message.left", "@test:example.com"),
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
    result: _("message.unbanned", SENDER, "@target:example.com"),
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
    result: _("message.kicked", SENDER, "@target:example.com"),
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
    result: _(
      "message.kickedWithReason",
      SENDER,
      "@target:example.com",
      "lorem ipsum"
    ),
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
    result: _(
      "message.withdrewInviteWithReason",
      SENDER,
      "@target:example.com",
      "lorem ipsum"
    ),
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
    result: _("message.withdrewInvite", SENDER, "@target:example.com"),
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
    result: _(
      "message.powerLevel.changed",
      SENDER,
      _(
        "message.powerLevel.fromTo",
        "@foo:example.com",
        _("powerLevel.default") + " (0)",
        _("powerLevel.moderator") + " (50)"
      )
    ),
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
    result: _(
      "message.powerLevel.changed",
      SENDER,
      _(
        "message.powerLevel.fromTo",
        "@foo:example.com",
        _("powerLevel.default") + " (10)",
        _("powerLevel.moderator") + " (50)"
      )
    ),
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
    result: _(
      "message.powerLevel.changed",
      SENDER,
      _(
        "message.powerLevel.fromTo",
        "@foo:example.com",
        _("powerLevel.restricted") + " (0)",
        _("powerLevel.default") + " (10)"
      )
    ),
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
    result: _(
      "message.powerLevel.changed",
      SENDER,
      _(
        "message.powerLevel.fromTo",
        "@foo:example.com",
        _("powerLevel.moderator") + " (50)",
        _("powerLevel.admin") + " (100)"
      )
    ),
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
    result: _(
      "message.powerLevel.changed",
      SENDER,
      _(
        "message.powerLevel.fromTo",
        "@foo:example.com",
        _("powerLevel.admin") + " (100)",
        _("powerLevel.default") + " (0)"
      )
    ),
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
    result: _(
      "message.powerLevel.changed",
      SENDER,
      _(
        "message.powerLevel.fromTo",
        "@foo:example.com",
        _("powerLevel.default") + " (0)",
        _("powerLevel.moderator") + " (50)"
      ) +
        ", " +
        _(
          "message.powerLevel.fromTo",
          "@bar:example.com",
          _("powerLevel.moderator") + " (50)",
          _("powerLevel.default") + " (0)"
        )
    ),
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
    result: _("message.roomName.changed", SENDER, "test"),
    name: "Set room name",
  },
  {
    event: makeEvent({
      type: MatrixSDK.EventType.RoomName,
      sender: SENDER,
    }),
    result: _("message.roomName.remove", SENDER),
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
    result: _("message.guest.prevented", SENDER),
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
    result: _("message.guest.allowed", SENDER),
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
    result: _("message.history.anyone", SENDER),
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
    result: _("message.history.shared", SENDER),
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
    result: _("message.history.invited", SENDER),
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
    result: _("message.history.joined", SENDER),
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
    result: _("message.alias.main", SENDER, undefined, "#test:example.com"),
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
    result: _(
      "message.alias.main",
      SENDER,
      "#old:example.com",
      "#test:example.com"
    ),
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
    result: _("message.alias.added", SENDER, "#foo:example.com"),
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
    result: _("message.alias.removed", SENDER, "#foo:example.com"),
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
    result: _("message.alias.removed", SENDER, "#foo:example.com"),
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
    result: _("message.alias.added", SENDER, "#foo:example.com"),
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
    result: _(
      "message.alias.added",
      SENDER,
      "#foo:example.com, #baz:example.com"
    ),
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
    result: _(
      "message.alias.removedAndAdded",
      SENDER,
      "#baz:example.com",
      "#foo:example.com"
    ),
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
    result: _("message.verification.request2", SENDER, "@foo:example.com"),
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
    result: _("message.verification.request2", SENDER, "@foo:example.com"),
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
    result: _("message.verification.cancel2", SENDER, "Lorem ipsum"),
    name: "Key verification cancelled",
  },
  {
    event: makeEvent({
      type: MatrixSDK.EventType.KeyVerificationDone,
      sender: SENDER,
    }),
    result: _("message.verification.done"),
    name: "Key verification done",
  },
  {
    event: makeEvent({
      type: MatrixSDK.EventType.RoomMessageEncrypted,
      content: {
        msgtype: "m.bad.encrypted",
      },
    }),
    result: _("message.decryptionError"),
    name: "Decryption error",
  },
  {
    event: makeEvent({
      type: MatrixSDK.EventType.RoomEncryption,
    }),
    result: _("message.encryptionStart"),
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
