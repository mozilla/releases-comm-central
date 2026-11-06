/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const { setTimeout, clearTimeout } = ChromeUtils.importESModule(
  "resource://gre/modules/Timer.sys.mjs"
);

const { XMPPConversationPrototype } = ChromeUtils.importESModule(
  "resource:///modules/xmpp-base.sys.mjs"
);
const { Stanza } = ChromeUtils.importESModule(
  "resource:///modules/xmpp-xml.sys.mjs"
);

function TestXmppConversation() {
  this._account.stanzas = [];
}
TestXmppConversation.prototype = {
  __proto__: XMPPConversationPrototype,
  to: "alice@example.com",
  // _displaySentMsg reads from the account and writes to the conversation, so
  // provide minimal stubs for those.
  account: {
    alias: "Test User",
    statusInfo: { displayName: "Test User" },
  },
  writeMessage() {},
  _account: {
    name: "test@example.com",
    sendStanza(stanza) {
      this.stanzas.push(stanza);
    },
  },
};

/**
 * Confirm that the stanza matches the expected chat state.
 *
 * @param {Stanza} stanza The sent stanza.
 * @param {string} expected The expected chat state.
 * @param {string} message An assertion message
 * @private
 */
function _checkChatState(stanza, expected, message) {
  equal(stanza.localName, "message", `${message}: localName wrong`);
  equal(
    stanza.attributes.to,
    "alice@example.com",
    `${message}: localName wrong`
  );
  equal(stanza.attributes.type, "chat", `${message}: expected 'chat' type`);
  equal(stanza.children.length, 1, `${message}: one child element`);
  const stateStanza = stanza.children[0];
  equal(stateStanza.uri, Stanza.NS.chatstates, `${message}: namespace wrong`);
  equal(stateStanza.localName, expected, `${message}: child localName wrong`);
}

add_task(function test_setTypingState() {
  const roomStub = new TestXmppConversation();

  roomStub.setTypingState(Ci.prplIConvIM.TYPING);
  equal(roomStub._account.stanzas.length, 1, "First chat state stanza sent");
  _checkChatState(
    roomStub._account.stanzas[0],
    "composing",
    "First sent stanza"
  );
  equal(roomStub._typingState, "composing", "User is typing");

  roomStub.setTypingState(Ci.prplIConvIM.NOT_TYPING);
  equal(roomStub._account.stanzas.length, 2, "Second chat state stanza sent");
  _checkChatState(roomStub._account.stanzas[1], "active", "Second sent stanza");
  equal(
    roomStub._typingState,
    "active",
    "User is no longer typing, but still active"
  );

  roomStub.setTypingState(Ci.prplIConvIM.TYPING);
  equal(roomStub._account.stanzas.length, 3, "Third chat state stanza sent");
  _checkChatState(
    roomStub._account.stanzas[2],
    "composing",
    "Third sent stanza"
  );
  equal(roomStub._typingState, "composing", "User is typing");

  roomStub.setTypingState(Ci.prplIConvIM.TYPED);
  equal(roomStub._account.stanzas.length, 4, "Fourth chat state stanza sent");
  _checkChatState(roomStub._account.stanzas[3], "paused", "Fourth sent stanza");
  equal(roomStub._typingState, "paused", "User has stopped typing");

  roomStub._cancelTypingTimer();
});

add_task(function test_finishedComposing() {
  const roomStub = new TestXmppConversation();

  roomStub.supportChatStateNotifications = false;
  roomStub.finishedComposing();
  equal(roomStub._account.stanzas.length, 0, "Typing is disabled");
  equal(roomStub._typingState, "active", "Chat state is not updated");

  roomStub.supportChatStateNotifications = true;
  roomStub.finishedComposing();
  equal(roomStub._account.stanzas.length, 1, "Chat state stanza sent");
  _checkChatState(roomStub._account.stanzas[0], "paused", "First sent stanza");
  equal(roomStub._typingState, "paused", "User has stopped typing");

  roomStub._cancelTypingTimer();
});

add_task(function test_dispatchMessage_resets_typing() {
  const roomStub = new TestXmppConversation();

  // Enable typing notifications
  roomStub.supportChatStateNotifications = true;

  // Set typing state to composing
  roomStub.setTypingState(Ci.prplIConvIM.TYPING);
  equal(roomStub._account.stanzas.length, 1, "Typing state sent");
  _checkChatState(roomStub._account.stanzas[0], "composing", "Composing sent");
  equal(roomStub._typingState, "composing", "User is typing");

  // Send a message - this should reset typing to active
  roomStub.dispatchMessage("hello world");
  equal(roomStub._account.stanzas.length, 2, "Message + active state sent");

  // The second stanza should be the message with active chat state
  const msgStanza = roomStub._account.stanzas[1];
  equal(msgStanza.localName, "message", "Message stanza sent");
  equal(msgStanza.attributes.to, "alice@example.com", "Message to correct JID");
  equal(msgStanza.children.length, 2, "Two children (body + chat state)");
  equal(msgStanza.children[0].localName, "body", "First child is body");
  const stateStanza = msgStanza.children[1];
  equal(stateStanza.uri, Stanza.NS.chatstates, "Chat state namespace");
  equal(stateStanza.localName, "active", "Chat state is active");

  // Typing state should be reset to active
  equal(roomStub._typingState, "active", "Typing state reset to active");
});

add_task(function test_dispatchMessage_no_typing_when_disabled() {
  const roomStub = new TestXmppConversation();

  // Disable typing notifications
  roomStub.supportChatStateNotifications = false;

  roomStub.dispatchMessage("hello world");
  equal(roomStub._account.stanzas.length, 1, "Only message sent");

  // Should have body but no chat state child
  const msgStanza = roomStub._account.stanzas[0];
  equal(msgStanza.children.length, 1, "One child (body only)");
  equal(msgStanza.children[0].localName, "body", "Only child is body");
});

add_task(function test_dispatchMessage_no_typing_when_pref_disabled() {
  const roomStub = new TestXmppConversation();

  // The conversation supports chat states, but the user preference disables
  // sending typing notifications.
  Services.prefs.setBoolPref("purple.conversations.im.send_typing", false);
  try {
    roomStub.supportChatStateNotifications = true;

    roomStub.dispatchMessage("hello world");
    equal(roomStub._account.stanzas.length, 1, "Only message sent");

    // The message should not carry a chat state child.
    const msgStanza = roomStub._account.stanzas[0];
    equal(msgStanza.children.length, 1, "One child (body only)");
    equal(msgStanza.children[0].localName, "body", "Only child is body");
  } finally {
    Services.prefs.clearUserPref("purple.conversations.im.send_typing");
  }
});

add_task(function test_dispatchMessage_cancels_composing_timer() {
  const roomStub = new TestXmppConversation();

  roomStub.supportChatStateNotifications = true;

  // Start typing through sendTyping, which schedules the "finished composing"
  // timer.
  roomStub.sendTyping("hello");
  ok(roomStub._typingTimer, "Composing timer is set");

  roomStub.dispatchMessage("hello world");

  // Sending the message must cancel the pending composing timer so a stale
  // "paused" state isn't sent after the message.
  ok(!roomStub._typingTimer, "Composing timer cleared after sending");
});
