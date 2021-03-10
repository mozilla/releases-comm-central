/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["AddrBookCard"];

ChromeUtils.defineModuleGetter(
  this,
  "newUID",
  "resource:///modules/AddrBookUtils.jsm"
);

/**
 * Prototype for nsIAbCard objects that are not mailing lists.
 *
 * @implements {nsIAbCard}
 */
function AddrBookCard() {
  this._directoryUID = "";
  this._properties = new Map([
    ["PreferMailFormat", Ci.nsIAbPreferMailFormat.unknown],
    ["PopularityIndex", 0],
    ["LastModifiedDate", 0],
  ]);
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
      result = this.getProperty("Company", "");
    }
    if (result == "") {
      result = this.primaryEmail.split("@", 1)[0];
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
    if (value != this._uid) {
      throw Components.Exception("", Cr.NS_ERROR_FAILURE);
    }
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
    return "";
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
    if (this.getProperty("PrimaryEmail", "").toLowerCase() == emailAddress) {
      return true;
    }
    if (this.getProperty("SecondEmail", "").toLowerCase() == emailAddress) {
      return true;
    }
    return false;
  },
  translateTo(type) {
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
