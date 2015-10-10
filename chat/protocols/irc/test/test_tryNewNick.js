/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

Components.utils.import("resource://gre/modules/Services.jsm");
var irc = {};
Services.scriptloader.loadSubScript("resource:///components/irc.js", irc);

var fakeProto = {
  id: "fake-proto",
  options: {alternateNicks: ""},
  _getOptionDefault: function(aOption) { return this.options[aOption]; }
}

function test_tryNewNick() {
  const testData = {
    "clokep": "clokep1",
    "clokep1": "clokep2",
    "clokep10": "clokep11",
    "clokep0": "clokep1",
    "clokep01": "clokep02",
    "clokep09": "clokep10",

    // Now put a number in the "first part".
    "clo1kep": "clo1kep1",
    "clo1kep1": "clo1kep2",
    "clo1kep10": "clo1kep11",
    "clo1kep0": "clo1kep1",
    "clo1kep01": "clo1kep02",
    "clo1kep09": "clo1kep10"
  };

  let account = new irc.ircAccount(fakeProto,
                                   {name: "clokep@instantbird.org"});
  account.LOG = function(aStr) {};
  account.normalize = aStr => aStr;

  for (let currentNick in testData) {
    account._sentNickname = currentNick;
    account.sendMessage = (aCommand, aNewNick) =>
      do_check_eq(aNewNick, testData[currentNick]);

    account.tryNewNick(currentNick);
  }

  run_next_test();
}

// This tests a bunch of cases near the max length by maintaining the state
// through a series of test nicks.
function test_maxLength() {
  let testData = [
    // First try adding a digit, as normal.
    ["abcdefghi", "abcdefghi1"],
    // The "received" nick back will now be the same though, so it was too long.
    ["abcdefghi", "abcdefgh1"],
    // And just ensure we're iterating properly.
    ["abcdefgh1", "abcdefgh2"],
    ["abcdefgh2", "abcdefgh3"],
    ["abcdefgh3", "abcdefgh4"],
    ["abcdefgh4", "abcdefgh5"],
    ["abcdefgh5", "abcdefgh6"],
    ["abcdefgh6", "abcdefgh7"],
    ["abcdefgh7", "abcdefgh8"],
    ["abcdefgh8", "abcdefgh9"],
    ["abcdefgh9", "abcdefgh10"],
    ["abcdefgh1", "abcdefg10"],
    ["abcdefg10", "abcdefg11"],
    ["abcdefg99", "abcdefg100"],
    ["abcdefg10", "abcdef100"],
    ["a99999999", "a100000000"],
    ["a10000000", "a00000000"]
  ];

  let account = new irc.ircAccount(fakeProto,
                                   {name: "clokep@instantbird.org"});
  account.LOG = function(aStr) {};
  account._sentNickname = "abcdefghi";
  account.normalize = aStr => aStr;

  for (let currentNick of testData) {
    account.sendMessage = (aCommand, aNewNick) =>
      do_check_eq(aNewNick, currentNick[1]);

    account.tryNewNick(currentNick[0]);
  }

  run_next_test();
}

function test_altNicks() {
  const altNicks = ["clokep_", "clokep|"];
  const testData = {
    // Test account nick.
    "clokep": [altNicks, "clokep_"],
    // Test first element in list.
    "clokep_": [altNicks, "clokep|"],
    // Test last element in list.
    "clokep|": [altNicks, "clokep|1"],
    // Test element not in list with number at end.
    "clokep1": [altNicks, "clokep2"],

    // Test messy alternatives.
    "clokep[": [" clokep ,\n clokep111,,,\tclokep[, clokep_", "clokep_"]
  };

  let account = new irc.ircAccount(fakeProto,
                                   {name: "clokep@instantbird.org"});
  account.LOG = function(aStr) {};
  account.normalize = aStr => aStr;

  for (let currentNick in testData) {
    // Only one pref is touched in here, override the default to return
    // what this test needs.
    account.getString = function(aStr) {
      let data = testData[currentNick][0];
      if (Array.isArray(data))
        return data.join(",");
      return data;
    };
    account._sentNickname = currentNick;

    account.sendMessage = (aCommand, aNewNick) =>
      do_check_eq(aNewNick, testData[currentNick][1]);

    account.tryNewNick(currentNick);
  }

  run_next_test();
}

function run_test() {
  add_test(test_tryNewNick);
  add_test(test_maxLength);
  add_test(test_altNicks);

  run_next_test();
}
