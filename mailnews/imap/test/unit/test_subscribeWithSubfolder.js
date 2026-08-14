/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that subscribing a folder and a subfolder together (as the Subscribe
 * dialog does) correctly subscribes both.
 */

const { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);

add_setup(async function () {
  setupIMAPPump();

  // Neither the folder nor its subfolder is subscribed initially.
  IMAPPump.daemon.createMailbox("A");
  IMAPPump.daemon.createMailbox("A/B");

  // Give the initial discovery time to complete.
  await PromiseTestUtils.promiseDelay(1000);
});

add_task(async function testSubscribeFolderAndSubfolderTogether() {
  const subscribableServer = IMAPPump.incomingServer.QueryInterface(
    Ci.nsISubscribableServer
  );

  // Subscribe the folder and its subfolder in a single operation, like the
  // subscribe dialog does when the user checks both.
  subscribableServer.subscribe("A");
  subscribableServer.subscribe("A/B");
  subscribableServer.commitSubscribeChanges();

  // commitSubscribeChanges() triggers a re-discovery on the IMAP connection,
  // so wait for both folders to show up in the folder tree.
  const rootFolder = IMAPPump.incomingServer.rootFolder;
  await TestUtils.waitForCondition(
    () => rootFolder.containsChildNamed("A"),
    "timed out waiting for folder A to appear after subscribing"
  );

  const folderA = rootFolder.getChildNamed("A");
  Assert.notEqual(folderA, null, "folder A should be subscribed");

  await TestUtils.waitForCondition(
    () => folderA.containsChildNamed("B"),
    "timed out waiting for subfolder A/B to appear after subscribing"
  );
  Assert.notEqual(
    folderA.getChildNamed("B"),
    null,
    "subfolder A/B should be subscribed"
  );
});

add_task(function endTest() {
  teardownIMAPPump();
});
