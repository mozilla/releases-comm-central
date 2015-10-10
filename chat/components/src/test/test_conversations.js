/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

var {interfaces: Ci, utils: Cu} = Components;
Cu.import("resource:///modules/imServices.jsm");
Cu.import("resource:///modules/jsProtoHelper.jsm");

var imConversations = {};
Services.scriptloader.loadSubScript(
  "resource:///components/imConversations.js", imConversations
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
      protocol: {name: "Fake Protocol"},
      alias: "",
      name: "Fake Account"
    },
    ERROR: function(e) {throw e;},
    DEBUG: function() {}
  },
  addObserver: function(aObserver) {
    if (!(aObserver instanceof Ci.nsIObserver))
      aObserver = {observe: aObserver};
    GenericConvIMPrototype.addObserver.call(this, aObserver);
  }
};

// Ensure that when iMsg.message is set to a message (including the empty
// string), it returns that message. If not, it should return the original
// message. This prevents regressions due to JS coercions.
var test_null_message = function() {
  let originalMessage = "Hi!";
  let pMsg = new Message("buddy", originalMessage, {
    outgoing: true, _alias: "buddy", time: Date.now()
  });
  let iMsg = new imConversations.imMessage(pMsg);
  equal(iMsg.message, originalMessage, "Expected the original message.");
  // Setting the message should prevent a fallback to the original.
  iMsg.message = "";
  equal(iMsg.message, "", "Expected an empty string; not the original message.");
  equal(iMsg.originalMessage, originalMessage, "Expected the original message.");
};

// ROT13, used as an example transformation.
function rot13(aString) {
  return aString.replace(/[a-zA-Z]/g, function(c) {
    return String.fromCharCode(c.charCodeAt(0) + (c.toLowerCase() < "n" ? 1 : -1) * 13);
  });
}

// A test that exercises the message transformation pipeline.
//
// From the sending users perspective, this looks like:
//   -> UIConv sendMsg
//   -> UIConv notifyObservers `preparing-message`
//   -> protocol prepareForSending
//   -> UIConv notifyObservers `sending-message`
//   -> protocol sendMsg
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
var test_message_transformation = function() {
  let conv = new Conversation();
  conv.sendMsg = function(aMsg) {
    this.writeMessage("user", aMsg, {outgoing: true});
  };

  let uiConv = new imConversations.UIConversation(conv);
  let message = "Hello!";
  let receivedMsg = false, newTxt = false;

  uiConv.addObserver({
    observe: function(aObject, aTopic, aMsg) {
      switch(aTopic) {
        case "sending-message":
          ok(!newTxt, "sending-message should fire before new-text.");
          ok(!receivedMsg, "sending-message should fire before received-message.");
          ok(aObject.QueryInterface(Ci.imIOutgoingMessage), "Wrong message type.");
          aObject.message = rot13(aObject.message);
          break;
        case "received-message":
          ok(!newTxt, "received-message should fire before new-text.");
          ok(!receivedMsg, "Sanity check that receive-message hasn't fired yet.");
          ok(aObject.outgoing, "Expected an outgoing message.");
          ok(aObject.QueryInterface(Ci.imIMessage), "Wrong message type.");
          equal(aObject.displayMessage, rot13(message), "Expected to have been rotated while sending-message.");
          aObject.displayMessage = rot13(aObject.displayMessage);
          receivedMsg = true;
          break;
        case "new-text":
          ok(!newTxt, "Sanity check that new-text hasn't fired yet.");
          ok(receivedMsg, "Expected received-message to have fired.");
          ok(aObject.outgoing, "Expected an outgoing message.");
          ok(aObject.QueryInterface(Ci.imIMessage), "Wrong message type.");
          equal(aObject.displayMessage, message, "Expected to have been rotated back to msg in received-message.");
          newTxt = true;
          break;
      }
    }
  });

  uiConv.sendMsg(message);
  ok(newTxt, "Expected new-text to have fired.");
};

// A test that cancels a message before it can be sent.
var test_cancel_send_message = function() {
  let conv = new Conversation();
  conv.sendMsg = function(aMsg) {
    ok(false, "The message should have been halted in the conversation service.");
  };

  let sending = false;
  let uiConv = new imConversations.UIConversation(conv);
  uiConv.addObserver({
    observe: function(aObject, aTopic, aMsg) {
      switch(aTopic) {
        case "sending-message":
          ok(aObject.QueryInterface(Ci.imIOutgoingMessage), "Wrong message type.");
          aObject.cancelled = true;
          sending = true;
          break;
        case "received-message":
        case "new-text":
          ok(false, "No other notification should be fired for a cancelled message.");
          break;
      }
    }
  });
  uiConv.sendMsg("Hi!");
  ok(sending, "The sending-message notification was never fired.");
};

// A test that cancels a message before it gets displayed.
var test_cancel_display_message = function() {
  let conv = new Conversation();
  conv.sendMsg = function(aMsg) {
    this.writeMessage("user", aMsg, {outgoing: true});
  };

  let received = false;
  let uiConv = new imConversations.UIConversation(conv);
  uiConv.addObserver({
    observe: function(aObject, aTopic, aMsg) {
      switch(aTopic) {
        case "received-message":
          ok(aObject.QueryInterface(Ci.imIMessage), "Wrong message type.");
          aObject.cancelled = true;
          received = true;
          break;
        case "new-text":
          ok(false, "Should not fire for a cancelled message.");
          break;
      }
    }
  });

  uiConv.sendMsg("Hi!");
  ok(received, "The received-message notification was never fired.")
};

// A test that ensures protocols get a chance to prepare a message before
// sending and displaying.
var test_prpl_message_prep = function() {
  let conv = new Conversation();
  conv.sendMsg = function(aMsg) {
    this.writeMessage("user", aMsg, {outgoing: true});
  };

  let msg = "Hi!";
  let prefix = "test> ";

  let prepared = false;
  conv.prepareForSending = function(aMsg) {
    ok(aMsg.QueryInterface(Ci.imIOutgoingMessage), "Wrong message type.");
    equal(aMsg.message, msg, "Expected the original message.");
    aMsg.message = prefix + aMsg.message;
    prepared = true;
  };

  conv.prepareForDisplaying = function(aMsg) {
    ok(aMsg.QueryInterface(Ci.imIMessage), "Wrong message type.");
    equal(aMsg.displayMessage, prefix + msg, "Expected the prefixed message.");
    aMsg.displayMessage = aMsg.displayMessage.slice(prefix.length);
  };

  let receivedMsg = false;
  let uiConv = new imConversations.UIConversation(conv);
  uiConv.addObserver({
    observe: function(aObject, aTopic, aMsg) {
      if (aTopic === "new-text") {
        ok(prepared, "The message was not prepared before sending.");
        equal(aObject.displayMessage, msg, "Expected the original message.");
        receivedMsg = true;
      }
    }
  });

  uiConv.sendMsg(msg);
  ok(receivedMsg, "The received-message notification was never fired.");
};

// A test that ensures protocols can split messages before they are sent.
var test_split_message_before_sending = function() {
  let msgCount = 0;
  let prepared = false;

  let msg = "This is a looo\nooong message.\nThis one is short.";
  let msgs = msg.split("\n");

  let conv = new Conversation();
  conv.sendMsg = function(aMsg) {
    equal(aMsg, msgs[msgCount++], "Sending an unexpected message.");
  };
  conv.prepareForSending = function(aMsg) {
    ok(aMsg.QueryInterface(Ci.imIOutgoingMessage), "Wrong message type.");
    prepared = true;
    return aMsg.message.split("\n");
  };

  let uiConv = new imConversations.UIConversation(conv);
  uiConv.sendMsg(msg);

  ok(prepared, "Message wasn't prepared for sending.");
  equal(msgCount, 3, "Not enough messages were sent.");
};

function run_test() {
  test_null_message();
  test_message_transformation();
  test_cancel_send_message();
  test_cancel_display_message();
  test_prpl_message_prep();
  test_split_message_before_sending();
  run_next_test();
}
