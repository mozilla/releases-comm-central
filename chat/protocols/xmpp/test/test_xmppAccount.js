/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

var { XMPPAccountPrototype } = ChromeUtils.importESModule(
  "resource:///modules/xmpp-base.sys.mjs"
);
var { Stanza } = ChromeUtils.importESModule(
  "resource:///modules/xmpp-xml.sys.mjs"
);

function joinChat(
  desc,
  roomName,
  roomServer,
  roomNick,
  roomPassword,
  expectedJid,
  expectedTo
) {
  function Conversation(_account, jid, nick) {
    this.jid = jid;
    this.nick = nick;
  }
  Conversation.prototype = {
    removeAllParticipants() {},
  };
  const mockAccount = {
    _MUCConversationConstructor: Conversation,
    _mucs: new Map(),

    sendStanza(stanza, callback, callbackThis, logString) {
      this.stanza = stanza;
      this.callback = callback;
      this.callbackThis = callbackThis;
      this.logString = logString;
    },
  };
  const components = {
    getValue(key) {
      if (key === "room") {
        return roomName;
      } else if (key === "server") {
        return roomServer;
      } else if (key === "nick") {
        return roomNick;
      } else if (key === "password") {
        return roomPassword;
      }
      ok(false, `Unknown chat room field "${key}"`);
      return null;
    },
  };

  const conv = XMPPAccountPrototype.joinChat.call(mockAccount, components);

  // Check the generated stanza.
  equal(mockAccount.stanza.localName, "presence", `${desc}: localName wrong`);
  equal(
    mockAccount.stanza.attributes.to,
    expectedTo,
    `${desc}: localName wrong`
  );
  equal(mockAccount.stanza.children.length, 1, `${desc}: one child element`);
  const xStanza = mockAccount.stanza.children[0];
  equal(xStanza.uri, Stanza.NS.muc, `${desc}: namespace wrong`);
  equal(xStanza.localName, "x", `${desc}: child localName wrong`);
  // A password adds an child extra stanza with content of the password.
  if (roomPassword) {
    equal(
      xStanza.children.length,
      1,
      `${desc}: expected one password child element`
    );
    const passwordStanza = xStanza.children[0];
    equal(
      passwordStanza.localName,
      "password",
      `${desc}: password localName wrong`
    );

    equal(
      passwordStanza.children.length,
      1,
      `${desc}: expected one child element in password`
    );
    equal(passwordStanza.children[0].text, roomPassword);
  } else {
    equal(xStanza.children.length, 0, `${desc}: unexpected child element`);
  }

  equal(mockAccount.callback, undefined, `${desc}: Unexpected callback`);
  equal(
    mockAccount.callbackThis,
    undefined,
    `${desc}: Unexepcted callback this`
  );

  // Ensure the password is not logged.
  if (roomPassword) {
    ok(
      !mockAccount.logString.includes(roomPassword),
      `${desc}: Password in log string`
    );
  } else {
    equal(mockAccount.logString, undefined, `${desc}: Unexpected log string`);
  }

  // Check the conversation parameters.
  ok(
    conv instanceof Conversation,
    `${desc}: Using provided conversation constructor`
  );
  equal(conv.jid, expectedJid);
  equal(conv.nick, roomNick);
}

add_task(function test_joinChat() {
  // Basic test.
  joinChat(
    "Basic",
    "room",
    "server",
    "nick",
    "",
    "room@server",
    "room@server/nick"
  );

  // Test with a password.
  joinChat(
    "Password",
    "room",
    "server",
    "nick",
    "pass1234",
    "room@server",
    "room@server/nick"
  );
});

add_task(function test_getChatRoomFieldValuesFromString() {
  function XMPPAccount() {}
  XMPPAccount.prototype = XMPPAccountPrototype;

  const NICK = "alice";
  const MUC_SERVICE = "muc.test";
  const account = new XMPPAccount();
  account._jid = { node: NICK };
  account._mucService = MUC_SERVICE;

  let result = account.getChatRoomFieldValuesFromString("test");
  Assert.deepEqual(
    result.values,
    { room: "test", server: MUC_SERVICE, nick: NICK },
    "Unexpected result for bare node"
  );

  result = account.getChatRoomFieldValuesFromString("test@foo");
  Assert.deepEqual(
    result.values,
    { room: "test", server: "foo", nick: NICK },
    "Unexpected values for node & server"
  );

  result = account.getChatRoomFieldValuesFromString("test/bob");
  Assert.deepEqual(
    result.values,
    { room: "test", server: MUC_SERVICE, nick: "bob" },
    "Unexpected values for room & nick"
  );

  result = account.getChatRoomFieldValuesFromString("test@foo/bob");
  Assert.deepEqual(
    result.values,
    { room: "test", server: "foo", nick: "bob" },
    "Unexpected values for node, server & nick"
  );

  result = account.getChatRoomFieldValuesFromString("test pass");
  Assert.deepEqual(
    result.values,
    { room: "test", server: MUC_SERVICE, nick: NICK, password: "pass" },
    "Unexpected values for node & password"
  );

  result = account.getChatRoomFieldValuesFromString("");
  Assert.deepEqual(result.values, { nick: NICK }, "Unexpected room for empty");
});

add_task(function test_getChatRoomDefaultFieldValues() {
  function XMPPAccount() {}
  XMPPAccount.prototype = XMPPAccountPrototype;

  const NICK = "alice";
  const MUC_SERVICE = "muc.test";
  const account = new XMPPAccount();
  account._jid = { node: NICK };
  account._mucService = MUC_SERVICE;

  const result = account.getChatRoomDefaultFieldValues();
  Assert.deepEqual(
    result.values,
    { server: MUC_SERVICE, nick: NICK },
    "Unexpected default values"
  );
});
