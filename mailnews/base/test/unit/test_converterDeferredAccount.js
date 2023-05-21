/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { FileUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/FileUtils.sys.mjs"
);
const { PromiseTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/PromiseTestUtils.jsm"
);
var { convertMailStoreTo } = ChromeUtils.import(
  "resource:///modules/mailstoreConverter.jsm"
);
const { FolderUtils } = ChromeUtils.import(
  "resource:///modules/FolderUtils.jsm"
);

// XXX: merge into test_converter.js

var log = console.createInstance({
  prefix: "mail.mailstoreconverter",
  maxLogLevel: "Warn",
  maxLogLevelPref: "mail.mailstoreconverter.loglevel",
});

Services.prefs.setCharPref(
  "mail.serverDefaultStoreContractID",
  "@mozilla.org/msgstore/berkeleystore;1"
);

// No. of messages/files and folders copied.
var gMsgHdrs = [];
// {nsIMsgLocalMailFolder} folder carrying messages for the pop server.
var gInbox;
// {nsIMsgIncomingServer} server for first deferred pop account.
var gServer1;
// {nsIMsgIncomingServer} server for second deferred pop account.
var gServer2;
// {nsIMsgIncomingServer} server to convert.
var gServer;

var copyListenerWrap = {
  SetMessageKey(aKey) {
    let hdr = gInbox.GetMessageHeader(aKey);
    gMsgHdrs.push({ hdr, ID: hdr.messageId });
  },
  OnStopCopy(aStatus) {
    // Check: message successfully copied.
    Assert.equal(aStatus, 0);
  },
};

var EventTarget = function () {
  this.dispatchEvent = function (event) {
    if (event.type == "progress") {
      log.trace("Progress: " + event.detail);
    }
  };
};

function copyFileMessage(file, destFolder, isDraftOrTemplate) {
  let listener = new PromiseTestUtils.PromiseCopyListener(copyListenerWrap);
  MailServices.copy.copyFileMessage(
    file,
    destFolder,
    null,
    isDraftOrTemplate,
    0,
    "",
    listener,
    null
  );
  return listener.promise;
}

/**
 * Check that conversion worked for the given source.
 *
 * @param {nsIFile} source - mbox source directory.
 * @param {nsIFile} target - maildir target directory.
 */
function checkConversion(source, target) {
  for (let sourceContent of source.directoryEntries) {
    let sourceContentName = sourceContent.leafName;
    let ext = sourceContentName.substr(-4);
    let targetFile = FileUtils.File(
      PathUtils.join(target.path, sourceContentName)
    );
    log.debug("Checking path: " + targetFile.path);
    if (ext == ".dat") {
      Assert.ok(targetFile.exists());
    } else if (sourceContent.isDirectory()) {
      Assert.ok(targetFile.exists());
      checkConversion(sourceContent, targetFile);
    } else if (ext != ".msf") {
      Assert.ok(targetFile.exists());
      let cur = FileUtils.File(PathUtils.join(targetFile.path, "cur"));
      Assert.ok(cur.exists());
      let tmp = FileUtils.File(PathUtils.join(targetFile.path, "tmp"));
      Assert.ok(tmp.exists());
      if (targetFile.leafName == "Inbox") {
        let curContents = cur.directoryEntries;
        let curContentsCount = [...curContents].length;
        Assert.equal(curContentsCount, 1000);
      }
    }
  }
}

function run_test() {
  localAccountUtils.loadLocalMailAccount();

  // Set up two deferred pop accounts.
  gServer1 = MailServices.accounts.createIncomingServer(
    "test1",
    "localhost1",
    "pop3"
  );
  gServer2 = MailServices.accounts.createIncomingServer(
    "test2",
    "localhost2",
    "pop3"
  );
  var accountPop1 = MailServices.accounts.createAccount();
  var accountPop2 = MailServices.accounts.createAccount();

  // Set incoming servers.
  accountPop1.incomingServer = gServer1;
  gServer1.QueryInterface(Ci.nsIPop3IncomingServer);
  gServer1.valid = true;
  accountPop2.incomingServer = gServer2;
  gServer2.QueryInterface(Ci.nsIPop3IncomingServer);
  gServer2.valid = true;

  // Defer accounts to Local Folders.
  gServer1.deferredToAccount = localAccountUtils.msgAccount.key;
  gServer2.deferredToAccount = localAccountUtils.msgAccount.key;

  // 'gServer1' should be deferred. Get the path of the root folder to which
  // other accounts are deferred.
  ok(gServer1.rootFolder.filePath.path != gServer1.rootMsgFolder.filePath.path);
  let deferredToRootFolder = gServer1.rootMsgFolder.filePath.path;

  // Account to which other accounts have been deferred.
  let deferredToAccount;
  // String to hold names of accounts to convert.
  let accountsToConvert = "";

  let accounts = FolderUtils.allAccountsSorted(true);
  for (let account of accounts) {
    if (
      account.incomingServer.rootFolder.filePath.path == deferredToRootFolder
    ) {
      // Other accounts may be deferred to this account.
      deferredToAccount = account;
    } else if (
      account.incomingServer.rootMsgFolder.filePath.path == deferredToRootFolder
    ) {
      // This is a deferred account.
      accountsToConvert += account.incomingServer.username + ", ";
    }
  }

  accountsToConvert =
    accountsToConvert + deferredToAccount.incomingServer.username;
  log.info(accountsToConvert + " will be converted");

  gInbox = localAccountUtils.inboxFolder;
  gServer = deferredToAccount.incomingServer;

  run_next_test();
}

add_setup(async function () {
  let msgFile = do_get_file("../../../data/bugmail10");
  // Add 1000 messages to the "Inbox" folder.
  for (let i = 0; i < 1000; i++) {
    await copyFileMessage(msgFile, gInbox, false);
  }
});

add_task(function testMaildirConversion() {
  let mailstoreContractId = Services.prefs.getCharPref(
    "mail.server." + gServer.key + ".storeContractID"
  );

  do_test_pending();
  let pConverted = convertMailStoreTo(
    mailstoreContractId,
    gServer,
    new EventTarget()
  );
  let originalRootFolder = gServer.rootFolder.filePath;

  pConverted
    .then(function (val) {
      log.debug("Conversion done: " + originalRootFolder.path + " => " + val);
      let newRootFolder = gServer.rootFolder.filePath;
      checkConversion(originalRootFolder, newRootFolder);
      do_test_finished();
    })
    .catch(function (reason) {
      log.error("Conversion failed: " + reason.error);
      ok(false); // Fail the test!
    });
});
