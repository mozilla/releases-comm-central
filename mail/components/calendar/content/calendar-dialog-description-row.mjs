/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

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
  connectedCallback() {
    if (this.hasConnected) {
      return;
    }

    this.hasConnected = true;
    const template = document
      .getElementById("calendarDialogDescriptionRowTemplate")
      .content.cloneNode(true);
    this.append(template);

    const row = this.querySelector("calendar-dialog-row");

    const isFullDescription = this.getAttribute("type") === "full";
    row
      .querySelector('[slot="content"]')
      .classList.toggle("truncated-content", !isFullDescription);
    row.toggleAttribute("expanded", isFullDescription);
    row.toggleAttribute("expanding", !isFullDescription);
  }

  /**
   * Sets the description of the calendar dialog row.
   *
   * @param {string} description
   * @param {string} [descriptionHTML] - The HTML event description.
   */
  async setDescription(description, descriptionHTML) {
    this.querySelector(".plain-text-description").textContent = description;

    if (this.getAttribute("type") !== "full") {
      this.querySelector("calendar-dialog-row").classList.add("labelless");
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
    if (!description && !descriptionHTML) {
      browser.contentDocument.body.replaceChildren();
      return;
    }
    const docFragment = lazy.cal.view.textToHtmlDocumentFragment(
      description,
      browser.contentDocument,
      descriptionHTML
    );
    browser.contentDocument.body.replaceChildren(docFragment);
  }
}

customElements.define(
  "calendar-dialog-description-row",
  CalendarDialogDescriptionRow
);
