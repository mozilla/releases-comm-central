/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

const { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);
const { XULStoreUtils } = ChromeUtils.importESModule(
  "resource:///modules/XULStoreUtils.sys.mjs"
);

/**
 * Defines the main body element responsible for the general layout of the
 * about3pane.
 */
class PaneLayout extends HTMLBodyElement {
  constructor() {
    super();
    XPCOMUtils.defineLazyPreferenceGetter(
      this,
      "layoutPreference",
      "mail.pane_config.dynamic",
      null,
      (prefName, oldValue, newValue) => this.#setLayout(newValue)
    );
  }

  /**
   * Maps the splitter IDs against the container IDs that need to be expanded
   * or collapsed.
   *
   * @type {Map}
   */
  static #STORE_MAP = new Map([
    ["folderPaneSplitter", "folderPaneBox"],
    ["messagePaneSplitter", "messagepaneboxwrapper"],
  ]);

  /**
   * If the account central browser is currently visible.
   *
   * @returns {boolean}
   */
  get accountCentralVisible() {
    return this.classList.contains("account-central");
  }

  /**
   * If the folderPaneSplitter is not collapsed.
   *
   * @returns {boolean}
   */
  get folderPaneVisible() {
    return !this.folderPaneSplitter.isCollapsed;
  }
  set folderPaneVisible(visible) {
    this.folderPaneSplitter.isCollapsed = !visible;
  }

  /**
   * If the messagePaneSplitter is not collapsed.
   *
   * @returns {boolean}
   */
  get messagePaneVisible() {
    return !this.messagePaneSplitter?.isCollapsed;
  }
  set messagePaneVisible(visible) {
    this.messagePaneSplitter.isCollapsed = !visible;
  }

  connectedCallback() {
    if (this.hasConnected) {
      return;
    }
    this.hasConnected = true;

    // We need to wait for the entire DOM to be loaded so the child nodes are
    // available for grabbing.
    if (document.readyState != "loading") {
      this.#initialize();
      return;
    }

    document.addEventListener("DOMContentLoaded", this, { once: true });
  }

  handleEvent(event) {
    switch (event.type) {
      case "DOMContentLoaded":
        this.#initialize();
        break;
      case "splitter-collapsed":
        this.dispatchEvent(
          new CustomEvent("request-message-clear", {
            bubbles: true,
          })
        );
        XULStoreUtils.setValue(
          "messenger",
          "messagepaneboxwrapper",
          "collapsed",
          true
        );
        break;
      case "splitter-expanded":
        this.dispatchEvent(
          new CustomEvent("request-message-selection", {
            bubbles: true,
          })
        );
        XULStoreUtils.setValue(
          "messenger",
          "messagepaneboxwrapper",
          "collapsed",
          false
        );
        break;
      case "splitter-resized": {
        const storeID = PaneLayout.#STORE_MAP.get(event.originalTarget.id);
        if (!storeID) {
          return;
        }

        const splitter = event.target;
        const dimension =
          splitter.resizeDirection == "vertical" ? "height" : "width";
        XULStoreUtils.setValue(
          "messenger",
          storeID,
          dimension,
          splitter[dimension]
        );
        break;
      }
    }
  }

  #initialize() {
    this.folderPaneSplitter = this.querySelector("#folderPaneSplitter");
    this.folderPaneSplitter.addEventListener("splitter-resized", this);
    this.#setValues(this.folderPaneSplitter, ["width"]);

    this.messagePaneSplitter = this.querySelector("#messagePaneSplitter");
    this.messagePaneSplitter.addEventListener("splitter-collapsed", this);
    this.messagePaneSplitter.addEventListener("splitter-expanded", this);
    this.messagePaneSplitter.addEventListener("splitter-resized", this);
    this.#setValues(this.messagePaneSplitter, ["height", "width"]);

    this.#setLayout(this.layoutPreference);
  }

  /**
   * Restore the the xul store values if we have any.
   *
   * @param {PaneSplitter} splitter - The splitter element.
   * @param {string[]} properties - Array of properties for the xul store.
   * @param {string} storeID - The ID used by the xul store.
   */
  #setValues(splitter, properties) {
    const storeID = PaneLayout.#STORE_MAP.get(splitter.id);
    if (!storeID) {
      return;
    }

    for (const property of properties) {
      const value = XULStoreUtils.getValue("messenger", storeID, property);
      if (value) {
        splitter[property] = value;
      }
    }
  }

  /**
   * Update the page layout base on the users' preference.
   *
   * @param {integer} preference - The currently stored preference integer.
   */
  #setLayout(preference) {
    this.classList.remove("layout-classic", "layout-vertical", "layout-wide");
    switch (preference) {
      case 1:
        this.classList.add("layout-wide");
        this.messagePaneSplitter.resizeDirection = "vertical";
        break;
      case 2:
        this.classList.add("layout-vertical");
        this.messagePaneSplitter.resizeDirection = "horizontal";
        break;
      default:
        this.classList.add("layout-classic");
        this.messagePaneSplitter.resizeDirection = "vertical";
        break;
    }
  }
}
customElements.define("pane-layout", PaneLayout, { extends: "body" });
