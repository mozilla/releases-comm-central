/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { AccountHubStep } from "./account-hub-step.mjs";

/**
 * Account Hub Address Book Option Select Template
 * Template ID: #accountHubAddressBookOptionSelectTemplate
 * (from accountHubAddressBookOptionSelectTemplate.inc.xhtml)
 */
class AddressBookOptionSelect extends AccountHubStep {
  connectedCallback() {
    if (this.hasConnected) {
      return;
    }

    super.connectedCallback();
    this.hasConnected = true;

    const template = document
      .getElementById("accountHubAddressBookOptionSelectTemplate")
      .content.cloneNode(true);
    this.appendChild(template);

    this.showBrandingHeader();
  }

  /**
   * Reset the state of this subview.
   */
  resetState() {
    return true;
  }
}

customElements.define("address-book-option-select", AddressBookOptionSelect);
