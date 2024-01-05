/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  OTRUI: "resource:///modules/OTRUI.sys.mjs",
});

ChromeUtils.defineLazyGetter(
  lazy,
  "l10n",
  () => new Localization(["messenger/otr/otrUI.ftl"], true)
);

function _str(id) {
  return lazy.l10n.formatValueSync(id);
}

const STATE_STRING = {
  [Ci.prplIConversation.ENCRYPTION_AVAILABLE]: "not-private",
  [Ci.prplIConversation.ENCRYPTION_ENABLED]: "unverified",
  [Ci.prplIConversation.ENCRYPTION_TRUSTED]: "private",
};

export const ChatEncryption = {
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
    if (this.otrEnabled && lazy.OTRUI.enabled) {
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
    if (!conversation.isChat && this.otrEnabled && lazy.OTRUI.enabled) {
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
   * @param {IMConversation} conversation
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
      lazy.OTRUI.hideAllOTRNotifications();

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
    } else if (!conversation.isChat && lazy.OTRUI.enabled) {
      document.querySelector(".otr-start").hidden = false;
      document.querySelector(".otr-end").hidden = false;
      document.querySelector(".otr-auth").hidden = false;
      lazy.OTRUI.updateOTRButton(conversation);
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
      lazy.OTRUI.hideOTRButton();
    }
  },
  /**
   * Verify identity of a participant of buddy.
   *
   * @param {DOMWindow} window - Window that the verification dialog attaches to.
   * @param {prplIAccountBuddy|prplIConvChatBuddy} buddy - Buddy to verify.
   */
  verifyIdentity(window, buddy) {
    if (!buddy.canVerifyIdentity) {
      Promise.resolve();
    }
    buddy
      .verifyIdentity()
      .then(sessionVerification => {
        window.openDialog(
          "chrome://messenger/content/chat/verify.xhtml",
          "",
          "chrome,modal,titlebar,centerscreen",
          sessionVerification
        );
      })
      .catch(error => {
        // Only prplIAccountBuddy has a reference to the owner account.
        if (buddy.account) {
          buddy.account.prplAccount.wrappedJSObject.ERROR(error);
        } else {
          console.error(error);
        }
      });
  },
};
