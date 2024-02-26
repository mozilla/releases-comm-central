/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * This file tests copies of multiple messages using filters
 * from incoming POP3, with filter actions copying and moving
 * messages to an IMAP folder, when the POP3 message uses
 * quarantining to help antivirus software. See bug 387361.
 *
 */

var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

Services.prefs.setCharPref(
  "mail.serverDefaultStoreContractID",
  "@mozilla.org/msgstore/berkeleystore;1"
);

/* import-globals-from ../../../test/resources/POP3pump.js */
load("../../../resources/POP3pump.js");

var gSubfolder;

add_setup(function () {
  setupIMAPPump();
  // quarantine messages
  Services.prefs.setBoolPref("mailnews.downloadToTempFile", true);
});

add_task(async function createSubfolder() {
  const folderAddedListener = PromiseTestUtils.promiseFolderAdded("subfolder");
  IMAPPump.incomingServer.rootFolder.createSubfolder("subfolder", null);
  await folderAddedListener;
  gSubfolder = IMAPPump.incomingServer.rootFolder.getChildNamed("subfolder");
  Assert.ok(gSubfolder instanceof Ci.nsIMsgImapMailFolder);
  const listener = new PromiseTestUtils.PromiseUrlListener();
  gSubfolder.updateFolderWithListener(null, listener);
  await listener.promise;
});

add_task(async function getLocalMessages() {
  // setup copy then move mail filters on the inbox
  const filterList = gPOP3Pump.fakeServer.getFilterList(null);
  const filter = filterList.createFilter("copyThenMoveAll");
  const searchTerm = filter.createTerm();
  searchTerm.matchAll = true;
  filter.appendTerm(searchTerm);
  const copyAction = filter.createAction();
  copyAction.type = Ci.nsMsgFilterAction.CopyToFolder;
  copyAction.targetFolderUri = gSubfolder.URI;
  filter.appendAction(copyAction);
  filter.enabled = true;
  filterList.insertFilterAt(0, filter);

  let resolveDone;
  const promise = new Promise(resolve => {
    resolveDone = resolve;
  });
  gPOP3Pump.files = ["../../../data/bugmail1"];
  gPOP3Pump.onDone = resolveDone;
  gPOP3Pump.run();
  await promise;
});

add_task(async function updateSubfolderAndTest() {
  const listener = new PromiseTestUtils.PromiseUrlListener();
  const folderLoaded = PromiseTestUtils.promiseFolderEvent(
    gSubfolder,
    "FolderLoaded"
  );
  gSubfolder.updateFolderWithListener(null, listener);
  await listener.promise;
  await folderLoaded;

  Assert.equal(folderCount(gSubfolder), 1);
  Assert.equal(folderCount(localAccountUtils.inboxFolder), 1);
});

add_task(async function get2Messages() {
  let resolveDone;
  const promise = new Promise(resolve => {
    resolveDone = resolve;
  });
  gPOP3Pump.files = ["../../../data/bugmail10", "../../../data/draft1"];
  gPOP3Pump.onDone = resolveDone;
  gPOP3Pump.run();
  await promise;
});

add_task(async function updateSubfolderAndTest2() {
  const listener = new PromiseTestUtils.PromiseUrlListener();
  const folderLoaded = PromiseTestUtils.promiseFolderEvent(
    gSubfolder,
    "FolderLoaded"
  );
  gSubfolder.updateFolderWithListener(null, listener);
  await listener.promise;
  await folderLoaded;
  Assert.equal(folderCount(gSubfolder), 3);
  Assert.equal(folderCount(localAccountUtils.inboxFolder), 3);
});

add_task(function endTest() {
  // Cleanup, null out everything, close all cached connections and stop the
  // server
  gPOP3Pump = null;
  teardownIMAPPump();
});

// helper functions

// count of messages in a folder, using the database
function folderCount(folder) {
  return [...folder.msgDatabase.enumerateMessages()].length;
}
