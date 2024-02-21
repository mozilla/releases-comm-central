/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const { setTimeout } = ChromeUtils.importESModule(
  "resource://gre/modules/Timer.sys.mjs"
);

var { GenericConvIMPrototype } = ChromeUtils.importESModule(
  "resource:///modules/jsProtoHelper.sys.mjs"
);

var _id = 0;
function Conversation(name) {
  this._name = name;
  this._observers = [];
  this._date = Date.now() * 1000;
  this.id = ++_id;
  this.typingState = undefined;
}
Conversation.prototype = {
  __proto__: GenericConvIMPrototype,
  _account: {
    imAccount: {
      protocol: { name: "Fake Protocol" },
      alias: "",
      name: "Fake Account",
    },
    ERROR(e) {
      throw e;
    },
    DEBUG() {},
  },
  setTypingState(newState) {
    this.typingState = newState;
  },
};

// ROT13, used as an example transformation.
function rot13(aString) {
  return aString.replace(/[a-zA-Z]/g, function (c) {
    return String.fromCharCode(
      c.charCodeAt(0) + (c.toLowerCase() < "n" ? 1 : -1) * 13
    );
  });
}

// A test that cancels a message before it can be sent.
add_task(function test_cancel_send_message() {
  const conv = new Conversation();
  conv.dispatchMessage = function (aMsg) {
    ok(
      false,
      "The message should have been halted in the conversation service."
    );
  };

  let sending = false;
  conv.addObserver({
    observe(aObject, aTopic, aMsg) {
      switch (aTopic) {
        case "sending-message":
          ok(
            aObject.QueryInterface(Ci.imIOutgoingMessage),
            "Wrong message type."
          );
          aObject.cancelled = true;
          sending = true;
          break;
        case "new-text":
          ok(
            false,
            "No other notification should be fired for a cancelled message."
          );
          break;
      }
    },
  });
  conv.sendMsg("Hi!");
  ok(sending, "The sending-message notification was never fired.");
});

// A test that ensures protocols get a chance to prepare a message before
// sending and displaying.
add_task(function test_prpl_message_prep() {
  const conv = new Conversation();
  conv.dispatchMessage = function (aMsg) {
    this.writeMessage("user", aMsg, { outgoing: true });
  };

  conv.prepareForSending = function (aMsg) {
    ok(aMsg.QueryInterface(Ci.imIOutgoingMessage), "Wrong message type.");
    equal(aMsg.message, msg, "Expected the original message.");
    prepared = true;
    return [prefix + aMsg.message];
  };

  conv.prepareForDisplaying = function (aMsg) {
    equal(aMsg.displayMessage, prefix + msg, "Expected the prefixed message.");
    aMsg.displayMessage = aMsg.displayMessage.slice(prefix.length);
  };

  const msg = "Hi!";
  const prefix = "test> ";

  let prepared = false;
  let receivedMsg = false;
  conv.addObserver({
    observe(aObject, aTopic) {
      if (aTopic === "preparing-message") {
        equal(aObject.message, msg, "Expected the original message");
      } else if (aTopic === "sending-message") {
        equal(aObject.message, prefix + msg, "Expected the prefixed message.");
      } else if (aTopic === "new-text") {
        ok(aObject.QueryInterface(Ci.prplIMessage), "Wrong message type.");
        ok(prepared, "The message was not prepared before sending.");
        equal(aObject.message, prefix + msg, "Expected the prefixed message.");
        receivedMsg = true;
        aObject.displayMessage = aObject.originalMessage;
        conv.prepareForDisplaying(aObject);
        equal(aObject.displayMessage, msg, "Expected the original message");
      }
    },
  });

  conv.sendMsg(msg);
  ok(receivedMsg, "The new-text notification was never fired.");
});

// A test that ensures protocols can split messages before they are sent.
add_task(function test_split_message_before_sending() {
  let msgCount = 0;
  let prepared = false;

  const msg = "This is a looo\nooong message.\nThis one is short.";
  const msgs = msg.split("\n");

  const conv = new Conversation();
  conv.dispatchMessage = function (aMsg) {
    equal(aMsg, msgs[msgCount++], "Sending an unexpected message.");
  };
  conv.prepareForSending = function (aMsg) {
    ok(aMsg.QueryInterface(Ci.imIOutgoingMessage), "Wrong message type.");
    prepared = true;
    return aMsg.message.split("\n");
  };

  conv.sendMsg(msg);

  ok(prepared, "Message wasn't prepared for sending.");
  equal(msgCount, 3, "Not enough messages were sent.");
});

add_task(function test_removeMessage() {
  let didRemove = false;
  const conv = new Conversation();
  conv.addObserver({
    observe(subject, topic, data) {
      if (topic === "remove-text") {
        equal(data, "foo");
        didRemove = true;
      }
    },
  });

  conv.removeMessage("foo");
  ok(didRemove);
});

add_task(function test_sendTyping() {
  const roomStub = new Conversation();
  Services.prefs.setBoolPref("purple.conversations.im.send_typing", false);

  // Nothing happens until the conversation supports typing & the pref is enabled.
  let result = roomStub.sendTyping("lorem ipsum");
  ok(!roomStub._typingTimer, "Typing is disabled");
  equal(
    result,
    Ci.prplIConversation.NO_TYPING_LIMIT,
    "Default to no typing limit"
  );
  equal(roomStub.typingState, undefined, "Typing state is uninitialized");

  roomStub.supportTypingNotifications = true;
  result = roomStub.sendTyping("lorem ipsum");
  ok(!roomStub._typingTimer, "Typing is disabled via pref");
  equal(
    result,
    Ci.prplIConversation.NO_TYPING_LIMIT,
    "Default to no typing limit 2"
  );
  equal(roomStub.typingState, undefined, "Typing state is unmodified");

  Services.prefs.setBoolPref("purple.conversations.im.send_typing", true);

  // A message changes the state to typing.
  result = roomStub.sendTyping("lorem ipsum");
  ok(roomStub._typingTimer, "Typing is enabled and a timer is configured");
  equal(
    result,
    Ci.prplIConversation.NO_TYPING_LIMIT,
    "Default to no typing limit 3"
  );
  equal(roomStub.typingState, Ci.prplIConvIM.TYPING, "The user is typing");

  // Clearing the input resets to not typing.
  result = roomStub.sendTyping("");
  ok(!roomStub._typingTimer, "Typing timer is cancelled and reset");
  equal(
    result,
    Ci.prplIConversation.NO_TYPING_LIMIT,
    "Default to no typing limit 4"
  );
  equal(
    roomStub.typingState,
    Ci.prplIConvIM.NOT_TYPING,
    "The user is no longer typing"
  );

  roomStub.unInit();
});

add_task(function test_cancelTypingTimer() {
  const roomStub = {
    _typingTimer: setTimeout(() => {}, 10000), // eslint-disable-line mozilla/no-arbitrary-setTimeout
  };
  Conversation.prototype._cancelTypingTimer.call(roomStub);
  ok(!roomStub._typingTimer, "Typing timer is cancelled and reset");
});

add_task(function test_finishedComposing() {
  const roomStub = new Conversation();

  roomStub.finishedComposing();
  equal(roomStub.typingState, undefined, "Typing is disabled");

  roomStub.supportTypingNotifications = true;
  roomStub.finishedComposing();
  equal(
    roomStub.typingState,
    Ci.prplIConvIM.TYPED,
    "The user has left a message in the window"
  );
});
