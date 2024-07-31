/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

var { IMServices } = ChromeUtils.importESModule(
  "resource:///modules/IMServices.sys.mjs"
);
var { ircAccount, ircChannel } = ChromeUtils.importESModule(
  "resource:///modules/ircAccount.sys.mjs"
);

IMServices.conversations.initConversations();

function FakeAccount() {
  this.normalizeNick = ircAccount.prototype.normalizeNick.bind(this);
}
FakeAccount.prototype = {
  __proto__: ircAccount.prototype,
  setWhois: () => true,
  ERROR: do_throw,
};

function run_test() {
  add_test(test_topicSettable);
  add_test(test_topicSettableJoinAsOp);
  add_test(test_addRemoveKey);

  run_next_test();
}

// Test joining a channel, then being set as op.
function test_topicSettable() {
  const channel = new ircChannel(new FakeAccount(), "#test", "nick");
  // We're not in the room yet, so the topic is NOT editable.
  equal(channel.topicSettable, false);

  // Join the room.
  channel.getParticipant("nick");
  // The topic should be editable.
  equal(channel.topicSettable, true);

  // Receive the channel mode.
  channel.setMode("+t", [], "ChanServ");
  // Mode +t means that you need status to set the mode.
  equal(channel.topicSettable, false);

  // Receive a user mode.
  channel.setMode("+o", ["nick"], "ChanServ");
  // Nick is now an op and can set the topic!
  equal(channel.topicSettable, true);

  run_next_test();
}

// Test when you join as an op (as opposed to being set to op after joining).
function test_topicSettableJoinAsOp() {
  const channel = new ircChannel(new FakeAccount(), "#test", "nick");
  // We're not in the room yet, so the topic is NOT editable.
  equal(channel.topicSettable, false);

  // Join the room as an op.
  channel.getParticipant("@nick");
  // The topic should be editable.
  equal(channel.topicSettable, true);

  // Receive the channel mode.
  channel.setMode("+t", [], "ChanServ");
  // The topic should still be editable.
  equal(channel.topicSettable, true);

  run_next_test();
}

function test_addRemoveKey() {
  const account = new FakeAccount();
  const channel = new ircChannel(account, "#test", "nick");

  // Add chat room fields to the channel.
  channel.chatRoomFields = account.getChatRoomFieldValuesFromString("#test");

  equal(
    channel.chatRoomFields.getValue("password"),
    undefined,
    "Start with no password set"
  );

  // Receive the channel mode.
  channel.setMode("+k", ["foo"], "ChanServ");
  equal(
    channel.chatRoomFields.getValue("password"),
    "foo",
    "The password should be stored"
  );

  // Receive the channel mode.
  channel.setMode("-k", [], "ChanServ");
  equal(
    channel.chatRoomFields.getValue("password"),
    undefined,
    "The password should be cleared"
  );

  run_next_test();
}
