/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const USER_CERT_ATTRIBUTE = "usercertificate;binary";

let gEmailAddresses;
let gDirectoryPref;
let gLdapServerURL;
let gLdapConnection;
let gCertDB;
let gLdapOperation;
let gLogin;

window.addEventListener("DOMContentLoaded", onLoad);
document.addEventListener("dialogcancel", stopFetching);

/**
 * Expects the following arguments:
 * - pref name of LDAP directory to fetch from
 * - array with email addresses
 *
 * Display modal dialog with message and stop button.
 * In onload, kick off binding to LDAP.
 * When bound, kick off the searches.
 * On finding certificates, import into permanent cert database.
 * When all searches are finished, close the dialog.
 */
function onLoad() {
  gDirectoryPref = window.arguments[0];
  gEmailAddresses = window.arguments[1];

  if (!gEmailAddresses.length) {
    window.close();
    return;
  }

  setTimeout(search);
}

function search() {
  // Get the login to authenticate as, if there is one. No big deal if we don't
  // have one.
  gLogin = Services.prefs.getStringPref(gDirectoryPref + ".auth.dn", undefined);

  try {
    const url = Services.prefs.getCharPref(gDirectoryPref + ".uri");

    gLdapServerURL = Services.io.newURI(url).QueryInterface(Ci.nsILDAPURL);

    gLdapConnection = Cc["@mozilla.org/network/ldap-connection;1"]
      .createInstance()
      .QueryInterface(Ci.nsILDAPConnection);

    gLdapConnection.init(gLdapServerURL, gLogin, new BindListener());
  } catch (ex) {
    console.error(ex);
    window.close();
  }
}

function stopFetching() {
  if (gLdapOperation) {
    try {
      gLdapOperation.abandon();
    } catch (e) {}
  }
}

function importCert(ber_value) {
  if (!gCertDB) {
    gCertDB = Cc["@mozilla.org/security/x509certdb;1"].getService(
      Ci.nsIX509CertDB
    );
  }

  // ber_value has type nsILDAPBERValue
  const cert_bytes = ber_value.get();
  if (cert_bytes) {
    gCertDB.importEmailCertificate(cert_bytes, cert_bytes.length, null);
  }
}

function getLDAPOperation() {
  gLdapOperation = Cc["@mozilla.org/network/ldap-operation;1"].createInstance(
    Ci.nsILDAPOperation
  );

  gLdapOperation.init(gLdapConnection, new LDAPMessageListener(), null);
}

async function getPassword() {
  // we only need a password if we are using credentials
  if (!gLogin) {
    return null;
  }
  const authPrompter = Services.ww.getNewAuthPrompter(window);
  const strBundle = document.getElementById("bundle_ldap");
  const password = { value: "" };

  // nsLDAPAutocompleteSession uses asciiHost instead of host for the prompt
  // text, I think we should be consistent.
  if (
    await authPrompter.asyncPromptPassword(
      strBundle.getString("authPromptTitle"),
      strBundle.getFormattedString("authPromptText", [
        gLdapServerURL.asciiHost,
      ]),
      gLdapServerURL.spec,
      authPrompter.SAVE_PASSWORD_PERMANENTLY,
      password
    )
  ) {
    return password.value;
  }
  return null;
}

/**
 * Checks if the LDAP connection can be bound.
 *
 * @implements {nsILDAPMessageListener}
 */
class BindListener {
  QueryInterface = ChromeUtils.generateQI(["nsILDAPMessageListener"]);

  async onLDAPInit() {
    // Kick off bind.
    getLDAPOperation();
    gLdapOperation.simpleBind(await getPassword());
  }

  onLDAPMessage() {}

  onLDAPError(status, secInfo, location) {
    if (secInfo) {
      console.warn(`LDAP bind connection security error for ${location}`);
    } else {
      console.warn(`LDAP bind error: ${status}`);
    }
    window.close();
  }
}

/**
 * LDAPMessageListener.
 *
 * @implements {nsILDAPMessageListener}
 */
class LDAPMessageListener {
  QueryInterface = ChromeUtils.generateQI(["nsILDAPMessageListener"]);

  onLDAPInit() {}

  onLDAPMessage(message) {
    if (Ci.nsILDAPMessage.RES_SEARCH_RESULT == message.type) {
      window.close();
      return;
    }

    if (Ci.nsILDAPMessage.RES_BIND == message.type) {
      if (Ci.nsILDAPErrors.SUCCESS != message.errorCode) {
        window.close();
        return;
      }
      // Kick off search.
      let prefix1 = "";
      let suffix1 = "";

      const urlFilter = gLdapServerURL.filter;
      if (
        urlFilter != null &&
        urlFilter.length > 0 &&
        urlFilter != "(objectclass=*)"
      ) {
        if (urlFilter.startsWith("(")) {
          prefix1 = "(&" + urlFilter;
        } else {
          prefix1 = "(&(" + urlFilter + ")";
        }
        suffix1 = ")";
      }

      let prefix2 = "";
      let suffix2 = "";

      if (gEmailAddresses.length > 1) {
        prefix2 = "(|";
        suffix2 = ")";
      }

      let mailFilter = "";

      for (const email of gEmailAddresses) {
        mailFilter += "(mail=" + email + ")";
      }

      const filter = prefix1 + prefix2 + mailFilter + suffix2 + suffix1;

      // Max search results =>
      // Double number of email addresses, because each person might have
      // multiple certificates listed. We expect at most two certificates,
      // one for signing, one for encrypting.
      // Maybe that number should be larger, to allow for deployments,
      // where even more certs can be stored per user???

      const maxEntriesWanted = gEmailAddresses.length * 2;

      getLDAPOperation();
      gLdapOperation.searchExt(
        gLdapServerURL.dn,
        gLdapServerURL.scope,
        filter,
        USER_CERT_ATTRIBUTE,
        0,
        maxEntriesWanted
      );
      return;
    }

    if (Ci.nsILDAPMessage.RES_SEARCH_ENTRY == message.type) {
      let outBinValues = null;
      try {
        // This call may throw if the result message is empty or doesn't
        // contain this attribute.
        // It's an allowed condition that the attribute is missing on
        // the server, so we silently ignore a failure to obtain it.
        outBinValues = message.getBinaryValues(USER_CERT_ATTRIBUTE);
      } catch (ex) {}
      if (outBinValues) {
        for (let i = 0; i < outBinValues.length; ++i) {
          importCert(outBinValues[i]);
        }
      }
    }
  }

  /**
   * @param {nsresult} status
   * @param {?nsITransportSecurityInfo} secInfo
   * @param {?string} location
   */
  onLDAPError(status, secInfo, location) {
    if (secInfo) {
      console.warn(`LDAP connection security error for ${location}`);
    } else {
      console.warn(`LDAP error: ${status}`);
    }
    window.close();
  }
}
