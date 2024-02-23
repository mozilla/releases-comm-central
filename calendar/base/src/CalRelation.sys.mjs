/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { cal } from "resource:///modules/calendar/calUtils.sys.mjs";

/**
 * Constructor for `calIRelation` objects.
 *
 * @class
 * @implements {calIRelation}
 * @param {string} [icalString] - Optional iCal string for initializing existing relations.
 */
export function CalRelation(icalString) {
  this.wrappedJSObject = this;
  this.mProperties = new Map();
  if (icalString) {
    this.icalString = icalString;
  }
}

CalRelation.prototype = {
  QueryInterface: ChromeUtils.generateQI(["calIRelation"]),
  classID: Components.ID("{76810fae-abad-4019-917a-08e95d5bbd68}"),

  mType: null,
  mId: null,

  /**
   * @see calIRelation
   */

  get relType() {
    return this.mType;
  },
  set relType(aType) {
    this.mType = aType;
  },

  get relId() {
    return this.mId;
  },
  set relId(aRelId) {
    this.mId = aRelId;
  },

  get icalProperty() {
    const icalatt = cal.icsService.createIcalProperty("RELATED-TO");
    if (this.mId) {
      icalatt.value = this.mId;
    }

    if (this.mType) {
      icalatt.setParameter("RELTYPE", this.mType);
    }

    for (const [key, value] of this.mProperties.entries()) {
      try {
        icalatt.setParameter(key, value);
      } catch (e) {
        if (e.result == Cr.NS_ERROR_ILLEGAL_VALUE) {
          // Illegal values should be ignored, but we could log them if
          // the user has enabled logging.
          cal.LOG("Warning: Invalid relation property value " + key + "=" + value);
        } else {
          throw e;
        }
      }
    }
    return icalatt;
  },

  set icalProperty(attProp) {
    // Reset the property bag for the parameters, it will be re-initialized
    // from the ical property.
    this.mProperties = new Map();

    if (attProp.value) {
      this.mId = attProp.value;
    }
    for (const [name, value] of cal.iterate.icalParameter(attProp)) {
      if (name == "RELTYPE") {
        this.mType = value;
        continue;
      }

      this.setParameter(name, value);
    }
  },

  get icalString() {
    const comp = this.icalProperty;
    return comp ? comp.icalString : "";
  },
  set icalString(val) {
    const prop = cal.icsService.createIcalPropertyFromString(val);
    if (prop.propertyName != "RELATED-TO") {
      throw Components.Exception("", Cr.NS_ERROR_ILLEGAL_VALUE);
    }
    this.icalProperty = prop;
  },

  getParameter(aName) {
    return this.mProperties.get(aName);
  },

  setParameter(aName, aValue) {
    return this.mProperties.set(aName, aValue);
  },

  deleteParameter(aName) {
    return this.mProperties.delete(aName);
  },

  clone() {
    const newRelation = new CalRelation();
    newRelation.mId = this.mId;
    newRelation.mType = this.mType;
    for (const [name, value] of this.mProperties.entries()) {
      newRelation.mProperties.set(name, value);
    }
    return newRelation;
  },
};
