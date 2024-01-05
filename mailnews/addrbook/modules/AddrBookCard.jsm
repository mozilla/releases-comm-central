/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["AddrBookCard"];

const { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);

const lazy = {};

XPCOMUtils.defineLazyModuleGetters(lazy, {
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
  ChromeUtils.defineLazyGetter(this, "_vCardProperties", () => {
    // Lazy creation of the VCardProperties object. Change the `_properties`
    // object as much as you like (e.g. loading in properties from a database)
    // before running this code. After it runs, the `_vCardProperties` object
    // takes over and anything in `_properties` which could be stored in the
    // vCard will be ignored!

    this._hasVCard = true;

    const vCard = this.getProperty("_vCard", "");
    try {
      if (vCard) {
        const vCardProperties = lazy.VCardProperties.fromVCard(vCard, {
          isGoogleCardDAV: this._isGoogleCardDAV,
        });
        // Custom1..4 properties could still exist as nsIAbCard properties.
        // Migrate them now.
        for (const key of ["Custom1", "Custom2", "Custom3", "Custom4"]) {
          const value = this.getProperty(key, "");
          if (
            value &&
            vCardProperties.getFirstEntry(`x-${key.toLowerCase()}`) === null
          ) {
            vCardProperties.addEntry(
              new lazy.VCardPropertyEntry(
                `x-${key.toLowerCase()}`,
                {},
                "text",
                value
              )
            );
          }
          this.deleteProperty(key);
        }
        return vCardProperties;
      }
      return lazy.VCardProperties.fromPropertyMap(this._properties);
    } catch (error) {
      console.error("Error creating vCard properties", error);
      // Return  an empty VCardProperties object if parsing failed
      // catastrophically.
      return new lazy.VCardProperties("4.0");
    }
  });
}

AddrBookCard.prototype = {
  QueryInterface: ChromeUtils.generateQI(["nsIAbCard"]),
  classID: Components.ID("{1143991d-31cd-4ea6-9c97-c587d990d724}"),

  /* nsIAbCard */

  generateName(generateFormat, bundle) {
    let result = "";
    switch (generateFormat) {
      case Ci.nsIAbCard.GENERATE_DISPLAY_NAME:
        result = this.displayName;
        break;

      case Ci.nsIAbCard.GENERATE_LAST_FIRST_ORDER:
        if (this.lastName) {
          const otherNames = [
            this.prefixName,
            this.firstName,
            this.middleName,
            this.suffixName,
          ]
            .filter(Boolean)
            .join(" ");
          if (!otherNames) {
            // Only use the lastName if we don't have anything to add after the
            // comma, in order to avoid for the string to finish with ", ".
            result = this.lastName;
          } else {
            result =
              bundle?.formatStringFromName("lastFirstFormat", [
                this.lastName,
                otherNames,
              ]) ?? `${this.lastName}, ${otherNames}`;
          }
        }
        break;

      default:
        const startNames = [this.prefixName, this.firstName, this.middleName]
          .filter(Boolean)
          .join(" ");
        const endNames = [this.lastName, this.suffixName]
          .filter(Boolean)
          .join(" ");
        result =
          bundle?.formatStringFromName("firstLastFormat", [
            startNames,
            endNames,
          ]) ?? `${startNames} ${endNames}`;
        break;
    }

    // Remove any leftover blank spaces.
    result = result.trim();

    if (result == "" || result == ",") {
      result =
        this.displayName ||
        [
          this.prefixName,
          this.firstName,
          this.middleName,
          this.lastName,
          this.suffixName,
        ]
          .filter(Boolean)
          .join(" ")
          .trim();

      if (!result) {
        // So far we don't have anything to show as a contact name.

        if (this.primaryEmail) {
          // Let's use the primary email localpart.
          result = this.primaryEmail.split("@", 1)[0];
        } else {
          // We don't have a primary email either, let's try with the
          // organization name.
          result = !this._hasVCard
            ? this.getProperty("Company", "")
            : this._vCardProperties.getFirstValue("org");
        }
      }
    }
    return result || "";
  },
  get directoryUID() {
    return this._directoryUID;
  },
  set directoryUID(value) {
    this._directoryUID = value;
  },
  get UID() {
    if (!this._uid) {
      this._uid = lazy.newUID();
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
    const props = [];
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
    if (!Array.isArray(name)) {
      return "";
    }
    name = name[1];
    if (Array.isArray(name)) {
      name = name.join(" ");
    }
    return name;
  },
  set firstName(value) {
    const n = this._vCardProperties.getFirstEntry("n");
    if (n) {
      n.value[1] = value;
    } else {
      this._vCardProperties.addEntry(
        new lazy.VCardPropertyEntry("n", {}, "text", ["", value, "", "", ""])
      );
    }
  },
  get lastName() {
    if (!this._hasVCard) {
      return this.getProperty("LastName", "");
    }
    let name = this._vCardProperties.getFirstValue("n");
    if (!Array.isArray(name)) {
      return "";
    }
    name = name[0];
    if (Array.isArray(name)) {
      name = name.join(" ");
    }
    return name;
  },
  set lastName(value) {
    const n = this._vCardProperties.getFirstEntry("n");
    if (n) {
      n.value[0] = value;
    } else {
      this._vCardProperties.addEntry(
        new lazy.VCardPropertyEntry("n", {}, "text", [value, "", "", "", ""])
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
    const fn = this._vCardProperties.getFirstEntry("fn");
    if (fn) {
      fn.value = value;
    } else {
      this._vCardProperties.addEntry(
        new lazy.VCardPropertyEntry("fn", {}, "text", value)
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
    const entries = this._vCardProperties.getAllEntriesSorted("email");
    if (entries.length && entries[0].value != value) {
      this._vCardProperties.removeEntry(entries[0]);
      entries.shift();
    }

    if (value) {
      const existing = entries.find(e => e.value == value);
      if (existing) {
        existing.params.pref = "1";
      } else {
        this._vCardProperties.addEntry(
          new lazy.VCardPropertyEntry("email", { pref: "1" }, "text", value)
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
  get photoURL() {
    const photoEntry = this.vCardProperties.getFirstEntry("photo");
    if (photoEntry?.value) {
      if (photoEntry.value?.startsWith("data:image/")) {
        // This is a version 4.0 card
        // OR a version 3.0 card with the URI type set (uncommon)
        // OR a version 3.0 card that is lying about its type.
        return photoEntry.value;
      }
      if (photoEntry.type == "binary" && photoEntry.value.startsWith("iVBO")) {
        // This is a version 3.0 card.
        // The first 3 bytes say this image is PNG.
        return `data:image/png;base64,${photoEntry.value}`;
      }
      if (photoEntry.type == "binary" && photoEntry.value.startsWith("/9j/")) {
        // This is a version 3.0 card.
        // The first 3 bytes say this image is JPEG.
        return `data:image/jpeg;base64,${photoEntry.value}`;
      }
      if (photoEntry.type == "uri" && /^https?:\/\//.test(photoEntry.value)) {
        // A remote URI.
        return photoEntry.value;
      }
    }

    const photoName = this.getProperty("PhotoName", "");
    if (photoName) {
      const file = Services.dirsvc.get("ProfD", Ci.nsIFile);
      file.append("Photos");
      file.append(photoName);
      return Services.io.newFileURI(file).spec;
    }

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
    const value = this.getProperty(name);
    if (!isNaN(parseInt(value, 10))) {
      return parseInt(value, 10);
    }
    if (!isNaN(parseInt(value, 16))) {
      return parseInt(value, 16);
    }
    throw Components.Exception(
      `${name}: ${value} - not an int`,
      Cr.NS_ERROR_NOT_AVAILABLE
    );
  },
  getPropertyAsBool(name, defaultValue) {
    const value = this.getProperty(name);
    switch (value) {
      case false:
      case 0:
      case "0":
        return false;
      case true:
      case 1:
      case "1":
        return true;
      case undefined:
        return defaultValue;
    }
    throw Components.Exception(
      `${name}: ${value} - not a boolean`,
      Cr.NS_ERROR_NOT_AVAILABLE
    );
  },
  setProperty(name, value) {
    if (lazy.BANISHED_PROPERTIES.includes(name)) {
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
    const cardCopy = Cc[
      "@mozilla.org/addressbook/cardproperty;1"
    ].createInstance(Ci.nsIAbCard);
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
    for (const name of [
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
