/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { AccountHubStep } from "./account-hub-step.mjs";

/**
 * Account Hub Account Select Template
 * Template ID: #accountHubAddressBookAccountSelectTemplate
 * (from accountHubAddressBookAccountSelectTemplate.inc.xhtml)
 */
class AddressBookAccountSelect extends AccountHubStep {
  connectedCallback() {
    if (this.hasConnected) {
      return;
    }

    super.connectedCallback();
    this.hasConnected = true;

    const template = document
      .getElementById("accountHubAddressBookAccountSelectTemplate")
      .content.cloneNode(true);
    this.appendChild(template);

    this.showBrandingHeader();
  }
}

customElements.define("address-book-account-select", AddressBookAccountSelect);
