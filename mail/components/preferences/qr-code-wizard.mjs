/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  QRExport: "resource:///modules/QRExport.sys.mjs",
});

/**
 * Wizard to go through a set of account export QR codes.
 *
 * Template ID: #qrCodeWizardTemplate
 */
class QrCodeWizard extends HTMLElement {
  /**
   * Array of SVG data URIs for QR codes.
   *
   * @type {string[]}
   */
  #codes = [];

  /**
   * Currently displayed QR code.
   *
   * @type {number}
   */
  #step = 0;

  #caption = null;
  #image = null;

  connectedCallback() {
    if (this.hasConnected) {
      return;
    }
    this.hasConnected = true;

    const template = document
      .getElementById("qrCodeWizardTemplate")
      .content.cloneNode(true);
    this.append(template);

    this.#caption = this.querySelector("figcaption");
    this.#image = this.querySelector("img");
  }

  /**
   * Initialize the QR codes for this wizard. Starts the wizard at the first
   * code.
   *
   * @param {string[]} accountKeys - Keys of the accounts to generate QR codes
   *   for.
   * @param {boolean} includePasswords - If passwords should be included in the
   *   QR codes.
   */
  initializeQRCodes(accountKeys, includePasswords) {
    this.#codes = lazy.QRExport.getQRCodes(accountKeys, includePasswords);
    this.#step = 0;
    this.#showCode(this.#step);
  }

  /**
   * Advance to the next QR code.
   *
   * @returns {boolean} If the next code was shown. False if there are no more
   *   codes to show.
   */
  next() {
    const nextStep = this.#step + 1;
    if (nextStep === this.#codes.length) {
      return false;
    }
    this.#showCode(nextStep);
    return true;
  }

  /**
   * Go back to the previous QR code.
   *
   * @returns {boolean} If the previous code was shown. False if already at the
   *   beginning.
   */
  back() {
    if (this.#step === 0) {
      return false;
    }
    this.#showCode(this.#step - 1);
    return true;
  }

  /**
   * @returns {number} Total step count.
   */
  getTotalSteps() {
    return this.#codes.length;
  }

  /**
   * @returns {boolean} If the current step is the last step.
   */
  isLastStep() {
    return this.#step + 1 >= this.#codes.length;
  }

  /**
   * Show a specific QR code.
   *
   * @param {number} index - Index of the QR code to show.
   */
  #showCode(index) {
    const code = this.#codes[index];
    document.l10n.setAttributes(this.#caption, "qr-export-scan-progress", {
      step: index + 1,
      count: this.#codes.length,
    });
    this.#image.src = code;
    this.#step = index;
  }
}
customElements.define("qr-code-wizard", QrCodeWizard);
