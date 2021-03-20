/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

var { commands } = ChromeUtils.import("resource:///modules/matrixCommands.jsm");

function run_test() {
  add_test(testUnhandledEmptyCommands);
  add_test(testTopic);
  add_test(testMsgMissingMessage);
  add_test(testMsgNoRoom);
  add_test(testJoinNotRoomId);
  add_test(testJoinSuccess);
  run_next_test();
}

function testUnhandledEmptyCommands() {
  const noopCommands = [
    "ban",
    "unban",
    "invite",
    "kick",
    "nick",
    "op",
    "deop",
    "topic",
    "roomname",
    "addalias",
    "removealias",
    "upgraderoom",
    "me",
    "msg",
    "join",
  ];
  for (const command of commands) {
    if (noopCommands.includes(command.name)) {
      ok(
        !command.run(""),
        "Command " + command.name + " reports it handled no arguments"
      );
      ok(
        !command.run("   "),
        "Command " +
          command.name +
          " reports it handled purely whitespace arguments"
      );
    }
  }

  run_next_test();
}

function testHelpString() {
  for (const command of commands) {
    const helpString = command.helpString;
    equal(
      typeof helpString,
      "string",
      "Usage help for " + command.name + " is not a string"
    );
    ok(
      helpString.includes(command.name),
      command.name + " is not mentioned in its help string"
    );
  }

  run_next_test();
}

function testTopic() {
  const conversation = {
    wrappedJSObject: {
      set topic(value) {
        conversation._topic = value;
      },
    },
  };
  const topic = "foo bar";
  const command = _getRunCommand("topic");
  const result = command(topic, conversation);
  ok(result, "Setting topic was not handled");
  equal(conversation._topic, topic, "Topic not correctly set");

  run_next_test();
}

add_task(async function testMsgSuccess() {
  const targetUser = "@test:example.com";
  const directMessage = "lorem ipsum";
  let onMessage;
  const sendMsgPromise = new Promise(resolve => {
    onMessage = resolve;
  });
  const dm = {
    waitForRoom() {
      return Promise.resolve(this);
    },
    sendMsg(message) {
      onMessage(message);
    },
  };
  const conversation = {
    wrappedJSObject: {
      _account: {
        getDirectConversation(userId) {
          if (userId === targetUser) {
            return dm;
          }
          return null;
        },
      },
    },
  };
  const command = _getRunCommand("msg");
  const result = command(targetUser + " " + directMessage, conversation);
  ok(result, "Sending direct message was not handled");
  const message = await sendMsgPromise;
  equal(message, directMessage, "Message was not sent in DM room");
});

function testMsgMissingMessage() {
  const targetUser = "@test:example.com";
  const conversation = {};
  const command = _getRunCommand("msg");
  const result = command(targetUser, conversation);
  ok(!result, "Sending direct message was handled");

  run_next_test();
}

function testMsgNoRoom() {
  const targetUser = "@test:example.com";
  const directMessage = "lorem ipsum";
  const conversation = {
    wrappedJSObject: {
      _account: {
        getDirectConversation(userId) {
          conversation.userId = userId;
          return null;
        },
        ERROR(errorMsg) {
          conversation.errorMsg = errorMsg;
        },
      },
    },
  };
  const command = _getRunCommand("msg");
  const result = command(targetUser + " " + directMessage, conversation);
  ok(result, "Sending direct message was not handled");
  equal(
    conversation.userId,
    targetUser,
    "Did not try to get the conversation for the target user"
  );
  ok(conversation.errorMsg, "Did not report an error");

  run_next_test();
}

function testJoinSuccess() {
  const roomName = "#test:example.com";
  const conversation = {
    wrappedJSObject: {
      _account: {
        getGroupConversation(roomId) {
          conversation.roomId = roomId;
        },
      },
    },
  };
  const command = _getRunCommand("join");
  const result = command(roomName, conversation);
  ok(result, "Did not handle join command");
  equal(conversation.roomId, roomName, "Did not try to join expected room");

  run_next_test();
}

function testJoinNotRoomId() {
  const roomName = "!asdf:example.com";
  const conversation = {};
  const command = _getRunCommand("join");
  const result = command(roomName, conversation);
  ok(!result, "Handled join command for unsupported room Id");

  run_next_test();
}

// Fetch the run() of a named command.
function _getRunCommand(aCommandName) {
  for (let command of commands) {
    if (command.name == aCommandName) {
      return command.run;
    }
  }

  // Fail if no command was found.
  ok(false, "Could not find the '" + aCommandName + "' command.");
  return null;
}
