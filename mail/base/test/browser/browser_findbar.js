/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
const TEST_DOCUMENT_URL = "http://mochi.test:8888/";
let about3Pane;

add_setup(async function () {
  Services.prefs.setBoolPref("mailnews.scroll_to_new_message", false);
  // Reduce animations to prevent intermittent fails due to findbar collapsing
  // animation delay.
  Services.prefs.setIntPref("ui.prefersReducedMotion", 1);

  // Create an account for the test.
  const account = MailServices.accounts.createLocalMailAccount();
  account.addIdentity(MailServices.accounts.createIdentity());

  // Create a folder for the account to store test messages.
  const rootFolder = account.incomingServer.rootFolder.QueryInterface(
    Ci.nsIMsgLocalMailFolder
  );
  const testFolder = rootFolder
    .createLocalSubfolder("findbar")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);

  // Generate message thread for the test folder.
  const generator = new MessageGenerator();
  testFolder.addMessageBatch(
    generator
      .makeMessages({ count: 5, msgsPerThread: 5 })
      .map(message => message.toMessageString())
  );

  about3Pane = document.getElementById("tabmail").currentAbout3Pane;
  about3Pane.restoreState({
    folderURI: testFolder.URI,
    messagePaneVisible: true,
  });

  // Use the test folder.
  await ensure_cards_view();

  // Remove test account on cleanup.
  registerCleanupFunction(() => {
    MailServices.accounts.removeAccount(account, false);
    Services.prefs.clearUserPref("mailnews.scroll_to_new_message");
    Services.prefs.clearUserPref("ui.prefersReducedMotion");
  });
});

/**
 * Tests opening the find toolbars on the webBrowser, multiMessageBrowser, and
 * messageBrowser (in order).
 */
add_task(async function testMessagePaneFindToolbars() {
  const messageBrowser = about3Pane.messageBrowser;
  const multiMessageBrowser = about3Pane.multiMessageBrowser;

  // Open a test page in the web browser.
  const loadedPromise = BrowserTestUtils.browserLoaded(
    about3Pane.webBrowser,
    undefined,
    url => url != "about:blank"
  );
  about3Pane.messagePane.displayWebPage(TEST_DOCUMENT_URL);
  await loadedPromise;

  Assert.ok(
    BrowserTestUtils.isVisible(about3Pane.webBrowser),
    "webBrowser should be visible"
  );

  // Emulate the find command.
  EventUtils.synthesizeKey("f", { accelKey: true });

  // Test that the web browser find toolbar becomes visible in about3pane.
  Assert.ok(
    BrowserTestUtils.isVisible(about3Pane.messagePane.webFindbar),
    "The web browser find toolbar should be visible."
  );

  const threadTree = about3Pane.threadTree;
  // Click on a collapsed thread row to replace web browser with
  // multiMessage browser. Ensure it's collapsed before proceeding.
  let row = threadTree.getRowAtIndex(0);
  Assert.ok(
    row.classList.contains("collapsed"),
    "The thread row should be collapsed"
  );

  // Simulate a click on the row's subject line to select the row.
  const selectPromise = BrowserTestUtils.waitForEvent(threadTree, "select");
  EventUtils.synthesizeMouseAtCenter(
    row.querySelector(".thread-card-subject-container .subject"),
    { clickCount: 1 },
    about3Pane
  );
  await selectPromise;
  Assert.ok(
    row.classList.contains("selected"),
    "The thread row should be selected"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(multiMessageBrowser),
    "The multi message browser should be visible"
  );

  // The web browser find toolbar should not be visible now.
  Assert.ok(
    BrowserTestUtils.isHidden(about3Pane.messagePane.webFindbar),
    "The web browser find toolbar should be hidden"
  );

  // Emulate the find command.
  EventUtils.synthesizeKey("f", { accelKey: true });

  // Test that the mutlimessage browser find toolbar becomes visible in
  // about3pane.
  Assert.ok(
    BrowserTestUtils.isVisible(about3Pane.messagePane.multiMessageFindbar),
    "The multiMessage find toolbar should be visible"
  );

  // Expand the thread tree and select the first message to open the
  // message browser.
  goDoCommand("cmd_expandAllThreads");
  await messageLoadedIn(messageBrowser);
  row = threadTree.getRowAtIndex(0);

  Assert.ok(
    !row.classList.contains("collapsed"),
    "The thread row should be expanded"
  );

  Assert.ok(
    BrowserTestUtils.isHidden(multiMessageBrowser),
    "multiMessageBrowser should be hidden"
  );

  Assert.ok(
    BrowserTestUtils.isVisible(messageBrowser),
    "messageBrowser should be visible"
  );

  // The multi message browser find toolbar should not be visible now.
  Assert.ok(
    BrowserTestUtils.isHidden(about3Pane.messagePane.multiMessageFindbar),
    "The multi message browser find toolbar should be hidden"
  );

  // Emulate the find command.
  EventUtils.synthesizeKey("f", { accelKey: true });

  // Test that the message browser find toolbar becomes visible in about3pane.
  Assert.ok(
    BrowserTestUtils.isVisible(
      messageBrowser.contentDocument.getElementById("findToolbar")
    ),
    "The single message find toolbar should be visible"
  );
});
