/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * The intent of this file is to show a folder loaded event after a load
 * with a null database.
 */

var { MessageGenerator, SyntheticMessageSet } = ChromeUtils.import(
  "resource://testing-common/mailnews/MessageGenerator.jsm"
);
var { MessageInjection } = ChromeUtils.import(
  "resource://testing-common/mailnews/MessageInjection.jsm"
);
var { PromiseTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/PromiseTestUtils.jsm"
);

var testSubjects = [
  "[Bug 397009] A filter will let me tag, but not untag",
  "Hello, did you receive my bugmail?",
];
var gMsgFile1 = do_get_file("../../../data/bugmail1");
var gMsgFile2 = do_get_file("../../../data/draft1");

var gTargetFolder = null;

add_setup(async function () {
  if (typeof localAccountUtils.inboxFolder == "undefined") {
    localAccountUtils.loadLocalMailAccount();
  }
  localAccountUtils.rootFolder.createSubfolder("target", null);
  gTargetFolder = localAccountUtils.rootFolder.getChildNamed("target");

  const copyListenerFile1 = new PromiseTestUtils.PromiseCopyListener();
  MailServices.copy.copyFileMessage(
    gMsgFile1,
    gTargetFolder,
    null,
    false,
    0,
    "",
    copyListenerFile1,
    null
  );
  await copyListenerFile1.promise;

  const copyListenerFile2 = new PromiseTestUtils.PromiseCopyListener();
  MailServices.copy.copyFileMessage(
    gMsgFile2,
    gTargetFolder,
    null,
    false,
    0,
    "",
    copyListenerFile2,
    null
  );
  await copyListenerFile2.promise;
});

add_task(async function firstUpdate() {
  // Get message headers for the target folder.
  var msgCount = 0;
  for (const hdr of gTargetFolder.msgDatabase.enumerateMessages()) {
    msgCount++;
    Assert.equal(hdr.subject, testSubjects[msgCount - 1]);
  }
  Assert.equal(msgCount, 2);

  const folderAddedListener = PromiseTestUtils.promiseFolderEvent(
    gTargetFolder,
    "FolderLoaded"
  );
  gTargetFolder.updateFolder(null);
  await folderAddedListener;
});

add_task(async function secondUpdate() {
  // If the following executes, the test hangs in bug 787557.
  gTargetFolder.msgDatabase = null;
  const folderAddedListener = PromiseTestUtils.promiseFolderEvent(
    gTargetFolder,
    "FolderLoaded"
  );
  gTargetFolder.updateFolder(null);
  await folderAddedListener;
});
