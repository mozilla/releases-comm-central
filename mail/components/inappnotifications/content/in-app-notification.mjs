/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import "./in-app-notification-container.mjs"; //eslint-disable-line import/no-unassigned-import

/**
 * In app notification.
 * Template ID: #inAppNotificationTemplate
 */
class InAppNotification extends HTMLElement {
  /** @type {InAppNotificationContainer} */
  #container = null;

  /** @type {Notification} */
  #data = null;

  connectedCallback() {
    if (!this.shadowRoot) {
      const template = document
        .getElementById("inAppNotificationTemplate")
        .content.cloneNode(true);
      const shadowRoot = this.attachShadow({ mode: "open" });

      shadowRoot.append(template);

      this.#container = this.shadowRoot.querySelector(
        "in-app-notification-container"
      );

      // if #data is set data was set prior to the element being connected
      // use the data and update now that the element is connected.
      if (this.#data) {
        this.setNotificationData(this.#data);
      }
    }
  }

  /**
   * Handles setting focus down through the shadow root.
   */
  focus() {
    this.#container.focus();
  }

  /**
   * Takes in a notification object and translates that to attributes on the
   * notification container.
   *
   * @param {object} notification  - Notification data from the back-end.
   */
  setNotificationData(notification) {
    // If the element is not yet connected we cant set the attributes. Instead
    // save the data to use once we connect.
    this.#data = notification;
    if (!this.shadowRoot) {
      return;
    }

    const attributes = {
      CTA: "cta",
      description: "description",
      id: "data-id",
      title: "heading",
      type: "type",
      URL: "url",
    };

    for (const [key, value] of Object.entries(attributes)) {
      this.#container.setAttribute(value, notification[key]);
    }

    const positions = ["bottom-spaces-toolbar", "bottom-today-pane"];

    for (const position of positions) {
      this.classList.toggle(position, notification.position === position);
    }

    if (!positions.includes(notification.position)) {
      this.classList.add("bottom-spaces-toolbar");
    }
  }
}

customElements.define("in-app-notification", InAppNotification);
