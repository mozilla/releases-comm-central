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
  _account: {
    sendStanza(stanza, callback, aThis, logString) {
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
