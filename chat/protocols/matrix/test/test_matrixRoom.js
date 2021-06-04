/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const { setTimeout } = ChromeUtils.import("resource://gre/modules/Timer.jsm");
var { EventType, MsgType } = ChromeUtils.import(
  "resource:///modules/matrix-sdk.jsm"
);

loadMatrix();

add_task(async function test_initRoom() {
  const roomStub = getRoom(true);
  equal(typeof roomStub._resolveInitializer, "function");
  ok(roomStub._initialized);
  await roomStub._initialized;
  roomStub.forget();
});

add_task(async function test_initRoom_withSpace() {
  const roomStub = getRoom(true, "#test:example.com", (target, key) => {
    if (key === "isSpaceRoom") {
      return () => true;
    }
    return null;
  });
  ok(roomStub._initialized);
  ok(roomStub.left);
  await roomStub._initialized;
  roomStub.forget();
});

add_task(function test_replaceRoom() {
  const roomStub = {
    __proto__: matrix.MatrixRoom.prototype,
    _resolveInitializer() {
      this.initialized = true;
    },
    _mostRecentEventId: "foo",
  };
  const newRoom = {};
  matrix.MatrixRoom.prototype.replaceRoom.call(roomStub, newRoom);
  strictEqual(roomStub._replacedBy, newRoom);
  ok(roomStub.initialized);
  equal(newRoom._mostRecentEventId, roomStub._mostRecentEventId);
});

add_task(async function test_waitForRoom() {
  const roomStub = {
    _initialized: Promise.resolve(),
  };
  const awaitedRoom = await matrix.MatrixRoom.prototype.waitForRoom.call(
    roomStub
  );
  strictEqual(awaitedRoom, roomStub);
});

add_task(async function test_waitForRoomReplaced() {
  const roomStub = getRoom(true);
  const newRoom = {
    waitForRoom() {
      return Promise.resolve("success");
    },
  };
  matrix.MatrixRoom.prototype.replaceRoom.call(roomStub, newRoom);
  const awaitedRoom = await matrix.MatrixRoom.prototype.waitForRoom.call(
    roomStub
  );
  equal(awaitedRoom, "success");
  roomStub.forget();
});

add_task(function test_addEventRedacted() {
  const event = makeEvent("@user:example.com", {}, true);
  const roomStub = {};
  matrix.MatrixRoom.prototype.addEvent.call(roomStub, event);
  equal(roomStub._mostRecentEventId, 0);
});

add_task(function test_addEventMessageIncoming() {
  const event = makeEvent("@user:example.com", {
    body: "foo",
    msgtype: MsgType.Text,
  });
  const roomStub = {
    _account: {
      userId: "@test:example.com",
    },
    writeMessage(who, message, options) {
      this.who = who;
      this.message = message;
      this.options = options;
    },
  };
  matrix.MatrixRoom.prototype.addEvent.call(roomStub, event);
  equal(roomStub.who, "@user:example.com");
  equal(roomStub.message, "foo");
  ok(roomStub.options.incoming);
  ok(!roomStub.options.outgoing);
  ok(!roomStub.options.system);
  equal(roomStub.options.time, Math.floor(event.getDate().getTime() / 1000));
  equal(roomStub.options._alias, "foo bar");
  ok(!roomStub.options.delayed);
  equal(roomStub._mostRecentEventId, 0);
});

add_task(function test_addEventMessageOutgoing() {
  const event = makeEvent("@test:example.com", {
    body: "foo",
    msgtype: MsgType.Text,
  });
  const roomStub = {
    _account: {
      userId: "@test:example.com",
    },
    writeMessage(who, message, options) {
      this.who = who;
      this.message = message;
      this.options = options;
    },
  };
  matrix.MatrixRoom.prototype.addEvent.call(roomStub, event);
  equal(roomStub.who, "@test:example.com");
  equal(roomStub.message, "foo");
  ok(!roomStub.options.incoming);
  ok(roomStub.options.outgoing);
  ok(!roomStub.options.system);
  equal(roomStub.options.time, Math.floor(event.getDate().getTime() / 1000));
  equal(roomStub.options._alias, "foo bar");
  ok(!roomStub.options.delayed);
  equal(roomStub._mostRecentEventId, 0);
});

add_task(function test_addEventMessageEmote() {
  const event = makeEvent("@user:example.com", {
    body: "foo",
    msgtype: MsgType.Emote,
  });
  const roomStub = {
    _account: {
      userId: "@test:example.com",
    },
    writeMessage(who, message, options) {
      this.who = who;
      this.message = message;
      this.options = options;
    },
  };
  matrix.MatrixRoom.prototype.addEvent.call(roomStub, event);
  equal(roomStub.who, "@user:example.com");
  equal(roomStub.message, "/me foo");
  ok(roomStub.options.incoming);
  ok(!roomStub.options.outgoing);
  ok(!roomStub.options.system);
  equal(roomStub.options.time, Math.floor(event.getDate().getTime() / 1000));
  equal(roomStub.options._alias, "foo bar");
  ok(!roomStub.options.delayed);
  equal(roomStub._mostRecentEventId, 0);
});

add_task(function test_addEventMessageDelayed() {
  const event = makeEvent("@user:example.com", {
    body: "foo",
    msgtype: MsgType.Text,
  });
  const roomStub = {
    _account: {
      userId: "@test:example.com",
    },
    writeMessage(who, message, options) {
      this.who = who;
      this.message = message;
      this.options = options;
    },
  };
  matrix.MatrixRoom.prototype.addEvent.call(roomStub, event, true);
  equal(roomStub.who, "@user:example.com");
  equal(roomStub.message, "foo");
  ok(roomStub.options.incoming);
  ok(!roomStub.options.outgoing);
  ok(!roomStub.options.system);
  equal(roomStub.options.time, Math.floor(event.getDate().getTime() / 1000));
  equal(roomStub.options._alias, "foo bar");
  ok(roomStub.options.delayed);
  equal(roomStub._mostRecentEventId, 0);
});

add_task(function test_addEventTopic() {
  const event = {
    isRedacted() {
      return false;
    },
    getType() {
      return EventType.RoomTopic;
    },
    getId() {
      return 1;
    },
    getContent() {
      return {
        topic: "foo bar",
      };
    },
    getSender() {
      return "@user:example.com";
    },
  };
  const roomStub = {
    setTopic(topic, who) {
      this.who = who;
      this.topic = topic;
    },
  };
  matrix.MatrixRoom.prototype.addEvent.call(roomStub, event);
  equal(roomStub.who, "@user:example.com");
  equal(roomStub.topic, "foo bar");
  equal(roomStub._mostRecentEventId, 1);
});

add_task(async function test_addEventTombstone() {
  const event = {
    isRedacted() {
      return false;
    },
    getType() {
      return EventType.RoomTombstone;
    },
    getId() {
      return 1;
    },
    getContent() {
      return {
        body: "updated room",
        replacement_room: "!new_room:example.com",
      };
    },
    getSender() {
      return "@test:example.com";
    },
    getDate() {
      return new Date();
    },
  };
  const conversation = getRoom(true);
  const newText = waitForNotification(conversation, "new-text");
  conversation.addEvent(event);
  const { subject: message } = await newText;
  const newConversation = await conversation.waitForRoom();
  equal(newConversation.normalizedName, event.getContent().replacement_room);
  equal(message.who, event.getSender());
  equal(message.message, event.getContent().body);
  ok(message.system);
  ok(message.incoming);
  ok(!conversation._account);
  newConversation.forget();
});

function makeEvent(sender, content = {}, redacted = false) {
  const time = new Date();
  return {
    isRedacted() {
      return redacted;
    },
    getType() {
      return EventType.RoomMessage;
    },
    getSender() {
      return sender;
    },
    getContent() {
      return content;
    },
    getDate() {
      return time;
    },
    sender: {
      name: "foo bar",
    },
    getId() {
      return 0;
    },
  };
}

add_task(function test_forgetWith_close() {
  const roomList = new Map();
  const roomStub = {
    closeDm() {
      this.closeCalled = true;
    },
    _roomId: "foo",
    _account: {
      roomList,
    },
    // stubs for jsProtoHelper implementations
    addObserver() {},
    unInit() {},
  };
  roomList.set(roomStub._roomId, roomStub);
  Services.conversations.addConversation(roomStub);

  matrix.MatrixRoom.prototype.forget.call(roomStub);
  ok(!roomList.has(roomStub._roomId));
  ok(roomStub.closeCalled);
});

add_task(function test_forgetWithout_close() {
  const roomList = new Map();
  const roomStub = {
    isChat: true,
    _roomId: "foo",
    _account: {
      roomList,
    },
    // stubs for jsProtoHelper implementations
    addObserver() {},
    unInit() {},
  };
  roomList.set(roomStub._roomId, roomStub);
  Services.conversations.addConversation(roomStub);

  matrix.MatrixRoom.prototype.forget.call(roomStub);
  ok(!roomList.has(roomStub._roomId));
});

add_task(function test_close() {
  const roomStub = {
    forget() {
      this.forgetCalled = true;
    },
    _roomId: "foo",
    _account: {
      _client: {
        leave(roomId) {
          roomStub.leftRoom = roomId;
        },
      },
    },
  };

  matrix.MatrixRoom.prototype.close.call(roomStub);
  equal(roomStub.leftRoom, roomStub._roomId);
  ok(roomStub.forgetCalled);
});

add_task(function test_setTypingState() {
  const roomStub = {
    _typingState: true,
    _roomId: "foo",
    _account: {
      _client: {
        sendTyping(roomId, isTyping) {
          roomStub.typingRoomId = roomId;
          roomStub.typing = isTyping;
        },
      },
    },
  };

  matrix.MatrixRoom.prototype._setTypingState.call(roomStub, true);
  ok(!roomStub.typingRoomId);
  ok(!roomStub.typing);
  ok(roomStub._typingState);

  matrix.MatrixRoom.prototype._setTypingState.call(roomStub, false);
  equal(roomStub.typingRoomId, roomStub._roomId);
  ok(!roomStub.typing);
  ok(!roomStub._typingState);

  matrix.MatrixRoom.prototype._setTypingState.call(roomStub, true);
  equal(roomStub.typingRoomId, roomStub._roomId);
  ok(roomStub.typing);
  ok(roomStub._typingState);
});

add_task(function test_cancelTypingTimer() {
  const roomStub = {
    _typingTimer: setTimeout(() => {}, 10000), // eslint-disable-line mozilla/no-arbitrary-setTimeout
  };
  matrix.MatrixRoom.prototype._cancelTypingTimer.call(roomStub);
  ok(!roomStub._typingTimer);
});

add_task(function test_finishedComposing() {
  const roomStub = {
    __proto__: matrix.MatrixRoom.prototype,
    _typingState: true,
    shouldSendTypingNotifications: false,
    _roomId: "foo",
    _account: {
      _client: {
        sendTyping() {},
      },
    },
  };

  matrix.MatrixRoom.prototype.finishedComposing.call(roomStub);
  ok(roomStub._typingState);

  roomStub.shouldSendTypingNotifications = true;
  matrix.MatrixRoom.prototype.finishedComposing.call(roomStub);
  ok(!roomStub._typingState);
});

add_task(function test_sendTyping() {
  const roomStub = {
    __proto__: matrix.MatrixRoom.prototype,
    _typingState: false,
    shouldSendTypingNotifications: false,
    _roomId: "foo",
    _account: {
      _client: {
        sendTyping() {},
      },
    },
  };

  let result = matrix.MatrixRoom.prototype.sendTyping.call(
    roomStub,
    "lorem ipsum"
  );
  ok(!roomStub._typingState);
  ok(!roomStub._typingTimer);
  equal(result, Ci.prplIConversation.NO_TYPING_LIMIT);

  roomStub.shouldSendTypingNotifications = true;
  result = matrix.MatrixRoom.prototype.sendTyping.call(roomStub, "lorem ipsum");
  ok(roomStub._typingState);
  ok(roomStub._typingTimer);
  equal(result, Ci.prplIConversation.NO_TYPING_LIMIT);

  result = matrix.MatrixRoom.prototype.sendTyping.call(roomStub, "");
  ok(!roomStub._typingState);
  ok(!roomStub._typingTimer);
  equal(result, Ci.prplIConversation.NO_TYPING_LIMIT);
});

add_task(function test_setInitialized() {
  const roomStub = {
    _resolveInitializer() {
      this.calledResolve = true;
    },
    joining: true,
  };
  matrix.MatrixRoom.prototype._setInitialized.call(roomStub);
  ok(roomStub.calledResolve);
  ok(!roomStub.joining);
});

function waitForNotification(target, expectedTopic) {
  let promise = new Promise(resolve => {
    let observer = {
      observe(subject, topic, data) {
        if (topic === expectedTopic) {
          resolve({ subject, data });
          target.removeObserver(observer);
        }
      },
    };
    target.addObserver(observer);
  });
  return promise;
}
