/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["VCardService", "VCardMimeConverter", "VCardUtils"];

const { ICAL } = ChromeUtils.import("resource:///modules/calendar/Ical.jsm");

/**
 * Utilities for working with vCard data. This file uses ICAL.js as parser and
 * formatter to avoid reinventing the wheel.
 * @see RFC 6350.
 */

var VCardUtils = {
  _decodeQuotedPrintable(value) {
    let bytes = [];
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
    let vPropMap = new Map();
    for (let index = 0; index < vProps.length; index++) {
      let [name, params, , value] = vProps[index];

      // Quoted-printable isn't allowed after vCard 2.1, but we'll let the
      // parser deal with things like line wrapping before we do the decoding.
      if (
        params.encoding &&
        params.encoding.toUpperCase() == "QUOTED-PRINTABLE"
      ) {
        if (Array.isArray(value)) {
          for (let i = 0; i < value.length; i++) {
            value[i] = this._decodeQuotedPrintable(value[i]);
          }
        } else {
          value = this._decodeQuotedPrintable(value);
        }
      }

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

      // Remove group prefixes since we have no way to handle them, and the
      // unprefixed property might be useful.
      name = name.replace(/^[a-z0-9-]+\./, "");

      // Special cases for address and telephone types.
      if (name == "adr") {
        name = type.includes("home") ? "adr.home" : "adr.work";
      }
      if (name == "tel") {
        name = "tel.work";
        for (let t of type) {
          if (["home", "work", "cell", "pager", "fax"].includes(t)) {
            name = `tel.${t}`;
            break;
          }
        }
      }

      if (!(name in typeMap)) {
        continue;
      }

      // The preference param is 1-100, lower numbers indicate higher
      // preference. If not specified, the value is least preferred.
      let pref = parseInt(params.pref, 10) || 101;

      if (!vPropMap.has(name)) {
        vPropMap.set(name, []);
      }
      vPropMap.get(name).push({ index, pref, value });
    }

    for (let props of vPropMap.values()) {
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
  vCardToAbCard(vCard) {
    // ICAL.js's parser only supports vCard 3.0 and 4.0. To maintain
    // interoperability with other applications, here we convert vCard 2.1
    // cards into a "good-enough" mimic of vCard 4.0 so that the parser will
    // read it without throwing an error.
    if (/\bVERSION:2.1\b/i.test(vCard)) {
      // Convert known type parameters to valid vCard 4.0, ignore unknown ones.
      vCard = vCard.replace(/\n(([A-Z]+)(;[\w-]*)+):/gi, (match, key) => {
        let parts = key.split(";");
        let newParts = [parts[0]];
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
      let quotedNewLineRegExp = /(;ENCODING=QUOTED-PRINTABLE[;:][^\r\n]*)=\r?\n/i;
      while (vCard.match(quotedNewLineRegExp)) {
        vCard = vCard.replace(quotedNewLineRegExp, "$1");
      }
    }

    let [, vProps] = ICAL.parse(vCard);
    let vPropMap = this._parse(vProps);

    let abCard = Cc["@mozilla.org/addressbook/cardproperty;1"].createInstance(
      Ci.nsIAbCard
    );
    for (let [name, , , value] of vProps) {
      if (name == "uid") {
        abCard.UID = value;
        break;
      }
    }
    for (let [name, props] of vPropMap) {
      // Store the value(s) on the abCard.
      for (let [abPropName, abPropValue] of typeMap[name].toAbCard(
        props[0].value
      )) {
        if (abPropValue) {
          abCard.setProperty(abPropName, abPropValue);
        }
      }

      // Special case for email, which can also have a second preference.
      if (name == "email" && props.length > 1) {
        abCard.setProperty("SecondEmail", props[1].value);
      }
    }
    return abCard;
  },
  modifyVCard(vCard, abCard) {
    let card = ICAL.parse(vCard);
    let [, vProps] = card;
    let vPropMap = this._parse(vProps);

    // Collect all of the AB card properties into a Map.
    let abProps = new Map();
    for (let abProp of abCard.properties) {
      if (abProp.value) {
        abProps.set(abProp.name, abProp.value);
      }
    }

    // Update the vCard.
    let indicesToRemove = [];
    for (let vPropName of Object.keys(typeMap)) {
      let existingVProps = vPropMap.get(vPropName) || [];
      let newVProps = [...typeMap[vPropName].fromAbCard(abProps)];

      if (newVProps.length == 0) {
        // Removed property, remove it.
        for (let existingVProp of existingVProps) {
          indicesToRemove.push(existingVProp.index);
        }
        continue;
      }

      for (let i = 0; i < newVProps.length; i++) {
        let newValue = newVProps[i][3];
        if (existingVProps[i]) {
          if (newValue === undefined) {
            // Empty property, remove it.
            indicesToRemove.push(existingVProps[i].index);
          } else {
            // Existing property, update it.
            vProps[existingVProps[i].index][3] = newVProps[i][3];
          }
        } else if (newValue !== undefined) {
          // New property, add it.
          vProps.push(newVProps[i]);
        }
      }

      // There may be more existing properties than new properties, because we
      // haven't stored them. Don't truncate!
    }

    // Remove the props we don't want, from end to start to avoid changing indices.
    indicesToRemove.sort();
    for (let i = indicesToRemove.length - 1; i >= 0; i--) {
      vProps.splice(indicesToRemove[i], 1);
    }

    // Always set the UID.
    let uidIndex = vProps.findIndex(prop => prop[0] == "uid");
    if (uidIndex == -1) {
      vProps.push(["uid", {}, "text", abCard.UID]);
    } else {
      vProps[uidIndex] = ["uid", {}, "text", abCard.UID];
    }

    return ICAL.stringify(card);
  },
  abCardToVCard(abCard, version = "4.0") {
    let vProps = [["version", {}, "text", version]];

    // Collect all of the AB card properties into a Map.
    let abProps = new Map();
    for (let abProp of abCard.properties) {
      if (abProp.value) {
        abProps.set(abProp.name, abProp.value);
      }
    }

    // Add the properties to the vCard.
    for (let vPropName of Object.keys(typeMap)) {
      for (let vProp of typeMap[vPropName].fromAbCard(abProps, vPropName)) {
        if (vProp[3] !== undefined) {
          vProps.push(vProp);
        }
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

  uri: null,
  convertToHTML(contentType, data) {
    function escapeHTML(template, ...parts) {
      let arr = [];
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

    let escapedVCard = encodeURIComponent(data);

    let propertiesTable = `<table class="moz-vcard-properties-table">`;
    propertiesTable += escapeHTML`<tr><td class="moz-vcard-title-property">${abCard.displayName}`;
    if (abCard.primaryEmail) {
      propertiesTable += escapeHTML`&nbsp;&lt;<a href="mailto:${abCard.primaryEmail}" private>${abCard.primaryEmail}</a>&gt;`;
    }
    propertiesTable += `</td></tr>`;
    for (let propName of ["JobTitle", "Department", "Company"]) {
      let propValue = abCard.getProperty(propName, "");
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
     * @param {String} value - vCard string to map to an address book card property.
     * @yields {String[]} - Any number of key, value pairs to set on the nsIAbCard.
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
      if (
        !map.has(`${abCardPrefix}Year`) ||
        !map.has(`${abCardPrefix}Month`) ||
        !map.has(`${abCardPrefix}Day`)
      ) {
        return;
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
      yield [vPropName, {}, "date", dateValue.toString()];
    },
    *toAbCard(value) {
      let dateValue = ICAL.VCardTime.fromDateAndOrTimeString(value);
      yield [`${abCardPrefix}Year`, String(dateValue.year)];
      yield [`${abCardPrefix}Month`, String(dateValue.month)];
      yield [`${abCardPrefix}Day`, String(dateValue.day)];
    },
  };
}
function multiTextProperty(abPropNames, vPropName, vPropParams = {}) {
  return {
    *fromAbCard(map) {
      if (abPropNames.every(name => !map.has(name))) {
        return;
      }
      yield [
        vPropName,
        { ...vPropParams },
        "text",
        abPropNames.map(name => map.get(name) || ""),
      ];
    },
    *toAbCard(value) {
      if (Array.isArray(value)) {
        for (let abPropName of abPropNames) {
          let valuePart = value.shift();
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
  email: {
    *fromAbCard(map) {
      yield ["email", { pref: "1" }, "text", map.get("PrimaryEmail")];
      yield ["email", {}, "text", map.get("SecondEmail")];
    },
    toAbCard: singleTextProperty("PrimaryEmail", "email", { pref: "1" })
      .toAbCard,
  },
  fn: singleTextProperty("DisplayName", "fn"),
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
  url: singleTextProperty("WebPage1", "url", {}, "url"),
  "x-mozilla-html": {
    *fromAbCard(map) {
      if (!map.has("PreferMailFormat")) {
        return;
      }
      switch (parseInt(map.get("PreferMailFormat"), 10)) {
        case Ci.nsIAbPreferMailFormat.html:
          yield ["x-mozilla-html", {}, "boolean", true];
          break;
        case Ci.nsIAbPreferMailFormat.plaintext:
          yield ["x-mozilla-html", {}, "boolean", false];
          break;
        default:
          console.warn(
            `Unexpected value for PreferMailFormat: ${map.get(
              "PreferMailFormat"
            )}`
          );
      }
    },
    *toAbCard(value) {
      if (typeof value != "boolean") {
        console.warn(`Unexpected value for x-mozilla-html: ${value}`);
        return;
      }
      yield [
        "PreferMailFormat",
        value
          ? Ci.nsIAbPreferMailFormat.html
          : Ci.nsIAbPreferMailFormat.plaintext,
      ];
    },
  },
};
