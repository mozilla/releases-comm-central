/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const {interfaces: Ci, utils: Cu} = Components;

Cu.import("resource:///modules/imServices.jsm");
// We don't load the command service via Services as we want to access
// _findCommands in order to avoid having to intercept command execution.
let imCommands = {};
Services.scriptloader.loadSubScript("resource:///components/imCommands.js", imCommands);

const kPrplId = "green";
const kPrplId2 = "red";

const fakeAccount = {
  connected: true,
  protocol: {id: kPrplId}
};
const fakeDisconnectedAccount = {
  connected: false,
  protocol: {id: kPrplId}
};
const fakeAccount2 = {
  connected: true,
  protocol: {id: kPrplId2}
};

function fakeCommand(aName, aUsageContext) {
  this.name = aName;
  if (aUsageContext)
    this.usageContext = aUsageContext;
}
fakeCommand.prototype = {
  get helpString() "",
  usageContext: Ci.imICommand.CMD_CONTEXT_ALL,
  priority: Ci.imICommand.CMD_PRIORITY_PRPL,
  run: (aMsg, aConv) => true
}

function run_test() {
  let cmdserv = new imCommands.CommandsService();
  cmdserv.initCommands();

  // Some commands providing multiple possible completions.
  cmdserv.registerCommand(new fakeCommand("banana"), kPrplId2);
  cmdserv.registerCommand(new fakeCommand("baloney"), kPrplId2);

  // MUC-only command.
  cmdserv.registerCommand(new fakeCommand("balderdash",
                                          Ci.imICommand.CMD_CONTEXT_CHAT),
                          kPrplId);

  // Name clashes with global command.
  cmdserv.registerCommand(new fakeCommand("offline"), kPrplId);

  // Name starts with another command name.
  cmdserv.registerCommand(new fakeCommand("helpme"), kPrplId);

  // Array of (possibly partial) command names as entered by the user.
  let testCmds = ["x", "b", "ba", "bal", "back", "hel", "help", "off", "offline"];

  // We test an array of different possible conversations.
  // cmdlist lists all the available commands for the given conversation.
  // results is an array which for each testCmd provides an array containing
  // data with which the return value of _findCommands can be checked. In
  // particular, the name of the command and whether the first (i.e. preferred)
  // entry in the returned array of commands is a prpl command. (If the latter
  // boolean is not given, false is assumed, if the name is not given, that
  // corresponds to no commmands being returned.)
  let testData = [
    {
      desc: "No conversation argument.",
      cmdlist: "away, back, busy, dnd, help, offline, raw, say",
      results: [[], [], ["back"], [], ["back"], ["help"], ["help"], ["offline"], ["offline"]]
    },
    {
      desc: "Disconnected conversation with fakeAccount.",
      conv: {
        account: fakeDisconnectedAccount
      },
      cmdlist: "away, back, busy, dnd, help, helpme, offline, offline, raw, say",
      results: [[], [], ["back"], [], ["back"], ["help"], ["help"], ["offline"], ["offline"]]
    },
    {
      desc: "Conversation with fakeAccount.",
      conv: {
        account: fakeAccount
      },
      cmdlist: "away, back, busy, dnd, help, helpme, offline, offline, raw, say",
      results: [[], [], ["back"], [], ["back"], [], ["help"], ["offline"], ["offline"]]
    },
    {
      desc: "MUC with fakeAccount.",
      conv: {
        account: fakeAccount,
        isChat: true
      },
      cmdlist: "away, back, balderdash, busy, dnd, help, helpme, offline, offline, raw, say",
      results: [[], [], [], ["balderdash", true], ["back"], [], ["help"], ["offline"], ["offline"]]
    },
    {
      desc: "Conversation with fakeAccount2.",
      conv: {
        account: fakeAccount2
      },
      cmdlist: "away, back, baloney, banana, busy, dnd, help, offline, raw, say",
      results: [[], [], [], ["baloney", true], ["back"], ["help"], ["help"], ["offline"], ["offline"]]
    },
    {
      desc: "MUC with fakeAccount2.",
      conv: {
        account: fakeAccount2,
        isChat: true
      },
      cmdlist: "away, back, baloney, banana, busy, dnd, help, offline, raw, say",
      results: [[], [], [], ["baloney", true], ["back"], ["help"], ["help"], ["offline"], ["offline"]]
    }
  ];

  for (let test of testData) {
    do_print("The following tests are with: " + test.desc);

    // Check which commands are available in which context.
    let cmdlist = cmdserv.listCommandsForConversation(test.conv, {})
                         .map(aCmd => aCmd.name).sort().join(", ");
    do_check_eq(cmdlist, test.cmdlist);

    for (let testCmd of testCmds) {
      do_print("Testing command found for '" + testCmd + "'");
      let expectedResult = test.results.shift();
      let cmdArray = cmdserv._findCommands(test.conv, testCmd);
      // Check whether commands are only returned when appropriate.
      do_check_eq(cmdArray.length > 0, expectedResult.length > 0);
      if (cmdArray.length) {
        // Check if the right command was returned.
        do_check_eq(cmdArray[0].name, expectedResult[0]);
        do_check_eq(cmdArray[0].priority == Ci.imICommand.CMD_PRIORITY_PRPL,
                    !!expectedResult[1]);
      }
    }
  }

  cmdserv.unInitCommands();
}
