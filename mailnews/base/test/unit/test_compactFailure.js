
Components.utils.import("resource:///modules/iteratorUtils.jsm");
Components.utils.import("resource://testing-common/mailnews/MockFactory.js");

load("../../../resources/logHelper.js");
load("../../../resources/asyncTestUtils.js");
load("../../../resources/messageGenerator.js");

Services.prefs.setCharPref("mail.serverDefaultStoreContractID",
                           "@mozilla.org/msgstore/berkeleystore;1");

let gTargetFolder;
let gUuid;

function LockedFileOutputStream() {
}

LockedFileOutputStream.prototype = {
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIFileOutputStream]),

  init: function(file, ioFlags, perm, behaviorFlags) {
    throw Cr.NS_ERROR_FILE_IS_LOCKED;
  },
}

function setup_output_stream_stub() {
  gUuid = MockFactory.register("@mozilla.org/network/file-output-stream;1",
                              LockedFileOutputStream);
}

function teardown_output_stream_stub() {
  MockFactory.unregister(gUuid);
}

function setup_target_folder() {
  let messageGenerator = new MessageGenerator();
  let scenarioFactory = new MessageScenarioFactory(messageGenerator);
  let messages = [];
  messages = messages.concat(scenarioFactory.directReply(10));

  gTargetFolder = localAccountUtils.rootFolder.createLocalSubfolder("Target");
  addMessagesToFolder(messages, gTargetFolder);

  mailTestUtils.updateFolderAndNotify(gTargetFolder, async_driver);
  yield false;
}

function delete_all_messages() {
  let enumerator = gTargetFolder.messages;
  let headers = [];
  while (enumerator.hasMoreElements())
    headers.push(enumerator.getNext().QueryInterface(Ci.nsIMsgDBHdr));

  let array = toXPCOMArray(headers, Ci.nsIMutableArray);

  gTargetFolder.deleteMessages(array, null, false, true, asyncCopyListener, false);
  yield false;
}

function test_compact_without_crash() {
  let compactor = Cc["@mozilla.org/messenger/localfoldercompactor;1"]
                    .createInstance(Ci.nsIMsgFolderCompactor);
  let listener = new AsyncUrlListener(null, function(url, exitCode) {
    do_throw("This listener should not be called back.");
  });
  try {
    compactor.compact(gTargetFolder, false, listener, null);
    do_throw("nsIMsgFolderCompactor.compact did not fail.");
  } catch(ex) {
    do_check_eq(Cr.NS_ERROR_FILE_IS_LOCKED, ex.result);
  }
}

var tests = [
  setup_target_folder,
  delete_all_messages,
  setup_output_stream_stub,
  test_compact_without_crash,
  teardown_output_stream_stub,
];

function create_local_folders() {
  let rootFolder = localAccountUtils.rootFolder;
  let localTrashFolder = rootFolder.getChildNamed("Trash");
  localTrashFolder.setFlag(Ci.nsMsgFolderFlags.Trash);
}

function run_test() {
  localAccountUtils.loadLocalMailAccount();
  create_local_folders();

  async_run_tests(tests);
}

