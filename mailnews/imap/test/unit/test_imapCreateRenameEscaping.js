/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Tests that folders with '/', '^' and '%' in their names are created and
 * renamed under the right name when the hierarchy delimiter is not '/'
 * (bug 1608318).
 */

var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

add_setup(async function () {
  setupIMAPPump();
  IMAPPump.daemon.root.delimiter = ".";
  IMAPPump.daemon.inbox.delimiter = ".";
  IMAPPump.daemon.createMailbox("parent", { subscribed: true, delimiter: "." });

  const listener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(null, listener);
  await listener.promise;
});

add_task(async function testCreateAndRename() {
  const parent = IMAPPump.incomingServer.rootFolder.getChildNamed("parent");

  const listener = new PromiseTestUtils.PromiseUrlListener();
  parent.createSubfolderWithListener("a^b%25", listener);
  await listener.promise;
  const folder = parent.getChildNamed("a^b%25");
  Assert.ok(folder, "the new folder should have its name");
  Assert.ok(
    IMAPPump.daemon.getMailbox("parent.a^b%25"),
    "the mailbox should be created under its own name"
  );

  folder.rename("c/d^%5E", null);
  IMAPPump.server.performTest("RENAME");
  const updateListener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(null, updateListener);
  await updateListener.promise;

  Assert.ok(
    IMAPPump.daemon.getMailbox("parent.c/d^%5E"),
    "the mailbox should be renamed to its new name"
  );
  Assert.ok(
    !IMAPPump.daemon.getMailbox("parent.a^b%25"),
    "the old mailbox should be gone"
  );
  Assert.ok(
    parent.getChildNamed("c/d^%5E"),
    "the renamed folder should keep its name"
  );
});
