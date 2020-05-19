/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["VCardUtils"];

const { ICAL } = ChromeUtils.import("resource:///modules/calendar/Ical.jsm");

/**
 * Utilities for working with vCard data. This file uses ICAL.js as parser and
 * formatter to avoid reinventing the wheel.
 * @see RFC 6350.
 */

var VCardUtils = {
  vCardToAbCard(vCard) {
    let [, properties] = ICAL.parse(vCard);
    let abCard = Cc["@mozilla.org/addressbook/cardproperty;1"].createInstance(
      Ci.nsIAbCard
    );

    for (let [name, params, , value] of properties) {
      if (name == "uid") {
        abCard.UID = value;
        continue;
      }
      if (["adr", "tel"].includes(name)) {
        if (
          params.type &&
          ["home", "work", "cell"].includes(params.type.toLowerCase())
        ) {
          name = `${name}.${params.type.toLowerCase()}`;
        } else {
          name = `${name}.work`;
        }
      }
      if (name in propertyMap) {
        for (let [abPropName, abPropValue] of Object.entries(
          propertyMap[name].toAbCard(value)
        )) {
          if (abPropValue) {
            abCard.setProperty(abPropName, abPropValue);
          }
        }
      }
    }
    return abCard;
  },
  modifyVCard(vCard, abCard) {
    let card = ICAL.parse(vCard);
    let [, vProps] = card;

    // Collect all of the AB card properties into a Map.
    let abProps = new Map();
    for (let abProp of abCard.properties) {
      if (abProp.value) {
        abProps.set(abProp.name, abProp.value);
      }
    }

    // Collect all of the existing vCard properties into a Map.
    let indices = new Map();
    for (let i = 0; i < vProps.length; i++) {
      let [vPropName, vPropParams] = vProps[i];
      if (vPropParams.type) {
        vPropName += `.${vPropParams.type}`;
      }
      indices.set(vPropName, i);
    }

    // Update the vCard.
    for (let vPropName of Object.keys(propertyMap)) {
      let vProp = propertyMap[vPropName].fromAbCard(abProps);

      let index = indices.get(vPropName);
      if (vProp) {
        // The vCard might have the property, but with no type specified.
        // If it does, use that.
        if (index === undefined && vPropName.includes(".")) {
          index = indices.get(vPropName.split(".")[0]);
          // Default to not specifying a type, where this applies.
          delete vProp[1].type;
        }

        if (index === undefined) {
          // New property, add it.
          vProps.push(vProp);
        } else {
          // Existing property, update it.
          vProps[index][3] = vProp[3];
        }
      } else if (index !== undefined) {
        // Removed property, remove it.
        vProps.splice(index, 1);
      }
    }

    // Always add a UID if there isn't one.
    if (vProps.findIndex(prop => prop[0] == "uid") == -1) {
      vProps.push(["uid", {}, "text", abCard.UID]);
    }

    return ICAL.stringify(card);
  },
  abCardToVCard(abCard) {
    let vProps = [["version", {}, "text", "4.0"]];

    // Collect all of the AB card properties into a Map.
    let abProps = new Map();
    for (let abProp of abCard.properties) {
      if (abProp.value) {
        abProps.set(abProp.name, abProp.value);
      }
    }

    // Add the properties to the vCard.
    for (let vPropName of Object.keys(propertyMap)) {
      let vProp = propertyMap[vPropName].fromAbCard(abProps, vPropName);
      if (vProp) {
        vProps.push(vProp);
      }
    }

    // If there's only one address or telephone number, don't specify type.
    let adrProps = vProps.filter(p => p[0] == "adr");
    if (adrProps.length == 1) {
      delete adrProps[0][1].type;
    }
    let telProps = vProps.filter(p => p[0] == "tel");
    if (telProps.length == 1) {
      delete telProps[0][1].type;
    }

    vProps.push(["uid", {}, "text", abCard.UID]);
    return ICAL.stringify(["vcard", vProps]);
  },
};


/** Helper functions for propertyMap. */

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
     * @return {?Array} - Values in a jCard array for use with ICAL.js.
     */
    fromAbCard(map) {
      if (map.has(abPropName)) {
        return [vPropName, { ...vPropParams }, vPropType, map.get(abPropName)];
      }
      return null;
    },
    /**
     * Parses a vCard value into properties usable by nsIAbCard.
     *
     * @param {string} value - vCard string to map to an address book card property.
     * @return {Object} - A dictionary of address book properties.
     */
    toAbCard(value) {
      if (typeof value != "string") {
        console.warn(`Unexpected value for ${vPropName}: ${value}`);
        return {};
      }
      return { [abPropName]: value };
    },
  };
}
function dateProperty(abCardPrefix, vPropName) {
  return {
    fromAbCard(map) {
      if (
        !map.has(`${abCardPrefix}Year`) ||
        !map.has(`${abCardPrefix}Month`) ||
        !map.has(`${abCardPrefix}Day`)
      ) {
        return null;
      }
      let dateValue = new ICAL.VCardTime(
        {
          year: Number(map.get(`${abCardPrefix}Year`)),
          month: Number(map.get(`${abCardPrefix}Month`)),
          day: Number(map.get(`${abCardPrefix}Day`)),
        },
        null,
        "date"
      );
      return [vPropName, {}, "date", dateValue.toString()];
    },
    toAbCard(value) {
      let dateValue = new Date(value);
      return {
        [`${abCardPrefix}Year`]: String(dateValue.getFullYear()),
        [`${abCardPrefix}Month`]: String(dateValue.getMonth() + 1),
        [`${abCardPrefix}Day`]: String(dateValue.getDate()),
      };
    },
  };
}
function multiTextProperty(abPropNames, vPropName, vPropParams = {}) {
  return {
    fromAbCard(map) {
      if (abPropNames.every(name => !map.has(name))) {
        return null;
      }
      return [
        vPropName,
        { ...vPropParams },
        "text",
        abPropNames.map(name => map.get(name) || ""),
      ];
    },
    toAbCard(value) {
      let result = {};
      if (!Array.isArray(value)) {
        console.warn(`Unexpected value for ${vPropName}: ${value}`);
        return result;
      }
      for (let abPropName of abPropNames) {
        let valuePart = value.shift();
        if (abPropName && valuePart) {
          result[abPropName] = valuePart;
        }
      }
      return result;
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
var propertyMap = {
  email: singleTextProperty("PrimaryEmail", "email"),
  fn: singleTextProperty("DisplayName", "fn"),
  nickname: singleTextProperty("NickName", "nickname"),
  note: singleTextProperty("Notes", "note"),
  org: multiTextProperty(["Company", "Department"], "org"),
  title: singleTextProperty("JobTitle", "title"),
  bday: dateProperty("Birth", "bday"),
  anniversary: dateProperty("Anniversary", "anniversary"),
  n: multiTextProperty(["LastName", "FirstName", null, null, null], "n"),
  "adr.home": multiTextProperty(
    [
      null,
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
      null,
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
  url: singleTextProperty("WebPage1", "url", {}, "url"),
  "x-mozilla-html": {
    fromAbCard(map) {
      switch (map.get("PreferMailFormat")) {
        case Ci.nsIAbPreferMailFormat.html:
          return ["x-mozilla-html", {}, "boolean", true];
        case Ci.nsIAbPreferMailFormat.plaintext:
          return ["x-mozilla-html", {}, "boolean", false];
      }
      return null;
    },
    toAbCard(value) {
      if (typeof value != "boolean") {
        console.warn(`Unexpected value for x-mozilla-html: ${value}`);
        return {};
      }
      return { PreferMailFormat: value };
    },
  },
};
