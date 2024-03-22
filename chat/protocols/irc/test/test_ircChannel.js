/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

var { ircChannel } = ChromeUtils.importESModule(
  "resource:///modules/ircAccount.sys.mjs"
);

function waitForTopic(target, targetTopic) {
  return new Promise(resolve => {
    const observer = {
      observe(subject, topic, data) {
        if (topic === targetTopic) {
          resolve({ subject, data });
          target.removeObserver(observer);
        }
      },
    };
    target.addObserver(observer);
  });
}

function getChannel(account) {
  const channelStub = {
    _observers: [],
    _name: "#test",
    _account: {
      _currentServerName: "test",
      imAccount: {
        statusInfo: {},
      },
      _nickname: "user",
      _activeCAPs: new Set(),
      ...account,
    },
  };
  Object.setPrototypeOf(channelStub, ircChannel.prototype);
  return channelStub;
}

add_task(async function test_dispatchMessage_normal() {
  let didSend = false;
  const channelStub = getChannel({
    sendMessage(type, data) {
      equal(type, "PRIVMSG");
      deepEqual(data, ["#test", "foo"]);
      didSend = true;
      return true;
    },
  });
  const newText = waitForTopic(channelStub, "new-text");
  channelStub.dispatchMessage("foo");
  ok(didSend);
  const { subject: sentMessage } = await newText;
  equal(sentMessage.message, "foo");
  ok(sentMessage.outgoing);
  ok(!sentMessage.notification);
  equal(sentMessage.who, "user");
});

add_task(async function test_dispatchMessage_empty() {
  let didSend = false;
  const channelStub = getChannel({
    sendMessage() {
      ok(false, "Should not send empty message");
      didSend = true;
      return true;
    },
  });
  channelStub.writeMessage = () => {
    ok(false, "Should not display empty unsent message");
    didSend = true;
  };
  ircChannel.prototype.dispatchMessage.call(channelStub, "");
  ok(!didSend);
});

add_task(async function test_dispatchMessage_echoed() {
  let didSend = false;
  let didWrite = false;
  const channelStub = getChannel({
    sendMessage(type, data) {
      equal(type, "PRIVMSG");
      deepEqual(data, ["#test", "foo"]);
      didSend = true;
      return true;
    },
  });
  channelStub._account._activeCAPs.add("echo-message");
  channelStub.writeMessage = () => {
    ok(false, "Should not write message when echo is on");
    didWrite = true;
  };
  ircChannel.prototype.dispatchMessage.call(channelStub, "foo");
  ok(didSend);
  ok(!didWrite);
});

add_task(async function test_dispatchMessage_error() {
  let didSend = false;
  const channelStub = getChannel({
    sendMessage(type, data) {
      equal(type, "PRIVMSG");
      deepEqual(data, ["#test", "foo"]);
      didSend = true;
      return false;
    },
  });
  const newText = waitForTopic(channelStub, "new-text");
  ircChannel.prototype.dispatchMessage.call(channelStub, "foo");
  ok(didSend);
  const { subject: writtenMessage } = await newText;
  ok(writtenMessage.error);
  ok(writtenMessage.system);
  equal(writtenMessage.who, "test");
});

add_task(async function test_dispatchMessage_action() {
  let didSend = false;
  const channelStub = getChannel({
    sendMessage() {
      ok(false, "Action should not be sent as normal message");
      return false;
    },
    sendCTCPMessage(target, isNotice, command, params) {
      equal(target, "#test");
      ok(!isNotice);
      equal(command, "ACTION");
      equal(params, "foo");
      didSend = true;
      return true;
    },
  });
  const newText = waitForTopic(channelStub, "new-text");
  ircChannel.prototype.dispatchMessage.call(channelStub, "foo", true);
  ok(didSend);
  const { subject: sentMessage } = await newText;
  equal(sentMessage.message, "foo");
  ok(sentMessage.outgoing);
  ok(!sentMessage.notification);
  ok(sentMessage.action);
  equal(sentMessage.who, "user");
});

add_task(async function test_dispatchMessage_actionError() {
  let didSend = false;
  const channelStub = getChannel({
    sendMessage() {
      ok(false, "Action should not be sent as normal message");
      return false;
    },
    sendCTCPMessage(target, isNotice, command, params) {
      equal(target, "#test");
      ok(!isNotice);
      equal(command, "ACTION");
      equal(params, "foo");
      didSend = true;
      return false;
    },
  });
  const newText = waitForTopic(channelStub, "new-text");
  ircChannel.prototype.dispatchMessage.call(channelStub, "foo", true);
  ok(didSend, "Message was sent");
  const { subject: sentMessage } = await newText;
  ok(sentMessage.error, "Shown message is error");
  ok(sentMessage.system, "Shown message is from system");
  equal(sentMessage.who, "test");
});

add_task(async function test_dispatchMessage_notice() {
  let didSend = false;
  const channelStub = getChannel({
    sendMessage(type, data) {
      equal(type, "NOTICE");
      deepEqual(data, ["#test", "foo"]);
      didSend = true;
      return true;
    },
  });
  const newText = waitForTopic(channelStub, "new-text");
  ircChannel.prototype.dispatchMessage.call(channelStub, "foo", false, true);
  ok(didSend);
  const { subject: sentMessage } = await newText;
  equal(sentMessage.message, "foo");
  ok(sentMessage.outgoing);
  ok(sentMessage.notification);
  equal(sentMessage.who, "user");
});
