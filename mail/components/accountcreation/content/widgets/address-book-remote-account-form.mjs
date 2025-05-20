/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { AccountHubStep } from "./account-hub-step.mjs";

/**
 * Account Hub Address Book Remote Account Form Template
 * Template ID: #accountHubAddressBookRemoteAccountFormTemplate
 * (from accountHubAddressBookRemoteAccountFormTemplate.inc.xhtml)
 */
class AddressBookRemoteAccountForm extends AccountHubStep {
  connectedCallback() {
    if (this.hasConnected) {
      return;
    }

    super.connectedCallback();
    this.hasConnected = true;

    const template = document
      .getElementById("accountHubAddressBookRemoteAccountFormTemplate")
      .content.cloneNode(true);
    this.appendChild(template);

    this.showBrandingHeader();
  }
}

customElements.define(
  "address-book-remote-account-form",
  AddressBookRemoteAccountForm
);
