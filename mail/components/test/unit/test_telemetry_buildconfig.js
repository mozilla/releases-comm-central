/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

// This test is a copy of parts of the following tests:
//
// * toolkit/components/telemetry/tests/unit/test_TelemetryEvents.js
// * toolkit/components/telemetry/tests/unit/test_TelemetryHistograms.js
// * toolkit/components/telemetry/tests/unit/test_TelemetryScalars.js
//
// The probe names have been changed to probes that only exist in a Thunderbird build.
// If this test begins to fail, check for recent changes in toolkit/components/telemetry.

ChromeUtils.defineESModuleGetters(this, {
  TelemetryTestUtils: "resource://testing-common/TelemetryTestUtils.sys.mjs",
});

const Telemetry = Services.telemetry;

const UINT_SCALAR = "tb.test.unsigned_int_kind";
const STRING_SCALAR = "tb.test.string_kind";
const BOOLEAN_SCALAR = "tb.test.boolean_kind";

/**
 * Check that stored events correspond to expectations.
 *
 * @param {Array} summaries - Summary of the expected events.
 * @param {boolean} clearScalars - Whether to clear out data after snapshotting.
 */
function checkEventSummary(summaries, clearScalars) {
  const scalars = Telemetry.getSnapshotForKeyedScalars("main", clearScalars);

  for (const [process, [category, eObject, method], count] of summaries) {
    const uniqueEventName = `${category}#${eObject}#${method}`;
    let summaryCount;
    if (process === "dynamic") {
      summaryCount =
        scalars.dynamic["telemetry.dynamic_event_counts"][uniqueEventName];
    } else {
      summaryCount =
        scalars[process]["telemetry.event_counts"][uniqueEventName];
    }
    Assert.equal(
      summaryCount,
      count,
      `${uniqueEventName} had wrong summary count`
    );
  }
}

/**
 * Test Thunderbird events are included in the build.
 */
add_task(async function test_recording_state() {
  Telemetry.clearEvents();
  Telemetry.clearScalars();

  const events = [["tb.test", "test", "object1"]];

  // Recording off by default.
  events.forEach(e => Telemetry.recordEvent(...e));
  TelemetryTestUtils.assertEvents([]);
  // But still expect a non-zero summary count.
  checkEventSummary(
    events.map(e => ["parent", e, 1]),
    true
  );

  // Once again, with recording on.
  Telemetry.setEventRecordingEnabled("tb.test", true);
  events.forEach(e => Telemetry.recordEvent(...e));
  TelemetryTestUtils.assertEvents(events);
  checkEventSummary(
    events.map(e => ["parent", e, 1]),
    true
  );
});

/**
 * Test Thunderbird histograms are included in the build.
 */
add_task(async function test_categorical_histogram() {
  const h1 = Telemetry.getHistogramById("TELEMETRY_TEST_TB_CATEGORICAL");
  for (const v of ["CommonLabel", "CommonLabel", "Label2", "Label3"]) {
    h1.add(v);
  }
  for (const s of ["", "Label4", "1234"]) {
    // The |add| method should not throw for unexpected values, but rather
    // print an error message in the console.
    h1.add(s);
  }

  const snapshot = h1.snapshot();
  Assert.deepEqual(snapshot.values, { 0: 2, 1: 1, 2: 1, 3: 0 });
  // sum is a little meaningless for categorical histograms, but hey.
  // (CommonLabel is 0, Label2 is 1, Label3 is 2)
  Assert.equal(snapshot.sum, 0 * 2 + 1 * 1 + 2 * 1);
  Assert.deepEqual(snapshot.range, [1, 50]);
});

/**
 * Test Thunderbird scalars are included in the build.
 */
add_task(async function test_serializationFormat() {
  Telemetry.clearScalars();

  // Set the scalars to a known value.
  const expectedUint = 3785;
  const expectedString = "some value";
  Telemetry.scalarSet(UINT_SCALAR, expectedUint);
  Telemetry.scalarSet(STRING_SCALAR, expectedString);
  Telemetry.scalarSet(BOOLEAN_SCALAR, true);

  // Get a snapshot of the scalars for the main process (internally called "default").
  const scalars = TelemetryTestUtils.getProcessScalars("parent");

  // Check that they are serialized to the correct format.
  Assert.equal(
    typeof scalars[UINT_SCALAR],
    "number",
    UINT_SCALAR + " must be serialized to the correct format."
  );
  Assert.ok(
    Number.isInteger(scalars[UINT_SCALAR]),
    UINT_SCALAR + " must be a finite integer."
  );
  Assert.equal(
    scalars[UINT_SCALAR],
    expectedUint,
    UINT_SCALAR + " must have the correct value."
  );
  Assert.equal(
    typeof scalars[STRING_SCALAR],
    "string",
    STRING_SCALAR + " must be serialized to the correct format."
  );
  Assert.equal(
    scalars[STRING_SCALAR],
    expectedString,
    STRING_SCALAR + " must have the correct value."
  );
  Assert.equal(
    typeof scalars[BOOLEAN_SCALAR],
    "boolean",
    BOOLEAN_SCALAR + " must be serialized to the correct format."
  );
  Assert.equal(
    scalars[BOOLEAN_SCALAR],
    true,
    BOOLEAN_SCALAR + " must have the correct value."
  );
});
