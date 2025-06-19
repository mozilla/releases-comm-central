/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { MockExternalProtocolService } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MockExternalProtocolService.sys.mjs"
);

const { openLinkExternally, openWebSearch, openUILink } =
  ChromeUtils.importESModule("resource:///modules/LinkHelper.sys.mjs");
const { PlacesUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/PlacesUtils.sys.mjs"
);
const { PlacesTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/PlacesTestUtils.sys.mjs"
);

async function checkURI(uri, expectedSpec) {
  Assert.equal(
    uri,
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

  MockExternalProtocolService.init();
  registerCleanupFunction(async () => {
    MockExternalProtocolService.cleanup();
    await PlacesUtils.history.clear();
  });
});

add_task(async function test_openLinkExternally() {
  let loadPromise = MockExternalProtocolService.promiseLoad();
  openLinkExternally("https://example.com/");
  await checkURI(await loadPromise, "https://example.com/");

  loadPromise = MockExternalProtocolService.promiseLoad();
  openLinkExternally(Services.io.newURI("https://example.com/uri"));
  await checkURI(await loadPromise, "https://example.com/uri");

  await PlacesUtils.history.clear();
});

add_task(async function test_openWebSearch() {
  const loadPromise = MockExternalProtocolService.promiseLoad();
  await openWebSearch("test");
  await checkURI(await loadPromise, "https://www.google.com/search?q=test");

  await PlacesUtils.history.clear();
});

add_task(async function test_openUILink() {
  const loadPromise = MockExternalProtocolService.promiseLoad();
  openUILink("https://example.com/?button=2", { button: 2 });

  const uri = Services.io.newURI("https://example.com/?button=2");
  await PlacesTestUtils.promiseAsyncUpdates();
  const hasPage = await PlacesTestUtils.isPageInDB(uri);
  Assert.ok(!hasPage, "Should not have recorded the page in the DB");
  const visitCount = await PlacesTestUtils.visitsInDB(uri);
  Assert.equal(visitCount, 0, "Should record no visits for the URL");

  openUILink("https://example.com/?button=0", { button: 0 });
  await checkURI(await loadPromise, "https://example.com/?button=0");

  await PlacesUtils.history.clear();
});
