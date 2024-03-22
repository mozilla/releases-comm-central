/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test of message database validity on local copy from bug 471682. What
 * we want to do here is to copy a couple of message to a new folder, and
 * then compare the date and filesize of the folder file with the
 * stored result in dbfolderinfo. If they don't match, that's bad.
 */
var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

var bugmail1 = do_get_file("../../../data/bugmail1");
var gHdr; // header of test message in local folder

localAccountUtils.loadLocalMailAccount();
// create a subfolder as a target for copies
var gSubfolder =
  localAccountUtils.inboxFolder.createLocalSubfolder("subfolder");

function run_test() {
  // make sure we're using berkeley mailbox format here since this test
  // assumes berkeley mailbox format.
  if (
    Services.prefs.getCharPref("mail.serverDefaultStoreContractID") !=
    "@mozilla.org/msgstore/berkeleystore;1"
  ) {
    return;
  }

  do_test_pending();
  // step 1: copy a message into the local inbox
  MailServices.copy.copyFileMessage(
    bugmail1,
    localAccountUtils.inboxFolder,
    null,
    false,
    0,
    "",
    step2,
    null
  );
}

// step 2: copy one message into a subfolder to establish an
//         mbox file time and size
// nsIMsgCopyServiceListener implementation
var step2 = {
  OnStartCopy() {},
  OnProgress() {},
  SetMessageKey(aKey) {
    dump("in set message key\n");
    gHdr = localAccountUtils.inboxFolder.GetMessageHeader(aKey);
  },
  SetMessageId() {},
  OnStopCopy() {
    Assert.notEqual(gHdr, null);
    // copy the message into the subfolder
    MailServices.copy.copyMessages(
      localAccountUtils.inboxFolder,
      [gHdr],
      gSubfolder,
      false,
      step3,
      null,
      false
    );
  },
};

// step 3: after the copy, delay to allow copy to complete and allow possible
//         file error time
// nsIMsgCopyServiceListener implementation
var step3 = {
  OnStartCopy() {},
  OnProgress() {},
  SetMessageKey() {},
  SetMessageId() {},
  OnStopCopy() {
    do_timeout(2000, step4);
  },
};

// step 4: start a second copy
function step4() {
  MailServices.copy.copyMessages(
    localAccountUtils.inboxFolder,
    [gHdr],
    gSubfolder,
    false,
    step5,
    null,
    false
  );
}

// step 5:  actual tests of file size and date
// nsIMsgCopyServiceListener implementation
var step5 = {
  OnStartCopy() {},
  OnProgress() {},
  SetMessageKey() {},
  SetMessageId() {},
  OnStopCopy() {
    var dbSize = gSubfolder.msgDatabase.dBFolderInfo.folderSize;
    var dbDate = gSubfolder.msgDatabase.dBFolderInfo.folderDate;
    var filePath = gSubfolder.filePath;
    var date = parseInt(filePath.lastModifiedTime / 1000);
    var size = filePath.fileSize;
    Assert.equal(size, dbSize);
    Assert.equal(date, dbDate);
    // End of test, so release our header reference
    gHdr = null;
    do_test_finished();
  },
};
