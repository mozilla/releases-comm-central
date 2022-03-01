/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["AddrBookCard"];

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  BANISHED_PROPERTIES: "resource:///modules/VCardUtils.jsm",
  newUID: "resource:///modules/AddrBookUtils.jsm",
  VCardProperties: "resource:///modules/VCardUtils.jsm",
  VCardPropertyEntry: "resource:///modules/VCardUtils.jsm",
});

/**
 * Prototype for nsIAbCard objects that are not mailing lists.
 *
 * @implements {nsIAbCard}
 */
function AddrBookCard() {
  this._directoryUID = "";
  this._properties = new Map([
    ["PopularityIndex", 0],
    ["LastModifiedDate", 0],
  ]);

  this._hasVCard = false;
  XPCOMUtils.defineLazyGetter(this, "_vCardProperties", () => {
    // Lazy creation of the VCardProperties object. Change the `_properties`
    // object as much as you like (e.g. loading in properties from a database)
    // before running this code. After it runs, the `_vCardProperties` object
    // takes over and anything in `_properties` which could be stored in the
    // vCard will be ignored!

    this._hasVCard = true;

    let vCard = this.getProperty("_vCard", "");
    if (vCard) {
      return VCardProperties.fromVCard(vCard);
    }
    return VCardProperties.fromPropertyMap(this._properties);
  });
}

AddrBookCard.prototype = {
  QueryInterface: ChromeUtils.generateQI(["nsIAbCard"]),
  classID: Components.ID("{1143991d-31cd-4ea6-9c97-c587d990d724}"),

  /* nsIAbCard */

  generateName(generateFormat, bundle) {
    let result = "";
    let format;
    if (generateFormat == Ci.nsIAbCard.GENERATE_DISPLAY_NAME) {
      result = this.displayName;
    } else if (!this.lastName.length) {
      result = this.firstName;
    } else if (!this.firstName.length) {
      result = this.lastName;
    } else if (generateFormat == Ci.nsIAbCard.GENERATE_LAST_FIRST_ORDER) {
      format = bundle ? bundle.GetStringFromName("lastFirstFormat") : "%S, %S";
      result = format
        .replace("%S", this.lastName)
        .replace("%S", this.firstName);
    } else {
      format = bundle ? bundle.GetStringFromName("firstLastFormat") : "%S %S";
      result = format
        .replace("%S", this.firstName)
        .replace("%S", this.lastName);
    }

    if (result == "") {
      let org = this._vCardProperties.getFirstValue("org");
      if (org) {
        result = org[0];
      }
    }
    if (result == "") {
      let email = this.primaryEmail;
      if (email) {
        result = this.primaryEmail.split("@", 1)[0];
      }
    }

    return result;
  },
  get directoryUID() {
    return this._directoryUID;
  },
  set directoryUID(value) {
    this._directoryUID = value;
  },
  get UID() {
    if (!this._uid) {
      this._uid = newUID();
    }
    return this._uid;
  },
  set UID(value) {
    if (this._uid && value != this._uid) {
      throw Components.Exception(
        `Bad UID: got ${value} != ${this.uid}`,
        Cr.NS_ERROR_UNEXPECTED
      );
    }
    this._uid = value;
  },
  get properties() {
    let props = [];
    for (const [name, value] of this._properties) {
      props.push({
        get name() {
          return name;
        },
        get value() {
          return value;
        },
        QueryInterface: ChromeUtils.generateQI(["nsIProperty"]),
      });
    }
    return props;
  },
  get supportsVCard() {
    return true;
  },
  get vCardProperties() {
    return this._vCardProperties;
  },
  get firstName() {
    if (!this._hasVCard) {
      return this.getProperty("FirstName", "");
    }
    let name = this._vCardProperties.getFirstValue("n");
    return name ? name[1] : "";
  },
  set firstName(value) {
    let n = this._vCardProperties.getFirstEntry("n");
    if (n) {
      n.value[1] = value;
    } else {
      this._vCardProperties.addEntry(
        new VCardPropertyEntry("n", {}, "text", ["", value, "", "", ""])
      );
    }
  },
  get lastName() {
    if (!this._hasVCard) {
      return this.getProperty("LastName", "");
    }
    let name = this._vCardProperties.getFirstValue("n");
    return name ? name[0] : "";
  },
  set lastName(value) {
    let n = this._vCardProperties.getFirstEntry("n");
    if (n) {
      n.value[0] = value;
    } else {
      this._vCardProperties.addEntry(
        new VCardPropertyEntry("n", {}, "text", [value, "", "", "", ""])
      );
    }
  },
  get displayName() {
    if (!this._hasVCard) {
      return this.getProperty("DisplayName", "");
    }
    return this._vCardProperties.getFirstValue("fn") || "";
  },
  set displayName(value) {
    let fn = this._vCardProperties.getFirstEntry("fn");
    if (fn) {
      fn.value = value;
    } else {
      this._vCardProperties.addEntry(
        new VCardPropertyEntry("fn", {}, "text", value)
      );
    }
  },
  get primaryEmail() {
    if (!this._hasVCard) {
      return this.getProperty("PrimaryEmail", "");
    }
    return this._vCardProperties.getAllValuesSorted("email")[0] ?? "";
  },
  set primaryEmail(value) {
    let entries = this._vCardProperties.getAllEntriesSorted("email");
    if (entries.length && entries[0].value != value) {
      this._vCardProperties.removeEntry(entries[0]);
      entries.shift();
    }

    if (value) {
      let existing = entries.find(e => e.value == value);
      if (existing) {
        existing.params.pref = "1";
      } else {
        this._vCardProperties.addEntry(
          new VCardPropertyEntry("email", { pref: "1" }, "text", value)
        );
      }
    } else if (entries.length) {
      entries[0].params.pref = "1";
    }
  },
  get isMailList() {
    return false;
  },
  get mailListURI() {
    return "";
  },
  get emailAddresses() {
    return this._vCardProperties.getAllValuesSorted("email");
  },

  getProperty(name, defaultValue) {
    if (this._properties.has(name)) {
      return this._properties.get(name);
    }
    return defaultValue;
  },
  getPropertyAsAString(name) {
    if (!this._properties.has(name)) {
      return "";
    }
    return this.getProperty(name);
  },
  getPropertyAsAUTF8String(name) {
    if (!this._properties.has(name)) {
      throw Components.Exception(`${name} N/A`, Cr.NS_ERROR_NOT_AVAILABLE);
    }
    return this.getProperty(name);
  },
  getPropertyAsUint32(name) {
    let value = this.getProperty(name);
    if (isNaN(parseInt(value, 10))) {
      throw Components.Exception(
        `${name}: ${value} - not an int`,
        Cr.NS_ERROR_NOT_AVAILABLE
      );
    }
    return value;
  },
  getPropertyAsBool(name) {
    let value = this.getProperty(name);
    switch (value) {
      case false:
      case 0:
      case "0":
        return false;
      case true:
      case 1:
      case "1":
        return true;
    }
    throw Components.Exception(
      `${name}: ${value} - not a boolean`,
      Cr.NS_ERROR_NOT_AVAILABLE
    );
  },
  setProperty(name, value) {
    if (BANISHED_PROPERTIES.includes(name)) {
      throw new Components.Exception(
        `Unable to set ${name} as a property, use vCardProperties`,
        Cr.NS_ERROR_UNEXPECTED
      );
    }
    if ([null, undefined, ""].includes(value)) {
      this._properties.delete(name);
      return;
    }
    if (typeof value == "boolean") {
      value = value ? "1" : "0";
    }
    this._properties.set(name, "" + value);
  },
  setPropertyAsAString(name, value) {
    throw Components.Exception("", Cr.NS_ERROR_NOT_IMPLEMENTED);
  },
  setPropertyAsAUTF8String(name, value) {
    this.setProperty(name, value);
  },
  setPropertyAsUint32(name, value) {
    this.setProperty(name, value);
  },
  setPropertyAsBool(name, value) {
    this.setProperty(name, value ? "1" : "0");
  },
  deleteProperty(name) {
    this._properties.delete(name);
  },
  hasEmailAddress(emailAddress) {
    emailAddress = emailAddress.toLowerCase();
    return this.emailAddresses.some(e => e.toLowerCase() == emailAddress);
  },
  translateTo(type) {
    if (type == "vcard") {
      if (!this._vCardProperties.getFirstValue("uid")) {
        this._vCardProperties.addValue("uid", this.UID);
      }
      return encodeURIComponent(this._vCardProperties.toVCard());
    }
    // Get nsAbCardProperty to do the work, the code is in C++ anyway.
    let cardCopy = Cc["@mozilla.org/addressbook/cardproperty;1"].createInstance(
      Ci.nsIAbCard
    );
    cardCopy.UID = this.UID;
    cardCopy.copy(this);
    return cardCopy.translateTo(type);
  },
  generatePhoneticName(lastNameFirst) {
    if (lastNameFirst) {
      return (
        this.getProperty("PhoneticLastName", "") +
        this.getProperty("PhoneticFirstName", "")
      );
    }
    return (
      this.getProperty("PhoneticFirstName", "") +
      this.getProperty("PhoneticLastName", "")
    );
  },
  generateChatName() {
    for (let name of [
      "_GoogleTalk",
      "_AimScreenName",
      "_Yahoo",
      "_Skype",
      "_QQ",
      "_MSN",
      "_ICQ",
      "_JabberId",
      "_IRC",
    ]) {
      if (this._properties.has(name)) {
        return this._properties.get(name);
      }
    }
    return "";
  },
  copy(srcCard) {
    throw Components.Exception(
      "nsIAbCard.copy() not implemented",
      Cr.NS_ERROR_NOT_IMPLEMENTED
    );
  },
  equals(card) {
    return this.UID == card.UID;
  },
};
