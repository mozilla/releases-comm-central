/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

ChromeUtils.import("resource://gre/modules/Deprecated.jsm");
ChromeUtils.import("resource://calendar/modules/calUtils.jsm");

this.EXPORTED_SYMBOLS = ["cal"];

Deprecated.warning("calProviderUtils.jsm must no longer be imported directly, it" +
                   " is already available via calUtils.jsm",
                   "https://bugzilla.mozilla.org/show_bug.cgi?id=905097",
                   Components.stack.caller);
