/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

Components.utils.import("resource://calendar/modules/calUtils.jsm");

function run_test() {
    removeMailTo_test();
    prependMailTo_test();
}

// tests for calUtils.jsm

function removeMailTo_test() {
    let data = [{input: "mailto:first.last@example.net", expected: "first.last@example.net"},
                {input: "MAILTO:first.last@example.net", expected: "first.last@example.net"},
                {input: "first.last@example.net", expected: "first.last@example.net"},
                {input: "first.last.example.net", expected: "first.last.example.net"}];
    for (let test of data) {
        equal(cal.removeMailTo(test.input), test.expected)
    }
};

function prependMailTo_test() {
    let data = [{input: "mailto:first.last@example.net", expected: "mailto:first.last@example.net"},
                {input: "MAILTO:first.last@example.net", expected: "mailto:first.last@example.net"},
                {input: "first.last@example.net", expected: "mailto:first.last@example.net"},
                {input: "first.last.example.net", expected: "first.last.example.net"}];
    for (let test of data) {
        equal(cal.prependMailTo(test.input), test.expected)
    }
};
