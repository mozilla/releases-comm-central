/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Calendar Dialog Acceptance Widget
 * Template ID: #calendarDialogAcceptanceTemplate (from calendarDialogAcceptance.inc.xhtml)
 *
 * @tagname calendar-dialog-acceptance
 */
export class CalendarDialogAcceptance extends HTMLElement {
  async connectedCallback() {
    if (this.shadowRoot) {
      return;
    }

    const shadowRoot = this.attachShadow({ mode: "open" });

    const style = document.createElement("link");
    style.rel = "stylesheet";
    style.href =
      "chrome://messenger/skin/calendar/calendarDialogAcceptance.css";

    const template = document.getElementById(
      "calendarDialogAcceptanceTemplate"
    );
    const clonedNode = template.content.cloneNode(true);

    document.l10n.connectRoot(this.shadowRoot);
    shadowRoot.append(clonedNode, style);

    window.MozXULElement?.insertFTLIfNeeded("messenger/calendarDialog.ftl");
  }

  disconnectedCallback() {
    document.l10n.disconnectRoot(this.shadowRoot);
  }
}

customElements.define("calendar-dialog-acceptance", CalendarDialogAcceptance);
