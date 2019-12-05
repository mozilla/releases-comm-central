/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var irc = {};
Services.scriptloader.loadSubScript("resource:///modules/irc.jsm", irc);

var input = [
  undefined,
  "test",
  "\\test",
  "te\\st",
  "test\\",
  "\\\\test",
  "te\\\\st",
  "test\\\\",
  "\\\\\\test",
  "te\\\\\\st",
  "test\\\\\\",
  "\x01test",
  "te\x01st",
  "test\x01",
  "\\\\\x01test",
  "\\\\atest",
];

var expectedOutputParams = [
  "ACTION",
  "ACTION test",
  "ACTION \\\\test",
  "ACTION te\\\\st",
  "ACTION test\\\\",
  "ACTION \\\\\\\\test",
  "ACTION te\\\\\\\\st",
  "ACTION test\\\\\\\\",
  "ACTION \\\\\\\\\\\\test",
  "ACTION te\\\\\\\\\\\\st",
  "ACTION test\\\\\\\\\\\\",
  "ACTION \\atest",
  "ACTION te\\ast",
  "ACTION test\\a",
  "ACTION \\\\\\\\\\atest",
  "ACTION \\\\\\\\atest",
];

var outputParams = [];

irc.ircAccount.prototype.sendMessage = function(aCommand, aParams) {
  equal("PRIVMSG", aCommand);
  outputParams.push(aParams[1]);
};

function run_test() {
  input.map(aStr =>
    irc.ircAccount.prototype.sendCTCPMessage("", false, "ACTION", aStr)
  );

  // Ensure both arrays have the same length.
  equal(expectedOutputParams.length, outputParams.length);
  // Ensure the values in the arrays are equal.
  for (let i = 0; i < outputParams.length; ++i) {
    equal("\x01" + expectedOutputParams[i] + "\x01", outputParams[i]);
  }
}
