/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  QRExport: "resource:///modules/QRExport.sys.mjs",
});

export const qrExportPane = {
  init() {
    document.getElementById("qrExportIntro").hidden = false;

    this.populateAccounts();
    this.addEventListeners();
  },

  /**
   * Update the account list in the intro form.
   */
  populateAccounts() {
    const eligibleAccounts = lazy.QRExport.getEligibleAccounts();
    const list = document.getElementById("qrExportAccountsList");
    const itemTemplate = document.getElementById("qrAccountItem");
    list.replaceChildren(
      ...eligibleAccounts.map(account => {
        const item = itemTemplate.content.cloneNode(true);
        const checkbox = item.querySelector("input");
        checkbox.value = account.key;
        const incomingServer = account.incomingServer;
        checkbox.insertAdjacentText("afterend", incomingServer.prettyName);
        item.querySelector(
          "li"
        ).title = `${incomingServer.type.toUpperCase()}: ${
          incomingServer.username
        } - ${incomingServer.hostName}:${incomingServer.port}`;
        return item;
      })
    );
    this.updateIntroState();
  },

  /**
   * Add event listeners to the various interactive elements of the pane.
   */
  addEventListeners() {
    document
      .getElementById("qrExportIntroForm")
      .addEventListener("submit", event => {
        event.preventDefault();
        //TODO advance!
      });
    document.getElementById("qrExportAccountsList").addEventListener(
      "input",
      () => {
        this.updateIntroState();
      },
      {
        capture: true,
      }
    );
    document
      .getElementById("qrExportSelectAll")
      .addEventListener("click", () => {
        for (const input of document.querySelectorAll(
          "#qrExportAccountsList input:not(:checked)"
        )) {
          input.checked = true;
        }
        this.updateIntroState();
      });
  },

  /**
   * Update the state of the buttons in the intro form.
   */
  updateIntroState() {
    const selectedAccounts = this.getSelectedAccounts();
    document.getElementById("qrExportStart").disabled =
      selectedAccounts.length === 0;
    document.getElementById("qrExportSelectAll").disabled =
      document.querySelectorAll("#qrExportAccountsList input:not(:checked)")
        .length === 0;
  },

  /**
   * @returns {string[]} Array of account keys that are selected for export.
   */
  getSelectedAccounts() {
    return Array.from(
      document.querySelectorAll("#qrExportAccountsList input:checked"),
      input => input.value
    );
  },
};
