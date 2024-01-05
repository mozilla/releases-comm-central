/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* eslint-disable @microsoft/sdl/no-insecure-url */

const { MockRegistrar } = ChromeUtils.importESModule(
  "resource://testing-common/MockRegistrar.sys.mjs"
);

const TEST_DOMAIN = "http://example.org";
const TEST_IP = "http://127.0.0.1:8888";
const TEST_PATH = "/browser/comm/mail/base/test/browser/files/links.html";

const links = new Map([
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

/** @implements {nsIWebProgressListener} */
const webProgressListener = {
  QueryInterface: ChromeUtils.generateQI([
    "nsIWebProgressListener",
    "nsISupportsWeakReference",
  ]),

  _browser: null,
  _deferred: null,

  onStateChange(webProgress, request, stateFlags, status) {
    if (
      !(stateFlags & Ci.nsIWebProgressListener.STATE_STOP) ||
      this._browser?.currentURI.spec == "about:blank"
    ) {
      return;
    }

    if (this._deferred) {
      const deferred = this._deferred;
      const url = this._browser.currentURI.spec;
      this.cancelPromise();

      deferred.resolve(url);
    } else {
      this.cancelPromise();
      Assert.ok(false, "unexpected state change");
    }
  },

  onLocationChange(webProgress, request, location, flags) {
    if (!(flags & Ci.nsIWebProgressListener.LOCATION_CHANGE_HASHCHANGE)) {
      return;
    }

    if (this._deferred) {
      const deferred = this._deferred;
      const url = this._browser.currentURI.spec;
      this.cancelPromise();

      deferred.resolve(url);
    } else {
      this.cancelPromise();
      Assert.ok(false, "unexpected location change");
    }
  },

  promiseEvent(browser) {
    this._browser = browser;
    browser.webProgress.addProgressListener(
      this,
      Ci.nsIWebProgress.NOTIFY_STATE_ALL | Ci.nsIWebProgress.NOTIFY_LOCATION
    );

    this._deferred = Promise.withResolvers();
    return this._deferred.promise;
  },

  cancelPromise() {
    this._deferred = null;
    this._browser.removeProgressListener(this);
    this._browser = null;
  },
};

/** @implements {nsIExternalProtocolService} */
const mockExternalProtocolService = {
  QueryInterface: ChromeUtils.generateQI(["nsIExternalProtocolService"]),

  _deferred: null,

  loadURI(aURI, aWindowContext) {
    if (this._deferred) {
      const deferred = this._deferred;
      this._deferred = null;

      deferred.resolve(aURI.spec);
    } else {
      this.cancelPromise();
      Assert.ok(false, "unexpected call to external protocol service");
    }
  },

  promiseEvent() {
    this._deferred = Promise.withResolvers();
    return this._deferred.promise;
  },

  cancelPromise() {
    this._deferred = null;
  },
};

const mockExternalProtocolServiceCID = MockRegistrar.register(
  "@mozilla.org/uriloader/external-protocol-service;1",
  mockExternalProtocolService
);

// This test deliberately loads content from http:// URLs. For some reason
// upgrading the icon URL to https:// causes it to attempt loading from an
// external server and this makes the test crash.
Services.prefs.setBoolPref(
  "security.mixed_content.upgrade_display_content",
  false
);

registerCleanupFunction(() => {
  const tabmail = document.getElementById("tabmail");
  Assert.equal(tabmail.tabInfo.length, 1);

  while (tabmail.tabInfo.length > 1) {
    tabmail.closeTab(tabmail.tabInfo[1]);
  }

  MockRegistrar.unregister(mockExternalProtocolServiceCID);

  Services.prefs.clearUserPref(
    "security.mixed_content.upgrade_display_content"
  );
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

    // Clear the event queue.
    // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
    await new Promise(r => setTimeout(r, 250));
  }
  Assert.equal(
    browser.currentURI?.spec,
    pageURL,
    "original URL should be loaded"
  );

  const webProgressPromise = webProgressListener.promiseEvent(browser);
  const externalProtocolPromise = mockExternalProtocolService.promiseEvent();

  info(`clicking on ${selector}`);
  await BrowserTestUtils.synthesizeMouseAtCenter(selector, {}, browser);

  await Promise.any([webProgressPromise, externalProtocolPromise]);

  if (selector == "#this-hash") {
    await SpecialPowers.spawn(browser, [], () => {
      const doc = content.document;
      const target = doc.querySelector("#hash");
      const targetRect = target.getBoundingClientRect();
      Assert.less(
        targetRect.bottom,
        doc.documentElement.clientHeight,
        "page did scroll"
      );
    });
  }

  if (shouldLoadInternally) {
    Assert.equal(
      await webProgressPromise,
      url,
      `${url} should load internally`
    );
    mockExternalProtocolService.cancelPromise();
  } else {
    Assert.equal(
      await externalProtocolPromise,
      url,
      `${url} should load externally`
    );
    webProgressListener.cancelPromise();
  }

  if (browser.currentURI?.spec != pageURL) {
    const promise = webProgressListener.promiseEvent(browser);
    browser.browsingContext.goBack();
    await promise;
    Assert.equal(browser.currentURI?.spec, pageURL, "should have gone back");
  }
}

async function subtest(pagePrePath, group, shouldLoadCB) {
  const tabmail = document.getElementById("tabmail");
  const tab = window.openContentTab(
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

  try {
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
  } finally {
    tabmail.closeTab(tab);
  }
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
