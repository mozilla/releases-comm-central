/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["ChatEncryption"];

const { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);
ChromeUtils.defineModuleGetter(this, "OTRUI", "resource:///modules/OTRUI.jsm");

XPCOMUtils.defineLazyGetter(
  this,
  "l10n",
  () => new Localization(["messenger/otr/otrUI.ftl"], true)
);

function _str(id) {
  return l10n.formatValueSync(id);
}

const STATE_STRING = {
  [Ci.prplIConversation.ENCRYPTION_AVAILABLE]: "not-private",
  [Ci.prplIConversation.ENCRYPTION_ENABLED]: "unverified",
  [Ci.prplIConversation.ENCRYPTION_TRUSTED]: "private",
};

const ChatEncryption = {
  /**
   * If OTR is enabled.
   *
   * @type {boolean}
   */
  get otrEnabled() {
    if (!this.hasOwnProperty("_otrEnabled")) {
      this._otrEnabled = Services.prefs.getBoolPref("chat.otr.enable");
    }
    return this._otrEnabled;
  },
  /**
   * Check if the given protocol has encryption settings for accounts.
   *
   * @param {prplIProtocol} protocol - Protocol to check against.
   * @returns {boolean} If encryption can be configured.
   */
  canConfigureEncryption(protocol) {
    if (this.otrEnabled && OTRUI.enabled) {
      return true;
    }
    return protocol.canEncrypt;
  },
  /**
   * Check if the conversation should offer encryption settings.
   *
   * @param {prplIConversation} conversation
   * @returns {boolean}
   */
  hasEncryptionActions(conversation) {
    if (!conversation.isChat && this.otrEnabled && OTRUI.enabled) {
      return true;
    }
    return (
      conversation.encryptionState !==
      Ci.prplIConversation.ENCRYPTION_NOT_SUPPORTED
    );
  },
  /**
   * Show and initialize the encryption selector in the conversation UI for the
   * given conversation, if encryption is available.
   *
   * @param {DOMDocument} document
   * @param {imIConversation} conversation
   */
  updateEncryptionButton(document, conversation) {
    if (!this.hasEncryptionActions(conversation)) {
      this.hideEncryptionButton(document);
    }
    if (
      conversation.encryptionState !==
      Ci.prplIConversation.ENCRYPTION_NOT_SUPPORTED
    ) {
      // OTR is not available if the conversation can natively encrypt
      document.querySelector(".otr-start").hidden = true;
      document.querySelector(".otr-end").hidden = true;
      document.querySelector(".otr-auth").hidden = true;
      OTRUI.hideAllNotifications();

      const actionsAvailable =
        conversation.encryptionState !==
        Ci.prplIConversation.ENCRYPTION_AVAILABLE;

      document.querySelector(".protocol-encrypt").hidden = false;
      document.querySelector(".protocol-encrypt").disabled = actionsAvailable;
      document.querySelector(".encryption-container").hidden = false;

      const trustStringLevel = STATE_STRING[conversation.encryptionState];
      const otrButton = document.querySelector(".encryption-button");
      otrButton.setAttribute(
        "tooltiptext",
        _str("state-generic-" + trustStringLevel)
      );
      otrButton.setAttribute(
        "label",
        _str("state-" + trustStringLevel + "-label")
      );
      otrButton.className = "encryption-button encryption-" + trustStringLevel;
    } else if (!conversation.isChat && OTRUI.enabled) {
      OTRUI.updateOTRButton(conversation);
      document.querySelector(".protocol-encrypt").hidden = true;
    } else {
      this.hideEncryptionButton(document);
    }
  },
  /**
   * Hide the encryption selector in the converstaion UI.
   *
   * @param {DOMDocument} document
   */
  hideEncryptionButton(document) {
    document.querySelector(".encryption-container").hidden = true;
    if (this.otrEnabled) {
      OTRUI.hideOTRButton();
    }
  },
};
