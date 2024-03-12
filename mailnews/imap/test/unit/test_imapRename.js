/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// This tests that renaming non-ASCII name folder works.

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

add_setup(async function () {
  setupIMAPPump();
  Services.prefs.setBoolPref(
    "mail.server.default.autosync_offline_stores",
    false
  );
  IMAPPump.incomingServer.rootFolder.createSubfolder("folder 1", null);
  await PromiseTestUtils.promiseFolderAdded("folder 1");

  const listener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(null, listener);
  await listener.promise;
});

add_task(async function test_rename() {
  const rootFolder = IMAPPump.incomingServer.rootFolder;
  const targetFolder = rootFolder.getChildNamed("folder 1");

  targetFolder.rename("folder \u00e1", null);

  IMAPPump.server.performTest("RENAME");
  const listener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(null, listener);
  await listener.promise;

  const folder = rootFolder.getChildNamed("folder \u00e1");
  Assert.ok(folder.msgDatabase.summaryValid);
  Assert.equal("folder &AOE-", folder.filePath.leafName);
  Assert.equal("folder \u00e1", folder.prettyName);
});
