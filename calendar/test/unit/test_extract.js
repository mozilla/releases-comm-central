/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

Components.utils.import("resource://calendar/modules/calExtract.jsm");
Components.utils.import("resource://gre/modules/Preferences.jsm");

var extractor = new Extractor("en-US", 8);

function run_test() {
    // Sanity check to make sure the base url is still right. If this fails,
    // don't forget to also fix the url in base/content/calendar-extract.js.
    ok(extractor.checkBundle("en-US"));

    test_event_start_end();
    test_event_start_duration();
    test_event_start_end_whitespace();
    test_event_without_date();
    test_event_next_year();
    test_task_due();
    test_overrides();
    test_event_start_dollar_sign();
}

function test_event_start_end() {
    let date = new Date(2012, 9, 1, 9, 0);
    let title = "Wednesday meetup";
    let content = "We'll meet at 2 pm and discuss until 3 pm.";

    let collected = extractor.extract(title, content, date, undefined);
    let guessed = extractor.guessStart();
    let endGuess = extractor.guessEnd(guessed);

    equal(guessed.year, 2012);
    equal(guessed.month, 10);
    equal(guessed.day, 3);
    equal(guessed.hour, 14);
    equal(guessed.minute, 0);

    equal(endGuess.year, 2012);
    equal(endGuess.month, 10);
    equal(endGuess.day, 3);
    equal(endGuess.hour, 15);
    equal(endGuess.minute, 0);
}

function test_event_start_duration() {
    let date = new Date(2012, 9, 1, 9, 0);
    let title = "Wednesday meetup";
    let content = "We'll meet at 2 pm and discuss for 30 minutes.";

    let collected = extractor.extract(title, content, date, undefined);
    let guessed = extractor.guessStart();
    let endGuess = extractor.guessEnd(guessed);

    equal(guessed.year, 2012);
    equal(guessed.month, 10);
    equal(guessed.day, 3);
    equal(guessed.hour, 14);
    equal(guessed.minute, 0);

    equal(endGuess.year, 2012);
    equal(endGuess.month, 10);
    equal(endGuess.day, 3);
    equal(endGuess.hour, 14);
    equal(endGuess.minute, 30);
}

function test_event_start_end_whitespace() {
    let date = new Date(2012, 9, 1, 9, 0);
    let title = "Wednesday meetup";
    let content = "We'll meet at2pm and discuss until\r\n3pm.";

    let collected = extractor.extract(title, content, date, undefined);
    let guessed = extractor.guessStart();
    let endGuess = extractor.guessEnd(guessed);

    equal(guessed.year, 2012);
    equal(guessed.month, 10);
    equal(guessed.day, 3);
    equal(guessed.hour, 14);
    equal(guessed.minute, 0);

    equal(endGuess.year, 2012);
    equal(endGuess.month, 10);
    equal(endGuess.day, 3);
    equal(endGuess.hour, 15);
    equal(endGuess.minute, 0);
}

function test_event_without_date() {
    let date = new Date(2012, 9, 1, 9, 0);
    let title = "Meetup";
    let content = "We'll meet at 2 pm and discuss until 3 pm.";

    let collected = extractor.extract(title, content, date, undefined);
    let guessed = extractor.guessStart();
    let endGuess = extractor.guessEnd(guessed);

    equal(guessed.year, 2012);
    equal(guessed.month, 10);
    equal(guessed.day, 1);
    equal(guessed.hour, 14);
    equal(guessed.minute, 0);

    equal(endGuess.year, 2012);
    equal(endGuess.month, 10);
    equal(endGuess.day, 1);
    equal(endGuess.hour, 15);
    equal(endGuess.minute, 0);
}

function test_event_next_year() {
    let date = new Date(2012, 9, 1, 9, 0);
    let title = "Open day";
    let content = "FYI: Next open day is planned for February 5th.";

    let collected = extractor.extract(title, content, date, undefined);
    let guessed = extractor.guessStart();
    let endGuess = extractor.guessEnd(guessed);

    equal(guessed.year, 2013);
    equal(guessed.month, 2);
    equal(guessed.day, 5);
    equal(guessed.hour, undefined);
    equal(guessed.minute, undefined);

    equal(endGuess.year, undefined);
    equal(endGuess.month, undefined);
    equal(endGuess.day, undefined);
    equal(endGuess.hour, undefined);
    equal(endGuess.minute, undefined);
}

function test_task_due() {
    let date = new Date(2012, 9, 1, 9, 0);
    let title = "Assignment deadline";
    let content = "This is a reminder that all assignments must be sent in by October 5th!.";

    let collected = extractor.extract(title, content, date, undefined);
    let guessed = extractor.guessStart(true);
    let endGuess = extractor.guessEnd(guessed, true);

    equal(guessed.year, 2012);
    equal(guessed.month, 10);
    equal(guessed.day, 1);
    equal(guessed.hour, 9);
    equal(guessed.minute, 0);

    equal(endGuess.year, 2012);
    equal(endGuess.month, 10);
    equal(endGuess.day, 5);
    equal(endGuess.hour, 0);
    equal(endGuess.minute, 0);
}

function test_overrides() {
    let date = new Date(2012, 9, 1, 9, 0);
    let title = "Event invitation";
    let content = "We'll meet 10:11 worromot";

    let collected = extractor.extract(title, content, date, undefined);
    let guessed = extractor.guessStart(false);
    let endGuess = extractor.guessEnd(guessed, true);

    equal(guessed.year, 2012);
    equal(guessed.month, 10);
    equal(guessed.day, 1);
    equal(guessed.hour, 10);
    equal(guessed.minute, 11);

    equal(endGuess.year, undefined);
    equal(endGuess.month, undefined);
    equal(endGuess.day, undefined);
    equal(endGuess.hour, undefined);
    equal(endGuess.minute, undefined);

    // recognize a custom "tomorrow" and hour.minutes pattern
    let overrides = {"from.hour.minutes":
                      {"add": "#2:#1", "remove": "#1:#2"},
                     "from.tomorrow":
                      {"add": "worromot"}};
    Preferences.set("calendar.patterns.override", JSON.stringify(overrides));

    collected = extractor.extract(title, content, date, undefined);
    guessed = extractor.guessStart(false);
    endGuess = extractor.guessEnd(guessed, true);

    equal(guessed.year, 2012);
    equal(guessed.month, 10);
    equal(guessed.day, 2);
    equal(guessed.hour, 11);
    equal(guessed.minute, 10);

    equal(endGuess.year, undefined);
    equal(endGuess.month, undefined);
    equal(endGuess.day, undefined);
    equal(endGuess.hour, undefined);
    equal(endGuess.minute, undefined);
}

function test_event_start_dollar_sign() {
    let date = new Date(2012, 9, 1, 9, 0);
    let title = "Wednesday sale";
    let content = "Sale starts at 3 pm and prices start at 2$.";

    let collected = extractor.extract(title, content, date, undefined);
    let guessed = extractor.guessStart();
    let endGuess = extractor.guessEnd(guessed);

    equal(guessed.year, 2012);
    equal(guessed.month, 10);
    equal(guessed.day, 3);
    equal(guessed.hour, 15);
    equal(guessed.minute, 0);
}
