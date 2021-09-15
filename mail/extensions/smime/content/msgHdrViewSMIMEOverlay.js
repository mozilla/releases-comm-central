/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from ../../../../mailnews/extensions/smime/msgReadSMIMEOverlay.js */
/* import-globals-from ../../../base/content/folderDisplay.js */
/* import-globals-from ../../../base/content/mailWindow.js */
/* import-globals-from ../../../base/content/msgHdrView.js */

var gEncryptedURIService = null;
var gMyLastEncryptedURI = null;

var gSMIMEBundle = null;

var gSignatureStatusForURI = null;
var gEncryptionStatusForURI = null;

// Get the necko URL for the message URI.
function neckoURLForMessageURI(aMessageURI) {
  let msgSvc = Cc["@mozilla.org/messenger;1"]
    .createInstance(Ci.nsIMessenger)
    .messageServiceFromURI(aMessageURI);
  let neckoURI = msgSvc.getUrlForUri(aMessageURI);
  return neckoURI.spec;
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
 * @param {"ok"|"notok"|"verified"|"unverified"|"unknown"|"mismatch"|null}
 *   signedState - The signed state of the message.
 */
function setMessageEncryptionStateButton(tech, encryptedState, signedState) {
  let container = document.getElementById("cryptoBox");
  let encryptedIcon = document.getElementById("encryptedHdrIcon");
  let signedIcon = document.getElementById("signedHdrIcon");
  let button = document.getElementById("encryptionTechBtn");
  let buttonText = button.querySelector(".crypto-label");

  let hidden = !tech || (!encryptedState && !signedState);
  container.collapsed = hidden;
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
 */
function refreshSmimeMessageEncryptionStateButton() {
  let signed = smimeSignedStateToString(gSignatureStatus);
  let encrypted = smimeEncryptedStateToString(gEncryptionStatus);
  setMessageEncryptionStateButton("S/MIME", encrypted, signed);
}

var smimeHeaderSink = {
  maxWantedNesting() {
    return 1;
  },

  /**
   * @return the URI of the selected message, or null if the current
   *         message displayed isn't in a folder, for example if the
   *         message is displayed in a separate window.
   */
  getSelectedMessageURI() {
    if (!gFolderDisplay.selectedMessage) {
      return null;
    }
    if (!gFolderDisplay.selectedMessage.folder) {
      // The folder should be absent only if the message gets opened
      // from an external file (.eml), which is opened in its own window.
      // That window won't get reused for other messages. We conclude
      // the incoming status is for this window.
      // This special handling is necessary, because the necko URL for
      // separate windows that is seen by the MIME code differs from the
      // one we see here in JS.
      return null;
    }

    return neckoURLForMessageURI(gFolderDisplay.selectedMessageUris[0]);
  },

  signedStatus(aNestingLevel, aSignatureStatus, aSignerCert, aMsgNeckoURL) {
    if (aNestingLevel > 1) {
      // we are not interested
      return;
    }

    if (aMsgNeckoURL != this.getSelectedMessageURI()) {
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
    gSignatureStatus = aSignatureStatus;
    gSignerCert = aSignerCert;

    refreshSmimeMessageEncryptionStateButton();

    let signed = smimeSignedStateToString(aSignatureStatus);
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

    let fromMailboxes = MailServices.headerParser
      .extractHeaderAddressMailboxes(currentHeaderData.from.headerValue)
      .split(",");
    for (let i = 0; i < fromMailboxes.length; i++) {
      if (gSignerCert.containsEmailAddress(fromMailboxes[i])) {
        return; // It's signed by a From. Nothing more to do
      }
    }

    let senderInfo = { name: "sender", outputFunction: OutputEmailAddresses };
    let senderEntry = new createHeaderEntry("expanded", senderInfo);

    gExpandedHeaderView[senderInfo.name] = senderEntry;
    UpdateExpandedMessageHeaders();
  },

  encryptionStatus(
    aNestingLevel,
    aEncryptionStatus,
    aRecipientCert,
    aMsgNeckoURL
  ) {
    if (aNestingLevel > 1) {
      // we are not interested
      return;
    }

    if (aMsgNeckoURL != this.getSelectedMessageURI()) {
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
    gEncryptionStatus = aEncryptionStatus;
    gEncryptionCert = aRecipientCert;

    refreshSmimeMessageEncryptionStateButton();

    if (gEncryptedURIService) {
      // Remember the message URI and the corresponding necko URI.
      gMyLastEncryptedURI = gFolderDisplay.selectedMessageUris[0];
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
          .getString("CantDecryptTitle")
          .replace(/%brand%/g, brand);
        var body = gSMIMEBundle
          .getString("CantDecryptBody")
          .replace(/%brand%/g, brand);

        // insert our message
        msgWindow.displayHTMLInMessagePane(
          title,
          "<html>\n" +
            '<body bgcolor="#fafaee">\n' +
            "<center><br><br><br>\n" +
            "<table>\n" +
            "<tr><td>\n" +
            '<center><strong><font size="+3">\n' +
            title +
            "</font></center><br>\n" +
            body +
            "\n" +
            "</td></tr></table></center></body></html>",
          false
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

  QueryInterface: ChromeUtils.generateQI(["nsIMsgSMIMEHeaderSink"]),
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
  gEncryptionStatus = -1;
  gSignatureStatus = -1;

  gSignatureStatusForURI = null;
  gEncryptionStatusForURI = null;

  gSignerCert = null;
  gEncryptionCert = null;

  setMessageEncryptionStateButton(null, null, null);

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

function msgHdrViewSMIMEOnLoad(event) {
  window.crypto.enableSmartCardEvents = true;
  document.addEventListener("smartcard-insert", onSmartCardChange);
  document.addEventListener("smartcard-remove", onSmartCardChange);
  if (!gSMIMEBundle) {
    gSMIMEBundle = document.getElementById("bundle_read_smime");
  }

  // we want to register our security header sink as an opaque nsISupports
  // on the msgHdrSink used by mail.....
  msgWindow.msgHeaderSink.securityInfo = smimeHeaderSink;

  // Add ourself to the list of message display listeners so we get notified
  // when we are about to display a message.
  var listener = {};
  listener.onStartHeaders = onSMIMEStartHeaders;
  listener.onEndHeaders = onSMIMEEndHeaders;
  listener.onBeforeShowHeaderPane = onSMIMEBeforeShowHeaderPane;
  gMessageListeners.push(listener);

  gEncryptedURIService = Cc[
    "@mozilla.org/messenger-smime/smime-encrypted-uris-service;1"
  ].getService(Ci.nsIEncryptedSMIMEURIsService);
}

function msgHdrViewSMIMEOnUnload(event) {
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
  setMessageEncryptionStateButton(null, null, null);
}

function msgHdrViewSMIMEOnMessagePaneUnhide() {
  refreshSmimeMessageEncryptionStateButton();
}

addEventListener("messagepane-loaded", msgHdrViewSMIMEOnLoad, true);
addEventListener("messagepane-unloaded", msgHdrViewSMIMEOnUnload, true);
addEventListener("messagepane-hide", msgHdrViewSMIMEOnMessagePaneHide, true);
addEventListener(
  "messagepane-unhide",
  msgHdrViewSMIMEOnMessagePaneUnhide,
  true
);
