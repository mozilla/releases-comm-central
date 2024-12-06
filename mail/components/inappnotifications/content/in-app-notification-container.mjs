/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import "./in-app-notification-button.mjs"; //eslint-disable-line import/no-unassigned-import
import "./in-app-notification-close-button.mjs"; //eslint-disable-line import/no-unassigned-import

const attrs = ["cta", "description", "heading", "url", "data-id", "type"];

/**
 * Container for in app notifications.
 * Template ID: #inAppNotificationContainerTemplate
 */
class InAppNotificationContainer extends HTMLElement {
  static observedAttributes = attrs;

  connectedCallback() {
    const detached = !this.shadowRoot;
    let template;
    let styles;
    let shadowRoot;
    if (detached) {
      template = document
        .getElementById("inAppNotificationContainerTemplate")
        .content.cloneNode(true);
      styles = document.createElement("link");
      styles.rel = "stylesheet";
      styles.href = "chrome://messenger/skin/inAppNotificationContainer.css";
      shadowRoot = this.attachShadow({ mode: "open" });

      window.MozXULElement?.insertFTLIfNeeded(
        "messenger/inAppNotifications.ftl"
      );
    }

    // While this component can be gracefully disconnected and reconnected,
    // if this actually happens any changes that would affect translations
    // will not be reflected when the component is re-connected.
    document.l10n.connectRoot(this.shadowRoot);

    if (detached) {
      shadowRoot.append(styles, template);
    }

    for (const attr of attrs) {
      this.attributeChangedCallback(attr, "", this.getAttribute(attr));
    }
  }

  disconnectedCallback() {
    document.l10n.disconnectRoot(this.shadowRoot);
  }

  attributeChangedCallback(property, oldValue, newValue) {
    if (!this.shadowRoot) {
      return;
    }
    switch (property) {
      case "url":
        if (newValue) {
          this.shadowRoot.querySelector(
            '[is="in-app-notification-button"]'
          ).href = newValue;
        } else {
          this.shadowRoot
            .querySelector('[is="in-app-notification-button"]')
            .removeAttribute("href");
        }
        break;
      case "cta":
        this.shadowRoot.querySelector(`.in-app-notification-cta`).textContent =
          newValue;
        this.shadowRoot.querySelector(
          `[is="in-app-notification-button"]`
        ).hidden = !(
          newValue &&
          newValue !== "undefined" &&
          newValue !== "null"
        );
        break;
      case "description":
      case "heading":
        this.shadowRoot.querySelector(
          `.in-app-notification-${property}`
        ).textContent = newValue;
        break;
      case "data-id":
        this.shadowRoot.querySelector(
          '[is="in-app-notification-button"]'
        ).dataset.id = newValue;
        this.shadowRoot.querySelector(
          '[is="in-app-notification-close-button"]'
        ).dataset.id = newValue;
        break;
      case "type": {
        const container = this.shadowRoot.querySelector(
          ".in-app-notification-container"
        );
        container.classList.remove(`in-app-notification-${oldValue}`);
        container.classList.add(`in-app-notification-${newValue}`);
        break;
      }
    }
  }

  /**
   * handles setting focus on the correct element when the notification is
   * focused
   */
  focus() {
    this.shadowRoot.querySelector(".in-app-notification-container").focus();
  }
}

customElements.define(
  "in-app-notification-container",
  InAppNotificationContainer
);
