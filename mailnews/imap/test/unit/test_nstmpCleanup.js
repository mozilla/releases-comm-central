/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test that nstmpCleanup() works. It's an idle task (see MailGlue.sys.mjs)
 * which removes nstmp (and nstmp-NNNN) files left over from old, failed
 * folder compaction operations.
 */

const { MailMigrator } = ChromeUtils.importESModule(
  "resource:///modules/MailMigrator.sys.mjs"
);

add_task(async function testNstmpCleanup() {
  // Part 1
  //
  // Setup an IMAP server and some folders, including ones with
  // potentially troublesome names (nstmp*).

  setupIMAPPump();

  const inbox = IMAPPump.inbox;
  Assert.ok(inbox.msgStore.supportsCompaction, "test only applies to mbox");

  // Create some mailboxes and populate with messages.
  const mailboxes = [
    "INBOX/foo",
    "INBOX/foo/bar",
    "INBOX/nstmp-42",
    "INBOX/nstmp",
    "INBOX/nstmp/wibble",
    "INBOX/nstmp/nstmp-123",
  ];
  const generator = new MessageGenerator();
  for (const name of mailboxes) {
    IMAPPump.daemon.createMailbox(name, { subscribed: true });
    const mailbox = IMAPPump.daemon.getMailbox(name);
    generator.makeMessages({ count: 10 }).forEach(m => {
      mailbox.addMessage(
        new ImapMessage(
          "data:text/plain;base64," + btoa(m.toMessageString()),
          mailbox.uidnext++,
          []
        )
      );
    });
  }

  // These hacks are required because we've created the inbox before
  // running initial folder discovery, and adding the folder bails
  // out before we set it as verified online, so we bail out, and
  // then remove the INBOX folder since it's not verified.
  inbox.hierarchyDelimiter = "/";
  inbox.verifiedAsOnlineFolder = true;

  // Select the inbox to force folder discovery.
  const listener = new PromiseTestUtils.PromiseUrlListener();
  inbox.updateFolderWithListener(null, listener);
  await listener.promise;

  // These correspond to the mailboxes we set up on the IMAP server.
  const folders = [
    inbox,
    inbox.getChildNamed("foo"),
    inbox.getChildNamed("foo").getChildNamed("bar"),
    inbox.getChildNamed("nstmp-42"),
    inbox.getChildNamed("nstmp"),
    inbox.getChildNamed("nstmp").getChildNamed("wibble"),
    inbox.getChildNamed("nstmp").getChildNamed("nstmp-123"),
  ];

  // Attempt to mark all folders as offline and download them locally.
  const expectToKeep = [];
  for (const folder of folders) {
    folder.setFlag(Ci.nsMsgFolderFlags.Offline);
    const promiseUrlListener = new PromiseTestUtils.PromiseUrlListener();
    folder.downloadAllForOffline(promiseUrlListener, null);
    await promiseUrlListener.promise;
    const file = folder.filePath.path;
    // Note all the files we expect to remain untouched.
    expectToKeep.push(file);
  }

  // HACKHACKHACK: DownloadAllForOffline() doesn't seem have created the mbox
  // files by the time we get here, despite waiting for the listener.
  // Investigation required.
  // For now, if file doesn't exists, we'll fudge it by creating a stand-in
  // one.
  for (const file of expectToKeep) {
    if (!(await IOUtils.exists(file))) {
      await IOUtils.writeUTF8(file, "Pretending to be an mbox file.");
    }
  }

  // Part 2
  //
  // Make sure nstmpCleanup() removes leftover nstmp files,
  // and doesn't delete anything it shouldn't.

  // Install extra nstmp files we expect nstmpCleanup() to delete.
  const inboxDir = inbox.filePath.path + ".sbd";
  const fooDir = inbox.getChildNamed("foo").filePath.path + ".sbd";
  const expectToDelete = [
    PathUtils.join(fooDir, "nstmp"),
    PathUtils.join(fooDir, "nstmp-1"),
    PathUtils.join(inboxDir, "nstmp-99"),
    PathUtils.join(inboxDir, "nstmp-999"),
  ];
  for (const f of expectToDelete) {
    await IOUtils.writeUTF8(f, "leftover cruft to delete");
  }

  // GO!
  await MailMigrator._nstmpCleanup();

  // Make sure we didn't delete anything we shouldn't have.
  for (const f of expectToKeep) {
    Assert.ok(await IOUtils.exists(f), `Kept ${f}`);
  }

  // Make sure we did delete rogue nstmp files.
  for (const f of expectToDelete) {
    Assert.ok(!(await IOUtils.exists(f)), `Deleted ${f}`);
  }

  // Part 3
  //
  // Lastly, make sure that nstmpCleanup() only runs once.

  // Reinstall all the leftover nstmp files.
  for (const f of expectToDelete) {
    await IOUtils.writeUTF8(f, "more leftover cruft to delete");
  }

  // GO (again)!
  await MailMigrator._nstmpCleanup();

  // Make sure we didn't delete anything we shouldn't have.
  for (const f of expectToKeep) {
    Assert.ok(await IOUtils.exists(f), `Kept ${f}`);
  }
  // Make sure we didn't even delete the nstmp files that.
  // were deleted on the first run!
  for (const f of expectToDelete) {
    Assert.ok(await IOUtils.exists(f), `Didn't delete ${f}`);
  }

  teardownIMAPPump();
});
