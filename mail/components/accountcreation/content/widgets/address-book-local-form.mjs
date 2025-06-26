/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { AccountHubStep } from "./account-hub-step.mjs";

/**
 * An internal collection of data for the form.
 *
 * @typedef {object} LocalAddressBookConfig
 * @property {string} name - The address book name.
 */

/**
 * Account Hub Address Book Local Account Form Template
 * Template ID: #accountHubAddressBookLocalFormTemplate
 * (from accountHubAddressBookLocalFormTemplate.inc.xhtml)
 */
class AddressBookLocalForm extends AccountHubStep {
  connectedCallback() {
    if (this.hasConnected) {
      return;
    }

    super.connectedCallback();
    this.hasConnected = true;

    const template = document
      .getElementById("accountHubAddressBookLocalFormTemplate")
      .content.cloneNode(true);
    this.appendChild(template);

    this.showBrandingHeader();
  }

  /**
   * Return the current state of the local address book form.
   *
   * @returns {LocalAddressBookConfig}
   */
  captureState() {
    return {
      name: this.querySelector("#addressBookName").value,
    };
  }

  /**
   * Resets the local address book form.
   */
  resetState() {
    this.querySelector("#localAddressBookForm").reset();
  }
}

customElements.define("address-book-local-form", AddressBookLocalForm);
