/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

function makeEvent(str) {
    return createEventFromIcalString("BEGIN:VEVENT\n" + str + "END:VEVENT");
}

function run_test() {
    do_test_pending();
    cal.getTimezoneService().startup({
        onResult: function() {
            really_run_test();
            do_test_finished();
        }
    });
}

function really_run_test() {
    test_interface();
    test_rrule_interface();
    test_rules();
    test_failures();
    test_limit();
    test_startdate_change();
    test_idchange();
    test_rrule_icalstring();
}

function test_rules() {
    function check_recur(event, expected, ignoreNextOccCheck) {
        dump("Checking '" + event.getProperty("DESCRIPTION") + "'\n");
        // Get recurrence dates
        let start = createDate(1990, 0, 1);
        let end = createDate(2020, 0, 1);
        let recdates = event.recurrenceInfo.getOccurrenceDates(start, end, 0, {});
        let occurrences = event.recurrenceInfo.getOccurrences(start, end, 0, {});

        // Check number of items
        dump("Expected " + expected.length + " occurrences\n");
        dump("Got: " + recdates.map(x => x.toString()) + "\n");
        //equal(recdates.length, expected.length);
        let fmt = cal.getDateFormatter();

        for (let i = 0; i < expected.length; i++) {
            // Check each date
            let ed = cal.createDateTime(expected[i]);
            dump("Expecting instance at " + ed + "(" + fmt.dayName(ed.weekday) + ")\n");
            dump("Recdate:");
            equal(recdates[i].icalString, expected[i]);

            // Make sure occurrences are correct
            dump("Occurrence:");
            equal(occurrences[i].startDate.icalString, expected[i]);

            if (ignoreNextOccCheck) {
                continue;
            }

            // Make sure getNextOccurrence works correctly
            let nextOcc = event.recurrenceInfo.getNextOccurrence(recdates[i]);
            if (expected.length > i + 1) {
                notEqual(nextOcc, null);
                dump("Checking next occurrence: " + expected[i+1]+"\n");
                equal(nextOcc.startDate.icalString, expected[i + 1]);
            } else {
                dump("Expecting no more occurrences, found " +
                        (nextOcc ? nextOcc.startDate : null) + "\n");
                equal(nextOcc, null);
            }

            // Make sure getPreviousOccurrence works correctly
            let prevOcc = event.recurrenceInfo.getPreviousOccurrence(recdates[i]);
            if (i > 0) {
                dump("Checking previous occurrence: " + expected[i-1]+", found " + (prevOcc ? prevOcc.startDate : prevOcc) + "\n");
                notEqual(prevOcc, null);
                equal(prevOcc.startDate.icalString, expected[i - 1]);
            } else {
                dump("Expecting no previous occurrences, found " +
                        (prevOcc ? prevOcc.startDate : prevOcc) + "\n");
                equal(prevOcc, null);
            }
        }

        //  Make sure recurrenceInfo.clone works correctly
        test_clone(event);
    }

    // Test specific items/rules
    check_recur(makeEvent("DESCRIPTION:Repeat every tuesday and wednesday starting " +
                                     "Tue 2nd April 2002\n" +
                         "RRULE:FREQ=WEEKLY;INTERVAL=1;COUNT=6;BYDAY=TU,WE\n" +
                         "DTSTART:20020402T114500\n" +
                         "DTEND:20020402T124500\n"),
                         ["20020402T114500", "20020403T114500", "20020409T114500",
                          "20020410T114500", "20020416T114500", "20020417T114500"]);
    check_recur(makeEvent("DESCRIPTION:Repeat every thursday starting Tue 2nd April 2002\n" +
                         "RRULE:FREQ=WEEKLY;INTERVAL=1;COUNT=6;BYDAY=TH\n" +
                         "DTSTART:20020402T114500\n" +
                         "DTEND:20020402T124500\n"),
                         ["20020402T114500", // DTSTART part of the resulting set
                          "20020404T114500", "20020411T114500", "20020418T114500",
                          "20020425T114500", "20020502T114500", "20020509T114500"]);
    // Bug 469840 -  Recurring Sundays incorrect
    check_recur(makeEvent("DESCRIPTION:RRULE:FREQ=WEEKLY;INTERVAL=2;COUNT=6;BYDAY=WE,SA,SU with DTSTART:20081217T133000\n" +
                         "RRULE:FREQ=WEEKLY;INTERVAL=2;COUNT=6;BYDAY=WE,SA,SU\n" +
                         "DTSTART:20081217T133000\n" +
                         "DTEND:20081217T143000\n"),
               ["20081217T133000", "20081220T133000", "20081221T133000",
                "20081231T133000", "20090103T133000", "20090104T133000"]);
    check_recur(makeEvent("DESCRIPTION:RRULE:FREQ=WEEKLY;INTERVAL=2;COUNT=6;WKST=SU;BYDAY=WE,SA,SU with DTSTART:20081217T133000\n" +
                         "RRULE:FREQ=WEEKLY;INTERVAL=2;COUNT=6;WKST=SU;BYDAY=WE,SA,SU\n" +
                         "DTSTART:20081217T133000\n" +
                         "DTEND:20081217T143000\n"),
               ["20081217T133000", "20081220T133000", "20081228T133000",
                "20081231T133000", "20090103T133000", "20090111T133000"]);

    // bug 353797: occurrences for repeating all day events should stay "all-day"
    check_recur(makeEvent("DESCRIPTION:Allday repeat every thursday starting Tue 2nd April 2002\n" +
                         "RRULE:FREQ=WEEKLY;INTERVAL=1;COUNT=3;BYDAY=TH\n" +
                         "DTSTART;VALUE=DATE:20020404\n" +
                         "DTEND;VALUE=DATE:20020405\n"),
                         ["20020404", "20020411", "20020418"]);

    /* Test disabled, because BYWEEKNO is known to be broken
    check_recur(makeEvent("DESCRIPTION:Monday of week number 20 (where the default start of the week is Monday)\n" +
                         "RRULE:FREQ=YEARLY;INTERVAL=1;COUNT=6;BYDAY=MO;BYWEEKNO=20\n" +
                         "DTSTART:19970512T090000",
                         ["19970512T090000", "19980511T090000", "19990517T090000" +
                          "20000515T090000", "20010514T090000", "20020513T090000"]);
    */

    // bug 899326: Recurrences with BYMONTHDAY=X,X,31 don't show at all in months with less than 31 days
    check_recur(makeEvent("DESCRIPTION:Every 11th & 31st of every Month\n" +
                "RRULE:FREQ=MONTHLY;COUNT=6;BYMONTHDAY=11,31\n" +
                "DTSTART:20130731T160000\n" +
                "DTEND:20130731T170000)\n"),
                ["20130731T160000", "20130811T160000", "20130831T160000",
                 "20130911T160000", "20131011T160000", "20131031T160000"]);

    // bug 899770: Monthly Recurrences with BYDAY and BYMONTHDAY with more than 2 dates are not working
    check_recur(makeEvent("DESCRIPTION:Every WE & SA the 6th, 20th & 31st\n" +
                "RRULE:FREQ=MONTHLY;COUNT=6;BYDAY=WE,SA;BYMONTHDAY=6,20,31\n" +
                "DTSTART:20130706T160000\n" +
                "DTEND:20130706T170000)\n"),
                ["20130706T160000", "20130720T160000", "20130731T160000",
                 "20130831T160000", "20131106T160000", "20131120T160000"]);

    check_recur(makeEvent("DESCRIPTION:Every day, use exdate to exclude the second day\n" +
                         "RRULE:FREQ=DAILY;COUNT=3\n" +
                         "DTSTART:20020402T114500Z\n" +
                         "EXDATE:20020403T114500Z\n"),
                         ["20020402T114500Z", "20020404T114500Z"]);

    // test for issue 734245
    check_recur(makeEvent("DESCRIPTION:Every day, use exdate of type DATE to exclude the second day\n" +
                         "RRULE:FREQ=DAILY;COUNT=3\n" +
                         "DTSTART:20020402T114500Z\n" +
                         "EXDATE;VALUE=DATE:20020403\n"),
                         ["20020402T114500Z", "20020404T114500Z"]);

    check_recur(makeEvent("DESCRIPTION:Use EXDATE to eliminate the base event\n" +
                         "RRULE:FREQ=DAILY;COUNT=1\n" +
                         "DTSTART:20020402T114500Z\n" +
                         "EXDATE:20020402T114500Z\n"),
                         []);

    check_recur(createEventFromIcalString("BEGIN:VCALENDAR\nBEGIN:VEVENT\n" +
                                         "UID:123\n" +
                                         "DESCRIPTION:Every day, exception put on exdated day\n" +
                                         "RRULE:FREQ=DAILY;COUNT=3\n" +
                                         "DTSTART:20020402T114500Z\n" +
                                         "EXDATE:20020403T114500Z\n" +
                                         "END:VEVENT\n" +
                                         "BEGIN:VEVENT\n" +
                                         "DTSTART:20020403T114500Z\n" +
                                         "UID:123\n" +
                                         "RECURRENCE-ID:20020404T114500Z\n" +
                                         "END:VEVENT\nEND:VCALENDAR\n"),
               ["20020402T114500Z", "20020403T114500Z"],
               true); // ignore next occ check, bug 455490

    check_recur(createEventFromIcalString("BEGIN:VCALENDAR\nBEGIN:VEVENT\n" +
                                         "UID:123\n" +
                                         "DESCRIPTION:Every day, exception put on exdated start day\n" +
                                         "RRULE:FREQ=DAILY;COUNT=3\n" +
                                         "DTSTART:20020402T114500Z\n" +
                                         "EXDATE:20020402T114500Z\n" +
                                         "END:VEVENT\n" +
                                         "BEGIN:VEVENT\n" +
                                         "DTSTART:20020402T114500Z\n" +
                                         "UID:123\n" +
                                         "RECURRENCE-ID:20020404T114500Z\n" +
                                         "END:VEVENT\nEND:VCALENDAR\n"),
               ["20020402T114500Z", "20020403T114500Z"],
               true /* ignore next occ check, bug 455490 */);

    check_recur(createEventFromIcalString("BEGIN:VCALENDAR\nBEGIN:VEVENT\n" +
                                         "DESCRIPTION:Repeat Daily on weekdays with UNTIL\n" +
                                         "RRULE:FREQ=DAILY;UNTIL=20111217T220000Z;BYDAY=MO,TU,WE,TH,FR\n" +
                                         "DTSTART:20111212T220000Z\n" +
                                         "DTEND:20111212T230000Z\n" +
                                         "END:VEVENT\nEND:VCALENDAR\n"),
               ["20111212T220000Z", "20111213T220000Z", "20111214T220000Z", "20111215T220000Z",
                "20111216T220000Z"],
               false);

    check_recur(createEventFromIcalString("BEGIN:VCALENDAR\nBEGIN:VEVENT\n" +
                                         "DESCRIPTION:Repeat Daily on weekdays with UNTIL and exception\n" +
                                         "RRULE:FREQ=DAILY;UNTIL=20111217T220000Z;BYDAY=MO,TU,WE,TH,FR\n" +
                                         "EXDATE:20111214T220000Z\n" +
                                         "DTSTART:20111212T220000Z\n" +
                                         "DTEND:20111212T230000Z\n" +
                                         "END:VEVENT\nEND:VCALENDAR\n"),
               ["20111212T220000Z", "20111213T220000Z", "20111215T220000Z", "20111216T220000Z"],
               false);

    // Bug 958978: Yearly recurrence, the last day of a specified month.
    check_recur(createEventFromIcalString("BEGIN:VCALENDAR\nBEGIN:VEVENT\n" +
                                          "DESCRIPTION:Repeat Yearly the last day of February\n" +
                                          "RRULE:FREQ=YEARLY;COUNT=6;BYMONTHDAY=-1;BYMONTH=2\n" +
                                          "DTSTART:20140228T220000Z\n" +
                                          "DTEND:20140228T230000Z\n" +
                                          "END:VEVENT\nEND:VCALENDAR\n"),
                ["20140228T220000Z", "20150228T220000Z", "20160229T220000Z",
                 "20170228T220000Z", "20180228T220000Z", "20190228T220000Z"],
                false);
               
    // Bug 958978: Yearly recurrence, the last day of a not specified month.
    check_recur(createEventFromIcalString("BEGIN:VCALENDAR\nBEGIN:VEVENT\n" +
                                          "DESCRIPTION:Repeat Yearly the last day of April without BYMONTH=4 in the rule\n" +
                                          "RRULE:FREQ=YEARLY;COUNT=6;BYMONTHDAY=-1\n" +
                                          "DTSTART:20140430T220000Z\n" +
                                          "DTEND:20140430T230000Z\n" +
                                          "END:VEVENT\nEND:VCALENDAR\n"),
                ["20140430T220000Z", "20150430T220000Z", "20160430T220000Z",
                 "20170430T220000Z", "20180430T220000Z", "20190430T220000Z"],
                false);

    // Bug 958978 - Check a yearly recurrence on every WE and FR of January and March
    //              (more BYMONTH and more BYDAY).
    // Check for the occurrences in the first year.
    check_recur(createEventFromIcalString("BEGIN:VCALENDAR\nBEGIN:VEVENT\n" +
                                         "DESCRIPTION:Repeat Yearly every WE and FR of January and March (more BYMONTH and more BYDAY)\n" +
                                         "RRULE:FREQ=YEARLY;COUNT=18;BYMONTH=1,3;BYDAY=WE,FR\n" +
                                         "DTSTART:20140101T150000Z\n" +
                                         "DTEND:20140101T160000Z\n" +
                                         "END:VEVENT\nEND:VCALENDAR\n"),
               ["20140101T150000Z", "20140103T150000Z", "20140108T150000Z", "20140110T150000Z",
                "20140115T150000Z", "20140117T150000Z", "20140122T150000Z", "20140124T150000Z",
                "20140129T150000Z", "20140131T150000Z",
                "20140305T150000Z", "20140307T150000Z", "20140312T150000Z", "20140314T150000Z",
                "20140319T150000Z", "20140321T150000Z", "20140326T150000Z", "20140328T150000Z"],
               false);

    // Bug 958978 - Check a yearly recurrence every day of January (BYMONTH and more BYDAY).
    // Check for all the occurrences in the first year.
    let expectedDates = [];
    for (let i = 1; i < 32; i++) {
        expectedDates.push("201401" + (i<10 ? "0"+i : i) + "T150000Z");
    }
    check_recur(createEventFromIcalString("BEGIN:VCALENDAR\nBEGIN:VEVENT\n" +
                                         "DESCRIPTION:Yearly, every day of January (one BYMONTH and more BYDAY)\n" +
                                         "RRULE:FREQ=YEARLY;COUNT=31;BYMONTH=1;BYDAY=SU,MO,TU,WE,TH,FR,SA\n" +
                                         "DTSTART:20140101T150000Z\n" +
                                         "DTEND:20140101T160000Z\n" +
                                         "END:VEVENT\nEND:VCALENDAR\n"),
                expectedDates,
                false);

    // Bug 958974 - Monthly recurrence every WE, FR and the third MO (monthly with more bydays).
    // Check the occurrences in the first month until the week with the first monday of the rule.
    check_recur(createEventFromIcalString("BEGIN:VCALENDAR\nBEGIN:VEVENT\n" +
                                         "DESCRIPTION:Repeat Monthly every Wednesday, Friday and the third Monday\n" +
                                         "RRULE:FREQ=MONTHLY;COUNT=8;BYDAY=3MO,WE,FR\n" +
                                         "DTSTART:20150102T080000Z\n" +
                                         "DTEND:20150102T090000Z\n" +
                                         "END:VEVENT\nEND:VCALENDAR\n"),
               ["20150102T080000Z", "20150107T080000Z", "20150109T080000Z",
                "20150114T080000Z", "20150116T080000Z", "20150119T080000Z",
                "20150121T080000Z", "20150123T080000Z"],
               false);

    // Bug 419490 - Monthly recurrence, the fifth Saturday starting from February.
    // Check a monthly rule that specifies a day that is not part of the month
    // the events starts in.
    check_recur(createEventFromIcalString("BEGIN:VCALENDAR\nBEGIN:VEVENT\n" +
                                         "DESCRIPTION:Repeat Monthly the fifth Saturday\n" +
                                         "RRULE:FREQ=MONTHLY;COUNT=6;BYDAY=5SA\n" +
                                         "DTSTART:20150202T080000Z\n" +
                                         "DTEND:20150202T090000Z\n" +
                                         "END:VEVENT\nEND:VCALENDAR\n"),
               ["20150202T080000Z",
                "20150530T080000Z", "20150829T080000Z", "20151031T080000Z",
                "20160130T080000Z", "20160430T080000Z", "20160730T080000Z"],
               false);

    // Bug 419490 - Monthly recurrence, the fifth Wednesday every two months starting from February.
    // Check a monthly rule that specifies a day that is not part of the month
    // the events starts in.
    check_recur(createEventFromIcalString("BEGIN:VCALENDAR\nBEGIN:VEVENT\n" +
                                         "DESCRIPTION:Repeat Monthly the fifth Friday every two months\n" +
                                         "RRULE:FREQ=MONTHLY;INTERVAL=2;COUNT=6;BYDAY=5FR\n" +
                                         "DTSTART:20150202T080000Z\n" +
                                         "DTEND:20150202T090000Z\n" +
                                         "END:VEVENT\nEND:VCALENDAR\n"),
               ["20150202T080000Z",
                "20151030T080000Z", "20160429T080000Z", "20161230T080000Z",
                "20170630T080000Z", "20171229T080000Z", "20180629T080000Z"],
               false);

    // Bugs 419490, 958974 - Monthly recurrence, the 2nd Monday, 5th Wednesday and the 5th to last Saturday every month starting from February.
    // Check a monthly rule that specifies a day that is not part of the month
    // the events starts in with positive and negative position along with other byday.
    check_recur(createEventFromIcalString("BEGIN:VCALENDAR\nBEGIN:VEVENT\n" +
                                         "DESCRIPTION:Repeat Monthly the 2nd Monday, 5th Wednesday and the 5th to last Saturday every month\n" +
                                         "RRULE:FREQ=MONTHLY;COUNT=7;BYDAY=2MO,-5WE,5SA\n" +
                                         "DTSTART:20150401T080000Z\n" +
                                         "DTEND:20150401T090000Z\n" +
                                         "END:VEVENT\nEND:VCALENDAR\n"),
               ["20150401T080000Z",
                "20150413T080000Z", "20150511T080000Z", "20150530T080000Z",
                "20150608T080000Z", "20150701T080000Z", "20150713T080000Z"],
               false);

    // Bug 1146500 - Monthly recurrence, every MO and FR when are odd days starting from the 1st of March.
    // Check the first occurrence when we have BYDAY along with BYMONTHDAY.
    check_recur(createEventFromIcalString("BEGIN:VCALENDAR\nBEGIN:VEVENT\n" +
                                         "DESCRIPTION:Monthly recurrence, every MO and FR when are odd days starting from the 1st of March\n" +
                                         "RRULE:FREQ=MONTHLY;BYDAY=MO,FR;BYMONTHDAY=1,3,5,7,9,11,13,15,17,19,21,23,25,27,29,31;COUNT=4\n" +
                                         "DTSTART:20150301T080000Z\n" +
                                         "DTEND:20150301T090000Z\n" +
                                         "END:VEVENT\nEND:VCALENDAR\n"),
               ["20150301T080000Z",
                "20150309T080000Z", "20150313T080000Z", "20150323T080000Z", "20150327T080000Z"],
               false);

    // Bug 1146500 - Monthly recurrence, every MO and FR when are odd days starting from the 1st of April.
    // Check the first occurrence when we have BYDAY along with BYMONTHDAY.
    check_recur(createEventFromIcalString("BEGIN:VCALENDAR\nBEGIN:VEVENT\n" +
                                         "DESCRIPTION:Monthly recurrence, every MO and FR when are odd days starting from the 1st of March\n" +
                                         "RRULE:FREQ=MONTHLY;BYDAY=MO,FR;BYMONTHDAY=1,3,5,7,9,11,13,15,17,19,21,23,25,27,29,31;COUNT=4\n" +
                                         "DTSTART:20150401T080000Z\n" +
                                         "DTEND:20150401T090000Z\n" +
                                         "END:VEVENT\nEND:VCALENDAR\n"),
               ["20150401T080000Z",
                "20150403T080000Z", "20150413T080000Z", "20150417T080000Z", "20150427T080000Z"],
               false);

    // Bug 1146500 - Monthly recurrence, every MO and FR when are odd days starting from the 1st of April.
    // Check the first occurrence when we have BYDAY along with BYMONTHDAY.
    check_recur(createEventFromIcalString("BEGIN:VCALENDAR\nBEGIN:VEVENT\n" +
                                         "DESCRIPTION:Monthly recurrence, every MO and FR when are odd days starting from the 1st of March\n" +
                                         "RRULE:FREQ=MONTHLY;BYDAY=MO,SA;BYMONTHDAY=1,3,5,7,9,11,13,15,17,19,21,23,25,27,29,31;COUNT=4\n" +
                                         "DTSTART:20150401T080000Z\n" +
                                         "DTEND:20150401T090000Z\n" +
                                         "END:VEVENT\nEND:VCALENDAR\n"),
               ["20150401T080000Z",
                "20150411T080000Z", "20150413T080000Z", "20150425T080000Z", "20150427T080000Z"],
               false);

    // Bug 1146500 - Monthly every SU and FR when are odd days starting from 28 of February (BYDAY and BYMONTHDAY).
    // Check the first occurrence when we have BYDAY along with BYMONTHDAY.
    check_recur(createEventFromIcalString("BEGIN:VCALENDAR\nBEGIN:VEVENT\n" +
                                         "DESCRIPTION:Monthly recurrence, every SU and FR when are odd days starting from the 1st of March\n" +
                                         "RRULE:FREQ=MONTHLY;BYDAY=SU,FR;BYMONTHDAY=1,3,5,7,9,11,13,15,17,19,21,23,25,27,29,31;COUNT=9\n" +
                                         "DTSTART:20150228T080000Z\n" +
                                         "DTEND:20150228T090000Z\n" +
                                         "END:VEVENT\nEND:VCALENDAR\n"),
               ["20150228T080000Z",
                "20150301T080000Z", "20150313T080000Z", "20150315T080000Z", "20150327T080000Z",
                "20150329T080000Z", "20150403T080000Z", "20150405T080000Z", "20150417T080000Z",
                "20150419T080000Z"],
               false);

    let item, occ1;
    item = makeEvent("DESCRIPTION:occurrence on day 1 moved between the occurrences " +
                                     "on days 2 and 3\n" +
                         "RRULE:FREQ=DAILY;COUNT=3\n" +
                         "DTSTART:20020402T114500Z\n");
    occ1 = item.recurrenceInfo.getOccurrenceFor(createDate(2002,3,2,true,11,45,0));
    occ1.startDate = createDate(2002,3,3,true,12,0,0);
    item.recurrenceInfo.modifyException(occ1, true);
    check_recur(item, ["20020403T114500Z", "20020403T120000Z", "20020404T114500Z"]);

    item = makeEvent("DESCRIPTION:occurrence on day 1 moved between the occurrences " +
                                 "on days 2 and 3, EXDATE on day 2\n" +
                     "RRULE:FREQ=DAILY;COUNT=3\n" +
                     "DTSTART:20020402T114500Z\n" +
                     "EXDATE:20020403T114500Z\n");
    occ1 = item.recurrenceInfo.getOccurrenceFor(createDate(2002,3,2,true,11,45,0));
    occ1.startDate = createDate(2002,3,3,true,12,0,0);
    item.recurrenceInfo.modifyException(occ1, true);
    check_recur(item, ["20020403T120000Z", "20020404T114500Z"]);

    item = makeEvent("DESCRIPTION:all occurrences have exceptions\n" +
                     "RRULE:FREQ=DAILY;COUNT=2\n" +
                     "DTSTART:20020402T114500Z\n");
    occ1 = item.recurrenceInfo.getOccurrenceFor(createDate(2002,3,2,true,11,45,0));
    occ1.startDate = createDate(2002,3,2,true,12,0,0);
    item.recurrenceInfo.modifyException(occ1, true);
    let occ2 = item.recurrenceInfo.getOccurrenceFor(createDate(2002,3,3,true,11,45,0));
    occ2.startDate = createDate(2002,3,3,true,12,0,0);
    item.recurrenceInfo.modifyException(occ2, true);
    check_recur(item, ["20020402T120000Z", "20020403T120000Z"]);

    item = makeEvent("DESCRIPTION:rdate and exception before the recurrence start date\n" +
                     "RRULE:FREQ=DAILY;COUNT=2\n" +
                     "DTSTART:20020402T114500Z\n" +
                     "RDATE:20020401T114500Z\n");
    occ1 = item.recurrenceInfo.getOccurrenceFor(createDate(2002,3,2,true,11,45,0));
    occ1.startDate = createDate(2002,2,30,true,11,45,0);
    item.recurrenceInfo.modifyException(occ1, true);
    check_recur(item, ["20020330T114500Z", "20020401T114500Z", "20020403T114500Z"]);

    item = makeEvent("DESCRIPTION:bug 734245, an EXDATE of type DATE shall also match a DTSTART of type DATE-TIME\n" +
                     "RRULE:FREQ=DAILY;COUNT=3\n" +
                     "DTSTART:20020401T114500Z\n" +
                     "EXDATE;VALUE=DATE:20020402\n");

    check_recur(item, ["20020401T114500Z", "20020403T114500Z"]);

    item = makeEvent("DESCRIPTION:EXDATE with a timezone\n" +
                     "RRULE:FREQ=DAILY;COUNT=3\n" +
                     "DTSTART;TZID=Europe/Berlin:20020401T114500\n" +
                     "EXDATE;TZID=Europe/Berlin:20020402T114500\n");

    check_recur(item, ["20020401T114500", "20020403T114500"]);
}

function test_limit() {
    let item = makeEvent("RRULE:FREQ=DAILY;COUNT=3\n" +
                         "UID:1\n" +
                         "DTSTART:20020401T114500\n" +
                         "DTEND:20020401T124500\n");
    dump("ics: " + item.icalString + "\n");

    let start = createDate(1990, 0, 1);
    let end = createDate(2020, 0, 1);
    let recdates = item.recurrenceInfo.getOccurrenceDates(start, end, 0, {});
    let occurrences = item.recurrenceInfo.getOccurrences(start, end, 0, {});

    equal(recdates.length, 3);
    equal(occurrences.length, 3);

    recdates = item.recurrenceInfo.getOccurrenceDates(start, end, 2, {});
    occurrences = item.recurrenceInfo.getOccurrences(start, end, 2, {});

    equal(recdates.length, 2);
    equal(occurrences.length, 2);

    recdates = item.recurrenceInfo.getOccurrenceDates(start, end, 9, {});
    occurrences = item.recurrenceInfo.getOccurrences(start, end, 9, {});

    equal(recdates.length, 3);
    equal(occurrences.length, 3);
}

function test_clone(event) {
    let oldRecurItems = event.recurrenceInfo.getRecurrenceItems({});
    let cloned = event.recurrenceInfo.clone();
    let newRecurItems = cloned.getRecurrenceItems({});

    // Check number of recurrence items
    equal(oldRecurItems.length, newRecurItems.length);

    for (let i = 0; i < oldRecurItems.length; i++) {
        // Check if recurrence item cloned correctly
        equal(oldRecurItems[i].icalProperty.icalString,
                    newRecurItems[i].icalProperty.icalString);
    }
}

function test_interface() {
    let item = makeEvent("DTSTART:20020402T114500Z\n" +
                         "DTEND:20020402T124500Z\n" +
                         "RRULE:FREQ=WEEKLY;COUNT=6;BYDAY=TU,WE\r\n" +
                         "EXDATE:20020403T114500Z\r\n" +
                         "RDATE:20020401T114500Z\r\n");

    let rinfo = item.recurrenceInfo;
    ok(compareObjects(rinfo.item, item, Components.interfaces.calIEvent));

    // getRecurrenceItems
    let ritems = rinfo.getRecurrenceItems({});
    equal(ritems.length, 3);

    let checkritems = new Map([ [ritem.icalProperty.propertyName, ritem.icalProperty] for (ritem of ritems)]);
    let rparts = new Map([ v.split("=", 2) for (v of checkritems.get("RRULE").value.split(";")) ])
    equal(rparts.size, 3);
    equal(rparts.get("FREQ"), "WEEKLY");
    equal(rparts.get("COUNT"), "6");
    equal(rparts.get("BYDAY"), "TU,WE");
    equal(checkritems.get("EXDATE").value, "20020403T114500Z");
    equal(checkritems.get("RDATE").value, "20020401T114500Z");

    // setRecurrenceItems
    let newRItems = [cal.createRecurrenceRule(), cal.createRecurrenceDate()];

    newRItems[0].type = "DAILY";
    newRItems[0].interval = 1;
    newRItems[0].count = 1;
    newRItems[1].isNegative = true;
    newRItems[1].date = cal.createDateTime("20020404T114500Z");

    rinfo.setRecurrenceItems(2, newRItems);
    let itemString = item.icalString;

    equal(itemString.match(/RRULE:[A-Z=,]*FREQ=WEEKLY/), null);
    equal(itemString.match(/EXDATE[A-Z;=-]*:20020403T114500Z/, null));
    equal(itemString.match(/RDATE[A-Z;=-]*:20020401T114500Z/, null));
    notEqual(itemString.match(/RRULE:[A-Z=,]*FREQ=DAILY/), null)
    notEqual(itemString.match(/EXDATE[A-Z;=-]*:20020404T114500Z/, null));

    // This may be an implementation detail, but we don't want this breaking
    rinfo.wrappedJSObject.ensureSortedRecurrenceRules();
    equal(rinfo.wrappedJSObject.mNegativeRules[0].icalProperty.icalString, newRItems[1].icalProperty.icalString);
    equal(rinfo.wrappedJSObject.mPositiveRules[0].icalProperty.icalString, newRItems[0].icalProperty.icalString);

    // countRecurrenceItems
    equal(2, rinfo.countRecurrenceItems());

    // clearRecurrenceItems
    rinfo.clearRecurrenceItems();
    equal(0, rinfo.countRecurrenceItems());

    // appendRecurrenceItems / getRecurrenceItemAt / insertRecurrenceItemAt
    rinfo.appendRecurrenceItem(ritems[0]);
    rinfo.appendRecurrenceItem(ritems[1]);
    rinfo.insertRecurrenceItemAt(ritems[2], 0);

    ok(compareObjects(ritems[2],
                                 rinfo.getRecurrenceItemAt(0),
                                 Components.interfaces.calIRecurrenceItem));
    ok(compareObjects(ritems[0],
                                 rinfo.getRecurrenceItemAt(1),
                                 Components.interfaces.calIRecurrenceItem));
    ok(compareObjects(ritems[1],
                                 rinfo.getRecurrenceItemAt(2),
                                 Components.interfaces.calIRecurrenceItem));


    // deleteRecurrenceItem
    rinfo.deleteRecurrenceItem(ritems[0]);
    ok(!item.icalString.includes("RRULE"));

    // deleteRecurrenceItemAt
    rinfo.deleteRecurrenceItemAt(1);
    itemString = item.icalString;
    ok(!itemString.includes("EXDATE"));
    ok(itemString.includes("RDATE"));

    // insertRecurrenceItemAt with exdate
    rinfo.insertRecurrenceItemAt(ritems[1], 1);
    ok(compareObjects(ritems[1],
                                 rinfo.getRecurrenceItemAt(1),
                                 Components.interfaces.calIRecurrenceItem));
    rinfo.deleteRecurrenceItem(ritems[1]);

    // isFinite = true
    ok(rinfo.isFinite);
    rinfo.appendRecurrenceItem(ritems[0]);
    ok(rinfo.isFinite);

    // isFinite = false
    let item2 = makeEvent("DTSTART:20020402T114500Z\n" +
                          "DTEND:20020402T124500Z\n" +
                          "RRULE:FREQ=WEEKLY;BYDAY=TU,WE\n");
    ok(!item2.recurrenceInfo.isFinite);

    // removeOccurrenceAt/restoreOccurreceAt
    let occDate1 = cal.createDateTime("20020403T114500Z");
    let occDate2 = cal.createDateTime("20020404T114500Z");
    rinfo.removeOccurrenceAt(occDate1);
    ok(item.icalString.includes("EXDATE"));
    rinfo.restoreOccurrenceAt(occDate1)
    ok(!item.icalString.includes("EXDATE"));

    // modifyException / getExceptionFor
    let occ1 = rinfo.getOccurrenceFor(occDate1);
    occ1.startDate = cal.createDateTime("20020401T114500");
    rinfo.modifyException(occ1, true);
    ok(rinfo.getExceptionFor(occDate1) != null);

    // modifyException immutable
    let occ2 = rinfo.getOccurrenceFor(occDate2);
    occ2.makeImmutable();
    rinfo.modifyException(occ2, true);
    ok(rinfo.getExceptionFor(occDate2) != null);

    // getExceptionIds
    let ids = rinfo.getExceptionIds({});
    equal(ids.length, 2);
    ok(ids[0].compare(occDate1) == 0);
    ok(ids[1].compare(occDate2) == 0);

    // removeExceptionFor
    rinfo.removeExceptionFor(occDate1);
    ok(rinfo.getExceptionFor(occDate1) == null);
    equal(rinfo.getExceptionIds({}).length, 1);
}

function test_rrule_interface() {
    let item = makeEvent("DTSTART:20020402T114500Z\r\n" +
                         "DTEND:20020402T124500Z\r\n" +
                         "RRULE:INTERVAL=2;FREQ=WEEKLY;COUNT=6;BYDAY=TU,WE\r\n");

    let rrule = item.recurrenceInfo.getRecurrenceItemAt(0);
    equal(rrule.type, "WEEKLY");
    equal(rrule.interval, 2);
    equal(rrule.count, 6);
    ok(rrule.isByCount);
    ok(!rrule.isNegative);
    ok(rrule.isFinite);
    equal(rrule.getComponent("BYDAY", {}).toString(), [3,4].toString());

    // Now start changing things
    rrule.setComponent("BYDAY", 2, [4,5]);
    equal(rrule.icalString.match(/BYDAY=WE,TH/), "BYDAY=WE,TH");

    rrule.count = -1;
    ok(!rrule.isByCount);
    ok(!rrule.isFinite);
    equal(rrule.icalString.match(/COUNT=/), null);
    throws(() => rrule.count, /0x80004005/);

    rrule.interval = 1;
    equal(rrule.interval, 1);
    equal(rrule.icalString.match(/INTERVAL=/), null);

    rrule.interval = 3;
    equal(rrule.interval, 3);
    equal(rrule.icalString.match(/INTERVAL=3/), "INTERVAL=3");

    rrule.type = "MONTHLY";
    equal(rrule.type, "MONTHLY");
    equal(rrule.icalString.match(/FREQ=MONTHLY/), "FREQ=MONTHLY");

    // untilDate (without UTC)
    rrule.count = 3;
    let untilDate = cal.createDateTime();
    untilDate.timezone = cal.getTimezoneService().getTimezone("Europe/Berlin");
    rrule.untilDate = untilDate;
    ok(!rrule.isByCount)
    throws(() => rrule.count, /0x80004005/);
    equal(rrule.untilDate.icalString, untilDate.getInTimezone(cal.UTC()).icalString);

    // untilDate (with UTC)
    rrule.count = 3;
    untilDate = cal.createDateTime();
    untilDate.timezone = cal.UTC();
    rrule.untilDate = untilDate;
    ok(!rrule.isByCount)
    throws(() => rrule.count, /0x80004005/);
    equal(rrule.untilDate.icalString, untilDate.icalString);
}

function test_startdate_change() {

    // Setting a start date if its missing shouldn't throw
    let item = makeEvent("DTEND:20020402T124500Z\r\n" +
                         "RRULE:FREQ=DAILY\r\n");
    item.startDate = cal.createDateTime("20020502T114500Z");

    function makeRecEvent(str) {
        return makeEvent("DTSTART:20020402T114500Z\r\n" +
                         "DTEND:20020402T134500Z\r\n" +
                         str);
    }

    function changeBy(item, dur) {
        let newDate = item.startDate.clone();
        newDate.addDuration(cal.createDuration(dur));
        item.startDate = newDate;
    }

    let dur, ritem;

    // Changing an existing start date for a recurring item shouldn't either
    item = makeRecEvent("RRULE:FREQ=DAILY\r\n");
    changeBy(item, "PT1H");

    // Event with an rdate
    item = makeRecEvent("RDATE:20020403T114500Z\r\n");
    changeBy(item, "PT1H");
    ritem = item.recurrenceInfo.getRecurrenceItemAt(0);
    equal(ritem.date.icalString, "20020403T124500Z");

    // Event with an exdate
    item = makeRecEvent("EXDATE:20020403T114500Z\r\n");
    changeBy(item, "PT1H");
    ritem = item.recurrenceInfo.getRecurrenceItemAt(0);
    equal(ritem.date.icalString, "20020403T124500Z");

    // Event with an rrule with until date
    item = makeRecEvent("RRULE:FREQ=WEEKLY;UNTIL=20020406T114500Z\r\n");
    changeBy(item, "PT1H");
    ritem = item.recurrenceInfo.getRecurrenceItemAt(0);
    equal(ritem.untilDate.icalString, "20020406T124500Z");

    // Event with an exception item
    item = makeRecEvent("RRULE:FREQ=DAILY\r\n");
    let occ = item.recurrenceInfo.getOccurrenceFor(cal.createDateTime("20020406T114500Z"));
    occ.startDate = cal.createDateTime("20020406T124500Z");
    item.recurrenceInfo.modifyException(occ, true);
    changeBy(item, "PT1H");
    equal(item.startDate.icalString, "20020402T124500Z");
    occ = item.recurrenceInfo.getExceptionFor(cal.createDateTime("20020406T124500Z"));
    equal(occ.startDate.icalString, "20020406T134500Z");
}

function test_idchange() {
    let item = makeEvent("UID:unchanged\r\n" +
                         "DTSTART:20020402T114500Z\r\n" +
                         "DTEND:20020402T124500Z\r\n" +
                         "RRULE:FREQ=DAILY\r\n");
    let occ = item.recurrenceInfo.getOccurrenceFor(cal.createDateTime("20020406T114500Z"));
    occ.startDate = cal.createDateTime("20020406T124500Z");
    item.recurrenceInfo.modifyException(occ, true);
    equal(occ.id, "unchanged");

    item.id = "changed";

    occ = item.recurrenceInfo.getExceptionFor(cal.createDateTime("20020406T114500Z"));
    equal(occ.id , "changed");
}

function test_failures() {
    let item = makeEvent("DTSTART:20020402T114500Z\r\n" +
                         "DTEND:20020402T124500Z\r\n" +
                         "RRULE:INTERVAL=2;FREQ=WEEKLY;COUNT=6;BYDAY=TU,WE\r\n");
    let rinfo = item.recurrenceInfo;
    let ritem = cal.createRecurrenceDate();

    throws(() => rinfo.getRecurrenceItemAt(-1), /Illegal value/, "Invalid Argument");
    throws(() => rinfo.getRecurrenceItemAt(1), /Illegal value/, "Invalid Argument");
    throws(() => rinfo.deleteRecurrenceItemAt(-1), /Illegal value/, "Invalid Argument");
    throws(() => rinfo.deleteRecurrenceItemAt(1), /Illegal value/, "Invalid Argument");
    throws(() => rinfo.deleteRecurrenceItem(ritem), /Illegal value/, "Invalid Argument");
    throws(() => rinfo.insertRecurrenceItemAt(ritem, -1), /Illegal value/, "Invalid Argument");
    throws(() => rinfo.insertRecurrenceItemAt(ritem, 2), /Illegal value/, "Invalid Argument");
    throws(() => rinfo.restoreOccurrenceAt(cal.createDateTime("20080101T010101")), /Illegal value/, "Invalid Argument");
    throws(() => cal.createRecurrenceInfo().isFinite, /Component not initialized/);

    // modifyException with a different parent item
    let occ = rinfo.getOccurrenceFor(cal.createDateTime("20120102T114500Z"));
    occ.calendar = {}
    occ.id = "1234";
    occ.parentItem = occ;
    throws(() => rinfo.modifyException(occ, true), /Illegal value/, "Invalid Argument");

    occ = rinfo.getOccurrenceFor(cal.createDateTime("20120102T114500Z"));
    occ.recurrenceId = null;
    throws(() => rinfo.modifyException(occ, true), /Illegal value/, "Invalid Argument");

    // Missing DTSTART/DUE but RRULE
    item = createEventFromIcalString("BEGIN:VCALENDAR\r\n" +
        "BEGIN:VTODO\r\n" +
        "RRULE:FREQ=DAILY\r\n" +
        "END:VTODO\r\n" +
        "END:VCALENDAR\r\n"
    );
    rinfo = item.recurrenceInfo;
    equal(rinfo.getOccurrenceDates(cal.createDateTime("20120101T010101"),
                                         cal.createDateTime("20120203T010101"),
                                         0, {}).length, 0);
}

function test_immutable() {
    item = createEventFromIcalString("BEGIN:VCALENDAR\r\n" +
        "BEGIN:VTODO\r\n" +
        "RRULE:FREQ=DAILY\r\n" +
        "END:VTODO\r\n" +
        "END:VCALENDAR\r\n"
    );
    ok(item.recurrenceInfo.isMutable);
    let rinfo2 = item.recurrenceInfo.clone();
    rinfo2.makeImmutable();
    rinfo2.makeImmutable(); // Doing so twice shouldn't throw
    throws(() => rinfo2.appendRecurrenceItem(ritem), /Can not modify immutable data container/);
    ok(!rinfo2.isMutable);

    let ritem = cal.createRecurrenceDate();
    rinfo.appenRecurrenceItem(ritem);
}

function test_rrule_icalstring() {
    var recRule = createRecurrenceRule();
    recRule.type = "DAILY";
    recRule.interval = 4;
    equal(recRule.icalString, "RRULE:FREQ=DAILY;INTERVAL=4\r\n");

    var recRule = createRecurrenceRule();
    recRule.type = "DAILY";
    recRule.setComponent("BYDAY", 5, [2, 3, 4, 5, 6]);
    equal(recRule.icalString, "RRULE:FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR\r\n");
    deepEqual(recRule.getComponent("BYDAY", {}), [2, 3, 4, 5, 6]);

    var recRule = createRecurrenceRule();
    recRule.type = "WEEKLY";
    recRule.interval = 3;
    recRule.setComponent("BYDAY", 3, [2, 4, 6]);
    equal(recRule.icalString, "RRULE:FREQ=WEEKLY;INTERVAL=3;BYDAY=MO,WE,FR\r\n");
    deepEqual(recRule.getComponent("BYDAY", {}), [2, 4, 6]);

    var recRule = createRecurrenceRule();
    recRule.type = "MONTHLY";
    recRule.setComponent("BYDAY", 7, [2,3,4,5,6,7,1]);
    equal(recRule.icalString, "RRULE:FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR,SA,SU\r\n");
    deepEqual(recRule.getComponent("BYDAY", {}), [2,3,4,5,6,7,1]);

    var recRule = createRecurrenceRule();
    recRule.type = "MONTHLY";
    recRule.setComponent("BYDAY", 1, [10]);
    equal(recRule.icalString, "RRULE:FREQ=MONTHLY;BYDAY=1MO\r\n");
    deepEqual(recRule.getComponent("BYDAY", {}), [10]);

    var recRule = createRecurrenceRule();
    recRule.type = "MONTHLY";
    recRule.setComponent("BYDAY", 1, [20]);
    equal(recRule.icalString, "RRULE:FREQ=MONTHLY;BYDAY=2WE\r\n");
    deepEqual(recRule.getComponent("BYDAY", {}), [20]);

    var recRule = createRecurrenceRule();
    recRule.type = "MONTHLY";
    recRule.setComponent("BYDAY", 1, [-22]);
    equal(recRule.icalString, "RRULE:FREQ=MONTHLY;BYDAY=-2FR\r\n");
    deepEqual(recRule.getComponent("BYDAY", {}), [-22]);

    var recRule = createRecurrenceRule();
    recRule.type = "MONTHLY";
    recRule.setComponent("BYMONTHDAY", 1, [5]);
    equal(recRule.icalString, "RRULE:FREQ=MONTHLY;BYMONTHDAY=5\r\n");
    deepEqual(recRule.getComponent("BYMONTHDAY", {}), [5]);

    var recRule = createRecurrenceRule();
    recRule.type = "MONTHLY";
    recRule.setComponent("BYMONTHDAY", 3, [1, 9, 17]);
    equal(recRule.icalString, "RRULE:FREQ=MONTHLY;BYMONTHDAY=1,9,17\r\n");
    deepEqual(recRule.getComponent("BYMONTHDAY", {}), [1, 9, 17]);

    var recRule = createRecurrenceRule();
    recRule.type = "YEARLY";
    recRule.setComponent("BYMONTH", 1, [1]);
    recRule.setComponent("BYMONTHDAY", 1, [3]);
    ok([
        "RRULE:FREQ=YEARLY;BYMONTHDAY=3;BYMONTH=1\r\n",
        "RRULE:FREQ=YEARLY;BYMONTH=1;BYMONTHDAY=3\r\n"
    ].includes(recRule.icalString));
    deepEqual(recRule.getComponent("BYMONTH", {}), [1]);
    deepEqual(recRule.getComponent("BYMONTHDAY", {}), [3]);

    var recRule = createRecurrenceRule();
    recRule.type = "YEARLY";
    recRule.setComponent("BYMONTH", 1, [4]);
    recRule.setComponent("BYDAY", 1, [3]);
    ok([
        "RRULE:FREQ=YEARLY;BYDAY=TU;BYMONTH=4\r\n",
        "RRULE:FREQ=YEARLY;BYMONTH=4;BYDAY=TU\r\n"
    ].includes(recRule.icalString));
    deepEqual(recRule.getComponent("BYMONTH", {}), [4]);
    deepEqual(recRule.getComponent("BYDAY", {}), [3]);

    var recRule = createRecurrenceRule();
    recRule.type = "YEARLY";
    recRule.setComponent("BYMONTH", 1, [4]);
    recRule.setComponent("BYDAY", 1, [10]);
    ok([
        "RRULE:FREQ=YEARLY;BYDAY=1MO;BYMONTH=4\r\n",
        "RRULE:FREQ=YEARLY;BYMONTH=4;BYDAY=1MO\r\n"
    ].includes(recRule.icalString));
    deepEqual(recRule.getComponent("BYMONTH", {}), [4]);
    deepEqual(recRule.getComponent("BYDAY", {}), [10]);

    var recRule = createRecurrenceRule();
    recRule.type = "YEARLY";
    recRule.setComponent("BYMONTH", 1, [4]);
    recRule.setComponent("BYDAY", 1, [-22]);
    ok([
        "RRULE:FREQ=YEARLY;BYDAY=-2FR;BYMONTH=4\r\n",
        "RRULE:FREQ=YEARLY;BYMONTH=4;BYDAY=-2FR\r\n"
    ].includes(recRule.icalString));
    deepEqual(recRule.getComponent("BYMONTH", {}), [4]);
    deepEqual(recRule.getComponent("BYDAY", {}), [-22]);
}
