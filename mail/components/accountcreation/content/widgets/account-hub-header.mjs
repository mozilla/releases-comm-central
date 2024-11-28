/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { AccountCreationUtils } = ChromeUtils.importESModule(
  "resource:///modules/accountcreation/AccountCreationUtils.sys.mjs"
);

const { gAccountSetupLogger } = AccountCreationUtils;
/**
 * Account Hub Header Template
 * Template ID: #accountHubHeaderTemplate (from accountHubHeaderTemplate.inc.xhtml)
 */
class AccountHubHeader extends HTMLElement {
  /**
   * @type {?HTMLFormElement}
   */
  #notificationForm;

  connectedCallback() {
    if (this.shadowRoot) {
      return;
    }

    const shadowRoot = this.attachShadow({ mode: "open" });
    // Load styles in the shadowRoot so we don't leak it.
    const style = document.createElement("link");
    style.rel = "stylesheet";
    style.href = "chrome://messenger/skin/accountHub.css";
    shadowRoot.appendChild(style);

    const template = document.getElementById("accountHubHeaderTemplate");
    template.classList.add("account-hub-header");
    const clonedNode = template.content.cloneNode(true);

    this.l10n = new DOMLocalization([
      "branding/brand.ftl",
      "messenger/accountcreation/accountHub.ftl",
      "messenger/accountcreation/accountSetup.ftl",
    ]);
    this.l10n.connectRoot(shadowRoot);

    shadowRoot.append(style, clonedNode);
    this.#notificationForm = this.shadowRoot.querySelector(
      "#emailFormNotification"
    );
    this.clearNotifications();
  }

  /**
   * Show an error notification in-case something went wrong.
   *
   * @param {Object} options - An options object for displaying notification.
   * @param {string} options.description - A raw string to show in the title.
   * @param {Error} options.error - An error object.
   * @param {string} options.fluentTitleId - A string representing a fluent id
   *   to localize for the title.
   * @param {string} options.fluentDescriptionId - A string representing a
   *   fluent id to localize for the description.
   * @param {string} options.title - A raw string to displayin the description.
   * @param {string} options.type - The type of notification (error, success, info,
   *   warning).
   */
  showNotification({
    description,
    error,
    fluentTitleId,
    fluentDescriptionId,
    title,
    type,
  }) {
    if (type === "error") {
      gAccountSetupLogger.debug(
        `Status error: ${error?.cause?.title}. ${error?.cause?.text}`
      );
    }

    // Hide the notification bar.
    this.clearNotifications();

    this.#notificationForm.hidden = false;
    this.#notificationForm.classList.add(type);

    // We don't ever want to have a description but not a title. This can
    // happen if all we get is an error with no cause.
    if (fluentTitleId || error?.cause?.fluentTitleId || title) {
      this.#setNotificationTitle({ fluentTitleId, title, error });
    } else if (description || fluentDescriptionId || error?.message) {
      this.#setNotificationTitle({
        fluentTitleId: fluentDescriptionId || error.cause.fluentDescriptionId,
        title: description || error?.message,
        error,
      });

      // Return because we had no title and don't want to show the description
      // twice.
      return;
    }

    const descriptionElement = this.shadowRoot.querySelector(
      "#emailFormNotificationText"
    );

    if (description || fluentDescriptionId || error?.message) {
      this.shadowRoot.querySelector(
        "#emailFormNotificationToggle"
      ).hidden = false;
    } else {
      this.#notificationForm.setAttribute("aria-disabled", true);
    }

    if (fluentDescriptionId || error?.cause?.fluentDescriptionId) {
      document.l10n.setAttributes(
        descriptionElement.querySelector(".localized-description"),
        fluentDescriptionId || error.cause.fluentDescriptionId
      );
    }

    if (description || (type === "error" && error?.message)) {
      let descriptionText = `${description || ""}`;

      if (type === "error" && error.message) {
        descriptionText += `${descriptionText ? " - " : ""}${error.message}`;
      }

      descriptionElement.querySelector(".raw-description").textContent =
        descriptionText;
    }
  }

  /**
   * Set the title of the notification
   *
   * @param {Object} options
   * @param {string} options.title - The the raw text title of notification
   *   to be shown
   * @param {string} options.fluentTitleId - The fluent id to of a string to
   *   show for the title
   * @param {Error} options.error - error object to check for title
   */
  #setNotificationTitle({ title, fluentTitleId, error }) {
    const titleElement = this.shadowRoot.querySelector(
      "#emailFormNotificationTitle"
    );
    const localizedTitle = fluentTitleId || error?.cause?.fluentTitleId;
    if (localizedTitle) {
      document.l10n.setAttributes(
        titleElement.querySelector(".localized-title"),
        localizedTitle
      );
    }

    if (title) {
      titleElement.querySelector(".raw-title").textContent = title;
    }
  }

  /**
   * Clears the notification from the header.
   */
  clearNotifications() {
    const notificationTitle = this.shadowRoot.querySelector(
      "#emailFormNotificationTitle"
    );
    const notificationText = this.shadowRoot.querySelector(
      "#emailFormNotificationText"
    );

    delete notificationTitle.querySelector(".localized-title").dataset.l10nId;
    delete notificationText.querySelector(".localized-description").dataset
      .l10nId;
    notificationTitle.querySelector(".raw-title").textContent = "";
    notificationText.querySelector(".raw-description").textContent = "";

    this.#notificationForm.removeAttribute("aria-disabled");

    this.#notificationForm.classList.remove(
      "error",
      "success",
      "info",
      "warning"
    );
    this.#notificationForm.hidden = true;
    this.shadowRoot.querySelector("#emailFormNotificationToggle").hidden = true;
  }

  showBrandingHeader() {
    this.shadowRoot.querySelector("#brandingHeader").hidden = false;
  }
}

customElements.define("account-hub-header", AccountHubHeader);
