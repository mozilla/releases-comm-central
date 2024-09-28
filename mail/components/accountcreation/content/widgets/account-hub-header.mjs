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
    this.clearNotifications();
  }

  /**
   * Show an error notification in-case something went wrong.
   *
   * @param {string} titleStringID - The ID of the fluent string that needs to
   *   be attached to the title of the notification.
   * @param {string} textStringID - The ID of the fluent string that needs to
   *   be attached to the text area of the notification.
   * @param {string} type - The type of notification (error, success, info,
   *   warning).
   */
  showErrorNotification(titleStringID, textStringID, type) {
    console.warn("TODO: Implement custom error messages");

    gAccountSetupLogger.debug(
      `Status error: ${titleStringID}. ${textStringID}`
    );

    // Hide the notification bar.
    this.clearNotifications();

    // Fetch the fluent string.
    document.l10n.setAttributes(
      this.shadowRoot.querySelector("#emailFormNotificationTitle"),
      titleStringID
    );

    this.shadowRoot.querySelector("#emailFormNotification").hidden = false;
    this.shadowRoot.querySelector("#emailFormNotification").classList.add(type);

    if (textStringID) {
      this.shadowRoot.querySelector(
        "#emailFormNotificationToggle"
      ).hidden = false;

      document.l10n.setAttributes(
        this.shadowRoot.querySelector("#emailFormNotificationText"),
        textStringID
      );
    } else {
      this.shadowRoot
        .querySelector("#emailFormNotification")
        .setAttribute("aria-disabled", true);
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
    delete notificationText.dataset.l10nId;
    delete notificationTitle.dataset.l10nId;

    this.shadowRoot
      .querySelector("#emailFormNotification")
      .removeAttribute("aria-disabled");

    this.shadowRoot
      .querySelector("#emailFormNotification")
      .classList.remove("error", "success", "info", "warning");
    this.shadowRoot.querySelector("#emailFormNotification").hidden = true;
    this.shadowRoot.querySelector("#emailFormNotificationToggle").hidden = true;
  }

  showBrandingHeader() {
    this.shadowRoot.querySelector("#brandingHeader").hidden = false;
  }
}

customElements.define("account-hub-header", AccountHubHeader);
