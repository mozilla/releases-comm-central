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
    this.hasConnected = true;

    super.connectedCallback();

    const template = document
      .getElementById("accountHubAddressBookAccountSelectTemplate")
      .content.cloneNode(true);
    this.appendChild(template);

    this.showBrandingHeader();
  }

  /**
   * @typedef {object} AddressBookAccounts
   * @property {nsIMsgAccount} account - A user account.
   * @property {foundBook[]} addressBooks - Address books linked to the user
   *  account.
   * @property {number} existingAddressBookCount - Already synced address books
   *  count.
   */

  /**
   * @typedef {object} foundBook
   * @property {URL} url - The address for this address book.
   * @property {string} name - The name of this address book on the server.
   * @property {Function} create - A callback to add this address book locally.
   * @property {boolean} existing - Address book has already been synced.
   */

  /**
   * Updates the sync accounts option to show accounts that have address books
   * available. If no address books available, disable sync accounts option.
   *
   * @param {AddressBookAccounts[]} accounts - Object containing user account,
   *  address book, and existing address books synced count.
   */
  setState(accounts) {
    const accountListElement = this.querySelector("#accountSelectOptions");
    const buttons = [];
    accountListElement.replaceChildren();

    for (const abAccount of accounts) {
      const button = document.createElement("button");
      button.name = "email";
      button.value = abAccount.account.incomingServer.username;
      button.classList.add("account-hub-option-button", "three-column");

      const icon = document.createElement("img");
      icon.classList.add("mail-lock-icon");
      button.appendChild(icon);

      const titleText = document.createElement("span");
      titleText.classList.add("option-title", "account-title");
      titleText.textContent = abAccount.account.defaultIdentity.fullName;
      button.appendChild(titleText);

      const dataText = document.createElement("span");
      dataText.classList.add("option-data", "account-data");
      dataText.textContent = abAccount.account.incomingServer.username;
      button.appendChild(dataText);

      const counter = document.createElement("span");
      counter.classList.add("account-address-book-count");
      this.l10n.setAttributes(
        counter,
        "account-hub-account-address-book-count",
        {
          synced: abAccount.existingAddressBookCount,
          available:
            abAccount.addressBooks.length - abAccount.existingAddressBookCount,
          total: abAccount.addressBooks.length,
        }
      );
      button.appendChild(counter);

      button.disabled =
        abAccount.addressBooks.length === abAccount.existingAddressBookCount;
      buttons.push(button);
    }

    accountListElement.replaceChildren(...buttons);
  }
}

customElements.define("address-book-account-select", AddressBookAccountSelect);
