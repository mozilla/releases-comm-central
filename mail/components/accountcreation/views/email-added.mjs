/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

class AccountHubEmailAdded extends HTMLElement {
  /**
   * The continue button.
   *
   * @type {HTMLButtonElement}
   */
  #finishButton;

  connectedCallback() {
    if (this.hasConnected) {
      return;
    }
    this.hasConnected = true;

    this.classList.add("account-hub-view");

    const template = document.getElementById("accountHubEmailAdded");
    this.appendChild(template.content.cloneNode(true));

    this.#finishButton = this.querySelector("#emailFinishButton");

    this.initUI();

    this.setupEventListeners();
  }

  /**
   * Initialize the UI of the loading screen.
   */
  initUI() {}

  /**
   * Set up the event listeners for this workflow only once.
   */
  setupEventListeners() {
    // Set the Finish button event listener.
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

customElements.define("account-hub-email-added", AccountHubEmailAdded);
