/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { FeedUtils } = ChromeUtils.importESModule(
  "resource:///modules/FeedUtils.sys.mjs"
);

const tabmail = document.getElementById("tabmail");
const about3Pane = tabmail.currentAbout3Pane;
let rssFeedFolder;

add_setup(async () => {
  document.getElementById("toolbar-menubar").removeAttribute("autohide");

  const feedAccount = FeedUtils.createRssAccount("rssBodyMode");
  const rssRootFolder = feedAccount.incomingServer.rootFolder;
  FeedUtils.subscribeToFeed(
    "https://example.org/browser/comm/mail/base/test/browser/files/rss.xml?feedBodyDisplay",
    rssRootFolder,
    null
  );
  await TestUtils.waitForCondition(() => rssRootFolder.subFolders.length == 2);
  rssFeedFolder = rssRootFolder.getChildNamed("Test Feed");

  registerCleanupFunction(() => {
    // Has to be false so the feed account counter goes up for subsequent tests.
    MailServices.accounts.removeAccount(feedAccount, false);
    document.getElementById("toolbar-menubar").setAttribute("autohide", "true");
  });
});

async function displayFeedMessage(websiteLoad = false) {
  about3Pane.displayFolder(rssFeedFolder);
  about3Pane.threadTree.selectedIndex = 0;
  if (websiteLoad) {
    const browser =
      about3Pane.messageBrowser.contentWindow.getMessagePaneBrowser();
    const url =
      "https://example.org/browser/comm/mail/base/test/browser/files/sampleContent.html";
    if (
      browser.contentDocument?.readyState != "complete" ||
      browser.currentURI?.spec != url
    ) {
      await BrowserTestUtils.browserLoaded(browser, false, url);
    }
  } else {
    await messageLoadedIn(about3Pane.messageBrowser);
  }
}

async function openBodyDisplayModeMenu(
  entryId,
  mainPopupId,
  displayAsMenuId,
  doc = document
) {
  const entryNode = doc.getElementById(entryId);
  if (entryNode.openMenu) {
    entryNode.openMenu(true);
  } else {
    EventUtils.synthesizeMouseAtCenter(entryNode, {}, doc.defaultView);
  }

  await BrowserTestUtils.waitForPopupEvent(
    doc.getElementById(mainPopupId),
    "shown"
  );

  const messageBodyAsMenu = doc.getElementById(displayAsMenuId);
  Assert.ok(
    BrowserTestUtils.isVisible(messageBodyAsMenu),
    `Message body as menu #${displayAsMenuId} available`
  );

  messageBodyAsMenu.openMenu(true);

  await BrowserTestUtils.waitForPopupEvent(
    messageBodyAsMenu.menupopup,
    "shown"
  );
}

async function subtestCycleThroughFeedFormat(
  entryId,
  mainPopupId,
  displayAsMenuId,
  webPageItemId,
  summaryItemId,
  folderSpecificItemId,
  doc = document
) {
  Assert.equal(
    Services.prefs.getIntPref("rss.show.summary"),
    1,
    "Pref should default to summary"
  );

  await openBodyDisplayModeMenu(entryId, mainPopupId, displayAsMenuId, doc);

  const displayAsMenuPopup = doc.getElementById(displayAsMenuId).menupopup;
  const webPageItem = doc.getElementById(webPageItemId);
  const summaryItem = doc.getElementById(summaryItemId);
  const folderSpecificItem = doc.getElementById(folderSpecificItemId);

  Assert.equal(
    summaryItem.getAttribute("checked"),
    "true",
    "Summary should be selected"
  );

  displayAsMenuPopup.activateItem(webPageItem);

  await BrowserTestUtils.waitForPopupEvent(displayAsMenuPopup, "hidden");

  Assert.equal(
    Services.prefs.getIntPref("rss.show.summary"),
    0,
    "Pref should be set to website"
  );

  const browser =
    about3Pane.messageBrowser.contentWindow.getMessagePaneBrowser();
  const url =
    "https://example.org/browser/comm/mail/base/test/browser/files/sampleContent.html";
  if (
    browser.contentDocument?.readyState != "complete" ||
    browser.currentURI?.spec != url
  ) {
    await BrowserTestUtils.browserLoaded(browser, false, url);
  }

  await openBodyDisplayModeMenu(entryId, mainPopupId, displayAsMenuId, doc);

  Assert.equal(
    webPageItem.getAttribute("checked"),
    "true",
    "Summary should be selected"
  );

  displayAsMenuPopup.activateItem(folderSpecificItem);

  await BrowserTestUtils.waitForPopupEvent(displayAsMenuPopup, "hidden");

  if (
    browser.contentDocument?.readyState != "complete" ||
    browser.currentURI?.spec != url
  ) {
    await BrowserTestUtils.browserLoaded(browser, false, url);
  }

  Assert.equal(
    Services.prefs.getIntPref("rss.show.summary"),
    2,
    "Pref should be set to folder based"
  );

  await openBodyDisplayModeMenu(entryId, mainPopupId, displayAsMenuId, doc);

  displayAsMenuPopup.activateItem(summaryItem);

  await BrowserTestUtils.waitForPopupEvent(displayAsMenuPopup, "hidden");
  await messageLoadedIn(about3Pane.messageBrowser);

  Assert.equal(
    Services.prefs.getIntPref("rss.show.summary"),
    1,
    "Pref should be set to summary"
  );
}

async function subtestSelectArticleAndCheckMode(website = false) {
  const browser =
    about3Pane.messageBrowser.contentWindow.getMessagePaneBrowser();

  await displayFeedMessage(website);

  if (website) {
    Assert.equal(
      browser.currentURI.spec,
      "https://example.org/browser/comm/mail/base/test/browser/files/sampleContent.html",
      "Should display web article"
    );
  } else {
    Assert.notEqual(
      browser.currentURI.spec,
      "https://example.org/browser/comm/mail/base/test/browser/files/sampleContent.html",
      "Should not display web article"
    );
  }
}

add_task(async function test_feedBodyFormat_messageHeader() {
  await displayFeedMessage();

  const doc = tabmail.currentAboutMessage.document;

  await subtestCycleThroughFeedFormat(
    "otherActionsButton",
    "otherActionsPopup",
    "otherActionsFeedBodyAs",
    "otherActionsMenu_bodyFeedGlobalWebPage",
    "otherActionsMenu_bodyFeedGlobalSummary",
    "otherActionsMenu_bodyFeedPerFolderPref",
    doc
  );
});

add_task(async function test_feedBodyFormat_menubar() {
  await displayFeedMessage();

  await subtestCycleThroughFeedFormat(
    "menu_View",
    "menu_View_Popup",
    "viewFeedSummary",
    "bodyFeedGlobalWebPage",
    "bodyFeedGlobalSummary",
    "bodyFeedPerFolderPref"
  );
}).skip(AppConstants.platform == "macosx"); // Can't click menu bar on Mac.

add_task(async function test_feedBodyFormat_selectWebsite() {
  Services.prefs.setIntPref("rss.show.summary", 0);

  await subtestSelectArticleAndCheckMode(true);

  about3Pane.threadTree.selectedIndex = -1; // Clear the displayed message.
  Services.prefs.clearUserPref("rss.show.summary");
});

add_task(async function test_feedBodyFormat_selectSummary() {
  Services.prefs.setIntPref("rss.show.summary", 1);

  await subtestSelectArticleAndCheckMode(false);

  about3Pane.threadTree.selectedIndex = -1; // Clear the displayed message.
  Services.prefs.clearUserPref("rss.show.summary");
});

add_task(async function test_feedBodyFormat_selectFolder() {
  Services.prefs.setIntPref("rss.show.summary", 2);

  await subtestSelectArticleAndCheckMode(true);

  about3Pane.threadTree.selectedIndex = -1; // Clear the displayed message.
  Services.prefs.clearUserPref("rss.show.summary");
});
