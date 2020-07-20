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

let myl10n = new Localization(["messenger/openpgp/msgReadStatus.ftl"], true);

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
    let sigKeyInfo = EnigmailKeyRing.getKeyById(params.msgSignatureKeyId);
    let signedBySubkey =
      sigKeyInfo && sigKeyInfo.keyId != params.msgSignatureKeyId;

    let idElement = document.getElementById("signatureKeyId");
    idElement.collapsed = false;

    if (signedBySubkey) {
      document.l10n.setAttributes(
        idElement,
        "openpgp-sig-key-id-with-subkey-id",
        {
          key: "0x" + sigKeyInfo.keyId,
          subkey: "0x" + params.msgSignatureKeyId,
        }
      );
    } else {
      document.l10n.setAttributes(idElement, "openpgp-sig-key-id", {
        key: "0x" + params.msgSignatureKeyId,
      });
    }

    if (sigKeyInfo) {
      document.getElementById("viewSignatureKey").collapsed = false;
      gSigKeyId = params.msgSignatureKeyId;
    }
  }

  let myIdToSkipInList = "";
  if (params.msgEncryptionKeyId && params.msgEncryptionKeyId.keyId) {
    myIdToSkipInList = params.msgEncryptionKeyId.keyId;

    // If we were given a separate primaryKeyId, it means that
    // keyId is a subkey.
    let havePrimaryId = !!params.msgEncryptionKeyId.primaryKeyId;
    let idElement = document.getElementById("encryptionKeyId");
    idElement.collapsed = false;

    if (havePrimaryId) {
      document.l10n.setAttributes(idElement, "openpgp-enc-key-with-subkey-id", {
        key: "0x" + params.msgEncryptionKeyId.primaryKeyId,
        subkey: "0x" + params.msgEncryptionKeyId.keyId,
      });
    } else {
      document.l10n.setAttributes(idElement, "openpgp-enc-key-id", {
        key: "0x" + params.msgEncryptionKeyId.keyId,
      });
    }

    if (EnigmailKeyRing.getKeyById(params.msgEncryptionKeyId.keyId)) {
      document.getElementById("viewEncryptionKey").collapsed = false;
      gEncKeyId = params.msgEncryptionKeyId.keyId;
    }
  }

  let otherKeysLabel = "openpgp-other-enc-all-key-ids";

  if (params.msgEncryptionAllKeyIds) {
    let list = "";
    for (let key of params.msgEncryptionAllKeyIds) {
      if (key.keyId == myIdToSkipInList) {
        continue;
      }

      let idStr = "";

      let havePrimaryId2 = !!key.primaryKeyId;
      let idForSearching = havePrimaryId2 ? key.primaryKeyId : key.keyId;

      let keyInfo = EnigmailKeyRing.getKeyById(idForSearching);
      if (keyInfo) {
        idStr += keyInfo.userId;
      } else {
        idStr += myl10n.formatValueSync("openpgp-unknown-key-id");
      }

      if (havePrimaryId2) {
        idStr += " 0x" + key.primaryKeyId + " (0x" + key.keyId + ")";
      } else {
        idStr += " 0x" + key.keyId;
      }

      if (list) {
        list += ", ";
      }
      list += idStr;
      list += "\n";
    }

    if (list) {
      document.getElementById("otherEncryptionKeys").collapsed = false;
      setText("otherEncryptionKeysList", list);
    }

    if (myIdToSkipInList) {
      otherKeysLabel = "openpgp-other-enc-additional-key-ids";
    }
  }

  setText("otherLabel", myl10n.formatValueSync(otherKeysLabel));
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
