/*
 * Test that adding nsIFolderListener in js does not cause any crash.
 */

/* import-globals-from ../../../test/resources/logHelper.js */
/* import-globals-from ../../../test/resources/asyncTestUtils.js */
/* import-globals-from ../../../test/resources/messageModifier.js */
/* import-globals-from ../../../test/resources/MessageGenerator.jsm */
/* import-globals-from ../../../test/resources/messageInjection.js */
load("../../../resources/logHelper.js");
load("../../../resources/asyncTestUtils.js");
load("../../../resources/messageModifier.js");
load("../../../resources/MessageGenerator.jsm");
load("../../../resources/messageInjection.js");

var folderListener = {
  OnItemAdded() {},
  OnItemRemoved() {},
  OnItemPropertyChanged() {},
  OnItemIntPropertyChanged() {},
  OnItemBoolPropertyChanged() {},
  OnItemUnicharPropertyChanged() {},
  OnItemPropertyFlagChanged() {},
  OnItemEvent() {},
};

var targetFolder;

var tests = [
  function setup() {
    gMessageGenerator = new MessageGenerator();

    configure_message_injection({ mode: "local" });

    targetFolder = make_empty_folder();
    targetFolder.AddFolderListener(folderListener);
    registerCleanupFunction(function() {
      targetFolder.RemoveFolderListener(folderListener);
    });
  },
  async function create_new_message() {
    make_new_sets_in_folder(targetFolder, [{ count: 1 }]);
    await wait_for_message_injection();
  },
];

function run_test() {
  async_run_tests(tests);
}
