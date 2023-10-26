// see https://www.w3.org/2000/10/rdf-tests/ for test files (including rss1)
// - test examples for all feed types
// - test items in test_download()
// - test rss1 feed with itunes `new-feed-url` redirect
// - test rss1 feed with RSS syndication extension tags (updatePeriod et al)
// - test multiple/missing authors (with fallback to feed title)
// - test missing dates
// - test content formatting

// Some RSS1 feeds in the wild:
// https://www.livejournal.com/stats/latest-rss.bml
// https://journals.sagepub.com/action/showFeed?ui=0&mi=ehikzz&ai=2b4&jc=acrc&type=etoc&feed=rss
// https://www.revolutionspodcast.com/index.rdf
// https://www.tandfonline.com/feed/rss/uasa20
// http://export.arxiv.org/rss/astro-ph
//   - uses html formatting in <dc:creator>

// Helper to compare feeditems.
function assertItemsEqual(got, expected) {
  Assert.equal(got.length, expected.length);
  for (let i = 0; i < expected.length; i++) {
    // Only check fields in expected. Means testdata can exclude "description" and other bulky fields.
    for (const k of Object.keys(expected[i])) {
      Assert.equal(got[i][k], expected[i][k]);
    }
  }
}

// Test the rss1 feed parser
add_task(async function test_rss1() {
  // Boilerplate.
  const account = FeedUtils.createRssAccount("test_rss1");
  const rootFolder = account.incomingServer.rootMsgFolder.QueryInterface(
    Ci.nsIMsgLocalMailFolder
  );
  const folder = rootFolder.createLocalSubfolder("folderofeeds");

  // These two files yield the same feed, but the second one has a sabotaged
  // <items> to simulate badly-encoded feeds seen in the wild.
  for (const testFile of [
    "resources/rss_7_1.rdf",
    "resources/rss_7_1_BORKED.rdf",
  ]) {
    dump(`checking ${testFile}\n`);
    // Would be nicer to use the test http server to fetch the file, but that
    // would involve XMLHTTPRequest. This is more concise.
    const doc = await do_parse_document(testFile, "application/xml");
    const feed = new Feed(
      "https://www.w3.org/2000/10/rdf-tests/RSS_1.0/rss_7_1.rdf",
      folder
    );
    feed.parseItems = true; // We want items too, not just the feed details.
    feed.onParseError = function (f) {
      throw new Error("PARSE ERROR");
    };
    const parser = new FeedParser();
    const items = parser.parseAsRSS1(feed, doc);

    // Check some channel details.
    Assert.equal(feed.title, "XML.com");
    Assert.equal(feed.link, "http://xml.com/pub");

    // Check the items (the titles and links at least!).
    assertItemsEqual(items, [
      {
        url: "http://xml.com/pub/2000/08/09/xslt/xslt.html",
        title: "Processing Inclusions with XSLT",
      },
      {
        url: "http://xml.com/pub/2000/08/09/rdfdb/index.html",
        title: "Putting RDF to Work",
      },
    ]);
  }
});

// Test feed downloading.
// Mainly checking that it doesn't crash and that the right feed parser is used.
add_task(async function test_download() {
  // Boilerplate
  const account = FeedUtils.createRssAccount("test_feed_download");
  const rootFolder = account.incomingServer.rootMsgFolder.QueryInterface(
    Ci.nsIMsgLocalMailFolder
  );

  // load & parse example rss feed
  // Feed object rejects anything other than http and https, so we're
  // running a local http server for testing (see head_feeds.js for it).
  const feedTests = [
    {
      url: "http://localhost:" + SERVER_PORT + "/rss_7_1.rdf",
      feedType: "RSS_1.xRDF",
      title: "XML.com",
      expectedItems: 2,
    },
    {
      // Has Japanese title with leading/trailing whitespace.
      url: "http://localhost:" + SERVER_PORT + "/rss2_example.xml",
      feedType: "RSS_2.0",
      title: "本当に簡単なシンジケーションの例",
      expectedItems: 1,
    },
    {
      // Has two items with same link but different guid (Bug 1656090).
      url: "http://localhost:" + SERVER_PORT + "/rss2_guid.xml",
      feedType: "RSS_2.0",
      title: "GUID test",
      expectedItems: 4,
    },
    // TODO: examples for the other feed types!
  ];

  let n = 1;
  for (const test of feedTests) {
    const folder = rootFolder.createLocalSubfolder("feed" + n);
    n++;
    const feed = new Feed(test.url, folder);

    const dl = new Promise(function (resolve, reject) {
      const cb = {
        downloaded(f, error, disable) {
          if (error != FeedUtils.kNewsBlogSuccess) {
            reject(
              new Error(`download failed (url=${feed.url} error=${error})`)
            );
            return;
          }
          // Feed has downloaded - make sure the right type was detected.
          Assert.equal(feed.mFeedType, test.feedType, "feed type matching");
          Assert.equal(feed.title, test.title, "title matching");
          // Make sure we're got the expected number of messages in the folder.
          const cnt = [...folder.messages].length;
          Assert.equal(cnt, test.expectedItems, "itemcount matching");

          resolve();
        },
        onProgress(f, loaded, total, lengthComputable) {},
      };

      feed.download(true, cb);
    });

    // Wait for this feed to complete downloading.
    await dl;
  }
});
