/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { AccountHubStep } from "./account-hub-step.mjs";

/**
 * Account Hub Email Sync Accounts Template
 * Template ID: #accountHubEmailSyncAccountsFormTemplate (from accountHubEmailSyncAccountsFormTemplate.inc.xhtml)
 */
class EmailSyncAccountsForm extends AccountHubStep {
  /**
   * Select all address books button.
   *
   * @type {HTMLButtonElement}
   */
  #selectAllAddressBooks;

  /**
   * Select all calendars button.
   *
   * @type {HTMLButtonElement}
   */
  #selectAllCalendars;

  /**
   * Text for how many address books are selected.
   *
   * @type {HTMLButtonElement}
   */
  #selectedAddressBooks;

  /**
   * Text for how many calendars are selected.
   *
   * @type {HTMLButtonElement}
   */
  #selectedCalendars;

  /**
   * Contains 2 arrays of the available calendars and address books.
   *
   * @type {Object}
   */
  #availableSyncAccounts;

  /**
   * Contains the current counters for addressBooks and calendars.
   *
   * @type {Object}
   */
  counters;

  /**
   * Updates counters and updates the fluent strings associated with the
   * counters.
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
      .getElementById("accountHubEmailSyncAccountsFormTemplate")
      .content.cloneNode(true);
    this.appendChild(template);

    this.#selectedAddressBooks = this.querySelector("#selectedAddressBooks");
    this.#selectedCalendars = this.querySelector("#selectedCalendars");
    this.#selectAllAddressBooks = this.querySelector("#selectAllAddressBooks");
    this.#selectAllCalendars = this.querySelector("#selectAllCalendars");
    this.#selectAllAddressBooks.addEventListener("click", this);
    this.#selectAllCalendars.addEventListener("click", this);
    this.querySelector("#syncAccountsForm").addEventListener("change", this);
    this.counters = { addressBooks: 0, calendars: 0 };

    this.counterObserver = new Proxy(this.counters, {
      set: (counters, syncAccount, count) => {
        counters[syncAccount] = count;
        this.observeSyncAccountCounter(syncAccount, count);
        return true;
      },
    });
  }

  handleEvent(event) {
    switch (event.type) {
      case "click":
        this.#toggleSelectAllInputs(
          event.target.id === "selectAllAddressBooks"
            ? "addressBooks"
            : "calendars"
        );
        break;
      case "change":
        this.counterObserver[
          event.target.classList.contains("address-book-input")
            ? "addressBooks"
            : "calendars"
        ] += event.target.checked ? 1 : -1;
        break;
      default:
        break;
    }
  }

  /**
   * @typedef {Object} SyncAccounts
   * @property {Array} calendars - The account's calendars.
   * @property {Array} addressBooks - The account's address books.
   */

  /**
   * Sets the list of calendars and address books available in the
   * currentConfig
   *
   * @type {SyncAccounts} syncAccounts - The sync accounts for the user.
   */
  setState(syncAccounts) {
    this.#availableSyncAccounts = syncAccounts;
    const calendars = syncAccounts.calendars;
    const addressBooks = syncAccounts.addressBooks;

    // If there are no address books or calendars, we show text to let the
    // user know.
    const addressBooksCount = addressBooks.length;
    this.#selectAllAddressBooks.hidden = !addressBooksCount;
    this.querySelector("#noAddressBooks").hidden = addressBooksCount;
    this.counterObserver.addressBooks = addressBooksCount;

    const calendarsCount = calendars.length;
    this.#selectAllCalendars.hidden = !calendarsCount;
    this.querySelector("#noCalendars").hidden = calendarsCount;
    this.counterObserver.calendars = calendarsCount;

    // Create the sync account inputs.
    for (const calendar of calendars) {
      this.querySelector("#calendarAccountsContainer").append(
        this.#createInput(calendar, "calendar-input")
      );
    }

    for (const addressBook of addressBooks) {
      this.querySelector("#addressBookAccountsContainer").append(
        this.#createInput(addressBook, "address-book-input")
      );
    }
  }

  /**
   * Returns the chosen address books and calendars
   *
   * @returns {SyncAccounts} The sync accounts selected.
   */
  captureState() {
    const checkedAddressBookUrls = Array.from(
      this.querySelectorAll("#addressBooks input:checked:enabled"),
      checkedAddressBook => checkedAddressBook.dataset.url
    );
    const checkedCalendarsUrls = Array.from(
      this.querySelectorAll("#calendars input:checked:enabled"),
      checkedCalendar => checkedCalendar.dataset.url
    );

    return {
      calendars: this.#availableSyncAccounts.calendars.filter(calendar =>
        checkedCalendarsUrls.includes(calendar.uri?.spec)
      ),
      addressBooks: this.#availableSyncAccounts.addressBooks.filter(
        addressBook => checkedAddressBookUrls.includes(addressBook.url.href)
      ),
    };
  }

  /**
   * Removes all of the input labels and resets #availableSyncAccounts.
   */
  resetState() {
    this.#availableSyncAccounts = {};
    // Remove existing account labels.
    this.querySelectorAll("label").forEach(label => label.remove());
    this.#selectedAddressBooks.removeAttribute("data-l10n-id");
    this.#selectedCalendars.removeAttribute("data-l10n-id");
    this.#selectAllAddressBooks.removeAttribute("data-l10n-id");
    this.#selectAllCalendars.removeAttribute("data-l10n-id");
    this.#selectAllAddressBooks.hidden = true;
    this.#selectAllCalendars.hidden = true;
  }

  /**
   * Creates the label and checkbox input for a sync account.
   *
   * @type {Object} syncAccount - A syncable account.
   * @type {string} inputClass - Class name for input type.
   * @returns {HTMLElement} The account label with the checkbox input.
   */
  #createInput(syncAccount, inputClass) {
    const label = document.createElement("label");
    label.classList.add("toggle-container-with-text", "sync-option");
    const input = document.createElement("input");
    input.classList.add("check-button", inputClass);
    input.id = syncAccount.name
      .toLowerCase()
      .replace(/[^a-zA-Z0-9]+(.)/g, (m, chr) => chr.toUpperCase());
    input.type = "checkbox";
    input.checked = true;
    input.disabled = syncAccount.existing;
    input.dataset.url =
      inputClass === "address-book-input"
        ? syncAccount.url.href
        : syncAccount.uri?.spec;
    const title = document.createElement("span");
    title.textContent = syncAccount.name;
    label.append(input);
    label.append(title);

    return label;
  }

  /**
   * Selects/Deselects all inputs within the type group of checkboxes.
   *
   * @type {string} type - The type of sync account.
   */
  #toggleSelectAllInputs(type) {
    const inputs = this.querySelectorAll(`#${type} input`);
    const allSelected =
      this.counters[type] === this.#availableSyncAccounts[type].length;

    inputs.forEach(checkbox => {
      checkbox.checked = !allSelected;
    });

    this.counterObserver[type] = allSelected
      ? 0
      : this.#availableSyncAccounts[type].length;
  }

  /**
   * Update strings associated with the sync account type.
   *
   * @type {string} type - The type of sync account.
   * @type {number} count - The current count of selected sync accounts.
   */
  observeSyncAccountCounter(type, count) {
    const selectedLabel =
      type === "addressBooks"
        ? this.#selectedAddressBooks
        : this.#selectedCalendars;
    document.l10n.setAttributes(selectedLabel, "account-hub-selected", {
      count,
    });

    const toggleFluentID =
      count === this.#availableSyncAccounts[type].length &&
      this.#availableSyncAccounts[type].length != 0
        ? "account-hub-deselect-all"
        : "account-hub-select-all";
    const selectAllButton =
      type === "addressBooks"
        ? this.#selectAllAddressBooks
        : this.#selectAllCalendars;
    document.l10n.setAttributes(selectAllButton, toggleFluentID);
  }
}

customElements.define("email-sync-accounts-form", EmailSyncAccountsForm);
