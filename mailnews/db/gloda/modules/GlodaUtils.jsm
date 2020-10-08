/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["GlodaUtils"];

const { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
const { clearTimeout, setTimeout } = ChromeUtils.import(
  "resource://gre/modules/Timer.jsm"
);

ChromeUtils.defineModuleGetter(
  this,
  "Gloda",
  "resource:///modules/gloda/Gloda.jsm"
);
ChromeUtils.defineModuleGetter(
  this,
  "GlodaIndexer",
  "resource:///modules/gloda/GlodaIndexer.jsm"
);

/**
 * @namespace A holding place for logic that is not gloda-specific and should
 *  reside elsewhere.
 */
var GlodaUtils = {
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
    let addresses = this._headerParser.parseEncodedHeader(aMailAddresses);
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
    let converter = Cc[
      "@mozilla.org/intl/scriptableunicodeconverter"
    ].createInstance(Ci.nsIScriptableUnicodeConverter);
    let trash = {};
    converter.charset = "UTF-8";
    let data = converter.convertToByteArray(aString, trash);

    let hasher = Cc["@mozilla.org/security/hash;1"].createInstance(
      Ci.nsICryptoHash
    );
    hasher.init(Ci.nsICryptoHash.MD5);
    hasher.update(data, data.length);
    let hash = hasher.finish(false);

    // return the two-digit hexadecimal code for a byte
    function toHexString(charCode) {
      return ("0" + charCode.toString(16)).slice(-2);
    }

    // convert the binary hash data to a hex string.
    let hex = Object.keys(hash).map(i => toHexString(hash.charCodeAt(i)));
    return hex.join("");
  },

  getCardForEmail(aAddress) {
    // search through all of our local address books looking for a match.
    let cardForEmailAddress;
    for (let addrbook of MailServices.ab.directories) {
      if (cardForEmailAddress) {
        break;
      }
      try {
        cardForEmailAddress = addrbook.cardForEmailAddress(aAddress);
        if (cardForEmailAddress) {
          return cardForEmailAddress;
        }
      } catch (ex) {}
    }

    return null;
  },

  getDisplayNameForEmail(aAddress) {
    idleListener.init();

    if (!addressCache.has(aAddress)) {
      return addressCache.get(aAddress);
    }

    let abCard = this.getCardForEmail(aAddress);
    if (abCard) {
      let displayName = abCard.displayName;
      addressCache.set(aAddress, displayName);
      return displayName;
    }

    addressCache.set(aAddress, null);
    return null;
  },
};

// A cache of email addresses to display names from the address book. Caching
// this avoids hitting the address book multiple times for every email Gloda
// indexes.
//
// However, the cache will also fill up with addresses that are not saved in
// the address book and probably won't be seen again, so we clear the cache
// when the indexer is idle. This also avoids the issue of address book
// entries changing.

let addressCache = new Map();
let idleListener = {
  added: false,
  timer: null,

  init() {
    if (!this.added) {
      this.added = true;
      GlodaIndexer.addListener(this.listener.bind(this));
    }
  },
  listener(glodaStatus) {
    if (glodaStatus != Gloda.kIndexerIdle) {
      return;
    }

    // When downloading a folder Gloda indexes the messages individually and
    // sends an idle status notification each time. Clearing the cache for
    // each notification would be wasteful, so we wait a minute (arbitrary)
    // after the last notification before clearing. (Clearance can happen if
    // a download stalls for long enough but that's okay.)

    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      if (GlodaIndexer.indexing) {
        return;
      }
      addressCache.clear();
    }, 60000);
  },
};
