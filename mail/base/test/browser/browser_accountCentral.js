/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests the account central page displayed when the root folder of a server is
 * selected in the folder tree.
 */

const { FeedUtils } = ChromeUtils.importESModule(
  "resource:///modules/FeedUtils.sys.mjs"
);
const { MockExternalProtocolService } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MockExternalProtocolService.sys.mjs"
);

const tabmail = document.getElementById("tabmail");
const about3Pane = tabmail.currentAbout3Pane;
const accountCentralBrowser = about3Pane.accountCentralBrowser;

// Which buttons should be visible for which account types?
const buttonData = {
  settingsButton: true,
  readButton: ["pop3"],
  nntpSubscriptionButton: ["nntp"],
  rssSubscriptionButton: ["rss"],
  composeButton: ["pop3"],
  searchButton: true,
  filterButton: true,
  e2eButton: ["pop3"],
  setupEmail: true,
  setupAddressBook: true,
  setupCalendar: true,
  setupChat: true,
  setupFilelink: true,
  setupFeeds: true,
  setupNewsgroups: true,
  importButton: true,
};

let localServer, pop3Server, nntpServer, rssServer;

add_setup(async function () {
  // Force the account hub address book creation until it's the only option.
  SpecialPowers.pushPrefEnv({
    set: [["mail.accounthub.addressbook.enabled", true]],
  });

  const localAccount = MailServices.accounts.createLocalMailAccount();
  localServer = localAccount.incomingServer;
  localServer.prettyName = "Test Local Account";

  const pop3Account = MailServices.accounts.createAccount();
  pop3Account.addIdentity(MailServices.accounts.createIdentity());
  pop3Account.incomingServer = MailServices.accounts.createIncomingServer(
    `${pop3Account.key}user`,
    "localhost",
    "pop3"
  );
  pop3Server = pop3Account.incomingServer;
  pop3Server.prettyName = "Test POP3 Account";

  const nntpAccount = MailServices.accounts.createAccount();
  nntpAccount.incomingServer = MailServices.accounts.createIncomingServer(
    `${nntpAccount.key}user`,
    "localhost",
    "nntp"
  );
  nntpServer = nntpAccount.incomingServer;
  nntpServer.prettyName = "Test NNTP Account";

  const rssAccount = FeedUtils.createRssAccount("Test RSS Account");
  rssServer = rssAccount.incomingServer;

  MockExternalProtocolService.init();

  registerCleanupFunction(function () {
    MailServices.accounts.removeAccount(localAccount, false);
    MailServices.accounts.removeAccount(pop3Account, false);
    MailServices.accounts.removeAccount(nntpAccount, false);
    MailServices.accounts.removeAccount(rssAccount, false);
    MockExternalProtocolService.cleanup();
  });
});

/**
 * Wait for a window to open, run a callback on it, and close it.
 *
 * @param {string} url - The URL of the expected window.
 * @param {Function} [callback] - A callback to run once the window is open
 *   and loaded. The callback takes the window as an argument.
 */
async function promiseWindow(url, callback) {
  const win = await BrowserTestUtils.promiseAlertDialogOpen(undefined, url);
  await SimpleTest.promiseFocus(win);
  await callback?.(win);
  await BrowserTestUtils.closeWindow(win);
  await SimpleTest.promiseFocus();
}

/**
 * Wait for the account hub to open, check it has the right view, and close it.
 *
 * @param {string} viewName - The name of the expected view.
 */
async function promiseAccountHub(viewName) {
  const view = await TestUtils.waitForCondition(() => {
    const container = document.querySelector("account-hub-container");
    if (!container) {
      return false;
    }
    const dialog = container.shadowRoot.querySelector(
      ".account-hub-dialog[open]"
    );
    if (!dialog) {
      return false;
    }
    return dialog.querySelector(".account-hub-view:not([hidden])");
  }, "waiting for the account hub to open");
  Assert.equal(
    view.localName,
    viewName,
    "account hub should be open at the right view"
  );
  EventUtils.synthesizeKey("KEY_Escape", {}, window);
  await TestUtils.waitForTick();
}

/**
 * Wait for a tab to open, run a callback on it, and close it.
 *
 * @param {string} url - The URL of the expected tab.
 * @param {Function} [callback] - A callback to run once the tab is open and
 *   loaded. The callback takes the tab's window object as an argument.
 */
async function promiseTab(url, callback) {
  const {
    detail: { tabInfo },
  } = await BrowserTestUtils.waitForEvent(window, "TabOpen");
  await BrowserTestUtils.browserLoaded(tabInfo.browser);
  await TestUtils.waitForTick();

  Assert.equal(
    tabInfo.browser.currentURI.spec,
    url,
    "correct page should be loaded in the tab"
  );
  await callback?.(tabInfo.browser.contentWindow);

  tabmail.closeTab(tabInfo);
}

/**
 * Wait for the account manager to open, check that it has the right pane
 * selected, and close it.
 *
 * @param {string} accountTreeId - The ID of the expected pane.
 */
async function promiseAccountManager(accountTreeId) {
  await promiseTab("about:accountsettings", win => {
    Assert.equal(
      win.document.querySelector("#accounttree .current").id,
      accountTreeId,
      "server should be selected in the account tree"
    );
  });
}

/**
 * The common parts of the test that run on all server types.
 *
 * @param {nsIMsgIncomingServer} server
 */
async function subtest(server) {
  // Display the server's root folder and wait for account central to load.

  about3Pane.displayFolder(server.rootFolder);
  await TestUtils.waitForCondition(
    () =>
      accountCentralBrowser.contentDocument.readyState == "complete" &&
      accountCentralBrowser.currentURI.spec.endsWith(
        encodeURIComponent(server.serverURI)
      ),
    "waiting for account central document to load"
  );
  await TestUtils.waitForTick();

  const win = accountCentralBrowser.contentWindow;
  const doc = accountCentralBrowser.contentDocument;

  // Test the page title.

  Assert.equal(
    doc.getElementById("accountName").textContent,
    server.prettyName,
    "page header should match the account name"
  );

  // Test the buttons that should or should not be visible.

  for (const [id, types] of Object.entries(buttonData)) {
    const button = doc.getElementById(id);
    if (types === true || types.includes(server.type)) {
      Assert.ok(BrowserTestUtils.isVisible(button), `${id} should be visible`);
    } else {
      Assert.ok(BrowserTestUtils.isHidden(button), `${id} should be hidden`);
    }
  }

  // Test the account settings button.

  const amPromise = promiseAccountManager(
    MailServices.accounts.findAccountForServer(server).key
  );
  EventUtils.synthesizeMouseAtCenter(
    doc.getElementById("settingsButton"),
    {},
    win
  );
  await amPromise;

  // Test the search button.

  const searchPromise = promiseWindow(
    "chrome://messenger/content/SearchDialog.xhtml",
    async searchWin => {
      const folderPicker =
        searchWin.document.getElementById("searchableFolders");
      Assert.equal(
        folderPicker.value,
        server.rootFolder.URI,
        "server should be selected in the folder picker"
      );
    }
  );
  EventUtils.synthesizeMouseAtCenter(
    doc.getElementById("searchButton"),
    {},
    win
  );
  await searchPromise;

  // Test the filter button.

  const filtersPromise = promiseWindow(
    "chrome://messenger/content/FilterListDialog.xhtml",
    async filtersWin => {
      const serverPicker = filtersWin.document.getElementById("serverMenu");
      Assert.equal(
        serverPicker.value,
        server.rootFolder.URI,
        "server should be selected in the server picker"
      );
    }
  );
  EventUtils.synthesizeMouseAtCenter(
    doc.getElementById("filterButton"),
    {},
    win
  );
  await filtersPromise;
}

/**
 * Test a mail account. This should behave the same for all types of mail
 * account, but in this case a POP3 account is used because that is less likely
 * to cause the test to fail for reasons we don't care about (this test opens
 * the account's inbox, and that might cause checking for mail).
 */
add_task(async function testMail() {
  await subtest(pop3Server);
  const win = accountCentralBrowser.contentWindow;
  const doc = accountCentralBrowser.contentDocument;

  // Test the compose button.

  const composePromise = promiseWindow(
    "chrome://messenger/content/messengercompose/messengercompose.xhtml",
    async composeWin => {
      await TestUtils.waitForCondition(() => composeWin.gLoadingComplete);
    }
  );
  EventUtils.synthesizeMouseAtCenter(
    doc.getElementById("composeButton"),
    {},
    win
  );
  await composePromise;

  // Test the e2e button.

  const amPromise = promiseAccountManager(
    `${MailServices.accounts.findAccountForServer(pop3Server).key}/am-e2e.xhtml`
  );
  EventUtils.synthesizeMouseAtCenter(doc.getElementById("e2eButton"), {}, win);
  await amPromise;

  // Test the read messages button. Do this last, it changes the folder.

  const folderPromise = BrowserTestUtils.waitForEvent(
    window,
    "folderURIChanged"
  );
  EventUtils.synthesizeMouseAtCenter(doc.getElementById("readButton"), {}, win);
  await folderPromise;
  Assert.equal(
    tabmail.currentTabInfo.folder.URI,
    pop3Server.serverURI + "/Inbox"
  );
});

/**
 * Test a news account.
 */
add_task(async function testNews() {
  await subtest(nntpServer);
  const win = accountCentralBrowser.contentWindow;
  const doc = accountCentralBrowser.contentDocument;

  // Test the subscribe button.

  const subscribePromise = promiseWindow(
    "chrome://messenger/content/subscribe.xhtml",
    async subscribeWin => {
      const serverPicker = subscribeWin.document.getElementById("serverMenu");
      Assert.equal(
        serverPicker.value,
        nntpServer.rootFolder.URI,
        "server should be selected in the server picker"
      );
    }
  );
  EventUtils.synthesizeMouseAtCenter(
    doc.getElementById("nntpSubscriptionButton"),
    {},
    win
  );
  await subscribePromise;
  await SimpleTest.promiseFocus();
});

/**
 * Test a feeds account.
 */
add_task(async function testFeeds() {
  await subtest(rssServer);
  const win = accountCentralBrowser.contentWindow;
  const doc = accountCentralBrowser.contentDocument;

  // Test the subscribe button.

  const subscribePromise = promiseWindow(
    "chrome://messenger-newsblog/content/feed-subscriptions.xhtml"
  );
  EventUtils.synthesizeMouseAtCenter(
    doc.getElementById("rssSubscriptionButton"),
    {},
    win
  );
  await subscribePromise;
  await SimpleTest.promiseFocus();
});

/**
 * Test the local folders account. This task also checks the items which are
 * common to all account types.
 */
add_task(async function testLocal() {
  await subtest(localServer);
  const win = accountCentralBrowser.contentWindow;
  const doc = accountCentralBrowser.contentDocument;

  // Test "Set Up" buttons.

  const emailPromise = promiseAccountHub("account-hub-email");
  EventUtils.synthesizeMouseAtCenter(doc.getElementById("setupEmail"), {}, win);
  await emailPromise;

  const addressBookPromise = promiseAccountHub("account-hub-address-book");
  EventUtils.synthesizeMouseAtCenter(
    doc.getElementById("setupAddressBook"),
    {},
    win
  );
  await addressBookPromise;

  const calendarPromise = promiseWindow(
    "chrome://calendar/content/calendar-creation.xhtml"
  );
  EventUtils.synthesizeMouseAtCenter(
    doc.getElementById("setupCalendar"),
    {},
    win
  );
  await calendarPromise;

  const chatPromise = promiseWindow(
    "chrome://messenger/content/chat/imAccountWizard.xhtml"
  );
  EventUtils.synthesizeMouseAtCenter(doc.getElementById("setupChat"), {}, win);
  await chatPromise;

  const filelinkPromise = promiseTab("about:preferences#compose");
  EventUtils.synthesizeMouseAtCenter(
    doc.getElementById("setupFilelink"),
    {},
    win
  );
  await filelinkPromise;

  const feedsPromise = promiseWindow(
    "chrome://messenger-newsblog/content/feedAccountWizard.xhtml"
  );
  EventUtils.synthesizeMouseAtCenter(doc.getElementById("setupFeeds"), {}, win);
  await feedsPromise;

  const newsgroupsPromise = promiseWindow(
    "chrome://messenger/content/AccountWizard.xhtml"
  );
  EventUtils.synthesizeMouseAtCenter(
    doc.getElementById("setupNewsgroups"),
    {},
    win
  );
  await newsgroupsPromise;

  const importPromise = promiseTab("about:import#start");
  EventUtils.synthesizeMouseAtCenter(
    doc.getElementById("importButton"),
    {},
    win
  );
  await importPromise;

  // Test links.

  EventUtils.synthesizeMouseAtCenter(
    doc.getElementById("donationLink"),
    {},
    win
  );
  Assert.equal(
    MockExternalProtocolService.urls.length,
    1,
    "should have attempted to open exactly 1 URL in a browser"
  );
  Assert.ok(
    MockExternalProtocolService.urls[0].startsWith(
      "https://www.thunderbird.net/donate/"
    ),
    "should have attempted to open the right URL"
  );
  MockExternalProtocolService.urls.length = 0;

  for (const [id, url] of [
    ["supportLink", "https://support.mozilla.org/products/thunderbird"],
    ["involvedLink", "https://www.thunderbird.net/participate/"],
    ["developerLink", "https://developer.thunderbird.net/"],
  ]) {
    EventUtils.synthesizeMouseAtCenter(doc.getElementById(id), {}, win);
    MockExternalProtocolService.assertHasLoadedURL(url);
  }
});

/**
 * Test account central when the URL doesn't match any server. This version
 * shouldn't really ever be shown, but somehow it mysteriously still is.
 */
add_task(async function testFirstRun() {
  accountCentralBrowser.contentWindow.location =
    "chrome://messenger/content/msgAccountCentral.xhtml?folderURI=";
  await TestUtils.waitForCondition(
    () =>
      accountCentralBrowser.contentDocument.readyState == "complete" &&
      accountCentralBrowser.currentURI.spec.endsWith(".xhtml?folderURI="),
    "waiting for account central document to load"
  );
  await TestUtils.waitForTick();

  const win = accountCentralBrowser.contentWindow;
  const doc = accountCentralBrowser.contentDocument;

  // Test the version number displayed.

  Assert.equal(
    doc.getElementById("version").textContent,
    AppConstants.MOZ_APP_VERSION_DISPLAY,
    "Thunderbird version number should be correct"
  );

  // Test the about dialog is opened.

  const aboutPromise = promiseWindow(
    "chrome://messenger/content/aboutDialog.xhtml"
  );
  EventUtils.synthesizeMouseAtCenter(
    doc.getElementById("releasenotes"),
    {},
    win
  );
  await aboutPromise;
});
