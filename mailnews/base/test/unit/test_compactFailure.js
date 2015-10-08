
Components.utils.import("resource:///modules/iteratorUtils.jsm");
Components.utils.import("resource://testing-common/mailnews/MockFactory.js");

load("../../../resources/logHelper.js");
load("../../../resources/asyncTestUtils.js");
load("../../../resources/messageGenerator.js");

Services.prefs.setCharPref("mail.serverDefaultStoreContractID",
                           "@mozilla.org/msgstore/berkeleystore;1");

var gTargetFolder;
var gUuid;

// Allow certain xpcom errors.
logHelperAllowedErrors.push(Cr.NS_ERROR_FILE_IS_LOCKED);
logHelperAllowedErrors.push(Cr.NS_ERROR_FILE_TARGET_DOES_NOT_EXIST);

function LockedFileOutputStream() {
}

LockedFileOutputStream.prototype = {
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIFileOutputStream]),

  init: function(file, ioFlags, perm, behaviorFlags) {
    throw Cr.NS_ERROR_FILE_IS_LOCKED;
  },
}

var MsgDBServiceFailure = {
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIMsgDBService]),

  openMailDBFromFile: function(file, folder, create, leaveInvalidDB) {
    if (folder.name == "ShouldFail")
      throw Cr.NS_ERROR_FILE_TARGET_DOES_NOT_EXIST;
    return this._genuine.openMailDBFromFile(file, folder, create, leaveInvalidDB);
  },

  openFolderDB: function(folder, leaveInvalidDB) {
    return this._genuine.openFolderDB(folder, leaveInvalidDB);
  },
  asyncOpenFolderDB: function(folder, leaveInvalidDB) {
    return this._genuine.asyncOpenFolderDB(folder, leaveInvalidDB);
  },
  openMore: function(db, timeHint) {
    return this._genuine.openMore(db, timeHint);
  },
  createNewDB: function(folder) {
    return this._genuine.createNewDB(folder);
  },
  registerPendingListener: function(folder, listener) {
    this._genuine.registerPendingListener(folder, listener);
  },
  unregisterPendingListener: function(listener) {
    this._genuine.unregisterPendingListener(listener);
  },
  cachedDBForFolder: function(folder) {
    return this._genuine.cachedDBFolder(folder);
  },
  get openDBs() {
    return this._genuine.oenDBs;
  }
}

function setup_output_stream_stub() {
  gUuid = MockFactory.register("@mozilla.org/network/file-output-stream;1",
                              LockedFileOutputStream);
}

function teardown_output_stream_stub() {
  MockFactory.unregister(gUuid);
}

function setup_db_service_mock() {
  gUuid = MockFactory.register("@mozilla.org/msgDatabase/msgDBService;1",
                               MsgDBServiceFailure);
}

function teardown_db_service_mock() {
  MockFactory.unregister(gUuid);
}

function generate_messages() {
  let messageGenerator = new MessageGenerator();
  let scenarioFactory = new MessageScenarioFactory(messageGenerator);
  let messages = [];
  messages = messages.concat(scenarioFactory.directReply(10));
  return messages;
}

function setup_target_folder() {
  gTargetFolder = localAccountUtils.rootFolder.createLocalSubfolder("Target");
  addMessagesToFolder(generate_messages(), gTargetFolder);

  mailTestUtils.updateFolderAndNotify(gTargetFolder, async_driver);
  yield false;
}

function setup_open_failure_folder() {
  gTargetFolder = localAccountUtils.rootFolder.createLocalSubfolder("ShouldFail");
  addMessagesToFolder(generate_messages(), gTargetFolder);

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

function compact_with_exception(expectedException) {
  let compactor = Cc["@mozilla.org/messenger/localfoldercompactor;1"]
                    .createInstance(Ci.nsIMsgFolderCompactor);
  let listener = new AsyncUrlListener(null, function(url, exitCode) {
    do_throw("This listener should not be called back.");
  });
  try {
    compactor.compact(gTargetFolder, false, listener, null);
    do_throw("nsIMsgFolderCompactor.compact did not fail.");
  } catch(ex) {
    do_check_eq(expectedException, ex.result);
  }
}

function test_compact_without_crash() {
  compact_with_exception(Cr.NS_ERROR_FILE_IS_LOCKED);
}

function test_compact_without_failure() {
  compact_with_exception(Cr.NS_ERROR_FILE_TARGET_DOES_NOT_EXIST);
}

var tests = [
  setup_target_folder,
  delete_all_messages,
  setup_output_stream_stub,
  test_compact_without_crash,
  teardown_output_stream_stub,

  setup_open_failure_folder,
  delete_all_messages,
  setup_db_service_mock,
  test_compact_without_failure,
  teardown_db_service_mock,
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
