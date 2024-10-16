/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { defineLazyCustomElement } from "chrome://messenger/content/CustomElementUtils.mjs";

const { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

defineLazyCustomElement(
  "qr-code-wizard",
  "chrome://messenger/content/preferences/qr-code-wizard.mjs"
);

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  QRExport: "resource:///modules/QRExport.sys.mjs",
});

const STEPS = ["Intro", "Codes", "Summary"];

export const qrExportPane = {
  init() {
    this.showIntro();
    this.addEventListeners();
    delete document.getElementById("qrExportContent").dataset.hiddenFromSearch;
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
        const oAuthUsage = lazy.QRExport.getAccountOAuthUsage(account);
        checkbox.dataset.hasOauth = oAuthUsage.incoming || oAuthUsage.outgoing;
        checkbox.dataset.oauthOnly = oAuthUsage.incoming && oAuthUsage.outgoing;
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
   * Populate the data in the export summary.
   *
   * @param {string[]} accountKeys - Keys of accounts that were exported.
   * @param {boolean} includePasswords - If passwords were included in the
   *   export.
   * @param {number} qrCodeCount - Amount of QR codes shown to the user for the
   *   export.
   */
  populateSummary(accountKeys, includePasswords, qrCodeCount) {
    const accounts = accountKeys.map(
      key => MailServices.accounts.getAccount(key).incomingServer.prettyName
    );

    document.l10n.setAttributes(
      document.getElementById("qrExportSummaryQrCodes"),
      "qr-export-summary-qr-count",
      {
        count: qrCodeCount,
      }
    );

    document.l10n.setAttributes(
      document.getElementById("qrExportSummaryAccounts"),
      "qr-export-summary-accounts",
      {
        count: accounts.length,
      }
    );
    document.getElementById("qrExportSummaryAccountList").replaceChildren(
      ...accounts.map(accountName => {
        const item = document.createElement("li");
        item.textContent = accountName;
        item.title = accountName;
        return item;
      })
    );

    const passwordsString = includePasswords
      ? "qr-export-summary-passwords-included"
      : "qr-export-summary-passwords-excluded";
    document.l10n.setAttributes(
      document.getElementById("qrExportSummaryPasswords"),
      passwordsString
    );
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
          this.showSummary();
          return;
        }
        this.updateCodesState();
      });
    // Summary
    document.getElementById("qrExportRestart").addEventListener("click", () => {
      this.showIntro();
    });
  },

  /**
   * Update the state of the buttons in the intro form and adjust the include
   * passwords section contents to match with the usage of OAuth by the selected
   * accounts.
   */
  updateIntroState() {
    const selectedAccounts = this.getSelectedAccounts();
    document.getElementById("qrExportStart").disabled =
      selectedAccounts.length === 0;
    document.getElementById("qrExportSelectAll").disabled =
      document.querySelectorAll("#qrExportAccountsList input:not(:checked)")
        .length === 0;

    const checkedAccountInputs = Array.from(
      document.querySelectorAll("#qrExportAccountsList input:checked")
    );
    const hasOauth = checkedAccountInputs.some(
      input => input.dataset.hasOauth === "true"
    );
    const oauthOnly =
      checkedAccountInputs.length > 0 &&
      checkedAccountInputs.every(input => input.dataset.oauthOnly === "true");
    // Adjust visibility of export passwords section elements according to OAuth
    // accounts.
    document.getElementById("qrExportOauthWarning").hidden = !hasOauth;
    document.getElementById("qrExportPasswordsSection").hidden = oauthOnly;
    const includePasswordsCheckbox = document.getElementById(
      "qrExportIncludePasswords"
    );
    if (oauthOnly) {
      includePasswordsCheckbox.dataset.wasChecked ||=
        includePasswordsCheckbox.checked;
      includePasswordsCheckbox.checked = false;
    } else if (includePasswordsCheckbox.dataset.wasChecked) {
      includePasswordsCheckbox.checked =
        includePasswordsCheckbox.dataset.wasChecked === "true";
      delete includePasswordsCheckbox.dataset.wasChecked;
    }
    includePasswordsCheckbox.disabled = oauthOnly;
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
   * @param {"Intro"|"Codes"|"Summary"} step - Name of the step to show.
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
    this.populateSummary(accountKeys, includePasswords, wizard.getTotalSteps());
  },

  /**
   * Show the export summary. The summary was already populated when the QR
   * codes were shown.
   */
  showSummary() {
    this.showStep("Summary");
  },
};
