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

    this.messagePaneSplitter = this.querySelector("#messagePaneSplitter");
    this.messagePaneSplitter.addEventListener("splitter-collapsed", this);
    this.messagePaneSplitter.addEventListener("splitter-expanded", this);
    this.messagePaneSplitter.addEventListener("splitter-resized", this);

    this.#setLayout(this.layoutPreference);
    this.#setValues(this.folderPaneSplitter, ["width"]);
    this.#setValues(this.messagePaneSplitter, ["height", "width"]);
  }

  /**
   * Restore the the xul store values if we have any.
   *
   * @param {PaneSplitter} splitter - The splitter element.
   * @param {string[]} properties - Array of properties for the xul store.
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
        this.#configureMessagePaneSplitter("vertical", [
          "threadPane",
          "folderPane",
        ]);
        break;
      case 2:
        this.classList.add("layout-vertical");
        this.#configureMessagePaneSplitter("horizontal", [
          "threadPane",
          "folderPane",
        ]);
        break;
      default:
        this.classList.add("layout-classic");
        // In Classic view the folder pane is a full-height column spanning
        // the thread, splitter, and message rows. Locking its height
        // inflates the minimum of every row it spans, preventing the thread
        // pane from shrinking and leaving a gap above the message pane.
        this.#configureMessagePaneSplitter("vertical", ["threadPane"]);
        break;
    }
  }

  /**
   * Point the message pane splitter at the right resize axis and lock
   * targets for the current layout.
   *
   * @param {"vertical"|"horizontal"} direction - The resize direction.
   * @param {string[]} lockIds - IDs of the panes to lock while resizing with
   *   the window.
   */
  #configureMessagePaneSplitter(direction, lockIds) {
    this.messagePaneSplitter.setAttribute("resize-lock-ids", lockIds.join(","));
    this.messagePaneSplitter.resizeDirection = direction;
  }
}
customElements.define("pane-layout", PaneLayout, { extends: "body" });
