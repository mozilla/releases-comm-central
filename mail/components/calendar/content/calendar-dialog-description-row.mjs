/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import "./calendar-dialog-row.mjs"; // eslint-disable-line import/no-unassigned-import

/**
 * Template ID: #calendarDescriptionRowTemplate
 *
 * @tagname calendar-dialog-description-row
 * @attribute {string} [type] - If type is full, description is expanded with
 *  a browser, otherwise it is truncated.
 */
class CalendarDialogDescriptionRow extends HTMLElement {
  /**
   * Browser element for the expanded description.
   *
   * @type {XULBrowserElement}
   */
  browser = null;

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

    if (this.getAttribute("type") !== "full") {
      this.querySelector('[slot="content"]').className = "truncated-content";
    } else {
      const contentWrapper = this.querySelector('[slot="content"]');
      this.browser = document.createXULElement("browser");
      this.browser.setAttribute("id", "descriptionContent");
      this.browser.setAttribute("type", "content");
      contentWrapper.appendChild(this.browser);
    }

    row.toggleAttribute("expanded", this.getAttribute("type") === "full");
    row.toggleAttribute("expanding", this.getAttribute("type") !== "full");
  }

  /**
   * Sets the description of the calendar dialog row.
   *
   * @param {string} description
   */
  setDescription(description) {
    this.querySelector('[slot="content"]').textContent = description;
  }

  /**
   * Loads the expanded description content in the browser element.
   *
   * @param {string} description - The calendar event description.
   */
  // eslint-disable-next-line no-unused-vars
  setExpandedDescription(description) {
    // TODO: Deal with loading the browser description content.
    // const docFragment = cal.view.textToHtmlDocumentFragment(
    //   description,
    //   this.browser.contentDocument,
    //   descriptionHTML
    // );
    // // Make any links open in the user's default browser, not in Thunderbird.
    // for (const anchor of docFragment.querySelectorAll("a")) {
    //   anchor.addEventListener("click", function (event) {
    //     event.preventDefault();
    //     if (event.isTrusted) {
    //       // TODO: Open the link
    //       // openLink(anchor.getAttribute("href"), event);
    //     }
    //   });
    // }
  }
}

customElements.define(
  "calendar-dialog-description-row",
  CalendarDialogDescriptionRow
);
