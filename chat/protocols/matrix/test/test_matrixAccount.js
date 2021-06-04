/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

var { TestUtils } = ChromeUtils.import(
  "resource://testing-common/TestUtils.jsm"
);

loadMatrix();

add_task(function test_getConversationById() {
  const mockAccount = {
    roomList: new Map(),
    _pendingRoomAliases: new Map(),
  };
  mockAccount.roomList.set("foo", "bar");
  mockAccount._pendingRoomAliases.set("lorem", "ipsum");

  equal(
    matrix.MatrixAccount.prototype.getConversationById.call(mockAccount),
    null
  );
  equal(
    matrix.MatrixAccount.prototype.getConversationById.call(mockAccount, "foo"),
    "bar"
  );
  equal(
    matrix.MatrixAccount.prototype.getConversationById.call(
      mockAccount,
      "lorem"
    ),
    "ipsum"
  );
});

add_task(function test_getConversationByIdOrAlias() {
  const mockAccount = {
    getConversationById(id) {
      if (id === "foo") {
        return "bar";
      }
      if (id === "_lorem") {
        return "ipsum";
      }
      return null;
    },
    _client: {
      getRoom(id) {
        if (id === "lorem") {
          return {
            roomId: "_" + id,
          };
        }
        return null;
      },
    },
  };

  equal(
    matrix.MatrixAccount.prototype.getConversationByIdOrAlias.call(mockAccount),
    null
  );
  equal(
    matrix.MatrixAccount.prototype.getConversationByIdOrAlias.call(
      mockAccount,
      "foo"
    ),
    "bar"
  );
  equal(
    matrix.MatrixAccount.prototype.getConversationByIdOrAlias.call(
      mockAccount,
      "lorem"
    ),
    "ipsum"
  );
  equal(
    matrix.MatrixAccount.prototype.getConversationByIdOrAlias.call(
      mockAccount,
      "baz"
    ),
    null
  );
});

add_task(async function test_getGroupConversation() {
  registerCleanupFunction(() => {
    const conversations = Services.conversations.getConversations();
    for (const conversation of conversations) {
      try {
        conversation.close();
      } catch {}
    }
  });

  let allowedGetRoomIds = new Set(["baz"]);
  const mockAccount = {
    getConversationByIdOrAlias(idOrAlias) {
      if (idOrAlias === "foo") {
        return "bar";
      }
      return null;
    },
    createRoom(map, id, conv) {
      this.createdConv = conv;
      this.createdId = id;
    },
    ERROR(message) {
      this.lastError = message.toString();
    },
    LOG() {},
    _client: {
      getRoom(roomId) {
        if (allowedGetRoomIds.has(roomId)) {
          return mockMatrixRoom("baz");
        }
        return null;
      },
      async joinRoom(roomId) {
        if (roomId === "lorem") {
          return mockMatrixRoom("lorem");
        } else if (roomId.endsWith(":example.com")) {
          const error = new Error("not found");
          error.errcode = "M_NOT_FOUND";
          throw error;
        }
        throw new Error("Could not join");
      },
      getDomain() {
        return "example.com";
      },
      getHomeserverUrl() {
        return "https://example.com";
      },
      leave() {
        mockAccount.left = true;
      },
    },
    roomList: new Map(),
    _pendingRoomAliases: new Map(),
    userId: "@test:example.com",
  };

  equal(
    matrix.MatrixAccount.prototype.getGroupConversation.call(mockAccount, ""),
    null
  );

  equal(
    matrix.MatrixAccount.prototype.getGroupConversation.call(
      mockAccount,
      "foo"
    ),
    "bar"
  );

  const existingRoom = matrix.MatrixAccount.prototype.getGroupConversation.call(
    mockAccount,
    "baz"
  );
  strictEqual(existingRoom, mockAccount.roomList.get("baz"));
  ok(!existingRoom.joining);
  existingRoom.close();

  const joinedRoom = matrix.MatrixAccount.prototype.getGroupConversation.call(
    mockAccount,
    "lorem"
  );
  ok(joinedRoom.joining);
  allowedGetRoomIds.add("lorem");
  await TestUtils.waitForTick();
  equal(mockAccount.lastError, undefined);
  strictEqual(joinedRoom, mockAccount.roomList.get("lorem"));
  ok(!joinedRoom.joining);
  joinedRoom.close();

  const createdRoom = matrix.MatrixAccount.prototype.getGroupConversation.call(
    mockAccount,
    "#ipsum:example.com"
  );
  ok(createdRoom.joining);
  await TestUtils.waitForTick();
  equal(mockAccount.lastError, undefined);
  strictEqual(createdRoom, mockAccount.createdConv);
  equal(mockAccount.createdId, "#ipsum:example.com");
  createdRoom.close();

  const roomAlreadyBeingCreated = matrix.MatrixAccount.prototype.getGroupConversation.call(
    mockAccount,
    "#lorem:example.com"
  );
  ok(roomAlreadyBeingCreated.joining);
  mockAccount._pendingRoomAliases.set("#lorem:example.com", "hi");
  await TestUtils.waitForTick();
  ok(!roomAlreadyBeingCreated.joining);
  ok(roomAlreadyBeingCreated._replacedBy, "hi");

  const missingLocalRoom = matrix.MatrixAccount.prototype.getGroupConversation.call(
    mockAccount,
    "!ipsum:example.com"
  );
  ok(missingLocalRoom.joining);
  await TestUtils.waitForTick();
  ok(!missingLocalRoom.joining);
  equal(mockAccount.lastError, "Error: not found");
  ok(mockAccount.left);

  mockAccount.left = false;
  const unjoinableRemoteRoom = matrix.MatrixAccount.prototype.getGroupConversation.call(
    mockAccount,
    "#test:matrix.org"
  );
  ok(unjoinableRemoteRoom.joining);
  await TestUtils.waitForTick();
  ok(!unjoinableRemoteRoom.joining);
  equal(mockAccount.lastError, "Error: Could not join");
  ok(mockAccount.left);
});

add_task(async function test_joinChat() {
  const roomId = "!foo:example.com";
  const conversation = {
    waitForRoom() {
      return Promise.resolve();
    },
    checkForUpdate() {
      this.checked = true;
    },
  };
  const mockAccount = {
    getGroupConversation(id) {
      this.groupConv = id;
      return conversation;
    },
  };
  const components = {
    getValue(key) {
      if (key === "roomIdOrAlias") {
        return roomId;
      }
      ok(false, "Unknown chat room field");
      return null;
    },
  };

  const conv = matrix.MatrixAccount.prototype.joinChat.call(
    mockAccount,
    components
  );
  equal(mockAccount.groupConv, roomId);
  strictEqual(conv, conversation);
  await Promise.resolve();
  ok(conversation.checked);
});

add_task(async function test_getDMRoomIdsForUserId() {
  const account = getAccount({
    getRoom(roomId) {
      if (roomId === "!invalid:example.com") {
        return null;
      }
      return getClientRoom(
        roomId,
        {
          isSpaceRoom() {
            return roomId === "!space:example.com";
          },
          getMyMembership() {
            return roomId === "!left:example.com" ? "leave" : "join";
          },
          getMember(userId) {
            return {
              membership: "invite",
            };
          },
        },
        account._client
      );
    },
  });
  account._userToRoom = {
    "@test:example.com": [
      "!asdf:example.com",
      "!space:example.com",
      "!left:example.com",
      "!invalid:example.com",
    ],
  };
  const invalid = account.getDMRoomIdsForUserId("@nouser:example.com");
  ok(Array.isArray(invalid));
  equal(invalid.length, 0);

  const rooms = account.getDMRoomIdsForUserId("@test:example.com");
  ok(Array.isArray(rooms));
  equal(rooms.length, 1);
  equal(rooms[0], "!asdf:example.com");
});

function mockMatrixRoom(roomId) {
  return {
    getMyMembership() {
      return "join";
    },
    getJoinedMembers() {
      return [];
    },
    getLiveTimeline() {
      return {
        getState() {
          return {
            getStateEvents() {
              return [];
            },
          };
        },
      };
    },
    getAvatarUrl() {
      return "";
    },
    isSpaceRoom() {
      return false;
    },
    roomId,
  };
}
