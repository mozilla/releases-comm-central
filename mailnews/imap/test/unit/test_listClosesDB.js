/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// This file tests that imap LISTing folders during discovery doesn't leave db's
// open. Note: regardless of whether subscriptions are used or not, folder DBs
// are verified to not be left open after discovery.
// This test occurs twice: for mbox and for maildir.

var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

var gFolder1;
var gSub1;
var gSub2;
var gSub3;
var gTrash;

add_task(async function test_not_using_subscriptions() {
  await setup(false);
  checkFoldersDiscovered();
  await updateInbox();
  checkCachedDBForFolder();
  teardown();
});

add_task(async function test_using_subscriptions() {
  await setup(true);
  checkFoldersDiscovered();
  await updateInbox();
  checkCachedDBForFolder();
  teardown();
});

async function setup(usingSubscriptions) {
  setupIMAPPump();
  IMAPPump.incomingServer.usingSubscription = usingSubscriptions;

  if (!usingSubscriptions) {
    // Vary which folder is subscribed during the test run for mbox or
    // maildir. Shouldn't really matter if subscribed or not but make sure.
    if (IMAPPump.inbox.msgStore.storeType == "mbox") {
      info("Testing for mbox, not using subscriptions");
      IMAPPump.daemon.createMailbox("folder1", { subscribed: false });
      IMAPPump.daemon.createMailbox("folder1/sub1", { subscribed: true });
      IMAPPump.daemon.createMailbox("folder1/sub1/sub2", { subscribed: false });
      IMAPPump.daemon.createMailbox("folder1/sub1/sub2/sub3", {
        subscribed: true,
      });
    } else {
      info("Testing for maildir, not using subscriptions");
      IMAPPump.daemon.createMailbox("folder1", { subscribed: true });
      IMAPPump.daemon.createMailbox("folder1/sub1", { subscribed: false });
      IMAPPump.daemon.createMailbox("folder1/sub1/sub2", { subscribed: true });
      IMAPPump.daemon.createMailbox("folder1/sub1/sub2/sub3", {
        subscribed: false,
      });
    }
  } else {
    // Using subscriptions. Set each folder to subscribed for both storeType.
    if (IMAPPump.inbox.msgStore.storeType == "mbox") {
      info("Testing for mbox, using subscriptions");
    } else {
      info("Testing for maildir, using subscriptions");
    }
    IMAPPump.daemon.createMailbox("folder1", { subscribed: true });
    IMAPPump.daemon.createMailbox("folder1/sub1", { subscribed: true });
    IMAPPump.daemon.createMailbox("folder1/sub1/sub2", { subscribed: true });
    IMAPPump.daemon.createMailbox("folder1/sub1/sub2/sub3", {
      subscribed: true,
    });
  }

  // discoverallboxes URL occurs and creates Trash and subscribes it. Give it
  // some time to finish since delay below 50 can produce errors in
  // checkFoldersDiscovered.
  await PromiseTestUtils.promiseDelay(1000);
}

function checkFoldersDiscovered() {
  const rootFolder = IMAPPump.incomingServer.rootFolder.QueryInterface(
    Ci.nsIMsgImapMailFolder
  );
  rootFolder.hierarchyDelimiter = "/";
  IMAPPump.inbox.hierarchyDelimiter = "/";

  // Somewhat based on mailnews/imap/test/unit/test_imapStatusCloseDBs.js
  gFolder1 = rootFolder.getChildNamed("folder1");
  Assert.notEqual(gFolder1, null);
  gSub1 = gFolder1.getChildNamed("sub1");
  Assert.notEqual(gSub1, null);
  gSub2 = gSub1.getChildNamed("sub2");
  Assert.notEqual(gSub2, null);
  gSub3 = gSub2.getChildNamed("sub3");
  Assert.notEqual(gSub3, null);
  gTrash = rootFolder.getChildNamed("Trash");
  Assert.notEqual(gTrash, null);
}

async function updateInbox() {
  const listener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(null, listener);
  await listener.promise;
}

function checkCachedDBForFolder() {
  const gDbService = Cc["@mozilla.org/msgDatabase/msgDBService;1"].getService(
    Ci.nsIMsgDBService
  );
  // Check that all folder DBs are closed after discovery.
  Assert.equal(gDbService.cachedDBForFolder(gFolder1), null);
  Assert.equal(gDbService.cachedDBForFolder(gSub1), null);
  Assert.equal(gDbService.cachedDBForFolder(gSub2), null);
  Assert.equal(gDbService.cachedDBForFolder(gSub3), null);
  Assert.equal(gDbService.cachedDBForFolder(gTrash), null);
}

function teardown() {
  teardownIMAPPump();
}
