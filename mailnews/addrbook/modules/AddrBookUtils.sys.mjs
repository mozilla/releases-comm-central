/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import { AppConstants } from "resource://gre/modules/AppConstants.sys.mjs";

import { MailServices } from "resource:///modules/MailServices.sys.mjs";
import { MailStringUtils } from "resource:///modules/MailStringUtils.sys.mjs";
import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

const lazy = {};

XPCOMUtils.defineLazyServiceGetters(lazy, {
  attrMapService: [
    "@mozilla.org/addressbook/ldap-attribute-map-service;1",
    "nsIAbLDAPAttributeMapService",
  ],
});

export function newUID() {
  return Services.uuid.generateUUID().toString().substring(1, 37);
}

const abSortOrder = {
  [Ci.nsIAbManager.JS_DIRECTORY_TYPE]: 1,
  [Ci.nsIAbManager.CARDDAV_DIRECTORY_TYPE]: 2,
  [Ci.nsIAbManager.LDAP_DIRECTORY_TYPE]: 3,
  [Ci.nsIAbManager.ASYNC_DIRECTORY_TYPE]: 3,
  [Ci.nsIAbManager.MAPI_DIRECTORY_TYPE]: 4,
};
const abNameComparer = new Intl.Collator(undefined, { numeric: true });

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
export function compareAddressBooks(a, b) {
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
  const aPrefId = a.dirPrefId;
  const bPrefId = b.dirPrefId;

  if (aPrefId == "ldap_2.servers.pab" || bPrefId == "ldap_2.servers.history") {
    return -1;
  }
  if (bPrefId == "ldap_2.servers.pab" || aPrefId == "ldap_2.servers.history") {
    return 1;
  }

  // Order remaining directories by type.
  const aType = a.dirType;
  const bType = b.dirType;

  if (aType != bType) {
    return abSortOrder[aType] - abSortOrder[bType];
  }

  // Order directories of the same type by name, case-insensitively.
  return abNameComparer.compare(a.dirName, b.dirName);
}

export const exportAttributes = [
  ["FirstName", 2100],
  ["LastName", 2101],
  ["DisplayName", 2102],
  ["NickName", 2103],
  ["PrimaryEmail", 2104],
  ["SecondEmail", 2105],
  ["_AimScreenName", 2136],
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

export var AddrBookUtils = {
  compareAddressBooks,
  async exportDirectory(directory) {
    let systemCharset = "utf-8";
    if (AppConstants.platform == "win") {
      // Some Windows applications (notably Outlook) still don't understand
      // UTF-8 encoding when importing address books and instead use the current
      // operating system encoding. We can get that encoding from the registry.
      const registryKey = Cc[
        "@mozilla.org/windows-registry-key;1"
      ].createInstance(Ci.nsIWindowsRegKey);
      registryKey.open(
        Ci.nsIWindowsRegKey.ROOT_KEY_LOCAL_MACHINE,
        "SYSTEM\\CurrentControlSet\\Control\\Nls\\CodePage",
        Ci.nsIWindowsRegKey.ACCESS_READ
      );
      const acpValue = registryKey.readStringValue("ACP");

      // This data converts the registry key value into encodings that
      // nsIConverterOutputStream understands. It is from
      // https://github.com/hsivonen/encoding_rs/blob/c3eb642cdf3f17003b8dac95c8fff478568e46da/generate-encoding-data.py#L188
      systemCharset =
        {
          866: "IBM866",
          874: "windows-874",
          932: "Shift_JIS",
          936: "GBK",
          949: "EUC-KR",
          950: "Big5",
          1200: "UTF-16LE",
          1201: "UTF-16BE",
          1250: "windows-1250",
          1251: "windows-1251",
          1252: "windows-1252",
          1253: "windows-1253",
          1254: "windows-1254",
          1255: "windows-1255",
          1256: "windows-1256",
          1257: "windows-1257",
          1258: "windows-1258",
          10000: "macintosh",
          10017: "x-mac-cyrillic",
          20866: "KOI8-R",
          20932: "EUC-JP",
          21866: "KOI8-U",
          28592: "ISO-8859-2",
          28593: "ISO-8859-3",
          28594: "ISO-8859-4",
          28595: "ISO-8859-5",
          28596: "ISO-8859-6",
          28597: "ISO-8859-7",
          28598: "ISO-8859-8",
          28600: "ISO-8859-10",
          28603: "ISO-8859-13",
          28604: "ISO-8859-14",
          28605: "ISO-8859-15",
          28606: "ISO-8859-16",
          38598: "ISO-8859-8-I",
          50221: "ISO-2022-JP",
          54936: "gb18030",
        }[acpValue] || systemCharset;
    }

    const filePicker = Cc["@mozilla.org/filepicker;1"].createInstance(
      Ci.nsIFilePicker
    );
    const bundle = Services.strings.createBundle(
      "chrome://messenger/locale/addressbook/addressBook.properties"
    );

    const title = bundle.formatStringFromName("ExportAddressBookNameTitle", [
      directory.dirName,
    ]);
    filePicker.init(
      Services.ww.activeWindow.browsingContext,
      title,
      Ci.nsIFilePicker.modeSave
    );
    filePicker.defaultString = directory.dirName;

    let filterString;
    // Since the list of file picker filters isn't fixed, keep track of which
    // ones are added, so we can use them in the switch block below.
    const activeFilters = [];

    // CSV
    if (systemCharset != "utf-8") {
      filterString = bundle.GetStringFromName("CSVFilesSysCharset");
      filePicker.appendFilter(filterString, "*.csv");
      activeFilters.push("CSVFilesSysCharset");
    }
    filterString = bundle.GetStringFromName("CSVFilesUTF8");
    filePicker.appendFilter(filterString, "*.csv");
    activeFilters.push("CSVFilesUTF8");

    // Tab separated
    if (systemCharset != "utf-8") {
      filterString = bundle.GetStringFromName("TABFilesSysCharset");
      filePicker.appendFilter(filterString, "*.tab; *.txt");
      activeFilters.push("TABFilesSysCharset");
    }
    filterString = bundle.GetStringFromName("TABFilesUTF8");
    filePicker.appendFilter(filterString, "*.tab; *.txt");
    activeFilters.push("TABFilesUTF8");

    // vCard
    filterString = bundle.GetStringFromName("VCFFiles");
    filePicker.appendFilter(filterString, "*.vcf");
    activeFilters.push("VCFFiles");

    // LDIF
    filterString = bundle.GetStringFromName("LDIFFiles");
    filePicker.appendFilter(filterString, "*.ldi; *.ldif");
    activeFilters.push("LDIFFiles");

    const rv = await new Promise(resolve => filePicker.open(resolve));
    if (
      rv == Ci.nsIFilePicker.returnCancel ||
      !filePicker.file ||
      !filePicker.file.path
    ) {
      return;
    }

    if (rv == Ci.nsIFilePicker.returnReplace) {
      if (filePicker.file.isFile()) {
        filePicker.file.remove(false);
      }
    }

    const exportFile = filePicker.file.clone();
    const leafName = exportFile.leafName;
    let output = "";
    let charset = "utf-8";

    switch (activeFilters[filePicker.filterIndex]) {
      case "CSVFilesSysCharset":
        charset = systemCharset;
      // Falls through.
      case "CSVFilesUTF8":
        if (!leafName.endsWith(".csv")) {
          exportFile.leafName += ".csv";
        }
        output = AddrBookUtils.exportDirectoryToDelimitedText(directory, ",");
        break;
      case "TABFilesSysCharset":
        charset = systemCharset;
      // Falls through.
      case "TABFilesUTF8":
        if (!leafName.endsWith(".txt") && !leafName.endsWith(".tab")) {
          exportFile.leafName += ".txt";
        }
        output = AddrBookUtils.exportDirectoryToDelimitedText(directory, "\t");
        break;
      case "VCFFiles":
        if (!leafName.endsWith(".vcf")) {
          exportFile.leafName += ".vcf";
        }
        output = AddrBookUtils.exportDirectoryToVCard(directory);
        break;
      case "LDIFFiles":
        if (!leafName.endsWith(".ldi") && !leafName.endsWith(".ldif")) {
          exportFile.leafName += ".ldif";
        }
        output = AddrBookUtils.exportDirectoryToLDIF(directory);
        break;
    }

    if (charset == "utf-8") {
      await IOUtils.writeUTF8(exportFile.path, output);
    } else {
      // Main thread file IO!
      const outputFileStream = Cc[
        "@mozilla.org/network/file-output-stream;1"
      ].createInstance(Ci.nsIFileOutputStream);
      outputFileStream.init(exportFile, -1, -1, 0);
      const outputStream = Cc[
        "@mozilla.org/intl/converter-output-stream;1"
      ].createInstance(Ci.nsIConverterOutputStream);
      outputStream.init(outputFileStream, charset);
      outputStream.writeString(output);
      outputStream.close();
    }

    Services.obs.notifyObservers(
      exportFile,
      "addrbook-export-completed",
      directory.UID
    );
  },
  exportDirectoryToDelimitedText(directory, delimiter) {
    const bundle = Services.strings.createBundle(
      "chrome://messenger/locale/importMsgs.properties"
    );
    let output = "";
    for (let i = 0; i < exportAttributes.length; i++) {
      const [, plainTextStringID] = exportAttributes[i];
      if (plainTextStringID != 0) {
        if (i != 0) {
          output += delimiter;
        }
        output += bundle.GetStringFromID(plainTextStringID);
      }
    }
    output += LINEBREAK;
    for (const card of directory.childCards) {
      if (card.isMailList) {
        // .tab, .txt and .csv aren't able to export mailing lists.
        // Use LDIF for that.
        continue;
      }
      const propertyMap = card.supportsVCard
        ? card.vCardProperties.toPropertyMap()
        : null;
      for (let i = 0; i < exportAttributes.length; i++) {
        const [abPropertyName, plainTextStringID] = exportAttributes[i];
        if (plainTextStringID == 0) {
          continue;
        }
        if (i != 0) {
          output += delimiter;
        }
        let value;
        if (propertyMap) {
          value = propertyMap.get(abPropertyName);
        }
        if (!value) {
          value = card.getProperty(abPropertyName, "");
        }

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
  },
  exportDirectoryToLDIF(directory) {
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
        // Convert 16bit JavaScript string to a byteString, to make it work with
        // btoa().
        const byteString = MailStringUtils.stringToByteString(value);
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
    const attrMap = lazy.attrMapService.getMapForPrefBranch(
      "ldap_2.servers.default.attrmap"
    );

    for (const card of directory.childCards) {
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
        const listAsDirectory = MailServices.ab.getDirectory(card.mailListURI);
        for (const childCard of listAsDirectory.childCards) {
          appendDNForCard("member", childCard, attrMap);
        }
      } else {
        appendDNForCard("dn", card, attrMap);
        appendProperty("objectclass", "top");
        appendProperty("objectclass", "person");
        appendProperty("objectclass", "organizationalPerson");
        appendProperty("objectclass", "inetOrgPerson");
        appendProperty("objectclass", "mozillaAbPersonAlpha");

        const propertyMap = card.supportsVCard
          ? card.vCardProperties.toPropertyMap()
          : null;
        for (const [abPropertyName] of exportAttributes) {
          const attrName = attrMap.getFirstAttribute(abPropertyName);
          if (attrName) {
            let attrValue;
            if (propertyMap) {
              attrValue = propertyMap.get(abPropertyName);
            }
            if (!attrValue) {
              attrValue = card.getProperty(abPropertyName, "");
            }
            appendProperty(attrName, attrValue);
          }
        }
      }
      output += LINEBREAK;
    }

    return output;
  },
  exportDirectoryToVCard(directory) {
    let output = "";
    for (const card of directory.childCards) {
      if (!card.isMailList) {
        // We don't know how to export mailing lists to vcf.
        // Use LDIF for that.
        output += decodeURIComponent(card.translateTo("vcard"));
      }
    }
    return output;
  },
  newUID,
};
