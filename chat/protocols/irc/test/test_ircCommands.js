/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

var { IMServices } = ChromeUtils.importESModule(
  "resource:///modules/IMServices.sys.mjs"
);
var { commands } = ChromeUtils.importESModule(
  "resource:///modules/ircCommands.sys.mjs"
);
var { ircProtocol } = ChromeUtils.importESModule(
  "resource:///modules/irc.sys.mjs"
);
var { ircAccount, ircConversation } = ChromeUtils.importESModule(
  "resource:///modules/ircAccount.sys.mjs"
);

// Ensure the commands have been initialized.
IMServices.conversations.initConversations();

var fakeProto = {
  id: "fake-proto",
  usernameSplits: ircProtocol.prototype.usernameSplits,
  splitUsername: ircProtocol.prototype.splitUsername,
};

function run_test() {
  add_test(testUserModeCommand);
  add_test(testModeCommand);
  run_next_test();
}

// Test the /mode command.
function testModeCommand() {
  const testChannelCommands = [
    {
      msg: "",
      channel: "#instantbird",
      expectedMessage: "MODE #instantbird",
    },
    {
      msg: "#instantbird",
      channel: "#instantbird",
      expectedMessage: "MODE #instantbird",
    },
    {
      msg: "-s",
      channel: "#Fins",
      expectedMessage: "MODE #Fins -s",
    },
    {
      msg: "#introduction +is",
      channel: "#introduction",
      expectedMessage: "MODE #introduction +is",
    },
    {
      msg: "-s",
      channel: "&Gills",
      expectedMessage: "MODE &Gills -s",
    },
    {
      msg: "#Gamers +o KennyS",
      channel: "#Gamers",
      expectedMessage: "MODE #Gamers +o KennyS",
    },
    {
      msg: "+o lisp",
      channel: "&IB",
      expectedMessage: "MODE &IB +o lisp",
    },
    {
      msg: "+b nick!abc@server",
      channel: "#Alphabet",
      expectedMessage: "MODE #Alphabet +b nick!abc@server",
    },
    {
      msg: "+b nick",
      channel: "#Alphabet",
      expectedMessage: "MODE #Alphabet +b nick",
    },
    {
      msg: "#instantbird +b nick!abc@server",
      channel: "#instantbird",
      expectedMessage: "MODE #instantbird +b nick!abc@server",
    },
    {
      msg: "+v Wiz",
      channel: "#TheMatrix",
      expectedMessage: "MODE #TheMatrix +v Wiz",
    },
    {
      msg: "+k passcode",
      channel: "#TheMatrix",
      expectedMessage: "MODE #TheMatrix +k passcode",
    },
    {
      msg: "#Mafia +k keyword",
      channel: "#Mafia",
      expectedMessage: "MODE #Mafia +k keyword",
    },
    {
      msg: "#introduction +l 100",
      channel: "#introduction",
      expectedMessage: "MODE #introduction +l 100",
    },
    {
      msg: "+l 100",
      channel: "#introduction",
      expectedMessage: "MODE #introduction +l 100",
    },
  ];

  const testUserCommands = [
    {
      msg: "nickolas +x",
      expectedMessage: "MODE nickolas +x",
    },
    {
      msg: "matrixisreal -x",
      expectedMessage: "MODE matrixisreal -x",
    },
    {
      msg: "matrixisreal_19 +oWp",
      expectedMessage: "MODE matrixisreal_19 +oWp",
    },
    {
      msg: "nick",
      expectedMessage: "MODE nick",
    },
  ];

  const account = new ircAccount(fakeProto, {
    name: "defaultnick@instantbird.org",
  });

  // check if the message being sent is same as expected message.
  account.sendRawMessage = aMessage => {
    equal(aMessage, account._expectedMessage);
  };

  const command = _getRunCommand("mode");

  // First test Channel Commands.
  for (const test of testChannelCommands) {
    const conv = new ircConversation(account, test.channel);
    account._expectedMessage = test.expectedMessage;
    command(test.msg, conv);
  }

  // Now test the User Commands.
  const conv = new ircConversation(account, "dummyConversation");
  account._nickname = "test_nick";
  for (const test of testUserCommands) {
    account._expectedMessage = test.expectedMessage;
    command(test.msg, conv);
  }

  run_next_test();
}

// Test the /umode command.
function testUserModeCommand() {
  const testData = [
    {
      msg: "+x",
      expectedMessage: "MODE test_nick +x",
    },
    {
      msg: "-x",
      expectedMessage: "MODE test_nick -x",
    },
    {
      msg: "-pa",
      expectedMessage: "MODE test_nick -pa",
    },
    {
      msg: "+oWp",
      expectedMessage: "MODE test_nick +oWp",
    },
    {
      msg: "",
      expectedMessage: "MODE test_nick",
    },
  ];

  const account = new ircAccount(fakeProto, {
    name: "test_nick@instantbird.org",
  });
  account._nickname = "test_nick";
  const conv = new ircConversation(account, "newconv");

  // check if the message being sent is same as expected message.
  account.sendRawMessage = aMessage => {
    equal(aMessage, account._expectedMessage);
  };

  const command = _getRunCommand("umode");

  // change the nick and runUserModeCommand for each test
  for (const test of testData) {
    account._expectedMessage = test.expectedMessage;
    command(test.msg, conv);
  }

  run_next_test();
}

// Fetch the run() of a named command.
function _getRunCommand(aCommandName) {
  for (const command of commands) {
    if (command.name == aCommandName) {
      return command.run;
    }
  }

  // Fail if no command was found.
  ok(false, "Could not find the '" + aCommandName + "' command.");
  return null; // Shut-up eslint.
}
