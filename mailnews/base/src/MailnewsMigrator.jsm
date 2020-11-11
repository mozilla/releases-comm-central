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

const EXPORTED_SYMBOLS = ["migrateMailnews"];

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
XPCOMUtils.defineLazyServiceGetter(
  this,
  "uuidGen",
  "@mozilla.org/uuid-generator;1",
  "nsIUUIDGenerator"
);

var kServerPrefVersion = 1;
var kSmtpPrefVersion = 1;
var kABRemoteContentPrefVersion = 1;

function migrateMailnews() {
  try {
    MigrateProfileClientid();
  } catch (e) {
    console.error(e);
  }

  try {
    MigrateServerAuthPref();
  } catch (e) {
    console.error(e);
  }

  try {
    MigrateABRemoteContentSettings();
  } catch (e) {
    console.error(e);
  }
}

/**
 * Creates the server specific 'CLIENTID' prefs and tries to pair up any imap
 * services with smtp services which are using the same username and hostname.
 */
function MigrateProfileClientid() {
  // Comma-separated list of all account ids.
  let accounts = Services.prefs.getCharPref("mail.accountmanager.accounts", "");
  // Comma-separated list of all smtp servers.
  let smtpServers = Services.prefs.getCharPref("mail.smtpservers", "");
  // If both accounts and smtpservers are empty then there is nothing to do.
  if (accounts.length == 0 && smtpServers.length == 0) {
    return;
  }
  // A cache to allow CLIENTIDs to be stored and shared across services that
  // share a username and hostname.
  let clientidCache = new Map();
  // There may be accounts but no smtpservers so check the length before
  // trying to split the smtp servers and iterate in the loop below.
  if (smtpServers.length > 0) {
    // Now walk all smtp servers and generate any missing CLIENTIDS, caching
    // all CLIENTIDS along the way to be reused for matching imap servers
    // if possible.

    // Since the length of the smtpServers string is non-zero then we can split
    // the string by comma and iterate each entry in the comma-separated list.
    for (let key of smtpServers.split(",")) {
      let server = "mail.smtpserver." + key + ".";
      if (
        !Services.prefs.prefHasUserValue(server + "clientid") ||
        !Services.prefs.getCharPref(server + "clientid", "")
      ) {
        // Always give outgoing servers a new unique CLIENTID.
        let newClientid = uuidGen
          .generateUUID()
          .toString()
          .replace(/[{}]/g, "");
        Services.prefs.setCharPref(server + "clientid", newClientid);
      }
      let username = Services.prefs.getCharPref(server + "username", "");
      if (!username) {
        // Not all SMTP servers require a username.
        continue;
      }

      // Cache all CLIENTIDs from all outgoing servers to reuse them for any
      // incoming servers which have a matching username and hostname.
      let hostname = Services.prefs.getCharPref(server + "hostname");
      let combinedKey;
      try {
        combinedKey =
          username + "@" + Services.eTLD.getBaseDomainFromHost(hostname);
      } catch (e) {
        combinedKey = username + "@" + hostname;
      }
      clientidCache.set(
        combinedKey,
        Services.prefs.getCharPref(server + "clientid")
      );
    }
  }

  // Now walk all imap accounts and generate any missing CLIENTIDS, reusing
  // cached CLIENTIDS if possible.
  for (let key of accounts.split(",")) {
    let serverKey = Services.prefs.getCharPref(
      "mail.account." + key + ".server"
    );
    let server = "mail.server." + serverKey + ".";
    // Check if this imap server needs the CLIENTID preference to be populated.
    if (
      !Services.prefs.prefHasUserValue(server + "clientid") ||
      !Services.prefs.getCharPref(server + "clientid", "")
    ) {
      // Clientid should only be provisioned for imap accounts.
      if (Services.prefs.getCharPref(server + "type", "") != "imap") {
        continue;
      }
      // Grab username + hostname to check if a CLIENTID is cached.
      let username = Services.prefs.getCharPref(server + "userName", "");
      if (!username) {
        continue;
      }
      let hostname = Services.prefs.getCharPref(server + "hostname");
      let combinedKey;
      try {
        combinedKey =
          username + "@" + Services.eTLD.getBaseDomainFromHost(hostname);
      } catch (e) {
        combinedKey = username + "@" + hostname;
      }
      if (!clientidCache.has(combinedKey)) {
        // Generate a new CLIENTID if no matches were found from smtp servers.
        let newClientid = uuidGen
          .generateUUID()
          .toString()
          .replace(/[{}]/g, "");
        Services.prefs.setCharPref(server + "clientid", newClientid);
      } else {
        // Otherwise if a cached CLIENTID was found for this username + hostname
        // then we can just use the outgoing CLIENTID which was matching.
        Services.prefs.setCharPref(
          server + "clientid",
          clientidCache.get(combinedKey)
        );
      }
    }
  }
}

/**
 * Migrates from pref useSecAuth to pref authMethod
 */
function MigrateServerAuthPref() {
  // comma-separated list of all accounts.
  var accounts = Services.prefs
    .getCharPref("mail.accountmanager.accounts")
    .split(",");
  for (let i = 0; i < accounts.length; i++) {
    let accountKey = accounts[i]; // e.g. "account1"
    if (!accountKey) {
      continue;
    }
    let serverKey = Services.prefs.getCharPref(
      "mail.account." + accountKey + ".server"
    );
    let server = "mail.server." + serverKey + ".";
    if (Services.prefs.prefHasUserValue(server + "authMethod")) {
      continue;
    }
    if (
      !Services.prefs.prefHasUserValue(server + "useSecAuth") &&
      !Services.prefs.prefHasUserValue(server + "auth_login")
    ) {
      continue;
    }
    if (Services.prefs.prefHasUserValue(server + "migrated")) {
      continue;
    }
    // auth_login = false => old-style auth
    // else: useSecAuth = true => "secure auth"
    // else: cleartext pw
    let auth_login = Services.prefs.getBoolPref(server + "auth_login", true);
    // old default, default pref now removed
    let useSecAuth = Services.prefs.getBoolPref(server + "useSecAuth", false);

    if (auth_login) {
      if (useSecAuth) {
        Services.prefs.setIntPref(
          server + "authMethod",
          Ci.nsMsgAuthMethod.secure
        );
      } else {
        Services.prefs.setIntPref(
          server + "authMethod",
          Ci.nsMsgAuthMethod.passwordCleartext
        );
      }
    } else {
      Services.prefs.setIntPref(server + "authMethod", Ci.nsMsgAuthMethod.old);
    }
    Services.prefs.setIntPref(server + "migrated", kServerPrefVersion);
  }

  // same again for SMTP servers
  var smtpservers = Services.prefs.getCharPref("mail.smtpservers").split(",");
  for (let i = 0; i < smtpservers.length; i++) {
    if (!smtpservers[i]) {
      continue;
    }
    let server = "mail.smtpserver." + smtpservers[i] + ".";
    if (Services.prefs.prefHasUserValue(server + "authMethod")) {
      continue;
    }
    if (
      !Services.prefs.prefHasUserValue(server + "useSecAuth") &&
      !Services.prefs.prefHasUserValue(server + "auth_method")
    ) {
      continue;
    }
    if (Services.prefs.prefHasUserValue(server + "migrated")) {
      continue;
    }
    // auth_method = 0 => no auth
    // else: useSecAuth = true => "secure auth"
    // else: cleartext pw
    let auth_method = Services.prefs.getIntPref(server + "auth_method", 1);
    let useSecAuth = Services.prefs.getBoolPref(server + "useSecAuth", false);

    if (auth_method) {
      if (useSecAuth) {
        Services.prefs.setIntPref(
          server + "authMethod",
          Ci.nsMsgAuthMethod.secure
        );
      } else {
        Services.prefs.setIntPref(
          server + "authMethod",
          Ci.nsMsgAuthMethod.passwordCleartext
        );
      }
    } else {
      Services.prefs.setIntPref(server + "authMethod", Ci.nsMsgAuthMethod.none);
    }
    Services.prefs.setIntPref(server + "migrated", kSmtpPrefVersion);
  }
}

/**
 * The address book used to contain information about whether to allow remote
 * content for a given contact. Now we use the permission manager for that.
 * Do a one-time migration for it.
 */
function MigrateABRemoteContentSettings() {
  if (Services.prefs.prefHasUserValue("mail.ab_remote_content.migrated")) {
    return;
  }

  // Search through all of our local address books looking for a match.
  for (let addrbook of MailServices.ab.directories) {
    let migrateAddress = function(aEmail) {
      let uri = Services.io.newURI(
        "chrome://messenger/content/email=" + aEmail
      );
      Services.perms.addFromPrincipal(
        Services.scriptSecurityManager.createContentPrincipal(uri, {}),
        "image",
        Services.perms.ALLOW_ACTION
      );
    };

    try {
      // If it's a read-only book, don't try to find a card as we we could never
      // have set the AllowRemoteContent property.
      if (addrbook.readOnly) {
        continue;
      }

      for (let card of addrbook.childCards) {
        if (card.getProperty("AllowRemoteContent", "0") == "0") {
          // Not allowed for this contact.
          continue;
        }

        if (card.primaryEmail) {
          migrateAddress(card.primaryEmail);
        }

        if (card.getProperty("SecondEmail", "")) {
          migrateAddress(card.getProperty("SecondEmail", ""));
        }
      }
    } catch (e) {
      console.error(e);
    }
  }

  Services.prefs.setIntPref(
    "mail.ab_remote_content.migrated",
    kABRemoteContentPrefVersion
  );
}
