/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

/**
 * Holds the main controller class.
 *
 * @type {?AccountHubControllerClass}
 */
var AccountHubController;

/**
 * Controller class to handle the primary views of the account setup flow.
 * This class acts as a sort of controller to lazily load the needed views upon
 * request. It doesn't handle any data and it should only be used to switch
 * between the different setup flows.
 * All methods of this class should be private, except for the open() method.
 */
class AccountHubControllerClass {
  /**
   * The account hub main modal dialog.
   *
   * @type {?HTMLElement}
   */
  #modal = null;

  /**
   * The currently visible view inside the dialog.
   *
   * @type {?HTMLElement}
   */
  #currentView = null;

  /**
   * Object containing all strings to trigger the needed methods for the various
   * views.
   */
  #views = {
    START: () => this.#viewStart(),
    MAIL: () => this.#viewEmailSetup(),
    CALENDAR: () => this.#viewCalendarSetup(),
    ADDRESS_BOOK: () => this.#viewAddressBookSetup(),
    CHAT: () => this.#viewChatSetup(),
    FEED: () => this.#viewFeedSetup(),
    NNTP: () => this.#viewNNTPSetup(),
    IMPORT: () => this.#viewImportSetup(),
  };

  constructor() {
    this.ready = this.#init();
  }

  async #init() {
    await this.#loadScript("container");
    const element = document.createElement("account-hub-container");
    document.body.appendChild(element);
    this.#modal = element.modal;

    // Listen from closing requests coming from child elements.
    this.#modal.addEventListener(
      "request-close",
      event => {
        event.stopPropagation();
        this.#modal.close();
      },
      {
        capture: true,
      }
    );

    this.#modal.addEventListener(
      "open-view",
      event => {
        event.stopPropagation();
        this.open(event.detail.type);
      },
      {
        capture: true,
      }
    );

    this.#modal.addEventListener("close", event => {
      // Don't allow the dialog to be closed if some operations are can't be
      // aborted or the UI can't be cleared.
      if (!this.#reset()) {
        event.preventDefault();
      }
    });

    this.#modal.addEventListener("cancel", event => {
      if (
        !MailServices.accounts.accounts.length &&
        !Services.prefs.getBoolPref("app.use_without_mail_account", false)
      ) {
        // Prevent closing the modal if no account is currently present and the
        // user didn't request using Thunderbird without an email account.
        event.preventDefault();
        return;
      }

      // Don't allow the dialog to be canceled via the ESC key if some
      // operations are in progress and can't be aborted or the UI can't be
      // cleared.
      if (!this.#reset()) {
        event.preventDefault();
      }
    });
  }

  /**
   * Check if we don't currently have the needed custom element for the
   * requested view and load the needed script. We do this to avoid loading all
   * the unnecessary account creation files.
   *
   * @param {string} view - The name of the view to load.
   * @returns {Promise<void>} Resolves when custom element of the view is usable.
   */
  #loadScript(view) {
    if (customElements.get(`account-hub-${view}`)) {
      return Promise.resolve();
    }
    // eslint-disable-next-line no-unsanitized/method
    return import(
      `chrome://messenger/content/accountcreation/views/${view}.mjs`
    );
  }

  /**
   * Create a custom element and append it to the modal inner HTML, or simply
   * show it if it was already loaded.
   *
   * @param {string} id - The ID of the template to clone.
   */
  async #loadView(id) {
    this.#hideViews();

    let view = this.#modal.querySelector(id);
    if (view) {
      view.hidden = false;
      this.#currentView = view;
      await view.ready;
      return;
    }
    view = document.createElement(id);
    this.#modal.appendChild(view);
    this.#currentView = view;
    await view.ready;
  }

  /**
   * Hide all the currently visible views.
   */
  #hideViews() {
    for (const view of this.#modal.querySelectorAll(".account-hub-view")) {
      view.hidden = true;
    }
  }

  /**
   * Open the main modal dialog and load the requested account setup view, or
   * fallback to the initial start screen.
   *
   * @param {?string} type - Which account flow to load when the modal opens.
   */
  async open(type = "MAIL") {
    // Interrupt if something went wrong while cleaning up a previously loaded
    // view.
    if (!this.#reset()) {
      return;
    }

    await this.#views[type].call();
    if (!this.#modal.open) {
      this.#modal.showModal();
    }
  }

  /**
   * Check if we have a current class and try to trigger the rest in order to
   * handle abort operations and markup clean up, if possible.
   *
   * @returns {boolean} - True if the reset process was successful or we didn't
   *   have anything to reset.
   */
  #reset() {
    const isClean = this.#currentView?.reset() ?? true;
    // If the reset operation was successful, clear the current class.
    if (isClean) {
      this.#hideViews();
      this.#currentView = null;
    }
    return isClean;
  }

  /**
   * Show the initial view of the account hub dialog.
   */
  async #viewStart() {
    await this.#loadScript("start");
    await this.#loadView("account-hub-start");
  }

  /**
   * Show the email setup view.
   */
  async #viewEmailSetup() {
    await this.#loadScript("email");
    await this.#loadView("account-hub-email");
  }

  /**
   * TODO: Show the calendar setup view.
   */
  #viewCalendarSetup() {
    dump("Calendar setup\n");
  }

  /**
   * Show the address book setup view.
   */
  async #viewAddressBookSetup() {
    await this.#loadScript("address-book");
    await this.#loadView("account-hub-address-book");
  }

  /**
   * TODO: Show the chat setup view.
   */
  #viewChatSetup() {
    dump("Chat setup\n");
  }

  /**
   * TODO: Show the feed setup view.
   */
  #viewFeedSetup() {
    dump("Feed setup\n");
  }

  /**
   * TODO: Show the newsgroup setup view.
   */
  #viewNNTPSetup() {
    dump("Newsgroup setup\n");
  }

  /**
   * TODO: Show the import setup view.
   */
  #viewImportSetup() {
    dump("Import setup\n");
  }
}

/**
 * Open the account hub dialog and show the requested view.
 *
 * @param {?string} type - The type of view that should be loaded when the modal
 *   is showed. See AccountHubController::#views for a list references.
 */
async function openAccountHub(type) {
  if (!AccountHubController) {
    AccountHubController = new AccountHubControllerClass();
  }
  await AccountHubController.ready;
  await AccountHubController.open(type);
}
