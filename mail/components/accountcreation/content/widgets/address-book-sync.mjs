/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { AccountHubStep } from "./account-hub-step.mjs";

/**
 * Account Hub Address Book Sync Template
 * Template ID: #accountHubAddressBookSyncTemplate
 * (from accountHubAddressBookSyncTemplate.inc.xhtml)
 */
class AddressBookSync extends AccountHubStep {
  /**
   * Array of address book objects.
   *
   * @type {object[]}
   */
  #availableAddressBooks = [];

  /**
   * Element containing text for address book selected count.
   *
   * @type {HTMLElement}
   */
  #selectedAddressBooks;

  /**
   * Select all address books button.
   *
   * @type {HTMLButtonElement}
   */
  #selectAllAddressBooks;

  /**
   * The current count of address books selected.
   *
   * @type {object}
   */
  counter = { addressBooks: 0 };

  /**
   * Updates counter and updates the fluent strings associated with the
   * counter.
   *
   * @type {Proxy}
   */
  counterObserver;

  connectedCallback() {
    if (this.hasConnected) {
      return;
    }

    super.connectedCallback();
    this.hasConnected = true;

    const template = document
      .getElementById("accountHubAddressBookSyncTemplate")
      .content.cloneNode(true);
    this.appendChild(template);

    this.showBrandingHeader();
    this.#selectedAddressBooks = this.querySelector("#selectedAddressBooks");
    this.#selectAllAddressBooks = this.querySelector("#selectAllAddressBooks");
    this.#selectAllAddressBooks.addEventListener("click", this);
    this.querySelector("#addressBookSyncForm").addEventListener("change", this);

    this.counterObserver = new Proxy(this.counter, {
      set: (counter, key, count) => {
        counter[key] = count;
        this.observeAddressBookCounter(count);
        return true;
      },
    });
  }

  handleEvent(event) {
    switch (event.type) {
      case "click":
        this.#toggleSelectAllInputs();
        break;
      case "change":
        this.counterObserver.addressBooks += event.target.checked ? 1 : -1;
        break;
      default:
        break;
    }
  }

  /**
   * Sets the list address books ready to be synced.
   *
   * @param {Array} addressBooks - The sync accounts for the user.
   */
  setState(addressBooks) {
    this.resetState();
    this.#availableAddressBooks = addressBooks;
    this.counterObserver.addressBooks = addressBooks.length;

    // Create the address book inputs.
    for (const addressBook of addressBooks) {
      this.querySelector("#addressBookAccountsContainer").append(
        this.#createInput(addressBook)
      );
    }
  }

  /**
   * Returns the selected address books.
   *
   * @returns {Array} The address books selected.
   */
  captureState() {
    const checkedAddressBookUrls = Array.from(
      this.querySelectorAll("#addressBooks input:checked:enabled"),
      checkedAddressBook => checkedAddressBook.dataset.url
    );

    return this.#availableAddressBooks.filter(addressBook =>
      checkedAddressBookUrls.includes(addressBook.url.href)
    );
  }

  /**
   * Removes all of the input labels.
   */
  resetState() {
    this.querySelectorAll("label").forEach(label => label.remove());
  }

  /**
   * Creates the label and checkbox input for an address book.
   *
   * @param {object} addressBook - A syncable account.
   * @returns {HTMLElement} The account label with the checkbox input.
   */
  #createInput(addressBook) {
    const label = document.createElement("label");
    label.classList.add("toggle-container-with-text", "sync-option");
    const input = document.createElement("input");
    input.classList.add("check-button", "address-book-input");
    const uuid = Services.uuid.generateUUID().toString().replace(/[{}]/g, "");
    input.id =
      addressBook.name
        .toLowerCase()
        .replace(/[^a-zA-Z0-9]+(.)/g, (m, chr) => chr.toUpperCase()) + uuid;
    input.type = "checkbox";
    input.checked = true;
    input.disabled = addressBook.existing;
    input.dataset.url = addressBook.url.href;
    const title = document.createElement("span");
    title.textContent = addressBook.name;
    label.append(input);
    label.append(title);

    return label;
  }

  /**
   * Selects/Deselects all address book checkboxes.
   */
  #toggleSelectAllInputs() {
    const inputs = this.querySelectorAll("input");
    const allSelected =
      this.counter.addressBooks === this.#availableAddressBooks.length;

    inputs.forEach(checkbox => {
      checkbox.checked = !allSelected;
    });

    this.counterObserver.addressBooks = allSelected
      ? 0
      : this.#availableAddressBooks.length;
  }

  /**
   * Updates the strings based on the address book count.
   *
   * @param {number} count - The current count of selected address books.
   */
  observeAddressBookCounter(count) {
    this.l10n.setAttributes(
      this.#selectedAddressBooks,
      "account-hub-sync-accounts-selected",
      {
        count,
      }
    );

    const toggleFluentID =
      count === this.#availableAddressBooks.length
        ? "account-hub-deselect-all"
        : "account-hub-select-all";
    this.l10n.setAttributes(this.#selectAllAddressBooks, toggleFluentID);
  }
}

customElements.define("address-book-sync", AddressBookSync);
