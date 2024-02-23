/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { XPCOMUtils } = ChromeUtils.importESModule("resource://gre/modules/XPCOMUtils.sys.mjs");

ChromeUtils.defineESModuleGetters(this, {
  CalAttendee: "resource:///modules/CalAttendee.sys.mjs",
});

function run_test() {
  const attendee = new CalAttendee();
  attendee.id = "mailto:somebody";

  // Set the property and make sure its there
  attendee.setProperty("SCHEDULE-AGENT", "CLIENT");
  equal(attendee.getProperty("SCHEDULE-AGENT"), "CLIENT");

  // Reserialize the property, this has caused the property to go away
  // in the past.
  attendee.icalProperty = attendee.icalProperty; // eslint-disable-line no-self-assign
  equal(attendee.getProperty("SCHEDULE-AGENT"), "CLIENT");

  // Also make sure there are no promoted properties set. This does not
  // technically belong to this bug, but I almost caused this error while
  // writing the patch.
  ok(!attendee.icalProperty.icalString.includes("RSVP"));
}
