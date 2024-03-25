/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test file to check that cookies are correctly enabled in Thunderbird.
 *
 * XXX: Still need to check remote content in messages.
 */

"use strict";

var { open_content_tab_with_url } = ChromeUtils.importESModule(
  "resource://testing-common/mail/ContentTabHelpers.sys.mjs"
);

// RELATIVE_ROOT messes with the collector, so we have to bring the path back
// so we get the right path for the resources.
var url = "http://mochi.test:8888/browser/comm/mail/test/browser/cookies/html/";

/**
 * Test deleting junk messages with no messages marked as junk.
 */
add_task(async function test_load_cookie_page() {
  await open_content_tab_with_url(url + "cookietest1.html");
  const tab2 = await open_content_tab_with_url(url + "cookietest2.html");

  await SpecialPowers.spawn(tab2.browser, [], () => {
    Assert.equal(content.document.title, "Cookie Test 2");

    const cookie = content.wrappedJSObject.theCookie;

    dump("Cookie is: " + cookie + "\n");

    if (!cookie) {
      throw new Error("Document has no cookie :-(");
    }

    if (cookie != "name=CookieTest") {
      throw new Error(
        "Cookie set incorrectly, expected: name=CookieTest, got: " +
          cookie +
          "\n"
      );
    }
  });

  Assert.report(
    false,
    undefined,
    undefined,
    "Test ran to completion successfully"
  );
});
