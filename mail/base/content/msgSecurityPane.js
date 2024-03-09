/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Functions related to the msgSecurityPane.inc.xhtml file, used in the message
 * header to display S/MIME and OpenPGP encryption and signature info.
 */

/* import-globals-from ../../../mailnews/extensions/smime/msgReadSMIMEOverlay.js */
/* import-globals-from ../../extensions/openpgp/content/ui/enigmailMessengerOverlay.js */
/* import-globals-from aboutMessage.js */

var { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);

ChromeUtils.defineESModuleGetters(this, {
  EnigmailConstants: "chrome://openpgp/content/modules/constants.sys.mjs",
  EnigmailKeyRing: "chrome://openpgp/content/modules/keyRing.sys.mjs",
  EnigmailWindows: "chrome://openpgp/content/modules/windows.sys.mjs",
});

var gSigKeyId = null;
var gEncKeyId = null;

/**
 * Reveal message security popup panel with updated OpenPGP or S/MIME info.
 */
function showMessageReadSecurityInfo() {
  // Interrupt if no message is selected or no encryption technology was used.
  if (!gMessage || document.getElementById("cryptoBox").hidden) {
    return;
  }

  // OpenPGP.
  if (document.getElementById("cryptoBox").getAttribute("tech") === "OpenPGP") {
    Enigmail.msg.loadOpenPgpMessageSecurityInfo();
    showMessageSecurityPanel();
    return;
  }

  // S/MIME.
  if (gSignatureStatus === Ci.nsICMSMessageErrors.VERIFY_NOT_YET_ATTEMPTED) {
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
      "bottomright topright",
      0,
      0,
      false
    );
}

/**
 * Reset all values and clear the text of the message security popup panel.
 */
function onMessageSecurityPopupHidden() {
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

  const keyList = document.getElementById("otherEncryptionKeysList");
  // Clear any possible existing key previously appended to the DOM.
  for (const node of keyList.children) {
    keyList.removeChild(node);
  }
}

async function viewSignatureKey() {
  if (!gSigKeyId) {
    return;
  }

  // If the signature acceptance was edited, reload the current message.
  if (await EnigmailWindows.openKeyDetails(window, gSigKeyId, false)) {
    ReloadMessage();
  }
}

function viewEncryptionKey() {
  if (!gEncKeyId) {
    return;
  }

  EnigmailWindows.openKeyDetails(window, gEncKeyId, false);
}
