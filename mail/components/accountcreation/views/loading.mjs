/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

class AccountHubLoading extends HTMLElement {
  /**
   * Lookup Email title of Dialog.
   *
   * @type {HTMLElement}
   */
  #lookupEmailConfigurationTitle;

  /**
   * Lookup Email subheader of Dialog.
   *
   * @type {HTMLElement}
   */
  #lookupEmailConfigurationSubheader;

  /**
   * The Adding Account title of Dialog.
   *
   * @type {HTMLElement}
   */
  #addingAccountTitle;

  /**
   * The Adding Account subheader of Dialog.
   *
   * @type {HTMLElement}
   */
  #addingAccountSubheader;

  /**
   * The stop button.
   *
   * @type {HTMLButtonElement}
   */
  #stopButton;

  /**
   * The continue button.
   *
   * @type {HTMLButtonElement}
   */
  #continueButton;

  connectedCallback() {
    if (this.hasConnected) {
      return;
    }
    this.hasConnected = true;

    this.classList.add("account-hub-view");

    let template = document.getElementById("accountHubLoading");
    this.appendChild(template.content.cloneNode(true));

    this.#continueButton = this.querySelector("#emailContinueButton");
    // this.#stopButton = this.querySelector("#emailStopButton");

    this.initUI();

    this.setupEventListeners();
  }

  /**
   * Initialize the UI of the loading screen.
   */
  initUI() {
    this.#continueButton.disabled = true;
  }

  /**
   * Set up the event listeners for this workflow only once.
   */
  setupEventListeners() {
    // Set the Back button.
    this.querySelector("#emailGoBackButton").addEventListener("click", () => {
      // Back button should return to email form if email form submitted,
      // otherwise return to manual email configuration form.
      this.dispatchEvent(
        new CustomEvent("open-view", {
          bubbles: true,
          composed: true,
          detail: { type: "EMAIL" },
        })
      );
    });

    // this.#stopButton.addEventListener("click", () => {
    //   // Stop button should return to email form if email form submitted.
    //   this.dispatchEvent(
    //     new CustomEvent("open-view", {
    //       bubbles: true,
    //       composed: true,
    //       detail: { type: "EMAIL" },
    //     })
    //   );
    // });
  }

  /**
   * Check if any operation is currently in process and return true only if we
   * can leave this view.
   *
   * @returns {boolean} - If the account hub can remove this view.
   */
  reset() {
    return true;
  }
}

customElements.define("account-hub-loading", AccountHubLoading);
