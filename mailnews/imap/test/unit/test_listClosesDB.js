/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// This file tests that listing folders on startup because we're not using
// subscription doesn't leave db's open.

var { MessageGenerator } = ChromeUtils.import(
  "resource://testing-common/mailnews/MessageGenerator.jsm"
);
var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

var gSub3;

add_setup(async function () {
  setupIMAPPump();

  IMAPPump.daemon.createMailbox("folder1", { subscribed: true });
  IMAPPump.daemon.createMailbox("folder1/sub1", "", { subscribed: true });
  IMAPPump.daemon.createMailbox("folder1/sub1/sub2", "", { subscribed: true });
  IMAPPump.daemon.createMailbox("folder1/sub1/sub2/sub3", "", {
    subscribed: true,
  });

  IMAPPump.incomingServer.usingSubscription = false;

  const rootFolder = IMAPPump.incomingServer.rootFolder.QueryInterface(
    Ci.nsIMsgImapMailFolder
  );
  rootFolder.hierarchyDelimiter = "/";
  IMAPPump.inbox.hierarchyDelimiter = "/";
  const folder1 = rootFolder.addSubfolder("folder1");
  const sub1 = folder1.addSubfolder("sub1");
  const sub2 = sub1.addSubfolder("sub2");
  gSub3 = sub2.addSubfolder("sub3");
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
  Assert.equal(gDbService.cachedDBForFolder(gSub3), null);
});

add_task(function teardown() {
  teardownIMAPPump();
});
