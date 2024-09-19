/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import "./in-app-notification-button.mjs"; //eslint-disable-line import/no-unassigned-import
import "./in-app-notification-close-button.mjs"; //eslint-disable-line import/no-unassigned-import

const attrs = ["cta", "description", "heading", "url", "data-id"];

/**
 * Container for in app notifications.
 * Template ID: #inAppNotificationContainerTemplate
 */
class InAppNotificationContainer extends HTMLElement {
  static observedAttributes = attrs;

  connectedCallback() {
    if (!this.shadowRoot) {
      const template = document
        .getElementById("inAppNotificationContainerTemplate")
        .content.cloneNode(true);
      const styles = document.createElement("link");
      styles.rel = "stylesheet";
      styles.href = "chrome://messenger/skin/inAppNotificationContainer.css";
      const shadowRoot = this.attachShadow({ mode: "open" });

      shadowRoot.append(styles, template);
    }

    for (const attr of attrs) {
      this.attributeChangedCallback(attr);
    }
  }

  attributeChangedCallback(property) {
    if (!this.shadowRoot) {
      return;
    }
    const value = this.getAttribute(property);
    switch (property) {
      case "url":
        if (value) {
          this.shadowRoot.querySelector(
            '[is="in-app-notification-button"]'
          ).href = value;
        } else {
          this.shadowRoot
            .querySelector('[is="in-app-notification-button"]')
            .removeAttribute("href");
        }
        break;
      case "cta":
      case "description":
      case "heading":
        this.shadowRoot.querySelector(
          `.in-app-notification-${property}`
        ).textContent = value;
        break;
      case "data-id":
        this.shadowRoot.querySelector(
          '[is="in-app-notification-button"]'
        ).dataset.id = value;
        this.shadowRoot.querySelector(
          '[is="in-app-notification-close-button"]'
        ).dataset.id = value;
        break;
    }
  }
}

customElements.define(
  "in-app-notification-container",
  InAppNotificationContainer
);
