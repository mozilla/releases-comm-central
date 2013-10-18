/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

Components.utils.import("resource://gre/modules/Services.jsm");
let irc = {};
Services.scriptloader.loadSubScript("resource:///components/irc.js", irc);

const fakeProto = {
  id: "fake-proto",
  options: {alternateNicks: ""},
  _getOptionDefault: function(aOption) this.options[aOption]
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
    "clo1kep09": "clo1kep10",

    // Some to test the max length.
    "abcdefghi": "abcdefgh1",
    "abcdefgh0": "abcdefgh1",
    "abcdefgh9": "abcdefg10",
    "a99999999": "a00000000" // You'd expect 100000000, but this is not valid!
  };

  let account = new irc.ircAccount(fakeProto,
                                   {name: "clokep@instantbird.org"});
  account.LOG = function(aStr) {};
  account.maxNicknameLength = 9;
  account.normalize = function(aStr) aStr;

  for (let currentNick in testData) {
    account.sendMessage = function(aCommand, aNewNick)
      do_check_eq(aNewNick, testData[currentNick]);

    account.tryNewNick(currentNick);
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
  account.maxNicknameLength = 9;
  account.normalize = function(aStr) aStr;

  for (let currentNick in testData) {
    // Only one pref is touched in here, override the default to return
    // what this test needs.
    account.getString = function(aStr) {
      let data = testData[currentNick][0];
      if (Array.isArray(data))
        return data.join(",");
      return data;
    };

    account.sendMessage = function(aCommand, aNewNick)
      do_check_eq(aNewNick, testData[currentNick][1]);

    account.tryNewNick(currentNick);
  }

  run_next_test();
}

function run_test() {
  add_test(test_tryNewNick);
  add_test(test_altNicks);

  run_next_test();
}
