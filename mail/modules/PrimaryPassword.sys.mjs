/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Enforces the PrimaryPassword enterprise policy before saving a credential.
 *
 * When the policy is active, a primary password must protect the login store.
 * If none is set the user is prompted to create one.
 *
 * @returns {boolean} true if saving may proceed, false if the user declined.
 */
export function enforcePrimaryPassword() {
  if (Services.policies.isAllowed("removeMasterPassword")) {
    return true;
  }
  const token = Cc["@mozilla.org/security/internalkeytoken;1"].createInstance(
    Ci.nsIPKCS11Token
  );
  if (token.hasPassword) {
    return true;
  }
  Services.wm
    .getMostRecentWindow(null)
    .openDialog(
      "chrome://mozapps/content/preferences/changemp.xhtml",
      "",
      "centerscreen,chrome,modal,titlebar"
    );
  return Cc["@mozilla.org/security/internalkeytoken;1"].createInstance(
    Ci.nsIPKCS11Token
  ).hasPassword;
}
