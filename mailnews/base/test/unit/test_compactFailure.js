/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { MockRegistrar } = ChromeUtils.import(
  "resource://testing-common/MockRegistrar.jsm"
);

/* import-globals-from ../../../test/resources/logHelper.js */
load("../../../resources/logHelper.js");
var {
  addMessagesToFolder,
  MessageGenerator,
  MessageScenarioFactory,
} = ChromeUtils.import(
  "resource://testing-common/mailnews/MessageGenerator.jsm"
);
var { MessageInjection } = ChromeUtils.import(
  "resource://testing-common/mailnews/MessageInjection.jsm"
);
var { PromiseTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/PromiseTestUtils.jsm"
);

Services.prefs.setCharPref(
  "mail.serverDefaultStoreContractID",
  "@mozilla.org/msgstore/berkeleystore;1"
);

var gTargetFolder;
var gCid;

// Allow certain xpcom errors.
logHelperAllowedErrors.push("NS_ERROR_FILE_IS_LOCKED");
logHelperAllowedErrors.push("NS_ERROR_FILE_TARGET_DOES_NOT_EXIST");

function LockedFileOutputStream() {}

LockedFileOutputStream.prototype = {
  QueryInterface: ChromeUtils.generateQI(["nsIFileOutputStream"]),

  init(file, ioFlags, perm, behaviorFlags) {
    throw Components.Exception("", Cr.NS_ERROR_FILE_IS_LOCKED);
  },
};

var MsgDBServiceFailure = {
  QueryInterface: ChromeUtils.generateQI(["nsIMsgDBService"]),

  openMailDBFromFile(file, folder, create, leaveInvalidDB) {
    if (folder.name == "ShouldFail") {
      throw Components.Exception("", Cr.NS_ERROR_FILE_TARGET_DOES_NOT_EXIST);
    }
    return this._genuine.openMailDBFromFile(
      file,
      folder,
      create,
      leaveInvalidDB
    );
  },

  openFolderDB(folder, leaveInvalidDB) {
    return this._genuine.openFolderDB(folder, leaveInvalidDB);
  },
  asyncOpenFolderDB(folder, leaveInvalidDB) {
    return this._genuine.asyncOpenFolderDB(folder, leaveInvalidDB);
  },
  openMore(db, timeHint) {
    return this._genuine.openMore(db, timeHint);
  },
  createNewDB(folder) {
    return this._genuine.createNewDB(folder);
  },
  registerPendingListener(folder, listener) {
    this._genuine.registerPendingListener(folder, listener);
  },
  unregisterPendingListener(listener) {
    this._genuine.unregisterPendingListener(listener);
  },
  cachedDBForFolder(folder) {
    return this._genuine.cachedDBFolder(folder);
  },
  get openDBs() {
    return this._genuine.openDBs;
  },
};

function generate_messages() {
  let messageGenerator = new MessageGenerator();
  let scenarioFactory = new MessageScenarioFactory(messageGenerator);
  let messages = [];
  messages = messages.concat(scenarioFactory.directReply(10));
  return messages;
}

async function compact_with_exception(expectedException) {
  let compactor = Cc[
    "@mozilla.org/messenger/localfoldercompactor;1"
  ].createInstance(Ci.nsIMsgFolderCompactor);
  let listener = new PromiseTestUtils.PromiseUrlListener({
    OnStopRunningUrl: (url, exitCode) => {
      do_throw("This listener should not be called back.");
    },
  });
  try {
    compactor.compact(gTargetFolder, false, listener, null);
    await listener.promise;
    do_throw("nsIMsgFolderCompactor.compact did not fail.");
  } catch (ex) {
    Assert.equal(expectedException, ex.result);
  }
}

function create_local_folders() {
  let rootFolder = localAccountUtils.rootFolder;
  let localTrashFolder = rootFolder.getChildNamed("Trash");
  localTrashFolder.setFlag(Ci.nsMsgFolderFlags.Trash);
}

async function delete_all_messages() {
  let promiseCopyListener = new PromiseTestUtils.PromiseCopyListener();
  gTargetFolder.deleteMessages(
    [...gTargetFolder.messages],
    null,
    false, // Do not delete storage.
    true, // Is a move.
    promiseCopyListener,
    false // Do not allow undo, currently leaks.
  );
  await promiseCopyListener.promise;
}

add_task(function setup_test() {
  localAccountUtils.loadLocalMailAccount();
  create_local_folders();
});

add_task(async function test_compact_without_crash() {
  // Setup target folder.
  gTargetFolder = localAccountUtils.rootFolder.createLocalSubfolder("Target");
  addMessagesToFolder(generate_messages(), gTargetFolder);

  await new Promise(resolve => {
    mailTestUtils.updateFolderAndNotify(gTargetFolder, resolve);
  });
  // Delete messages.
  await delete_all_messages();
  // Setup output stream stub.
  gCid = MockRegistrar.register(
    "@mozilla.org/network/file-output-stream;1",
    LockedFileOutputStream
  );
  // Test compact without crash.
  await compact_with_exception(Cr.NS_ERROR_FILE_IS_LOCKED);
  // Teardown output stream stub.
  MockRegistrar.unregister(gCid);
});

add_task(async function test_compact_without_failure() {
  // Setup open failure folder.
  gTargetFolder = localAccountUtils.rootFolder.createLocalSubfolder(
    "ShouldFail"
  );
  addMessagesToFolder(generate_messages(), gTargetFolder);

  await new Promise(resolve => {
    mailTestUtils.updateFolderAndNotify(gTargetFolder, resolve);
  });
  // Delete messages.
  await delete_all_messages();
  // Setup db service mock.
  gCid = MockRegistrar.register(
    "@mozilla.org/msgDatabase/msgDBService;1",
    MsgDBServiceFailure
  );
  // Test compact without failure.
  await compact_with_exception(Cr.NS_ERROR_FILE_TARGET_DOES_NOT_EXIST);
  // Teardown db service mock.
  MockRegistrar.unregister(gCid);
});
