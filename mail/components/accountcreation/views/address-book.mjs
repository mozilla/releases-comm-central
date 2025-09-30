/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import "chrome://messenger/content/accountcreation/content/widgets/account-hub-step.mjs"; // eslint-disable-line import/no-unassigned-import
import "chrome://messenger/content/accountcreation/content/widgets/account-hub-footer.mjs"; // eslint-disable-line import/no-unassigned-import

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  MailServices: "resource:///modules/MailServices.sys.mjs",
  OAuth2Module: "resource:///modules/OAuth2Module.sys.mjs",
  RemoteAddressBookUtils:
    "resource:///modules/accountcreation/RemoteAddressBookUtils.sys.mjs",
  LDAPDirectoryUtils:
    "resource:///modules/accountcreation/LDAPDirectoryUtils.sys.mjs",
});

/**
 * To some extent this is an extension of AddressBookLogin from the
 * address-book-remote-account-form.
 *
 * @typedef {object} RemoteAddressBookState
 * @property {string} username - Username to log in to the address book with
 * @property {string} server - The URL or domain of the server the address book
 *  is stored on.
 * @property {string} [password] - If the address book server doesn't use oauth,
 *   the password to login.
 * @property {boolean} [rememberPassword] - If the password should be stored.
 */

class AccountHubAddressBook extends HTMLElement {
  static get observedAttributes() {
    return ["hidden"];
  }

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
   * @typedef {object} AddressBookAccounts
   * @property {nsIMsgAccount} account - A user account.
   * @property {foundBook[]} addressBooks - A address books linked to the user account.
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
   * User accounts with address books.
   *
   * @type {AddressBookAccounts[]}
   */
  #accounts = [];

  /**
   * Remote address book setup state persisted between steps.
   *
   * @type {RemoteAddressBookState}
   */
  #remoteAddressBookState = {};

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
    syncAddressBooksSubview: {
      id: "addressBookSyncSubview",
      nextStep: true,
      previousStep: "accountSelectSubview",
      forwardEnabled: true,
      subview: {},
      templateId: "address-book-sync",
    },
    localAddressBookSubview: {
      id: "addressBookLocalSubview",
      nextStep: true,
      previousStep: "optionSelectSubview",
      forwardEnabled: true,
      subview: {},
      templateId: "address-book-local-form",
    },
    remotePasswordSubview: {
      id: "addressBookPasswordSubview",
      nextStep: "syncAddressBooksSubview",
      previousStep: "remoteAccountSubview",
      forwardEnabled: true,
      subview: {},
      templateId: "email-password-form",
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

    for (const state of Object.values(this.#states)) {
      state.subview = this.querySelector(`#${state.id}`);
    }

    this.#footer = this.querySelector("#addressBookFooter");
    this.#footer.addEventListener("back", this);
    this.#footer.addEventListener("forward", this);
    this.addEventListener("submit", this);
    this.addEventListener("config-updated", this);
    this.ready = this.#initUI("optionSelectSubview");
    await this.ready;
    await this.init();
  }

  attributeChangedCallback(attributeName, oldValue, newValue) {
    if (attributeName === "hidden" && newValue === null) {
      // If the template was already loaded and we're going back to it we should
      // trigger init() to ensure we're not showing stale data.
      this.init();
    }
  }

  /**
   * Called when address book view is visible, fetches fresh list of accounts
   * and address books.
   */
  async init() {
    await this.#fetchAccounts();
    this.#states.optionSelectSubview.subview.setState(this.#accounts);
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
   * Inject an account in the list of #accounts (for unit testing).
   *
   * @param {AddressBookAccounts} account - The test address book account.
   */
  insertTestAccount(account) {
    this.#accounts.push(account);
  }

  /**
   * Remove the test account from the list of #accounts (for unit testing).
   *
   * @param {AddressBookAccounts} account - The test address book account.
   */
  removeTestAccount(account) {
    this.#accounts = this.#accounts.filter(
      addressBookAccount =>
        addressBookAccount.account.incomingServer.username !=
        account.account.incomingServer.username
    );
  }

  /**
   * Handle the events from the subviews.
   *
   * @param {Event} event
   */
  async handleEvent(event) {
    const stateDetails = this.#states[this.#currentState];
    switch (event.type) {
      case "back":
        await this.#initUI(stateDetails.previousStep);
        break;
      case "submit":
        event.preventDefault();
        if (!event.target.checkValidity()) {
          // Do nothing.
          break;
        }

        if (this.#currentState === "optionSelectSubview") {
          await this.#initUI(event.submitter.value);
          this.#currentSubview.setState?.(this.#accounts);
          break;
        }

        if (this.#currentState === "accountSelectSubview") {
          this.#states.syncAddressBooksSubview.previousStep =
            this.#currentState;
          await this.#initUI("syncAddressBooksSubview");
          const account = this.#accounts.find(
            addressBookAccount =>
              addressBookAccount.account.incomingServer.username ===
              event.submitter.value
          );
          this.#currentSubview.setState(account.addressBooks);
          break;
        }
      // Fall through to handle like forward event.
      case "forward":
        try {
          const stateData = this.#currentSubview.captureState?.();
          await this.#handleForwardAction(this.#currentState, stateData);
        } catch (error) {
          this.#currentSubview.showNotification({
            title: error.title || error.message,
            description: error.text,
            error,
            type: "error",
          });
        }
        break;
      case "config-updated":
        this.#footer.toggleForwardDisabled(!event.detail.completed);
        break;
      default:
        break;
    }
  }

  /**
   * Initialize the UI of one of the address book subviews.
   *
   * @param {string} subview - Subview for which the UI is being initialized.
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
   * Closes Account Hub and opens an address book in the address book tab.
   *
   * @param {string} directoryUID - The UID of the directory to open.
   */
  async #openAddressBook(directoryUID) {
    this.dispatchEvent(
      new CustomEvent("request-close", {
        bubbles: true,
      })
    );

    await window.toAddressBook(["cmd_displayAddressBook", directoryUID]);
  }

  /**
   * Calls the appropriate method for the current state when the forward
   * button is pressed.
   *
   * @param {string} currentState - The current state of the address book flow.
   * @param {object} stateData - The state data from the step.
   */
  async #handleForwardAction(currentState, stateData) {
    switch (currentState) {
      case "localAddressBookSubview": {
        try {
          const dirPrefId = lazy.MailServices.ab.newAddressBook(
            stateData.name,
            "",
            Ci.nsIAbManager.JS_DIRECTORY_TYPE
          );

          const directory = lazy.MailServices.ab.getDirectoryFromId(dirPrefId);

          await this.#openAddressBook(directory.UID);
          await this.reset();
        } catch (error) {
          throw new Error("Local address book creation failed", {
            cause: error,
          });
        }

        break;
      }
      case "remoteAccountSubview": {
        // Normalize server to a URI (there is no protocol if we extracted it
        // from the username)
        if (!URL.canParse(stateData.server)) {
          stateData.server = `https://${stateData.server}`;
        }
        this.#remoteAddressBookState = stateData;
        const oAuth = new lazy.OAuth2Module();
        if (
          !oAuth.initFromHostname(
            new URL(stateData.server).hostname,
            stateData.username,
            "carddav"
          )
        ) {
          // See if we already have the password stored.
          const logins = await Services.logins.searchLoginsAsync({
            origin: new URL(stateData.server).origin,
          });
          const login = logins.find(
            loginInfo => loginInfo.username === stateData.username
          );
          // If we can't find credentials, ask for the password.
          if (!login) {
            await this.#initUI("remotePasswordSubview");
            this.#currentSubview.setState();
            break;
          }
          // Since we found a login we can complete the state already.
          this.#remoteAddressBookState.password = login.password;
          // We retrieved it from the password store, so we should remember it
          // if we need it for a different origin.
          this.#remoteAddressBookState.rememberPassword = true;
        }
        await this.#initializeSyncSubview(currentState);
        break;
      }
      case "remotePasswordSubview":
        this.#remoteAddressBookState.password = stateData.password;
        this.#remoteAddressBookState.rememberPassword =
          stateData.rememberPassword;
        await this.#initializeSyncSubview(currentState);
        break;
      case "syncAddressBooksSubview": {
        // The state data returned from this subview is a list of available
        // address books that have a create function.
        let directory;
        for (const addressBook of stateData) {
          if (!directory) {
            directory = await addressBook.create();
            continue;
          }
          await addressBook.create();
        }
        await this.#openAddressBook(directory?.UID);
        break;
      }
      case "ldapAccountSubview": {
        let directory;
        try {
          directory = await lazy.LDAPDirectoryUtils.createDirectory(stateData);
        } catch (error) {
          if (error instanceof lazy.LDAPDirectoryUtils.DuplicateNameError) {
            this.#currentSubview.showNotification({
              fluentTitleId: "address-book-ldap-duplicate-error",
              type: "error",
            });

            break;
          }

          this.#currentSubview.showNotification({
            fluentTitleId: "address-book-ldap-creation-error",
            error,
            type: "error",
          });

          break;
        }

        await this.#openAddressBook(directory.UID);

        break;
      }
      default:
        break;
    }
  }

  /**
   * Show the sync subview and set it up with address books based on the
   * #remoteAddressBookState. Might trigger an OAuth prompt.
   *
   * @param {string} previousStep - The previous step the syncAddressBookSubview
   *  should go back to.
   */
  async #initializeSyncSubview(previousStep) {
    this.#states.syncAddressBooksSubview.previousStep = previousStep;
    this.classList.add("busy");
    this.#footer.disabled = true;
    this.#footer.toggleBackDisabled(true);
    this.#currentSubview.showNotification({
      fluentTitleId: "address-book-finding-remote-address-books",
      type: "info",
    });
    try {
      // This will prompt for oauth, and if authentication is complete fetch the
      // available address books.
      const books = await lazy.RemoteAddressBookUtils.getAddressBooksForAccount(
        this.#remoteAddressBookState.username,
        this.#remoteAddressBookState.password,
        this.#remoteAddressBookState.server,
        this.#remoteAddressBookState.rememberPassword
      );
      this.#currentSubview.clearNotifications();
      await this.#initUI("syncAddressBooksSubview");
      this.#currentSubview.setState(books);
      if (books.length === 0) {
        this.#currentSubview.showNotification({
          fluentTitleId: "account-hub-no-address-books",
          type: "info",
        });
      }
      //TODO username?
    } catch (error) {
      if (error.result == Cr.NS_ERROR_NOT_AVAILABLE) {
        this.#currentSubview.showNotification({
          fluentTitleId: "address-book-carddav-known-incompatible",
          fluentTitleArguments: {
            url: new URL(this.#remoteAddressBookState.server).hostname,
          },
          error,
          type: "error",
        });
        return;
      }
      this.#currentSubview.showNotification({
        fluentTitleId: "address-book-carddav-connection-error",
        error,
        type: "error",
      });
    } finally {
      this.#footer.disabled = false;
      this.#footer.toggleBackDisabled(false);
      this.classList.remove("busy");
    }
  }

  /**
   * Fetch existing accounts with their address books, and apply them to
   * #accounts.
   */
  async #fetchAccounts() {
    this.#accounts =
      await lazy.RemoteAddressBookUtils.getAddressBooksForExistingAccounts();
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
    this.#currentSubview.clearNotifications?.();
    this.#hideSubviews();
    this.#remoteAddressBookState = {};
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
