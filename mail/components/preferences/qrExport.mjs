/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import "chrome://messenger/content/preferences/qr-code-wizard.mjs"; // eslint-disable-line import/no-unassigned-import

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  QRExport: "resource:///modules/QRExport.sys.mjs",
});

const STEPS = ["Intro", "Codes"];

export const qrExportPane = {
  init() {
    this.showIntro();
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
    // Intro
    document
      .getElementById("qrExportIntroForm")
      .addEventListener("submit", event => {
        event.preventDefault();
        this.showCodes(
          this.getSelectedAccounts(),
          document.getElementById("qrExportIncludePasswords").checked
        );
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

    // Codes
    document
      .getElementById("qrExportCodesBack")
      .addEventListener("click", () => {
        if (!document.getElementById("qrCodeWizard").back()) {
          this.showIntro();
          return;
        }
        this.updateCodesState();
      });
    document
      .getElementById("qrExportCodesNext")
      .addEventListener("click", () => {
        if (!document.getElementById("qrCodeWizard").next()) {
          //TODO advance.
          return;
        }
        this.updateCodesState();
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
   * Update the label of the next button in the QR code wizard.
   */
  updateCodesState() {
    const nextString = document.getElementById("qrCodeWizard").isLastStep()
      ? "qr-export-done"
      : "qr-export-next";
    document.l10n.setAttributes(
      document.getElementById("qrExportCodesNext"),
      nextString
    );
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

  /**
   * Shows one step of the export process and hides all the other ones. To show
   * a specific step prefer the shop[Step Name] methods, which will handle
   * initializing that step.
   *
   * @param {"Intro"|"Codes"} step - Name of the step to show.
   */
  showStep(step) {
    for (const stepName of STEPS) {
      document.getElementById(`qrExport${stepName}`).hidden = stepName != step;
    }
  },

  /**
   * Show the export intro with the account selection form.
   */
  showIntro() {
    this.populateAccounts();
    this.showStep("Intro");
  },

  /**
   * Show the QR code display step for the given accounts that should be
   * exported in the QR code. Starts with the first code in the batch. If there
   * are no QR codes to show this returns to the intro.
   *
   * @param {string[]} accountKeys - Keys of the accounts to export to QR code.
   * @param {boolean} includePasswords - If passwords should be included in the
   *   QR code.
   */
  showCodes(accountKeys, includePasswords) {
    const wizard = document.getElementById("qrCodeWizard");
    wizard.initializeQRCodes(accountKeys, includePasswords);
    if (wizard.getTotalSteps() === 0) {
      this.showIntro();
      return;
    }
    document.l10n.setAttributes(
      document.getElementById("qrExportScanDescription"),
      "qr-export-scan-description",
      {
        count: wizard.getTotalSteps(),
      }
    );
    this.updateCodesState();
    this.showStep("Codes");
  },
};
