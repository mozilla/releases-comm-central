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
    this.hasConnected = true;

    super.connectedCallback();

    const template = document
      .getElementById("accountHubAddressBookOptionSelectTemplate")
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
    const syncAccountsData = this.querySelector("#syncExistingAccountsData");
    const syncAccountsOption = this.querySelector("#syncExistingAccounts");
    syncAccountsOption.classList.remove("fetching");

    const addressBookCounts = accounts.reduce(
      (counter, account) => {
        counter.count += account.addressBooks.length;
        counter.existing += account.existingAddressBookCount;
        return counter;
      },
      { count: 0, existing: 0 }
    );

    syncAccountsOption.disabled =
      accounts.length === 0 ||
      addressBookCounts.count === addressBookCounts.existing;

    this.l10n.setAttributes(
      syncAccountsData,
      "account-hub-address-book-sync-option-data",
      {
        addressBooks: addressBookCounts.count - addressBookCounts.existing,
        accounts: accounts.length,
      }
    );
  }

  /**
   * Reset the state of this subview.
   */
  resetState() {
    this.l10n.setAttributes(
      this.querySelector("#syncExistingAccountsData"),
      "address-book-sync-existing-description"
    );

    this.querySelector("#syncExistingAccounts").disabled = true;
    this.querySelector("#syncExistingAccounts").classList.add("fetching");
  }
}

customElements.define("address-book-option-select", AddressBookOptionSelect);
