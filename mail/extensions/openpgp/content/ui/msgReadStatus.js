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
  var oBundle = document.getElementById("bundle_openpgp_read_info");

  if (!sBundle || !oBundle) {
    return;
  }

  var hasAnySig = true;
  var hasAnyEnc = true;

  var sigInfoLabel = null;
  var sigInfo = null;

  switch (params.msgSignatureState) {
    case EnigmailConstants.MSG_SIG_NONE:
      sigInfoLabel = oBundle.getString("NoSig");
      sigInfo = sBundle.getString("SINone");
      hasAnySig = false;
      break;

    case EnigmailConstants.MSG_SIG_UNCERTAIN_KEY_UNAVAILABLE:
      sigInfoLabel = oBundle.getString("UncertainSig");
      sigInfo = oBundle.getString("SigUncertainNoKey");
      break;

    case EnigmailConstants.MSG_SIG_UNCERTAIN_UID_MISMATCH:
      sigInfoLabel = oBundle.getString("UncertainSig");
      sigInfo = oBundle.getString("SigUncertainUidMismatch");
      break;

    case EnigmailConstants.MSG_SIG_UNCERTAIN_KEY_NOT_ACCEPTED:
      sigInfoLabel = oBundle.getString("UncertainSig");
      sigInfo = oBundle.getString("SigUncertainNotAccepted");
      break;

    case EnigmailConstants.MSG_SIG_INVALID_KEY_REJECTED:
      sigInfoLabel = oBundle.getString("InvalidSig");
      sigInfo = oBundle.getString("SigInvalidRejected");
      break;

    case EnigmailConstants.MSG_SIG_INVALID:
      sigInfoLabel = oBundle.getString("InvalidSig");
      sigInfo = oBundle.getString("SigInvalidTechnicalProblem");
      break;

    case EnigmailConstants.MSG_SIG_VALID_KEY_UNVERIFIED:
      sigInfoLabel = oBundle.getString("GoodSig");
      sigInfo = oBundle.getString("SigValidUnverified");
      break;

    case EnigmailConstants.MSG_SIG_VALID_KEY_VERIFIED:
      sigInfoLabel = oBundle.getString("GoodSig");
      sigInfo = oBundle.getString("SigValidVerified");
      break;

    case EnigmailConstants.MSG_SIG_VALID_SELF:
      sigInfoLabel = oBundle.getString("GoodSig");
      sigInfo = oBundle.getString("SigValidOwnKey");
      break;

    default:
      Cu.reportError(
        "Unexpected msgSignatureState: " + params.msgSignatureState
      );
  }

  document.getElementById("signatureLabel").value = sigInfoLabel;
  setText("signatureExplanation", sigInfo);

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
    idElement.value = oBundle.getFormattedString("SigKeyId", [
      "0x" + params.msgSignatureKeyId,
    ]);

    if (EnigmailKeyRing.getKeyById(params.msgSignatureKeyId)) {
      document.getElementById("viewSignatureKey").collapsed = false;
      gSigKeyId = params.msgSignatureKeyId;
    }
  }

  if (params.msgEncryptionKeyId) {
    let idElement = document.getElementById("encryptionKeyId");
    idElement.collapsed = false;
    idElement.value = oBundle.getFormattedString("EncKeyId", [
      "0x" + params.msgEncryptionKeyId,
    ]);

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
