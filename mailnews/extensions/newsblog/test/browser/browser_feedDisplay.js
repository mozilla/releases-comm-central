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

add_task(async () => {
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

  /** @implements {nsIExternalProtocolService} */
  const mockExternalProtocolService = {
    QueryInterface: ChromeUtils.generateQI(["nsIExternalProtocolService"]),
    _loadedURLs: [],
    loadURI(uri, windowContext) {
      this._loadedURLs.push(uri.spec);
    },
    isExposedProtocol(scheme) {
      return true;
    },
    urlLoaded(url) {
      return this._loadedURLs.includes(url);
    },
  };

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

  const tabmail = document.getElementById("tabmail");
  const about3Pane = tabmail.currentAbout3Pane;
  const { folderTree, threadTree, messageBrowser } = about3Pane;
  const menu = about3Pane.document.getElementById("folderPaneContext");
  let menuItem = about3Pane.document.getElementById(
    "folderPaneContext-subscribe"
  );
  // Not `currentAboutMessage` as that's null right now.
  const aboutMessage = messageBrowser.contentWindow;
  const messagePane = aboutMessage.getMessagePaneBrowser();

  const account = MailServices.accounts.getAccount("account1");
  const rootFolder = account.incomingServer.rootFolder;
  about3Pane.displayFolder(rootFolder.URI);
  let index = about3Pane.folderTree.selectedIndex;
  Assert.equal(index, 0);

  let shownPromise = BrowserTestUtils.waitForEvent(menu, "popupshown");
  folderTreeClick(index, { type: "contextmenu" });
  await shownPromise;

  let hiddenPromise = BrowserTestUtils.waitForEvent(menu, "popuphidden");
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
        EventUtils.sendString(
          "https://example.org/browser/comm/mailnews/extensions/newsblog/test/browser/data/rss.xml",
          dialogWindow
        );
        EventUtils.synthesizeKey("VK_TAB", {}, dialogWindow);

        // There's no good way to know if we're ready to continue.
        await new Promise(r => dialogWindow.setTimeout(r, 250));

        const hiddenPromise = BrowserTestUtils.waitForAttribute(
          "hidden",
          addFeedButton,
          "true"
        );
        EventUtils.synthesizeMouseAtCenter(addFeedButton, {}, dialogWindow);
        await hiddenPromise;

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

  const folder = rootFolder.subFolders.find(f => f.name == "Test Feed");
  Assert.ok(folder);

  about3Pane.displayFolder(folder.URI);
  index = folderTree.selectedIndex;
  Assert.equal(threadTree.view.rowCount, 1);
  await TestUtils.waitForCondition(
    () => threadTree.table.body.childElementCount == 1,
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

  shownPromise = BrowserTestUtils.waitForEvent(menu, "popupshown");
  EventUtils.synthesizeMouseAtCenter(
    about3Pane.folderTree.selectedRow,
    { type: "contextmenu" },
    about3Pane
  );
  await shownPromise;

  hiddenPromise = BrowserTestUtils.waitForEvent(menu, "popuphidden");
  const promptPromise = BrowserTestUtils.promiseAlertDialog("accept");
  menuItem = about3Pane.document.getElementById("folderPaneContext-remove");
  menu.activateItem(menuItem);
  await Promise.all([hiddenPromise, promptPromise]);

  window.FeedMessageHandler.onSelectPref = 1;

  folderTree.selectedIndex = 0;
});
