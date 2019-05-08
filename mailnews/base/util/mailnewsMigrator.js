/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Migrate profile (prefs and other files) from older versions of Mailnews to
 * current.
 * This should be run at startup. It migrates as needed: each migration
 * function should be written to be a no-op when the value is already migrated
 * or was never used in the old version.
 */

this.EXPORTED_SYMBOLS = [ "migrateMailnews" ];

var {logException} = ChromeUtils.import("resource:///modules/errUtils.js");
var {Services} = ChromeUtils.import("resource://gre/modules/Services.jsm");
var {MailServices} = ChromeUtils.import("resource:///modules/MailServices.jsm");
var kServerPrefVersion = 1;
var kSmtpPrefVersion = 1;
var kABRemoteContentPrefVersion = 1;
var kDefaultCharsetsPrefVersion = 1;

function migrateMailnews() {
  try {
    MigrateProfileClientid();
  } catch (e) {
    logException(e);
  }

  try {
    MigrateServerAuthPref();
  } catch (e) {
    logException(e);
  }

  try {
    MigrateABRemoteContentSettings();
  } catch (e) {
    logException(e);
  }

  try {
    MigrateDefaultCharsets();
  } catch (e) {
    logException(e);
  }
}

/**
 * Creates the server specific default 'clientid' prefs.
 */
function MigrateProfileClientid() {
  // First generate a uuid without braces.
  let uuidGen = Cc["@mozilla.org/uuid-generator;1"].getService(Ci.nsIUUIDGenerator);
  let defaultClientid = uuidGen.generateUUID().toString().replace(/[{}]/g, "");
  // We need to populate our default clientid preferences if they are missing.
  if (!Services.prefs.getCharPref("mail.server.default.clientid")) {
    Services.prefs.setCharPref("mail.server.default.clientid", defaultClientid);
  }
  if (!Services.prefs.getCharPref("mail.smtpserver.default.clientid")) {
    Services.prefs.setCharPref("mail.smtpserver.default.clientid", defaultClientid);
  }
}

/**
 * Migrates from pref useSecAuth to pref authMethod
 */
function MigrateServerAuthPref() {
  try {
    // comma-separated list of all accounts.
    var accounts = Services.prefs.getCharPref("mail.accountmanager.accounts")
        .split(",");
    for (let i = 0; i < accounts.length; i++) {
      let accountKey = accounts[i]; // e.g. "account1"
      if (!accountKey)
        continue;
      let serverKey = Services.prefs.getCharPref("mail.account." + accountKey +
         ".server");
      let server = "mail.server." + serverKey + ".";
      if (Services.prefs.prefHasUserValue(server + "authMethod"))
        continue;
      if (!Services.prefs.prefHasUserValue(server + "useSecAuth") &&
          !Services.prefs.prefHasUserValue(server + "auth_login"))
        continue;
      if (Services.prefs.prefHasUserValue(server + "migrated"))
        continue;
      // auth_login = false => old-style auth
      // else: useSecAuth = true => "secure auth"
      // else: cleartext pw
      let auth_login = Services.prefs.getBoolPref(server + "auth_login", true);
      // old default, default pref now removed
      let useSecAuth = Services.prefs.getBoolPref(server + "useSecAuth", false);

      if (auth_login) {
        if (useSecAuth) {
          Services.prefs.setIntPref(server + "authMethod", Ci.nsMsgAuthMethod.secure);
        } else {
          Services.prefs.setIntPref(server + "authMethod", Ci.nsMsgAuthMethod.passwordCleartext);
        }
      } else {
        Services.prefs.setIntPref(server + "authMethod", Ci.nsMsgAuthMethod.old);
      }
      Services.prefs.setIntPref(server + "migrated", kServerPrefVersion);
    }

    // same again for SMTP servers
    var smtpservers = Services.prefs.getCharPref("mail.smtpservers").split(",");
    for (let i = 0; i < smtpservers.length; i++) {
      if (!smtpservers[i])
        continue;
      let server = "mail.smtpserver." + smtpservers[i] + ".";
      if (Services.prefs.prefHasUserValue(server + "authMethod"))
        continue;
      if (!Services.prefs.prefHasUserValue(server + "useSecAuth") &&
          !Services.prefs.prefHasUserValue(server + "auth_method"))
        continue;
      if (Services.prefs.prefHasUserValue(server + "migrated"))
        continue;
      // auth_method = 0 => no auth
      // else: useSecAuth = true => "secure auth"
      // else: cleartext pw
      let auth_method = Services.prefs.getIntPref(server + "auth_method", 1);
      let useSecAuth = Services.prefs.getBoolPref(server + "useSecAuth", false);

      if (auth_method) {
        if (useSecAuth) {
          Services.prefs.setIntPref(server + "authMethod", Ci.nsMsgAuthMethod.secure);
        } else {
          Services.prefs.setIntPref(server + "authMethod", Ci.nsMsgAuthMethod.passwordCleartext);
        }
      } else {
        Services.prefs.setIntPref(server + "authMethod", Ci.nsMsgAuthMethod.none);
      }
      Services.prefs.setIntPref(server + "migrated", kSmtpPrefVersion);
    }
  } catch (e) {
    logException(e);
  }
}

/**
 * The address book used to contain information about whether to allow remote
 * content for a given contact. Now we use the permission manager for that.
 * Do a one-time migration for it.
 */
function MigrateABRemoteContentSettings() {
  if (Services.prefs.prefHasUserValue("mail.ab_remote_content.migrated"))
    return;

  // Search through all of our local address books looking for a match.
  let enumerator = MailServices.ab.directories;
  while (enumerator.hasMoreElements()) {
    let migrateAddress = function(aEmail) {
      let uri = Services.io.newURI(
        "chrome://messenger/content/email=" + aEmail);
      Services.perms.add(uri, "image", Services.perms.ALLOW_ACTION);
    };

    let addrbook = enumerator.getNext()
      .QueryInterface(Ci.nsIAbDirectory);
    try {
      // If it's a read-only book, don't try to find a card as we we could never
      // have set the AllowRemoteContent property.
      if (addrbook.readOnly)
        continue;

      let childCards = addrbook.childCards;
      while (childCards.hasMoreElements()) {
        let card = childCards.getNext()
                             .QueryInterface(Ci.nsIAbCard);

        if (card.getProperty("AllowRemoteContent", "0") == "0")
          continue; // not allowed for this contact

        if (card.primaryEmail)
          migrateAddress(card.primaryEmail);

        if (card.getProperty("SecondEmail", ""))
          migrateAddress(card.getProperty("SecondEmail", ""));
      }
    } catch (e) {
      logException(e);
    }
  }

  Services.prefs.setIntPref("mail.ab_remote_content.migrated",
                            kABRemoteContentPrefVersion);
}

/**
 * If the default sending or viewing charset is one that is no longer available,
 * change it back to the default.
 */
function MigrateDefaultCharsets() {
  if (Services.prefs.prefHasUserValue("mail.default_charsets.migrated"))
    return;

  let charsetConvertManager = Cc["@mozilla.org/charset-converter-manager;1"]
    .getService(Ci.nsICharsetConverterManager);

  let sendCharsetStr = Services.prefs.getComplexValue(
      "mailnews.send_default_charset",
      Ci.nsIPrefLocalizedString).data;

  try {
    charsetConvertManager.getCharsetTitle(sendCharsetStr);
  } catch (e) {
    Services.prefs.clearUserPref("mailnews.send_default_charset");
  }

  let viewCharsetStr = Services.prefs.getComplexValue(
      "mailnews.view_default_charset",
      Ci.nsIPrefLocalizedString).data;

  try {
    charsetConvertManager.getCharsetTitle(viewCharsetStr);
  } catch (e) {
    Services.prefs.clearUserPref("mailnews.view_default_charset");
  }

  Services.prefs.setIntPref("mail.default_charsets.migrated",
                            kDefaultCharsetsPrefVersion);
}
