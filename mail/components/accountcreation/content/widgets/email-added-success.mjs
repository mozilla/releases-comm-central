/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { getLazyTemplate } from "moz-src:///comm/mail/base/content/modules/TemplateLoader.mjs";
import templateMarkup from "../../templates/email-added-success.html" with { type: "text" };
import { AccountHubStep } from "./account-hub-step.mjs";

/**
 * Account Hub Email Auto Form Template
 */
class EmailAddedSuccess extends AccountHubStep {
  /** @type {DocumentFragment} */
  static template;
  static {
    getLazyTemplate(this, templateMarkup);
  }

  /**
   * The current email account.
   *
   * @type {nsIMsgAccount}
   */
  #account;

  connectedCallback() {
    if (this.hasConnected) {
      return;
    }
    this.hasConnected = true;

    super.connectedCallback();

    const template = this.ownerDocument.importNode(
      EmailAddedSuccess.template,
      true
    );
    this.appendChild(template);

    super.showBrandingHeader();

    this.querySelector(".account-hub-link-container").addEventListener(
      "click",
      this
    );
  }

  /**
   * Sets the email account for this step.
   *
   * @param {nsIMsgAccount} account - The email account created.
   */
  setState(account) {
    this.#account = account;
  }

  handleEvent(event) {
    switch (event.type) {
      case "click":
        window.MsgAccountManager(
          event.target.id === "accountHubEncryptionLink"
            ? "am-e2e.xhtml"
            : null,
          this.#account?.incomingServer
        );
        break;
    }
  }
}

customElements.define("email-added-success", EmailAddedSuccess);
