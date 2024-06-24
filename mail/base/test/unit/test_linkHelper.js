/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { openLinkExternally, openWebSearch, openUILink } =
  ChromeUtils.importESModule("resource:///modules/LinkHelper.sys.mjs");
// mailShutdown.js also wants MockRegistrar and gets loaded into this scope.
var { MockRegistrar } = ChromeUtils.importESModule(
  "resource://testing-common/MockRegistrar.sys.mjs"
);
const { PlacesUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/PlacesUtils.sys.mjs"
);
const { PlacesTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/PlacesTestUtils.sys.mjs"
);

const uriListener = {
  running: false,
  resolver: null,
  async *stream() {
    while (this.running) {
      this.resolver = Promise.withResolvers();
      yield await this.resolver.promise;
    }
  },
};

async function checkURI(uri, expectedSpec) {
  Assert.equal(
    uri.spec,
    expectedSpec,
    "URL should be sent to external protocol service"
  );
  // We insert without awaiting in the LinkHelper module. Wait for that operation.
  await PlacesTestUtils.promiseAsyncUpdates();
  const hasPage = await PlacesTestUtils.isPageInDB(uri);
  Assert.ok(hasPage, "Should have recorded the page in the DB");
  const visitCount = await PlacesTestUtils.visitsInDB(uri);
  Assert.equal(visitCount, 1, "Should record a visit for the URL");
}

add_setup(async function () {
  do_get_profile();
  /** @implements {nsIExternalProtocolService} */
  const mockExternalProtocolService = {
    QueryInterface: ChromeUtils.generateQI(["nsIExternalProtocolService"]),
    externalProtocolHandlerExists() {},
    isExposedProtocol() {},
    loadURI(uri) {
      uriListener.resolver.resolve(uri);
    },
  };

  const mockExternalProtocolServiceCID = MockRegistrar.register(
    "@mozilla.org/uriloader/external-protocol-service;1",
    mockExternalProtocolService
  );
  uriListener.running = true;
  registerCleanupFunction(async () => {
    uriListener.running = false;
    uriListener.resolver?.resolve("done");
    MockRegistrar.unregister(mockExternalProtocolServiceCID);
    await PlacesUtils.history.clear();
  });
});

add_task(async function test_openLinkExternally() {
  const stream = uriListener.stream();
  const urlPromise = stream.next();
  openLinkExternally("https://example.com/");
  const { value: url } = await urlPromise;
  await checkURI(url, "https://example.com/");

  const uriPromise = stream.next();
  openLinkExternally(Services.io.newURI("https://example.com/uri"));
  const { value: uri } = await uriPromise;
  await checkURI(uri, "https://example.com/uri");

  await PlacesUtils.history.clear();
  stream.return();
});

add_task(async function test_openWebSearch() {
  const stream = uriListener.stream();
  const urlPromise = stream.next();

  await openWebSearch("test");
  const { value: url } = await urlPromise;
  await checkURI(url, "https://www.google.com/search?q=test");

  await PlacesUtils.history.clear();
  stream.return();
});

add_task(async function test_openUILink() {
  const stream = uriListener.stream();
  const urlPromise = stream.next();

  openUILink("https://example.com/?button=2", { button: 2 });

  const uri = Services.io.newURI("https://example.com/?button=2");
  await PlacesTestUtils.promiseAsyncUpdates();
  const hasPage = await PlacesTestUtils.isPageInDB(uri);
  Assert.ok(!hasPage, "Should not have recorded the page in the DB");
  const visitCount = await PlacesTestUtils.visitsInDB(uri);
  Assert.equal(visitCount, 0, "Should record no visits for the URL");

  openUILink("https://example.com/?button=0", { button: 0 });

  const { value: url } = await urlPromise;
  await checkURI(url, "https://example.com/?button=0");

  await PlacesUtils.history.clear();
  stream.return();
});
