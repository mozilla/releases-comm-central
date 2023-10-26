/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */
// vim:set ts=2 sw=2 sts=2 et ft=javascript:

/**
 * This file exports the JSMime code, polyfilling code as appropriate for use in
 * Gecko.
 */

// Load the core MIME parser. Since it doesn't define EXPORTED_SYMBOLS, we must
// use the subscript loader instead.
Services.scriptloader.loadSubScript("resource:///modules/jsmime/jsmime.js");

var EXPORTED_SYMBOLS = ["jsmime"];

function bytesToString(buffer) {
  var string = "";
  for (var i = 0; i < buffer.length; i++) {
    string += String.fromCharCode(buffer[i]);
  }
  return string;
}

// Our UTF-7 decoder.
function UTF7TextDecoder(options = {}, manager) {
  this.manager = manager;
  this.collectInput = "";
}
UTF7TextDecoder.prototype = {
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
  },
};

/* exported MimeTextDecoder */
function MimeTextDecoder(charset, options) {
  const manager = Cc["@mozilla.org/charset-converter-manager;1"].createInstance(
    Ci.nsICharsetConverterManager
  );
  // The following will throw if the charset is unknown.
  const newCharset = manager.getCharsetAlias(charset);
  if (newCharset.toLowerCase() == "utf-7") {
    return new UTF7TextDecoder(options, manager);
  }
  return new TextDecoder(newCharset, options);
}

// The following code loads custom MIME encoders.
var CATEGORY_NAME = "custom-mime-encoder";
Services.obs.addObserver(function (subject, topic, data) {
  subject = subject.QueryInterface(Ci.nsISupportsCString).data;
  if (data == CATEGORY_NAME) {
    const url = Services.catMan.getCategoryEntry(CATEGORY_NAME, subject);
    Services.scriptloader.loadSubScript(url, {}, "UTF-8");
  }
}, "xpcom-category-entry-added");

for (const { data } of Services.catMan.enumerateCategory(CATEGORY_NAME)) {
  const url = Services.catMan.getCategoryEntry(CATEGORY_NAME, data);
  Services.scriptloader.loadSubScript(url, {}, "UTF-8");
}
