/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var EXPORTED_SYMBOLS = ["MailUtils"];

ChromeUtils.import("resource:///modules/MailUtils.jsm");

const {Deprecated} = ChromeUtils.import("resource://gre/modules/Deprecated.jsm");
Deprecated.warning(
    "MailUtils.js has been renamed MailUtils.jsm",
    "https://bugzilla.mozilla.org/show_bug.cgi?id=1498041",
    Components.stack.caller
);
