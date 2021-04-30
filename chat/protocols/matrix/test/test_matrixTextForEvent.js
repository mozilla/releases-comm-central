/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

var { getMatrixTextForEvent } = ChromeUtils.import(
  "resource:///modules/matrixTextForEvent.jsm"
);
var { l10nHelper } = ChromeUtils.import("resource:///modules/imXPCOMUtils.jsm");
var { EventType } = ChromeUtils.import("resource:///modules/matrix-sdk.jsm");
var _ = l10nHelper("chrome://chat/locale/matrix.properties");

function run_test() {
  add_test(testGetTextForMatrixEvent);
  run_next_test();
}

const SENDER = "@test:example.com";
const FIXTURES = [
  {
    event: _makeMatrixEvent({
      type: EventType.RoomMember,
      content: {
        membership: "ban",
      },
      target: {
        userId: "@foo:example.com",
      },
    }),
    result: _("message.banned", SENDER, "@foo:example.com"),
    name: "Banned without reason",
  },
  {
    event: _makeMatrixEvent({
      type: EventType.RoomMember,
      content: {
        membership: "ban",
        reason: "test",
      },
      target: {
        userId: "@foo:example.com",
      },
    }),
    result:
      _("message.banned", SENDER, "@foo:example.com") +
      _("message.reason", "test"),
    name: "Banned with reason",
  },
  {
    event: _makeMatrixEvent({
      type: EventType.RoomMember,
      content: {
        membership: "invite",
        third_party_invite: {
          display_name: "bar",
        },
      },
      target: {
        userId: "@foo:example.com",
      },
    }),
    result: _("message.acceptedInviteFor", "@foo:example.com", "bar"),
    name: "Invite accepted by other user with display name",
  },
  {
    event: _makeMatrixEvent({
      type: EventType.RoomMember,
      content: {
        membership: "invite",
        third_party_invite: {},
      },
      target: {
        userId: "@foo:example.com",
      },
    }),
    result: _("message.acceptedInvite", "@foo:example.com"),
    name: "Invite accepted by other user",
  },
  {
    event: _makeMatrixEvent({
      type: EventType.RoomMember,
      content: {
        membership: "invite",
      },
      target: {
        userId: "@foo:example.com",
      },
    }),
    result: _("message.invited", SENDER, "@foo:example.com"),
    name: "User invited",
  },
  {
    event: _makeMatrixEvent({
      type: EventType.RoomMember,
      content: {
        membership: "join",
        displayname: "ipsum",
      },
      prevContent: {
        membership: "join",
        displayname: "lorem",
      },
    }),
    result: _("message.displayName.changed", SENDER, "lorem", "ipsum"),
    name: "User changed their display name",
  },
  {
    event: _makeMatrixEvent({
      type: EventType.RoomMember,
      content: {
        membership: "join",
        displayname: "ipsum",
      },
      prevContent: {
        membership: "join",
      },
    }),
    result: _("message.displayName.set", SENDER, "ipsum"),
    name: "User set their display name",
  },
  {
    event: _makeMatrixEvent({
      type: EventType.RoomMember,
      content: {
        membership: "join",
      },
      prevContent: {
        membership: "join",
        displayname: "lorem",
      },
    }),
    result: _("message.displayName.remove", SENDER, "lorem"),
    name: "User removed their display name",
  },
  {
    event: _makeMatrixEvent({
      type: EventType.RoomMember,
      content: {
        membership: "join",
      },
      prevContent: {
        membership: "join",
      },
    }),
    result: null,
    name: "Users join event was edited without relevant changes",
  },
  {
    event: _makeMatrixEvent({
      type: EventType.RoomMember,
      content: {
        membership: "join",
      },
      target: {
        userId: "@foo:example.com",
      },
    }),
    result: _("message.joined", "@foo:example.com"),
    name: "Users joined",
  },
  {
    event: _makeMatrixEvent({
      type: EventType.RoomMember,
      content: {
        membership: "leave",
      },
      prevContent: {
        membership: "invite",
      },
      target: {
        userId: "@test:example.com",
      },
    }),
    result: _("message.rejectedInvite", "@test:example.com"),
    name: "Invite rejected",
  },
  {
    event: _makeMatrixEvent({
      type: EventType.RoomMember,
      content: {
        membership: "leave",
      },
      prevContent: {
        membership: "join",
      },
      target: {
        userId: "@test:example.com",
      },
    }),
    result: _("message.left", "@test:example.com"),
    name: "Left room",
  },
  {
    event: _makeMatrixEvent({
      type: EventType.RoomMember,
      content: {
        membership: "leave",
      },
      prevContent: {
        membership: "ban",
      },
      target: {
        userId: "@target:example.com",
      },
    }),
    result: _("message.unbanned", SENDER, "@target:example.com"),
    name: "Unbanned",
  },
  {
    event: _makeMatrixEvent({
      type: EventType.RoomMember,
      content: {
        membership: "leave",
      },
      prevContent: {
        membership: "join",
      },
      target: {
        userId: "@target:example.com",
      },
    }),
    result: _("message.kicked", SENDER, "@target:example.com"),
    name: "Kicked without reason",
  },
  {
    event: _makeMatrixEvent({
      type: EventType.RoomMember,
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
    }),
    result:
      _("message.kicked", SENDER, "@target:example.com") +
      _("message.reason", "lorem ipsum"),
    name: "Kicked with reason",
  },
  {
    event: _makeMatrixEvent({
      type: EventType.RoomMember,
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
    }),
    result:
      _("message.withdrewInvite", SENDER, "@target:example.com") +
      _("message.reason", "lorem ipsum"),
    name: "Invite withdrawn with reason",
  },
  {
    event: _makeMatrixEvent({
      type: EventType.RoomMember,
      content: {
        membership: "leave",
      },
      prevContent: {
        membership: "invite",
      },
      target: {
        userId: "@target:example.com",
      },
    }),
    result: _("message.withdrewInvite", SENDER, "@target:example.com"),
    name: "Invite withdrawn without reason",
  },
  {
    event: _makeMatrixEvent({
      type: EventType.RoomMember,
      content: {
        membership: "leave",
      },
      prevContent: {
        membership: "leave",
      },
      target: {
        userId: "@target:example.com",
      },
    }),
    result: null,
    name: "No message for leave to leave",
  },
  {
    event: _makeMatrixEvent({
      type: EventType.RoomPowerLevels,
    }),
    result: null,
    name: "No previous power levels",
  },
  {
    event: _makeMatrixEvent({
      type: EventType.RoomPowerLevels,
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
    }),
    result: null,
    name: "No user power level changes",
  },
  {
    event: _makeMatrixEvent({
      type: EventType.RoomPowerLevels,
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
    event: _makeMatrixEvent({
      type: EventType.RoomPowerLevels,
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
    event: _makeMatrixEvent({
      type: EventType.RoomPowerLevels,
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
    event: _makeMatrixEvent({
      type: EventType.RoomPowerLevels,
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
    event: _makeMatrixEvent({
      type: EventType.RoomPowerLevels,
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
    event: _makeMatrixEvent({
      type: EventType.RoomPowerLevels,
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
    event: _makeMatrixEvent({
      type: EventType.RoomName,
      content: {
        name: "test",
      },
    }),
    result: _("message.roomName.changed", SENDER, "test"),
    name: "Set room name",
  },
  {
    event: _makeMatrixEvent({
      type: EventType.RoomName,
    }),
    result: _("message.roomName.remove", SENDER),
    name: "Remove room name",
  },
  {
    event: _makeMatrixEvent({
      type: EventType.RoomGuestAccess,
      content: {
        guest_access: "forbidden",
      },
    }),
    result: _("message.guest.prevented", SENDER),
    name: "Guest access forbidden",
  },
  {
    event: _makeMatrixEvent({
      type: EventType.RoomGuestAccess,
      content: {
        guest_access: "can_join",
      },
    }),
    result: _("message.guest.allowed", SENDER),
    name: "Guest access allowed",
  },
  {
    event: _makeMatrixEvent({
      type: EventType.RoomHistoryVisibility,
      content: {
        history_visibility: "world_readable",
      },
    }),
    result: _("message.history.anyone", SENDER),
    name: "History access granted to anyone",
  },
  {
    event: _makeMatrixEvent({
      type: EventType.RoomHistoryVisibility,
      content: {
        history_visibility: "shared",
      },
    }),
    result: _("message.history.shared", SENDER),
    name: "History access granted to members, including before they joined",
  },
  {
    event: _makeMatrixEvent({
      type: EventType.RoomHistoryVisibility,
      content: {
        history_visibility: "invited",
      },
    }),
    result: _("message.history.invited", SENDER),
    name: "History access granted to members, including invited",
  },
  {
    event: _makeMatrixEvent({
      type: EventType.RoomHistoryVisibility,
      content: {
        history_visibility: "joined",
      },
    }),
    result: _("message.history.joined", SENDER),
    name: "History access granted to members from the point they join",
  },
  {
    event: _makeMatrixEvent({
      type: EventType.RoomCanonicalAlias,
      content: {
        alias: "#test:example.com",
      },
    }),
    result: _("message.alias.main", SENDER, undefined, "#test:example.com"),
    name: "Room alias added",
  },
  {
    event: _makeMatrixEvent({
      type: EventType.RoomCanonicalAlias,
      content: {
        alias: "#test:example.com",
      },
      prevContent: {
        alias: "#old:example.com",
      },
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
    event: _makeMatrixEvent({
      type: EventType.RoomCanonicalAlias,
      content: {
        alias: "#test:example.com",
        alt_aliases: ["#foo:example.com"],
      },
      prevContent: {
        alias: "#test:example.com",
      },
    }),
    result: _("message.alias.added", SENDER, "#foo:example.com"),
    name: "Room alt alias added",
  },
  {
    event: _makeMatrixEvent({
      type: EventType.RoomCanonicalAlias,
      content: {
        alias: "#test:example.com",
      },
      prevContent: {
        alias: "#test:example.com",
        alt_aliases: ["#foo:example.com"],
      },
    }),
    result: _("message.alias.removed", SENDER, "#foo:example.com"),
    name: "Room alt alias removed",
  },
  {
    event: _makeMatrixEvent({
      type: EventType.RoomCanonicalAlias,
      content: {
        alias: "#test:example.com",
        alt_aliases: ["#bar:example.com"],
      },
      prevContent: {
        alias: "#test:example.com",
        alt_aliases: ["#foo:example.com", "#bar:example.com"],
      },
    }),
    result: _("message.alias.removed", SENDER, "#foo:example.com"),
    name: "Room alt alias removed with multiple alts",
  },
  {
    event: _makeMatrixEvent({
      type: EventType.RoomCanonicalAlias,
      content: {
        alias: "#test:example.com",
        alt_aliases: ["#foo:example.com", "#bar:example.com"],
      },
      prevContent: {
        alias: "#test:example.com",
        alt_aliases: ["#bar:example.com"],
      },
    }),
    result: _("message.alias.added", SENDER, "#foo:example.com"),
    name: "Room alt alias added with multiple alts",
  },
  {
    event: _makeMatrixEvent({
      type: EventType.RoomCanonicalAlias,
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
    }),
    result: _(
      "message.alias.added",
      SENDER,
      "#foo:example.com, #baz:example.com"
    ),
    name: "Multiple room alt aliases added with multiple alts",
  },
  {
    event: _makeMatrixEvent({
      type: EventType.RoomCanonicalAlias,
      content: {
        alias: "#test:example.com",
        alt_aliases: ["#foo:example.com", "#bar:example.com"],
      },
      prevContent: {
        alias: "#test:example.com",
        alt_aliases: ["#bar:example.com", "#baz:example.com"],
      },
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
    event: _makeMatrixEvent({
      type: EventType.RoomCanonicalAlias,
      content: {
        alias: "#test:example.com",
        alt_aliases: [],
      },
      prevContent: {
        alias: "#test:example.com",
      },
    }),
    result: null,
    name: "No discernible changes to the room aliases",
  },
];

function testGetTextForMatrixEvent() {
  for (const fixture of FIXTURES) {
    const result = getMatrixTextForEvent(fixture.event);
    equal(result, fixture.result, fixture.name);
  }
  run_next_test();
}

function _makeMatrixEvent({ type, target, content = {}, prevContent = {} }) {
  return {
    getType() {
      return type;
    },
    target,
    getContent() {
      return content;
    },
    getPrevContent() {
      return prevContent;
    },
    getSender() {
      return SENDER;
    },
  };
}
