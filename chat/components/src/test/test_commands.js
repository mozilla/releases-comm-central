/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { IMServices } = ChromeUtils.importESModule(
  "resource:///modules/IMServices.sys.mjs"
);
// We don't load the command service via Services as we want to access
// _findCommands in order to avoid having to intercept command execution.
var { CommandsService } = ChromeUtils.importESModule(
  "resource:///modules/imCommands.sys.mjs"
);

var kPrplId = "green";
var kPrplId2 = "red";

var fakeAccount = {
  connected: true,
  protocol: { id: kPrplId },
};
var fakeDisconnectedAccount = {
  connected: false,
  protocol: { id: kPrplId },
};
var fakeAccount2 = {
  connected: true,
  protocol: { id: kPrplId2 },
};

var fakeConversation = {
  account: fakeAccount,
  isChat: true,
};

function fakeCommand(aName, aUsageContext) {
  this.name = aName;
  if (aUsageContext) {
    this.usageContext = aUsageContext;
  }
}
fakeCommand.prototype = {
  get helpString() {
    return "";
  },
  usageContext: IMServices.cmd.COMMAND_CONTEXT.ALL,
  priority: IMServices.cmd.COMMAND_PRIORITY.PRPL,
  run: () => true,
};

function run_test() {
  const cmdserv = new CommandsService();
  cmdserv.initCommands();

  // Some commands providing multiple possible completions.
  cmdserv.registerCommand(new fakeCommand("banana"), kPrplId2);
  cmdserv.registerCommand(new fakeCommand("baloney"), kPrplId2);

  // MUC-only command.
  cmdserv.registerCommand(
    new fakeCommand("balderdash", IMServices.cmd.COMMAND_CONTEXT.CHAT),
    kPrplId
  );

  // Name clashes with global command.
  cmdserv.registerCommand(new fakeCommand("offline"), kPrplId);

  // Name starts with another command name.
  cmdserv.registerCommand(new fakeCommand("helpme"), kPrplId);

  // Command name contains numbers.
  cmdserv.registerCommand(new fakeCommand("r9kbeta"), kPrplId);

  // Array of (possibly partial) command names as entered by the user.
  const testCmds = [
    "x",
    "b",
    "ba",
    "bal",
    "back",
    "hel",
    "help",
    "off",
    "offline",
  ];

  // We test an array of different possible conversations.
  // cmdlist lists all the available commands for the given conversation.
  // results is an array which for each testCmd provides an array containing
  // data with which the return value of _findCommands can be checked. In
  // particular, the name of the command and whether the first (i.e. preferred)
  // entry in the returned array of commands is a prpl command. (If the latter
  // boolean is not given, false is assumed, if the name is not given, that
  // corresponds to no commands being returned.)
  const testData = [
    {
      desc: "No conversation argument.",
      cmdlist: "away, back, busy, dnd, help, offline, raw, say",
      results: [
        [],
        [],
        ["back"],
        [],
        ["back"],
        ["help"],
        ["help"],
        ["offline"],
        ["offline"],
      ],
    },
    {
      desc: "Disconnected conversation with fakeAccount.",
      conv: {
        account: fakeDisconnectedAccount,
      },
      cmdlist:
        "away, back, busy, dnd, help, helpme, offline, offline, r9kbeta, raw, say",
      results: [
        [],
        [],
        ["back"],
        [],
        ["back"],
        ["help"],
        ["help"],
        ["offline"],
        ["offline"],
      ],
    },
    {
      desc: "Conversation with fakeAccount.",
      conv: {
        account: fakeAccount,
      },
      cmdlist:
        "away, back, busy, dnd, help, helpme, offline, offline, r9kbeta, raw, say",
      results: [
        [],
        [],
        ["back"],
        [],
        ["back"],
        [],
        ["help"],
        ["offline"],
        ["offline"],
      ],
    },
    {
      desc: "MUC with fakeAccount.",
      conv: {
        account: fakeAccount,
        isChat: true,
      },
      cmdlist:
        "away, back, balderdash, busy, dnd, help, helpme, offline, offline, r9kbeta, raw, say",
      results: [
        [],
        [],
        [],
        ["balderdash", true],
        ["back"],
        [],
        ["help"],
        ["offline"],
        ["offline"],
      ],
    },
    {
      desc: "Conversation with fakeAccount2.",
      conv: {
        account: fakeAccount2,
      },
      cmdlist:
        "away, back, baloney, banana, busy, dnd, help, offline, raw, say",
      results: [
        [],
        [],
        [],
        ["baloney", true],
        ["back"],
        ["help"],
        ["help"],
        ["offline"],
        ["offline"],
      ],
    },
    {
      desc: "MUC with fakeAccount2.",
      conv: {
        account: fakeAccount2,
        isChat: true,
      },
      cmdlist:
        "away, back, baloney, banana, busy, dnd, help, offline, raw, say",
      results: [
        [],
        [],
        [],
        ["baloney", true],
        ["back"],
        ["help"],
        ["help"],
        ["offline"],
        ["offline"],
      ],
    },
  ];

  for (const test of testData) {
    info("The following tests are with: " + test.desc);

    // Check which commands are available in which context.
    const cmdlist = cmdserv
      .listCommandsForConversation(test.conv)
      .map(aCmd => aCmd.name)
      .sort()
      .join(", ");
    Assert.equal(cmdlist, test.cmdlist);

    for (const testCmd of testCmds) {
      info("Testing command found for '" + testCmd + "'");
      const expectedResult = test.results.shift();
      const cmdArray = cmdserv._findCommands(test.conv, testCmd);
      // Check whether commands are only returned when appropriate.
      Assert.equal(cmdArray.length > 0, expectedResult.length > 0);
      if (cmdArray.length) {
        // Check if the right command was returned.
        Assert.equal(cmdArray[0].name, expectedResult[0]);
        Assert.equal(
          cmdArray[0].priority == IMServices.cmd.COMMAND_PRIORITY.PRPL,
          !!expectedResult[1]
        );
      }
    }
  }

  // Array of messages to test command execution of.
  const testMessages = [
    {
      message: "/r9kbeta",
      result: true,
    },
    {
      message: "/helpme 2 arguments",
      result: true,
    },
    {
      message: "nocommand",
      result: false,
    },
    {
      message: "/-a",
      result: false,
    },
    {
      message: "/notregistered",
      result: false,
    },
  ];

  // Test command execution.
  for (const executionTest of testMessages) {
    info("Testing command execution for '" + executionTest.message + "'");
    Assert.equal(
      cmdserv.executeCommand(executionTest.message, fakeConversation),
      executionTest.result
    );
  }

  cmdserv.unInitCommands();
}
