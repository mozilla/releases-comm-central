/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { XPCOMUtils } = ChromeUtils.importESModule("resource://gre/modules/XPCOMUtils.sys.mjs");

ChromeUtils.defineESModuleGetters(this, {
  CalEvent: "resource:///modules/CalEvent.sys.mjs",
  CalTodo: "resource:///modules/CalTodo.sys.mjs",
});

function run_test() {
  do_get_profile(true);

  test_not_a_date();
  test_compare_event_and_todo();
  test_compare_startdate();
  test_compare_enddate();
  test_compare_alldayevent();
  test_compare_title();
  test_compare_todo();
  test_fix_google_calendar_description();
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

function test_fix_google_calendar_description() {
  const item = new CalEvent();
  item.descriptionText =
    "&copy;&#65;&#x42; &amp;&lt;&quot; &nbsp;&foo; &ampx &copy &a&a\nhttps://example.com/?a=1&b=2";
  cal.view.fixGoogleCalendarDescription(item);
  equal(
    item.descriptionHTML,
    '\u00a9AB &amp;&lt;" \u00a0&amp;foo; &amp;ampx \u00a9 &amp;a&amp;a<br>' +
      '<a class="moz-txt-link-freetext" href="https://example.com/?a=1&amp;b=2">' +
      "https://example.com/?a=1&amp;b=2</a>",
    "entities should be decoded and URLs linkified"
  );

  item.descriptionText = `${"&a".repeat(320000)} end`;
  cal.view.fixGoogleCalendarDescription(item);
  equal(item.descriptionHTML, `${"&amp;a".repeat(320000)} end`, "unknown entities should be kept");
}
