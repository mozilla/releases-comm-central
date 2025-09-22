/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { AccountHubStep } from "./account-hub-step.mjs";

/**
 * Account Hub Email Credentials Confirmation Step.
 * Template ID: #accountHubEmailCredentialsConfirmationTemplate (from accountHubEmailCredentialsConfirmationTemplate.inc.xhtml)
 */
class EmailCredentialsConfirmation extends AccountHubStep {
  connectedCallback() {
    if (this.hasConnected) {
      return;
    }

    super.connectedCallback();
    this.hasConnected = true;

    const template = document
      .getElementById("accountHubEmailCredentialsConfirmationTemplate")
      .content.cloneNode(true);
    this.appendChild(template);

    super.showBrandingHeader();
  }

  /**
   * Updates the step with the user's credentials that are to be submitted.
   *
   * @param {object} credentials - Object containing user credentials.
   */
  setState(credentials) {
    // TODO: Actually set the state with the credentials;
    return credentials;
  }

  /**
   * Clears the credentials from the step.
   *
   */
  resetState() {}
}

customElements.define(
  "email-credentials-confirmation",
  EmailCredentialsConfirmation
);
