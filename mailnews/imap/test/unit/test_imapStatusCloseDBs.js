/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// This file tests that checking folders for new mail with STATUS
// doesn't leave db's open.

var { PromiseTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/PromiseTestUtils.jsm"
);

var gFolder1, gFolder2;

add_setup(function () {
  Services.prefs.setBoolPref("mail.check_all_imap_folders_for_new", true);
  Services.prefs.setIntPref("mail.server.server1.max_cached_connections", 2);

  setupIMAPPump();

  IMAPPump.daemon.createMailbox("folder 1", { subscribed: true });
  IMAPPump.daemon.createMailbox("folder 2", { subscribed: true });

  IMAPPump.server.performTest("SUBSCRIBE");

  const rootFolder = IMAPPump.incomingServer.rootFolder;
  gFolder1 = rootFolder.getChildNamed("folder 1");
  gFolder2 = rootFolder.getChildNamed("folder 2");

  IMAPPump.inbox.getNewMessages(null, null);
  IMAPPump.server.performTest("STATUS");
  Assert.ok(IMAPPump.server.isTestFinished());
  // don't know if this will work, but we'll try. Wait for
  // second status response
  IMAPPump.server.performTest("STATUS");
  Assert.ok(IMAPPump.server.isTestFinished());
});

add_task(function check() {
  const gDbService = Cc["@mozilla.org/msgDatabase/msgDBService;1"].getService(
    Ci.nsIMsgDBService
  );
  Assert.ok(gDbService.cachedDBForFolder(IMAPPump.inbox) !== null);
  Assert.ok(gDbService.cachedDBForFolder(gFolder1) === null);
  Assert.ok(gDbService.cachedDBForFolder(gFolder2) === null);
});

add_task(function endTest() {
  teardownIMAPPump();
});
