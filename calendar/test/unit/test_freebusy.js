/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

function run_test() {
  do_calendar_startup(really_run_test);
}

function really_run_test() {
  test_freebusy();
  test_period();
}

function test_freebusy() {
  const icsService = Cc["@mozilla.org/calendar/ics-service;1"].getService(Ci.calIICSService);

  // Bug 415987 - FREEBUSY decoding does not support comma-separated entries
  // (https://bugzilla.mozilla.org/show_bug.cgi?id=415987)
  const fbVal1 = "20080206T160000Z/PT1H";
  const fbVal2 = "20080206T180000Z/PT1H";
  const fbVal3 = "20080206T220000Z/PT1H";
  const data =
    "BEGIN:VCALENDAR\n" +
    "BEGIN:VFREEBUSY\n" +
    "FREEBUSY;FBTYPE=BUSY:" +
    fbVal1 +
    "," +
    fbVal2 +
    "," +
    fbVal3 +
    "\n" +
    "END:VFREEBUSY\n" +
    "END:VCALENDAR\n";
  const fbComp = icsService.parseICS(data).getFirstSubcomponent("VFREEBUSY");
  equal(fbComp.getFirstProperty("FREEBUSY").value, fbVal1);
  equal(fbComp.getNextProperty("FREEBUSY").value, fbVal2);
  equal(fbComp.getNextProperty("FREEBUSY").value, fbVal3);
}

function test_period() {
  const period = Cc["@mozilla.org/calendar/period;1"].createInstance(Ci.calIPeriod);

  period.start = cal.createDateTime("20120101T010101");
  period.end = cal.createDateTime("20120101T010102");

  equal(period.icalString, "20120101T010101/20120101T010102");
  equal(period.duration.icalString, "PT1S");

  period.icalString = "20120101T010103/20120101T010104";

  equal(period.start.icalString, "20120101T010103");
  equal(period.end.icalString, "20120101T010104");
  equal(period.duration.icalString, "PT1S");

  period.icalString = "20120101T010105/PT1S";
  equal(period.start.icalString, "20120101T010105");
  equal(period.end.icalString, "20120101T010106");
  equal(period.duration.icalString, "PT1S");

  period.makeImmutable();
  // ical.js doesn't support immutability yet
  // throws(
  //   () => {
  //     period.start = cal.createDateTime("20120202T020202");
  //   },
  //   /0x80460002/,
  //   "Object is Immutable"
  // );
  // throws(
  //   () => {
  //     period.end = cal.createDateTime("20120202T020202");
  //   },
  //   /0x80460002/,
  //   "Object is Immutable"
  // );

  const copy = period.clone();
  equal(copy.start.icalString, "20120101T010105");
  equal(copy.end.icalString, "20120101T010106");
  equal(copy.duration.icalString, "PT1S");

  copy.start.icalString = "20120101T010106";
  copy.end = cal.createDateTime("20120101T010107");

  equal(period.start.icalString, "20120101T010105");
  equal(period.end.icalString, "20120101T010106");
  equal(period.duration.icalString, "PT1S");
}
