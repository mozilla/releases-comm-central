/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { FeedUtils } = ChromeUtils.importESModule(
  "resource:///modules/FeedUtils.sys.mjs"
);

const tabmail = document.getElementById("tabmail");
let rssFeedFolder;

add_setup(async () => {
  const feedURL =
    "https://example.org/browser/comm/mail/base/test/browser/files/rssScroll.xml?feedBodyScroll";
  const feedAccount = FeedUtils.createRssAccount("rssBodyMode");
  const rssRootFolder = feedAccount.incomingServer.rootFolder;
  FeedUtils.subscribeToFeed(feedURL, rssRootFolder, null);
  // Wait for Trash and "Test Feed" folders.
  await TestUtils.waitForCondition(() => rssRootFolder.subFolders.length == 2);
  rssFeedFolder = rssRootFolder.getChildNamed("Test Feed");
  Assert.ok(rssFeedFolder, "rssFeedFolder should exist after subscribe");

  registerCleanupFunction(() => {
    rssFeedFolder.deleteSelf(null);
    MailServices.accounts.removeAccount(feedAccount, true);
  });
});

async function displayFeedMessage() {
  const about3Pane = tabmail.currentAbout3Pane;
  about3Pane.displayFolder(rssFeedFolder);
  const testMessages = rssFeedFolder.messages;

  const [message] = testMessages;
  about3Pane.threadTree.selectedIndex = about3Pane.gDBView.findIndexOfMsgHdr(
    message,
    false
  );
  const browser =
    about3Pane.messageBrowser.contentDocument.getElementById("messagepane");
  const url =
    "https://example.org/browser/comm/mail/base/test/browser/files/sampleContentLong.html";
  if (
    browser.contentDocument?.readyState != "complete" ||
    browser.currentURI?.spec != url
  ) {
    await BrowserTestUtils.browserLoaded(browser, false, url);
  }
}

add_task(async function test_feedBodyScroll() {
  Services.prefs.setIntPref("rss.show.summary", 0);

  await displayFeedMessage(true);

  const about3Pane = tabmail.currentAbout3Pane;
  const browser =
    about3Pane.messageBrowser.contentDocument.getElementById("messagepane");

  /**
   * An object containing the scroll state in the Y direction of the window.
   *
   * @typedef {object} ScrollState
   * @property {integer} scrollY
   * @property {integer} scrollMaxY
   */

  /**
   * Scroll the window one page down by hitting spacebar until it reaches the
   * bottom.
   *
   * @param {integer} [value=0] - Initial scrollY value.
   * @returns {Promise<void>}
   */
  async function scrollDown(value = 0) {
    const scroll = await SpecialPowers.spawn(browser, [], async () => {
      const { promise, resolve } = Promise.withResolvers();
      content.addEventListener("scrollend", () => resolve(), { once: true });
      EventUtils.synthesizeKey(" ", {}, content);
      await promise;

      return {
        scrollY: Math.round(content.scrollY),
        scrollMaxY: Math.round(content.scrollMaxY),
      };
    });

    if (scroll.scrollY < scroll.scrollMaxY) {
      Assert.notEqual(scroll.scrollY, value, "Window has scrolled");
      await scrollDown(scroll.scrollY);
      return;
    }

    Assert.equal(
      scroll.scrollY,
      scroll.scrollMaxY,
      "Window has scrolled to bottom"
    );
  }

  await scrollDown();
  const nextItemLoaded = BrowserTestUtils.browserLoaded(
    browser,
    undefined,
    url => url.endsWith("sampleContent2.html")
  );
  // Click once more to load the next message.
  EventUtils.synthesizeKey(" ", {}, window);
  await nextItemLoaded;

  Services.prefs.clearUserPref("rss.show.summary");
});
