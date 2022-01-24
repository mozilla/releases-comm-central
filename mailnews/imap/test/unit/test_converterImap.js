/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { convertMailStoreTo } = ChromeUtils.import(
  "resource:///modules/mailstoreConverter.jsm"
);

Services.prefs.setCharPref(
  "mail.serverDefaultStoreContractID",
  "@mozilla.org/msgstore/berkeleystore;1"
);

var { FileUtils } = ChromeUtils.import("resource://gre/modules/FileUtils.jsm");
var { MessageGenerator } = ChromeUtils.import(
  "resource://testing-common/mailnews/MessageGenerator.jsm"
);
var { PromiseTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/PromiseTestUtils.jsm"
);

// Globals
var gMsgFile1 = do_get_file("../../../data/bugmail10");

// Copied straight from the example files
var gMsgId1 = "200806061706.m56H6RWT004933@mrapp54.mozilla.org";
var gMsgId2 = "200804111417.m3BEHTk4030129@mrapp51.mozilla.org";
// var gMsgId3 = "4849BF7B.2030800@example.com";
var gMsgId4 = "bugmail7.m47LtAEf007542@mrapp51.mozilla.org";
var gMsgId5 = "bugmail6.m47LtAEf007542@mrapp51.mozilla.org";

function checkConversion(aSource, aTarget) {
  for (let sourceContent of aSource.directoryEntries) {
    let sourceContentName = sourceContent.leafName;
    let ext = sourceContentName.slice(-4);
    let targetFile = FileUtils.File(
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
      let cur = FileUtils.File(PathUtils.join(targetFile.path, "cur"));
      Assert.ok(cur.exists());
      let tmp = FileUtils.File(PathUtils.join(targetFile.path, "tmp"));
      Assert.ok(tmp.exists());
      if (targetFile.leafName == "INBOX") {
        let curContentsCount = [...cur.directoryEntries].length;
        Assert.equal(curContentsCount, 8);
      }
    }
  }
}

var EventTarget = function() {
  this.dispatchEvent = function(aEvent) {
    if (aEvent.type == "progress") {
      console.trace("Progress: " + aEvent.detail);
    }
  };
};

// Adds some messages directly to a mailbox (eg new mail).
function addMessagesToServer(aMessages, aMailbox) {
  // For every message we have, we need to convert it to a file:/// URI
  aMessages.forEach(function(message) {
    let URI = Services.io
      .newFileURI(message.file)
      .QueryInterface(Ci.nsIFileURL);
    message.spec = URI.spec;
  });

  // Create the imapMessages and store them on the mailbox.
  aMessages.forEach(function(message) {
    aMailbox.addMessage(new imapMessage(message.spec, aMailbox.uidnext++, []));
  });
}

add_task(function setupTest() {
  setupIMAPPump();

  // These hacks are required because we've created the inbox before
  // running initial folder discovery, and adding the folder bails
  // out before we set it as verified online, so we bail out, and
  // then remove the INBOX folder since it's not verified.
  IMAPPump.inbox.hierarchyDelimiter = "/";
  IMAPPump.inbox.verifiedAsOnlineFolder = true;

  // Add a couple of messages to the INBOX.
  // This is synchronous.
  addMessagesToServer(
    [
      { file: gMsgFile1, messageId: gMsgId1 },
      { file: gMsgFile1, messageId: gMsgId4 },
      { file: gMsgFile1, messageId: gMsgId2 },
      { file: gMsgFile1, messageId: gMsgId5 },
    ],
    IMAPPump.daemon.getMailbox("INBOX"),
    IMAPPump.inbox
  );
});

add_task(async function downloadForOffline() {
  // Download for offline use.
  let promiseUrlListener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.downloadAllForOffline(promiseUrlListener, null);
  await promiseUrlListener.promise;
});

add_task(async function convert() {
  let mailstoreContractId = Services.prefs.getCharPref(
    "mail.server." + IMAPPump.incomingServer.key + ".storeContractID"
  );
  let eventTarget = new EventTarget();
  let pConverted = convertMailStoreTo(
    mailstoreContractId,
    IMAPPump.incomingServer,
    eventTarget
  );
  let originalRootFolder = IMAPPump.incomingServer.rootFolder.filePath;
  await pConverted
    .then(function(val) {
      // Conversion done: originalRootFolder.path => val.
      let newRootFolder = IMAPPump.incomingServer.rootFolder.filePath;
      checkConversion(originalRootFolder, newRootFolder);
      let newRootFolderMsf = FileUtils.File(newRootFolder.path + ".msf");
      Assert.ok(newRootFolderMsf.exists());
    })
    .catch(function(reason) {
      // Conversion Failed.
      Assert.ok(false);
      throw new Error(reason);
    });
});

add_task(function endTest() {
  teardownIMAPPump();
});
