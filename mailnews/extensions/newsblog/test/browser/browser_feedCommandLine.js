/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests subscribing to feeds from urls passed on the command line, as happens
 * when a feed: link is opened from a web page.
 */

var { Feed } = ChromeUtils.importESModule("resource:///modules/Feed.sys.mjs");
var { FeedUtils } = ChromeUtils.importESModule(
  "resource:///modules/FeedUtils.sys.mjs"
);
var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

const DATA_URL =
  "http://mochi.test:8888/browser/comm/mailnews/extensions/newsblog/test/browser/data/";
const HTTP_FEED_URL = `${DATA_URL}rss.xml`;
const FILE_FEED_URL = PathUtils.toFileURI(
  PathUtils.join(
    getChromeDir(getResolvedURI(gTestPath)).path,
    "data",
    "rss.xml"
  )
);

const server = MailServices.accounts.getAccount("account1").incomingServer;
const rootFolder = server.rootFolder;

function handleCommandLine(url) {
  const cmdLine = Cu.createCommandLine(
    [url],
    null,
    Ci.nsICommandLine.STATE_REMOTE_EXPLICIT
  );
  Cc["@mozilla.org/mail/clh;1"]
    .getService(Ci.nsICommandLineHandler)
    .handle(cmdLine);
}

async function waitForSubscription(message) {
  await TestUtils.waitForCondition(
    () =>
      FeedUtils.progressNotifier.mNumPendingFeedDownloads == 0 &&
      FeedUtils.feedAlreadyExists(HTTP_FEED_URL, server),
    message
  );
}

function unsubscribe() {
  const sub = FeedUtils.getSubscriptionsDS(server).data.find(
    x => x.url == HTTP_FEED_URL
  );
  const folder = MailServices.folderLookup.getFolderForURL(sub.destFolder);
  FeedUtils.deleteFeed(new Feed(HTTP_FEED_URL, folder));
  rootFolder.propagateDelete(folder, true);
}

add_task(async function testSubscribeFromCommandLine() {
  for (const url of [`feed:${HTTP_FEED_URL}`, HTTP_FEED_URL]) {
    handleCommandLine(url);
    await waitForSubscription(`waiting for ${url} to be subscribed`);
    Assert.ok(
      FeedUtils.feedAlreadyExists(HTTP_FEED_URL, server),
      `${url} should be subscribed`
    );
    unsubscribe();
  }
});

add_task(async function testRejectNonHttpFromCommandLine() {
  const uncURL = "file://///test.invalid/share/feed.xml";
  for (const url of [
    `feed:${FILE_FEED_URL}`,
    `feed:${uncURL}`,
    `feed:feed:${FILE_FEED_URL}`,
  ]) {
    handleCommandLine(url);
    // Subscribe to a valid feed afterwards, so we know the url above has been
    // dealt with by the time it is subscribed.
    handleCommandLine(`feed:${HTTP_FEED_URL}`);
    await waitForSubscription(`the feed after ${url} should be subscribed`);
    Assert.ok(
      !FeedUtils.feedAlreadyExists(FILE_FEED_URL, server),
      `the local file feed should not be subscribed from ${url}`
    );
    Assert.ok(
      !FeedUtils.feedAlreadyExists(uncURL, server),
      `the UNC feed should not be subscribed from ${url}`
    );
    Assert.equal(
      FeedUtils.getSubscriptionsDS(server).data.length,
      1,
      "only the http feed should be subscribed"
    );
    unsubscribe();
  }
});

add_task(async function testNoRedirectToFile() {
  const url = `${DATA_URL}redirect.sjs?${encodeURIComponent(FILE_FEED_URL)}`;
  const code = await new Promise(resolve =>
    new Feed(url, rootFolder).download(false, {
      downloaded: (feed, errorCode) => resolve(errorCode),
      onProgress() {},
    })
  );
  Assert.equal(
    code,
    FeedUtils.kNewsBlogRequestFailure,
    "a redirect to a file: url should not be followed"
  );
});
