/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

let { MockRegistrar } = ChromeUtils.import(
  "resource://testing-common/MockRegistrar.jsm"
);

const TEST_DOMAIN = "http://example.org";
const TEST_PATH = "/browser/comm/mail/base/test/browser/files/links.html";
const TEST_URL = `${TEST_DOMAIN}${TEST_PATH}`;

let links = new Map([
  ["#this-hash", `${TEST_DOMAIN}${TEST_PATH}#hash`],
  ["#this-nohash", `${TEST_DOMAIN}${TEST_PATH}`],
  [
    "#local-here",
    `${TEST_DOMAIN}/browser/comm/mail/base/test/browser/files/sampleContent.html`,
  ],
  [
    "#local-elsewhere",
    `${TEST_DOMAIN}/browser/comm/mail/components/extensions/test/browser/data/content.html`,
  ],
  ["#other-https", `https://example.org${TEST_PATH}`],
  ["#other-port", `http://example.org:8000${TEST_PATH}`],
  ["#other-subdomain", `http://test1.example.org${TEST_PATH}`],
  ["#other-subsubdomain", `http://sub1.test1.example.org${TEST_PATH}`],
  ["#other-domain", `http://mochi.test:8888${TEST_PATH}`],
]);

/** @implements {nsIExternalProtocolService} */
let mockExternalProtocolService = {
  QueryInterface: ChromeUtils.generateQI(["nsIExternalProtocolService"]),
  _loadedURLs: [],
  loadURI(aURI, aWindowContext) {
    this._loadedURLs.push(aURI.spec);
  },
  urlLoaded(aURL) {
    return this._loadedURLs.includes(aURL);
  },
};

let mockExternalProtocolServiceCID = MockRegistrar.register(
  "@mozilla.org/uriloader/external-protocol-service;1",
  mockExternalProtocolService
);

registerCleanupFunction(() => {
  let tabmail = document.getElementById("tabmail");
  Assert.equal(tabmail.tabInfo.length, 1);

  while (tabmail.tabInfo.length > 1) {
    tabmail.closeTab(tabmail.tabInfo[1]);
  }

  MockRegistrar.unregister(mockExternalProtocolServiceCID);
});

async function clickOnLink(browser, selector, url, shouldLoadInternally) {
  if (
    browser.webProgress?.isLoadingDocument ||
    browser.currentURI?.spec == "about:blank"
  ) {
    await BrowserTestUtils.browserLoaded(browser);
  }
  mockExternalProtocolService._loadedURLs.length = 0;
  Assert.equal(
    browser.currentURI?.spec,
    TEST_URL,
    "original URL should be loaded"
  );

  info(`clicking on ${selector}`);
  await BrowserTestUtils.synthesizeMouseAtCenter(selector, {}, browser);
  // Responding to the click probably won't happen immediately. Let's hang
  // around and see what happens.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(r => setTimeout(r, 500));
  // If a load does start and is still happening after the 500ms, wait until
  // it finishes before continuing.
  if (browser.webProgress?.isLoadingDocument) {
    await BrowserTestUtils.browserLoaded(browser);
  }

  if (shouldLoadInternally) {
    Assert.equal(
      browser.currentURI?.spec,
      url,
      `${url} should load internally`
    );
    Assert.ok(
      !mockExternalProtocolService.urlLoaded(url),
      `${url} should not load externally`
    );
  } else {
    if (url != TEST_URL) {
      Assert.equal(
        browser.currentURI?.spec,
        TEST_URL,
        `${url} should not load internally`
      );
    }
    Assert.ok(
      mockExternalProtocolService.urlLoaded(url),
      `${url} should load externally`
    );
  }

  if (browser.currentURI?.spec != TEST_URL) {
    let promise = new Promise(resolve => {
      let event = selector == "#this-hash" ? "hashchange" : "pageshow";
      let unregister = BrowserTestUtils.addContentEventListener(
        browser,
        event,
        () => {
          unregister();
          resolve();
        },
        { capture: true }
      );
    });

    browser.browsingContext.goBack();
    await promise;
    Assert.equal(browser.currentURI?.spec, TEST_URL, "should have gone back");
  }
}

async function subtest(group, shouldLoadCB) {
  let tabmail = document.getElementById("tabmail");
  let tab = window.openContentTab(TEST_URL, undefined, group);

  let expectedGroup = group;
  if (group === null) {
    expectedGroup = "browsers";
  } else if (group === undefined) {
    expectedGroup = "single-site";
  }
  Assert.equal(tab.browser.getAttribute("messagemanagergroup"), expectedGroup);

  for (let [selector, url] of links) {
    await clickOnLink(tab.browser, selector, url, shouldLoadCB(selector));
  }
  tabmail.closeTab(tab);
}

add_task(function testNoGroup() {
  return subtest(undefined, selector => selector != "#other-domain");
});

add_task(function testBrowsersGroup() {
  return subtest(null, selector => true);
});

add_task(function testSSBGroup() {
  return subtest("single-site", selector => selector != "#other-domain");
});

add_task(function testStrictGroup() {
  return subtest("single-page", selector => selector.startsWith("#this"));
});
