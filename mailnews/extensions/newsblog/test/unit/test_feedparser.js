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
    feed.onParseError = function () {
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

// Test that the Atom parser prefers <published> over <updated> for the item
// date, falling back to <updated> when <published> is absent
// Like YouTube feeds.
add_task(async function test_atom_dates() {
  const account = FeedUtils.createRssAccount("test_atom_dates");
  const rootFolder = account.incomingServer.rootMsgFolder.QueryInterface(
    Ci.nsIMsgLocalMailFolder
  );
  const folder = rootFolder.createLocalSubfolder("atomdates");

  const doc = await do_parse_document("resources/atom_dates.xml", "text/xml");
  const feed = new Feed("https://example.com/atom_dates.xml", folder);
  feed.parseItems = true;
  feed.onParseError = function () {
    throw new Error("PARSE ERROR");
  };
  const parser = new FeedParser();
  const items = parser.parseAsAtomIETF(feed, doc);

  assertItemsEqual(items, [
    {
      title: "Has both dates",
      date: "2026-03-17T17:35:43+00:00",
    },
    {
      title: "Only updated",
      date: "2026-05-04T16:56:28+00:00",
    },
  ]);
});

// Same as test_atom_dates, but for the older Atom 0.3 parser, where <issued>
// is the publication date and <modified> the last-changed date.
add_task(async function test_atom03_dates() {
  const account = FeedUtils.createRssAccount("test_atom03_dates");
  const rootFolder = account.incomingServer.rootMsgFolder.QueryInterface(
    Ci.nsIMsgLocalMailFolder
  );
  const folder = rootFolder.createLocalSubfolder("atom03dates");

  const doc = await do_parse_document("resources/atom03_dates.xml", "text/xml");
  const feed = new Feed("https://example.com/atom03_dates.xml", folder);
  feed.parseItems = true;
  feed.onParseError = function () {
    throw new Error("PARSE ERROR");
  };
  const parser = new FeedParser();
  const items = parser.parseAsAtom(feed, doc);

  assertItemsEqual(items, [
    {
      title: "Has both dates",
      date: "2026-03-17T17:35:43Z",
    },
    {
      title: "Only modified",
      date: "2026-05-04T16:56:28Z",
    },
  ]);
});

// Test that an Atom 1.0 document without a <feed> root is rejected.
add_task(async function test_atom_entry_root() {
  const account = FeedUtils.createRssAccount("test_atom_entry_root");
  const rootFolder = account.incomingServer.rootMsgFolder.QueryInterface(
    Ci.nsIMsgLocalMailFolder
  );
  const folder = rootFolder.createLocalSubfolder("atomentryroot");

  const doc = await do_parse_document(
    "resources/atom_entry_root.xml",
    "text/xml"
  );
  const feed = new Feed("https://example.com/atom_entry_root.xml", folder);
  feed.parseItems = true;
  let parseErrors = 0;
  feed.onParseError = function () {
    parseErrors++;
  };
  const parser = new FeedParser();
  const items = parser.parseFeed(feed, doc);

  Assert.equal(feed.mFeedType, "ATOM_IETF", "feed type should be Atom 1.0");
  Assert.equal(items.length, 0, "there should be no items");
  Assert.equal(parseErrors, 1, "onParseError should be called once");
});

// Test that an exception thrown while parsing a downloaded feed is reported
// as an invalid feed and doesn't leave the feed busy.
add_task(async function test_download_parse_exception() {
  const account = FeedUtils.createRssAccount("test_parse_exception");
  const rootFolder = account.incomingServer.rootMsgFolder.QueryInterface(
    Ci.nsIMsgLocalMailFolder
  );
  const folder = rootFolder.createLocalSubfolder("parseexception");
  const url = "http://localhost:" + SERVER_PORT + "/rss2_example.xml";

  const download = () =>
    new Promise(resolve => {
      new Feed(url, folder).download(true, {
        downloaded(feed, error) {
          resolve(error);
        },
        onProgress() {},
      });
    });

  const originalParseFeed = FeedParser.prototype.parseFeed;
  FeedParser.prototype.parseFeed = function () {
    throw new Error("Simulated parser failure");
  };
  let error;
  try {
    error = await download();
  } finally {
    FeedParser.prototype.parseFeed = originalParseFeed;
  }
  Assert.equal(
    error,
    FeedUtils.kNewsBlogInvalidFeed,
    "a parser exception should be reported as an invalid feed"
  );

  Assert.equal(
    await download(),
    FeedUtils.kNewsBlogSuccess,
    "the feed should be downloadable again after a parser exception"
  );
});

add_task(async function test_rss2_duplicate_media_content() {
  const account = FeedUtils.createRssAccount(
    "test_rss2_duplicate_media_content"
  );
  const rootFolder = account.incomingServer.rootMsgFolder.QueryInterface(
    Ci.nsIMsgLocalMailFolder
  );
  const folder = rootFolder.createLocalSubfolder("duplicate-media-content");

  const doc = await do_parse_document(
    "resources/rss2_media_duplicate.xml",
    "application/xml"
  );
  const feed = new Feed("https://example.com/feed.xml", folder);
  feed.parseItems = true;
  feed.onParseError = function () {
    throw new Error("PARSE ERROR");
  };

  const items = new FeedParser().parseAsRSS2(feed, doc);
  Assert.equal(items.length, 1);
  Assert.equal(items[0].enclosures.length, 1);
  Assert.equal(items[0].enclosures[0].mURL, "https://example.com/audio.mp3");
});

// Test that a large number of enclosures is deduplicated, keeping order.
add_task(async function test_many_enclosures() {
  const account = FeedUtils.createRssAccount("test_many_enclosures");
  const rootFolder = account.incomingServer.rootMsgFolder.QueryInterface(
    Ci.nsIMsgLocalMailFolder
  );
  const folder = rootFolder.createLocalSubfolder("many-enclosures");
  const count = 20000;
  const urls = Array.from(
    { length: count },
    (_, i) => `https://example.com/enc${i}.mp3`
  );
  const expected = [...urls, urls[0]];

  const rss = `<?xml version="1.0"?>
    <rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
      <channel>
        <title>Many enclosures</title>
        <link>https://example.com/</link>
        <item>
          <title>Item</title>
          <link>https://example.com/item</link>
          ${expected.map(u => `<enclosure url="${u}" type="audio/mpeg" length="1"/>`).join("")}
          ${expected.map(u => `<media:content url="${u}" type="audio/mpeg"/>`).join("")}
        </item>
      </channel>
    </rss>`;
  const feed = new Feed("https://example.com/rss.xml", folder);
  feed.parseItems = true;
  feed.onParseError = function () {
    throw new Error("PARSE ERROR");
  };
  let items = new FeedParser().parseAsRSS2(
    feed,
    new DOMParser().parseFromString(rss, "application/xml")
  );
  Assert.equal(items.length, 1, "there should be one RSS item");
  Assert.equal(
    items[0].enclosures.length,
    count,
    "RSS duplicate enclosures should be dropped"
  );
  Assert.ok(
    items[0].enclosures.every((e, i) => e.mURL == urls[i]),
    "RSS enclosures should be in document order"
  );

  const atom = `<?xml version="1.0"?>
    <feed xmlns="http://www.w3.org/2005/Atom">
      <id>urn:many-enclosures</id>
      <title>Many enclosures</title>
      <updated>2026-01-01T00:00:00Z</updated>
      <entry>
        <id>urn:many-enclosures:1</id>
        <title>Entry</title>
        <updated>2026-01-01T00:00:00Z</updated>
        <link href="https://example.com/entry"/>
        ${expected.map(u => `<link rel="enclosure" href="${u}" type="audio/mpeg" length="1"/>`).join("")}
      </entry>
    </feed>`;
  const atomFeed = new Feed("https://example.com/atom.xml", folder);
  atomFeed.parseItems = true;
  atomFeed.onParseError = function () {
    throw new Error("PARSE ERROR");
  };
  items = new FeedParser().parseAsAtomIETF(
    atomFeed,
    new DOMParser().parseFromString(atom, "application/xml")
  );
  Assert.equal(items.length, 1, "there should be one Atom entry");
  Assert.equal(
    items[0].enclosures.length,
    count,
    "Atom duplicate enclosures should be dropped"
  );
  Assert.ok(
    items[0].enclosures.every((e, i) => e.mURL == urls[i]),
    "Atom enclosures should be in document order"
  );
});

// Test that a large number of categories is deduplicated, keeping order.
add_task(async function test_many_categories() {
  const account = FeedUtils.createRssAccount("test_many_categories");
  const rootFolder = account.incomingServer.rootMsgFolder.QueryInterface(
    Ci.nsIMsgLocalMailFolder
  );
  const folder = rootFolder.createLocalSubfolder("many-categories");
  const count = 20000;
  const terms = Array.from({ length: count }, (_, i) => `category${i}`);
  const expected = [...terms, terms[0]];

  const rss = `<?xml version="1.0"?>
    <rss version="2.0">
      <channel>
        <title>Many categories</title>
        <link>https://example.com/</link>
        <item>
          <title>Item</title>
          <link>https://example.com/item</link>
          ${expected.map(t => `<category>${t}</category>`).join("")}
        </item>
      </channel>
    </rss>`;
  const feed = new Feed("https://example.com/rss.xml", folder);
  feed.parseItems = true;
  feed.onParseError = function () {
    throw new Error("PARSE ERROR");
  };
  let items = new FeedParser().parseAsRSS2(
    feed,
    new DOMParser().parseFromString(rss, "application/xml")
  );
  Assert.equal(items.length, 1, "there should be one RSS item");
  Assert.equal(
    items[0].keywords.length,
    count,
    "RSS duplicate categories should be dropped"
  );
  Assert.ok(
    items[0].keywords.every((k, i) => k == terms[i]),
    "RSS categories should be in document order"
  );

  const atom = `<?xml version="1.0"?>
    <feed xmlns="http://www.w3.org/2005/Atom">
      <id>urn:many-categories</id>
      <title>Many categories</title>
      <updated>2026-01-01T00:00:00Z</updated>
      <entry>
        <id>urn:many-categories:1</id>
        <title>Entry</title>
        <updated>2026-01-01T00:00:00Z</updated>
        <link href="https://example.com/entry"/>
        ${expected.map(t => `<category term="${t}"/>`).join("")}
      </entry>
    </feed>`;
  const atomFeed = new Feed("https://example.com/atom.xml", folder);
  atomFeed.parseItems = true;
  atomFeed.onParseError = function () {
    throw new Error("PARSE ERROR");
  };
  items = new FeedParser().parseAsAtomIETF(
    atomFeed,
    new DOMParser().parseFromString(atom, "application/xml")
  );
  Assert.equal(items.length, 1, "there should be one Atom entry");
  Assert.equal(
    items[0].keywords.length,
    count,
    "Atom duplicate categories should be dropped"
  );
  Assert.ok(
    items[0].keywords.every((k, i) => k == terms[i]),
    "Atom categories should be in document order"
  );
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
        downloaded(f, error) {
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
        onProgress() {},
      };

      feed.download(true, cb);
    });

    // Wait for this feed to complete downloading.
    await dl;
  }
});

add_task(function test_stripTags() {
  const parser = new FeedParser();
  Assert.equal(
    parser.stripTags("<p>Some <b>bold</b> text</p>"),
    "Some bold text",
    "tags should be removed"
  );
  Assert.equal(
    parser.stripTags("1 < 2 <i>and</i> 3 > 2"),
    "1 < 2 and 3 > 2",
    "a < that doesn't start a tag should be kept"
  );
  const unclosed = "<".repeat(100000);
  Assert.equal(
    parser.stripTags(unclosed),
    unclosed,
    "many unclosed < should be kept"
  );
});

// Test that an <itunes:new-feed-url> redirect is only followed to a remote url.
// This redirect is handled on the Thunderbird side.
add_task(async function test_new_feed_url_redirect() {
  const account = FeedUtils.createRssAccount("test_new_feed_url_redirect");
  const rootFolder = account.incomingServer.rootMsgFolder.QueryInterface(
    Ci.nsIMsgLocalMailFolder
  );

  httpServer.registerPathHandler("/redirect.xml", (request, response) => {
    const target = decodeURIComponent(request.queryString);
    response.setHeader("Content-Type", "application/rss+xml", false);
    response.write(`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
<channel>
  <title>Redirect test</title>
  <link>http://www.example.com/</link>
  <itunes:new-feed-url>${target}</itunes:new-feed-url>
  <item>
    <title>Item</title>
    <link>http://www.example.com/item</link>
    <guid isPermaLink="false">redirect-test-item</guid>
  </item>
</channel>
</rss>`);
  });

  const tests = [
    { target: "file:///tmp/local.xml", redirected: false },
    { target: "file://///192.0.2.1/share/unc.xml", redirected: false },
    { target: "https://example.com/new.xml", redirected: true },
  ];

  let n = 1;
  for (const test of tests) {
    const folder = rootFolder.createLocalSubfolder("redirect" + n++);
    const url = `http://localhost:${SERVER_PORT}/redirect.xml?${encodeURIComponent(test.target)}`;
    const feed = new Feed(url, folder);
    FeedUtils.addFeed(feed);

    const error = await new Promise(resolve => {
      feed.download(true, {
        downloaded(f, aError) {
          resolve(aError);
        },
        onProgress() {},
      });
    });

    Assert.deepEqual(
      FeedUtils.getFeedUrlsInFolder(folder),
      [test.redirected ? test.target : url],
      `subscription url should be correct for target ${test.target}`
    );
    Assert.equal(
      error,
      test.redirected ? FeedUtils.kNewsBlogCancel : FeedUtils.kNewsBlogSuccess,
      `download result should be correct for target ${test.target}`
    );
  }
});

// Test that an http redirect to a local file is not followed.
// This is handled on the Gecko side.
add_task(async function test_http_redirect_to_file() {
  const account = FeedUtils.createRssAccount("test_http_redirect_to_file");
  const rootFolder = account.incomingServer.rootMsgFolder.QueryInterface(
    Ci.nsIMsgLocalMailFolder
  );
  const folder = rootFolder.createLocalSubfolder("httpredirect");

  const fileUrl = Services.io.newFileURI(
    do_get_file("resources/rss2_example.xml")
  ).spec;
  httpServer.registerPathHandler("/redirect302", (request, response) => {
    response.setStatusLine(request.httpVersion, 302, "Found");
    response.setHeader("Location", fileUrl, false);
  });

  const url = `http://localhost:${SERVER_PORT}/redirect302`;
  const feed = new Feed(url, folder);
  FeedUtils.addFeed(feed);

  const error = await new Promise(resolve => {
    feed.download(true, {
      downloaded(f, aError) {
        resolve(aError);
      },
      onProgress() {},
    });
  });

  Assert.equal(
    error,
    FeedUtils.kNewsBlogRequestFailure,
    "download should fail"
  );
  Assert.equal(
    [...folder.messages].length,
    0,
    "no items should be stored from the local file"
  );
  Assert.deepEqual(
    FeedUtils.getFeedUrlsInFolder(folder),
    [url],
    "subscription url should be unchanged"
  );
});

// Test which feed url redirect targets are allowed.
add_task(function test_isValidRedirectUrl() {
  const parser = new FeedParser();
  const tests = [
    ["http://example.com/a.xml", "http://example.com/b.xml", true],
    ["http://example.com/a.xml", "https://example.com/b.xml", true],
    ["https://example.com/a.xml", "https://example.com/b.xml", true],
    ["https://example.com/a.xml", "http://example.com/b.xml", false],
    ["HTTPS://example.com/a.xml", "http://example.com/b.xml", false],
    ["http://example.com/a.xml", "file:///tmp/local.xml", false],
    ["http://example.com/a.xml", "file://///192.0.2.1/share/unc.xml", false],
    ["file:///tmp/local.xml", "file:///tmp/other.xml", false],
    ["file:///tmp/local.xml", "https://example.com/b.xml", true],
    ["http://example.com/a.xml", "ftp://example.com/b.xml", false],
    ["http://example.com/a.xml", "not a url", false],
  ];
  for (const [oldUrl, newUrl, expected] of tests) {
    Assert.equal(
      parser.isValidRedirectUrl(oldUrl, newUrl),
      expected,
      `redirect from ${oldUrl} to ${newUrl} should be ${expected ? "allowed" : "rejected"}`
    );
  }
});
