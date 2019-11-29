/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

var gListBox;
var gViewButton;
var gBundle;

var gEmailAddresses;
var gCertIssuedInfos;
var gCertExpiresInfos;
var gCerts;
var gCount;

var gSMimeContractID = "@mozilla.org/messenger-smime/smimejshelper;1";
var gISMimeJSHelper = Ci.nsISMimeJSHelper;
var gIX509Cert = Ci.nsIX509Cert;
var nsICertificateDialogs = Ci.nsICertificateDialogs;
var nsCertificateDialogs = "@mozilla.org/nsCertificateDialogs;1";

function onLoad() {
  var params = window.arguments[0];
  if (!params) {
    return;
  }

  var helper = Cc[gSMimeContractID].createInstance(gISMimeJSHelper);

  if (!helper) {
    return;
  }

  gListBox = document.getElementById("infolist");
  gViewButton = document.getElementById("viewCertButton");
  gBundle = document.getElementById("bundle_smime_comp_info");

  gEmailAddresses = {};
  gCertIssuedInfos = {};
  gCertExpiresInfos = {};
  gCerts = {};
  gCount = {};
  var canEncrypt = {};

  var allow_ldap_cert_fetching = params.smFields.requireEncryptMessage;

  while (true) {
    try {
      helper.getRecipientCertsInfo(
        params.compFields,
        gEmailAddresses,
        gCertIssuedInfos,
        gCertExpiresInfos,
        gCerts,
        canEncrypt
      );
    } catch (e) {
      dump(e);
      return;
    }

    if (!allow_ldap_cert_fetching) {
      break;
    }

    allow_ldap_cert_fetching = false;

    var missing = [];

    for (let j = gCount.value - 1; j >= 0; --j) {
      if (!gCerts.value[j]) {
        missing[missing.length] = gEmailAddresses.value[j];
      }
    }

    if (missing.length > 0) {
      var autocompleteLdap = Services.prefs.getBoolPref(
        "ldap_2.autoComplete.useDirectory"
      );

      if (autocompleteLdap) {
        var autocompleteDirectory = null;
        if (params.currentIdentity.overrideGlobalPref) {
          autocompleteDirectory = params.currentIdentity.directoryServer;
        } else {
          autocompleteDirectory = Services.prefs.getCharPref(
            "ldap_2.autoComplete.directoryServer"
          );
        }

        if (autocompleteDirectory) {
          window.openDialog(
            "chrome://messenger-smime/content/certFetchingStatus.xul",
            "",
            "chrome,resizable=1,modal=1,dialog=1",
            autocompleteDirectory,
            missing
          );
        }
      }
    }
  }

  if (gBundle) {
    var yes_string = gBundle.getString("StatusYes");
    var no_string = gBundle.getString("StatusNo");
    var not_possible_string = gBundle.getString("StatusNotPossible");

    var signed_element = document.getElementById("signed");
    var encrypted_element = document.getElementById("encrypted");

    if (params.smFields.requireEncryptMessage) {
      if (params.isEncryptionCertAvailable && canEncrypt.value) {
        encrypted_element.value = yes_string;
      } else {
        encrypted_element.value = not_possible_string;
      }
    } else {
      encrypted_element.value = no_string;
    }

    if (params.smFields.signMessage) {
      if (params.isSigningCertAvailable) {
        signed_element.value = yes_string;
      } else {
        signed_element.value = not_possible_string;
      }
    } else {
      signed_element.value = no_string;
    }
  }

  var imax = gCount.value;

  for (let i = 0; i < imax; ++i) {
    let email = document.createXULElement("label");
    email.setAttribute("value", gEmailAddresses.value[i]);
    email.setAttribute("crop", "end");
    email.setAttribute("style", "width: var(--recipientWidth)");

    let listitem = document.createXULElement("richlistitem");
    listitem.appendChild(email);

    if (!gCerts.value[i]) {
      let notFound = document.createXULElement("label");
      notFound.setAttribute("value", gBundle.getString("StatusNotFound"));
      notFound.setAttribute("style", "width: var(--statusWidth)");

      listitem.appendChild(notFound);
    } else {
      let status = document.createXULElement("label");
      status.setAttribute("value", "?"); // temporary placeholder
      status.setAttribute("crop", "end");
      status.setAttribute("style", "width: var(--statusWidth)");
      let issued = document.createXULElement("label");
      issued.setAttribute("value", gCertIssuedInfos.value[i]);
      issued.setAttribute("crop", "end");
      issued.setAttribute("style", "width: var(--issuedWidth)");
      let expire = document.createXULElement("label");
      expire.setAttribute("value", gCertExpiresInfos.value[i]);
      expire.setAttribute("crop", "end");
      expire.setAttribute("style", "width: var(--expireWidth)");

      listitem.appendChild(status);
      listitem.appendChild(issued);
      listitem.appendChild(expire);

      asyncDetermineUsages(gCerts.value[i]).then(results => {
        let someError = results.some(
          result => result.errorCode !== PRErrorCodeSuccess
        );
        if (!someError) {
          status.setAttribute("value", gBundle.getString("StatusValid"));
          return;
        }

        // Keep in sync with certViewer.js.
        const SEC_ERROR_BASE = Ci.nsINSSErrorsService.NSS_SEC_ERROR_BASE;
        const SEC_ERROR_EXPIRED_CERTIFICATE = SEC_ERROR_BASE + 11;
        const SEC_ERROR_REVOKED_CERTIFICATE = SEC_ERROR_BASE + 12;
        const SEC_ERROR_UNKNOWN_ISSUER = SEC_ERROR_BASE + 13;
        const SEC_ERROR_UNTRUSTED_ISSUER = SEC_ERROR_BASE + 20;
        const SEC_ERROR_UNTRUSTED_CERT = SEC_ERROR_BASE + 21;
        const SEC_ERROR_EXPIRED_ISSUER_CERTIFICATE = SEC_ERROR_BASE + 30;
        const SEC_ERROR_CERT_SIGNATURE_ALGORITHM_DISABLED =
          SEC_ERROR_BASE + 176;

        const errorRankings = [
          {
            error: SEC_ERROR_REVOKED_CERTIFICATE,
            bundleString: "StatusRevoked",
          },
          { error: SEC_ERROR_UNTRUSTED_CERT, bundleString: "StatusUntrusted" },
          {
            error: SEC_ERROR_UNTRUSTED_ISSUER,
            bundleString: "StatusUntrusted",
          },
          {
            error: SEC_ERROR_CERT_SIGNATURE_ALGORITHM_DISABLED,
            bundleString: "StatusInvalid",
          },
          {
            error: SEC_ERROR_EXPIRED_CERTIFICATE,
            bundleString: "StatusExpired",
          },
          {
            error: SEC_ERROR_EXPIRED_ISSUER_CERTIFICATE,
            bundleString: "StatusExpired",
          },
          { error: SEC_ERROR_UNKNOWN_ISSUER, bundleString: "StatusUntrusted" },
        ];

        let bs = "StatusInvalid";
        for (let errorRanking of errorRankings) {
          let errorPresent = results.some(
            result => result.errorCode == errorRanking.error
          );
          if (errorPresent) {
            bs = errorRanking.bundleString;
            break;
          }
        }

        status.setAttribute("value", gBundle.getString(bs));
      });
    }

    gListBox.appendChild(listitem);
  }
}

// --- borrowed from pippki.js ---
const PRErrorCodeSuccess = 0;

const certificateUsageEmailSigner = 0x0010;
const certificateUsageEmailRecipient = 0x0020;

// A map from the name of a certificate usage to the value of the usage.
const certificateUsages = {
  certificateUsageEmailRecipient,
};

function asyncDetermineUsages(cert) {
  let promises = [];
  let now = Date.now() / 1000;
  let certdb = Cc["@mozilla.org/security/x509certdb;1"].getService(
    Ci.nsIX509CertDB
  );
  Object.keys(certificateUsages).forEach(usageString => {
    promises.push(
      new Promise((resolve, reject) => {
        let usage = certificateUsages[usageString];
        certdb.asyncVerifyCertAtTime(
          cert,
          usage,
          0,
          null,
          now,
          (aPRErrorCode, aVerifiedChain, aHasEVPolicy) => {
            resolve({
              usageString,
              errorCode: aPRErrorCode,
              chain: aVerifiedChain,
            });
          }
        );
      })
    );
  });
  return Promise.all(promises);
}
// --- /borrowed from pippki.js ---

function onSelectionChange(event) {
  gViewButton.disabled = !(
    gListBox.selectedItems.length == 1 && certForRow(gListBox.selectedIndex)
  );
}

function viewCertHelper(parent, cert) {
  Services.ww.openWindow(
    parent,
    "chrome://pippki/content/certViewer.xul",
    "_blank",
    "centerscreen,chrome,titlebar",
    cert
  );
}

function certForRow(aRowIndex) {
  return gCerts.value[aRowIndex];
}

function viewSelectedCert() {
  if (!gViewButton.disabled) {
    viewCertHelper(window, certForRow(gListBox.selectedIndex));
  }
}

/* globals openHelp */
// Suite only.
function doHelpButton() {
  openHelp(
    "compose_security",
    "chrome://communicator/locale/help/suitehelp.rdf"
  );
}

function createCell(label) {
  var cell = document.createXULElement("listcell");
  cell.setAttribute("label", label);
  return cell;
}
