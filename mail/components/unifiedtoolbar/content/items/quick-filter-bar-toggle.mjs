/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import { MailTabButton } from "chrome://messenger/content/unifiedtoolbar/mail-tab-button.mjs";

/**
 * Unified toolbar button for toggling the quick filter bar.
 */
class QuickFilterBarToggle extends MailTabButton {
  observed3PaneEvents = ["folderURIChanged", "select", "qfbtoggle"];
  observedAboutMessageEvents = [];

  onCommandContextChange() {
    super.onCommandContextChange();
    const tabmail = document.getElementById("tabmail");
    const about3Pane = tabmail.currentAbout3Pane;
    if (
      !about3Pane?.paneLayout ||
      about3Pane.paneLayout.accountCentralVisible
    ) {
      this.disabled = true;
      this.setAttribute("aria-pressed", "false");
      return;
    }
    const active = about3Pane.quickFilterBar.filterer.visible;
    this.setAttribute("aria-pressed", active.toString());
  }
}
customElements.define("quick-filter-bar-toggle", QuickFilterBarToggle, {
  extends: "button",
});
