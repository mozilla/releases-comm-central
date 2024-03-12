/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { MailServices } from "resource:///modules/MailServices.sys.mjs";

/**
 * @namespace A holding place for logic that is not gloda-specific and should
 *  reside elsewhere.
 */
export var GlodaUtils = {
  /**
   * This Regexp is super-complicated and used at least in two different parts of
   * the code, so let's expose it from one single location.
   */
  PART_RE: new RegExp(
    "^[^?]+\\?(?:/;section=\\d+\\?)?(?:[^&]+&)*part=([^&]+)(?:&[^&]+)*$"
  ),

  deMime(aString) {
    return MailServices.mimeConverter.decodeMimeHeader(
      aString,
      null,
      false,
      true
    );
  },

  _headerParser: MailServices.headerParser,

  /**
   * Parses an RFC 2822 list of e-mail addresses and returns an object with
   *  4 attributes, as described below.  We will use the example of the user
   *  passing an argument of '"Bob Smith" <bob@example.com>'.
   *
   * This method (by way of nsIMsgHeaderParser) takes care of decoding mime
   *  headers, but is not aware of folder-level character set overrides.
   *
   * count: the number of addresses parsed. (ex: 1)
   * addresses: a list of e-mail addresses (ex: ["bob@example.com"])
   * names: a list of names (ex: ["Bob Smith"])
   * fullAddresses: aka the list of name and e-mail together (ex: ['"Bob Smith"
   *  <bob@example.com>']).
   *
   * This method is a convenience wrapper around nsIMsgHeaderParser.
   */
  parseMailAddresses(aMailAddresses) {
    const addresses = this._headerParser.parseEncodedHeader(aMailAddresses);
    return {
      names: addresses.map(a => a.name || null),
      addresses: addresses.map(a => a.email),
      fullAddresses: addresses.map(a => a.toString()),
      count: addresses.length,
    };
  },

  /**
   * MD5 hash a string and return the hex-string result. Impl from nsICryptoHash
   *  docs.
   */
  md5HashString(aString) {
    const data = [...new TextEncoder().encode(aString)];

    const hasher = Cc["@mozilla.org/security/hash;1"].createInstance(
      Ci.nsICryptoHash
    );
    hasher.init(Ci.nsICryptoHash.MD5);
    hasher.update(data, data.length);
    const hash = hasher.finish(false);

    // return the two-digit hexadecimal code for a byte
    function toHexString(charCode) {
      return ("0" + charCode.toString(16)).slice(-2);
    }

    // convert the binary hash data to a hex string.
    const hex = Object.keys(hash).map(i => toHexString(hash.charCodeAt(i)));
    return hex.join("");
  },
};
