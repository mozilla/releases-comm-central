/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");

function run_test() {
  // In bug 523860, we found out that in the spec doublequotes should not be
  // escaped.
  const prop = cal.icsService.createIcalProperty("DESCRIPTION");
  const expected = "A String with \"quotes\" and 'other quotes'";

  prop.value = expected;
  equal(prop.icalString, "DESCRIPTION:" + expected + "\r\n");
}
