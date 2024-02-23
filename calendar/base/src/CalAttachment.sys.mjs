/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { cal } from "resource:///modules/calendar/calUtils.sys.mjs";

/**
 * Constructor for `calIAttachment` objects.
 *
 * @class
 * @implements {calIAttachment}
 * @param {string} [icalString] - Optional iCal string for initializing existing attachments.
 */
export function CalAttachment(icalString) {
  this.wrappedJSObject = this;
  this.mProperties = new Map();
  if (icalString) {
    this.icalString = icalString;
  }
}

CalAttachment.prototype = {
  QueryInterface: ChromeUtils.generateQI(["calIAttachment"]),
  classID: Components.ID("{5f76b352-ab75-4c2b-82c9-9206dbbf8571}"),

  mData: null,
  mHashId: null,

  get hashId() {
    if (!this.mHashId) {
      const cryptoHash = Cc["@mozilla.org/security/hash;1"].createInstance(Ci.nsICryptoHash);
      const data = new TextEncoder().encode(this.rawData);
      cryptoHash.init(cryptoHash.MD5);
      cryptoHash.update(data, data.length);
      this.mHashId = cryptoHash.finish(true);
    }
    return this.mHashId;
  },

  /**
   * calIAttachment
   */

  get uri() {
    let uri = null;
    if (this.getParameter("VALUE") != "BINARY") {
      // If this is not binary data, its likely an uri. Attempt to convert
      // and throw otherwise.
      try {
        uri = Services.io.newURI(this.mData);
      } catch (e) {
        // Its possible that the uri contains malformed data. Often
        // callers don't expect an exception here, so we just catch
        // it and return null.
      }
    }

    return uri;
  },
  set uri(aUri) {
    // An uri is the default format, remove any value type parameters
    this.deleteParameter("VALUE");
    this.setData(aUri.spec);
  },

  get rawData() {
    return this.mData;
  },
  set rawData(aData) {
    // Setting the raw data lets us assume this is binary data. Make sure
    // the value parameter is set
    this.setParameter("VALUE", "BINARY");
    this.setData(aData);
  },

  get formatType() {
    return this.getParameter("FMTTYPE");
  },
  set formatType(aType) {
    this.setParameter("FMTTYPE", aType);
  },

  get encoding() {
    return this.getParameter("ENCODING");
  },
  set encoding(aValue) {
    this.setParameter("ENCODING", aValue);
  },

  get icalProperty() {
    const icalatt = cal.icsService.createIcalProperty("ATTACH");

    for (const [key, value] of this.mProperties.entries()) {
      try {
        icalatt.setParameter(key, value);
      } catch (e) {
        if (e.result == Cr.NS_ERROR_ILLEGAL_VALUE) {
          // Illegal values should be ignored, but we could log them if
          // the user has enabled logging.
          cal.LOG("Warning: Invalid attachment parameter value " + key + "=" + value);
        } else {
          throw e;
        }
      }
    }

    if (this.mData) {
      icalatt.value = this.mData;
    }
    return icalatt;
  },

  set icalProperty(attProp) {
    // Reset the property bag for the parameters, it will be re-initialized
    // from the ical property.
    this.mProperties = new Map();
    this.setData(attProp.value);

    for (const [name, value] of cal.iterate.icalParameter(attProp)) {
      this.setParameter(name, value);
    }
  },

  get icalString() {
    const comp = this.icalProperty;
    return comp ? comp.icalString : "";
  },
  set icalString(val) {
    const prop = cal.icsService.createIcalPropertyFromString(val);
    if (prop.propertyName != "ATTACH") {
      throw Components.Exception("", Cr.NS_ERROR_ILLEGAL_VALUE);
    }
    this.icalProperty = prop;
  },

  getParameter(aName) {
    return this.mProperties.get(aName);
  },

  setParameter(aName, aValue) {
    if (aValue || aValue === 0) {
      return this.mProperties.set(aName, aValue);
    }
    return this.mProperties.delete(aName);
  },

  deleteParameter(aName) {
    this.mProperties.delete(aName);
  },

  clone() {
    const newAttachment = new CalAttachment();
    newAttachment.mData = this.mData;
    newAttachment.mHashId = this.mHashId;
    for (const [name, value] of this.mProperties.entries()) {
      newAttachment.mProperties.set(name, value);
    }
    return newAttachment;
  },

  setData(aData) {
    // Sets the data and invalidates the hash so it will be recalculated
    this.mHashId = null;
    this.mData = aData;
    return this.mData;
  },
};
