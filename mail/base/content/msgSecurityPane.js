/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Functions related to the msgSecurityPane.inc.xhtml file, used in the message
 * header to display S/MIME and OpenPGP encryption and signature info.
 */

/* globals gFolderDisplay, gSignatureStatus, Enigmail, gDBView */
/* globals showImapSignatureUnknown, loadSmimeMessageSecurityInfo */

var { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);
var { MailConstants } = ChromeUtils.import(
  "resource:///modules/MailConstants.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  BondOpenPGP: "chrome://openpgp/content/BondOpenPGP.jsm",
  EnigmailConstants: "chrome://openpgp/content/modules/constants.jsm",
  EnigmailKeyRing: "chrome://openpgp/content/modules/keyRing.jsm",
  EnigmailWindows: "chrome://openpgp/content/modules/windows.jsm",
});

var gSigKeyId = null;
var gEncKeyId = null;

/**
 * Reveal message security popup panel with updated OpenPGP or S/MIME info.
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
      "bottomcenter topright",
      0,
      0,
      false
    );
}

/**
 * Resize the popup panel after all content has been loaded.
 */
function onMessageSecurityPopupShown() {
  let panel = document.getElementById("messageSecurityPanel");
  let contentHeight =
    panel.querySelector(".message-security-header").scrollHeight +
    panel.querySelector(".message-security-body").scrollHeight;

  // Keep the same width of the panel, which is defined in CSS.
  // The height is a sum between:
  // - The height of the panel body, including header and scrollable area.
  // - The height different between the panel height and the body height,
  //   multiplied by 2 in order to account for padding, margin, and border
  //   radius which can change based on the UI density settings. This is faster
  //   than getting the computed style of each element.
  panel.sizeTo(
    panel.clientWidth,
    contentHeight +
      (panel.clientHeight -
        panel.querySelector(".security-panel-body").scrollHeight) *
        2
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

  let keyList = document.getElementById("otherEncryptionKeysList");
  // Clear any possible existing key previously appended to the DOM.
  for (let node of keyList.children) {
    keyList.removeChild(node);
  }

  // Clear the previously set size.
  let popup = document.getElementById("messageSecurityPanel");
  popup.removeAttribute("height");
  popup.removeAttribute("width");
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

function viewEncryptionKey() {
  if (!gEncKeyId) {
    return;
  }

  EnigmailWindows.openKeyDetails(window, gEncKeyId, false);
}
