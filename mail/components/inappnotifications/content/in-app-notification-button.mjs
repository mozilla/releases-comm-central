/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import { InAppNotificationEvent } from "./InAppNotificationEvent.mjs";

/**
 * Main action button for in app notifications.
 *
 * @fires ctaclick - Event when the button is clicked. The default click event
 *   is suppressed.
 */

class InAppNotificationButton extends HTMLAnchorElement {
  connectedCallback() {
    if (this.hasConnected) {
      return;
    }

    this.hasConnected = true;

    this.addEventListener("click", this, {
      capture: true,
    });
  }

  handleEvent(event) {
    switch (event.type) {
      case "click": {
        // Prevent link being handled with link click handling.
        event.preventDefault();
        event.stopPropagation();

        const newEvent = new InAppNotificationEvent(
          "ctaclick",
          event,
          this.dataset.id
        );
        // Because we had to suppress the original event, send our own.
        this.dispatchEvent(newEvent);
        break;
      }
    }
  }
}

customElements.define("in-app-notification-button", InAppNotificationButton, {
  extends: "a",
});
