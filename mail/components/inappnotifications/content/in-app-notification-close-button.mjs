/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Close button for in app notifications.
 * Template ID: #inAppNotificationCloseButtonTemplate
 */

class InAppNotificationCloseButton extends HTMLButtonElement {
  connectedCallback() {
    if (!this.hasConnected) {
      this.hasConnected = true;
      const template = document
        .getElementById("inAppNotificationCloseButtonTemplate")
        .content.cloneNode(true);

      this.append(template);
    }

    window.MozXULElement?.insertFTLIfNeeded("messenger/inAppNotifications.ftl");
    document.l10n.connectRoot(this.shadowRoot);
  }

  disconnectedCallback() {
    document.l10n.disconnectRoot(this.shadowRoot);
  }
}

customElements.define(
  "in-app-notification-close-button",
  InAppNotificationCloseButton,
  { extends: "button" }
);
