/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { AccountHubStep } from "./account-hub-step.mjs";

/**
 * Account Hub Email Sync Accounts Template
 * Template ID: #accountHubEmailAutoFormTemplate (from accountHubEmailSyncAccountsFormTemplate.inc.xhtml)
 */
class EmailSyncAccountsForm extends AccountHubStep {
  connectedCallback() {
    if (this.hasConnected) {
      return;
    }

    super.connectedCallback();
    this.hasConnected = true;

    const template = document
      .getElementById("accountHubEmailSyncAccountsFormTemplate")
      .content.cloneNode(true);
    this.appendChild(template);
  }
}

customElements.define("email-sync-accounts-form", EmailSyncAccountsForm);
