/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
const { ensure_cards_view } = ChromeUtils.importESModule(
  "resource://testing-common/MailViewHelpers.sys.mjs"
);

const TEST_DOCUMENT_URL = "http://mochi.test:8888/";
let about3Pane;
let testFolder;

add_setup(async function () {
  // Reduce animations to prevent intermittent fails due to findbar collapsing
  // animation delay.
  await SpecialPowers.pushPrefEnv({
    set: [
      ["mailnews.scroll_to_new_message", false],
      ["ui.prefersReducedMotion", 1],
    ],
  });

  // Create an account for the test.
  const account = MailServices.accounts.createLocalMailAccount();
  account.addIdentity(MailServices.accounts.createIdentity());

  // Create a folder for the account to store test messages.
  const rootFolder = account.incomingServer.rootFolder.QueryInterface(
    Ci.nsIMsgLocalMailFolder
  );
  testFolder = rootFolder
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
  await ensure_cards_view(document);

  // Remove test account on cleanup.
  registerCleanupFunction(() => {
    MailServices.accounts.removeAccount(account, false);
  });
});

/**
 * Tests that delayed actor registration does not reclaim ownership after the
 * real findbar has been materialized.
 */
add_task(async function testMaterializedFindbarOwnsRegistration() {
  const tabmail = document.getElementById("tabmail");
  const tab = tabmail.openTab("mail3PaneTab", { folderURI: testFolder.URI });
  await BrowserTestUtils.browserLoaded(tab.chromeBrowser);

  const testAbout3Pane = tab.chromeBrowser.contentWindow;
  await testAbout3Pane.hasDOMContentLoaded.promise;

  const { messagePane, webBrowser } = testAbout3Pane;
  const lazyFindbar = messagePane.webFindbar;
  Assert.ok(
    !lazyFindbar.firstElementChild,
    "The web browser findbar should not be initialized yet"
  );

  const findbar = lazyFindbar.findbar;
  Assert.ok(findbar, "The real findbar should be materialized");

  const getBrowser = lazyFindbar._getBrowser;
  let browserWasRequested = false;
  lazyFindbar._getBrowser = function () {
    browserWasRequested = true;
    return getBrowser.call(this);
  };

  // Simulate the nodefaultsrc browser's pending load callback. The callback
  // should return before looking up the browser once a real findbar exists.
  webBrowser.dispatchEvent(new testAbout3Pane.Event("load"));
  Assert.ok(
    !browserWasRequested,
    "Deferred registration should not replace a materialized findbar"
  );

  // A materialized wrapper can also be reconnected without registration work.
  lazyFindbar.connectedCallback();
  Assert.ok(
    !browserWasRequested,
    "Reconnecting should not register over a materialized findbar"
  );

  tabmail.closeTab(tab);
});

/**
 * Tests that manual find-as-you-type materializes a fresh lazy findbar and
 * that subsequent quick finds reuse it.
 */
add_task(async function testFindAsYouTypeInFreshBrowser() {
  const tabmail = document.getElementById("tabmail");
  const tab = tabmail.openTab("mail3PaneTab", { folderURI: testFolder.URI });
  await BrowserTestUtils.browserLoaded(tab.chromeBrowser);

  const testAbout3Pane = tab.chromeBrowser.contentWindow;
  await testAbout3Pane.hasDOMContentLoaded.promise;

  const { messagePane, webBrowser } = testAbout3Pane;
  const lazyFindbar = messagePane.webFindbar;
  Assert.ok(
    !lazyFindbar.firstElementChild,
    "The web browser findbar should not be initialized yet"
  );
  lazyFindbar.onMouseUp();
  Assert.ok(
    !lazyFindbar.firstElementChild,
    "A mouseup should not materialize a findbar"
  );

  // Loading the nodefaultsrc browser exercises the lazy findbar's deferred
  // registration with the FindBar actor.
  const loadedPromise = BrowserTestUtils.browserLoaded(
    webBrowser,
    undefined,
    url => url != "about:blank"
  );
  messagePane.displayWebPage(TEST_DOCUMENT_URL);
  await loadedPromise;

  await SimpleTest.promiseFocus(webBrowser);
  let findbarOpen = BrowserTestUtils.waitForEvent(lazyFindbar, "findbaropen");
  await BrowserTestUtils.sendChar("/", webBrowser);
  await findbarOpen;

  const findbar = lazyFindbar.firstElementChild;
  Assert.ok(
    findbar && BrowserTestUtils.isVisible(findbar),
    "Manual FAYT should materialize and show the web browser findbar"
  );
  Assert.equal(
    findbar.findMode,
    findbar.FIND_TYPEAHEAD,
    "The findbar should be in find-as-you-type mode"
  );

  const findbarClose = BrowserTestUtils.waitForEvent(
    lazyFindbar,
    "findbarclose"
  );
  lazyFindbar.close();
  await findbarClose;

  findbarOpen = BrowserTestUtils.waitForEvent(lazyFindbar, "findbaropen");
  await BrowserTestUtils.sendChar("/", webBrowser);
  await findbarOpen;
  Assert.equal(
    lazyFindbar.firstElementChild,
    findbar,
    "A subsequent manual FAYT should reuse the existing findbar"
  );

  tabmail.closeTab(tab);
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

  Assert.ok(
    !about3Pane.messagePane.webFindbar.firstElementChild,
    "The web browser findbar should not be initialized yet"
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

  const actualWebFindbar = about3Pane.messagePane.webFindbar.firstElementChild;
  Assert.ok(
    !actualWebFindbar || BrowserTestUtils.isHidden(actualWebFindbar),
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

  const actualMultiMessageFindbar =
    about3Pane.messagePane.multiMessageFindbar.firstElementChild;
  Assert.ok(
    !actualMultiMessageFindbar ||
      BrowserTestUtils.isHidden(actualMultiMessageFindbar),
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
