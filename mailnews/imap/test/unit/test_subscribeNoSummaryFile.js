/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that subscribing to an IMAP folder creates exactly one summary
 * (.msf) file (bug 520437).
 *
 * An info read on a folder that isn't on disk yet (e.g. an IMAP folder below
 * an unsubscribed parent, while subscribing to it) used to create an empty
 * .msf prematurely. When discovery later created the real summary file, the
 * empty leftover was renamed with a "-1" suffix, leaving an orphaned
 * "NotOnDisk-1.msf" duplicate behind.
 */

const { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);

add_setup(async function () {
  setupIMAPPump();

  // Create a mailbox on the server that is not subscribed yet, so the folder
  // doesn't exist on disk.
  IMAPPump.daemon.createMailbox("NotOnDisk");

  // Give the initial discovery time to complete.
  await PromiseTestUtils.promiseDelay(1000);
});

add_task(async function testSubscribeCreatesOnlyOneSummaryFile() {
  const subscribableServer = IMAPPump.incomingServer.QueryInterface(
    Ci.nsISubscribableServer
  );

  subscribableServer.subscribe("NotOnDisk");
  subscribableServer.commitSubscribeChanges();

  // commitSubscribeChanges() triggers a re-discovery on the IMAP connection,
  // so wait for the folder to show up in the folder tree.
  const rootFolder = IMAPPump.incomingServer.rootFolder;
  await TestUtils.waitForCondition(
    () => rootFolder.containsChildNamed("NotOnDisk"),
    "timed out waiting for folder NotOnDisk to appear after subscribing"
  );

  const folder = rootFolder.getChildNamed("NotOnDisk");
  Assert.notEqual(folder, null, "folder NotOnDisk should be subscribed");

  // Discovery legitimately creates the folder's summary file once the folder
  // is on disk.
  const summaryFile = folder.summaryFile;
  Assert.ok(
    summaryFile.exists(),
    "folder summary file should exist after discovery"
  );

  // Subscribing must not have created a second (premature) summary file: the
  // empty leftover would be renamed to "NotOnDisk-1.msf" when discovery
  // recreates the summary, leaving a duplicate behind.
  const baseName = summaryFile.leafName.replace(/\.msf$/, "");
  let summaryCount = 0;
  for (const entry of IMAPPump.incomingServer.localPath.directoryEntries) {
    if (
      entry.isFile &&
      entry.leafName.endsWith(".msf") &&
      entry.leafName.startsWith(baseName)
    ) {
      summaryCount++;
    }
  }
  Assert.equal(
    summaryCount,
    1,
    "subscribing must create exactly one summary file"
  );
});

add_task(function endTest() {
  teardownIMAPPump();
});
