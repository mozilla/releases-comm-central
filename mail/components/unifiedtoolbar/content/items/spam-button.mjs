/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import { MailTabButton } from "chrome://messenger/content/unifiedtoolbar/mail-tab-button.mjs";

/* globals getEnabledControllerForCommand, goDoCommand */

/**
 * Unified toolbar button that marks the selected message as spam or not spam.
 *
 * @augments {MailTabButton}
 */
class SpamButton extends MailTabButton {
  /**
   * Sets the spam button label according to the spam score of the first
   * selected message. Without any message whose spam score can be changed,
   * the button will be disabled.
   */
  onCommandContextChange() {
    try {
      const message = document.getElementById("tabmail").currentTabInfo.message;
      const isSpam =
        message &&
        message.getStringProperty("junkscore") ==
          Ci.nsIJunkMailPlugin.IS_SPAM_SCORE;

      if (isSpam) {
        this.setAttribute("label-id", `toolbar-not-spam-label`);
        document.l10n.setAttributes(this, `toolbar-not-spam`);
      } else {
        this.setAttribute("label-id", `toolbar-spam-label`);
        document.l10n.setAttributes(this, `toolbar-spam`);
      }
      this.disabled =
        !message ||
        !getEnabledControllerForCommand(
          isSpam ? "cmd_markAsJunk" : "cmd_markAsNotJunk"
        );
      this.dataset.isSpam = isSpam;
    } catch {
      this.disabled = true;
    }
  }

  /**
   * Trigger the command corresponding to the spam buttons state and update
   * the button afterwards.
   *
   * @param {Event} event
   */
  handleClick(event) {
    goDoCommand(
      event.target.dataset.isSpam == "false"
        ? "cmd_markAsJunk"
        : "cmd_markAsNotJunk"
    );
    this.onCommandContextChange();
    event.preventDefault();
    event.stopPropagation();
  }
}
customElements.define("spam-button", SpamButton, {
  extends: "button",
});
