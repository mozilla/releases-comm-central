/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

function run_test() {
    // Bug 1239622. The 1st of January after a leap year which ends with
    // a Thursday belongs to week number 53 unless the start of week is
    // set on Friday.
    let wkst_wknum_date = [
        [1, 53, "20210101T000000Z"],   // Year 2021 affected by Bug 1239622
        [5, 1, "20210101T000000Z"],    //
        [3, 53, "20490101T000000Z"],   // Year 2049 affected by Bug 1239622
        [5, 1, "20490101T000000Z"],    //
        [0, 1, "20170101T000000Z"],    // Year that starts on Sunday ...
        [3, 52, "20180101T000000Z"],   // ... Monday
        [0, 1, "20190101T000000Z"],    // ... Tuesday
        [4, 52, "20200101T000000Z"],   // ... Wednesday
        [0, 1, "20260101T000000Z"],    // ... Thursday
        [0, 53, "20270101T000000Z"],   // ... Friday
        [0, 52, "20280101T000000Z"]];  // ... Saturday

    let savedWeekStart = Preferences.get("calendar.week.start", 0);
    for (let [weekStart, weekNumber, dateString] of wkst_wknum_date) {
        Preferences.set("calendar.week.start", weekStart);
        let date = cal.createDateTime(dateString);
        date.isDate = true;
        let week = cal.getWeekInfoService().getWeekTitle(date);

        equal(week, weekNumber, "Week number matches for " + dateString);
    }
    Preferences.set("calendar.week.start", savedWeekStart);
}
