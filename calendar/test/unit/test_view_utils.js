/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { XPCOMUtils } = ChromeUtils.importESModule("resource://gre/modules/XPCOMUtils.sys.mjs");

ChromeUtils.defineESModuleGetters(this, {
  CalEvent: "resource:///modules/CalEvent.sys.mjs",
  CalTodo: "resource:///modules/CalTodo.sys.mjs",
});

function run_test() {
  do_calendar_startup(really_run_test);
}

function really_run_test() {
  test_not_a_date();
  test_compare_event_and_todo();
  test_compare_startdate();
  test_compare_enddate();
  test_compare_alldayevent();
  test_compare_title();
  test_compare_todo();
}

function test_not_a_date() {
  const item = new CalEvent();

  let result = cal.view.compareItems(null, item);
  equal(result, -1);

  result = cal.view.compareItems(item, null);
  equal(result, 1);
}

function test_compare_event_and_todo() {
  const a = new CalEvent();
  const b = new CalTodo();

  let result = cal.view.compareItems(a, b);
  equal(result, 1);

  result = cal.view.compareItems(b, a);
  equal(result, -1);
}

function test_compare_startdate() {
  const a = new CalEvent();
  a.startDate = createDate(1990, 0, 1, 1);
  const b = new CalEvent();
  b.startDate = createDate(2000, 0, 1, 1);

  let result = cal.view.compareItems(a, b);
  equal(result, -1);

  result = cal.view.compareItems(b, a);
  equal(result, 1);

  result = cal.view.compareItems(a, a);
  equal(result, 0);
}

function test_compare_enddate() {
  const a = new CalEvent();
  a.startDate = createDate(1990, 0, 1, 1);
  a.endDate = createDate(1990, 0, 2, 1);
  const b = new CalEvent();
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
  const a = new CalEvent();
  a.startDate = createDate(1990, 0, 1);
  const b = new CalEvent();
  b.startDate = createDate(1990, 0, 1, 1);

  let result = cal.view.compareItems(a, b);
  equal(result, -1);

  result = cal.view.compareItems(b, a);
  equal(result, 1);

  result = cal.view.compareItems(a, a);
  equal(result, 0);
}

function test_compare_title() {
  const a = new CalEvent();
  a.startDate = createDate(1990, 0, 1);
  a.title = "Abc";
  const b = new CalEvent();
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
  const a = new CalTodo();
  const b = new CalTodo();

  let cmp = cal.view.compareItems(a, b);
  equal(cmp, 0);

  cmp = cal.view.compareItems(b, a);
  equal(cmp, 0);

  cmp = cal.view.compareItems(a, a);
  equal(cmp, 0);
}
