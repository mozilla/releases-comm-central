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
  const mockAccount = getAccount({
    getRoom(roomId) {
      if (this._rooms.has(roomId)) {
        return this._rooms.get(roomId);
      }
      if (allowedGetRoomIds.has(roomId)) {
        return getClientRoom("baz", {}, mockAccount._client);
      }
      return null;
    },
    async joinRoom(roomId) {
      if (roomId === "lorem") {
        allowedGetRoomIds.add(roomId);
        return getClientRoom(roomId, {}, mockAccount._client);
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
  });
  mockAccount.roomList.set("foo", getRoom(true, "bar", {}, mockAccount));

  equal(mockAccount.getGroupConversation(""), null);
  equal(mockAccount.getGroupConversation("foo").name, "bar");

  const existingRoom = mockAccount.getGroupConversation("baz");
  strictEqual(existingRoom, mockAccount.roomList.get("baz"));
  ok(!existingRoom.joining);
  existingRoom.close();

  const joinedRoom = mockAccount.getGroupConversation("lorem");
  ok(joinedRoom.joining);
  allowedGetRoomIds.add("lorem");
  await TestUtils.waitForTick();
  strictEqual(joinedRoom, mockAccount.roomList.get("lorem"));
  ok(!joinedRoom.joining);
  joinedRoom.close();

  const createdRoom = mockAccount.getGroupConversation("#ipsum:example.com");
  ok(createdRoom.joining);
  await createdRoom.waitForRoom();
  ok(!createdRoom.joining);
  strictEqual(createdRoom, mockAccount.roomList.get("!ipsum:example.com"));
  // Wait for catchup to complete.
  await TestUtils.waitForTick();
  createdRoom.close();

  const roomAlreadyBeingCreated = mockAccount.getGroupConversation(
    "#lorem:example.com"
  );
  ok(roomAlreadyBeingCreated.joining);
  mockAccount._pendingRoomAliases.set(
    "#lorem:example.com",
    getRoom(true, "hi", {}, mockAccount)
  );
  await roomAlreadyBeingCreated.waitForRoom();
  ok(!roomAlreadyBeingCreated.joining);
  ok(roomAlreadyBeingCreated._replacedBy);

  const missingLocalRoom = mockAccount.getGroupConversation(
    "!ipsum:example.com"
  );
  await TestUtils.waitForTick();
  ok(!missingLocalRoom.joining);
  ok(mockAccount.left);

  mockAccount.left = false;
  const unjoinableRemoteRoom = mockAccount.getGroupConversation(
    "#test:matrix.org"
  );
  await TestUtils.waitForTick();
  ok(!unjoinableRemoteRoom.joining);
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

add_task(async function test_invitedToDMIn_deny() {
  const dmRoomId = "!test:example.com";
  let leftRoom = false;
  const account = getAccount({
    leave(roomId) {
      equal(roomId, dmRoomId);
      leftRoom = true;
    },
  });
  const room = getClientRoom(
    dmRoomId,
    {
      getDMInviter() {
        return "@other:example.com";
      },
    },
    account._client
  );
  const requestObserver = TestUtils.topicObserved(
    "buddy-authorization-request"
  );
  account.invitedToDM(room);
  const [request] = await requestObserver;
  request.QueryInterface(Ci.prplIBuddyRequest);
  equal(request.userName, "@other:example.com");
  request.deny();
  ok(leftRoom);
});

add_task(async function test_nameIsMXID() {
  const account = getAccount();
  account.imAccount.name = "@test:example.com";
  ok(account.nameIsMXID);
  account.imAccount.name = "@test:example.com:8443";
  ok(account.nameIsMXID);
  account.imAccount.name = "test:example.com";
  ok(!account.nameIsMXID);
  account.imAccount.name = "test";
  ok(!account.nameIsMXID);
});
