/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { MessageGenerator } = ChromeUtils.import(
  "resource://testing-common/mailnews/MessageGenerator.jsm"
);

const tabmail = document.getElementById("tabmail");
const about3Pane = tabmail.currentAbout3Pane;
const { threadTree } = about3Pane;

add_setup(async function () {
  Services.prefs.setBoolPref("mailnews.scroll_to_new_message", false);
  // Create an account for the test.
  const account = MailServices.accounts.createLocalMailAccount();
  account.addIdentity(MailServices.accounts.createIdentity());

  // Create a folder for the account to store test messages.
  const rootFolder = account.incomingServer.rootFolder.QueryInterface(
    Ci.nsIMsgLocalMailFolder
  );
  const testFolder = rootFolder
    .createLocalSubfolder("zoom")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);

  // Generate test messages.
  const generator = new MessageGenerator();
  testFolder.addMessageBatch(
    generator
      .makeMessages({ count: 5, msgsPerThread: 5 })
      .map(message => message.toMessageString())
  );

  // Use the test folder.
  about3Pane.displayFolder(testFolder.URI);
  await ensure_cards_view();

  // Remove test account on cleanup.
  registerCleanupFunction(() => {
    MailServices.accounts.removeAccount(account, false);
    Services.prefs.setBoolPref("mailnews.scroll_to_new_message", true);
  });
});

/**
 * Tests zooming in and out of the multi-message view using keyboard shortcuts
 * when viewing a thread.
 */
add_task(async function testMultiMessageZoom() {
  // Threads need to be collapsed, otherwise the multi-message view
  // won't be shown.
  const row = threadTree.getRowAtIndex(0);
  Assert.ok(
    row.classList.contains("collapsed"),
    "The thread row should be collapsed"
  );

  const subjectLine = row.querySelector(
    ".thread-card-subject-container .subject"
  );
  // Simulate a click on the row's subject line to select the row.
  const selectPromise = BrowserTestUtils.waitForEvent(threadTree, "select");
  EventUtils.synthesizeMouseAtCenter(
    subjectLine,
    { clickCount: 1 },
    about3Pane
  );
  await selectPromise;
  // Make sure the correct thread is selected and that the multi-message view is
  // visible.
  Assert.ok(
    row.classList.contains("selected"),
    "The thread row should be selected"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(about3Pane.multiMessageBrowser),
    "The multi-message browser should be visible"
  );

  // Record the zoom value before the operation.
  let previousZoom = top.ZoomManager.getZoomForBrowser(
    about3Pane.multiMessageBrowser
  );

  // Emulate a zoom in.
  EventUtils.synthesizeKey("+", { accelKey: true });

  // Test that the zoom value increases.
  await TestUtils.waitForCondition(
    () =>
      top.ZoomManager.getZoomForBrowser(about3Pane.multiMessageBrowser) >
      previousZoom,
    "zoom value should be greater than before keyboard event"
  );

  // Emulate a zoom out.
  previousZoom = top.ZoomManager.getZoomForBrowser(
    about3Pane.multiMessageBrowser
  );
  EventUtils.synthesizeKey("-", { accelKey: true });

  // Test that the zoom value decreases.
  await TestUtils.waitForCondition(
    () =>
      previousZoom >
      top.ZoomManager.getZoomForBrowser(about3Pane.multiMessageBrowser),
    "zoom value should be less than before keyboard event"
  );
});
