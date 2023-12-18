/* vim:set ts=2 sw=2 sts=2 et: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { MailStringUtils } = ChromeUtils.import(
  "resource:///modules/MailStringUtils.jsm"
);

/**
 * This file provides fake LDAP server functionality, just enough to run
 * our unit tests against.
 *
 * Currently:
 * - it accepts any bind request (no authentication).
 * - it supports searches, but only some types of filter.
 * - it supports unbind (quit) requests.
 * - all other requests are ignored.
 *
 * It should be extensible enough that extra features can be added as
 * required.
 */

/*
 * Helpers for application-neutral BER-encoding/decoding.
 *
 * BER is self-describing enough to allow us to parse it without knowing
 * the meaning. So we can break down a binary stream into ints, strings,
 * sequences etc... and then leave it up to the separate LDAP code to
 * interpret the meaning of it.
 *
 * Clearest BER reference I've read:
 * https://docs.oracle.com/cd/E19476-01/821-0510/def-basic-encoding-rules.html
 */

/**
 * Encodes a BER length, returning an array of (wire-format) bytes.
 * It's variable length encoding - smaller numbers are encoded with
 * fewer bytes.
 *
 * @param {number} i - The length to encode.
 */
function encodeLength(i) {
  if (i < 128) {
    return [i];
  }

  let temp = i;
  const bytes = [];

  while (temp >= 128) {
    bytes.unshift(temp & 255);
    temp >>= 8;
  }
  bytes.unshift(temp);
  bytes.unshift(0x80 | bytes.length);
  return bytes;
}

/**
 * Helper for encoding and decoding BER values.
 * Each value is notionally a type-length-data triplet, although we just
 * store type and an array for data (with the array knowing it's length).
 * BERValue.data is held in raw form (wire format) for non-sequence values.
 * For sequences and sets (constructed values), .data is empty, and
 * instead .children is used to hold the contained BERValue objects.
 */
class BERValue {
  constructor(type) {
    this.type = type;
    this.children = []; // only for constructed values (sequences)
    this.data = []; // the raw data (empty for constructed ones)
  }

  /**
   * Encode the BERValue to an array of bytes, ready to be written to the wire.
   *
   * @returns {Array.<number>} - The encoded bytes.
   */
  encode() {
    let bytes = [];
    if (this.isConstructed()) {
      for (const c of this.children) {
        bytes = bytes.concat(c.encode());
      }
    } else {
      bytes = this.data;
    }
    return [this.type].concat(encodeLength(bytes.length), bytes);
  }

  // Functions to check class (upper two bits of type).
  isUniversal() {
    return (this.type & 0xc0) == 0x00;
  }
  isApplication() {
    return (this.type & 0xc0) == 0x40;
  }
  isContextSpecific() {
    return (this.type & 0xc0) == 0x80;
  }
  isPrivate() {
    return (this.type & 0xc0) == 0xc0;
  }

  /*
   * @return {boolean} - Is this value a constructed type a sequence or set?
   *                     (As encoded in bit 5 of the type)
   */
  isConstructed() {
    return !!(this.type & 0x20);
  }

  /**
   * @returns {number} - The tag number of the type (the lower 5 bits).
   */
  tag() {
    return this.type & 0x1f;
  }

  // Functions to check for some of the core universal types.
  isNull() {
    return this.type == 0x05;
  }
  isBoolean() {
    return this.type == 0x01;
  }
  isInteger() {
    return this.type == 0x02;
  }
  isOctetString() {
    return this.type == 0x04;
  }
  isEnumerated() {
    return this.type == 0x0a;
  }

  // Functions to interpret the value in particular ways.
  // No type checking is performed, as application/context-specific
  // types can also use these.

  asBoolean() {
    return this.data[0] != 0;
  }

  asInteger() {
    let i = 0;
    // TODO: handle negative numbers!
    for (const b of this.data) {
      i = (i << 8) | b;
    }
    return i;
  }

  asEnumerated() {
    return this.asInteger();
  }

  // Helper to interpret an octet string as an ASCII string.
  asString() {
    // TODO: pass in expected encoding?
    if (this.data.length > 0) {
      return MailStringUtils.uint8ArrayToByteString(new Uint8Array(this.data));
    }
    return "";
  }

  // Static helpers to construct specific types of BERValue.
  static newNull() {
    const ber = new BERValue(0x05);
    ber.data = [];
    return ber;
  }

  static newBoolean(b) {
    const ber = new BERValue(0x01);
    ber.data = [b ? 0xff : 0x00];
    return ber;
  }

  static newInteger(i) {
    const ber = new BERValue(0x02);
    // TODO: does this handle negative correctly?
    while (i >= 128) {
      ber.data.unshift(i & 255);
      i >>= 8;
    }
    ber.data.unshift(i);
    return ber;
  }

  static newEnumerated(i) {
    const ber = BERValue.newInteger(i);
    ber.type = 0x0a; // sneaky but valid.
    return ber;
  }

  static newOctetString(bytes) {
    const ber = new BERValue(0x04);
    ber.data = bytes;
    return ber;
  }

  /**
   * Create an octet string from an ASCII string.
   */
  static newString(str) {
    const ber = new BERValue(0x04);
    if (str.length > 0) {
      ber.data = Array.from(str, c => c.charCodeAt(0));
    }
    return ber;
  }

  /**
   * Create a new sequence
   *
   * @param {number} type - BER type byte
   * @param {Array.<BERValue>} children - The contents of the sequence.
   */
  static newSequence(type, children) {
    const ber = new BERValue(type);
    ber.children = children;
    return ber;
  }

  /*
   * A helper to dump out the value (and it's children) in a human-readable
   * way.
   */
  dbug(prefix = "") {
    let desc = "";
    switch (this.type) {
      case 0x01:
        desc += `BOOLEAN (${this.asBoolean()})`;
        break;
      case 0x02:
        desc += `INTEGER (${this.asInteger()})`;
        break;
      case 0x04:
        desc += `OCTETSTRING ("${this.asString()}")`;
        break;
      case 0x05:
        desc += `NULL`;
        break;
      case 0x0a:
        desc += `ENUMERATED (${this.asEnumerated()})`;
        break;
      case 0x30:
        desc += `SEQUENCE`;
        break;
      case 0x31:
        desc += `SET`;
        break;
      default:
        desc = `0x${this.type.toString(16)}`;
        if (this.isConstructed()) {
          desc += " SEQUENCE";
        }
        break;
    }

    switch (this.type & 0xc0) {
      case 0x00:
        break; // universal
      case 0x40:
        desc += " APPLICATION";
        break;
      case 0x80:
        desc += " CONTEXT-SPECIFIC";
        break;
      case 0xc0:
        desc += " PRIVATE";
        break;
    }

    if (this.isConstructed()) {
      desc += ` ${this.children.length} children`;
    } else {
      desc += ` ${this.data.length} bytes`;
    }

    // Dump out the beginning of the payload as raw bytes.
    let rawdump = this.data.slice(0, 8).join(" ");
    if (this.data.length > 8) {
      rawdump += "...";
    }

    dump(`${prefix}${desc} ${rawdump}\n`);

    for (const c of this.children) {
      c.dbug(prefix + "  ");
    }
  }
}

/**
 * Parser to decode BER elements from a Connection.
 */
class BERParser {
  constructor(conn) {
    this._conn = conn;
  }

  /**
   * Helper to fetch the next byte in the stream.
   *
   * @returns {number} - The byte.
   */
  async _nextByte() {
    const buf = await this._conn.read(1);
    return buf[0];
  }

  /**
   * Helper to read a BER length field from the connection.
   *
   * @returns {Array.<number>} - 2 elements: [length, bytesconsumed].
   */
  async _readLength() {
    let n = await this._nextByte();
    if ((n & 0x80) == 0) {
      return [n, 1]; // msb clear => single-byte encoding
    }
    // lower 7 bits are number of bytes encoding length (big-endian order).
    n = n & 0x7f;
    let len = 0;
    for (let i = 0; i < n; ++i) {
      len = (len << 8) + (await this._nextByte());
    }
    return [len, 1 + n];
  }

  /**
   * Reads a single BERValue from the connection (including any children).
   *
   * @returns {Array.<number>} - 2 elements: [value, bytesconsumed].
   */
  async decodeBERValue() {
    // BER values always encoded as TLV (type, length, value) triples,
    // where type is a single byte, length can be a variable number of bytes
    // and value is a byte string, of size length.
    const type = await this._nextByte();
    const [length, lensize] = await this._readLength();

    const ber = new BERValue(type);
    if (type & 0x20) {
      // it's a sequence
      let cnt = 0;
      while (cnt < length) {
        const [child, consumed] = await this.decodeBERValue();
        cnt += consumed;
        ber.children.push(child);
      }
      if (cnt != length) {
        // All the bytes in the sequence must be accounted for.
        // TODO: should define a specific BER error type so handler can
        // detect and respond to BER decoding issues?
        throw new Error("Mismatched length in sequence");
      }
    } else {
      ber.data = await this._conn.read(length);
    }
    return [ber, 1 + lensize + length];
  }
}

/*
 * LDAP-specific code from here on.
 */

/*
 * LDAPDaemon holds our LDAP database and has methods for
 * searching and manipulating the data.
 * So tests can set up test data here, shared by any number of LDAPHandlerFn
 * connections.
 */
export class LDAPDaemon {
  constructor() {
    // An entry is an object of the form:
    // {dn:"....", attributes: {attr1: [val1], attr2:[val2,val3], ...}}
    // Note that the attribute values are arrays (attributes can have multiple
    // values in LDAP).
    this.entries = {}; // We map dn to entry, to ensure dn is unique.
    this.debug = false;
  }

  /**
   * If set, will dump out assorted debugging info.
   */
  setDebug(yesno) {
    this.debug = yesno;
  }

  /**
   * Add entries to the LDAP database.
   * Overwrites previous entries with same dn.
   * since attributes can have multiple values, they should be arrays.
   * For example:
   * {dn: "...", {cn: ["Bob Smith"], ...}}
   * But because that can be a pain, non-arrays values will be promoted.
   * So we'll also accept:
   * {dn: "...", {cn: "Bob Smith", ...}}
   */
  add(...entries) {
    // Clone the data before munging it.
    const entriesCopy = JSON.parse(JSON.stringify(entries));
    for (const e of entriesCopy) {
      if (e.dn === undefined || e.attributes === undefined) {
        throw new Error("bad entry");
      }

      // Convert attr values to arrays, if required.
      for (const [attr, val] of Object.entries(e.attributes)) {
        if (!Array.isArray(val)) {
          e.attributes[attr] = [val];
        }
      }
      this.entries[e.dn] = e;
    }
  }

  /**
   * Find entries in our LDAP db.
   *
   * @param {BERValue} berFilter - BERValue containing the filter to apply.
   * @returns {Array} - The matching entries.
   */
  search(berFilter) {
    const f = this.buildFilter(berFilter);
    return Object.values(this.entries).filter(f);
  }

  /**
   * Recursively build a filter function from a BER-encoded filter.
   * The resulting function accepts a single entry as parameter, and
   * returns a bool to say if it passes the filter or not.
   *
   * @param {BERValue} ber - The filter.
   * @returns {Function} - A function to test an entry against the filter.
   */
  buildFilter(ber) {
    if (!ber.isContextSpecific()) {
      throw new Error("Bad filter");
    }

    switch (ber.tag()) {
      case 0: {
        // and
        if (ber.children.length < 1) {
          throw new Error("Bad 'and' filter");
        }
        const subFilters = ber.children.map(this.buildFilter);
        return function (e) {
          return subFilters.every(filt => filt(e));
        };
      }
      case 1: {
        // or
        if (ber.children.length < 1) {
          throw new Error("Bad 'or' filter");
        }
        const subFilters = ber.children.map(this.buildFilter);
        return function (e) {
          return subFilters.some(filt => filt(e));
        };
      }
      case 2: {
        // not
        if (ber.children.length != 1) {
          throw new Error("Bad 'not' filter");
        }
        const subFilter = this.buildFilter(ber.children[0]); // one child
        return function (e) {
          return !subFilter(e);
        };
      }
      case 3: {
        // equalityMatch
        if (ber.children.length != 2) {
          throw new Error("Bad 'equality' filter");
        }
        const attrName = ber.children[0].asString().toLowerCase();
        const attrVal = ber.children[1].asString().toLowerCase();
        return function (e) {
          const attrs = Object.keys(e.attributes).reduce(function (c, key) {
            c[key.toLowerCase()] = e.attributes[key];
            return c;
          }, {});
          return (
            attrs[attrName] !== undefined &&
            attrs[attrName].map(val => val.toLowerCase()).includes(attrVal)
          );
        };
      }
      case 7: {
        // present
        const attrName = ber.asString().toLowerCase();
        return function (e) {
          const attrs = Object.keys(e.attributes).reduce(function (c, key) {
            c[key.toLowerCase()] = e.attributes[key];
            return c;
          }, {});
          return attrs[attrName] !== undefined;
        };
      }
      case 4: // substring (Probably need to implement this!)
      case 5: // greaterOrEqual
      case 6: // lessOrEqual
      case 8: // approxMatch
      case 9: // extensibleMatch
        // UNSUPPORTED! just match everything.
        dump("WARNING: unsupported filter\n");
        return e => true;
      default:
        throw new Error("unknown filter");
    }
  }
}

/**
 * Helper class to help break down LDAP handler into multiple functions.
 * Used by LDAPHandlerFn, below.
 * Handler state for a single connection (as opposed to any state common
 * across all connections, which is handled by LDAPDaemon).
 */
class LDAPHandler {
  constructor(conn, daemon) {
    this._conn = conn;
    this._daemon = daemon;
  }

  // handler run() should exit when done, or throw exception to crash out.
  async run() {
    const parser = new BERParser(this._conn);

    while (1) {
      const [msg] = await parser.decodeBERValue();
      if (this._daemon.debug) {
        dump("=== received ===\n");
        msg.dbug("C: ");
      }

      if (
        msg.type != 0x30 ||
        msg.children.length < 2 ||
        !msg.children[0].isInteger()
      ) {
        // badly formed message - TODO: bail out gracefully...
        throw new Error("Bad message..");
      }

      const msgID = msg.children[0].asInteger();
      const req = msg.children[1];

      // Handle a teeny tiny subset of requests.
      switch (req.type) {
        case 0x60:
          this.handleBindRequest(msgID, req);
          break;
        case 0x63:
          this.handleSearchRequest(msgID, req);
          break;
        case 0x42: // unbindRequest (essentially a "quit").
          return;
      }
    }
  }

  /**
   * Send out an LDAP message.
   *
   * @param {number} msgID - The ID of the message we're responding to.
   * @param {BERValue} payload - The message content.
   */
  async sendLDAPMessage(msgID, payload) {
    const msg = BERValue.newSequence(0x30, [
      BERValue.newInteger(msgID),
      payload,
    ]);
    if (this._daemon.debug) {
      msg.dbug("S: ");
    }
    await this._conn.write(msg.encode());
  }

  async handleBindRequest(msgID, req) {
    // Ignore the details, just say "OK!"
    // TODO: Add some auth support here, would be handy for testing.
    const bindResponse = new BERValue(0x61);
    bindResponse.children = [
      BERValue.newEnumerated(0), // resultCode 0=success
      BERValue.newString(""), // matchedDN
      BERValue.newString(""), // diagnosticMessage
    ];

    if (this._daemon.debug) {
      dump("=== send bindResponse ===\n");
    }
    await this.sendLDAPMessage(msgID, bindResponse);
  }

  async handleSearchRequest(msgID, req) {
    // Make sure all the parts we expect are present and of correct type.
    if (
      req.children.length < 8 ||
      !req.children[0].isOctetString() ||
      !req.children[1].isEnumerated() ||
      !req.children[2].isEnumerated() ||
      !req.children[3].isInteger() ||
      !req.children[4].isInteger() ||
      !req.children[5].isBoolean()
    ) {
      throw new Error("Bad search request!");
    }

    // Perform search
    const filt = req.children[6];
    const matches = this._daemon.search(filt);

    // Send a searchResultEntry for each match
    for (const match of matches) {
      const dn = BERValue.newString(match.dn);
      const attrList = new BERValue(0x30);
      for (const [key, values] of Object.entries(match.attributes)) {
        const valueSet = new BERValue(0x31);
        for (const v of values) {
          valueSet.children.push(BERValue.newString(v));
        }

        attrList.children.push(
          BERValue.newSequence(0x30, [BERValue.newString(key), valueSet])
        );
      }

      // 0x64 = searchResultEntry
      const searchResultEntry = BERValue.newSequence(0x64, [dn, attrList]);

      if (this._daemon.debug) {
        dump(`=== send searchResultEntry ===\n`);
      }
      this.sendLDAPMessage(msgID, searchResultEntry);
    }

    //SearchResultDone ::= [APPLICATION 5] LDAPResult
    const searchResultDone = new BERValue(0x65);
    searchResultDone.children = [
      BERValue.newEnumerated(0), // resultCode 0=success
      BERValue.newString(""), // matchedDN
      BERValue.newString(""), // diagnosticMessage
    ];

    if (this._daemon.debug) {
      dump(`=== send searchResultDone ===\n`);
    }
    this.sendLDAPMessage(msgID, searchResultDone);
  }
}

/**
 * Handler function to deal with a connection to our LDAP server.
 */
export async function LDAPHandlerFn(conn, daemon) {
  const handler = new LDAPHandler(conn, daemon);
  await handler.run();
}
