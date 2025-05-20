/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { AccountHubStep } from "./account-hub-step.mjs";

/**
 * Account Hub LDAP Account Form Template
 * Template ID: #accountHubAddressBookLdapAccountFormTemplate
 * (from accountHubAddressBookLdapAccountFormTemplate.inc.xhtml)
 */
class AddressBookLdapAccountForm extends AccountHubStep {
  connectedCallback() {
    if (this.hasConnected) {
      return;
    }

    super.connectedCallback();
    this.hasConnected = true;

    const template = document
      .getElementById("accountHubAddressBookLdapAccountFormTemplate")
      .content.cloneNode(true);
    this.appendChild(template);

    this.showBrandingHeader();
  }
}

customElements.define(
  "address-book-ldap-account-form",
  AddressBookLdapAccountForm
);
