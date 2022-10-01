/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

var { CTCPMessage } = ChromeUtils.importESModule(
  "resource:///modules/ircCTCP.sys.mjs"
);

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
  "ACTION \x5C\x5Catest",
];

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
  "\x5Catest",
];

function run_test() {
  let output = input.map(aStr => CTCPMessage({}, aStr));
  // Ensure both arrays have the same length.
  equal(expectedOutputParam.length, output.length);
  // Ensure the values in the arrays are equal.
  for (let i = 0; i < output.length; ++i) {
    equal(expectedOutputParam[i], output[i].ctcp.param);
    equal("ACTION", output[i].ctcp.command);
  }
}
