/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */
// vim:set ts=2 sw=2 sts=2 et ft=javascript:

Components.utils.import("resource:///modules/Services.jsm");

/**
 * This file exports the JSMime code, polyfilling code as appropriate for use in
 * Gecko.
 */

// Load the core MIME parser. Since it doesn't define EXPORTED_SYMBOLS, we must
// use the subscript loader instead.
Services.scriptloader.loadSubScript("resource:///modules/jsmime/jsmime.js");

var EXPORTED_SYMBOLS = ["jsmime"];

// Note: JSMime 0.2 doesn't require any polyfilling for the moment, which means
// this code looks empty. However, it is anticipated that future code will need
// some amount of polyfilling (supporting non-UTF-8 encodings in TextEncoder for
// composition code is the most prominent example). Since I want people to start
// out doing the right thing, I'm defining jsmime.jsm before there's a real need
// for it.
