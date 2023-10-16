/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import { MailTabButton } from "chrome://messenger/content/unifiedtoolbar/mail-tab-button.mjs";

class ViewPickerButton extends MailTabButton {
  observed3PaneEvents = ["folderURIChanged", "MailViewChanged"];

  observedAboutMessageEvents = [];

  /**
   * Update the label and icon of the button from the currently selected folder
   * in the local 3pane.
   */
  onCommandContextChange() {
    const { gViewWrapper } =
      document.getElementById("tabmail").currentAbout3Pane ?? {};
    if (!gViewWrapper) {
      this.disabled = true;
      return;
    }
    this.disabled = false;
    const viewPickerPopup = document.getElementById(this.getAttribute("popup"));
    const value = window.ViewPickerBinding.currentViewValue;
    let selectedItem = viewPickerPopup.querySelector(`[value="${value}"]`);
    if (!selectedItem) {
      // We may have a new item, so refresh to make it show up.
      window.RefreshAllViewPopups(viewPickerPopup, true);
      selectedItem = viewPickerPopup.querySelector(`[value="${value}"]`);
    }
    this.label.textContent = selectedItem?.getAttribute("label");
    if (!this.label.textContent) {
      document.l10n.setAttributes(this.label, "toolbar-view-picker-label");
    }
  }
}
customElements.define("view-picker-button", ViewPickerButton, {
  extends: "button",
});
