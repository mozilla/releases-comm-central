/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

this.EXPORTED_SYMBOLS = ["AddrBookCard"];

ChromeUtils.defineModuleGetter(this, "MailServices", "resource:///modules/MailServices.jsm");
ChromeUtils.defineModuleGetter(this, "newUID", "resource:///modules/AddrBookUtils.jsm");

/**
 * Prototype for nsIAbCard objects that are not mailing lists.
 *
 * @implements {nsIAbItem}
 * @implements {nsIAbCard}
 */
function AddrBookCard() {
  this._directoryId = "";
  this._localId = "";
  this._properties = new Map();
}
AddrBookCard.prototype = {
  QueryInterface: ChromeUtils.generateQI([Ci.nsIAbCard]),
  classID: Components.ID("{1143991d-31cd-4ea6-9c97-c587d990d724}"),

  /* nsIAbItem */

  get uuid() {
    return MailServices.ab.generateUUID(this._directoryId, this._localId);
  },
  generateName(generateFormat, bundle) {
    let format;
    switch (generateFormat) {
      case Ci.nsIAbItem.GENERATE_DISPLAY_NAME:
        return this.displayName;
      case Ci.nsIAbItem.GENERATE_LAST_FIRST_ORDER:
        format = bundle ? bundle.GetStringFromName("lastFirstFormat") : "%S, %S";
        return format.replace("%S", this.lastName).replace("%S", this.firstName);
      case Ci.nsIAbItem.GENERATE_FIRST_LAST_ORDER:
        format = bundle ? bundle.GetStringFromName("firstLastFormat") : "%S %S";
        return format.replace("%S", this.firstName).replace("%S", this.lastName);
    }

    return "";
  },

  /* nsIAbCard */

  get directoryId() {
    return this._directoryId;
  },
  set directoryId(value) {
    return this._directoryId = value;
  },
  get localId() {
    return this._localId;
  },
  set localId(value) {
    return this._localId = value;
  },
  get UID() {
    if (!this._uid) {
      this._uid = newUID();
    }
    return this._uid;
  },
  set UID(value) {
    if (value != this._uid) {
      throw Cr.NS_ERROR_FAILURE;
    }
    return value;
  },
  get properties() {
    let entries = [...this._properties.entries()];
    let enumerator = {
      hasMoreElements() {
        return entries.length > 0;
      },
      getNext() {
        if (!this.hasMoreElements()) {
          throw Cr.NS_ERROR_NOT_AVAILABLE;
        }
        let [name, value] = entries.shift();
        return {
          get name() {
            return name;
          },
          get value() {
            return value;
          },
          QueryInterface: ChromeUtils.generateQI([Ci.nsIProperty]),
        };
      },
      * [Symbol.iterator]() {
        while (this.hasMoreElements()) {
          yield this.getNext();
        }
      },
      QueryInterface: ChromeUtils.generateQI([Ci.nsISimpleEnumerator]),
    };
    return enumerator;
  },
  get firstName() {
    return this.getProperty("FirstName", "");
  },
  set firstName(value) {
    this.setProperty("FirstName", value);
  },
  get lastName() {
    return this.getProperty("LastName", "");
  },
  set lastName(value) {
    this.setProperty("LastName", value);
  },
  get displayName() {
    return this.getProperty("DisplayName", "");
  },
  set displayName(value) {
    this.setProperty("DisplayName", value);
  },
  get primaryEmail() {
    return this.getProperty("PrimaryEmail", "");
  },
  set primaryEmail(value) {
    this.setProperty("PrimaryEmail", value);
  },
  get isMailList() {
    return false;
  },
  get mailListURI() {
    throw Cr.NS_ERROR_NOT_IMPLEMENTED;
  },

  getProperty(name, defaultValue) {
    if (this._properties.has(name)) {
      return this._properties.get(name);
    }
    return defaultValue;
  },
  getPropertyAsAString(name) {
    return this.getProperty(name);
  },
  getPropertyAsAUTF8String(name) {
    throw Cr.NS_ERROR_NOT_IMPLEMENTED;
  },
  getPropertyAsUint32(name) {
    throw Cr.NS_ERROR_NOT_IMPLEMENTED;
  },
  getPropertyAsBool(name) {
    throw Cr.NS_ERROR_NOT_IMPLEMENTED;
  },
  setProperty(name, value) {
    this._properties.set(name, value);
  },
  setPropertyAsAString(name, value) {
    throw Cr.NS_ERROR_NOT_IMPLEMENTED;
  },
  setPropertyAsAUTF8String(name, value) {
    throw Cr.NS_ERROR_NOT_IMPLEMENTED;
  },
  setPropertyAsUint32(name, value) {
    throw Cr.NS_ERROR_NOT_IMPLEMENTED;
  },
  setPropertyAsBool(name, value) {
    throw Cr.NS_ERROR_NOT_IMPLEMENTED;
  },
  deleteProperty(name) {
    this._properties.delete(name);
  },
  hasEmailAddress(emailAddress) {
    if (this._properties.get("PrimaryEmail") == emailAddress) {
      return true;
    }
    if (this._properties.get("SecondEmail") == emailAddress) {
      return true;
    }
    return false;
  },
  translateTo(type) {
    throw Cr.NS_ERROR_NOT_IMPLEMENTED;
  },
  generatePhoneticName(lastNameFirst) {
    if (lastNameFirst) {
      return `${this.lastName}, ${this.firstName}`;
    }
    return `${this.firstName} ${this.lastName}`;
  },
  generateChatName() {
    throw Cr.NS_ERROR_NOT_IMPLEMENTED;
  },
  copy(srcCard) {
    throw Cr.NS_ERROR_NOT_IMPLEMENTED;
  },
  equals(card) {
    return this.UID == card.UID;
  },
};
