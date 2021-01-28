/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

let { MockRegistrar } = ChromeUtils.import(
  "resource://testing-common/MockRegistrar.jsm"
);

const TEST_DOMAIN = "http://example.org";
const TEST_IP = "http://127.0.0.1:8888";
const TEST_PATH = "/browser/comm/mail/base/test/browser/files/links.html";

let links = new Map([
  ["#this-hash", `${TEST_PATH}#hash`],
  ["#this-nohash", `${TEST_PATH}`],
  [
    "#local-here",
    "/browser/comm/mail/base/test/browser/files/sampleContent.html",
  ],
  [
    "#local-elsewhere",
    "/browser/comm/mail/components/extensions/test/browser/data/content.html",
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

async function clickOnLink(
  browser,
  selector,
  url,
  pageURL,
  shouldLoadInternally
) {
  if (
    browser.webProgress?.isLoadingDocument ||
    browser.currentURI?.spec == "about:blank"
  ) {
    await BrowserTestUtils.browserLoaded(browser);
  }
  mockExternalProtocolService._loadedURLs.length = 0;
  Assert.equal(
    browser.currentURI?.spec,
    pageURL,
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
    if (url != pageURL) {
      Assert.equal(
        browser.currentURI?.spec,
        pageURL,
        `${url} should not load internally`
      );
    }
    Assert.ok(
      mockExternalProtocolService.urlLoaded(url),
      `${url} should load externally`
    );
  }

  if (browser.currentURI?.spec != pageURL) {
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
    Assert.equal(browser.currentURI?.spec, pageURL, "should have gone back");
  }
}

async function subtest(pagePrePath, group, shouldLoadCB) {
  let tabmail = document.getElementById("tabmail");
  let tab = window.openContentTab(
    `${pagePrePath}${TEST_PATH}`,
    undefined,
    group
  );

  let expectedGroup = group;
  if (group === null) {
    expectedGroup = "browsers";
  } else if (group === undefined) {
    expectedGroup = "single-site";
  }
  Assert.equal(tab.browser.getAttribute("messagemanagergroup"), expectedGroup);

  for (let [selector, url] of links) {
    if (url.startsWith("/")) {
      url = `${pagePrePath}${url}`;
    }
    await clickOnLink(
      tab.browser,
      selector,
      url,
      `${pagePrePath}${TEST_PATH}`,
      shouldLoadCB(selector)
    );
  }
  tabmail.closeTab(tab);
}

add_task(function testNoGroup() {
  return subtest(
    TEST_DOMAIN,
    undefined,
    selector => selector != "#other-domain"
  );
});

add_task(function testBrowsersGroup() {
  return subtest(TEST_DOMAIN, null, selector => true);
});

add_task(function testSingleSiteGroup() {
  return subtest(
    TEST_DOMAIN,
    "single-site",
    selector => selector != "#other-domain"
  );
});

add_task(function testSinglePageGroup() {
  return subtest(TEST_DOMAIN, "single-page", selector =>
    selector.startsWith("#this")
  );
});

add_task(function testNoGroupWithIP() {
  return subtest(
    TEST_IP,
    undefined,
    selector => selector.startsWith("#this") || selector.startsWith("#local")
  );
});

add_task(function testBrowsersGroupWithIP() {
  return subtest(TEST_IP, null, selector => true);
});

add_task(function testSingleSiteGroupWithIP() {
  return subtest(
    TEST_IP,
    "single-site",
    selector => selector.startsWith("#this") || selector.startsWith("#local")
  );
});

add_task(function testSinglePageGroupWithIP() {
  return subtest(TEST_IP, "single-page", selector =>
    selector.startsWith("#this")
  );
});
