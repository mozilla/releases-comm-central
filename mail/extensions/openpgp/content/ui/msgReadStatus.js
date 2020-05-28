/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

var { EnigmailConstants } = ChromeUtils.import(
  "chrome://openpgp/content/modules/constants.jsm"
);
var { EnigmailWindows } = ChromeUtils.import(
  "chrome://openpgp/content/modules/windows.jsm"
);
var { EnigmailKeyRing } = ChromeUtils.import(
  "chrome://openpgp/content/modules/keyRing.jsm"
);

let gSigKeyId;
let gEncKeyId;

function setText(id, value) {
  var element = document.getElementById(id);
  if (!element) {
    return;
  }
  if (element.hasChildNodes()) {
    element.firstElementChild.remove();
  }
  var textNode = document.createTextNode(value);
  element.appendChild(textNode);
}

/* eslint-disable complexity */
function onLoad() {
  let params = window.arguments[0];

  var sBundle = document.getElementById("bundle_smime_read_info");

  if (!sBundle) {
    return;
  }

  var hasAnySig = true;
  var hasAnyEnc = true;

  var sigInfoLabel = null;
  var sigInfo = null;

  switch (params.msgSignatureState) {
    case EnigmailConstants.MSG_SIG_NONE:
      sigInfoLabel = "openpgp-no-sig";
      sigInfo = sBundle.getString("SINone");
      hasAnySig = false;
      break;

    case EnigmailConstants.MSG_SIG_UNCERTAIN_KEY_UNAVAILABLE:
      sigInfoLabel = "openpgp-uncertain-sig";
      sigInfo = "openpgp-sig-uncertain-no-key";
      break;

    case EnigmailConstants.MSG_SIG_UNCERTAIN_UID_MISMATCH:
      sigInfoLabel = "openpgp-uncertain-sig";
      sigInfo = "openpgp-sig-uncertain-uid-mismatch";
      break;

    case EnigmailConstants.MSG_SIG_UNCERTAIN_KEY_NOT_ACCEPTED:
      sigInfoLabel = "openpgp-uncertain-sig";
      sigInfo = "openpgp-sig-uncertain-not-accepted";
      break;

    case EnigmailConstants.MSG_SIG_INVALID_KEY_REJECTED:
      sigInfoLabel = "openpgp-invalid-sig";
      sigInfo = "openpgp-sig-invalid-rejected";
      break;

    case EnigmailConstants.MSG_SIG_INVALID:
      sigInfoLabel = "openpgp-invalid-sig";
      sigInfo = "openpgp-sig-invalid-technical-problem";
      break;

    case EnigmailConstants.MSG_SIG_VALID_KEY_UNVERIFIED:
      sigInfoLabel = "openpgp-good-sig";
      sigInfo = "openpgp-sig-valid-unverified";
      break;

    case EnigmailConstants.MSG_SIG_VALID_KEY_VERIFIED:
      sigInfoLabel = "openpgp-good-sig";
      sigInfo = "openpgp-sig-valid-verified";
      break;

    case EnigmailConstants.MSG_SIG_VALID_SELF:
      sigInfoLabel = "openpgp-good-sig";
      sigInfo = "openpgp-sig-valid-own-key";
      break;

    default:
      Cu.reportError(
        "Unexpected msgSignatureState: " + params.msgSignatureState
      );
  }

  document.l10n.setAttributes(
    document.getElementById("signatureLabel"),
    sigInfoLabel
  );
  let element = document.getElementById("signatureExplanation");
  if (element.hasChildNodes()) {
    element.firstElementChild.remove();
  }
  if (hasAnySig) {
    document.l10n.setAttributes(element, sigInfo);
  } else {
    let textNode = document.createTextNode(sigInfo);
    element.appendChild(textNode);
  }

  var encInfoLabel = null;
  var encInfo = null;

  switch (params.msgEncryptionState) {
    case EnigmailConstants.MSG_ENC_NONE:
      encInfoLabel = sBundle.getString("EINoneLabel2");
      encInfo = sBundle.getString("EINone");
      hasAnyEnc = false;
      break;

    case EnigmailConstants.MSG_ENC_NO_SECRET_KEY:
      encInfoLabel = sBundle.getString("EIInvalidLabel");
      encInfo = sBundle.getString("EIInvalidHeader");
      break;

    case EnigmailConstants.MSG_ENC_FAILURE:
      encInfoLabel = sBundle.getString("EIInvalidLabel");
      encInfo = sBundle.getString("EIClueless");
      break;

    case EnigmailConstants.MSG_ENC_OK:
      encInfoLabel = sBundle.getString("EIValidLabel");
      encInfo = sBundle.getString("EIValid");
      break;

    default:
      Cu.reportError(
        "Unexpected msgEncryptionState: " + params.msgEncryptionState
      );
  }

  if (hasAnyEnc || hasAnySig) {
    document.getElementById("techLabel").collapsed = false;
  }

  document.getElementById("encryptionLabel").value = encInfoLabel;
  setText("encryptionExplanation", encInfo);

  if (params.msgSignatureKeyId) {
    let idElement = document.getElementById("signatureKeyId");
    idElement.collapsed = false;
    document.l10n.setAttributes(idElement, "openpgp-sig-key-id", {
      key: "0x" + params.msgSignatureKeyId,
    });

    if (EnigmailKeyRing.getKeyById(params.msgSignatureKeyId)) {
      document.getElementById("viewSignatureKey").collapsed = false;
      gSigKeyId = params.msgSignatureKeyId;
    }
  }

  if (params.msgEncryptionKeyId) {
    let idElement = document.getElementById("encryptionKeyId");
    idElement.collapsed = false;
    document.l10n.setAttributes(idElement, "openpgp-enc-key-id", {
      key: "0x" + params.msgEncryptionKeyId,
    });

    if (EnigmailKeyRing.getKeyById(params.msgEncryptionKeyId)) {
      document.getElementById("viewEncryptionKey").collapsed = false;
      gEncKeyId = params.msgEncryptionKeyId;
    }
  }
}
/* eslint-enable complexity */

function viewKeyHelper(keyId) {
  EnigmailWindows.openKeyDetails(window, keyId, false);
}

function viewSignatureKey() {
  if (gSigKeyId) {
    viewKeyHelper(gSigKeyId);
  }
}

function viewEncryptionKey() {
  if (gEncKeyId) {
    viewKeyHelper(gEncKeyId);
  }
}
