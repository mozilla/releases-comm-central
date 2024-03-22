/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This file exports the JSMime code, polyfilling code as appropriate for use in
 * Gecko.
 */

import { jsmime as jsmimeModule } from "resource:///modules/jsmime/jsmime.mjs";

export var jsmime = jsmimeModule;

function bytesToString(buffer) {
  var string = "";
  for (var i = 0; i < buffer.length; i++) {
    string += String.fromCharCode(buffer[i]);
  }
  return string;
}

// Our UTF-7 decoder.
class UTF7TextDecoder {
  constructor(manager) {
    this.manager = manager;
    this.collectInput = "";
  }
  // Since the constructor checked, this will only be called for UTF-7.
  decode(input, options = {}) {
    const more = "stream" in options ? options.stream : false;
    // There are cases where this is called without input.
    if (!input) {
      return "";
    }
    this.collectInput += bytesToString(input);
    if (more) {
      return "";
    }
    return this.manager.utf7ToUnicode(this.collectInput);
  }
}

function MimeTextDecoder(charset, options) {
  const manager = Cc["@mozilla.org/charset-converter-manager;1"].createInstance(
    Ci.nsICharsetConverterManager
  );
  // The following will throw if the charset is unknown.
  const newCharset = manager.getCharsetAlias(charset);
  if (newCharset.toLowerCase() == "utf-7") {
    return new UTF7TextDecoder(manager);
  }
  return new TextDecoder(newCharset, options);
}

jsmime.mimeutils.MimeTextDecoder = MimeTextDecoder; // Fill!
