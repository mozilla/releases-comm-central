/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import { UnifiedToolbarButton } from "./unified-toolbar-button.mjs";

/* import-globals-from ../../../base/content/globalOverlay.js */

/**
 * Mail tab specific unified toolbar button. Instead of tracking a global
 * command, its state gets re-evaluated every time the state of about:3pane or
 * about:message tab changes in a relevant way.
 */
export class MailTabButton extends UnifiedToolbarButton {
  /**
   * Array of events to listen for on the about:3pane document.
   *
   * @type {string[]}
   */
  observed3PaneEvents = ["folderURIChanged", "select"];

  /**
   * Array of events to listen for on the message browser.
   *
   * @type {string[]}
   */
  observedAboutMessageEvents = ["load"];

  /**
   * Listeners we've added in tabs.
   *
   * @type {{tabId: any, target: EventTarget, event: string, callback: function}[]}
   */
  #listeners = [];

  connectedCallback() {
    super.connectedCallback();
    this.#addTabListeners();
    this.onCommandContextChange();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    for (const listener of this.#listeners) {
      listener.target.removeEventListener(listener.event, listener.callback);
    }
    this.#listeners.length = 0;
  }

  /**
   * Callback for customizable-element when the current tab is switched while
   * this button is visible.
   */
  onTabSwitched() {
    this.#addTabListeners();
    this.onCommandContextChange();
  }

  /**
   * Callback for customizable-element when a tab is closed.
   *
   * @param {TabInfo} tab
   */
  onTabClosing(tab) {
    this.#removeListenersForTab(tab.tabId);
  }

  /**
   * Remove all event listeners this button has for a given tab.
   *
   * @param {*} tabId - ID of the tab to remove listeners for.
   */
  #removeListenersForTab(tabId) {
    for (const listener of this.#listeners) {
      if (listener.tabId === tabId) {
        listener.target.removeEventListener(listener.event, listener.callback);
      }
    }
    this.#listeners = this.#listeners.filter(
      listener => listener.tabId !== tabId
    );
  }

  /**
   * Add missing event listeners for the current tab.
   */
  #addTabListeners() {
    const tabmail = document.getElementById("tabmail");
    const tabId = tabmail.currentTabInfo.tabId;
    const existingListeners = this.#listeners.filter(
      listener => listener.tabId === tabId
    );
    let expectedEventListeners = [];
    switch (tabmail.currentTabInfo.mode.name) {
      case "mail3PaneTab":
        expectedEventListeners = this.observed3PaneEvents.concat(
          this.observedAboutMessageEvents
        );
        break;
      case "mailMessageTab":
        expectedEventListeners = this.observedAboutMessageEvents.concat();
        break;
    }
    const missingListeners = expectedEventListeners.filter(event =>
      existingListeners.every(listener => listener.event !== event)
    );
    if (!missingListeners.length) {
      return;
    }
    const contentWindow = tabmail.currentTabInfo.chromeBrowser.contentWindow;
    for (const event of missingListeners) {
      const listener = {
        event,
        tabId,
        callback: this.#handle3PaneChange,
        target: contentWindow,
      };
      if (
        this.observedAboutMessageEvents.includes(event) &&
        contentWindow.messageBrowser
      ) {
        listener.target = contentWindow.messageBrowser.contentWindow;
      }
      listener.target.addEventListener(listener.event, listener.callback);
      this.#listeners.push(listener);
    }
  }

  /**
   * Event handling callback when an event by a tab is fired.
   */
  #handle3PaneChange = () => {
    this.onCommandContextChange();
  };

  /**
   * Handle the context changing, updating the disabled state for the button
   * etc.
   */
  onCommandContextChange() {
    if (!this.observedCommand) {
      return;
    }
    try {
      this.disabled = !getEnabledControllerForCommand(this.observedCommand);
    } catch {
      this.disabled = true;
    }
  }
}
customElements.define("mail-tab-button", MailTabButton, {
  extends: "button",
});
