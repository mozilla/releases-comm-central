/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

var { ircMessage } = ChromeUtils.importESModule(
  "resource:///modules/ircAccount.sys.mjs"
);
const { ircNonStandard } = ChromeUtils.importESModule(
  "resource:///modules/ircNonStandard.sys.mjs"
);

// The function that is under test here.
var NOTICE = ircNonStandard.commands.NOTICE;

function FakeConversation() {}
FakeConversation.prototype = {
  writeMessage() {},
};

function FakeAccount(aPassword) {
  this.imAccount = {
    password: aPassword,
  };
  this.buffer = [];
  this.convs = [];
}
FakeAccount.prototype = {
  connected: false,
  shouldAuthenticate: undefined,
  _nickname: "nick", // Can be anything except "auth" for most tests.
  sendMessage(aCommand, aParams) {
    this.buffer.push([aCommand, aParams]);
  },
  gotDisconnected() {
    this.connected = false;
  },
  getConversation(aName) {
    this.convs.push(aName);
    return new FakeConversation();
  },
};

function run_test() {
  add_test(testSecureList);
  add_test(testZncAuth);
  add_test(testUMich);
  add_test(testAuthNick);
  add_test(testIgnoredNotices);

  run_next_test();
}

/*
 * Test that SECURELIST properly sets the timer such that another LIST call can
 * happen soon. See bug 1082501.
 */
function testSecureList() {
  const kSecureListMsg =
    ":fripp.mozilla.org NOTICE aleth-build :*** You cannot list within the first 60 seconds of connecting. Please try again later.";

  const message = ircMessage(kSecureListMsg, "");
  const account = new FakeAccount();
  account.connected = true;
  const result = NOTICE.call(account, message);

  // Yes, it was handled.
  ok(result);

  // Undo the expected calculation, this should be near 0.
  const value =
    account._lastListTime - Date.now() - 60000 + 12 * 60 * 60 * 1000;
  // Give some wiggle room.
  less(Math.abs(value), 5 * 1000);

  run_next_test();
}

/*
 * ZNC allows a client to send PASS after connection has occurred if it has not
 * yet been provided. See bug 955244, bug 1197584.
 */
function testZncAuth() {
  const kZncMsgs = [
    ":irc.znc.in NOTICE AUTH :*** You need to send your password. Try /quote PASS <username>:<password>",
    ":irc.znc.in NOTICE AUTH :*** You need to send your password. Configure your client to send a server password.",
  ];

  for (const msg of kZncMsgs) {
    const message = ircMessage(msg, "");
    // No provided password.
    let account = new FakeAccount();
    let result = NOTICE.call(account, message);

    // Yes, it was handled.
    Assert.ok(result);

    // No sent data and parameters should be unchanged.
    equal(account.buffer.length, 0);
    equal(account.shouldAuthenticate, undefined);

    // With a password.
    account = new FakeAccount("password");
    result = NOTICE.call(account, message);

    // Yes, it was handled.
    ok(result);

    // Check if the proper message was sent.
    const sent = account.buffer[0];
    equal(sent[0], "PASS");
    equal(sent[1], "password");
    equal(account.buffer.length, 1);

    // Don't try to authenticate with NickServ.
    equal(account.shouldAuthenticate, false);

    // Finally, check if the message is wrong.
    account = new FakeAccount("password");
    message.params[1] = "Test";
    result = NOTICE.call(account, message);

    // This would be handled as a normal NOTICE.
    equal(result, false);
  }

  run_next_test();
}

/*
 * irc.umich.edu sends a lot of garbage and has a non-standard captcha. See bug
 * 954350.
 */
function testUMich() {
  // The above should not print out.
  const kMsgs = [
    "NOTICE AUTH :*** Processing connection to irc.umich.edu",
    "NOTICE AUTH :*** Looking up your hostname...",
    "NOTICE AUTH :*** Checking Ident",
    "NOTICE AUTH :*** Found your hostname",
    "NOTICE AUTH :*** No Ident response",
  ];

  const kFinalMsg =
    ':irc.umich.edu NOTICE clokep :To complete your connection to this server, type "/QUOTE PONG :cookie", where cookie is the following ascii.';

  const account = new FakeAccount();
  for (const msg of kMsgs) {
    const message = ircMessage(msg, "");
    const result = NOTICE.call(account, message);

    // These initial notices are not handled (i.e. they'll be subject to
    // _showServerTab).
    equal(result, false);
  }

  // And finally the last one should be printed out, always. It contains the
  // directions of what to do next.
  const message = ircMessage(kFinalMsg, "");
  const result = NOTICE.call(account, message);
  ok(result);
  equal(account.convs.length, 1);
  equal(account.convs[0], "irc.umich.edu");

  run_next_test();
}

/*
 * Test an edge-case of the user having the nickname of auth. See bug 1083768.
 */
function testAuthNick() {
  const kMsg =
    ':irc.umich.edu NOTICE AUTH :To complete your connection to this server, type "/QUOTE PONG :cookie", where cookie is the following ascii.';

  const account = new FakeAccount();
  account._nickname = "AUTH";

  const message = ircMessage(kMsg, "");
  const result = NOTICE.call(account, message);

  // Since it is ambiguous if it was an authentication message or a message
  // directed at the user, print it out.
  ok(result);

  run_next_test();
}

/*
 * We ignore some messages that are annoying to the user and offer little value.
 * "Ignore" in this context means subject to the normal NOTICE processing.
 */
function testIgnoredNotices() {
  const kMsgs = [
    // moznet sends a welcome message which is useless.
    ":levin.mozilla.org NOTICE Auth :Welcome to \u0002Mozilla\u0002!",
    // Some servers (oftc) send a NOTICE that isn't an auth, but notifies about
    // the connection. See bug 1182735.
    ":beauty.oftc.net NOTICE myusername :*** Connected securely via UNKNOWN AES128-SHA-128",
  ];

  for (const msg of kMsgs) {
    const account = new FakeAccount();

    const message = ircMessage(msg, "");
    const result = NOTICE.call(account, message);

    // This message should *NOT* be shown.
    equal(result, false);
  }

  run_next_test();
}
