/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { CalItipEmailTransport } = ChromeUtils.importESModule(
  "resource:///modules/CalItipEmailTransport.sys.mjs"
);

function itipItemForTest(title, seq) {
  const itipItem = Cc["@mozilla.org/calendar/itip-item;1"].createInstance(Ci.calIItipItem);
  itipItem.init(
    [
      "BEGIN:VCALENDAR",
      "METHOD:REQUEST",
      "BEGIN:VEVENT",
      "SUMMARY:" + title,
      "SEQUENCE:" + (seq || 0),
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n")
  );
  return itipItem;
}

const transport = new CalItipEmailTransport();

add_task(function test_title_in_subject() {
  Services.prefs.setBoolPref("calendar.itip.useInvitationSubjectPrefixes", false);
  const items = transport._prepareItems(itipItemForTest("foo"));
  equal(items.subject, "foo");
});

add_task(function test_title_in_summary() {
  Services.prefs.setBoolPref("calendar.itip.useInvitationSubjectPrefixes", true);
  const items = transport._prepareItems(itipItemForTest("bar"));
  equal(items.subject, "Invitation: bar");
});

add_task(function test_updated_title_in_subject() {
  Services.prefs.setBoolPref("calendar.itip.useInvitationSubjectPrefixes", false);
  const items = transport._prepareItems(itipItemForTest("foo", 2));
  equal(items.subject, "foo");
});

add_task(function test_updated_title_in_summary() {
  Services.prefs.setBoolPref("calendar.itip.useInvitationSubjectPrefixes", true);
  const items = transport._prepareItems(itipItemForTest("bar", 2));
  equal(items.subject, "Updated: bar");
});
