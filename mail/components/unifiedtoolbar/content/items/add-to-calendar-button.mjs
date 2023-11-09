/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import { MailTabButton } from "chrome://messenger/content/unifiedtoolbar/mail-tab-button.mjs";

const lazy = {};
ChromeUtils.defineModuleGetter(
  lazy,
  "calendarDeactivator",
  "resource:///modules/calendar/calCalendarDeactivator.jsm"
);

/* import-globals-from ../../../../../calendar/base/content/calendar-extract.js */

/**
 * Unified toolbar button to add the selected message to a calendar as event or
 * task.
 * Attributes:
 * - type: "event" or "task", specifying the target type to create.
 */
class AddToCalendarButton extends MailTabButton {
  /**
   * Observer for the calendar-deactivated attribute.
   *
   * @type {MutationObserver}
   */
  #observer = null;

  connectedCallback() {
    super.connectedCallback();
    if (!this.#observer) {
      this.#observer = new MutationObserver(() =>
        this.onCommandContextChange()
      );
    }
    this.#observer.observe(window.document.documentElement, {
      attributes: true,
      attributeFilter: ["calendar-deactivated"],
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.#observer.disconnect();
  }

  onCommandContextChange() {
    const about3Pane = document.getElementById("tabmail").currentAbout3Pane;
    this.disabled =
      (about3Pane && !about3Pane.gDBView) ||
      (about3Pane?.gDBView?.numSelected ?? -1) === 0 ||
      !lazy.calendarDeactivator.isCalendarActivated;
  }

  handleClick = event => {
    const tabmail = document.getElementById("tabmail");
    const about3Pane = tabmail.currentAbout3Pane;
    const type = this.getAttribute("type");
    calendarExtract.extractFromEmail(
      tabmail.currentAboutMessage?.gMessage ||
        about3Pane.gDBView.hdrForFirstSelectedMessage,
      type !== "task"
    );
    event.preventDefault();
    event.stopPropagation();
  };
}
customElements.define("add-to-calendar-button", AddToCalendarButton, {
  extends: "button",
});
