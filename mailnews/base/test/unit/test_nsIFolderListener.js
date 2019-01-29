/*
 * Test that adding nsIFolderListener in js does not cause any crash.
 */

var {MailServices} = ChromeUtils.import("resource:///modules/MailServices.jsm");
load("../../../resources/logHelper.js");
load("../../../resources/asyncTestUtils.js");
load("../../../resources/messageModifier.js");
load("../../../resources/messageGenerator.js");
load("../../../resources/messageInjection.js");

var folderListener = {
  OnItemAdded: function() {},
  OnItemRemoved: function() {},
  OnItemPropertyChanged: function() {},
  OnItemIntPropertyChanged: function() {},
  OnItemBoolPropertyChanged: function() {},
  OnItemUnicharPropertyChanged: function() {},
  OnItemPropertyFlagChanged: function() {},
  OnItemEvent: function() {},
}

var targetFolder;

var tests = [
  function setup() {
    gMessageGenerator = new MessageGenerator();

    configure_message_injection({mode: "local"});

    targetFolder = make_empty_folder();
    targetFolder.AddFolderListener(folderListener);
    registerCleanupFunction(function() {
      targetFolder.RemoveFolderListener(folderListener);
    });
  },
  async function create_new_message() {
    let [msgSet] = make_new_sets_in_folder(targetFolder, [{count: 1}]);
    await wait_for_message_injection();
  }
];

function run_test() {
  async_run_tests(tests);
}
