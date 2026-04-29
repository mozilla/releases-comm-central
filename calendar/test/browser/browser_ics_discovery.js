/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests ICS calendar discovery with authentication prompts.
 */

Services.scriptloader.loadSubScript(new URL("head_discovery.js", gTestPath).href, this);

var { ICSServer } = ChromeUtils.importESModule(
  "resource://testing-common/calendar/ICSServer.sys.mjs"
);

add_task(async function testWellKnown() {
  ICSServer.open("alice", "alice");
  ICSServer.putICSInternal(CalendarTestUtils.dedent`
    BEGIN:VCALENDAR
    BEGIN:VEVENT
    UID:b53cf88e-5ec7-4f34-a31b-23cc9f4a9ebe
    SUMMARY:this test written
    DTSTART:20260429T004500Z
    DTEND:20260429T010000Z
    END:VEVENT
    END:VCALENDAR
  `);

  await openWizard({
    url: `${ICSServer.origin}/test.ics`,
    username: "alice",
    password: "alice",
    expectedCalendars: [
      {
        uri: `${ICSServer.origin}/test.ics`,
        name: "test",
      },
    ],
  });

  ICSServer.close();
  ICSServer.port = -1;
});
