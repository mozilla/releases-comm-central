/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");

/**
 * calRelation prototype definition
 *
 * @implements calIRelation
 * @constructor
 */
function calRelation() {
  this.wrappedJSObject = this;
  this.mProperties = new Map();
}
calRelation.prototype = {
  QueryInterface: ChromeUtils.generateQI([Ci.calIRelation]),
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
    return (this.mType = aType);
  },

  get relId() {
    return this.mId;
  },
  set relId(aRelId) {
    return (this.mId = aRelId);
  },

  get icalProperty() {
    let icssvc = cal.getIcsService();
    let icalatt = icssvc.createIcalProperty("RELATED-TO");
    if (this.mId) {
      icalatt.value = this.mId;
    }

    if (this.mType) {
      icalatt.setParameter("RELTYPE", this.mType);
    }

    for (let [key, value] of this.mProperties.entries()) {
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
    for (let [name, value] of cal.iterate.icalParameter(attProp)) {
      if (name == "RELTYPE") {
        this.mType = value;
        continue;
      }

      this.setParameter(name, value);
    }
  },

  get icalString() {
    let comp = this.icalProperty;
    return comp ? comp.icalString : "";
  },
  set icalString(val) {
    let prop = cal.getIcsService().createIcalPropertyFromString(val);
    if (prop.propertyName != "RELATED-TO") {
      throw Cr.NS_ERROR_ILLEGAL_VALUE;
    }
    this.icalProperty = prop;
    return val;
  },

  getParameter: function(aName) {
    return this.mProperties.get(aName);
  },

  setParameter: function(aName, aValue) {
    return this.mProperties.set(aName, aValue);
  },

  deleteParameter: function(aName) {
    return this.mProperties.delete(aName);
  },

  clone: function() {
    let newRelation = new calRelation();
    newRelation.mId = this.mId;
    newRelation.mType = this.mType;
    for (let [name, value] of this.mProperties.entries()) {
      newRelation.mProperties.set(name, value);
    }
    return newRelation;
  },
};
