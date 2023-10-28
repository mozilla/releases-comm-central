/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/* globals openWebSearch */

/**
 * Test telemetry related to web search usage.
 */

const { TelemetryTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TelemetryTestUtils.sys.mjs"
);
const { MockRegistrar } = ChromeUtils.importESModule(
  "resource://testing-common/MockRegistrar.sys.mjs"
);

/** @implements {nsIExternalProtocolService} */
const mockExternalProtocolService = {
  loadURI(aURI, aWindowContext) {},
  QueryInterface: ChromeUtils.generateQI(["nsIExternalProtocolService"]),
};

const mockExternalProtocolServiceCID = MockRegistrar.register(
  "@mozilla.org/uriloader/external-protocol-service;1",
  mockExternalProtocolService
);

registerCleanupFunction(() => {
  MockRegistrar.unregister(mockExternalProtocolServiceCID);
});

/**
 * Test that we're counting how many times search on web was used.
 */
add_task(async function test_web_search_usage() {
  Services.telemetry.clearScalars();

  const NUM_SEARCH = 5;
  const engine = await Services.search.getDefault();
  await Promise.all(
    Array.from({ length: NUM_SEARCH }).map(() => openWebSearch("thunderbird"))
  );

  const scalars = TelemetryTestUtils.getProcessScalars("parent", true);
  Assert.equal(
    scalars["tb.websearch.usage"][engine.name.toLowerCase()],
    NUM_SEARCH,
    "Count of search on web times must be correct."
  );
});
