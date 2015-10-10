/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

Components.utils.import("resource://gre/modules/Services.jsm");
var skype = {};
Services.scriptloader.loadSubScript("resource:///components/skype.js", skype);

var data = {
  "1416264993": "3a33ac47fe2ec1a33d569f4be5c69ddc",
  "1416387358": "eca9716e1eedcbe93320ba794cea3388",
  "1416392361": "2ed6fc80c3303caa137ae3fd4fcc7d80"
};

function run_test() {
  add_test(test_MagicSha256);

  run_next_test();
}

function test_MagicSha256() {
  for (let input in data)
    equal(data[input], skype.magicSha256(input));

  run_next_test();
}
