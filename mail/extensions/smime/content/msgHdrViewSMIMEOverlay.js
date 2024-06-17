/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from ../../../../mailnews/extensions/smime/msgReadSMIMEOverlay.js */
/* import-globals-from ../../../base/content/aboutMessage.js */
/* import-globals-from ../../../base/content/msgHdrView.js */
/* import-globals-from ../../../base/content/msgSecurityPane.js */

// mailCommon.js
/* globals gEncryptedURIService */

/* eslint-enable valid-jsdoc */

var gMyLastEncryptedURI = null;

var gSMIMEBundle = null;

var gSignatureStatusForURI = null;
var gEncryptionStatusForURI = null;

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  EnigmailFuncs: "chrome://openpgp/content/modules/funcs.sys.mjs",
});

// Get the necko URL for the message URI.
function neckoURLForMessageURI(aMessageURI) {
  const msgSvc = MailServices.messageServiceFromURI(aMessageURI);
  const neckoURI = msgSvc.getUrlForUri(aMessageURI);
  return neckoURI.spec;
}

var gIgnoreStatusFromMimePart = null;

function setIgnoreStatusFromMimePart(mimePart) {
  gIgnoreStatusFromMimePart = mimePart;
}

/**
 * Set the cryptoBox content according to the given encryption states of the
 * displayed message. null should be passed as a state if the message does not
 * encrypted or is not signed.
 *
 * @param {string|null} tech - The name for the encryption technology in use
 *   for the message.
 * @param {"ok"|"notok"|null} encryptedState - The encrypted state of the
 *   message.
 * @param {"ok"|"notok"|"verified"|"unverified"|"unknown"|"mismatch"|null} signedState -
     The signed state of the message.
 * @param {boolean} forceShow - Show the box if unsigned and unencrypted.
 * @param {string} mimePartNumber - Should be set to the MIME part number
 *   that triggers this status update. If the value matches a currently
 *   ignored MIME part, then this function call will be ignored.
 */
function setMessageCryptoBox(
  tech,
  encryptedState,
  signedState,
  forceShow,
  mimePartNumber
) {
  if (
    !!gIgnoreStatusFromMimePart &&
    mimePartNumber == gIgnoreStatusFromMimePart
  ) {
    return;
  }

  const container = document.getElementById("cryptoBox");
  const encryptedIcon = document.getElementById("encryptedHdrIcon");
  const signedIcon = document.getElementById("signedHdrIcon");
  const button = document.getElementById("encryptionTechBtn");
  const buttonText = button.querySelector(".crypto-label");

  const hidden = !forceShow && (!tech || (!encryptedState && !signedState));
  container.hidden = hidden;
  button.hidden = hidden;
  if (hidden) {
    container.removeAttribute("tech");
    buttonText.textContent = "";
  } else {
    container.setAttribute("tech", tech);
    buttonText.textContent = tech;
  }

  if (encryptedState) {
    encryptedIcon.hidden = false;
    encryptedIcon.setAttribute(
      "src",
      `chrome://messenger/skin/icons/message-encrypted-${encryptedState}.svg`
    );
    // Set alt text.
    document.l10n.setAttributes(
      encryptedIcon,
      `openpgp-message-header-encrypted-${encryptedState}-icon`
    );
  } else {
    encryptedIcon.hidden = true;
    encryptedIcon.removeAttribute("data-l10n-id");
    encryptedIcon.removeAttribute("alt");
    encryptedIcon.removeAttribute("src");
  }

  if (signedState) {
    if (signedState === "notok") {
      // Show the same as mismatch.
      signedState = "mismatch";
    }
    signedIcon.hidden = false;
    signedIcon.setAttribute(
      "src",
      `chrome://messenger/skin/icons/message-signed-${signedState}.svg`
    );
    // Set alt text.
    document.l10n.setAttributes(
      signedIcon,
      `openpgp-message-header-signed-${signedState}-icon`
    );
  } else {
    signedIcon.hidden = true;
    signedIcon.removeAttribute("data-l10n-id");
    signedIcon.removeAttribute("alt");
    signedIcon.removeAttribute("src");
  }
}

function smimeSignedStateToString(signedState) {
  switch (signedState) {
    case -1:
      return null;
    case Ci.nsICMSMessageErrors.SUCCESS:
      return "ok";
    case Ci.nsICMSMessageErrors.VERIFY_NOT_YET_ATTEMPTED:
      return "unknown";
    case Ci.nsICMSMessageErrors.VERIFY_CERT_WITHOUT_ADDRESS:
    case Ci.nsICMSMessageErrors.VERIFY_HEADER_MISMATCH:
      return "mismatch";
    default:
      return "notok";
  }
}

function smimeEncryptedStateToString(encryptedState) {
  switch (encryptedState) {
    case -1:
      return null;
    case Ci.nsICMSMessageErrors.SUCCESS:
      return "ok";
    default:
      return "notok";
  }
}

/**
 * Refresh the cryptoBox content using the global gEncryptionStatus and
 * gSignatureStatus variables.
 *
 * @param {string} mimePartNumber - Should be set to the MIME part number
 *   that triggers this status update.
 */
function refreshSmimeMessageEncryptionStatus(mimePartNumber = undefined) {
  const signed = smimeSignedStateToString(gSignatureStatus);
  const encrypted = smimeEncryptedStateToString(gEncryptionStatus);
  setMessageCryptoBox("S/MIME", encrypted, signed, false, mimePartNumber);
}

/** @implements {nsIMsgSMIMESink} */
var smimeSink = {
  QueryInterface: ChromeUtils.generateQI(["nsIMsgSMIMESink"]),

  /**
   * @returns {?string} the URI of the selected message, or null if the current
   *   message displayed isn't in a folder, for example if the message is
   *   displayed in a separate window.
   */
  getSelectedMessageURI() {
    if (!gMessage) {
      return null;
    }
    if (!gFolder) {
      // The folder should be absent only if the message gets opened
      // from an external file (.eml), which is opened in its own window.
      // That window won't get reused for other messages. We conclude
      // the incoming status is for this window.
      // This special handling is necessary, because the necko URL for
      // separate windows that is seen by the MIME code differs from the
      // one we see here in JS.
      return null;
    }

    return neckoURLForMessageURI(gMessageURI);
  },

  /**
   * Request that security status from the given MIME part
   * shall be ignored (not shown in the UI).
   *
   * @param {string} originMimePartNumber - Ignore security status
   *   of this MIME part.
   */
  ignoreStatusFrom(originMimePartNumber) {
    setIgnoreStatusFromMimePart(originMimePartNumber);
  },

  /**
   * @param {integer} aNestingLevel - Nesting level.
   * @param {integer} aSignatureStatus - Signature status.
   * @param {nsIX509Cert} aSignerCert - Certificate of signer.
   * @param {string} aMsgNeckoURL - URL processed.
   * @param {string} aOriginMimePartNumber - The MIME part that triggered this
   *   status report.
   */
  signedStatus(
    aNestingLevel,
    aSignatureStatus,
    aSignerCert,
    aMsgNeckoURL,
    aOriginMimePartNumber
  ) {
    if (
      !!gIgnoreStatusFromMimePart &&
      aOriginMimePartNumber == gIgnoreStatusFromMimePart
    ) {
      return;
    }

    if (aNestingLevel > 1) {
      // we are not interested
      return;
    }

    if (!lazy.EnigmailFuncs.isCurrentMessage(gMessageURI, aMsgNeckoURL)) {
      // Status isn't for selected message.
      return;
    }

    if (gSignatureStatusForURI == aMsgNeckoURL) {
      // We already received a status previously for this URL.
      // Don't allow overriding an existing bad status.
      if (gSignatureStatus != Ci.nsICMSMessageErrors.SUCCESS) {
        return;
      }
    }

    gSignatureStatusForURI = aMsgNeckoURL;
    // eslint-disable-next-line no-global-assign
    gSignatureStatus = aSignatureStatus;
    gSignerCert = aSignerCert;

    refreshSmimeMessageEncryptionStatus(aOriginMimePartNumber);

    const signed = smimeSignedStateToString(aSignatureStatus);
    if (signed == "unknown" || signed == "mismatch") {
      this.showSenderIfSigner();
    }

    // For telemetry purposes.
    window.dispatchEvent(
      new CustomEvent("secureMsgLoaded", {
        detail: {
          key: "signed-smime",
          data: signed,
        },
      })
    );
  },

  /**
   * Force showing Sender if we have a Sender and it's not signed by From.
   * For a valid cert that means the Sender signed it - and the signed mismatch
   * mark is shown. To understand why it's not a confirmed signing it's useful
   * to have the Sender header showing.
   */
  showSenderIfSigner() {
    if (!("sender" in currentHeaderData)) {
      // Sender not set, or same as From (so no longer present).
      return;
    }

    if (Services.prefs.getBoolPref("mailnews.headers.showSender")) {
      // Sender header will be show due to pref - nothing more to do.
      return;
    }

    const fromMailboxes = MailServices.headerParser
      .extractHeaderAddressMailboxes(currentHeaderData.from.headerValue)
      .split(",");
    for (let i = 0; i < fromMailboxes.length; i++) {
      if (gSignerCert.containsEmailAddress(fromMailboxes[i])) {
        return; // It's signed by a From. Nothing more to do
      }
    }

    const entry = gExpandedHeaderList.find(h => h.name == "sender");
    entry.hidden = false;
    UpdateExpandedMessageHeaders();
  },

  /**
   * @param {integer} aNestingLevel - Nesting level.
   * @param {integer} aEncryptionStatus - Encryption status.
   * @param {nsIX509Cert} aRecipientCert - Certificate of recipient.
   * @param {string} aMsgNeckoURL - URL processed.
   * @param {string} aOriginMimePartNumber - The MIME part that triggered this
   *   status report.
   */
  encryptionStatus(
    aNestingLevel,
    aEncryptionStatus,
    aRecipientCert,
    aMsgNeckoURL,
    aOriginMimePartNumber
  ) {
    if (
      !!gIgnoreStatusFromMimePart &&
      aOriginMimePartNumber == gIgnoreStatusFromMimePart
    ) {
      return;
    }

    if (aNestingLevel > 1) {
      // we are not interested
      return;
    }

    if (!lazy.EnigmailFuncs.isCurrentMessage(gMessageURI, aMsgNeckoURL)) {
      // Status isn't for selected message.
      return;
    }

    if (gEncryptionStatusForURI == aMsgNeckoURL) {
      // We already received a status previously for this URL.
      // Don't allow overriding an existing bad status.
      if (gEncryptionStatus != Ci.nsICMSMessageErrors.SUCCESS) {
        return;
      }
    }

    gEncryptionStatusForURI = aMsgNeckoURL;
    // eslint-disable-next-line no-global-assign
    gEncryptionStatus = aEncryptionStatus;
    gEncryptionCert = aRecipientCert;

    refreshSmimeMessageEncryptionStatus(aOriginMimePartNumber);

    if (gEncryptedURIService) {
      // Remember the message URI and the corresponding necko URI.
      gMyLastEncryptedURI = gMessageURI;
      gEncryptedURIService.rememberEncrypted(gMyLastEncryptedURI);
      gEncryptedURIService.rememberEncrypted(
        neckoURLForMessageURI(gMyLastEncryptedURI)
      );
    }

    switch (aEncryptionStatus) {
      case Ci.nsICMSMessageErrors.SUCCESS:
      case Ci.nsICMSMessageErrors.ENCRYPT_INCOMPLETE:
        break;
      default:
        var brand = document
          .getElementById("bundle_brand")
          .getString("brandShortName");
        var title = gSMIMEBundle
          .GetStringFromName("CantDecryptTitle")
          .replace(/%brand%/g, brand);
        var body = gSMIMEBundle
          .GetStringFromName("CantDecryptBody")
          .replace(/%brand%/g, brand);

        // TODO: This should be replaced with a real page, and made not ugly.
        HideMessageHeaderPane();
        MailE10SUtils.loadURI(
          getMessagePaneBrowser(),
          "data:text/html;base64," +
            btoa(
              `<html>
              <head>
                <title>${title}</title>
              </head>
              <body>
                <h1>${title}</h1>
                ${body}
              </body>
            </html>`
            )
        );
        break;
    }

    // For telemetry purposes.
    window.dispatchEvent(
      new CustomEvent("secureMsgLoaded", {
        detail: {
          key: "encrypted-smime",
          data: smimeEncryptedStateToString(aEncryptionStatus),
        },
      })
    );
  },
};

function forgetEncryptedURI() {
  if (gMyLastEncryptedURI && gEncryptedURIService) {
    gEncryptedURIService.forgetEncrypted(gMyLastEncryptedURI);
    gEncryptedURIService.forgetEncrypted(
      neckoURLForMessageURI(gMyLastEncryptedURI)
    );
    gMyLastEncryptedURI = null;
  }
}

function onSMIMEStartHeaders() {
  // eslint-disable-next-line no-global-assign
  gEncryptionStatus = -1;
  // eslint-disable-next-line no-global-assign
  gSignatureStatus = -1;

  gSignatureStatusForURI = null;
  gEncryptionStatusForURI = null;

  gSignerCert = null;
  gEncryptionCert = null;

  setMessageCryptoBox(null, null, null, false);

  forgetEncryptedURI();
  onMessageSecurityPopupHidden();
}

function onSMIMEEndHeaders() {}

function onSmartCardChange() {
  // only reload encrypted windows
  if (gMyLastEncryptedURI && gEncryptionStatus != -1) {
    ReloadMessage();
  }
}

function onSMIMEBeforeShowHeaderPane() {
  // For signed messages with differing Sender as signer we force showing Sender.
  // If we're now in a different message, hide the (old) sender row and remove
  // it from the header view, so that Sender normally isn't shown.
  if (
    "sender" in gExpandedHeaderView &&
    !Services.prefs.getBoolPref("mailnews.headers.showSender")
  ) {
    gExpandedHeaderView.sender.enclosingRow.hidden = true;
    delete gExpandedHeaderView.sender;
  }
}

function msgHdrViewSMIMEOnLoad() {
  window.crypto.enableSmartCardEvents = true;
  document.addEventListener("smartcard-insert", onSmartCardChange);
  document.addEventListener("smartcard-remove", onSmartCardChange);
  if (!gSMIMEBundle) {
    gSMIMEBundle = Services.strings.createBundle(
      "chrome://messenger-smime/locale/msgReadSMIMEOverlay.properties"
    );
  }

  // Add ourself to the list of message display listeners so we get notified
  // when we are about to display a message.
  var listener = {};
  listener.onStartHeaders = onSMIMEStartHeaders;
  listener.onEndHeaders = onSMIMEEndHeaders;
  listener.onBeforeShowHeaderPane = onSMIMEBeforeShowHeaderPane;
  gMessageListeners.push(listener);

  // eslint-disable-next-line no-global-assign
  gEncryptedURIService = Cc[
    "@mozilla.org/messenger-smime/smime-encrypted-uris-service;1"
  ].getService(Ci.nsIEncryptedSMIMEURIsService);
}

function msgHdrViewSMIMEOnUnload() {
  window.crypto.enableSmartCardEvents = false;
  document.removeEventListener("smartcard-insert", onSmartCardChange);
  document.removeEventListener("smartcard-remove", onSmartCardChange);
  forgetEncryptedURI();
  removeEventListener("messagepane-loaded", msgHdrViewSMIMEOnLoad, true);
  removeEventListener("messagepane-unloaded", msgHdrViewSMIMEOnUnload, true);
  removeEventListener(
    "messagepane-hide",
    msgHdrViewSMIMEOnMessagePaneHide,
    true
  );
  removeEventListener(
    "messagepane-unhide",
    msgHdrViewSMIMEOnMessagePaneUnhide,
    true
  );
}

function msgHdrViewSMIMEOnMessagePaneHide() {
  setMessageCryptoBox(null, null, null, false);
}

function msgHdrViewSMIMEOnMessagePaneUnhide() {
  refreshSmimeMessageEncryptionStatus();
}

addEventListener("messagepane-loaded", msgHdrViewSMIMEOnLoad, true);
addEventListener("messagepane-unloaded", msgHdrViewSMIMEOnUnload, true);
addEventListener("messagepane-hide", msgHdrViewSMIMEOnMessagePaneHide, true);
addEventListener(
  "messagepane-unhide",
  msgHdrViewSMIMEOnMessagePaneUnhide,
  true
);
