/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

ChromeUtils.import("resource://gre/modules/FileUtils.jsm");
ChromeUtils.import("resource://gre/modules/osfile.jsm");
ChromeUtils.import("resource://testing-common/mailnews/PromiseTestUtils.jsm");
ChromeUtils.import("resource:///modules/mailstoreConverter.jsm");
ChromeUtils.import("resource://gre/modules/Log.jsm");

var log = Log.repository.getLogger("MailStoreConverter");
Services.prefs.setCharPref("mail.serverDefaultStoreContractID",
                           "@mozilla.org/msgstore/berkeleystore;1");

var gMsgHdrs = [];
// {nsIMsgLocalMailFolder} folder carrying messages for the pop server.
var gInbox;

// {nsIMsgAccount} Account to convert.
var gAccount;
// Server for the account to convert.
var gServer;

var copyListenerWrap = {
  SetMessageKey: function(aKey) {
    let hdr = gInbox.GetMessageHeader(aKey);
    gMsgHdrs.push({hdr: hdr, ID: hdr.messageId});
  },
  OnStopCopy: function(aStatus) {
    // Check: message successfully copied.
    Assert.equal(aStatus, 0);
  }
};

var EventTarget = function () {
  this.dispatchEvent = function(aEvent) {
    if (aEvent.type == "progress") {
      log.trace("Progress: " + aEvent.detail);
    }
  };
};

function copyFileMessage(aFile, aDestFolder, aIsDraftOrTemplate)
{
  let listener = new PromiseTestUtils.PromiseCopyListener(copyListenerWrap);
  MailServices.copy.CopyFileMessage(aFile, aDestFolder, null, aIsDraftOrTemplate,
                                    0, "", listener, null);
  return listener.promise;
}

/**
 * Check that conversion worked for the given source.
 * @param aSource - mbox source directory
 * @param aTarget - maildir target directory
 */
function checkConversion(aSource, aTarget) {
  let sourceContents = aSource.directoryEntries;

  while (sourceContents.hasMoreElements()) {
    let sourceContent = sourceContents.getNext().QueryInterface(Ci.nsIFile);
    let sourceContentName = sourceContent.leafName;
    let ext = sourceContentName.substr(-4);
    let targetFile = FileUtils.File(OS.Path.join(aTarget.path,sourceContentName));
    log.debug("Checking path: " + targetFile.path);
    if (ext == ".dat") {
      Assert.ok(targetFile.exists());
    } else if (sourceContent.isDirectory()) {
      Assert.ok(targetFile.exists());
      checkConversion(sourceContent, targetFile);
    } else if (ext != ".msf") {
      Assert.ok(targetFile.exists());
      let cur = FileUtils.File(OS.Path.join(targetFile.path,"cur"));
      Assert.ok(cur.exists());
      let tmp = FileUtils.File(OS.Path.join(targetFile.path,"tmp"));
      Assert.ok(tmp.exists());
      if (targetFile.leafName == "Inbox") {
        let curContents = cur.directoryEntries;
        let curContentsCount = 0;
        while (curContents.hasMoreElements()) {
          let curContent = curContents.getNext();
          curContentsCount++;
        }
        // We had 1000 msgs in the old folder. We should have that after
        // conversion too.
        Assert.equal(curContentsCount, 1000);
      }
    }
  }
}

function run_test() {
  localAccountUtils.loadLocalMailAccount();

  // {nsIMsgIncomingServer} pop server for the test.
  gServer = MailServices.accounts.createIncomingServer("test","localhost",
                                                       "pop3");
  gAccount = MailServices.accounts.createAccount();
  gAccount.incomingServer = gServer;
  gServer.QueryInterface(Ci.nsIPop3IncomingServer);
  gServer.valid = true;

  gInbox = gAccount.incomingServer.rootFolder
    .getFolderWithFlags(Ci.nsMsgFolderFlags.Inbox);

  run_next_test();
}

add_task(async function setupMessages() {
  let msgFile = do_get_file("../../../data/bugmail10");

  // Add 1000 messages to the "Inbox" folder.
  for (let i = 0; i < 1000; i++) {
    await copyFileMessage(msgFile, gInbox, false);
  }
});

add_task(function testMaildirConversion() {
  let mailstoreContractId = Services.prefs.getCharPref(
    "mail.server." + gServer.key + ".storeContractID");
  do_test_pending();
  let pConverted = convertMailStoreTo(mailstoreContractId, gServer,
                                      new EventTarget());
  let originalRootFolder = gServer.rootFolder.filePath;
  pConverted.then(function(aVal) {
    log.debug("Conversion done: " + originalRootFolder.path + " => " + aVal);
    let newRootFolder = gServer.rootFolder.filePath;
    checkConversion(originalRootFolder, newRootFolder);
    do_test_finished();
  }).catch(function(aReason) {
    log.error("Conversion Failed: " + aReason.error);
    ok(false); // Fail the test!
  });
});
