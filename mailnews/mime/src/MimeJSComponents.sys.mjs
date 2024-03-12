/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { jsmime } from "resource:///modules/jsmime.sys.mjs";

import { MimeParser } from "resource:///modules/mimeParser.sys.mjs";

function HeaderHandler() {
  this.value = "";
  this.deliverData = function (str) {
    this.value += str;
  };
  this.deliverEOF = function () {};
}

function StringEnumerator(iterator) {
  this._iterator = iterator;
  this._next = undefined;
}
StringEnumerator.prototype = {
  QueryInterface: ChromeUtils.generateQI(["nsIUTF8StringEnumerator"]),
  [Symbol.iterator]() {
    return this._iterator;
  },
  _setNext() {
    if (this._next !== undefined) {
      return;
    }
    this._next = this._iterator.next();
  },
  hasMore() {
    this._setNext();
    return !this._next.done;
  },
  getNext() {
    this._setNext();
    const result = this._next;
    this._next = undefined;
    if (result.done) {
      throw Components.Exception("", Cr.NS_ERROR_UNEXPECTED);
    }
    return result.value;
  },
};

/**
 * If we get XPConnect-wrapped objects for msgIAddressObjects, we will have
 * properties defined for 'group' that throws off jsmime. This function converts
 * the addresses into the form that jsmime expects.
 */
function fixXpconnectAddresses(addrs) {
  return addrs.map(addr => {
    // This is ideally !addr.group, but that causes a JS strict warning, if
    // group is not in addr, since that's enabled in all chrome code now.
    if (!("group" in addr) || addr.group === undefined || addr.group === null) {
      return MimeAddressParser.prototype.makeMailboxObject(
        addr.name,
        addr.email
      );
    }
    return MimeAddressParser.prototype.makeGroupObject(
      addr.name,
      fixXpconnectAddresses(addr.group)
    );
  });
}

/**
 * This is a base handler for supporting msgIStructuredHeaders, since we have
 * two implementations that need the readable aspects of the interface.
 */
function MimeStructuredHeaders() {}
MimeStructuredHeaders.prototype = {
  getHeader(aHeaderName) {
    const name = aHeaderName.toLowerCase();
    return this._headers.get(name);
  },

  hasHeader(aHeaderName) {
    return this._headers.has(aHeaderName.toLowerCase());
  },

  getUnstructuredHeader(aHeaderName) {
    const result = this.getHeader(aHeaderName);
    if (result === undefined || typeof result == "string") {
      return result;
    }
    throw Components.Exception("", Cr.NS_ERROR_ILLEGAL_VALUE);
  },

  getAddressingHeader(aHeaderName, aPreserveGroups) {
    let addrs = this.getHeader(aHeaderName);
    if (addrs === undefined) {
      addrs = [];
    } else if (!Array.isArray(addrs)) {
      throw Components.Exception("", Cr.NS_ERROR_ILLEGAL_VALUE);
    }
    return fixArray(addrs, aPreserveGroups);
  },

  getRawHeader(aHeaderName) {
    const result = this.getHeader(aHeaderName);
    if (result === undefined) {
      return result;
    }

    let value = jsmime.headeremitter.emitStructuredHeader(
      aHeaderName,
      result,
      {}
    );
    // Strip off the header name and trailing whitespace before returning...
    value = value.substring(aHeaderName.length + 2).trim();
    // ... as well as embedded newlines.
    value = value.replace(/\r\n/g, "");
    return value;
  },

  get headerNames() {
    return new StringEnumerator(this._headers.keys());
  },

  buildMimeText(sanitizeDate) {
    if (this._headers.size == 0) {
      return "";
    }
    const handler = new HeaderHandler();
    const emitter = jsmime.headeremitter.makeStreamingEmitter(handler, {
      useASCII: true,
      sanitizeDate,
    });
    for (const [value, header] of this._headers) {
      emitter.addStructuredHeader(value, header);
    }
    emitter.finish();
    return handler.value;
  },
};

export function MimeHeaders() {}
MimeHeaders.prototype = {
  __proto__: MimeStructuredHeaders.prototype,
  classDescription: "Mime headers implementation",
  QueryInterface: ChromeUtils.generateQI([
    "nsIMimeHeaders",
    "msgIStructuredHeaders",
  ]),

  initialize(allHeaders) {
    this._headers = MimeParser.extractHeaders(allHeaders);
  },

  extractHeader(header, getAll) {
    if (!this._headers) {
      throw Components.Exception("", Cr.NS_ERROR_NOT_INITIALIZED);
    }
    // Canonicalized to lower-case form
    header = header.toLowerCase();
    if (!this._headers.has(header)) {
      return null;
    }
    var values = this._headers.getRawHeader(header);
    if (getAll) {
      return values.join(",\r\n\t");
    }
    return values[0];
  },

  get allHeaders() {
    return this._headers.rawHeaderText;
  },
};

export function MimeWritableStructuredHeaders() {
  this._headers = new Map();
}

MimeWritableStructuredHeaders.prototype = {
  __proto__: MimeStructuredHeaders.prototype,
  QueryInterface: ChromeUtils.generateQI([
    "msgIStructuredHeaders",
    "msgIWritableStructuredHeaders",
  ]),

  setHeader(aHeaderName, aValue) {
    this._headers.set(aHeaderName.toLowerCase(), aValue);
  },

  deleteHeader(aHeaderName) {
    this._headers.delete(aHeaderName.toLowerCase());
  },

  addAllHeaders(aHeaders) {
    for (const header of aHeaders.headerNames) {
      this.setHeader(header, aHeaders.getHeader(header));
    }
  },

  setUnstructuredHeader(aHeaderName, aValue) {
    this.setHeader(aHeaderName, aValue);
  },

  setAddressingHeader(aHeaderName, aAddresses) {
    this.setHeader(aHeaderName, fixXpconnectAddresses(aAddresses));
  },

  setRawHeader(aHeaderName, aValue) {
    try {
      this.setHeader(
        aHeaderName,
        jsmime.headerparser.parseStructuredHeader(aHeaderName, aValue)
      );
    } catch (e) {
      // This means we don't have a structured encoder. Just assume it's a raw
      // string value then.
      this.setHeader(aHeaderName, aValue.trim());
    }
  },
};

// These are prototypes for nsIMsgHeaderParser implementation
var Mailbox = {
  toString() {
    return this.name ? this.name + " <" + this.email + ">" : this.email;
  },
};

var EmailGroup = {
  toString() {
    return this.name + ": " + this.group.map(x => x.toString()).join(", ");
  },
};

// A helper method for parse*Header that takes into account the desire to
// preserve group and also tweaks the output to support the prototypes for the
// XPIDL output.
function fixArray(addresses, preserveGroups, count) {
  function resetPrototype(obj, prototype) {
    const prototyped = Object.create(prototype);
    for (const key of Object.getOwnPropertyNames(obj)) {
      if (typeof obj[key] == "string") {
        // eslint-disable-next-line no-control-regex
        prototyped[key] = obj[key].replace(/\x00/g, "");
      } else {
        prototyped[key] = obj[key];
      }
    }
    return prototyped;
  }
  let outputArray = [];
  for (let element of addresses) {
    if ("group" in element) {
      // Fix up the prototypes of the group and the list members
      element = resetPrototype(element, EmailGroup);
      element.group = element.group.map(e => resetPrototype(e, Mailbox));

      // Add to the output array
      if (preserveGroups) {
        outputArray.push(element);
      } else {
        outputArray = outputArray.concat(element.group);
      }
    } else {
      element = resetPrototype(element, Mailbox);
      outputArray.push(element);
    }
  }

  if (count) {
    count.value = outputArray.length;
  }
  return outputArray;
}

export function MimeAddressParser() {}
MimeAddressParser.prototype = {
  QueryInterface: ChromeUtils.generateQI(["nsIMsgHeaderParser"]),

  parseEncodedHeader(aHeader, aCharset, aPreserveGroups) {
    aHeader = aHeader || "";
    const value = MimeParser.parseHeaderField(
      aHeader,
      MimeParser.HEADER_ADDRESS | MimeParser.HEADER_OPTION_ALL_I18N,
      aCharset
    );
    return fixArray(value, aPreserveGroups);
  },
  parseEncodedHeaderW(aHeader) {
    aHeader = aHeader || "";
    const value = MimeParser.parseHeaderField(
      aHeader,
      MimeParser.HEADER_ADDRESS |
        MimeParser.HEADER_OPTION_DECODE_2231 |
        MimeParser.HEADER_OPTION_DECODE_2047,
      undefined
    );
    return fixArray(value, false);
  },
  parseDecodedHeader(aHeader, aPreserveGroups) {
    aHeader = aHeader || "";
    const value = MimeParser.parseHeaderField(
      aHeader,
      MimeParser.HEADER_ADDRESS
    );
    return fixArray(value, aPreserveGroups);
  },

  makeMimeHeader(addresses) {
    addresses = fixXpconnectAddresses(addresses);
    // Don't output any necessary continuations, so make line length as large as
    // possible first.
    const options = {
      softMargin: 900,
      hardMargin: 900,
      useASCII: false, // We don't want RFC 2047 encoding here.
    };
    const handler = new HeaderHandler();
    const emitter = new jsmime.headeremitter.makeStreamingEmitter(
      handler,
      options
    );
    emitter.addAddresses(addresses);
    emitter.finish(true);
    return handler.value.replace(/\r\n( |$)/g, "");
  },

  extractFirstName(aHeader) {
    const addresses = this.parseDecodedHeader(aHeader, false);
    return addresses.length > 0 ? addresses[0].name || addresses[0].email : "";
  },

  removeDuplicateAddresses(aAddrs, aOtherAddrs) {
    // This is actually a rather complicated algorithm, especially if we want to
    // preserve group structure. Basically, we use a set to identify which
    // headers we have seen and therefore want to remove. To work in several
    // various forms of edge cases, we need to normalize the entries in that
    // structure.
    function normalize(email) {
      // XXX: This algorithm doesn't work with IDN yet. It looks like we have to
      // convert from IDN then do lower case, but I haven't confirmed yet.
      return email.toLowerCase();
    }

    // The filtration function, which removes email addresses that are
    // duplicates of those we have already seen.
    function filterAccept(e) {
      if ("email" in e) {
        // If we've seen the address, don't keep this one; otherwise, add it to
        // the list.
        const key = normalize(e.email);
        if (allAddresses.has(key)) {
          return false;
        }
        allAddresses.add(key);
      } else {
        // Groups -> filter out all the member addresses.
        e.group = e.group.filter(filterAccept);
      }
      return true;
    }

    // First, collect all of the emails to forcibly delete.
    const allAddresses = new Set();
    for (const element of this.parseDecodedHeader(aOtherAddrs, false)) {
      allAddresses.add(normalize(element.email));
    }

    // The actual data to filter
    const filtered = this.parseDecodedHeader(aAddrs, true).filter(filterAccept);
    return this.makeMimeHeader(filtered);
  },

  makeMailboxObject(aName, aEmail) {
    const object = Object.create(Mailbox);
    object.name = aName;
    object.email = aEmail ? aEmail.trim() : aEmail;
    return object;
  },

  makeGroupObject(aName, aMembers) {
    const object = Object.create(EmailGroup);
    object.name = aName;
    object.group = aMembers;
    return object;
  },

  makeFromDisplayAddress(aDisplay) {
    if (aDisplay.includes(";") && !/:.*;/.test(aDisplay)) {
      // Using semicolons as mailbox separators in against the standard, but
      // used in the wild by some clients.
      // Looks like this isn't using group syntax, so let's assume it's a
      // non-standards compliant input string, and fix it.
      // Replace semicolons with commas, unless the semicolon is inside a quote.
      // The regexp uses tricky lookahead, see bug 1059988 comment #70 for details.
      aDisplay = aDisplay.replace(/;(?=(?:(?:[^"]*"){2})*[^"]*$)/g, ",");
    }

    // The basic idea is to split on every comma, so long as there is a
    // preceding @ or <> pair.
    const output = [];
    while (aDisplay.length > 0) {
      const lt = aDisplay.indexOf("<");
      const gt = aDisplay.indexOf(">");
      const at = aDisplay.indexOf("@");
      let start = 0;
      // An address doesn't always contain both <> and @, the goal is to find
      // the first comma after <> or @.
      if (lt != -1 && gt > lt) {
        start = gt;
      }
      if (at != -1) {
        start = Math.min(start, at);
      }
      let comma = aDisplay.indexOf(",", start);
      let addr;
      if (comma > 0) {
        addr = aDisplay.substr(0, comma);
        aDisplay = aDisplay.substr(comma + 1);

        // Make sure we don't have any "empty addresses" (multiple commas).
        comma = 0;
        while (/[,\s]/.test(aDisplay.charAt(comma))) {
          comma++;
        }
        aDisplay = aDisplay.substr(comma);
      } else {
        addr = aDisplay;
        aDisplay = "";
      }
      addr = addr.trimLeft();
      if (addr) {
        output.push(this._makeSingleAddress(addr));
      }
    }
    return output;
  },

  /**
   * Construct a single email address from an |name <local@domain>| token.
   *
   * @param {string} aInput - a string to be parsed to a mailbox object.
   * @returns {msgIAddressObject} the mailbox parsed from the input.
   */
  _makeSingleAddress(aInput) {
    // If the whole string is within quotes, unquote it first.
    aInput = aInput.trim().replace(/^"(.*)"$/, "$1");

    if (/<.*>/.test(aInput)) {
      // We don't want to look for the address within quotes, so first remove
      // all quoted strings containing angle chars.
      const cleanedInput = aInput.replace(/".*[<>]+.*"/g, "");

      // Extract the address from within the quotes.
      const addrMatch = cleanedInput.match(/<([^><]*)>/);

      const addr = addrMatch ? addrMatch[1] : "";
      const addrIdx = aInput.indexOf("<" + addr + ">");
      return this.makeMailboxObject(aInput.slice(0, addrIdx).trim(), addr);
    }
    return this.makeMailboxObject("", aInput);
  },

  extractHeaderAddressMailboxes(aLine) {
    return this.parseDecodedHeader(aLine)
      .map(addr => addr.email)
      .join(", ");
  },

  makeMimeAddress(aName, aEmail) {
    const object = this.makeMailboxObject(aName, aEmail);
    return this.makeMimeHeader([object]);
  },
};

export function MimeConverter() {}
MimeConverter.prototype = {
  QueryInterface: ChromeUtils.generateQI(["nsIMimeConverter"]),

  encodeMimePartIIStr_UTF8(aHeader, aStructured, aFieldNameLen, aLineLength) {
    // Compute the encoding options. The way our API is structured in this
    // method is really horrendous and does not align with the way that JSMime
    // handles it. Instead, we'll need to create a fake header to take into
    // account the aFieldNameLen parameter.
    const fakeHeader = "-".repeat(aFieldNameLen);
    const options = {
      softMargin: aLineLength,
      useASCII: true,
    };
    const handler = new HeaderHandler();
    const emitter = new jsmime.headeremitter.makeStreamingEmitter(
      handler,
      options
    );

    // Add the text to the be encoded.
    emitter.addHeaderName(fakeHeader);
    if (aStructured) {
      // Structured really means "this is an addressing header"
      const addresses = MimeParser.parseHeaderField(
        aHeader,
        MimeParser.HEADER_ADDRESS | MimeParser.HEADER_OPTION_DECODE_2047
      );
      // This happens in one of our tests if there is a "bare" email but no
      // @ sign. Without it, the result disappears since our emission code
      // assumes that an empty email is not worth emitting.
      if (
        addresses.length === 1 &&
        addresses[0].email === "" &&
        addresses[0].name !== ""
      ) {
        addresses[0].email = addresses[0].name;
        addresses[0].name = "";
      }
      emitter.addAddresses(addresses);
    } else {
      emitter.addUnstructured(aHeader);
    }

    // Compute the output. We need to strip off the fake prefix added earlier
    // and the extra CRLF at the end.
    emitter.finish(true);
    let value = handler.value;
    value = value.replace(new RegExp(fakeHeader + ":\\s*"), "");
    return value.substring(0, value.length - 2);
  },

  decodeMimeHeader(aHeader, aDefaultCharset, aOverride, aUnfold) {
    let value = MimeParser.parseHeaderField(
      aHeader,
      MimeParser.HEADER_UNSTRUCTURED | MimeParser.HEADER_OPTION_ALL_I18N,
      aDefaultCharset
    );
    if (aUnfold) {
      value = value.replace(/[\r\n]\t/g, " ").replace(/[\r\n]/g, "");
    }
    return value;
  },

  // This is identical to the above, except for factors that are handled by the
  // xpconnect conversion process
  decodeMimeHeaderToUTF8(...aArgs) {
    return this.decodeMimeHeader(...aArgs);
  },
};
