/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["LDAPDirectory"];

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

/**
 * Set `user_pref("mailnews.ldap.jsmodule", true);` to use this module.
 *
 * @implements {nsIAbLDAPDirectory}
 * @implements {nsIAbDirectory}
 */
function LDAPDirectory() {}

LDAPDirectory.prototype = {
  QueryInterface: ChromeUtils.generateQI([
    "nsIAbLDAPDirectory",
    "nsIAbDirectory",
  ]),
  classID: Components.ID("{8683e821-f1b0-476d-ac15-07771c79bb11}"),

  init(url) {},
};
