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
   * Accounts container element.
   *
   * @type {HTMLElement}
   */
  #accountsContainer;

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
   * Select all address books label (the visual button).
   *
   * @type {HTMLLabelElement}
   */
  #selectAllAddressBooksLabel;

  /**
   * Select all address books input.
   *
   * @type {HTMLInputElement}
   */
  #selectAllAddressBooksInput;

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
    this.hasConnected = true;

    super.connectedCallback();

    const template = document
      .getElementById("accountHubAddressBookSyncTemplate")
      .content.cloneNode(true);
    this.appendChild(template);

    this.showBrandingHeader();
    this.#accountsContainer = this.querySelector(
      "#addressBookAccountsContainer"
    );
    this.#selectedAddressBooks = this.querySelector("#selectedAddressBooks");
    this.#selectAllAddressBooksLabel = this.querySelector(
      `[for="selectAllAddressBooks"]`
    );
    this.#selectAllAddressBooksInput =
      this.#selectAllAddressBooksLabel.querySelector("input");
    this.#selectAllAddressBooksInput.addEventListener("click", this);
    this.#accountsContainer.addEventListener("change", this);

    this.counterObserver = new Proxy(this.counter, {
      set: (counter, key, count) => {
        counter[key] = count;
        this.observeAddressBookCounter(count);
        return true;
      },
    });
  }

  /**
   * The current set of account inputs.
   *
   * @type {NodeList}
   */
  get inputs() {
    return this.#accountsContainer.querySelectorAll("input");
  }

  handleEvent(event) {
    switch (event.type) {
      case "click":
        this.#toggleSelectAllInputs();
        break;
      case "change":
        this.counterObserver.addressBooks += event.target.checked ? 1 : -1;
        this.#updateSelectAll();
        break;
      default:
        break;
    }
  }

  /**
   * Updates the label (and looks) of the Select All button based on the
   * states of the inputs.
   */
  #updateSelectAll() {
    const allSelected = [...this.inputs].every(c => c.checked);

    this.#selectAllAddressBooksInput.checked = allSelected;
    this.#selectAllAddressBooksInput.indeterminate =
      !allSelected && this.counter.addressBooks !== 0;

    this.l10n.setAttributes(
      this.#selectAllAddressBooksLabel.querySelector("span"),
      allSelected ? "account-hub-deselect-all" : "account-hub-select-all"
    );
    this.#selectAllAddressBooksInput.disabled = [...this.inputs].every(
      c => c.disabled
    );
  }

  /**
   * Sets the list address books ready to be synced.
   *
   * @param {object[]} addressBooks - The address books ready to be synced.
   */
  setState(addressBooks) {
    this.resetState();
    this.#availableAddressBooks = addressBooks;
    this.counterObserver.addressBooks = addressBooks.length;

    // Create the address book inputs.
    for (const addressBook of addressBooks) {
      this.#accountsContainer.append(this.#createInput(addressBook));
    }

    this.#selectAllAddressBooksInput.setAttribute(
      "aria-controls",
      [...this.inputs].map(input => input.id).join(" ")
    );
    this.#updateSelectAll();
  }

  /**
   * Returns the selected address books.
   *
   * @returns {object[]} The address books selected.
   */
  captureState() {
    const checkedAddressBookUrls = Array.from(
      this.#accountsContainer.querySelectorAll("input:checked:enabled"),
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
    this.#accountsContainer
      .querySelectorAll("label")
      .forEach(label => label.remove());
    this.#updateSelectAll();
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
    const allSelected = [...this.inputs].every(c => c.checked);
    for (const checkbox of [...this.inputs].filter(c => !c.disabled)) {
      checkbox.checked = !allSelected;
    }

    this.counterObserver.addressBooks = [...this.inputs].filter(
      c => c.checked
    ).length;

    this.#updateSelectAll();
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
  }
}

customElements.define("address-book-sync", AddressBookSync);
