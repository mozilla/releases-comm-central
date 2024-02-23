/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { XPCOMUtils } = ChromeUtils.importESModule("resource://gre/modules/XPCOMUtils.sys.mjs");

ChromeUtils.defineESModuleGetters(this, {
  CalAlarm: "resource:///modules/CalAlarm.sys.mjs",
});

function run_test() {
  // ensure that RELATED property is correctly set on the VALARM component
  const alarm = new CalAlarm();
  alarm.action = "DISPLAY";
  alarm.description = "test";
  alarm.related = Ci.calIAlarm.ALARM_RELATED_END;
  alarm.offset = cal.createDuration("-PT15M");
  if (alarm.icalString.search(/RELATED=END/) == -1) {
    do_throw("Bug 486186: RELATED property missing in VALARM component");
  }
}
