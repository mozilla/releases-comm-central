/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { AccountCreationUtils } = ChromeUtils.importESModule(
  "resource:///modules/accountcreation/AccountCreationUtils.sys.mjs"
);

// TODO: Uncomment when below for close button is uncommented.
// const { MailServices } = ChromeUtils.importESModule(
//   "resource:///modules/MailServices.sys.mjs"
// );

const { gAccountSetupLogger } = AccountCreationUtils;
/**
 * Account Hub Header Template
 * Template ID: #accountHubHeaderTemplate (from accountHubHeaderTemplate.inc.xhtml)
 *
 * @fires CustomEvent#"request-close" - When close button is clicked to close dialog.
 */
class AccountHubHeader extends HTMLElement {
  /**
   * @type {?HTMLFormElement}
   */
  #notificationForm;

  /**
   * The close button for the modal.
   *
   * @type {?HTMLElement}
   */
  #closeButton;

  /**
   * The minimize button for the modal.
   *
   * @type {?HTMLElement}
   */
  #minimizeButton;

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

    this.#closeButton = this.shadowRoot.querySelector("#closeButton");
    this.#minimizeButton = this.shadowRoot.querySelector("#minimizeButton");
    // TODO: Re-enable / re-think how this will work when first time experience
    // is enabled.
    // this.#closeButton.hidden = !MailServices.accounts.accounts.length;
    this.#closeButton.addEventListener("click", () => this.#closeAccountHub());
    this.#minimizeButton.addEventListener("click", () =>
      this.#minimizeAccountHub()
    );

    this.clearNotifications();
  }

  /**
   * Show an error notification in-case something went wrong.
   *
   * @param {object} options - An options object for displaying notification.
   * @param {string} [options.description] - A raw string to show in the title.
   * @param {Error} [options.error] - An error object. Must be set if type is "error".
   * @param {string} [options.fluentTitleId] - A string representing a fluent id
   *   to localize for the title.
   * @param {object} [options.fluentTitleArguments] - Arguments for the title
   *   fluent string.
   * @param {string} [options.fluentDescriptionId] - A string representing a
   *   fluent id to localize for the description.
   * @param {string} [options.title] - A raw string to display in the description.
   * @param {"error"|"warning"|"info"|"success"} options.type - The type of notification.
   */
  showNotification({
    description,
    error,
    fluentTitleId,
    fluentTitleArguments,
    fluentDescriptionId,
    title,
    type,
  }) {
    if (type == "error") {
      gAccountSetupLogger.error(
        `Account setup error: ${error?.cause?.title || error?.message}. ${error?.cause?.text}`,
        error
      );
      if (fluentTitleId) {
        Glean.mail.accountHubError[fluentTitleId].add(1);
      }
    }

    // Hide the notification bar.
    this.clearNotifications();

    this.#notificationForm.hidden = false;
    this.#notificationForm.classList.add(type);

    // We don't ever want to have a description but not a title. This can
    // happen if all we get is an error with no cause.
    if (fluentTitleId || error?.cause?.fluentTitleId || title) {
      this.#setNotificationTitle({
        fluentTitleId,
        title,
        error,
        fluentTitleArguments,
      });
    } else if (
      description ||
      fluentDescriptionId ||
      error?.message ||
      error?.cause?.fluentDescriptionId
    ) {
      this.#setNotificationTitle({
        fluentTitleId: fluentDescriptionId || error?.cause?.fluentDescriptionId,
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
      this.shadowRoot.querySelector("#emailFormNotificationToggle").hidden =
        false;
    } else {
      this.#notificationForm.setAttribute("aria-disabled", true);
    }

    if (fluentDescriptionId || error?.cause?.fluentDescriptionId) {
      document.l10n.setAttributes(
        descriptionElement.querySelector(".localized-description"),
        fluentDescriptionId || error.cause.fluentDescriptionId
      );

      // If we have a specific Fluent id for the description, return early
      // so we don't have two descriptions.
      return;
    }

    if (description || (type == "error" && error?.message)) {
      let descriptionText = description || "";
      if (type == "error" && error?.message) {
        descriptionText += `${descriptionText ? " - " : ""}${error.message}`;
      }

      descriptionElement.querySelector(".raw-description").textContent =
        descriptionText;
    }
  }

  /**
   * Set the title of the notification
   *
   * @param {object} options
   * @param {string} [options.title] - The the raw text title of notification
   *   to be shown
   * @param {string} [options.fluentTitleId] - The fluent id to of a string to
   *   show for the title
   * @param {Error} [options.error] - error object to check for title
   * @param {object} [options.fluentTitleArguments] - Arguments for the title
   *   fluent string.
   */
  #setNotificationTitle({
    title,
    fluentTitleId,
    error,
    fluentTitleArguments = {},
  }) {
    const titleElement = this.shadowRoot.querySelector(
      "#emailFormNotificationTitle"
    );
    const localizedTitle = fluentTitleId || error?.cause?.fluentTitleId;
    if (localizedTitle) {
      document.l10n.setAttributes(
        titleElement.querySelector(".localized-title"),
        localizedTitle,
        fluentTitleArguments
      );

      // If we have a localized title, return early so we don't have two
      // titles.
      return;
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

    const localizedTitle = notificationTitle.querySelector(".localized-title");
    delete localizedTitle.dataset.l10nId;
    delete localizedTitle.dataset.l10nArgs;
    localizedTitle.textContent = "";
    delete notificationText.querySelector(".localized-description").dataset
      .l10nId;
    notificationText.querySelector(".localized-description").textContent = "";
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

  #closeAccountHub() {
    const closeEvent = new CustomEvent("request-close", {
      bubbles: true,
      composed: true,
    });
    this.dispatchEvent(closeEvent);
  }

  #minimizeAccountHub() {
    const minimizeEvent = new CustomEvent("request-toggle", {
      bubbles: true,
      composed: true,
    });
    this.dispatchEvent(minimizeEvent);
  }

  showSubheader() {
    this.shadowRoot.querySelector("#accountHubHeaderSubheader").hidden = false;
  }
}

customElements.define("account-hub-header", AccountHubHeader);
