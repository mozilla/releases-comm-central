/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from ../../../mail/base/content/aboutMessage.js */

var gEncryptionStatus = -1;
var gSignatureStatus = -1;
var gSignerCert = null;
var gEncryptionCert = null;

function showImapSignatureUnknown() {
  const readSmimeBundle = Services.strings.createBundle(
    "chrome://messenger-smime/locale/msgReadSMIMEOverlay.properties"
  );
  const brandBundle = document.getElementById("bundle_brand");
  if (!readSmimeBundle || !brandBundle) {
    return;
  }

  if (
    Services.prompt.confirm(
      window,
      brandBundle.getString("brandShortName"),
      readSmimeBundle.GetStringFromName("ImapOnDemand")
    )
  ) {
    gDBView.reloadMessageWithAllParts();
  }
}

/**
 * Populate the message security popup panel with S/MIME data.
 */
function loadSmimeMessageSecurityInfo() {
  const sBundle = Services.strings.createBundle(
    "chrome://messenger-smime/locale/msgSecurityInfo.properties"
  );

  let sigInfoLabel = null;
  let sigInfoHeader = null;
  let sigInfo = null;
  let sigInfo_clueless = false;
  let sigClass = null;

  switch (gSignatureStatus) {
    case -1:
    case Ci.nsICMSMessageErrors.VERIFY_NOT_SIGNED:
      sigInfoLabel = "SINoneLabel";
      sigInfo = "SINone";
      sigClass = "none";
      break;

    case Ci.nsICMSMessageErrors.SUCCESS:
      sigInfoLabel = "SIValidLabel";
      sigInfo = "SIValid";
      sigClass = "ok";
      break;

    case Ci.nsICMSMessageErrors.VERIFY_BAD_SIGNATURE:
    case Ci.nsICMSMessageErrors.VERIFY_DIGEST_MISMATCH:
      sigInfoLabel = "SIInvalidLabel";
      sigInfoHeader = "SIInvalidHeader";
      sigInfo = "SIContentAltered";
      sigClass = "mismatch";
      break;

    case Ci.nsICMSMessageErrors.VERIFY_UNKNOWN_ALGO:
    case Ci.nsICMSMessageErrors.VERIFY_UNSUPPORTED_ALGO:
      sigInfoLabel = "SIInvalidLabel";
      sigInfoHeader = "SIInvalidHeader";
      sigInfo = "SIInvalidCipher";
      sigClass = "unknown";
      break;

    case Ci.nsICMSMessageErrors.VERIFY_HEADER_MISMATCH:
      sigInfoLabel = "SIPartiallyValidLabel";
      sigInfoHeader = "SIPartiallyValidHeader";
      sigInfo = "SIHeaderMismatch";
      sigClass = "mismatch";
      break;

    case Ci.nsICMSMessageErrors.VERIFY_CERT_WITHOUT_ADDRESS:
      sigInfoLabel = "SIPartiallyValidLabel";
      sigInfoHeader = "SIPartiallyValidHeader";
      sigInfo = "SICertWithoutAddress";
      sigClass = "unknown";
      break;

    case Ci.nsICMSMessageErrors.VERIFY_UNTRUSTED:
      sigInfoLabel = "SIInvalidLabel";
      sigInfoHeader = "SIInvalidHeader";
      sigInfo = "SIUntrustedCA";
      sigClass = "notok";
      // XXX Need to extend to communicate better errors
      // might also be:
      // SIExpired SIRevoked SINotYetValid SIUnknownCA SIExpiredCA SIRevokedCA SINotYetValidCA
      break;

    case Ci.nsICMSMessageErrors.VERIFY_NOT_YET_ATTEMPTED:
    case Ci.nsICMSMessageErrors.GENERAL_ERROR:
    case Ci.nsICMSMessageErrors.VERIFY_NO_CONTENT_INFO:
    case Ci.nsICMSMessageErrors.VERIFY_BAD_DIGEST:
    case Ci.nsICMSMessageErrors.VERIFY_NOCERT:
    case Ci.nsICMSMessageErrors.VERIFY_ERROR_UNVERIFIED:
    case Ci.nsICMSMessageErrors.VERIFY_ERROR_PROCESSING:
    case Ci.nsICMSMessageErrors.VERIFY_MALFORMED_SIGNATURE:
      sigInfoLabel = "SIInvalidLabel";
      sigInfoHeader = "SIInvalidHeader";
      sigInfo_clueless = true;
      sigClass = "unverified";
      break;
    default:
      console.error("Unexpected gSignatureStatus: " + gSignatureStatus);
  }

  document.getElementById("techLabel").textContent = "- S/MIME";

  const signatureLabel = document.getElementById("signatureLabel");
  signatureLabel.textContent = sBundle.GetStringFromName(sigInfoLabel);

  // Remove the second class to properly update the signature icon.
  signatureLabel.classList.remove(signatureLabel.classList.item(1));
  signatureLabel.classList.add(sigClass);

  if (sigInfoHeader) {
    const label = document.getElementById("signatureHeader");
    label.collapsed = false;
    label.textContent = sBundle.GetStringFromName(sigInfoHeader);
  }

  let str;
  if (sigInfo) {
    str = sBundle.GetStringFromName(sigInfo);
  } else if (sigInfo_clueless) {
    str =
      sBundle.GetStringFromName("SIClueless") + " (" + gSignatureStatus + ")";
  }
  document.getElementById("signatureExplanation").textContent = str;

  let encInfoLabel = null;
  let encInfoHeader = null;
  let encInfo = null;
  let encInfo_clueless = false;
  let encClass = null;

  switch (gEncryptionStatus) {
    case -1:
      encInfoLabel = "EINoneLabel2";
      encInfo = "EINone";
      encClass = "none";
      break;

    case Ci.nsICMSMessageErrors.SUCCESS:
      encInfoLabel = "EIValidLabel";
      encInfo = "EIValid";
      encClass = "ok";
      break;

    case Ci.nsICMSMessageErrors.ENCRYPT_INCOMPLETE:
      encInfoLabel = "EIInvalidLabel";
      encInfo = "EIContentAltered";
      encClass = "notok";
      break;

    case Ci.nsICMSMessageErrors.GENERAL_ERROR:
      encInfoLabel = "EIInvalidLabel";
      encInfoHeader = "EIInvalidHeader";
      encInfo_clueless = 1;
      encClass = "notok";
      break;
    default:
      console.error("Unexpected gEncryptionStatus: " + gEncryptionStatus);
  }

  const encryptionLabel = document.getElementById("encryptionLabel");
  encryptionLabel.textContent = sBundle.GetStringFromName(encInfoLabel);

  // Remove the second class to properly update the encryption icon.
  encryptionLabel.classList.remove(encryptionLabel.classList.item(1));
  encryptionLabel.classList.add(encClass);

  if (encInfoHeader) {
    const label = document.getElementById("encryptionHeader");
    label.collapsed = false;
    label.textContent = sBundle.GetStringFromName(encInfoHeader);
  }

  if (encInfo) {
    str = sBundle.GetStringFromName(encInfo);
  } else if (encInfo_clueless) {
    str = sBundle.GetStringFromName("EIClueless");
  }
  document.getElementById("encryptionExplanation").textContent = str;

  if (gSignerCert) {
    document.getElementById("signatureCert").collapsed = false;
    if (gSignerCert.subjectName) {
      document.getElementById("signedBy").textContent = gSignerCert.commonName;
    }
    if (gSignerCert.emailAddress) {
      document.getElementById("signerEmail").textContent =
        gSignerCert.emailAddress;
    }
    if (gSignerCert.issuerName) {
      document.getElementById("sigCertIssuedBy").textContent =
        gSignerCert.issuerCommonName;
    }
  }

  if (gEncryptionCert) {
    document.getElementById("encryptionCert").collapsed = false;
    if (gEncryptionCert.subjectName) {
      document.getElementById("encryptedFor").textContent =
        gEncryptionCert.commonName;
    }
    if (gEncryptionCert.emailAddress) {
      document.getElementById("recipientEmail").textContent =
        gEncryptionCert.emailAddress;
    }
    if (gEncryptionCert.issuerName) {
      document.getElementById("encCertIssuedBy").textContent =
        gEncryptionCert.issuerCommonName;
    }
  }
}

function viewSignatureCert() {
  if (!gSignerCert) {
    return;
  }

  const url = `about:certificate?cert=${encodeURIComponent(
    gSignerCert.getBase64DERString()
  )}`;
  const mail3PaneWindow = Services.wm.getMostRecentWindow("mail:3pane");
  mail3PaneWindow.switchToTabHavingURI(url, true, {});
}

function viewEncryptionCert() {
  if (!gEncryptionCert) {
    return;
  }

  const url = `about:certificate?cert=${encodeURIComponent(
    gEncryptionCert.getBase64DERString()
  )}`;
  const mail3PaneWindow = Services.wm.getMostRecentWindow("mail:3pane");
  mail3PaneWindow.switchToTabHavingURI(url, true, {});
}
