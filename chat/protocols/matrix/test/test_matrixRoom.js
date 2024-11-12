/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const { setTimeout, clearTimeout } = ChromeUtils.importESModule(
  "resource://gre/modules/Timer.sys.mjs"
);
const { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
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
    __proto__: MatrixRoom.prototype,
    _resolveInitializer() {
      this.initialized = true;
    },
    _mostRecentEventId: "foo",
    _joiningLocks: new Set(),
  };
  const newRoom = {};
  MatrixRoom.prototype.replaceRoom.call(roomStub, newRoom);
  strictEqual(roomStub._replacedBy, newRoom);
  ok(roomStub.initialized);
  equal(newRoom._mostRecentEventId, roomStub._mostRecentEventId);
});

add_task(async function test_waitForRoom() {
  const roomStub = {
    _initialized: Promise.resolve(),
  };
  const awaitedRoom = await MatrixRoom.prototype.waitForRoom.call(roomStub);
  strictEqual(awaitedRoom, roomStub);
});

add_task(async function test_waitForRoomReplaced() {
  const roomStub = getRoom(true);
  const newRoom = {
    waitForRoom() {
      return Promise.resolve("success");
    },
  };
  MatrixRoom.prototype.replaceRoom.call(roomStub, newRoom);
  const awaitedRoom = await MatrixRoom.prototype.waitForRoom.call(roomStub);
  equal(awaitedRoom, "success");
  roomStub.forget();
});

add_task(function test_addEventRedacted() {
  const event = makeEvent({
    sender: "@user:example.com",
    redacted: true,
    redaction: {
      event_id: 2,
      type: MatrixSDK.EventType.RoomRedaction,
    },
    type: MatrixSDK.EventType.RoomMessage,
  });
  let updatedMessage;
  const roomStub = {
    _account: {
      userId: "@test:example.com",
      _client: {
        getHomeserverUrl() {
          return "https://example.com/";
        },
      },
    },
    updateMessage(sender, message, opts) {
      updatedMessage = {
        sender,
        message,
        opts,
      };
    },
  };
  MatrixRoom.prototype.addEvent.call(roomStub, event);
  equal(roomStub._mostRecentEventId, 2);
  equal(typeof updatedMessage, "object");
  ok(!updatedMessage.opts.system);
  ok(updatedMessage.opts.deleted);
  equal(typeof updatedMessage.message, "string");
  equal(updatedMessage.sender, "@user:example.com");
});

add_task(function test_addEventMessageIncoming() {
  const event = makeEvent({
    sender: "@user:example.com",
    content: {
      body: "foo",
      msgtype: MatrixSDK.MsgType.Text,
    },
    type: MatrixSDK.EventType.RoomMessage,
  });
  const roomStub = {
    _account: {
      userId: "@test:example.com",
      _client: {
        getHomeserverUrl() {
          return "https://example.com/";
        },
      },
    },
    _eventsWaitingForDecryption: new Set(),
    writeMessage(who, message, options) {
      this.who = who;
      this.message = message;
      this.options = options;
    },
  };
  MatrixRoom.prototype.addEvent.call(roomStub, event);
  equal(roomStub.who, "@user:example.com");
  equal(roomStub.message, "foo");
  ok(!roomStub.options.system);
  ok(!roomStub.options.delayed);
  equal(roomStub._mostRecentEventId, 0);
});

add_task(function test_addEventMessageOutgoing() {
  const event = makeEvent({
    sender: "@test:example.com",
    content: {
      body: "foo",
      msgtype: MatrixSDK.MsgType.Text,
    },
    type: MatrixSDK.EventType.RoomMessage,
  });
  const roomStub = {
    _account: {
      userId: "@test:example.com",
      _client: {
        getHomeserverUrl() {
          return "https://example.com";
        },
      },
    },
    _eventsWaitingForDecryption: new Set(),
    writeMessage(who, message, options) {
      this.who = who;
      this.message = message;
      this.options = options;
    },
  };
  MatrixRoom.prototype.addEvent.call(roomStub, event);
  equal(roomStub.who, "@test:example.com");
  equal(roomStub.message, "foo");
  ok(!roomStub.options.system);
  ok(!roomStub.options.delayed);
  equal(roomStub._mostRecentEventId, 0);
});

add_task(function test_addEventMessageEmote() {
  const event = makeEvent({
    sender: "@user:example.com",
    content: {
      body: "foo",
      msgtype: MatrixSDK.MsgType.Emote,
    },
    type: MatrixSDK.EventType.RoomMessage,
  });
  const roomStub = {
    _account: {
      userId: "@test:example.com",
      _client: {
        getHomeserverUrl() {
          return "https://example.com";
        },
      },
    },
    _eventsWaitingForDecryption: new Set(),
    writeMessage(who, message, options) {
      this.who = who;
      this.message = message;
      this.options = options;
    },
  };
  MatrixRoom.prototype.addEvent.call(roomStub, event);
  equal(roomStub.who, "@user:example.com");
  equal(roomStub.message, "foo");
  ok(roomStub.options.action);
  ok(!roomStub.options.system);
  ok(!roomStub.options.delayed);
  equal(roomStub._mostRecentEventId, 0);
});

add_task(function test_addEventMessageDelayed() {
  const event = makeEvent({
    sender: "@user:example.com",
    content: {
      body: "foo",
      msgtype: MatrixSDK.MsgType.Text,
    },
    type: MatrixSDK.EventType.RoomMessage,
  });
  const roomStub = {
    _account: {
      userId: "@test:example.com",
      _client: {
        getHomeserverUrl() {
          return "https://example.com";
        },
      },
    },
    _eventsWaitingForDecryption: new Set(),
    writeMessage(who, message, options) {
      this.who = who;
      this.message = message;
      this.options = options;
    },
  };
  MatrixRoom.prototype.addEvent.call(roomStub, event, true);
  equal(roomStub.who, "@user:example.com");
  equal(roomStub.message, "foo");
  ok(!roomStub.options.system);
  ok(roomStub.options.delayed);
  equal(roomStub._mostRecentEventId, 0);
});

add_task(function test_addEventTopic() {
  const event = makeEvent({
    type: MatrixSDK.EventType.RoomTopic,
    id: 1,
    content: {
      topic: "foo bar",
    },
    sender: "@user:example.com",
  });
  const roomStub = {
    _account: {
      userId: "@test:example.com",
      _client: {
        getHomeserverUrl() {
          return "https://example.com/";
        },
      },
    },
    _eventsWaitingForDecryption: new Set(),
    setTopic(topic, who) {
      this.who = who;
      this.topic = topic;
    },
  };
  MatrixRoom.prototype.addEvent.call(roomStub, event);
  equal(roomStub.who, "@user:example.com");
  equal(roomStub.topic, "foo bar");
  equal(roomStub._mostRecentEventId, 1);
});

add_task(async function test_addEventTombstone() {
  const event = makeEvent({
    type: MatrixSDK.EventType.RoomTombstone,
    id: 1,
    content: {
      body: "updated room",
      replacement_room: "!new_room:example.com",
    },
    sender: "@test:example.com",
  });
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
    _releaseJoiningLock(lock) {
      this.releasedLock = lock;
    },
  };
  roomList.set(roomStub._roomId, roomStub);
  IMServices.conversations.addConversation(roomStub);

  MatrixRoom.prototype.forget.call(roomStub);
  ok(!roomList.has(roomStub._roomId));
  ok(roomStub.closeCalled);
  equal(roomStub.releasedLock, "roomInit", "Released roomInit lock");
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
    _releaseJoiningLock(lock) {
      this.releasedLock = lock;
    },
  };
  roomList.set(roomStub._roomId, roomStub);
  IMServices.conversations.addConversation(roomStub);

  MatrixRoom.prototype.forget.call(roomStub);
  ok(!roomList.has(roomStub._roomId));
  equal(roomStub.releasedLock, "roomInit", "Released roomInit lock");
});

add_task(function test_close() {
  const roomStub = {
    forget() {
      this.forgetCalled = true;
    },
    cleanUpOutgoingVerificationRequests() {
      this.cleanUpCalled = true;
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

  MatrixRoom.prototype.close.call(roomStub);
  equal(roomStub.leftRoom, roomStub._roomId);
  ok(roomStub.forgetCalled);
  ok(roomStub.cleanUpCalled);
});

add_task(function test_setTypingState() {
  const roomStub = getRoom(true, "foo", {
    sendTyping(roomId, isTyping) {
      roomStub.typingRoomId = roomId;
      roomStub.typing = isTyping;
      return Promise.resolve();
    },
  });

  roomStub.setTypingState(Ci.prplIConvIM.TYPING);
  equal(roomStub.typingRoomId, roomStub._roomId);
  ok(roomStub.typing);

  roomStub.setTypingState(Ci.prplIConvIM.NOT_TYPING);
  equal(roomStub.typingRoomId, roomStub._roomId);
  ok(!roomStub.typing);

  roomStub.setTypingState(Ci.prplIConvIM.TYPING);
  equal(roomStub.typingRoomId, roomStub._roomId);
  ok(roomStub.typing);

  roomStub.setTypingState(Ci.prplIConvIM.TYPED);
  equal(roomStub.typingRoomId, roomStub._roomId);
  ok(!roomStub.typing);

  roomStub.forget();
  roomStub.unInit();
});

add_task(function test_setTypingStateDebounce() {
  const roomStub = getRoom(true, "foo", {
    sendTyping(roomId, isTyping) {
      roomStub.typingRoomId = roomId;
      roomStub.typing = isTyping;
      return Promise.resolve();
    },
  });

  roomStub.setTypingState(Ci.prplIConvIM.TYPING);
  equal(roomStub.typingRoomId, roomStub._roomId);
  ok(roomStub.typing);
  ok(roomStub._typingDebounce);

  roomStub.typing = false;

  roomStub.setTypingState(Ci.prplIConvIM.TYPING);
  equal(roomStub.typingRoomId, roomStub._roomId);
  ok(!roomStub.typing);
  ok(roomStub._typingDebounce);

  clearTimeout(roomStub._typingDebounce);
  roomStub._typingDebounce = null;

  roomStub.setTypingState(Ci.prplIConvIM.TYPING);
  equal(roomStub.typingRoomId, roomStub._roomId);
  ok(roomStub.typing);

  roomStub.forget();
  roomStub.unInit();
});

add_task(function test_cleanUpTimers() {
  const roomStub = getRoom(true);
  roomStub._typingDebounce = setTimeout(() => {}, 1000); // eslint-disable-line mozilla/no-arbitrary-setTimeout
  roomStub._cleanUpTimers();
  ok(!roomStub._typingDebounce);
  roomStub.forget();
});

add_task(function test_finishedComposing() {
  let typingState = true;
  const roomStub = {
    __proto__: MatrixRoom.prototype,
    supportTypingNotifications: false,
    _roomId: "foo",
    _account: {
      _client: {
        sendTyping(roomId, state) {
          typingState = state;
          return Promise.resolve();
        },
      },
    },
  };

  MatrixRoom.prototype.finishedComposing.call(roomStub);
  ok(typingState);

  roomStub.supportTypingNotifications = true;
  MatrixRoom.prototype.finishedComposing.call(roomStub);
  ok(!typingState);
});

add_task(function test_setInitialized() {
  const roomStub = {
    _resolveInitializer() {
      this.calledResolve = true;
    },
    _releaseJoiningLock(lock) {
      this.releasedLock = lock;
    },
  };
  MatrixRoom.prototype._setInitialized.call(roomStub);
  ok(roomStub.calledResolve);
  equal(roomStub.releasedLock, "roomInit", "Released roomInit lock");
});

add_task(function test_addEventSticker() {
  const date = new Date();
  const event = makeEvent({
    time: date,
    sender: "@user:example.com",
    type: MatrixSDK.EventType.Sticker,
    content: {
      body: "foo",
      url: "mxc://example.com/sticker",
    },
  });
  const roomStub = {
    _account: {
      userId: "@test:example.com",
      _client: {
        getHomeserverUrl() {
          return "https://example.com";
        },
      },
    },
    _eventsWaitingForDecryption: new Set(),
    writeMessage(who, message, options) {
      this.who = who;
      this.message = message;
      this.options = options;
    },
  };
  MatrixRoom.prototype.addEvent.call(roomStub, event);
  equal(roomStub.who, "@user:example.com");
  equal(
    roomStub.message,
    "https://example.com/_matrix/media/v3/download/example.com/sticker"
  );
  ok(!roomStub.options.system);
  ok(!roomStub.options.delayed);
  equal(roomStub._mostRecentEventId, 0);
});

add_task(function test_sendMsg() {
  let isTyping = true;
  let message;
  const roomStub = getRoom(true, "#test:example.com", {
    sendTyping(roomId, typing) {
      equal(roomId, roomStub._roomId);
      isTyping = typing;
      return Promise.resolve();
    },
    sendTextMessage(roomId, threadId, msg) {
      equal(roomId, roomStub._roomId);
      equal(threadId, null);
      message = msg;
      return Promise.resolve();
    },
  });
  roomStub.dispatchMessage("foo bar");
  ok(!isTyping);
  equal(message, "foo bar");
  roomStub._cleanUpTimers();
  roomStub.forget();
});

add_task(function test_sendMsg_emote() {
  let isTyping = true;
  let message;
  const roomStub = getRoom(true, "#test:example.com", {
    sendTyping(roomId, typing) {
      equal(roomId, roomStub._roomId);
      isTyping = typing;
      return Promise.resolve();
    },
    sendEmoteMessage(roomId, threadId, msg) {
      equal(roomId, roomStub._roomId);
      equal(threadId, null);
      message = msg;
      return Promise.resolve();
    },
  });
  roomStub.dispatchMessage("foo bar", true);
  ok(!isTyping);
  equal(message, "foo bar");
  roomStub._cleanUpTimers();
  roomStub.forget();
});

add_task(function test_createMessage() {
  const time = Date.now();
  const event = makeEvent({
    type: MatrixSDK.EventType.RoomMessage,
    time,
    sender: "@foo:example.com",
  });
  const roomStub = getRoom(true, "#test:example.com", {
    getPushActionsForEvent(eventToProcess) {
      equal(eventToProcess, event);
      return {
        tweaks: {
          highlight: true,
        },
      };
    },
  });
  const message = roomStub.createMessage("@foo:example.com", "bar", {
    event,
  });
  equal(message.message, "bar");
  equal(message.who, "@foo:example.com");
  equal(message.conversation, roomStub);
  ok(!message.outgoing);
  ok(message.incoming);
  equal(message.alias, "foo bar");
  ok(!message.isEncrypted);
  ok(message.containsNick);
  equal(message.time, Math.floor(time / 1000));
  equal(message.iconURL, "https://example.com/avatar");
  equal(message.remoteId, 0);
  roomStub.forget();
});

add_task(async function test_addEventWaitingForDecryption() {
  const event = makeEvent({
    sender: "@user:example.com",
    type: MatrixSDK.EventType.RoomMessageEncrypted,
    shouldDecrypt: true,
  });
  const roomStub = getRoom(true, "#test:example.com");
  const writePromise = waitForNotification(roomStub, "new-text");
  roomStub.addEvent(event);
  const { subject: result } = await writePromise;
  ok(!result.error, "Waiting for decryption message is not an error");
  ok(!result.system, "Waiting for decryption message is not system");
  roomStub.forget();
});

add_task(async function test_addEventReplaceDecryptedEvent() {
  //TODO need to emit event on event?
  const spec = {
    sender: "@user:example.com",
    type: MatrixSDK.EventType.RoomMessage,
    isEncrypted: true,
    shouldDecrypt: true,
    content: {
      msgtype: MatrixSDK.MsgType.Text,
      body: "foo",
    },
  };
  const event = makeEvent(spec);
  const roomStub = getRoom(true, "#test:example.com");
  const writePromise = waitForNotification(roomStub, "new-text");
  roomStub.addEvent(event);
  const { subject: initialEvent } = await writePromise;
  ok(!initialEvent.error, "Pending event is not an error");
  ok(!initialEvent.system, "Pending event is not a system message");
  equal(
    initialEvent.who,
    "@user:example.com",
    "Pending message has correct sender"
  );
  const updatePromise = waitForNotification(roomStub, "update-text");
  spec.shouldDecrypt = false;
  event._listeners[MatrixSDK.MatrixEventEvent.Decrypted](event);
  const { subject: result } = await updatePromise;
  equal(result.who, "@user:example.com", "Correct message sender");
  equal(result.message, "foo", "Message contents displayed");
  roomStub.forget();
});

add_task(async function test_addEventDecryptionError() {
  const event = makeEvent({
    sender: "@user:example.com",
    type: MatrixSDK.EventType.RoomMessageEncrypted,
    content: {
      msgtype: "m.bad.encrypted",
    },
  });
  const roomStub = getRoom(true, "#test:example.com");
  const writePromise = waitForNotification(roomStub, "new-text");
  roomStub.addEvent(event);
  const { subject: result } = await writePromise;
  ok(result.error, "Message is an error");
  ok(!result.system, "Not displayed as system event");
  roomStub.forget();
});

add_task(async function test_addEventPendingDecryption() {
  const event = makeEvent({
    sender: "@user:example.com",
    type: MatrixSDK.EventType.RoomMessageEncrypted,
    decrypting: true,
  });
  const roomStub = getRoom(true, "#test:example.com");
  const writePromise = waitForNotification(roomStub, "new-text");
  roomStub.addEvent(event);
  const { subject: result } = await writePromise;
  ok(!result.error, "Not marked as error");
  ok(!result.system, "Not displayed as system event");
  roomStub.forget();
});

add_task(async function test_addEventRedaction() {
  const event = makeEvent({
    sender: "@user:example.com",
    id: 1443,
    type: MatrixSDK.EventType.RoomRedaction,
  });
  const roomStub = {
    writeMessage() {
      ok(false, "called writeMessage");
    },
    updateMessage() {
      ok(false, "called updateMessage");
    },
  };
  MatrixRoom.prototype.addEvent.call(roomStub, event);
  equal(roomStub._mostRecentEventId, undefined);
});

add_task(function test_encryptionStateUnavailable() {
  const room = getRoom(true, "#test:example.com");
  equal(
    room.encryptionState,
    Ci.prplIConversation.ENCRYPTION_NOT_SUPPORTED,
    "Encryption state is encryption not supported with crypto disabled"
  );
  room.forget();
});

add_task(function test_encryptionStateCanEncrypt() {
  const room = getRoom(true, "#test:example.com", {
    isCryptoEnabled() {
      return true;
    },
  });
  let maySendStateEvent = false;
  room.room.currentState = {
    mayClientSendStateEvent(eventType, client) {
      equal(
        eventType,
        MatrixSDK.EventType.RoomEncryption,
        "mayClientSendStateEvent called for room encryption"
      );
      equal(
        client,
        room._account._client,
        "mayClientSendStateEvent got the expected client"
      );
      return maySendStateEvent;
    },
  };
  equal(
    room.encryptionState,
    Ci.prplIConversation.ENCRYPTION_NOT_SUPPORTED,
    "Encryption state is encryption not supported when state event can't be sent"
  );
  maySendStateEvent = true;
  equal(
    room.encryptionState,
    Ci.prplIConversation.ENCRYPTION_AVAILABLE,
    "Encryption state is available"
  );
  room.forget();
});

add_task(async function test_encryptionStateOn() {
  const room = getRoom(true, "#test:example.com", {
    isCryptoEnabled() {
      return true;
    },
    isRoomEncrypted() {
      return true;
    },
  });
  room.room.currentState = {
    mayClientSendStateEvent(eventType, client) {
      equal(
        eventType,
        MatrixSDK.EventType.RoomEncryption,
        "mayClientSendStateEvent called for room encryption"
      );
      equal(
        client,
        room._account._client,
        "mayClientSendStateEvent got the expected client"
      );
      return false;
    },
  };
  equal(
    room.encryptionState,
    Ci.prplIConversation.ENCRYPTION_ENABLED,
    "Encryption state is enabled"
  );
  room._hasUnverifiedDevices = false;
  equal(
    room.encryptionState,
    Ci.prplIConversation.ENCRYPTION_TRUSTED,
    "Encryption state is trusted"
  );
  await Promise.resolve();
  room.forget();
});

add_task(async function test_addEventReaction() {
  const event = makeEvent({
    sender: "@user:example.com",
    type: MatrixSDK.EventType.Reaction,
    content: {
      ["m.relates_to"]: {
        rel_type: MatrixSDK.RelationType.Annotation,
        event_id: "!event:example.com",
        key: "🐦",
      },
    },
  });
  let wroteMessage = false;
  const roomStub = {
    _account: {
      userId: "@user:example.com",
      _client: {
        getHomeserverUrl() {
          return "https://example.com/";
        },
      },
    },
    room: {
      findEventById(id) {
        equal(id, "!event:example.com", "Reading expected annotated event");
        return {
          getSender() {
            return "@foo:example.com";
          },
        };
      },
    },
    writeMessage(who, message, options) {
      equal(who, "@user:example.com", "Correct sender for reaction");
      ok(message.includes("🐦"), "Message contains reaction content");
      ok(options.system, "reaction is a system message");
      wroteMessage = true;
    },
  };
  MatrixRoom.prototype.addEvent.call(roomStub, event);
  ok(wroteMessage, "Wrote reaction to conversation");
});

add_task(async function test_removeParticipant() {
  const roomMembers = [
    {
      userId: "@foo:example.com",
    },
    {
      userId: "@bar:example.com",
    },
  ];
  const room = getRoom(true, "#test:example.com", {
    getJoinedMembers() {
      return roomMembers;
    },
  });
  for (const member of roomMembers) {
    room.addParticipant(member);
  }
  equal(room._participants.size, 2, "Room has two participants");

  const participantRemoved = waitForNotification(room, "chat-buddy-remove");
  room.removeParticipant(roomMembers.splice(1, 1)[0].userId);
  const { subject } = await participantRemoved;
  const participantsArray = Array.from(
    subject.QueryInterface(Ci.nsISimpleEnumerator)
  );
  equal(participantsArray.length, 1, "One participant is being removed");
  equal(
    participantsArray[0].QueryInterface(Ci.nsISupportsString).data,
    "@bar:example.com",
    "The participant is being removed by its user ID"
  );
  equal(room._participants.size, 1, "One participant is left");
  room.forget();
});

add_task(function test_highlightForNotifications() {
  const time = Date.now();
  const event = makeEvent({
    type: MatrixSDK.EventType.RoomMessage,
    time,
    sender: "@foo:example.com",
  });
  const roomStub = getRoom(true, "#test:example.com", {
    getPushActionsForEvent(eventToProcess) {
      equal(eventToProcess, event);
      return {
        notify: true,
      };
    },
  });
  const message = roomStub.createMessage("@foo:example.com", "bar", {
    event,
  });
  equal(message.message, "bar");
  equal(message.who, "@foo:example.com");
  equal(message.conversation, roomStub);
  ok(!message.outgoing);
  ok(message.incoming);
  equal(message.alias, "foo bar");
  ok(message.containsNick);
  roomStub.forget();
});

add_task(async function test_prepareForDisplayingFormattedHTML() {
  const time = Date.now();
  const event = makeEvent({
    type: MatrixSDK.EventType.RoomMessage,
    time,
    sender: "@foo:example.com",
    content: {
      msgtype: MatrixSDK.MsgType.Text,
      format: "org.matrix.custom.html",
      formatted_body: "<foo>bar</foo>",
      body: "bar",
    },
  });
  const roomStub = getRoom(true, "#test:example.com");

  const newTextNotification = TestUtils.topicObserved("new-text");
  roomStub.addEvent(event);

  const [message] = await newTextNotification;

  equal(
    message.displayMessage,
    event.getContent().formatted_body,
    "Formatted body used for display"
  );

  roomStub.forget();
});

function waitForNotification(target, expectedTopic) {
  const promise = new Promise(resolve => {
    const observer = {
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
