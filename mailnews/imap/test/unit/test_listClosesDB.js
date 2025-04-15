/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// This file tests that imap LISTing folders during discovery when not using
// subscription doesn't leave db's open.
// The test runs twice: for mbox and for maildir.

var { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

var gFolder1;
var gSub1;
var gSub2;
var gSub3;

add_setup(async function () {
  setupIMAPPump();
  IMAPPump.incomingServer.usingSubscription = false;

  // Vary which folder is subscribed during the test run for mbox or
  // maildir. Shouldn't really matter if subscribed or not but make sure.
  if (IMAPPump.inbox.msgStore.storeType == "mbox") {
    IMAPPump.daemon.createMailbox("folder1", { subscribed: false });
    IMAPPump.daemon.createMailbox("folder1/sub1", { subscribed: true });
    IMAPPump.daemon.createMailbox("folder1/sub1/sub2", { subscribed: false });
    IMAPPump.daemon.createMailbox("folder1/sub1/sub2/sub3", {
      subscribed: true,
    });
  } else {
    // maildir
    IMAPPump.daemon.createMailbox("folder1", { subscribed: true });
    IMAPPump.daemon.createMailbox("folder1/sub1", { subscribed: false });
    IMAPPump.daemon.createMailbox("folder1/sub1/sub2", { subscribed: true });
    IMAPPump.daemon.createMailbox("folder1/sub1/sub2/sub3", {
      subscribed: false,
    });
  }

  const rootFolder = IMAPPump.incomingServer.rootFolder.QueryInterface(
    Ci.nsIMsgImapMailFolder
  );
  rootFolder.hierarchyDelimiter = "/";
  IMAPPump.inbox.hierarchyDelimiter = "/";
  gFolder1 = rootFolder.addSubfolder("folder1");
  gSub1 = gFolder1.addSubfolder("sub1");
  gSub2 = gSub1.addSubfolder("sub2");
  gSub3 = gSub2.addSubfolder("sub3");
  IMAPPump.server.performTest("LIST");
  await PromiseTestUtils.promiseDelay(1000);
});

add_task(async function updateInbox() {
  const listener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(null, listener);
  await listener.promise;
});

add_task(function checkCachedDBForFolder() {
  const gDbService = Cc["@mozilla.org/msgDatabase/msgDBService;1"].getService(
    Ci.nsIMsgDBService
  );
  // Check that all folder DBs are closed.
  Assert.equal(gDbService.cachedDBForFolder(gFolder1), null);
  Assert.equal(gDbService.cachedDBForFolder(gSub1), null);
  Assert.equal(gDbService.cachedDBForFolder(gSub2), null);
  Assert.equal(gDbService.cachedDBForFolder(gSub3), null);
});

add_task(function teardown() {
  teardownIMAPPump();
});
