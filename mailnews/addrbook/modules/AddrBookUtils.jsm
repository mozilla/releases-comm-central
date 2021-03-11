/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = [
  "compareAddressBooks",
  "exportDirectoryToDelimitedText",
  "exportDirectoryToLDIF",
  "exportDirectoryToVCard",
  "newUID",
  "SimpleEnumerator",
];

const { AppConstants } = ChromeUtils.import(
  "resource://gre/modules/AppConstants.jsm"
);
const { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
const { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyServiceGetters(this, {
  attrMapService: [
    "@mozilla.org/addressbook/ldap-attribute-map-service;1",
    "nsIAbLDAPAttributeMapService",
  ],
  uuidGenerator: ["@mozilla.org/uuid-generator;1", "nsIUUIDGenerator"],
});

function SimpleEnumerator(elements) {
  this._elements = elements;
  this._position = 0;
}
SimpleEnumerator.prototype = {
  hasMoreElements() {
    return this._position < this._elements.length;
  },
  getNext() {
    if (this.hasMoreElements()) {
      return this._elements[this._position++];
    }
    throw Components.Exception("", Cr.NS_ERROR_NOT_AVAILABLE);
  },
  QueryInterface: ChromeUtils.generateQI(["nsISimpleEnumerator"]),
  *[Symbol.iterator]() {
    while (this.hasMoreElements()) {
      yield this.getNext();
    }
  },
};

function newUID() {
  return uuidGenerator
    .generateUUID()
    .toString()
    .substring(1, 37);
}

let abSortOrder = {
  [Ci.nsIAbManager.JS_DIRECTORY_TYPE]: 1,
  [Ci.nsIAbManager.CARDDAV_DIRECTORY_TYPE]: 2,
  [Ci.nsIAbManager.LDAP_DIRECTORY_TYPE]: 3,
  [Ci.nsIAbManager.ASYNC_DIRECTORY_TYPE]: 3,
  [Ci.nsIAbManager.MAPI_DIRECTORY_TYPE]: 4,
};
let abNameComparer = new Intl.Collator(undefined, { numeric: true });

/**
 * Comparator for address books. Any UI that lists address books should use
 * this order, although generally speaking, using nsIAbManager.directories is
 * all that is required to get the order.
 *
 * Note that directories should not be compared with mailing lists in this way,
 * however two mailing lists with the same parent can be safely compared.
 *
 * @param {nsIAbDirectory} a
 * @param {nsIAbDirectory} b
 * @returns {integer}
 */
function compareAddressBooks(a, b) {
  if (a.isMailList != b.isMailList) {
    throw Components.Exception(
      "Tried to compare a mailing list with a directory",
      Cr.NS_ERROR_UNEXPECTED
    );
  }

  // Only compare the names of mailing lists.
  if (a.isMailList) {
    return abNameComparer.compare(a.dirName, b.dirName);
  }

  // The Personal Address Book is first and Collected Addresses last.
  let aPrefId = a.dirPrefId;
  let bPrefId = b.dirPrefId;

  if (aPrefId == "ldap_2.servers.pab" || bPrefId == "ldap_2.servers.history") {
    return -1;
  }
  if (bPrefId == "ldap_2.servers.pab" || aPrefId == "ldap_2.servers.history") {
    return 1;
  }

  // Order remaining directories by type.
  let aType = a.dirType;
  let bType = b.dirType;

  if (aType != bType) {
    return abSortOrder[aType] - abSortOrder[bType];
  }

  // Order directories of the same type by name, case-insensitively.
  return abNameComparer.compare(a.dirName, b.dirName);
}

const exportAttributes = [
  ["FirstName", 2100],
  ["LastName", 2101],
  ["DisplayName", 2102],
  ["NickName", 2103],
  ["PrimaryEmail", 2104],
  ["SecondEmail", 2105],
  ["_AimScreenName", 2136],
  ["PreferMailFormat", 0],
  ["LastModifiedDate", 0],
  ["WorkPhone", 2106],
  ["WorkPhoneType", 0],
  ["HomePhone", 2107],
  ["HomePhoneType", 0],
  ["FaxNumber", 2108],
  ["FaxNumberType", 0],
  ["PagerNumber", 2109],
  ["PagerNumberType", 0],
  ["CellularNumber", 2110],
  ["CellularNumberType", 0],
  ["HomeAddress", 2111],
  ["HomeAddress2", 2112],
  ["HomeCity", 2113],
  ["HomeState", 2114],
  ["HomeZipCode", 2115],
  ["HomeCountry", 2116],
  ["WorkAddress", 2117],
  ["WorkAddress2", 2118],
  ["WorkCity", 2119],
  ["WorkState", 2120],
  ["WorkZipCode", 2121],
  ["WorkCountry", 2122],
  ["JobTitle", 2123],
  ["Department", 2124],
  ["Company", 2125],
  ["WebPage1", 2126],
  ["WebPage2", 2127],
  ["BirthYear", 2128],
  ["BirthMonth", 2129],
  ["BirthDay", 2130],
  ["Custom1", 2131],
  ["Custom2", 2132],
  ["Custom3", 2133],
  ["Custom4", 2134],
  ["Notes", 2135],
  ["AnniversaryYear", 0],
  ["AnniversaryMonth", 0],
  ["AnniversaryDay", 0],
  ["SpouseName", 0],
  ["FamilyName", 0],
];
const LINEBREAK = AppConstants.platform == "win" ? "\r\n" : "\n";

function exportDirectoryToDelimitedText(directory, delimiter) {
  let bundle = Services.strings.createBundle(
    "chrome://messenger/locale/importMsgs.properties"
  );
  let output = "";
  for (let i = 0; i < exportAttributes.length; i++) {
    let [, plainTextStringID] = exportAttributes[i];
    if (plainTextStringID != 0) {
      if (i != 0) {
        output += delimiter;
      }
      output += bundle.GetStringFromID(plainTextStringID);
    }
  }
  output += LINEBREAK;
  for (let card of directory.childCards) {
    if (card.isMailList) {
      // .tab, .txt and .csv aren't able to export mailing lists.
      // Use LDIF for that.
      continue;
    }
    for (let i = 0; i < exportAttributes.length; i++) {
      let [abPropertyName, plainTextStringID] = exportAttributes[i];
      if (plainTextStringID == 0) {
        continue;
      }
      if (i != 0) {
        output += delimiter;
      }
      let value = card.getProperty(abPropertyName, "");

      // If a string contains at least one comma, tab, double quote or line
      // break then we need to quote the entire string. Also if double quote
      // is part of the string we need to quote the double quote(s) as well.
      let needsQuotes = false;
      if (value.includes('"')) {
        needsQuotes = true;
        value = value.replace(/"/g, '""');
      } else if (/[,\t\r\n]/.test(value)) {
        needsQuotes = true;
      }
      if (needsQuotes) {
        value = `"${value}"`;
      }

      output += value;
    }
    output += LINEBREAK;
  }

  return output;
}

function exportDirectoryToLDIF(directory) {
  function appendProperty(name, value) {
    if (!value) {
      return;
    }
    // Follow RFC 2849 to determine if something is safe "as is" for LDIF.
    // If not, base 64 encode it as UTF-8.
    if (
      value[0] == " " ||
      value[0] == ":" ||
      value[0] == "<" ||
      /[\0\r\n\u0080-\uffff]/.test(value)
    ) {
      let utf8Bytes = new TextEncoder().encode(value);
      let byteString = String.fromCharCode(...utf8Bytes);
      output += name + ":: " + btoa(byteString) + LINEBREAK;
    } else {
      output += name + ": " + value + LINEBREAK;
    }
  }

  function appendDNForCard(property, card, attrMap) {
    let value = "";
    if (card.displayName) {
      value +=
        attrMap.getFirstAttribute("DisplayName") + "=" + card.displayName;
    }
    if (card.primaryEmail) {
      if (card.displayName) {
        value += ",";
      }
      value +=
        attrMap.getFirstAttribute("PrimaryEmail") + "=" + card.primaryEmail;
    }
    appendProperty(property, value);
  }

  let output = "";
  let attrMap = attrMapService.getMapForPrefBranch(
    "ldap_2.servers.default.attrmap"
  );

  for (let card of directory.childCards) {
    if (card.isMailList) {
      appendDNForCard("dn", card, attrMap);
      appendProperty("objectclass", "top");
      appendProperty("objectclass", "groupOfNames");
      appendProperty(
        attrMap.getFirstAttribute("DisplayName"),
        card.displayName
      );
      if (card.getProperty("NickName", "")) {
        appendProperty(
          attrMap.getFirstAttribute("NickName"),
          card.getProperty("NickName", "")
        );
      }
      if (card.getProperty("Notes", "")) {
        appendProperty(
          attrMap.getFirstAttribute("Notes"),
          card.getProperty("Notes", "")
        );
      }
      let listAsDirectory = MailServices.ab.getDirectory(card.mailListURI);
      for (let childCard of listAsDirectory.childCards) {
        appendDNForCard("member", childCard, attrMap);
      }
    } else {
      appendDNForCard("dn", card, attrMap);
      appendProperty("objectclass", "top");
      appendProperty("objectclass", "person");
      appendProperty("objectclass", "organizationalPerson");
      appendProperty("objectclass", "inetOrgPerson");
      appendProperty("objectclass", "mozillaAbPersonAlpha");

      for (let i = 0; i < exportAttributes.length; i++) {
        let [abPropertyName] = exportAttributes[i];
        let attrName = attrMap.getFirstAttribute(abPropertyName);
        if (attrName) {
          let attrValue = card.getProperty(abPropertyName, "");
          if (abPropertyName == "PreferMailFormat") {
            if (attrValue == "html") {
              attrValue = "true";
            } else if (attrValue == "plaintext") {
              attrValue = "false";
            }
            // unknown.
            else {
              attrValue = "";
            }
          }

          appendProperty(attrName, attrValue);
        }
      }
    }
    output += LINEBREAK;
  }

  return output;
}

function exportDirectoryToVCard(directory) {
  let output = "";
  for (let card of directory.childCards) {
    if (!card.isMailList) {
      // We don't know how to export mailing lists to vcf.
      // Use LDIF for that.
      output += decodeURIComponent(card.translateTo("vcard"));
    }
  }
  return output;
}
