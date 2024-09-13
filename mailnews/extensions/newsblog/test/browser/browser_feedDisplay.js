/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
var { mailTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MailTestUtils.sys.mjs"
);
var { MockRegistrar } = ChromeUtils.importESModule(
  "resource://testing-common/MockRegistrar.sys.mjs"
);

/** @implements {nsIExternalProtocolService} */
const mockExternalProtocolService = {
  QueryInterface: ChromeUtils.generateQI(["nsIExternalProtocolService"]),
  _loadedURLs: [],
  loadURI(uri) {
    this._loadedURLs.push(uri.spec);
  },
  isExposedProtocol() {
    return true;
  },
  urlLoaded(url) {
    return this._loadedURLs.includes(url);
  },
};

const tabmail = document.getElementById("tabmail");
const about3Pane = tabmail.currentAbout3Pane;
const { folderTree, threadTree, messageBrowser } = about3Pane;

// Not `currentAboutMessage` as that's null right now.
const aboutMessage = messageBrowser.contentWindow;
const messagePane = aboutMessage.getMessagePaneBrowser();

const account = MailServices.accounts.getAccount("account1");
const rootFolder = account.incomingServer.rootFolder;

function folderTreeClick(row, event = {}) {
  EventUtils.synthesizeMouseAtCenter(
    folderTree.rows[row].querySelector(".name"),
    event,
    about3Pane
  );
}
function threadTreeClick(row, event = {}) {
  EventUtils.synthesizeMouseAtCenter(
    threadTree.getRowAtIndex(row),
    event,
    about3Pane
  );
}

/**
 * Select account1, bring up the subscription dialog and subscribe to
 * the given feed URL.
 *
 * @param {string} feedURL - The feed URL to subscribe to.
 * @returns {Promise} when subscription is done.
 */
async function subsribeToFeed(feedURL) {
  const account1 = MailServices.accounts.getAccount("account1");
  const account1RootFolder = account1.incomingServer.rootFolder;
  about3Pane.displayFolder(account1RootFolder.URI);
  const index = about3Pane.folderTree.selectedIndex;
  Assert.equal(index, 0, "index 0 (account1 root folder) should be selected");

  const menu = about3Pane.document.getElementById("folderPaneContext");
  const menuItem = about3Pane.document.getElementById(
    "folderPaneContext-subscribe"
  );
  const shownPromise = BrowserTestUtils.waitForEvent(menu, "popupshown");
  folderTreeClick(index, { type: "contextmenu" });
  await shownPromise;

  const hiddenPromise = BrowserTestUtils.waitForEvent(menu, "popuphidden");
  const dialogPromise = BrowserTestUtils.promiseAlertDialog(
    null,
    "chrome://messenger-newsblog/content/feed-subscriptions.xhtml",
    {
      async callback(dialogWindow) {
        const dialogDocument = dialogWindow.document;

        const list = dialogDocument.getElementById("rssSubscriptionsList");
        const locationInput = dialogDocument.getElementById("locationValue");
        const addFeedButton = dialogDocument.getElementById("addFeed");

        await BrowserTestUtils.waitForEvent(list, "select");

        EventUtils.synthesizeMouseAtCenter(locationInput, {}, dialogWindow);
        await TestUtils.waitForCondition(() => !addFeedButton.disabled);
        EventUtils.sendString(feedURL, dialogWindow);
        EventUtils.synthesizeKey("VK_TAB", {}, dialogWindow);

        // There's no good way to know if we're ready to continue.
        await new Promise(r => dialogWindow.setTimeout(r, 250));

        const feedButtonHiddenPRomise = BrowserTestUtils.waitForAttribute(
          "hidden",
          addFeedButton,
          "true"
        );
        EventUtils.synthesizeMouseAtCenter(addFeedButton, {}, dialogWindow);
        await feedButtonHiddenPRomise;

        EventUtils.synthesizeMouseAtCenter(
          dialogDocument.querySelector("dialog").getButton("accept"),
          {},
          dialogWindow
        );
      },
    }
  );
  menu.activateItem(menuItem);
  await Promise.all([hiddenPromise, dialogPromise]);
}

/**
 * Unsubscribes from the feed currently selected.
 *
 * @returns {Promise} when unsubscription is done.
 */
async function unsubscribeCurrentRow() {
  const menu = about3Pane.document.getElementById("folderPaneContext");
  const shownPromise = BrowserTestUtils.waitForEvent(menu, "popupshown");
  EventUtils.synthesizeMouseAtCenter(
    about3Pane.folderTree.selectedRow,
    { type: "contextmenu" },
    about3Pane
  );
  await shownPromise;

  const hiddenPromise = BrowserTestUtils.waitForEvent(menu, "popuphidden");
  const promptPromise = BrowserTestUtils.promiseAlertDialog("accept");
  const menuItem = about3Pane.document.getElementById(
    "folderPaneContext-remove"
  );
  menu.activateItem(menuItem);
  await Promise.all([hiddenPromise, promptPromise]);
}

add_setup(async () => {
  const mockExternalProtocolServiceCID = MockRegistrar.register(
    "@mozilla.org/uriloader/external-protocol-service;1",
    mockExternalProtocolService
  );

  registerCleanupFunction(() => {
    MockRegistrar.unregister(mockExternalProtocolServiceCID);

    // Some tests that open new windows don't return focus to the main window
    // in a way that satisfies mochitest, and the test times out.
    Services.focus.focusedWindow = about3Pane;
  });
});

add_task(async function testRSS() {
  await subsribeToFeed(
    "https://example.org/browser/comm/mailnews/extensions/newsblog/test/browser/data/rss.xml"
  );

  about3Pane.displayFolder(rootFolder.URI);

  const folder = rootFolder.subFolders.find(f => f.name == "Test Feed");
  Assert.ok(folder, "should have added feed folder");

  about3Pane.displayFolder(folder.URI);
  Assert.equal(threadTree.view.rowCount, 1, "feed should list one item");
  await TestUtils.waitForCondition(
    () => threadTree.table.body.childElementCount == threadTree.view.rowCount,
    "waiting for rows to load in the thread tree"
  );

  // Description mode.

  let loadedPromise = BrowserTestUtils.browserLoaded(messagePane);
  threadTreeClick(0);
  await loadedPromise;

  Assert.notEqual(messagePane.currentURI.spec, "about:blank");
  await SpecialPowers.spawn(messagePane, [], () => {
    const doc = content.document;

    const p = doc.querySelector("p");
    Assert.equal(p.textContent, "This is the description.");

    let style = content.getComputedStyle(doc.body);
    Assert.equal(style.backgroundColor, "rgba(0, 0, 0, 0)");

    const noscript = doc.querySelector("noscript");
    style = content.getComputedStyle(noscript);
    Assert.equal(style.display, "inline");
  });

  Assert.ok(
    aboutMessage.document.getElementById("expandedtoRow").hidden,
    "The To field is not visible"
  );
  Assert.equal(
    aboutMessage.document.getElementById("dateLabel").textContent,
    aboutMessage.document.getElementById("dateLabelSubject").textContent,
    "The regular date label and the subject date have the same value"
  );
  Assert.ok(
    BrowserTestUtils.isHidden(
      aboutMessage.document.getElementById("dateLabel"),
      "The regular date label is not visible"
    )
  );
  Assert.ok(
    BrowserTestUtils.isVisible(
      aboutMessage.document.getElementById("dateLabelSubject")
    ),
    "The date label on the subject line is visible"
  );

  await BrowserTestUtils.synthesizeMouseAtCenter("a", {}, messagePane);
  Assert.deepEqual(mockExternalProtocolService._loadedURLs, [
    "https://example.org/link/from/description",
  ]);
  mockExternalProtocolService._loadedURLs.length = 0;

  // Web mode.

  loadedPromise = BrowserTestUtils.browserLoaded(
    messagePane,
    false,
    "https://example.org/browser/comm/mailnews/extensions/newsblog/test/browser/data/article.html"
  );
  window.FeedMessageHandler.onSelectPref = 0;
  await loadedPromise;

  await SpecialPowers.spawn(messagePane, [], () => {
    const doc = content.document;

    const p = doc.querySelector("p");
    Assert.equal(p.textContent, "This is the article.");

    let style = content.getComputedStyle(doc.body);
    Assert.equal(style.backgroundColor, "rgb(0, 128, 0)");

    const noscript = doc.querySelector("noscript");
    style = content.getComputedStyle(noscript);
    Assert.equal(style.display, "none");
  });
  await BrowserTestUtils.synthesizeMouseAtCenter("a", {}, messagePane);
  Assert.deepEqual(mockExternalProtocolService._loadedURLs, [
    "https://example.org/link/from/article",
  ]);
  mockExternalProtocolService._loadedURLs.length = 0;

  // Clean up.

  await unsubscribeCurrentRow();
  window.FeedMessageHandler.onSelectPref = 1;
  folderTree.selectedIndex = 0;
});

add_task(async function testSubscribeSampleRss2() {
  await subsribeToFeed(
    "https://example.org/browser/comm/mailnews/extensions/newsblog/test/browser/data/sample-rss-2.xml"
  );

  const folder = rootFolder.subFolders.find(
    f => f.name == "NASA Space Station News"
  );
  Assert.ok(folder, "should have added rss2 folder");
  about3Pane.displayFolder(folder.URI);
  Assert.equal(threadTree.view.rowCount, 5, "feed should have five items");
  await TestUtils.waitForCondition(
    () => threadTree.table.body.childElementCount == threadTree.view.rowCount,
    "waiting for rows to load in the thread tree"
  );

  await unsubscribeCurrentRow();
});

add_task(async function testSubscribeSampleRss092() {
  await subsribeToFeed(
    "https://example.org/browser/comm/mailnews/extensions/newsblog/test/browser/data/sample-rss-092.xml"
  );

  const folder = rootFolder.subFolders.find(
    f => f.name == "Winnemac Daily News"
  );
  Assert.ok(folder, "should have added rss 0.92 folder");

  about3Pane.displayFolder(folder.URI);
  Assert.equal(threadTree.view.rowCount, 15, "feed should have fifteen items");
  await TestUtils.waitForCondition(
    () => threadTree.table.body.childElementCount == threadTree.view.rowCount,
    "waiting for rows to load in the thread tree"
  );

  await unsubscribeCurrentRow();
});

add_task(async function testSubscribeRss2EmptyTitleDesc() {
  await subsribeToFeed(
    "https://example.org/browser/comm/mailnews/extensions/newsblog/test/browser/data/rss2-empty-title-desc.xml"
  );

  // Has no title and no description, should fall back to link, and link
  // should get sanitized. Link is https://example.org/blog/empty-title
  const folder = rootFolder.subFolders.find(
    f => f.name == "example.org - blogempty-title"
  );
  Assert.ok(folder, "should have added rss empty title folder");

  about3Pane.displayFolder(folder.URI);
  Assert.equal(threadTree.view.rowCount, 1, "feed should have fifteen items");
  await TestUtils.waitForCondition(
    () => threadTree.table.body.childElementCount == threadTree.view.rowCount,
    "waiting for rows to load in the thread tree"
  );

  await unsubscribeCurrentRow();
});
