/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

var { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);
const { setTimeout } = ChromeUtils.importESModule(
  "resource://gre/modules/Timer.sys.mjs"
);

loadMatrix();

add_task(function test_getConversationById() {
  const mockAccount = {
    roomList: new Map(),
    _pendingRoomAliases: new Map(),
  };
  mockAccount.roomList.set("foo", "bar");
  mockAccount._pendingRoomAliases.set("lorem", "ipsum");

  equal(MatrixAccount.prototype.getConversationById.call(mockAccount), null);
  equal(
    MatrixAccount.prototype.getConversationById.call(mockAccount, "foo"),
    "bar"
  );
  equal(
    MatrixAccount.prototype.getConversationById.call(mockAccount, "lorem"),
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
    MatrixAccount.prototype.getConversationByIdOrAlias.call(mockAccount),
    null
  );
  equal(
    MatrixAccount.prototype.getConversationByIdOrAlias.call(mockAccount, "foo"),
    "bar"
  );
  equal(
    MatrixAccount.prototype.getConversationByIdOrAlias.call(
      mockAccount,
      "lorem"
    ),
    "ipsum"
  );
  equal(
    MatrixAccount.prototype.getConversationByIdOrAlias.call(mockAccount, "baz"),
    null
  );
});

add_task(async function test_getGroupConversation() {
  registerCleanupFunction(() => {
    const conversations = IMServices.conversations.getConversations();
    for (const conversation of conversations) {
      try {
        conversation.forget();
      } catch {}
    }
  });

  const allowedGetRoomIds = new Set(["baz"]);
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
    leave(roomId) {
      this._rooms.delete(roomId);
      mockAccount.left = true;
    },
  });
  const fooRoom = getRoom(true, "bar", {}, mockAccount);
  mockAccount.roomList.set("foo", fooRoom);

  equal(mockAccount.getGroupConversation(""), null, "No room with empty ID");
  equal(
    mockAccount.getGroupConversation("foo").name,
    "bar",
    "Room with expected name"
  );
  fooRoom.close();

  const existingRoom = mockAccount.getGroupConversation("baz");
  await existingRoom.waitForRoom();
  strictEqual(existingRoom, mockAccount.roomList.get("baz"));
  ok(!existingRoom.joining, "Not joining existing room");
  existingRoom.close();

  const joinedRoom = mockAccount.getGroupConversation("lorem");
  ok(joinedRoom.joining, "joining room");
  allowedGetRoomIds.add("lorem");
  await joinedRoom.waitForRoom();
  strictEqual(joinedRoom, mockAccount.roomList.get("lorem"));
  ok(!joinedRoom.joining, "Joined room");
  joinedRoom.close();

  const createdRoom = mockAccount.getGroupConversation("#ipsum:example.com");
  ok(createdRoom.joining, "Joining new room");
  await createdRoom.waitForRoom();
  ok(!createdRoom.joining, "Joined new room");
  strictEqual(createdRoom, mockAccount.roomList.get("!ipsum:example.com"));
  // Wait for catchup to complete.
  await TestUtils.waitForTick();
  createdRoom.close();

  const roomAlreadyBeingCreated =
    mockAccount.getGroupConversation("#lorem:example.com");
  ok(
    roomAlreadyBeingCreated.joining,
    "Joining room that is about to get replaced"
  );
  const pendingRoom = getRoom(true, "hi", {}, mockAccount);
  mockAccount._pendingRoomAliases.set("#lorem:example.com", pendingRoom);
  await roomAlreadyBeingCreated.waitForRoom();
  ok(!roomAlreadyBeingCreated.joining, "Not joining replaced room");
  ok(roomAlreadyBeingCreated._replacedBy, "Room got replaced");
  pendingRoom.forget();

  const missingLocalRoom =
    mockAccount.getGroupConversation("!ipsum:example.com");
  await TestUtils.waitForTick();
  ok(!missingLocalRoom.joining, "Not joining missing room");
  ok(mockAccount.left, "Left missing room");

  mockAccount.left = false;
  const unjoinableRemoteRoom =
    mockAccount.getGroupConversation("#test:matrix.org");
  await TestUtils.waitForTick();
  ok(!unjoinableRemoteRoom.joining, "Not joining unjoinable room");
  ok(mockAccount.left, "Left unjoinable room");
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
      ok(false, `Unknown chat room field "${key}"`);
      return null;
    },
  };

  const conv = MatrixAccount.prototype.joinChat.call(mockAccount, components);
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
          getMember() {
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

add_task(async function test_invitedToChat_deny() {
  const chatRoomId = "!test:xample.com";
  let leftRoom = false;
  const account = getAccount({
    leave(roomId) {
      equal(roomId, chatRoomId);
      leftRoom = true;
      return Promise.resolve();
    },
  });
  const room = getClientRoom(
    chatRoomId,
    {
      getCanonicalAlias() {
        return "#foo:example.com";
      },
    },
    account._client
  );
  const requestObserver = TestUtils.topicObserved("conv-authorization-request");
  account.invitedToChat(room);
  const [request] = await requestObserver;
  request.QueryInterface(Ci.prplIChatRequest);
  equal(request.conversationName, "#foo:example.com");
  ok(request.canDeny);
  request.deny();
  ok(leftRoom);
});

add_task(async function test_invitedToChat_cannotDenyServerNotice() {
  const chatRoomId = "!test:xample.com";
  const account = getAccount({});
  const room = getClientRoom(
    chatRoomId,
    {
      getCanonicalAlias() {
        return "#foo:example.com";
      },
      tags: {
        "m.server_notice": true,
      },
    },
    account._client
  );
  console.log(room.tags);
  const requestObserver = TestUtils.topicObserved("conv-authorization-request");
  account.invitedToChat(room);
  const [request] = await requestObserver;
  request.QueryInterface(Ci.prplIChatRequest);
  equal(request.conversationName, "#foo:example.com");
  ok(!request.canDeny);
});

add_task(async function test_deleteAccount() {
  let clientLoggedIn = true;
  let storesCleared;
  const storesPromise = new Promise(resolve => {
    storesCleared = resolve;
  });
  let stopped = false;
  let removedListeners;
  const account = getAccount({
    isLoggedIn() {
      return true;
    },
    logout() {
      clientLoggedIn = false;
      return Promise.resolve();
    },
    clearStores() {
      storesCleared();
    },
    stopClient() {
      stopped = true;
    },
    removeAllListeners(type) {
      removedListeners = type;
    },
  });
  const conv = account.getGroupConversation("example");
  await conv.waitForRoom();
  const timeout = setTimeout(() => ok(false), 1000); // eslint-disable-line mozilla/no-arbitrary-setTimeout
  account._verificationRequestTimeouts.add(timeout);
  let verificationRequestCancelled = false;
  account._pendingOutgoingVerificationRequests.set("foo", {
    cancel() {
      verificationRequestCancelled = true;
      return Promise.reject(new Error("test"));
    },
  });
  account.remove();
  account.unInit();
  await storesPromise;
  ok(!clientLoggedIn, "logged out");
  ok(
    !IMServices.conversations.getConversations().includes(conv),
    "room closed"
  );
  ok(verificationRequestCancelled, "verification request cancelled");
  ok(stopped);
  equal(removedListeners, MatrixSDK.ClientEvent.Sync);
  equal(account._verificationRequestTimeouts.size, 0);
});

add_task(function test_getChatRoomFieldValuesFromString() {
  const result =
    MatrixAccount.prototype.getChatRoomFieldValuesFromString("#test:test");
  Assert.deepEqual(
    result.values,
    { roomIdOrAlias: "#test:test" },
    "Unexpected channel for bare channel"
  );
});
