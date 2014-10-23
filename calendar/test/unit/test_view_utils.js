/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

Components.utils.import("resource://calendar/modules/calViewUtils.jsm");

function run_test() {
    test_not_a_date();
    test_compare_event_and_todo();
    test_compare_startdate();
    test_compare_enddate();
    test_compare_alldayevent();
    test_compare_title();
    test_compare_todo();
}

function test_not_a_date() {
    let item = cal.createEvent();

    let result = cal.view.compareItems(null, item);
    equal(result, -1);

    result = cal.view.compareItems(item, null);
    equal(result, 1);
}

function test_compare_event_and_todo() {
    let a = cal.createEvent();
    let b = cal.createTodo();

    let result = cal.view.compareItems(a, b);
    equal(result, 1);

    result = cal.view.compareItems(b, a);
    equal(result, -1);
}

function test_compare_startdate() {
    let a = cal.createEvent();
    a.startDate = createDate(1990, 0, 1, 1);
    let b = cal.createEvent();
    b.startDate = createDate(2000, 0, 1, 1);

    let result = cal.view.compareItems(a, b);
    equal(result, -1);

    result = cal.view.compareItems(b, a);
    equal(result, 1);

    result = cal.view.compareItems(a, a);
    equal(result, 0);
}

function test_compare_enddate() {
    let a = cal.createEvent();
    a.startDate = createDate(1990, 0, 1, 1);
    a.endDate = createDate(1990, 0, 2, 1);
    let b = cal.createEvent();
    b.startDate = createDate(1990, 0, 1, 1);
    b.endDate = createDate(1990, 0, 5, 1);

    let result = cal.view.compareItems(a, b);
    equal(result, -1);

    result = cal.view.compareItems(b, a);
    equal(result, 1);

    result = cal.view.compareItems(a, a);
    equal(result, 0);
}

function test_compare_alldayevent() {
    let a = cal.createEvent();
    a.startDate = createDate(1990, 0, 1);
    let b = cal.createEvent();
    b.startDate = createDate(1990, 0, 1, 1);

    let result = cal.view.compareItems(a, b);
    equal(result, -1);

    result = cal.view.compareItems(b, a);
    equal(result, 1);

    result = cal.view.compareItems(a, a);
    equal(result, 0);
}

function test_compare_title() {
    let a = cal.createEvent();
    a.startDate = createDate(1990, 0, 1);
    a.title = "Abc";
    let b = cal.createEvent();
    b.startDate = createDate(1990, 0, 1);
    b.title = "Xyz";

    let result = cal.view.compareItems(a, b);
    equal(result, -1);

    result = cal.view.compareItems(b, a);
    equal(result, 1);

    result = cal.view.compareItems(a, a);
    equal(result, 0);
}

function test_compare_todo() {
    let a = cal.createTodo();
    let b = cal.createTodo();

    let cmp = cal.view.compareItems(a, b);
    equal(cmp, 0);

    cmp = cal.view.compareItems(b, a);
    equal(cmp, 0);

    cmp = cal.view.compareItems(a, a);
    equal(cmp, 0);
}
