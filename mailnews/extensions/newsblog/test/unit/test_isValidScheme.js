/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { AppConstants } = ChromeUtils.importESModule(
  "resource://gre/modules/AppConstants.sys.mjs"
);

add_task(function test_isValidScheme() {
  const fileURL = Services.io.newFileURI(
    do_get_file("resources/rss2_example.xml")
  );
  for (const url of [
    "http://example.org/feed.xml",
    "https://example.org/feed.xml",
    fileURL.spec,
  ]) {
    Assert.ok(FeedUtils.isValidScheme(url), `${url} should be valid`);
  }
  Assert.ok(
    FeedUtils.isValidScheme(fileURL),
    "a local file nsIURI should be valid"
  );

  for (const url of [
    "mailto:someone@example.org",
    "imap://example.org/INBOX",
    "feed:https://example.org/feed.xml",
    "javascript:alert(1)",
    "not a url",
  ]) {
    Assert.ok(!FeedUtils.isValidScheme(url), `${url} should not be valid`);
  }
});

add_task(
  { skip_if: () => AppConstants.platform != "win" },
  function test_isValidScheme_UNC() {
    for (const url of [
      "file://///example.org/share/feed.xml",
      "file:///%5C%5Cexample.org/share/feed.xml",
      "file:////%5Cexample.org/share/feed.xml",
      "file:///%5C%5C%3F%5CUNC%5Cexample.org%5Cshare%5Cfeed.xml",
    ]) {
      Assert.ok(!FeedUtils.isValidScheme(url), `${url} should not be valid`);
    }
    Assert.ok(
      FeedUtils.isValidScheme("file:///C:/feeds/feed.xml"),
      "a file url with a drive letter should be valid"
    );
  }
);
