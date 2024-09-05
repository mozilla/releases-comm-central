/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { ICSServer } = ChromeUtils.importESModule(
  "resource://testing-common/calendar/ICSServer.sys.mjs"
);

var { detection } = ChromeUtils.importESModule(
  "resource:///modules/calendar/utils/calProviderDetectionUtils.sys.mjs"
);

add_setup(async () => {
  ICSServer.open();
  ICSServer.putICSInternal(
    CalendarTestUtils.dedent`
      BEGIN:VCALENDAR
      BEGIN:VEVENT
      UID:6714b781-920f-46f8-80ec-3d3995e2e9ce
      SUMMARY:some event
      DTSTART:20210401T120000Z
      DTEND:20210401T130000Z
      END:VEVENT
      END:VCALENDAR
      `
  );
  registerCleanupFunction(() => ICSServer.close());
});

add_task(async function testIcsDetection() {
  const url = `${ICSServer.origin}/test.ics`;
  const detectedCals = await detection.detect("", "", url, false, [], {});
  Assert.ok(detectedCals, "should find calendars");
  Assert.equal(detectedCals.size, 1, "should find one calendar");
  const icsCal = detectedCals.values().next().value[0];
  Assert.equal(icsCal.uri.spec, url, "should have expected uri");
});

add_task(async function testIcsDetection302() {
  // This url will redirect to test.ics for the actual content.
  // We still want to subscribe to the original url.
  const url = `${ICSServer.origin}/http302?path=test.ics`;
  const detectedCals = await detection.detect("", "", url, false, [], {});
  Assert.ok(detectedCals, "should find calendars");
  Assert.equal(detectedCals.size, 1, "should find one calendar");
  const icsCal = detectedCals.values().next().value[0];
  Assert.equal(icsCal.uri.spec, url, "should have expected uri");
});
