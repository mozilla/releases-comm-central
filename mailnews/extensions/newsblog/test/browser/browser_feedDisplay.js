/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { mailTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/MailTestUtils.jsm"
);
var { MockRegistrar } = ChromeUtils.import(
  "resource://testing-common/MockRegistrar.jsm"
);

add_task(async () => {
  function folderTreeClick(row, event = {}) {
    mailTestUtils.treeClick(EventUtils, window, folderTree, row, 0, event);
  }
  function threadTreeClick(row, event = {}) {
    mailTestUtils.treeClick(
      EventUtils,
      window,
      threadTree,
      row,
      threadTree.columns.subjectCol.index,
      event
    );
  }

  /** @implements {nsIExternalProtocolService} */
  let mockExternalProtocolService = {
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

  let mockExternalProtocolServiceCID = MockRegistrar.register(
    "@mozilla.org/uriloader/external-protocol-service;1",
    mockExternalProtocolService
  );

  registerCleanupFunction(() => {
    MockRegistrar.unregister(mockExternalProtocolServiceCID);

    // Some tests that open new windows don't return focus to the main window
    // in a way that satisfies mochitest, and the test times out.
    Services.focus.focusedWindow = window;
    window.threadTree.focus();
  });

  let folderTree = document.getElementById("folderTree");
  let threadTree = document.getElementById("threadTree");
  let messagePane = document.getElementById("messagepane");
  let menu = document.getElementById("folderPaneContext");
  let menuItem = document.getElementById("folderPaneContext-subscribe");

  let account = MailServices.accounts.getAccount("account1");
  let rootFolder = account.incomingServer.rootFolder;
  let index = window.gFolderTreeView.getIndexOfFolder(rootFolder);
  Assert.equal(index, 0);

  let shownPromise = BrowserTestUtils.waitForEvent(menu, "popupshown");
  folderTreeClick(index, { type: "mousedown", button: 2 });
  folderTreeClick(index, { type: "contextmenu" });
  folderTreeClick(index, { type: "mouseup", button: 2 });
  await shownPromise;

  let hiddenPromise = BrowserTestUtils.waitForEvent(menu, "popuphidden");
  let dialogPromise = BrowserTestUtils.promiseAlertDialog(
    null,
    "chrome://messenger-newsblog/content/feed-subscriptions.xhtml",
    {
      async callback(dialogWindow) {
        let dialogDocument = dialogWindow.document;

        let list = dialogDocument.getElementById("rssSubscriptionsList");
        let locationInput = dialogDocument.getElementById("locationValue");
        let addFeedButton = dialogDocument.getElementById("addFeed");

        await BrowserTestUtils.waitForEvent(list, "select");

        EventUtils.synthesizeMouseAtCenter(locationInput, {}, dialogWindow);
        await TestUtils.waitForCondition(() => !addFeedButton.disabled);
        EventUtils.sendString(
          "http://example.org/browser/comm/mailnews/extensions/newsblog/test/browser/data/rss.xml",
          dialogWindow
        );
        EventUtils.synthesizeKey("VK_TAB", {}, dialogWindow);

        // There's no good way to know if we're ready to continue.
        await new Promise(r => dialogWindow.setTimeout(r, 250));

        let hiddenPromise = BrowserTestUtils.waitForAttribute(
          "hidden",
          addFeedButton,
          "true"
        );
        EventUtils.synthesizeMouseAtCenter(addFeedButton, {}, dialogWindow);
        await hiddenPromise;

        EventUtils.synthesizeMouseAtCenter(
          dialogDocument.getElementById("close"),
          {},
          dialogWindow
        );
      },
    }
  );
  menu.activateItem(menuItem);
  await Promise.all([hiddenPromise, dialogPromise]);

  let folder = rootFolder.subFolders.find(f => f.name == "Test Feed");
  Assert.ok(folder);

  index = window.gFolderTreeView.getIndexOfFolder(folder);
  folderTreeClick(index);

  Assert.equal(threadTree.view.rowCount, 1);

  // Description mode.

  let loadedPromise = BrowserTestUtils.browserLoaded(messagePane);
  threadTreeClick(0);
  await loadedPromise;

  Assert.notEqual(messagePane.currentURI.spec, "about:blank");
  await SpecialPowers.spawn(messagePane, [], () => {
    let doc = content.document;

    let p = doc.querySelector("p");
    Assert.equal(p.textContent, "This is the description.");

    let style = content.getComputedStyle(doc.body);
    Assert.equal(style.backgroundColor, "rgba(0, 0, 0, 0)");

    let noscript = doc.querySelector("noscript");
    style = content.getComputedStyle(noscript);
    Assert.equal(style.display, "inline");
  });
  await BrowserTestUtils.synthesizeMouseAtCenter("a", {}, messagePane);
  Assert.deepEqual(mockExternalProtocolService._loadedURLs, [
    "http://example.org/link/from/description",
  ]);
  mockExternalProtocolService._loadedURLs.length = 0;

  // Web mode.

  loadedPromise = BrowserTestUtils.browserLoaded(messagePane);
  window.FeedMessageHandler.onSelectPref = 0;
  await loadedPromise;

  Assert.notEqual(messagePane.currentURI.spec, "about:blank");
  await SpecialPowers.spawn(messagePane, [], () => {
    let doc = content.document;

    let p = doc.querySelector("p");
    Assert.equal(p.textContent, "This is the article.");

    let style = content.getComputedStyle(doc.body);
    Assert.equal(style.backgroundColor, "rgb(0, 128, 0)");

    let noscript = doc.querySelector("noscript");
    style = content.getComputedStyle(noscript);
    Assert.equal(style.display, "none");
  });
  await BrowserTestUtils.synthesizeMouseAtCenter("a", {}, messagePane);
  Assert.deepEqual(mockExternalProtocolService._loadedURLs, [
    "http://example.org/link/from/article",
  ]);
  mockExternalProtocolService._loadedURLs.length = 0;

  // Clean up.

  shownPromise = BrowserTestUtils.waitForEvent(menu, "popupshown");
  folderTreeClick(index, { type: "mousedown", button: 2 });
  folderTreeClick(index, { type: "contextmenu" });
  folderTreeClick(index, { type: "mouseup", button: 2 });
  await shownPromise;

  hiddenPromise = BrowserTestUtils.waitForEvent(menu, "popuphidden");
  let promptPromise = BrowserTestUtils.promiseAlertDialog("accept");
  menuItem = document.getElementById("folderPaneContext-remove");
  menu.activateItem(menuItem);
  await Promise.all([hiddenPromise, promptPromise]);

  window.FeedMessageHandler.onSelectPref = 1;
});
