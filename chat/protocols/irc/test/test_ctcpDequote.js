/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

Components.utils.import("resource://gre/modules/Services.jsm");
var ircCTCP = {};
Services.scriptloader.loadSubScript("resource:///modules/ircCTCP.jsm", ircCTCP);

var input = [
  "ACTION",
  "ACTION test",
  "ACTION \x5Ctest",
  "ACTION te\x5Cst",
  "ACTION test\x5C",
  "ACTION \x5C\x5Ctest",
  "ACTION te\x5C\x5Cst",
  "ACTION test\x5C\x5C",
  "ACTION \x5C\x5C\x5Ctest",
  "ACTION te\x5C\x5C\x5Cst",
  "ACTION test\x5C\x5C\x5C",
  "ACTION \x5Catest",
  "ACTION te\x5Cast",
  "ACTION test\x5Ca",
  "ACTION \x5C\x5C\x5Catest",
  "ACTION \x5C\x5Catest"
];

var expectedOutputCommand = "ACTION";

var expectedOutputParam = [
  "",
  "test",
  "test",
  "test",
  "test",
  "\x5Ctest",
  "te\x5Cst",
  "test\x5C",
  "\x5Ctest",
  "te\x5Cst",
  "test\x5C",
  "\x01test",
  "te\x01st",
  "test\x01",
  "\x5C\x01test",
  "\x5Catest"
];

function run_test() {
  let output = input.map(aStr => ircCTCP.CTCPMessage({}, aStr));
  // Ensure both arrays have the same length.
  do_check_eq(expectedOutputParam.length, output.length);
  // Ensure the values in the arrays are equal.
  for (let i = 0; i < output.length; ++i) {
    do_check_eq(expectedOutputParam[i], output[i].ctcp.param);
    do_check_eq(expectedOutputCommand, output[i].ctcp.command);
  }
}
