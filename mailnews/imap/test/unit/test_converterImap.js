/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { convertMailStoreTo } = ChromeUtils.import(
  "resource:///modules/mailstoreConverter.jsm"
);

var { FileUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/FileUtils.sys.mjs"
);
var { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

// Globals
const gMsgFile1 = do_get_file("../../../data/bugmail10");
const gTestMsgs = [gMsgFile1, gMsgFile1, gMsgFile1, gMsgFile1];

function checkConversion(aSource, aTarget) {
  for (const sourceContent of aSource.directoryEntries) {
    const sourceContentName = sourceContent.leafName;
    const ext = sourceContentName.slice(-4);
    const targetFile = FileUtils.File(
      PathUtils.join(aTarget.path, sourceContentName)
    );

    // Checking path.
    if (ext == ".msf" || ext == ".dat") {
      Assert.ok(targetFile.exists());
    } else if (sourceContent.isDirectory()) {
      Assert.ok(targetFile.exists());
      checkConversion(sourceContent, targetFile);
    } else {
      Assert.ok(targetFile.exists());
      const cur = FileUtils.File(PathUtils.join(targetFile.path, "cur"));
      Assert.ok(cur.exists());
      const tmp = FileUtils.File(PathUtils.join(targetFile.path, "tmp"));
      Assert.ok(tmp.exists());
      if (targetFile.leafName == "INBOX") {
        const curContentsCount = [...cur.directoryEntries].length;
        Assert.equal(curContentsCount, gTestMsgs.length);
      }
    }
  }
}

var EventTarget = function () {
  this.dispatchEvent = function (aEvent) {
    if (aEvent.type == "progress") {
      dump("Progress: " + aEvent.detail + "\n");
    }
  };
};

add_setup(async function () {
  // Force mbox.
  Services.prefs.setCharPref(
    "mail.serverDefaultStoreContractID",
    "@mozilla.org/msgstore/berkeleystore;1"
  );

  setupIMAPPump();

  // These hacks are required because we've created the inbox before
  // running initial folder discovery, and adding the folder bails
  // out before we set it as verified online, so we bail out, and
  // then remove the INBOX folder since it's not verified.
  IMAPPump.inbox.hierarchyDelimiter = "/";
  IMAPPump.inbox.verifiedAsOnlineFolder = true;

  // Add our test messages to the INBOX.
  const mailbox = IMAPPump.daemon.getMailbox("INBOX");
  for (const file of gTestMsgs) {
    const URI = Services.io.newFileURI(file).QueryInterface(Ci.nsIFileURL);
    mailbox.addMessage(new ImapMessage(URI.spec, mailbox.uidnext++, []));
  }
});

add_task(async function downloadForOffline() {
  // Download for offline use.
  const promiseUrlListener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.downloadAllForOffline(promiseUrlListener, null);
  await promiseUrlListener.promise;
});

add_task(async function convert() {
  const mailstoreContractId = Services.prefs.getCharPref(
    "mail.server." + IMAPPump.incomingServer.key + ".storeContractID"
  );
  const eventTarget = new EventTarget();
  const originalRootFolder = IMAPPump.incomingServer.rootFolder.filePath;
  await convertMailStoreTo(
    mailstoreContractId,
    IMAPPump.incomingServer,
    eventTarget
  );
  // Conversion done.
  const newRootFolder = IMAPPump.incomingServer.rootFolder.filePath;
  checkConversion(originalRootFolder, newRootFolder);
  const newRootFolderMsf = FileUtils.File(newRootFolder.path + ".msf");
  Assert.ok(newRootFolderMsf.exists());
});

add_task(function endTest() {
  teardownIMAPPump();
});
