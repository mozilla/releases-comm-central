/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { MockRegistrar } = ChromeUtils.importESModule(
  "resource://testing-common/MockRegistrar.sys.mjs"
);

/* import-globals-from ../../../test/resources/logHelper.js */
load("../../../resources/logHelper.js");
var { addMessagesToFolder, MessageGenerator, MessageScenarioFactory } =
  ChromeUtils.import("resource://testing-common/mailnews/MessageGenerator.jsm");
var { MessageInjection } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageInjection.sys.mjs"
);
var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

Services.prefs.setCharPref(
  "mail.serverDefaultStoreContractID",
  "@mozilla.org/msgstore/berkeleystore;1"
);

var gTargetFolder;
var gCid;

// Allow certain xpcom errors.
logHelperAllowedErrors.push("NS_ERROR_FILE_NOT_FOUND");

var MsgDBServiceFailure = {
  QueryInterface: ChromeUtils.generateQI(["nsIMsgDBService"]),

  openMailDBFromFile(file, folder, create, leaveInvalidDB) {
    if (folder.name == "ShouldFail") {
      throw Components.Exception("", Cr.NS_ERROR_FILE_NOT_FOUND);
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
  const messageGenerator = new MessageGenerator();
  const scenarioFactory = new MessageScenarioFactory(messageGenerator);
  let messages = [];
  messages = messages.concat(scenarioFactory.directReply(10));
  return messages;
}

async function compact_with_exception(expectedException) {
  const compactor = Cc[
    "@mozilla.org/messenger/foldercompactor;1"
  ].createInstance(Ci.nsIMsgFolderCompactor);
  const listener = new PromiseTestUtils.PromiseUrlListener();
  compactor.compactFolders([gTargetFolder], listener, null);
  try {
    await listener.promise;
    do_throw(
      "nsIMsgFolderCompactor listener wasn't called with a failure code."
    );
  } catch (failureCode) {
    Assert.equal(expectedException, failureCode);
  }
}

function create_local_folders() {
  const rootFolder = localAccountUtils.rootFolder;
  const localTrashFolder = rootFolder.getChildNamed("Trash");
  localTrashFolder.setFlag(Ci.nsMsgFolderFlags.Trash);
}

async function delete_all_messages() {
  const promiseCopyListener = new PromiseTestUtils.PromiseCopyListener();
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

add_setup(function () {
  localAccountUtils.loadLocalMailAccount();
  create_local_folders();
});

add_task(async function test_compact_without_failure() {
  // Setup open failure folder.
  gTargetFolder =
    localAccountUtils.rootFolder.createLocalSubfolder("ShouldFail");
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
  await compact_with_exception(Cr.NS_ERROR_FILE_NOT_FOUND);
  // Teardown db service mock.
  MockRegistrar.unregister(gCid);
});
