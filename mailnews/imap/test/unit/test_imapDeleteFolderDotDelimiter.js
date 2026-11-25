/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Tests that a folder deleted on the server is removed from the folder tree
 * when the hierarchy delimiter is not '/'.
 */

var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

add_setup(async function () {
  setupIMAPPump();
  IMAPPump.daemon.root.delimiter = ".";
  IMAPPump.daemon.inbox.delimiter = ".";
  IMAPPump.daemon.createMailbox("parent", { subscribed: true, delimiter: "." });
  IMAPPump.daemon.createMailbox("parent.my child", {
    subscribed: true,
    delimiter: ".",
  });

  const listener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(null, listener);
  await listener.promise;
});

add_task(async function testDeleteSubfolder() {
  const parent = IMAPPump.incomingServer.rootFolder.getChildNamed("parent");
  Assert.ok(
    parent.containsChildNamed("my child"),
    "the subfolder should exist"
  );

  const listener = new PromiseTestUtils.PromiseUrlListener();
  MailServices.imap.deleteFolder(
    parent.getChildNamed("my child"),
    listener,
    false
  );
  await listener.promise;

  Assert.ok(
    !IMAPPump.daemon.getMailbox("parent.my child"),
    "the mailbox should be deleted on the server"
  );
  Assert.ok(
    !parent.containsChildNamed("my child"),
    "the folder should be gone from the folder tree"
  );
});
