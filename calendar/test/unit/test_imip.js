/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

Components.utils.import("resource://gre/modules/Preferences.jsm");
Components.utils.import("resource://gre/modules/Services.jsm");
var calItipEmailTransport = {};
Services.scriptloader.loadSubScript(
    "resource://calendar/components/calItipEmailTransport.js",
    calItipEmailTransport);

function run_test() {
    run_next_test();
}

function itipItemForTest(title, seq) {
    let itipItem = Components
            .classes["@mozilla.org/calendar/itip-item;1"]
            .createInstance(Components.interfaces.calIItipItem);
    itipItem.init([
        "BEGIN:VCALENDAR",
        "METHOD:REQUEST",
        "BEGIN:VEVENT",
        "SUMMARY:" + title,
        "SEQUENCE:" + (seq || 0),
        "END:VEVENT",
        "END:VCALENDAR"
    ].join("\r\n"));
    return itipItem;
}

let transport = new calItipEmailTransport.calItipEmailTransport();

add_task(function test_title_in_subject() {
    Preferences.set("calendar.itip.useInvitationSubjectPrefixes", false);
    let items = transport._prepareItems(itipItemForTest("foo"));
    equal(items.subject, "foo");
});

add_task(function test_title_in_summary() {
    Preferences.set("calendar.itip.useInvitationSubjectPrefixes", true);
    let items = transport._prepareItems(itipItemForTest("bar"));
    equal(items.subject, "Event Invitation: bar");
});

add_task(function test_updated_title_in_subject() {
    Preferences.set("calendar.itip.useInvitationSubjectPrefixes", false);
    let items = transport._prepareItems(itipItemForTest("foo", 2));
    equal(items.subject, "foo");
});

add_task(function test_updated_title_in_summary() {
    Preferences.set("calendar.itip.useInvitationSubjectPrefixes", true);
    let items = transport._prepareItems(itipItemForTest("bar", 2));
    equal(items.subject, "Updated Event Invitation: bar");
});
