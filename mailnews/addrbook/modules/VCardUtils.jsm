/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = [
  "VCardService",
  "VCardMimeConverter",
  "VCardProperties",
  "VCardPropertyEntry",
  "VCardUtils",
  "BANISHED_PROPERTIES",
];

const { ICAL } = ChromeUtils.import("resource:///modules/calendar/Ical.jsm");

const { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);

const lazy = {};

XPCOMUtils.defineLazyModuleGetters(lazy, {
  AddrBookCard: "resource:///modules/AddrBookCard.jsm",
});

/**
 * Utilities for working with vCard data. This file uses ICAL.js as parser and
 * formatter to avoid reinventing the wheel.
 *
 * @see RFC 6350.
 */

var VCardUtils = {
  _decodeQuotedPrintable(value) {
    const bytes = [];
    for (let b = 0; b < value.length; b++) {
      if (value[b] == "=") {
        bytes.push(parseInt(value.substr(b + 1, 2), 16));
        b += 2;
      } else {
        bytes.push(value.charCodeAt(b));
      }
    }
    return new TextDecoder().decode(new Uint8Array(bytes));
  },
  _parse(vProps) {
    const vPropMap = new Map();
    for (let index = 0; index < vProps.length; index++) {
      let { name, params, value } = vProps[index];

      // Work out which type in typeMap, if any, this property belongs to.

      // To make the next piece easier, the type param must always be an array
      // of lower-case strings.
      let type = params.type || [];
      if (type) {
        if (Array.isArray(type)) {
          type = type.map(t => t.toLowerCase());
        } else {
          type = [type.toLowerCase()];
        }
      }

      // Special cases for address and telephone types.
      if (name == "adr") {
        name = type.includes("home") ? "adr.home" : "adr.work";
      }
      if (name == "tel") {
        name = "tel.work";
        for (const t of type) {
          if (["home", "work", "cell", "pager", "fax"].includes(t)) {
            name = `tel.${t}`;
            break;
          }
        }
      }
      // Preserve URL if no URL with type work is given take for `url.work` the URL without any type.
      if (name == "url") {
        name = type.includes("home") ? "url.home" : name;
        name = type.includes("work") ? "url.work" : name;
      }

      // Special treatment for `url`, which is not in the typeMap.
      if (!(name in typeMap) && name != "url") {
        continue;
      }

      // The preference param is 1-100, lower numbers indicate higher
      // preference. If not specified, the value is least preferred.
      const pref = parseInt(params.pref, 10) || 101;

      if (!vPropMap.has(name)) {
        vPropMap.set(name, []);
      }
      vPropMap.get(name).push({ index, pref, value });
    }

    // If no URL with type is specified assume its the Work Web Page (WebPage 1).
    if (vPropMap.has("url") && !vPropMap.has("url.work")) {
      vPropMap.set("url.work", vPropMap.get("url"));
    }
    // AbCard only supports Work Web Page or Home Web Page. Get rid of the URL without type.
    vPropMap.delete("url");

    for (const props of vPropMap.values()) {
      // Sort the properties by preference, or by the order they appeared.
      props.sort((a, b) => {
        if (a.pref == b.pref) {
          return a.index - b.index;
        }
        return a.pref - b.pref;
      });
    }
    return vPropMap;
  },
  /**
   * ICAL.js's parser only supports vCard 3.0 and 4.0. To maintain
   * interoperability with other applications, here we convert vCard 2.1
   * cards into a "good-enough" mimic of vCard 4.0 so that the parser will
   * read it without throwing an error.
   *
   * @param {string} vCard
   * @returns {string}
   */
  translateVCard21(vCard) {
    if (!/\bVERSION:2.1\b/i.test(vCard)) {
      return vCard;
    }

    // Convert known type parameters to valid vCard 4.0, ignore unknown ones.
    vCard = vCard.replace(/\n(([A-Z]+)(;[\w-]*)+):/gi, (match, key) => {
      const parts = key.split(";");
      const newParts = [parts[0]];
      for (let i = 1; i < parts.length; i++) {
        if (parts[i] == "") {
          continue;
        }
        if (
          ["HOME", "WORK", "FAX", "PAGER", "CELL"].includes(
            parts[i].toUpperCase()
          )
        ) {
          newParts.push(`TYPE=${parts[i]}`);
        } else if (parts[i].toUpperCase() == "PREF") {
          newParts.push("PREF=1");
        } else if (parts[i].toUpperCase() == "QUOTED-PRINTABLE") {
          newParts.push("ENCODING=QUOTED-PRINTABLE");
        }
      }
      return "\n" + newParts.join(";") + ":";
    });

    // Join quoted-printable wrapped lines together. This regular expression
    // only matches lines that are quoted-printable and end with `=`.
    const quotedNewLineRegExp =
      /(;ENCODING=QUOTED-PRINTABLE[;:][^\r\n]*)=\r?\n/i;
    while (vCard.match(quotedNewLineRegExp)) {
      vCard = vCard.replace(quotedNewLineRegExp, "$1");
    }

    // Strip the version.
    return vCard.replace(/(\r?\n)VERSION:2.1\r?\n/i, "$1");
  },
  /**
   * Return a new AddrBookCard from the provided vCard string.
   *
   * @param {string} vCard - The vCard string.
   * @param {string} [uid] - An optional UID to be used for the new card,
   *   overriding any UID specified in the vCard string.
   * @returns {AddrBookCard}
   */
  vCardToAbCard(vCard, uid) {
    vCard = this.translateVCard21(vCard);

    const abCard = new lazy.AddrBookCard();
    abCard.setProperty("_vCard", vCard);

    const vCardUID = abCard.vCardProperties.getFirstValue("uid");
    if (uid || vCardUID) {
      abCard.UID = uid || vCardUID;
      if (abCard.UID != vCardUID) {
        abCard.vCardProperties.clearValues("uid");
        abCard.vCardProperties.addValue("uid", abCard.UID);
      }
    }

    return abCard;
  },
  abCardToVCard(abCard, version) {
    if (abCard.supportsVCard && abCard.getProperty("_vCard")) {
      return abCard.vCardProperties.toVCard();
    }

    // Collect all of the AB card properties into a Map.
    const abProps = new Map(
      Array.from(abCard.properties, p => [p.name, p.value])
    );
    abProps.set("UID", abCard.UID);

    return this.propertyMapToVCard(abProps, version);
  },
  propertyMapToVCard(abProps, version = "4.0") {
    const vProps = [["version", {}, "text", version]];

    // Add the properties to the vCard.
    for (const vPropName of Object.keys(typeMap)) {
      for (const vProp of typeMap[vPropName].fromAbCard(abProps, vPropName)) {
        if (vProp[3] !== null && vProp[3] !== undefined && vProp[3] !== "") {
          vProps.push(vProp);
        }
      }
    }

    // If there's only one address or telephone number, don't specify type.
    const adrProps = vProps.filter(p => p[0] == "adr");
    if (adrProps.length == 1) {
      delete adrProps[0][1].type;
    }
    const telProps = vProps.filter(p => p[0] == "tel");
    if (telProps.length == 1) {
      delete telProps[0][1].type;
    }

    if (abProps.has("UID")) {
      vProps.push(["uid", {}, "text", abProps.get("UID")]);
    }
    return ICAL.stringify(["vcard", vProps]);
  },
};

function VCardService() {}
VCardService.prototype = {
  QueryInterface: ChromeUtils.generateQI(["nsIMsgVCardService"]),
  classID: Components.ID("{e2e0f615-bc5a-4441-a16b-a26e75949376}"),

  vCardToAbCard(vCard) {
    return vCard ? VCardUtils.vCardToAbCard(vCard) : null;
  },
  escapedVCardToAbCard(vCard) {
    return vCard ? VCardUtils.vCardToAbCard(decodeURIComponent(vCard)) : null;
  },
  abCardToEscapedVCard(abCard) {
    return abCard ? encodeURIComponent(VCardUtils.abCardToVCard(abCard)) : null;
  },
};

function VCardMimeConverter() {}
VCardMimeConverter.prototype = {
  QueryInterface: ChromeUtils.generateQI(["nsISimpleMimeConverter"]),
  classID: Components.ID("{dafab386-bd4c-4238-bb48-228fbc98ba29}"),

  mailChannel: null,
  uri: null,
  convertToHTML(contentType, data) {
    function escapeHTML(template, ...parts) {
      const arr = [];
      for (let i = 0; i < parts.length; i++) {
        arr.push(template[i]);
        arr.push(
          parts[i]
            .replace(/&/g, "&amp;")
            .replace(/"/g, "&quot;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
        );
      }
      arr.push(template[template.length - 1]);
      return arr.join("");
    }

    let abCard;
    try {
      abCard = VCardUtils.vCardToAbCard(data);
    } catch (e) {
      // We were given invalid vcard data.
      return "";
    }

    const escapedVCard = encodeURIComponent(data);

    let propertiesTable = `<table class="moz-vcard-properties-table">`;
    propertiesTable += escapeHTML`<tr><td class="moz-vcard-title-property">${abCard.displayName}`;
    if (abCard.primaryEmail) {
      propertiesTable += escapeHTML`&nbsp;&lt;<a href="mailto:${abCard.primaryEmail}" private>${abCard.primaryEmail}</a>&gt;`;
    }
    propertiesTable += `</td></tr>`;
    for (const propName of ["JobTitle", "Department", "Company"]) {
      const propValue = abCard.getProperty(propName, "");
      if (propValue) {
        propertiesTable += escapeHTML`<tr><td class="moz-vcard-property">${propValue}</td></tr>`;
      }
    }
    propertiesTable += `</table>`;

    // VCardChild.jsm and VCardParent.jsm handle clicking on this link.
    return `<html>
      <body>
        <table class="moz-vcard-table">
          <tr>
            <td valign="top"><a class="moz-vcard-badge" href="data:text/vcard,${escapedVCard}"></a></td>
            <td>
              ${propertiesTable}
            </td>
          </tr>
        </table>
      </body>
    </html>`;
  },
};

const BANISHED_PROPERTIES = [
  "UID",
  "PrimaryEmail",
  "SecondEmail",
  "DisplayName",
  "NickName",
  "Notes",
  "Company",
  "Department",
  "JobTitle",
  "BirthDay",
  "BirthMonth",
  "BirthYear",
  "AnniversaryDay",
  "AnniversaryMonth",
  "AnniversaryYear",
  "LastName",
  "FirstName",
  "AdditionalNames",
  "NamePrefix",
  "NameSuffix",
  "HomePOBox",
  "HomeAddress2",
  "HomeAddress",
  "HomeCity",
  "HomeState",
  "HomeZipCode",
  "HomeCountry",
  "WorkPOBox",
  "WorkAddress2",
  "WorkAddress",
  "WorkCity",
  "WorkState",
  "WorkZipCode",
  "WorkCountry",
  "HomePhone",
  "WorkPhone",
  "FaxNumber",
  "PagerNumber",
  "CellularNumber",
  "WebPage1",
  "WebPage2",
  "Custom1",
  "Custom2",
  "Custom3",
  "Custom4",
];

/** Helper functions for typeMap. */

function singleTextProperty(
  abPropName,
  vPropName,
  vPropParams = {},
  vPropType = "text"
) {
  return {
    /**
     * Formats nsIAbCard properties into an array for use by ICAL.js.
     *
     * @param {Map} map - A map of address book properties to map.
     * @yields {Array} - Values in a jCard array for use with ICAL.js.
     */
    *fromAbCard(map) {
      yield [vPropName, { ...vPropParams }, vPropType, map.get(abPropName)];
    },
    /**
     * Parses a vCard value into properties usable by nsIAbCard.
     *
     * @param {string} value - vCard string to map to an address book card property.
     * @yields {string[]} - Any number of key, value pairs to set on the nsIAbCard.
     */
    *toAbCard(value) {
      if (typeof value != "string") {
        console.warn(`Unexpected value for ${vPropName}: ${value}`);
        return;
      }
      yield [abPropName, value];
    },
  };
}
function dateProperty(abCardPrefix, vPropName) {
  return {
    *fromAbCard(map) {
      const year = map.get(`${abCardPrefix}Year`);
      const month = map.get(`${abCardPrefix}Month`);
      const day = map.get(`${abCardPrefix}Day`);

      if (!year && !month && !day) {
        return;
      }

      const dateValue = new ICAL.VCardTime({}, null, "date");
      // Set the properties directly instead of using the VCardTime
      // constructor argument, which causes null values to become 0.
      dateValue.year = year ? Number(year) : null;
      dateValue.month = month ? Number(month) : null;
      dateValue.day = day ? Number(day) : null;

      yield [vPropName, {}, "date", dateValue.toString()];
    },
    *toAbCard(value) {
      try {
        const dateValue = ICAL.VCardTime.fromDateAndOrTimeString(value);
        yield [`${abCardPrefix}Year`, String(dateValue.year ?? "")];
        yield [`${abCardPrefix}Month`, String(dateValue.month ?? "")];
        yield [`${abCardPrefix}Day`, String(dateValue.day ?? "")];
      } catch (ex) {
        console.error(ex);
      }
    },
  };
}
function multiTextProperty(abPropNames, vPropName, vPropParams = {}) {
  return {
    *fromAbCard(map) {
      if (abPropNames.every(name => !map.has(name))) {
        return;
      }
      const vPropValues = abPropNames.map(name => map.get(name) || "");
      if (vPropValues.some(Boolean)) {
        yield [vPropName, { ...vPropParams }, "text", vPropValues];
      }
    },
    *toAbCard(value) {
      if (Array.isArray(value)) {
        for (const abPropName of abPropNames) {
          const valuePart = value.shift();
          if (abPropName && valuePart) {
            yield [
              abPropName,
              Array.isArray(valuePart) ? valuePart.join(" ") : valuePart,
            ];
          }
        }
      } else if (typeof value == "string") {
        // Only one value was given.
        yield [abPropNames[0], value];
      } else {
        console.warn(`Unexpected value for ${vPropName}: ${value}`);
      }
    },
  };
}

/**
 * Properties we support for conversion between nsIAbCard and vCard.
 *
 * Keys correspond to vCard property keys, with the type appended where more
 * than one type is supported (e.g. work and home).
 *
 * Values are objects with toAbCard and fromAbCard functions which convert
 * property values in each direction. See the docs on the object returned by
 * singleTextProperty.
 */
var typeMap = {
  fn: singleTextProperty("DisplayName", "fn"),
  email: {
    *fromAbCard(map) {
      yield ["email", { pref: "1" }, "text", map.get("PrimaryEmail")];
      yield ["email", {}, "text", map.get("SecondEmail")];
    },
    toAbCard: singleTextProperty("PrimaryEmail", "email", { pref: "1" })
      .toAbCard,
  },
  nickname: singleTextProperty("NickName", "nickname"),
  note: singleTextProperty("Notes", "note"),
  org: multiTextProperty(["Company", "Department"], "org"),
  title: singleTextProperty("JobTitle", "title"),
  bday: dateProperty("Birth", "bday"),
  anniversary: dateProperty("Anniversary", "anniversary"),
  n: multiTextProperty(
    ["LastName", "FirstName", "AdditionalNames", "NamePrefix", "NameSuffix"],
    "n"
  ),
  "adr.home": multiTextProperty(
    [
      "HomePOBox",
      "HomeAddress2",
      "HomeAddress",
      "HomeCity",
      "HomeState",
      "HomeZipCode",
      "HomeCountry",
    ],
    "adr",
    { type: "home" }
  ),
  "adr.work": multiTextProperty(
    [
      "WorkPOBox",
      "WorkAddress2",
      "WorkAddress",
      "WorkCity",
      "WorkState",
      "WorkZipCode",
      "WorkCountry",
    ],
    "adr",
    { type: "work" }
  ),
  "tel.home": singleTextProperty("HomePhone", "tel", { type: "home" }),
  "tel.work": singleTextProperty("WorkPhone", "tel", { type: "work" }),
  "tel.fax": singleTextProperty("FaxNumber", "tel", { type: "fax" }),
  "tel.pager": singleTextProperty("PagerNumber", "tel", { type: "pager" }),
  "tel.cell": singleTextProperty("CellularNumber", "tel", { type: "cell" }),
  "url.work": singleTextProperty("WebPage1", "url", { type: "work" }, "url"),
  "url.home": singleTextProperty("WebPage2", "url", { type: "home" }, "url"),
  "x-custom1": singleTextProperty("Custom1", "x-custom1"),
  "x-custom2": singleTextProperty("Custom2", "x-custom2"),
  "x-custom3": singleTextProperty("Custom3", "x-custom3"),
  "x-custom4": singleTextProperty("Custom4", "x-custom4"),
};

/**
 * Any value that can be represented in a vCard. A value can be a boolean,
 * number, string, or an array, depending on the data. A top-level array might
 * contain primitives and/or second-level arrays of primitives.
 *
 * @see ICAL.design
 * @see RFC6350
 *
 * @typedef {boolean|number|string|vCardValue[]} vCardValue
 */

/**
 * Represents a single entry in a vCard ("contentline" in RFC6350 terms).
 * The name, params, type and value are as returned by ICAL.
 */
class VCardPropertyEntry {
  #name = null;
  #params = null;
  #type = null;
  #value = null;
  _original = null;

  /**
   * @param {string} name
   * @param {object} params
   * @param {string} type
   * @param {vCardValue} value
   */
  constructor(name, params, type, value) {
    this.#name = name;
    this.#params = params;
    this.#type = type;
    if (params.encoding?.toUpperCase() == "QUOTED-PRINTABLE") {
      if (Array.isArray(value)) {
        value = value.map(VCardUtils._decodeQuotedPrintable);
      } else {
        value = VCardUtils._decodeQuotedPrintable(value);
      }
      delete params.encoding;
      delete params.charset;
    }
    this.#value = value;
    this._original = this;
  }

  /**
   * @type {string}
   */
  get name() {
    return this.#name;
  }

  /**
   * @type {object}
   */
  get params() {
    return this.#params;
  }

  /**
   * @type {string}
   */
  get type() {
    return this.#type;
  }
  set type(type) {
    this.#type = type;
  }

  /**
   * @type {vCardValue}
   */
  get value() {
    return this.#value;
  }
  set value(value) {
    this.#value = value;
  }

  /**
   * Clone this object.
   *
   * @returns {VCardPropertyEntry}
   */
  clone() {
    let cloneValue;
    if (Array.isArray(this.#value)) {
      cloneValue = this.#value.map(v => (Array.isArray(v) ? v.slice() : v));
    } else {
      cloneValue = this.#value;
    }

    const clone = new VCardPropertyEntry(
      this.#name,
      { ...this.#params },
      this.#type,
      cloneValue
    );
    clone._original = this;
    return clone;
  }

  /**
   * @param {VCardPropertyEntry} other
   */
  equals(other) {
    if (other.constructor.name != "VCardPropertyEntry") {
      return false;
    }
    return this._original == other._original;
  }
}

/**
 * Represents an entire vCard as a collection of `VCardPropertyEntry` objects.
 */
class VCardProperties {
  /**
   * All of the vCard entries in this object.
   *
   * @type {VCardPropertyEntry[]}
   */
  entries = [];

  /**
   * @param {?string} version - The version of vCard to use. Valid values are
   *   "3.0" and "4.0". If unspecified, vCard 3.0 will be used.
   */
  constructor(version) {
    if (version) {
      if (!["3.0", "4.0"].includes(version)) {
        throw new Error(`Unsupported vCard version: ${version}`);
      }
      this.addEntry(new VCardPropertyEntry("version", {}, "text", version));
    }
  }

  /**
   * Parse a vCard into a VCardProperties object.
   *
   * @param {string} vCard
   * @returns {VCardProperties}
   */
  static fromVCard(vCard, { isGoogleCardDAV = false } = {}) {
    vCard = VCardUtils.translateVCard21(vCard);

    const rv = new VCardProperties();
    const [, properties] = ICAL.parse(vCard);
    for (const property of properties) {
      let [name, params, type, value] = property;
      if (property.length > 4) {
        // The jCal format stores multiple values as the 4th...nth items.
        // VCardPropertyEntry has only one place for a value, so store an
        // array instead. This applies to CATEGORIES and NICKNAME types in
        // vCard 4 and also NOTE in vCard 3.
        value = property.slice(3);
      }
      if (isGoogleCardDAV) {
        // Google escapes the characters \r : , ; and \ unnecessarily, in
        // violation of RFC6350. Removing the escaping at this point means no
        // other code requires a special case for it.
        if (Array.isArray(value)) {
          value = value.map(v => v.replace(/\\r/g, "\r").replace(/\\:/g, ":"));
        } else {
          value = value.replace(/\\r/g, "\r").replace(/\\:/g, ":");
          if (["phone-number", "uri"].includes(type)) {
            value = value.replace(/\\([,;\\])/g, "$1");
          }
        }
      }
      rv.addEntry(new VCardPropertyEntry(name, params, type, value));
    }
    return rv;
  }

  /**
   * Parse a Map of Address Book properties into a VCardProperties object.
   *
   * @param {Map<string, string>} propertyMap
   * @param {string} [version="4.0"]
   * @returns {VCardProperties}
   */
  static fromPropertyMap(propertyMap, version = "4.0") {
    const rv = new VCardProperties(version);

    for (const vPropName of Object.keys(typeMap)) {
      for (const vProp of typeMap[vPropName].fromAbCard(
        propertyMap,
        vPropName
      )) {
        if (vProp[3] !== null && vProp[3] !== undefined && vProp[3] !== "") {
          rv.addEntry(new VCardPropertyEntry(...vProp));
        }
      }
    }

    return rv;
  }

  /**
   * Used to determine the default value type when adding values.
   * Either `ICAL.design.vcard` for (vCard 4.0) or `ICAL.design.vcard3` (3.0).
   *
   * @type {ICAL.design.designSet}
   */
  designSet = ICAL.design.vcard3;

  /**
   * Add an entry to this object.
   *
   * @param {VCardPropertyEntry} entry - The entry to add.
   * @returns {boolean} - If the entry was added.
   */
  addEntry(entry) {
    if (entry.constructor.name != "VCardPropertyEntry") {
      throw new Error("Not a VCardPropertyEntry");
    }

    if (this.entries.find(e => e.equals(entry))) {
      return false;
    }

    if (entry.name == "version") {
      if (entry.value == "3.0") {
        this.designSet = ICAL.design.vcard3;
      } else if (entry.value == "4.0") {
        this.designSet = ICAL.design.vcard;
      } else {
        throw new Error(`Unsupported vCard version: ${entry.value}`);
      }
      // Version must be the first entry, so clear out any existing values
      // and add it to the start of the collection.
      this.clearValues("version");
      this.entries.unshift(entry);
      return true;
    }

    this.entries.push(entry);
    return true;
  }

  /**
   * Add an entry to this object by name and value.
   *
   * @param {string} name
   * @param {string} value
   * @returns {VCardPropertyEntry}
   */
  addValue(name, value) {
    for (const entry of this.getAllEntries(name)) {
      if (entry.value == value) {
        return entry;
      }
    }

    const newEntry = new VCardPropertyEntry(
      name,
      {},
      this.designSet.property[name].defaultType,
      value
    );
    this.entries.push(newEntry);
    return newEntry;
  }

  /**
   * Remove an entry from this object.
   *
   * @param {VCardPropertyEntry} entry - The entry to remove.
   * @returns {boolean} - If an entry was found and removed.
   */
  removeEntry(entry) {
    if (entry.constructor.name != "VCardPropertyEntry") {
      throw new Error("Not a VCardPropertyEntry");
    }

    const index = this.entries.findIndex(e => e.equals(entry));
    if (index >= 0) {
      this.entries.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Remove entries from this object by name and value. All entries matching
   * the name and value will be removed.
   *
   * @param {string} name
   * @param {string} value
   */
  removeValue(name, value) {
    for (const entry of this.getAllEntries(name)) {
      if (entry.value == value) {
        this.removeEntry(entry);
      }
    }
  }

  /**
   * Remove entries from this object by name. All entries matching the name
   * will be removed.
   *
   * @param {string} name
   */
  clearValues(name) {
    for (const entry of this.getAllEntries(name)) {
      this.removeEntry(entry);
    }
  }

  /**
   * Get the first value matching the given name, or null if no entry matches.
   *
   * @param {string} name
   * @returns {?vCardValue}
   */
  getFirstValue(name) {
    const entry = this.entries.find(e => e.name == name);
    if (entry) {
      return entry.value;
    }
    return null;
  }

  /**
   * Get all values matching the given name.
   *
   * @param {string} name
   * @returns {vCardValue[]}
   */
  getAllValues(name) {
    return this.getAllEntries(name).map(e => e.value);
  }

  /**
   * Get all values matching the given name, sorted in order of preference.
   * Preference is determined by the `pref` parameter if it exists, then by
   * the position in `entries`.
   *
   * @param {string} name
   * @returns {vCardValue[]}
   */
  getAllValuesSorted(name) {
    return this.getAllEntriesSorted(name).map(e => e.value);
  }

  /**
   * Get the first entry matching the given name, or null if no entry matches.
   *
   * @param {string} name
   * @returns {?VCardPropertyEntry}
   */
  getFirstEntry(name) {
    return this.entries.find(e => e.name == name) ?? null;
  }

  /**
   * Get all entries matching the given name.
   *
   * @param {string} name
   * @returns {VCardPropertyEntry[]}
   */
  getAllEntries(name) {
    return this.entries.filter(e => e.name == name);
  }

  /**
   * Get all entries matching the given name, sorted in order of preference.
   * Preference is determined by the `pref` parameter if it exists, then by
   * the position in `entries`.
   *
   * @param {string} name
   * @returns {VCardPropertyEntry[]}
   */
  getAllEntriesSorted(name) {
    let nextPref = 101;
    const entries = this.getAllEntries(name).map(e => {
      return { entry: e, pref: e.params.pref || nextPref++ };
    });
    entries.sort((a, b) => a.pref - b.pref);
    return entries.map(e => e.entry);
  }

  /**
   * Get all entries matching the given group.
   *
   * @param {string} group
   * @returns {VCardPropertyEntry[]}
   */
  getGroupedEntries(group) {
    return this.entries.filter(e => e.params.group == group);
  }

  /**
   * Clone this object.
   *
   * @returns {VCardProperties}
   */
  clone() {
    const copy = new VCardProperties();
    copy.entries = this.entries.map(e => e.clone());
    return copy;
  }

  /**
   * Get a Map of Address Book properties from this object.
   *
   * @returns {Map<string, string>} propertyMap
   */
  toPropertyMap() {
    const vPropMap = VCardUtils._parse(this.entries.map(e => e.clone()));
    const propertyMap = new Map();

    for (const [name, props] of vPropMap) {
      // Store the value(s) on the abCard.
      for (const [abPropName, abPropValue] of typeMap[name].toAbCard(
        props[0].value
      )) {
        if (abPropValue) {
          propertyMap.set(abPropName, abPropValue);
        }
      }
      // Special case for email, which can also have a second preference.
      if (name == "email" && props.length > 1) {
        propertyMap.set("SecondEmail", props[1].value);
      }
    }

    return propertyMap;
  }

  /**
   * Serialize this object into a vCard.
   *
   * @returns {string} vCard
   */
  toVCard() {
    const jCal = this.entries.map(e => {
      if (Array.isArray(e.value)) {
        const design = this.designSet.property[e.name];
        if (design.multiValue == "," && !design.structuredValue) {
          // The jCal format stores multiple values as the 4th...nth items,
          // but VCardPropertyEntry stores them as an array. This applies to
          // CATEGORIES and NICKNAME types in vCard 4 and also NOTE in vCard 3.
          return [e.name, e.params, e.type, ...e.value];
        }
      }
      return [e.name, e.params, e.type, e.value];
    });
    return ICAL.stringify(["vcard", jCal]);
  }
}
