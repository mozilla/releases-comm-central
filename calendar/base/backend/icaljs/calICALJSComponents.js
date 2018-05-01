/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");
ChromeUtils.import("resource://gre/modules/Services.jsm");

this.NSGetFactory = (cid) => {
    let scriptLoadOrder = [
        "resource://calendar/calendar-js/calTimezone.js",
        "resource://calendar/calendar-js/calDateTime.js",
        "resource://calendar/calendar-js/calDuration.js",
        "resource://calendar/calendar-js/calICSService.js",
        "resource://calendar/calendar-js/calPeriod.js",
        "resource://calendar/calendar-js/calRecurrenceRule.js",
    ];

    for (let script of scriptLoadOrder) {
        Services.scriptloader.loadSubScript(script, this);
    }

    let components = [
        calDateTime, calDuration, calIcalComponent, calIcalProperty, calICSService, calPeriod,
        calRecurrenceRule
    ];

    this.NSGetFactory = XPCOMUtils.generateNSGetFactory(components);
    return this.NSGetFactory(cid);
};
