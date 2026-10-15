/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that a feed download is aborted when the server stops sending data,
 * and that a slow but progressing download is allowed to complete.
 */

const { setTimeout } = ChromeUtils.importESModule(
  "resource://gre/modules/Timer.sys.mjs"
);

const FEED_DOC = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Timeout test</title>
    <link>http://localhost/</link>
    <description>Timeout test</description>
    <item>
      <title>Item</title>
      <link>http://localhost/item</link>
      <guid>http://localhost/item</guid>
    </item>
  </channel>
</rss>
`;

let rootFolder;
const stalledResponses = [];

add_setup(function () {
  const originalTimeout = FeedUtils.REQUEST_TIMEOUT;
  FeedUtils.REQUEST_TIMEOUT = 1000;

  httpServer.registerPathHandler("/stalled.xml", (request, response) => {
    response.processAsync();
    response.setHeader("Content-Type", "application/rss+xml", false);
    response.setHeader("Content-Length", String(FEED_DOC.length), false);
    response.write(FEED_DOC.substring(0, 26));
    stalledResponses.push(response);
  });

  httpServer.registerPathHandler("/trickle.xml", (request, response) => {
    response.processAsync();
    response.setHeader("Content-Type", "application/rss+xml", false);
    response.setHeader("Content-Length", String(FEED_DOC.length), false);
    const chunkSize = Math.ceil(FEED_DOC.length / 6);
    let offset = 0;
    const writeChunk = () => {
      response.write(FEED_DOC.substring(offset, offset + chunkSize));
      offset += chunkSize;
      if (offset < FEED_DOC.length) {
        // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
        setTimeout(writeChunk, 400);
      } else {
        response.finish();
      }
    };
    writeChunk();
  });

  const account = FeedUtils.createRssAccount("test_feed_download_timeout");
  rootFolder = account.incomingServer.rootMsgFolder.QueryInterface(
    Ci.nsIMsgLocalMailFolder
  );

  registerCleanupFunction(() => {
    FeedUtils.REQUEST_TIMEOUT = originalTimeout;
    for (const response of stalledResponses) {
      response.finish();
    }
  });
});

function download(url, folderName) {
  const feed = new Feed(url, rootFolder.createLocalSubfolder(folderName));
  return new Promise(resolve => {
    feed.download(true, {
      downloaded(f, error) {
        resolve(error);
      },
      onProgress() {},
    });
  });
}

add_task(async function test_stalled_partial_response() {
  const url = `http://localhost:${SERVER_PORT}/stalled.xml`;
  const error = await download(url, "stalled");
  Assert.equal(
    error,
    FeedUtils.kNewsBlogRequestFailure,
    "a stalled download should fail with a request failure"
  );

  const retryError = await download(url, "stalled2");
  Assert.notEqual(
    retryError,
    FeedUtils.kNewsBlogFeedIsBusy,
    "the stalled feed should no longer be busy"
  );
});

add_task(async function test_slow_progressing_response() {
  const url = `http://localhost:${SERVER_PORT}/trickle.xml`;
  const error = await download(url, "trickle");
  Assert.equal(
    error,
    FeedUtils.kNewsBlogSuccess,
    "a slow download that keeps receiving data should succeed"
  );
});
