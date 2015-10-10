/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");
Components.utils.import("resource://calendar/modules/calUtils.jsm");
Components.utils.import("resource://calendar/modules/ical.js");

function calICALJSTimezone(innerObject) {
    this.innerObject = innerObject || new ICAL.Timezone();
    this.wrappedJSObject = this;
}

var calTimezoneInterfaces = [Components.interfaces.calITimezone];
var calTimezoneClassID =  Components.ID("{6702eb17-a968-4b43-b562-0d0c5f8e9eb5}");
calICALJSTimezone.prototype = {
    QueryInterface: XPCOMUtils.generateQI(calTimezoneInterfaces),
    classID: calTimezoneClassID,
    classInfo: XPCOMUtils.generateCI({
        contractID: "@mozilla.org/calendar/timezone;1",
        classDescription: "Calendar Timezone",
        classID: calTimezoneClassID,
        interfaces: calTimezoneInterfaces
    }),

    innerObject: null,

    get provider() { return cal.getTimezoneService(); },
    get icalComponent() {
        let innerComp = this.innerObject.component;
        let comp = null;
        if (innerComp) {
            comp = cal.getIcsService().createIcalComponent("VTIMEZONE");
            comp.icalComponent = innerComp;
        }
        return comp;
    },
    get tzid() { return this.innerObject.tzid; },
    get isFloating() { return this.innerObject == ICAL.Timezone.localTimezone; },
    get isUTC() { return this.innerObject == ICAL.Timezone.utcTimezone; },
    get latitude() { return this.innerObject.latitude; },
    get longitude() { return this.innerObject.longitude; },
    get displayName() {
        let bundle = ICAL.Timezone.cal_tz_bundle;
        let stringName = "pref.timezone." + this.tzid.replace(/\//g, ".");
        let displayName = this.tzid;
        try {
            displayName = bundle.GetStringFromName(stringName);
        } catch (e) {
            // Just use the TZID if the string is mising.
        }
        this.__defineGetter__("displayName", function() {
            return displayName;
        });
        return displayName;
    },

    tostring: function() { return this.innerObject.toString(); }
};

function calLibicalTimezone(tzid, component, latitude, longitude) {
    this.wrappedJSObject = this;
    this.tzid = tzid;
    this.mComponent = component;
    this.mUTC = false;
    this.isFloating = false;
    this.latitude = latitude;
    this.longitude = longitude;
}
calLibicalTimezone.prototype = {
    QueryInterface: XPCOMUtils.generateQI(calTimezoneInterfaces),
    classID: calTimezoneClassID,
    classInfo: XPCOMUtils.generateCI({
        contractID: "@mozilla.org/calendar/timezone;1",
        classDescription: "Calendar Timezone",
        classID: calTimezoneClassID,
        interfaces: calTimezoneInterfaces
    }),

    toString: function calLibicalTimezone_toString() {
        return (this.icalComponent ? this.icalComponent.toString() : this.tzid);
    },

    get isUTC() { return this.mUTC; },

    get icalComponent() {
        var comp = this.mComponent;
        if (comp && (typeof(comp) == "string")) {
            this.mComponent = cal.getIcsService().parseICS("BEGIN:VCALENDAR\r\n" + comp + "\r\nEND:VCALENDAR\r\n", null)
                                                 .getFirstSubcomponent("VTIMEZONE");
        }
        return this.mComponent;
    },

    get displayName() {
        if (this.mDisplayName === undefined) {
            try {
                this.mDisplayName = g_stringBundle.GetStringFromName("pref.timezone." + this.tzid.replace(/\//g, "."));
            } catch (exc) {
                // don't assert here, but gracefully fall back to TZID:
                cal.LOG("Timezone property lookup failed! Falling back to " + this.tzid + "\n" + exc);
                this.mDisplayName = this.tzid;
            }
        }
        return this.mDisplayName;
    },

    get provider() { return cal.getTimezoneService(); }
};
