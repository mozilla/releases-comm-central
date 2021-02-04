/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

var gListBox;
var gViewButton;
var gBundle;

var gCerts;

function onLoad() {
  let params = window.arguments[0];
  if (!params) {
    return;
  }

  let helper = Cc[
    "@mozilla.org/messenger-smime/smimejshelper;1"
  ].createInstance(Ci.nsISMimeJSHelper);

  gListBox = document.getElementById("infolist");
  gViewButton = document.getElementById("viewCertButton");
  gBundle = document.getElementById("bundle_smime_comp_info");

  let allow_ldap_cert_fetching =
    params.compFields.composeSecure.requireEncryptMessage;

  let emailAddresses = [];
  let certIssuedInfos = [];
  let certExpiresInfos = [];
  let certs = [];
  let canEncrypt = false;

  while (true) {
    try {
      // Out parameters - must be objects.
      let outEmailAddresses = {};
      let outCertIssuedInfos = {};
      let outCertExpiresInfos = {};
      let outCerts = {};
      let outCanEncrypt = {};
      helper.getRecipientCertsInfo(
        params.compFields,
        outEmailAddresses,
        outCertIssuedInfos,
        outCertExpiresInfos,
        outCerts,
        outCanEncrypt
      );
      // Unwrap to the actual values.
      emailAddresses = outEmailAddresses.value;
      certIssuedInfos = outCertIssuedInfos.value;
      certExpiresInfos = outCertExpiresInfos.value;
      gCerts = certs = outCerts.value;
      canEncrypt = outCanEncrypt.value;
    } catch (e) {
      dump(e);
      return;
    }

    if (!allow_ldap_cert_fetching) {
      break;
    }
    allow_ldap_cert_fetching = false;

    let missing = [];
    for (let i = 0; i < emailAddresses.length; i++) {
      if (!certs[i]) {
        missing.push(emailAddresses[i]);
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
            "chrome://messenger-smime/content/certFetchingStatus.xhtml",
            "",
            "chrome,resizable=1,modal=1,dialog=1",
            autocompleteDirectory,
            missing
          );
        }
      }
    }
  }

  let signedElement = document.getElementById("signed");
  let encryptedElement = document.getElementById("encrypted");
  if (params.compFields.composeSecure.requireEncryptMessage) {
    if (params.isEncryptionCertAvailable && canEncrypt) {
      encryptedElement.value = gBundle.getString("StatusYes");
    } else {
      encryptedElement.value = gBundle.getString("StatusNotPossible");
    }
  } else {
    encryptedElement.value = gBundle.getString("StatusNo");
  }

  if (params.compFields.composeSecure.signMessage) {
    if (params.isSigningCertAvailable) {
      signedElement.value = gBundle.getString("StatusYes");
    } else {
      signedElement.value = gBundle.getString("StatusNotPossible");
    }
  } else {
    signedElement.value = gBundle.getString("StatusNo");
  }

  for (let i = 0; i < emailAddresses.length; ++i) {
    let email = document.createXULElement("label");
    email.setAttribute("value", emailAddresses[i]);
    email.setAttribute("crop", "end");
    email.setAttribute("style", "width: var(--recipientWidth)");

    let listitem = document.createXULElement("richlistitem");
    listitem.appendChild(email);

    if (!certs[i]) {
      let notFound = document.createXULElement("label");
      notFound.setAttribute("value", gBundle.getString("StatusNotFound"));
      notFound.setAttribute("style", "width: var(--statusWidth)");
      listitem.appendChild(notFound);
    } else {
      let status = document.createXULElement("label");
      status.setAttribute("value", "?"); // temporary placeholder
      status.setAttribute("crop", "end");
      status.setAttribute("style", "width: var(--statusWidth)");
      listitem.appendChild(status);

      let issued = document.createXULElement("label");
      issued.setAttribute("value", certIssuedInfos[i]);
      issued.setAttribute("crop", "end");
      issued.setAttribute("style", "width: var(--issuedWidth)");
      listitem.appendChild(issued);

      let expire = document.createXULElement("label");
      expire.setAttribute("value", certExpiresInfos[i]);
      expire.setAttribute("crop", "end");
      expire.setAttribute("style", "width: var(--expireWidth)");
      listitem.appendChild(expire);

      asyncDetermineUsages(certs[i]).then(results => {
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
  let url = `about:certificate?cert=${encodeURIComponent(
    cert.getBase64DERString()
  )}`;
  let mail3PaneWindow = Services.wm.getMostRecentWindow("mail:3pane");
  mail3PaneWindow.switchToTabHavingURI(url, true, {});
  parent.close();
}

function certForRow(aRowIndex) {
  return gCerts[aRowIndex];
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
