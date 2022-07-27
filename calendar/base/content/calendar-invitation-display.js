/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals gMessageListeners */

// Wrap in a block to prevent leaking to window scope.
{
  /**
   * CalInvitationDisplay is the controller responsible for the display of the
   * invitation panel when an email contains an embedded invitation.
   */
  const CalInvitationDisplay = {
    /**
     * The node we render the invitation to.
     * @type {HTMLElement}
     */
    display: null,

    /**
     * Creates a new instance and sets up listeners.
     */
    init() {
      this.display = document.getElementById("calendarInvitationDisplay");
      window.addEventListener("onItipItemCreation", this);
      window.addEventListener("messagepane-unloaded", this);
      gMessageListeners.push(this);
    },

    /**
     * Renders the panel with invitation details when "onItipItemCreation" is
     * received.
     *
     * @param {Event} evt
     */
    handleEvent(evt) {
      switch (evt.type) {
        case "DOMContentLoaded":
          this.init();
          break;

        case "onItipItemCreation":
          let panel = document.createElement("calendar-invitation-panel");
          this.display.replaceChildren(panel);
          panel.itipItem = evt.detail;
          this.display.hidden = false;
          break;

        default:
          break;
      }
    },

    /**
     * Removes the panel from view each time a new message is loaded.
     */
    onStartHeaders() {
      this.display.hidden = true;
      this.display.replaceChildren();
    },

    onEndHeaders() {},
  };

  window.addEventListener("DOMContentLoaded", CalInvitationDisplay, { once: true });
}
