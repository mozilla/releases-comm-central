/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals gMessageListeners, calImipBar */

// Wrap in a block to prevent leaking to window scope.
{
  const { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");

  /**
   * CalInvitationDisplay is the controller responsible for the display of the
   * invitation panel when an email contains an embedded invitation.
   */
  const CalInvitationDisplay = {
    /**
     * The itipItem currently displayed.
     *
     * @type {calIItipItem}
     */
    currentItipItem: null,

    /**
     * The XUL element that wraps the invitation.
     *
     * @type {XULElement}
     */
    container: null,

    /**
     * The node the invitation details are rendered into.
     *
     * @type {HTMLElement}
     */
    display: null,

    /**
     * The <browser> element that displays the message body. This is hidden
     * when the invitation details are displayed.
     */
    body: null,

    /**
     * Creates a new instance and sets up listeners.
     */
    init() {
      this.container = document.getElementById("calendarInvitationDisplayContainer");
      this.display = document.getElementById("calendarInvitationDisplay");
      this.body = document.getElementById("messagepane");

      window.addEventListener("onItipItemCreation", this);
      window.addEventListener("onItipItemActionFinished", this);
      window.addEventListener("messagepane-unloaded", this);
      document.getElementById("msgHeaderView").addEventListener("message-header-pane-hidden", this);
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
        case "onItipItemActionFinished":
          this.show(evt.detail);
          break;
        case "messagepane-unloaded":
        case "message-header-pane-hidden":
          this.hide();
          break;
        case "calendar-invitation-panel-action":
          if (evt.detail.type == "update") {
            calImipBar.executeAction();
          } else {
            calImipBar.executeAction(evt.detail.type.toUpperCase());
          }
          break;
        default:
          break;
      }
    },

    /**
     * Hide the invitation display each time a new message to display is
     * detected. If the message contains an invitation it will be displayed
     * in the "onItipItemCreation" handler.
     */
    onStartHeaders() {
      this.hide();
    },

    /**
     * Called by messageHeaderSink.
     */
    onEndHeaders() {},

    /**
     * Displays the invitation display with the data from the provided
     * calIItipItem.
     *
     * @param {calIItipItem} itipItem
     */
    async show(itipItem) {
      this.currentItipItem = itipItem;
      this.display.replaceChildren();

      const [, rc, actionFunc, foundItems] = await new Promise(resolve =>
        cal.itip.processItipItem(itipItem, (...args) => resolve([...args]))
      );

      if (this.currentItipItem != itipItem || !Components.isSuccessCode(rc)) {
        return;
      }

      const [item] = itipItem.getItemList();
      const [foundItem] = foundItems;
      const panel = document.createElement("calendar-invitation-panel");
      panel.addEventListener("calendar-invitation-panel-action", this);

      const method = actionFunc ? actionFunc.method : itipItem.receivedMethod;
      switch (method) {
        case "REQUEST:UPDATE":
          panel.mode = panel.constructor.MODE_UPDATE_MAJOR;
          break;
        case "REQUEST:UPDATE-MINOR":
          panel.mode = panel.constructor.MODE_UPDATE_MINOR;
          break;
        case "REQUEST":
          panel.mode = foundItem
            ? panel.constructor.MODE_ALREADY_PROCESSED
            : panel.constructor.MODE_NEW;
          break;
        case "CANCEL":
          panel.mode = foundItem
            ? panel.constructor.MODE_CANCELLED
            : panel.constructor.MODE_CANCELLED_NOT_FOUND;
          break;
        default:
          panel.mode = panel.mode = panel.constructor.MODE_NEW;
          break;
      }
      panel.foundItem = foundItem;
      panel.item = item;
      this.display.appendChild(panel);
      this.body.hidden = true;
      this.container.hidden = false;
    },

    /**
     * Removes the invitation display from view, resetting any changes made
     * to the container and message pane.
     */
    hide() {
      this.container.hidden = true;
      this.display.replaceChildren();
      this.body.hidden = false;
    },
  };

  window.addEventListener("DOMContentLoaded", CalInvitationDisplay, { once: true });
}
