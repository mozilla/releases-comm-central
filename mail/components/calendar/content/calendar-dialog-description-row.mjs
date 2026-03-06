/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals launchBrowser */

import "./calendar-dialog-row.mjs"; // eslint-disable-line import/no-unassigned-import

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  cal: "resource:///modules/calendar/calUtils.sys.mjs",
});

/**
 * Template ID: #calendarDescriptionRowTemplate
 *
 * @tagname calendar-dialog-description-row
 * @attribute {string} [type] - If type is full, description is expanded with
 *  a browser, otherwise it is truncated.
 */
class CalendarDialogDescriptionRow extends HTMLElement {
  /**
   * If the full or partial description is being shown.
   *
   * @type {boolean}
   */
  #isFullDescription;

  /**
   *  The browser used to display the rich description.
   *
   * @type {HTMLElement}
   */
  #browser;

  /**
   * Data cache if setDescription is called before we are connected to the DOM.
   *
   * @type {[string, string]}
   */
  #data;

  async connectedCallback() {
    if (this.hasConnected) {
      return;
    }

    const template = document
      .getElementById("calendarDialogDescriptionRowTemplate")
      .content.cloneNode(true);
    this.append(template);

    const row = this.querySelector("calendar-dialog-row");

    this.#isFullDescription = this.getAttribute("type") === "full";
    row
      .querySelector('[slot="content"]')
      .classList.toggle("truncated-content", !this.#isFullDescription);
    row.toggleAttribute("expanded", this.#isFullDescription);
    row.toggleAttribute("expanding", !this.#isFullDescription);

    if (!this.#isFullDescription) {
      this.hasConnected = true;
      return;
    }

    const browser = this.querySelector(".rich-description");
    // Wait for the browser to load the correct document.
    while (
      browser.contentWindow.location.href !==
        "chrome://messenger/content/eventDescription.html" ||
      browser.contentDocument.readyState === "loading"
    ) {
      await new Promise(resolve =>
        browser.addEventListener("load", resolve, { once: true, capture: true })
      );
    }

    this.#browser = browser;
    this.hasConnected = true;

    if (this.#data) {
      this.setDescription(...this.#data);
      this.#data = null;
    }
  }

  handleEvent(event) {
    const link = event.target.closest("a");
    if (!link) {
      return null;
    }

    launchBrowser(link.href, event);

    return false;
  }

  /**
   * Sets the description of the calendar dialog row.
   *
   * @param {string} description
   * @param {string} [descriptionHTML] - The HTML event description.
   */
  setDescription(description, descriptionHTML) {
    if (!this.hasConnected) {
      this.#data = [description, descriptionHTML];
      return;
    }
    this.querySelector(".plain-text-description").textContent = description;
    if (!this.#isFullDescription) {
      this.dispatchEvent(
        new CustomEvent("toggleRowVisibility", {
          bubbles: true,
          detail: {
            isHidden: !description,
          },
        })
      );
      return;
    }

    if (!description && !descriptionHTML) {
      this.#browser?.contentDocument.body.replaceChildren();
      return;
    }

    const docFragment = lazy.cal.view.textToHtmlDocumentFragment(
      description,
      this.#browser.contentDocument,
      descriptionHTML
    );
    this.#browser.contentDocument.addEventListener("click", this);
    this.#browser.contentDocument.body.replaceChildren(docFragment);
  }
}

customElements.define(
  "calendar-dialog-description-row",
  CalendarDialogDescriptionRow
);
