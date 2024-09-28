/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import { InAppNotificationEvent } from "./InAppNotificationEvent.mjs";

/**
 * Close button for in app notifications.
 * Template ID: #inAppNotificationCloseButtonTemplate
 *
 * @fires notificationclose - Event when the button is clicked. Includes the
 *   id of the notification that was clicked.
 */

class InAppNotificationCloseButton extends HTMLButtonElement {
  connectedCallback() {
    if (!this.hasConnected) {
      this.hasConnected = true;
      const template = document
        .getElementById("inAppNotificationCloseButtonTemplate")
        .content.cloneNode(true);

      this.append(template);

      this.addEventListener("click", this);
    }

    window.MozXULElement?.insertFTLIfNeeded("messenger/inAppNotifications.ftl");
    document.l10n.translateFragment(this);
  }

  handleEvent(event) {
    switch (event.type) {
      case "click": {
        const newEvent = new InAppNotificationEvent(
          "notificationclose",
          event,
          this.dataset.id
        );
        this.dispatchEvent(newEvent);
        break;
      }
    }
  }
}

customElements.define(
  "in-app-notification-close-button",
  InAppNotificationCloseButton,
  { extends: "button" }
);
