/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from calItemBase.js */

import { cal } from "resource:///modules/calendar/calUtils.sys.mjs";

Services.scriptloader.loadSubScript("resource:///components/calItemBase.js");

/**
 * Constructor for `calIAttendee` objects.
 *
 * @class
 * @implements {calIAttendee}
 * @param {string} [icalString] - Optional iCal string for initializing existing attendees.
 */
export function CalAttendee(icalString) {
  this.wrappedJSObject = this;
  this.mProperties = new Map();
  if (icalString) {
    this.icalString = icalString;
  }
}

CalAttendee.prototype = {
  QueryInterface: ChromeUtils.generateQI(["calIAttendee"]),
  classID: Components.ID("{5c8dcaa3-170c-4a73-8142-d531156f664d}"),

  mImmutable: false,
  get isMutable() {
    return !this.mImmutable;
  },

  modify() {
    if (this.mImmutable) {
      throw Components.Exception("", Cr.NS_ERROR_OBJECT_IS_IMMUTABLE);
    }
  },

  makeImmutable() {
    this.mImmutable = true;
  },

  clone() {
    const a = new CalAttendee();

    if (this.mIsOrganizer) {
      a.isOrganizer = true;
    }

    const allProps = ["id", "commonName", "rsvp", "role", "participationStatus", "userType"];
    for (const prop of allProps) {
      a[prop] = this[prop];
    }

    for (const [key, value] of this.mProperties.entries()) {
      a.setProperty(key, value);
    }

    return a;
  },
  // XXX enforce legal values for our properties;

  icalAttendeePropMap: [
    { cal: "rsvp", ics: "RSVP" },
    { cal: "commonName", ics: "CN" },
    { cal: "participationStatus", ics: "PARTSTAT" },
    { cal: "userType", ics: "CUTYPE" },
    { cal: "role", ics: "ROLE" },
  ],

  mIsOrganizer: false,
  get isOrganizer() {
    return this.mIsOrganizer;
  },
  set isOrganizer(bool) {
    this.mIsOrganizer = bool;
  },

  // icalatt is a calIcalProperty of type attendee
  set icalProperty(icalatt) {
    this.modify();
    this.id = icalatt.valueAsIcalString;
    this.mIsOrganizer = icalatt.propertyName == "ORGANIZER";

    const promotedProps = {};
    for (const prop of this.icalAttendeePropMap) {
      this[prop.cal] = icalatt.getParameter(prop.ics);
      // Don't copy these to the property bag.
      promotedProps[prop.ics] = true;
    }

    // Reset the property bag for the parameters, it will be re-initialized
    // from the ical property.
    this.mProperties = new Map();

    for (const [name, value] of cal.iterate.icalParameter(icalatt)) {
      if (!promotedProps[name]) {
        this.setProperty(name, value);
      }
    }
  },

  get icalProperty() {
    let icalatt;
    if (this.mIsOrganizer) {
      icalatt = cal.icsService.createIcalProperty("ORGANIZER");
    } else {
      icalatt = cal.icsService.createIcalProperty("ATTENDEE");
    }

    if (!this.id) {
      throw Components.Exception("", Cr.NS_ERROR_NOT_INITIALIZED);
    }
    icalatt.valueAsIcalString = this.id;
    for (let i = 0; i < this.icalAttendeePropMap.length; i++) {
      const prop = this.icalAttendeePropMap[i];
      if (this[prop.cal]) {
        try {
          icalatt.setParameter(prop.ics, this[prop.cal]);
        } catch (e) {
          if (e.result == Cr.NS_ERROR_ILLEGAL_VALUE) {
            // Illegal values should be ignored, but we could log them if
            // the user has enabled logging.
            cal.LOG("Warning: Invalid attendee parameter value " + prop.ics + "=" + this[prop.cal]);
          } else {
            throw e;
          }
        }
      }
    }
    for (const [key, value] of this.mProperties.entries()) {
      try {
        icalatt.setParameter(key, value);
      } catch (e) {
        if (e.result == Cr.NS_ERROR_ILLEGAL_VALUE) {
          // Illegal values should be ignored, but we could log them if
          // the user has enabled logging.
          cal.LOG("Warning: Invalid attendee parameter value " + key + "=" + value);
        } else {
          throw e;
        }
      }
    }
    return icalatt;
  },

  get icalString() {
    const comp = this.icalProperty;
    return comp ? comp.icalString : "";
  },
  set icalString(val) {
    const prop = cal.icsService.createIcalPropertyFromString(val);
    if (prop.propertyName != "ORGANIZER" && prop.propertyName != "ATTENDEE") {
      throw Components.Exception("", Cr.NS_ERROR_ILLEGAL_VALUE);
    }
    this.icalProperty = prop;
  },

  get properties() {
    return [...this.mProperties.entries()];
  },

  // The has/get/set/deleteProperty methods are case-insensitive.
  getProperty(aName) {
    return this.mProperties.get(aName.toUpperCase());
  },
  setProperty(aName, aValue) {
    this.modify();
    if (aValue || !isNaN(parseInt(aValue, 10))) {
      this.mProperties.set(aName.toUpperCase(), aValue);
    } else {
      this.mProperties.delete(aName.toUpperCase());
    }
  },
  deleteProperty(aName) {
    this.modify();
    this.mProperties.delete(aName.toUpperCase());
  },

  mId: null,
  get id() {
    return this.mId;
  },
  set id(aId) {
    this.modify();
    // RFC 1738 para 2.1 says we should be using lowercase mailto: urls
    // we enforce prepending the mailto prefix for email type ids as migration code bug 1199942
    this.mId = aId ? cal.email.prependMailTo(aId) : null;
  },

  toString() {
    const emailRE = new RegExp("^mailto:", "i");
    let stringRep = (this.id || "").replace(emailRE, "");
    const commonName = this.commonName;

    if (commonName) {
      stringRep = commonName + " <" + stringRep + ">";
    }

    return stringRep;
  },
};

makeMemberAttr(CalAttendee, "mCommonName", "commonName", null);
makeMemberAttr(CalAttendee, "mRsvp", "rsvp", null);
makeMemberAttr(CalAttendee, "mRole", "role", null);
makeMemberAttr(CalAttendee, "mParticipationStatus", "participationStatus", "NEEDS-ACTION");
makeMemberAttr(CalAttendee, "mUserType", "userType", "INDIVIDUAL");
