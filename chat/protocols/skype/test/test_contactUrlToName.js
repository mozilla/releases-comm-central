/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

Components.utils.import("resource://gre/modules/Services.jsm");
var skype = {};
Services.scriptloader.loadSubScript("resource:///components/skype.js", skype);

var data = {
  "https://bay-client-s.gateway.messenger.live.com/v1/users/ME/contacts/8:clokep":
    "clokep",
  "https://bay-client-s.gateway.messenger.live.com/v1/users/8:clokep/presenceDocs/messagingService":
    "clokep"
};

function run_test() {
  add_test(test_contactUrlToName);

  run_next_test();
}

function test_contactUrlToName() {
  for (let input in data)
    equal(data[input], skype.contactUrlToName(input));

  run_next_test();
}
