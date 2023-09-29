/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that ICAL.design.strict is set to false in both the main thread and
 * the ICS parsing worker. If either or both is set to true, this will fail.
 */

add_task(async function () {
  const item = await new Promise((resolve, reject) => {
    Cc["@mozilla.org/calendar/ics-parser;1"].createInstance(Ci.calIIcsParser).parseString(
      dedent`
        BEGIN:VCALENDAR
        BEGIN:VEVENT
        SUMMARY:An event!
        DTSTART:20240331
        DTEND:20240331
        END:VEVENT
        END:VCALENDAR
      `,
      {
        QueryInterface: ChromeUtils.generateQI(["calIIcsParsingListener"]),
        onParsingComplete(rv, parser) {
          if (Components.isSuccessCode(rv)) {
            resolve(parser.getItems()[0]);
          } else {
            reject(rv);
          }
        },
      }
    );
  });

  Assert.equal(item.startDate.year, 2024);
  Assert.equal(item.startDate.month, 2);
  Assert.equal(item.startDate.day, 31);
  Assert.equal(item.endDate.year, 2024);
  Assert.equal(item.endDate.month, 2);
  Assert.equal(item.endDate.day, 31);
});
