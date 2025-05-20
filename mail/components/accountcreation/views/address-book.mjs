/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import "chrome://messenger/content/accountcreation/content/widgets/account-hub-step.mjs"; // eslint-disable-line import/no-unassigned-import
import "chrome://messenger/content/accountcreation/content/widgets/account-hub-footer.mjs"; // eslint-disable-line import/no-unassigned-import

class AccountHubAddressBook extends HTMLElement {
  /**
   * String of ID of current step in email flow.
   *
   * @type {string}
   */
  #currentState;

  /**
   * Address book footer.
   *
   * @type {HTMLElement}
   */
  #footer;

  /**
   * States of the email setup flow, based on the ID's of the steps in the
   * flow.
   *
   * @type {object}
   */
  #states = {
    optionSelectSubview: {
      id: "addressBookOptionSelectSubview",
      nextStep: "",
      previousStep: "",
      forwardEnabled: false,
      subview: {},
      templateId: "address-book-option-select",
    },
    accountSelectSubview: {
      id: "addressBookAccountSelectSubview",
      nextStep: false,
      previousStep: "optionSelectSubview",
      forwardEnabled: false,
      subview: {},
      templateId: "address-book-account-select",
    },
    remoteAccountSubview: {
      id: "addressBookRemoteAccountFormSubview",
      nextStep: true,
      previousStep: "optionSelectSubview",
      forwardEnabled: false,
      subview: {},
      templateId: "address-book-remote-account-form",
    },
    ldapAccountSubview: {
      id: "addressBookLdapAccountFormSubview",
      nextStep: true,
      previousStep: "optionSelectSubview",
      forwardEnabled: false,
      subview: {},
      templateId: "address-book-ldap-account-form",
    },
    ldapAdvancedSubview: {
      id: "addressBookLdapAdvancedFormSubview",
      nextStep: true,
      previousStep: "ldapAccountSubview",
      forwardEnabled: false,
      subview: {},
      templateId: "address-book-ldap-advanced-form",
    },
    syncAddressBooksSubview: {
      id: "addressBookSyncSubview",
      nextStep: true,
      previousStep: "accountSelectSubview",
      forwardEnabled: true,
      subview: {},
      templateId: "address-book-sync",
    },
  };

  async connectedCallback() {
    if (this.hasConnected) {
      return;
    }
    this.hasConnected = true;

    this.classList.add("account-hub-view");

    const template = document.getElementById("accountHubAddressBookSetup");
    this.appendChild(template.content.cloneNode(true));

    for (const state in this.#states) {
      const subviewId = this.#states[state].id;
      this.#states[state].subview = this.querySelector(`#${subviewId}`);
    }

    this.#footer = this.querySelector("#addressBookFooter");
    this.#footer.addEventListener("back", this);
    this.#footer.addEventListener("forward", this);
    this.addEventListener("submit", this);

    this.ready = this.#initUI("optionSelectSubview");
    await this.ready;

    // TODO: Implement setState in the subviews.
    // this.#currentSubview.setState();
  }

  /**
   * Returns the subview of the current state.
   *
   * @returns {HTMLElement} The current subview.
   */
  get #currentSubview() {
    return this.#states[this.#currentState].subview;
  }

  /**
   * Inject a state into the list of states (for unit testing).
   *
   * @param {string} stateName - Name of the state, always has "Test" added to the end.
   * @param {object} state - State data.
   */
  insertTestState(stateName, state) {
    this.#states[`${stateName}Test`] = state;
  }

  /**
   * Handle the events from the subviews.
   *
   * @param {Event} event
   */
  async handleEvent(event) {
    switch (event.type) {
      case "back":
        break;
      case "submit":
        event.preventDefault();
        if (!event.target.checkValidity()) {
          // Do nothing.
          break;
        }
      // Fall through to handle like forward event.
      case "forward":
        break;
      default:
        break;
    }
  }

  /**
   * Initialize the UI of one of the address book subviews.
   *
   * @param {string} subview - Subview for which the UI is being inititialized.
   */
  async #initUI(subview) {
    this.#hideSubviews();
    this.#currentState = subview;
    await this.#loadTemplateScript(this.#states[subview].templateId);
    this.#currentSubview.hidden = false;
    this.#setFooterButtons();
  }

  /**
   * Sets the footer buttons in the footer template.
   */
  #setFooterButtons() {
    const stateDetails = this.#states[this.#currentState];

    // TODO: Hide footer buttons row for space if neither forward or back is
    // an option.
    this.#footer.canBack(stateDetails.previousStep);
    this.#footer.canForward(stateDetails.nextStep);

    // The footer forward button is disabled by default.
    this.#footer.toggleForwardDisabled(!stateDetails.forwardEnabled);
  }

  /**
   * Load the template of a subview using the template ID.
   *
   * @param {string} templateId - ID of the template that needs to be loaded.
   */
  async #loadTemplateScript(templateId) {
    if (customElements.get(templateId)) {
      return Promise.resolve();
    }

    // eslint-disable-next-line no-unsanitized/method
    return import(
      `chrome://messenger/content/accountcreation/content/widgets/${templateId}.mjs`
    );
  }

  /**
   * Hide all of the subviews in the account hub address book flow.
   */
  #hideSubviews() {
    for (const subviewName of Object.keys(this.#states)) {
      this.#states[subviewName].subview.hidden = true;
    }
  }

  /**
   * Hide all subviews and reset all forms, and set the first step as the
   * current subview.
   *
   * @returns {boolean} - If the account hub can remove this view.
   */
  async reset() {
    this.#hideSubviews();
    await this.#initUI("optionSelectSubview");
    this.#setFooterButtons();
    // Reset all subviews that require a reset.
    for (const subviewName of Object.keys(this.#states)) {
      this.#states[subviewName].subview?.resetState?.();
    }

    return true;
  }
}

customElements.define("account-hub-address-book", AccountHubAddressBook);
