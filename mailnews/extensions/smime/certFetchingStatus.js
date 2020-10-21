/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* We expect the following arguments:
   - pref name of LDAP directory to fetch from
   - array with email addresses

  Display modal dialog with message and stop button.
  In onload, kick off binding to LDAP.
  When bound, kick off the searches.
  On finding certificates, import into permanent cert database.
  When all searches are finished, close the dialog.
*/

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

var nsIX509CertDB = Ci.nsIX509CertDB;
var nsX509CertDB = "@mozilla.org/security/x509certdb;1";
var CertAttribute = "usercertificate;binary";

var gEmailAddresses;
var gDirectoryPref;
var gLdapServerURL;
var gLdapConnection;
var gCertDB;
var gLdapOperation;
var gLogin;

document.addEventListener("dialogcancel", stopFetching);

function onLoad() {
  gDirectoryPref = window.arguments[0];
  gEmailAddresses = window.arguments[1];

  if (!gEmailAddresses.length) {
    window.close();
    return;
  }

  setTimeout(search, 1);
}

function search() {
  // get the login to authenticate as, if there is one
  try {
    gLogin = Services.prefs.getStringPref(gDirectoryPref + ".auth.dn");
  } catch (ex) {
    // if we don't have this pref, no big deal
  }

  try {
    let url = Services.prefs.getCharPref(gDirectoryPref + ".uri");

    gLdapServerURL = Services.io.newURI(url).QueryInterface(Ci.nsILDAPURL);

    gLdapConnection = Cc["@mozilla.org/network/ldap-connection;1"]
      .createInstance()
      .QueryInterface(Ci.nsILDAPConnection);

    gLdapConnection.init(
      gLdapServerURL,
      gLogin,
      new boundListener(),
      null,
      Ci.nsILDAPConnection.VERSION3
    );
  } catch (ex) {
    dump(ex);
    dump(" exception creating ldap connection\n");
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
    gCertDB = Cc[nsX509CertDB].getService(nsIX509CertDB);
  }

  // ber_value has type nsILDAPBERValue
  var cert_bytes = ber_value.get();
  if (cert_bytes) {
    gCertDB.importEmailCertificate(cert_bytes, cert_bytes.length, null);
  }
}

function getLDAPOperation() {
  gLdapOperation = Cc["@mozilla.org/network/ldap-operation;1"].createInstance(
    Ci.nsILDAPOperation
  );

  gLdapOperation.init(gLdapConnection, new ldapMessageListener(), null);
}

function getPassword() {
  // we only need a password if we are using credentials
  if (gLogin) {
    let authPrompter = Services.ww.getNewAuthPrompter(window);
    let strBundle = document.getElementById("bundle_ldap");
    let password = { value: "" };

    // nsLDAPAutocompleteSession uses asciiHost instead of host for the prompt text, I think we should be
    // consistent.
    if (
      authPrompter.promptPassword(
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
  }

  return null;
}

function kickOffBind() {
  try {
    getLDAPOperation();
    gLdapOperation.simpleBind(getPassword());
  } catch (e) {
    window.close();
  }
}

function kickOffSearch() {
  try {
    var prefix1 = "";
    var suffix1 = "";

    var urlFilter = gLdapServerURL.filter;

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

    var prefix2 = "";
    var suffix2 = "";

    if (gEmailAddresses.length > 1) {
      prefix2 = "(|";
      suffix2 = ")";
    }

    var mailFilter = "";

    for (var i = 0; i < gEmailAddresses.length; ++i) {
      mailFilter += "(mail=" + gEmailAddresses[i] + ")";
    }

    var filter = prefix1 + prefix2 + mailFilter + suffix2 + suffix1;

    var wanted_attributes = CertAttribute;

    // Max search results =>
    // Double number of email addresses, because each person might have
    // multiple certificates listed. We expect at most two certificates,
    // one for signing, one for encrypting.
    // Maybe that number should be larger, to allow for deployments,
    // where even more certs can be stored per user???

    var maxEntriesWanted = gEmailAddresses.length * 2;

    getLDAPOperation();
    gLdapOperation.searchExt(
      gLdapServerURL.dn,
      gLdapServerURL.scope,
      filter,
      wanted_attributes,
      0,
      maxEntriesWanted
    );
  } catch (e) {
    window.close();
  }
}

function boundListener() {}

boundListener.prototype.QueryInterface = ChromeUtils.generateQI([
  "nsILDAPMessageListener",
]);

boundListener.prototype.onLDAPMessage = function(aMessage) {};

boundListener.prototype.onLDAPInit = function(aConn, aStatus) {
  kickOffBind();
};

boundListener.prototype.onLDAPError = function(aStatus, aSecInfo, location) {
  window.close();
};

function ldapMessageListener() {}

ldapMessageListener.prototype.QueryInterface = ChromeUtils.generateQI([
  "nsILDAPMessageListener",
]);

ldapMessageListener.prototype.onLDAPMessage = function(aMessage) {
  if (Ci.nsILDAPMessage.RES_SEARCH_RESULT == aMessage.type) {
    window.close();
    return;
  }

  if (Ci.nsILDAPMessage.RES_BIND == aMessage.type) {
    if (Ci.nsILDAPErrors.SUCCESS != aMessage.errorCode) {
      window.close();
    } else {
      kickOffSearch();
    }
    return;
  }

  if (Ci.nsILDAPMessage.RES_SEARCH_ENTRY == aMessage.type) {
    try {
      var outBinValues = aMessage.getBinaryValues(CertAttribute);

      for (let i = 0; i < outBinValues.length; ++i) {
        importCert(outBinValues[i]);
      }
    } catch (e) {}
  }
};

ldapMessageListener.prototype.onLDAPInit = function(aConn, aStatus) {};
