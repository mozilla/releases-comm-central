/* -*- Mode: Java; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals gDBView, GetNumSelectedMessages, gFolderDisplay */
/* globals MailConstants, Enigmail */
/* global currentHeaderData: false */

var { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  BondOpenPGP: "chrome://openpgp/content/BondOpenPGP.jsm",
  EnigmailConstants: "chrome://openpgp/content/modules/constants.jsm",
  EnigmailFuncs: "chrome://openpgp/content/modules/funcs.jsm",
  EnigmailKeyRing: "chrome://openpgp/content/modules/keyRing.jsm",
  EnigmailWindows: "chrome://openpgp/content/modules/windows.jsm",
});

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

var gEncryptionStatus = -1;
var gSignatureStatus = -1;
var gSignerCert = null;
var gEncryptionCert = null;
var gSigKeyId = null;
var gEncKeyId = null;

addEventListener("load", smimeReadOnLoad, { capture: false, once: true });

function smimeReadOnLoad() {
  top.controllers.appendController(SecurityController);

  addEventListener("unload", smimeReadOnUnload, { capture: false, once: true });
}

function smimeReadOnUnload() {
  top.controllers.removeController(SecurityController);
}

function showImapSignatureUnknown() {
  let readSmimeBundle = document.getElementById("bundle_read_smime");
  let brandBundle = document.getElementById("bundle_brand");
  if (!readSmimeBundle || !brandBundle) {
    return;
  }

  if (
    Services.prompt.confirm(
      window,
      brandBundle.getString("brandShortName"),
      readSmimeBundle.getString("ImapOnDemand")
    )
  ) {
    gDBView.reloadMessageWithAllParts();
  }
}

/**
 * Reveal message security popup panel with udpated OpenPGP or S/MIME info.
 */
function showMessageReadSecurityInfo() {
  // Interrupt if no message is selected or no encryption technology was used.
  if (
    !gFolderDisplay.selectedMessage ||
    document.getElementById("cryptoBox").collapsed
  ) {
    return;
  }

  // OpenPGP.
  if (
    MailConstants.MOZ_OPENPGP &&
    BondOpenPGP.isEnabled() &&
    document.getElementById("cryptoBox").getAttribute("tech") === "OpenPGP"
  ) {
    loadOpenPgpMessageSecurityInfo();
    showMessageSecurityPanel();
    return;
  }

  // S/MIME.
  let gSignedUINode = document.getElementById("signedHdrIcon");
  if (gSignedUINode && gSignedUINode.getAttribute("signed") == "unknown") {
    showImapSignatureUnknown();
    return;
  }

  loadSmimeMessageSecurityInfo();
  showMessageSecurityPanel();
}

/**
 * Reveal the popup panel with the populated message security info.
 */
function showMessageSecurityPanel() {
  document
    .getElementById("messageSecurityPanel")
    .openPopup(
      document.getElementById("encryptionTechBtn"),
      "bottomcenter topright",
      0,
      0,
      false
    );
}

/**
 * Populate the message security popup panel with S/MIME data.
 */
function loadSmimeMessageSecurityInfo() {
  let sBundle = document.getElementById("bundle_smime_read_info");

  if (!sBundle) {
    return;
  }

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
      Cu.reportError("Unexpected gSignatureStatus: " + gSignatureStatus);
  }

  document.getElementById("techLabel").textContent = "- S/MIME";

  let signatureLabel = document.getElementById("signatureLabel");
  signatureLabel.textContent = sBundle.getString(sigInfoLabel);

  // Remove the second class to properly update the signature icon.
  signatureLabel.classList.remove(signatureLabel.classList.item(1));
  signatureLabel.classList.add(sigClass);

  if (sigInfoHeader) {
    let label = document.getElementById("signatureHeader");
    label.collapsed = false;
    label.textContent = sBundle.getString(sigInfoHeader);
  }

  let str;
  if (sigInfo) {
    str = sBundle.getString(sigInfo);
  } else if (sigInfo_clueless) {
    str = sBundle.getString("SIClueless") + " (" + gSignatureStatus + ")";
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
      Cu.reportError("Unexpected gEncryptionStatus: " + gEncryptionStatus);
  }

  let encryptionLabel = document.getElementById("encryptionLabel");
  encryptionLabel.textContent = sBundle.getString(encInfoLabel);

  // Remove the second class to properly update the encryption icon.
  encryptionLabel.classList.remove(encryptionLabel.classList.item(1));
  encryptionLabel.classList.add(encClass);

  if (encInfoHeader) {
    let label = document.getElementById("encryptionHeader");
    label.collapsed = false;
    label.textContent = sBundle.getString(encInfoHeader);
  }

  if (encInfo) {
    str = sBundle.getString(encInfo);
  } else if (encInfo_clueless) {
    str = sBundle.getString("EIClueless");
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

/**
 * Populate the message security popup panel with OpenPGP data.
 */
async function loadOpenPgpMessageSecurityInfo() {
  let sBundle = document.getElementById("bundle_smime_read_info");

  if (!sBundle) {
    return;
  }

  let hasAnySig = true;
  let sigInfoLabel = null;
  let sigInfo = null;
  let sigClass = null;

  switch (Enigmail.hdrView.msgSignatureState) {
    case EnigmailConstants.MSG_SIG_NONE:
      sigInfoLabel = "openpgp-no-sig";
      sigClass = "none";
      sigInfo = "SINone";
      hasAnySig = false;
      break;

    case EnigmailConstants.MSG_SIG_UNCERTAIN_KEY_UNAVAILABLE:
      sigInfoLabel = "openpgp-uncertain-sig";
      sigClass = "unknown";
      sigInfo = "openpgp-sig-uncertain-no-key";
      break;

    case EnigmailConstants.MSG_SIG_UNCERTAIN_UID_MISMATCH:
      sigInfoLabel = "openpgp-uncertain-sig";
      sigClass = "mismatch";
      sigInfo = "openpgp-sig-uncertain-uid-mismatch";
      break;

    case EnigmailConstants.MSG_SIG_UNCERTAIN_KEY_NOT_ACCEPTED:
      sigInfoLabel = "openpgp-uncertain-sig";
      sigClass = "unknown";
      sigInfo = "openpgp-sig-uncertain-not-accepted";
      break;

    case EnigmailConstants.MSG_SIG_INVALID_KEY_REJECTED:
      sigInfoLabel = "openpgp-invalid-sig";
      sigClass = "mismatch";
      sigInfo = "openpgp-sig-invalid-rejected";
      break;

    case EnigmailConstants.MSG_SIG_INVALID:
      sigInfoLabel = "openpgp-invalid-sig";
      sigClass = "mismatch";
      sigInfo = "openpgp-sig-invalid-technical-problem";
      break;

    case EnigmailConstants.MSG_SIG_VALID_KEY_UNVERIFIED:
      sigInfoLabel = "openpgp-good-sig";
      sigClass = "unverified";
      sigInfo = "openpgp-sig-valid-unverified";
      break;

    case EnigmailConstants.MSG_SIG_VALID_KEY_VERIFIED:
      sigInfoLabel = "openpgp-good-sig";
      sigClass = "verified";
      sigInfo = "openpgp-sig-valid-verified";
      break;

    case EnigmailConstants.MSG_SIG_VALID_SELF:
      sigInfoLabel = "openpgp-good-sig";
      sigClass = "ok";
      sigInfo = "openpgp-sig-valid-own-key";
      break;

    default:
      Cu.reportError(
        "Unexpected msgSignatureState: " + Enigmail.hdrView.msgSignatureState
      );
  }

  let signatureLabel = document.getElementById("signatureLabel");
  // eslint-disable-next-line mozilla/prefer-formatValues
  signatureLabel.textContent = await document.l10n.formatValue(sigInfoLabel);

  // Remove the second class to properly update the signature icon.
  signatureLabel.classList.remove(signatureLabel.classList.item(1));
  signatureLabel.classList.add(sigClass);

  let signatureExplanation = document.getElementById("signatureExplanation");
  signatureExplanation.textContent = hasAnySig
    ? // eslint-disable-next-line mozilla/prefer-formatValues
      await document.l10n.formatValue(sigInfo)
    : sBundle.getString(sigInfo);

  let encInfoLabel = null;
  let encInfo = null;
  let encClass = null;

  switch (Enigmail.hdrView.msgEncryptionState) {
    case EnigmailConstants.MSG_ENC_NONE:
      encInfoLabel = "EINoneLabel2";
      encInfo = "EINone";
      encClass = "none";
      break;

    case EnigmailConstants.MSG_ENC_NO_SECRET_KEY:
      encInfoLabel = "EIInvalidLabel";
      encInfo = "EIInvalidHeader";
      encClass = "notok";
      break;

    case EnigmailConstants.MSG_ENC_FAILURE:
      encInfoLabel = "EIInvalidLabel";
      encInfo = "EIClueless";
      encClass = "notok";
      break;

    case EnigmailConstants.MSG_ENC_OK:
      encInfoLabel = "EIValidLabel";
      encInfo = "EIValid";
      encClass = "ok";
      break;

    default:
      Cu.reportError(
        "Unexpected msgEncryptionState: " + Enigmail.hdrView.msgEncryptionState
      );
  }

  document.getElementById("techLabel").textContent = "- OpenPGP";

  let encryptionLabel = document.getElementById("encryptionLabel");
  encryptionLabel.textContent = sBundle.getString(encInfoLabel);

  // Remove the second class to properly update the encryption icon.
  encryptionLabel.classList.remove(encryptionLabel.classList.item(1));
  encryptionLabel.classList.add(encClass);

  document.getElementById(
    "encryptionExplanation"
  ).textContent = sBundle.getString(encInfo);

  if (Enigmail.hdrView.msgSignatureKeyId) {
    let sigKeyInfo = EnigmailKeyRing.getKeyById(
      Enigmail.hdrView.msgSignatureKeyId
    );

    document.getElementById("signatureKey").collapsed = false;

    if (sigKeyInfo && sigKeyInfo.keyId != Enigmail.hdrView.msgSignatureKeyId) {
      document.l10n.setAttributes(
        document.getElementById("signatureKeyId"),
        "openpgp-sig-key-id-with-subkey-id",
        {
          key: `0x${sigKeyInfo.keyId}`,
          subkey: `0x${Enigmail.hdrView.msgSignatureKeyId}`,
        }
      );
    } else {
      document.l10n.setAttributes(
        document.getElementById("signatureKeyId"),
        "openpgp-sig-key-id",
        {
          key: `0x${Enigmail.hdrView.msgSignatureKeyId}`,
        }
      );
    }

    if (sigKeyInfo) {
      document.getElementById("viewSignatureKey").collapsed = false;
      gSigKeyId = Enigmail.hdrView.msgSignatureKeyId;
    }
  }

  let myIdToSkipInList;
  if (
    Enigmail.hdrView.msgEncryptionKeyId &&
    Enigmail.hdrView.msgEncryptionKeyId.keyId
  ) {
    myIdToSkipInList = Enigmail.hdrView.msgEncryptionKeyId.keyId;

    // If we were given a separate primaryKeyId, it means keyId is a subkey.
    let havePrimaryId = !!Enigmail.hdrView.msgEncryptionKeyId.primaryKeyId;
    document.getElementById("encryptionKey").collapsed = false;

    if (havePrimaryId) {
      document.l10n.setAttributes(
        document.getElementById("encryptionKeyId"),
        "openpgp-enc-key-with-subkey-id",
        {
          key: `0x${Enigmail.hdrView.msgEncryptionKeyId.primaryKeyId}`,
          subkey: `0x${Enigmail.hdrView.msgEncryptionKeyId.keyId}`,
        }
      );
    } else {
      document.l10n.setAttributes(
        document.getElementById("encryptionKeyId"),
        "openpgp-enc-key-id",
        {
          key: `0x${Enigmail.hdrView.msgEncryptionKeyId.keyId}`,
        }
      );
    }

    if (EnigmailKeyRing.getKeyById(Enigmail.hdrView.msgEncryptionKeyId.keyId)) {
      document.getElementById("viewEncryptionKey").collapsed = false;
      gEncKeyId = Enigmail.hdrView.msgEncryptionKeyId.keyId;
    }
  }

  let otherLabel = document.getElementById("otherLabel");
  if (myIdToSkipInList) {
    document.l10n.setAttributes(otherLabel, "openpgp-other-enc-all-key-ids");
  } else {
    document.l10n.setAttributes(
      otherLabel,
      "openpgp-other-enc-additional-key-ids"
    );
  }

  if (!Enigmail.hdrView.msgEncryptionAllKeyIds) {
    return;
  }

  let keyList = document.getElementById("otherEncryptionKeysList");
  // Remove all the previously populated keys.
  while (keyList.lastChild) {
    keyList.removeChild(keyList.lastChild);
  }

  let showExtraKeysList = false;
  for (let key of Enigmail.hdrView.msgEncryptionAllKeyIds) {
    if (key.keyId == myIdToSkipInList) {
      continue;
    }

    let container = document.createXULElement("vbox");
    container.classList.add("other-key-row");

    let havePrimaryId2 = !!key.primaryKeyId;
    let keyInfo = EnigmailKeyRing.getKeyById(
      havePrimaryId2 ? key.primaryKeyId : key.keyId
    );

    // Use textContent for label XUl elements to enable text wrapping.
    let name = document.createXULElement("label");
    name.classList.add("openpgp-key-name");
    if (keyInfo) {
      name.textContent = keyInfo.userId;
    } else {
      document.l10n.setAttributes(name, "openpgp-other-enc-all-key-ids");
    }

    let id = document.createXULElement("label");
    id.classList.add("openpgp-key-id");
    id.textContent = havePrimaryId2
      ? ` 0x${key.primaryKeyId} (0x${key.keyId})`
      : ` 0x${key.keyId}`;

    container.appendChild(name);
    container.appendChild(id);

    keyList.appendChild(container);
    showExtraKeysList = true;
  }

  // Show extra keys if present in the message.
  document.getElementById("otherEncryptionKeys").collapsed = !showExtraKeysList;
}

function hideMessageReadSecurityInfo() {
  // Clear the variables for signature and encryption.
  gSigKeyId = null;
  gEncKeyId = null;

  // Hide the UI elements.
  document.getElementById("signatureHeader").collapsed = true;
  document.getElementById("encryptionHeader").collapsed = true;
  document.getElementById("signatureCert").collapsed = true;
  document.getElementById("signatureKey").collapsed = true;
  document.getElementById("viewSignatureKey").collapsed = true;
  document.getElementById("encryptionKey").collapsed = true;
  document.getElementById("encryptionCert").collapsed = true;
  document.getElementById("viewEncryptionKey").collapsed = true;
  document.getElementById("otherEncryptionKeys").collapsed = true;

  let keyList = document.getElementById("otherEncryptionKeysList");
  // Clear any possible existing key previously appended to the DOM.
  for (let node of keyList.children) {
    keyList.removeChild(node);
  }
}

async function viewSignatureKey() {
  if (!gSigKeyId) {
    return;
  }

  // If the signature acceptance was edited, reload the current message.
  if (await EnigmailWindows.openKeyDetails(window, gSigKeyId, false)) {
    gDBView.reloadMessageWithAllParts();
  }
}

function viewSignatureCert() {
  if (!gSignerCert) {
    return;
  }

  let url = `about:certificate?cert=${encodeURIComponent(
    gSignerCert.getBase64DERString()
  )}`;
  let mail3PaneWindow = Services.wm.getMostRecentWindow("mail:3pane");
  mail3PaneWindow.switchToTabHavingURI(url, true, {});
}

function viewEncryptionKey() {
  if (!gEncKeyId) {
    return;
  }

  EnigmailWindows.openKeyDetails(window, gEncKeyId, false);
}

function viewEncryptionCert() {
  if (!gEncryptionCert) {
    return;
  }

  let url = `about:certificate?cert=${encodeURIComponent(
    gEncryptionCert.getBase64DERString()
  )}`;
  let mail3PaneWindow = Services.wm.getMostRecentWindow("mail:3pane");
  mail3PaneWindow.switchToTabHavingURI(url, true, {});
}

var SecurityController = {
  supportsCommand(command) {
    switch (command) {
      default:
        return false;
    }
  },

  isCommandEnabled(command) {
    switch (command) {
      default:
        return false;
    }
  },
};
