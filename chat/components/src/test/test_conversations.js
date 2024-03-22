/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

var { IMServices } = ChromeUtils.importESModule(
  "resource:///modules/IMServices.sys.mjs"
);
var { GenericConvIMPrototype, Message } = ChromeUtils.importESModule(
  "resource:///modules/jsProtoHelper.sys.mjs"
);
var { imMessage, UIConversation } = ChromeUtils.importESModule(
  "resource:///modules/imConversations.sys.mjs"
);

// Fake prplConversation
var _id = 0;
function Conversation(aName) {
  this._name = aName;
  this._observers = [];
  this._date = Date.now() * 1000;
  this.id = ++_id;
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
  addObserver(aObserver) {
    if (!(aObserver instanceof Ci.nsIObserver) && !("observe" in aObserver)) {
      aObserver = { observe: aObserver };
    }
    GenericConvIMPrototype.addObserver.call(this, aObserver);
  },
};

// Ensure that when iMsg.message is set to a message (including the empty
// string), it returns that message. If not, it should return the original
// message. This prevents regressions due to JS coercions.
var test_null_message = function () {
  const originalMessage = "Hi!";
  const pMsg = new Message(
    "buddy",
    originalMessage,
    {
      outgoing: true,
      _alias: "buddy",
      time: Date.now(),
    },
    null
  );
  const iMsg = new imMessage(pMsg);
  equal(iMsg.message, originalMessage, "Expected the original message.");
  // Setting the message should prevent a fallback to the original.
  iMsg.message = "";
  equal(
    iMsg.message,
    "",
    "Expected an empty string; not the original message."
  );
  equal(
    iMsg.originalMessage,
    originalMessage,
    "Expected the original message."
  );
};

// ROT13, used as an example transformation.
function rot13(aString) {
  return aString.replace(/[a-zA-Z]/g, function (c) {
    return String.fromCharCode(
      c.charCodeAt(0) + (c.toLowerCase() < "n" ? 1 : -1) * 13
    );
  });
}

// A test that exercises the message transformation pipeline.
//
// From the sending users perspective, this looks like:
//   -> protocol sendMsg
//   -> protocol notifyObservers `preparing-message`
//   -> protocol prepareForSending
//   -> protocol notifyObservers `sending-message`
//   -> protocol dispatchMessage (jsProtoHelper specific)
//   -> protocol writeMessage
//   -> protocol notifyObservers `new-text`
//   -> UIConv notifyObservers `received-message`
//   -> protocol prepareForDisplaying
//   -> UIConv notifyObservers `new-text`
//
// From the receiving users perspective, they get:
//   -> protocol writeMessage
//   -> protocol notifyObservers `new-text`
//   -> UIConv notifyObservers `received-message`
//   -> protocol prepareForDisplaying
//   -> UIConv notifyObservers `new-text`
//
// The test walks the sending path, which covers both.
add_task(function test_message_transformation() {
  const conv = new Conversation();
  conv.dispatchMessage = function (aMsg) {
    this.writeMessage("user", aMsg, { outgoing: true });
  };

  const message = "Hello!";
  let receivedMsg = false,
    newTxt = false;

  const uiConv = new UIConversation(conv);
  uiConv.addObserver({
    observe(aObject, aTopic) {
      switch (aTopic) {
        case "sending-message":
          ok(!newTxt, "sending-message should fire before new-text.");
          ok(
            !receivedMsg,
            "sending-message should fire before received-message."
          );
          ok(
            aObject.QueryInterface(Ci.imIOutgoingMessage),
            "Wrong message type."
          );
          aObject.message = rot13(aObject.message);
          break;
        case "received-message":
          ok(!newTxt, "received-message should fire before new-text.");
          ok(
            !receivedMsg,
            "Sanity check that receive-message hasn't fired yet."
          );
          ok(aObject.outgoing, "Expected an outgoing message.");
          ok(aObject.QueryInterface(Ci.imIMessage), "Wrong message type.");
          equal(
            aObject.displayMessage,
            rot13(message),
            "Expected to have been rotated while sending-message."
          );
          aObject.displayMessage = rot13(aObject.displayMessage);
          receivedMsg = true;
          break;
        case "new-text":
          ok(!newTxt, "Sanity check that new-text hasn't fired yet.");
          ok(receivedMsg, "Expected received-message to have fired.");
          ok(aObject.outgoing, "Expected an outgoing message.");
          ok(aObject.QueryInterface(Ci.imIMessage), "Wrong message type.");
          equal(
            aObject.displayMessage,
            message,
            "Expected to have been rotated back to msg in received-message."
          );
          newTxt = true;
          break;
      }
    },
  });

  uiConv.sendMsg(message);
  ok(newTxt, "Expected new-text to have fired.");
});

// A test that cancels a message before it gets displayed.
add_task(function test_cancel_display_message() {
  const conv = new Conversation();
  conv.dispatchMessage = function (aMsg) {
    this.writeMessage("user", aMsg, { outgoing: true });
  };

  let received = false;
  const uiConv = new UIConversation(conv);
  uiConv.addObserver({
    observe(aObject, aTopic) {
      switch (aTopic) {
        case "received-message":
          ok(aObject.QueryInterface(Ci.imIMessage), "Wrong message type.");
          aObject.cancelled = true;
          received = true;
          break;
        case "new-text":
          ok(false, "Should not fire for a cancelled message.");
          break;
      }
    },
  });

  uiConv.sendMsg("Hi!");
  ok(received, "The received-message notification was never fired.");
});

var test_update_message = function () {
  const conv = new Conversation();

  const uiConv = new UIConversation(conv);
  const message = "Hello!";
  let receivedMsg = false;
  let updateText = false;

  uiConv.addObserver({
    observe(aObject, aTopic) {
      switch (aTopic) {
        case "received-message":
          ok(!updateText, "received-message should fire before update-text.");
          ok(
            !receivedMsg,
            "Sanity check that receive-message hasn't fired yet."
          );
          ok(aObject.incoming, "Expected an incoming message.");
          ok(aObject.QueryInterface(Ci.imIMessage), "Wrong message type.");
          equal(aObject.displayMessage, message, "Wrong message contents");
          aObject.displayMessage = rot13(aObject.displayMessage);
          receivedMsg = true;
          break;
        case "update-text":
          ok(!updateText, "Sanity check that update-text hasn't fired yet.");
          ok(receivedMsg, "Expected received-message to have fired.");
          ok(aObject.incoming, "Expected an incoming message.");
          ok(aObject.QueryInterface(Ci.imIMessage), "Wrong message type.");
          equal(
            aObject.displayMessage,
            rot13(message),
            "Expected to have been rotated in received-message."
          );
          updateText = true;
          break;
      }
    },
  });

  conv.updateMessage("user", message, { incoming: true, remoteId: "foo" });
  ok(updateText, "Expected update-text to have fired.");
};

add_task(test_null_message);
add_task(test_update_message);
