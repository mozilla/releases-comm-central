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
  const feedAccount = FeedUtils.createRssAccount("rssBodyMode");
  const rssRootFolder = feedAccount.incomingServer.rootFolder;
  FeedUtils.subscribeToFeed(
    "https://example.org/browser/comm/mail/base/test/browser/files/rssScroll.xml?feedBodyScroll",
    rssRootFolder,
    null
  );
  await TestUtils.waitForCondition(() => rssRootFolder.subFolders.length == 2);
  rssFeedFolder = rssRootFolder.getChildNamed("Test Feed");

  registerCleanupFunction(() => {
    // Has to be false so the feed account counter goes up for subsequent tests.
    MailServices.accounts.removeAccount(feedAccount, false);
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
   * @property {number} scrollY
   * @property {boolean} scrollMaxY
   */

  /**
   * Scroll the window 1 page at a time by hitting spacebar until it reaches the
   * bottom. Once it reaches the bottom hit spacebar one more time to trigger
   * loading the next message.
   *
   * @param {number} [value=0]
   * @returns {Promise<?ScrollState>}
   */
  async function checkScroll(value = 0) {
    EventUtils.synthesizeKey(" ", {}, window);
    const scroll = await SpecialPowers.spawn(browser, [], async () => {
      const { promise, resolve } = Promise.withResolvers();
      content.addEventListener(
        "scroll",
        () => {
          resolve();
        },
        { once: true }
      );

      await promise;

      return {
        scrollY: Math.round(content.scrollY),
        scrollMaxY: Math.round(content.scrollMaxY),
      };
    });

    if (scroll.scrollY < scroll.scrollMaxY) {
      Assert.notEqual(scroll.scrollY, value, "Window has scrolled");
      return checkScroll(scroll.scrollY);
    }

    Assert.equal(
      scroll.scrollY,
      scroll.scrollMaxY,
      "Window has scrolled to bottom"
    );

    return EventUtils.synthesizeKey(" ", {}, window);
  }

  await checkScroll();

  await BrowserTestUtils.browserLoaded(browser, undefined, url => {
    return url.endsWith("sampleContent2.html");
  });

  Services.prefs.clearUserPref("rss.show.summary");
});
