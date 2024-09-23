/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from about3Pane.js */

ChromeUtils.defineESModuleGetters(this, {
  MessageTextFilter: "resource:///modules/QuickFilterManager.sys.mjs",
  QuickFilterManager: "resource:///modules/QuickFilterManager.sys.mjs",
  QuickFilterSearchListener: "resource:///modules/QuickFilterManager.sys.mjs",
  QuickFilterState: "resource:///modules/QuickFilterManager.sys.mjs",
  SearchSpec: "resource:///modules/SearchSpec.sys.mjs",
  XULStoreUtils: "resource:///modules/XULStoreUtils.sys.mjs",
});

import("chrome://messenger/content/search-bar.mjs").catch(console.error);

class ToggleButton extends HTMLButtonElement {
  constructor() {
    super();
    this.addEventListener("click", () => {
      this.pressed = !this.pressed;
    });
  }

  connectedCallback() {
    this.setAttribute("is", "toggle-button");
    if (!this.hasAttribute("aria-pressed")) {
      this.pressed = false;
    }
  }

  get pressed() {
    return this.getAttribute("aria-pressed") === "true";
  }

  set pressed(value) {
    this.setAttribute("aria-pressed", value ? "true" : "false");
  }
}
customElements.define("toggle-button", ToggleButton, { extends: "button" });

var quickFilterBar = {
  _filterer: null,
  activeTopLevelFilters: new Set(),
  topLevelFilters: ["unread", "starred", "addrBook", "attachment"],

  /**
   * This identifies the timer for the deferred search, which is cleared when
   * another deferred search is scheduled.
   *
   * @type {integer}
   */
  searchTimeoutID: 0,

  async init() {
    await window.customElements.whenDefined("search-bar");
    this._bindUI();
    this.updateRovingTab();

    // Hide the toolbar, unless it has been previously shown.
    this._showFilterBar(
      XULStoreUtils.isItemVisible("messenger", "quickFilterBar"),
      true
    );

    commandController.registerCallback("cmd_showQuickFilterBar", () => {
      if (!this.filterer.visible) {
        this._showFilterBar(true);
      }
      document.getElementById(QuickFilterManager.textBoxDomId).focus();
    });
    commandController.registerCallback("cmd_toggleQuickFilterBar", () => {
      const show = !this.filterer.visible;
      this._showFilterBar(show);
      if (show) {
        document.getElementById(QuickFilterManager.textBoxDomId).focus();
      }
    });
    commandController.registerCallback("cmd_resetQuickFilterBar", () => {
      if (this.filterer.visible) {
        this._resetFilterState();
      }
    });
    window.addEventListener("keypress", event => {
      if (event.keyCode != KeyEvent.DOM_VK_ESCAPE || !this.filterer.visible) {
        // The filter bar isn't visible, do nothing.
        return;
      }
      if (this.filterer.userHitEscape()) {
        // User hit the escape key; do our undo-ish thing.
        this.updateSearch();
        this.reflectFiltererState();
      } else {
        // Close the filter since there was nothing left to relax.
        this._showFilterBar(false);
      }
    });

    document.getElementById("qfd-dropdown").addEventListener("click", event => {
      document
        .getElementById("quickFilterButtonsContext")
        .openPopup(event.target, { triggerEvent: event });
    });

    for (const buttonGroup of this.rovingGroups) {
      buttonGroup.addEventListener("keypress", event => {
        this.triggerQFTRovingTab(event);
      });
    }

    document.getElementById("qfb-sticky").addEventListener("click", event => {
      const stickyValue = event.target.pressed ? "true" : "false";
      XULStoreUtils.setValue(
        "messenger",
        "quickFilterBarSticky",
        "enabled",
        stickyValue
      );
    });
  },

  /**
   * Get all button groups with the roving-group class.
   *
   * @returns {Array} An array of buttons.
   */
  get rovingGroups() {
    return document.querySelectorAll("#quick-filter-bar .roving-group");
  },

  /**
   * Update the `tabindex` attribute of the buttons.
   */
  updateRovingTab() {
    for (const buttonGroup of this.rovingGroups) {
      for (const button of buttonGroup.querySelectorAll("button")) {
        button.tabIndex = -1;
      }
      // Allow focus on the first available button.
      buttonGroup.querySelector("button").tabIndex = 0;
    }
  },

  /**
   * Handles the keypress event on the button group.
   *
   * @param {Event} event - The keypress DOMEvent.
   */
  triggerQFTRovingTab(event) {
    if (!["ArrowRight", "ArrowLeft"].includes(event.key)) {
      return;
    }

    const buttonGroup = [
      ...event.target
        .closest(".roving-group")
        .querySelectorAll(`[is="toggle-button"]`),
    ];
    const focusableButton = buttonGroup.find(b => b.tabIndex != -1);
    let elementIndex = buttonGroup.indexOf(focusableButton);

    // Find the adjacent focusable element based on the pressed key.
    const isRTL = document.dir == "rtl";
    if (
      (isRTL && event.key == "ArrowLeft") ||
      (!isRTL && event.key == "ArrowRight")
    ) {
      elementIndex++;
      if (elementIndex > buttonGroup.length - 1) {
        elementIndex = 0;
      }
    } else if (
      (!isRTL && event.key == "ArrowLeft") ||
      (isRTL && event.key == "ArrowRight")
    ) {
      elementIndex--;
      if (elementIndex == -1) {
        elementIndex = buttonGroup.length - 1;
      }
    }

    // Move the focus to a button and update the tabindex attribute.
    const newFocusableButton = buttonGroup[elementIndex];
    if (newFocusableButton) {
      focusableButton.tabIndex = -1;
      newFocusableButton.tabIndex = 0;
      newFocusableButton.focus();
    }
  },

  get filterer() {
    if (!this._filterer) {
      this._filterer = new QuickFilterState();
      const _states = XULStoreUtils.getValue(
        "messenger",
        "quickFilter",
        "textFilters"
      );
      if (_states) {
        this._filterer.filterValues.text = {
          text: null,
          states: JSON.parse(_states),
        };
      }
      this._filterer.visible = false;
    }
    return this._filterer;
  },

  set filterer(value) {
    this._filterer = value;
  },

  // ---------------------
  // UI State Manipulation

  /**
   * Add appropriate event handlers to the DOM elements.  We do this rather
   *  than requiring lots of boilerplate "oncommand" junk on the nodes.
   *
   * We hook up the following:
   * - "command" event listener.
   * - reflect filter state
   */
  _bindUI() {
    for (const filterDef of QuickFilterManager.filterDefs) {
      const domNode = document.getElementById(filterDef.domId);
      const menuItemNode = document.getElementById(filterDef.menuItemID);

      let handlerDomId, handlerMenuItems;

      if (!("onCommand" in filterDef)) {
        handlerDomId = () => {
          try {
            const postValue = domNode.pressed ? true : null;
            this.filterer.setFilterValue(filterDef.name, postValue);
            this.updateFiltersSettings(filterDef.name, postValue);
            this.deferredUpdateSearch();
          } catch (ex) {
            console.error(ex);
          }
        };
        handlerMenuItems = () => {
          try {
            const postValue = menuItemNode.hasAttribute("checked")
              ? true
              : null;
            this.filterer.setFilterValue(filterDef.name, postValue);
            this.updateFiltersSettings(filterDef.name, postValue);
            this.deferredUpdateSearch();
          } catch (ex) {
            console.error(ex);
          }
        };
      } else {
        handlerDomId = event => {
          if (filterDef.name == "tags") {
            filterDef.callID = "button";
          }
          const filterValues = this.filterer.filterValues;
          const preValue =
            filterDef.name in filterValues
              ? filterValues[filterDef.name]
              : null;
          const [postValue, update] = filterDef.onCommand(
            preValue,
            domNode,
            event,
            document
          );
          this.filterer.setFilterValue(filterDef.name, postValue, !update);
          this.updateFiltersSettings(filterDef.name, postValue);
          if (update) {
            this.deferredUpdateSearch();
          }
        };
        handlerMenuItems = event => {
          if (filterDef.name == "tags") {
            filterDef.callID = "menuItem";
          }
          const filterValues = this.filterer.filterValues;
          const preValue =
            filterDef.name in filterValues
              ? filterValues[filterDef.name]
              : null;
          const [postValue, update] = filterDef.onCommand(
            preValue,
            menuItemNode,
            event,
            document
          );
          this.filterer.setFilterValue(filterDef.name, postValue, !update);
          this.updateFiltersSettings(filterDef.name, postValue);
          if (update) {
            this.deferredUpdateSearch();
          }
        };
      }
      if (domNode.tagName === "search-bar") {
        domNode.addEventListener("autocomplete", handlerDomId);
        domNode.addEventListener("search", handlerDomId);
      } else if (
        domNode.namespaceURI == document.documentElement.namespaceURI
      ) {
        domNode.addEventListener("click", handlerDomId);
      } else {
        domNode.addEventListener("command", handlerDomId);
      }
      if (menuItemNode !== null) {
        menuItemNode.addEventListener("command", handlerMenuItems);
      }

      if ("domBindExtra" in filterDef) {
        filterDef.domBindExtra(document, this, domNode);
      }
    }
  },

  /**
   * Reflect persisted user settings in the DOM.
   */
  reflectPersistedFilters() {
    if (!this._filterer.visible) {
      return;
    }

    // If keep filters applied/sticky setting is enabled, enable sticky.
    const xulStickyVal = XULStoreUtils.getValue(
      "messenger",
      "quickFilterBarSticky",
      "enabled"
    );
    if (!xulStickyVal) {
      return;
    }
    this.filterer.setFilterValue("sticky", xulStickyVal == "true");

    // If sticky setting is set, show any saved filters.
    // Otherwise do not display saved filters on load.
    if (xulStickyVal != "true") {
      return;
    }
    const enabledTopFiltersVal = XULStoreUtils.getValue(
      "messenger",
      "quickFilter",
      "enabledTopFilters"
    );
    if (!enabledTopFiltersVal) {
      return;
    }
    // Set any enabled filters to enabled in the UI.
    const enabledTopFilters = JSON.parse(enabledTopFiltersVal);
    for (const filterName of enabledTopFilters) {
      this.activeTopLevelFilters.add(filterName);
      this.filterer.setFilterValue(filterName, true);
    }
  },

  /**
   * Update enabled filters in XULStore.
   */
  updateFiltersSettings(filterName, filterValue) {
    if (this.topLevelFilters.includes(filterName)) {
      this.updateTopLevelFilters(filterName, filterValue);
    }
  },

  /**
   * Update enabled top level filters in XULStore.
   */
  updateTopLevelFilters(filterName, filterValue) {
    if (filterValue) {
      this.activeTopLevelFilters.add(filterName);
    } else {
      this.activeTopLevelFilters.delete(filterName);
    }

    // Save enabled filter settings to XULStore.
    XULStoreUtils.setValue(
      "messenger",
      "quickFilter",
      "enabledTopFilters",
      JSON.stringify(Array.from(this.activeTopLevelFilters))
    );
  },

  /**
   * Ensure all the quick filter menuitems in the quick filter dropdown menu are
   * checked to reflect their current state.
   */
  updateCheckedStateQuickFilterButtons() {
    for (const item of document.querySelectorAll(".quick-filter-menuitem")) {
      if (Object.hasOwn(this.filterer.filterValues, `${item.value}`)) {
        item.setAttribute("checked", true);
        continue;
      }
      item.removeAttribute("checked");
    }
  },

  /**
   * Update the UI to reflect the state of the filterer constraints.
   *
   * @param [aFilterName] If only a single filter needs to be updated, name it.
   */
  reflectFiltererState(aFilterName) {
    // If we aren't visible then there is no need to update the widgets.
    if (this.filterer.visible) {
      const filterValues = this.filterer.filterValues;
      for (const filterDef of QuickFilterManager.filterDefs) {
        // If we only need to update one state, check and skip as appropriate.
        if (aFilterName && filterDef.name != aFilterName) {
          continue;
        }

        const domNode = document.getElementById(filterDef.domId);

        const value =
          filterDef.name in filterValues ? filterValues[filterDef.name] : null;
        if (!("reflectInDOM" in filterDef)) {
          domNode.pressed = value;
        } else {
          filterDef.reflectInDOM(domNode, value, document, this);
        }
      }
    }

    this.reflectFiltererResults();

    if (this.domNode.hidden == this.filterer.visible) {
      this.domNode.hidden = !this.filterer.visible;
      window.dispatchEvent(new Event("qfbtoggle"));
    }
  },

  /**
   * Update the UI to reflect the state of the folderDisplay in terms of
   *  filtering.  This is expected to be called by |reflectFiltererState| and
   *  when something happens event-wise in terms of search.
   *
   * We can have one of two states:
   * - No filter is active; nothing exposed for CSS to do anything.
   * - A filter is active and we are still searching; class `searching` added.
   */
  reflectFiltererResults() {
    // Bail early if the view is in the process of being created.
    if (!gDBView) {
      return;
    }
    this.domNode.classList.toggle("searching", gViewWrapper.searching);
  },

  // ----------------------
  // Event Handling Support

  /**
   * Retrieve the current filter state value (presumably an object) for mutation
   *  purposes.  This causes the filter to be the last touched filter for escape
   *  undo-ish purposes.
   */
  getFilterValueForMutation(aName) {
    return this.filterer.getFilterValue(aName);
  },

  /**
   * Set the filter state for the given named filter to the given value.  This
   *  causes the filter to be the last touched filter for escape undo-ish
   *  purposes.
   *
   * @param aName Filter name.
   * @param aValue The new filter state.
   */
  setFilterValue(aName, aValue) {
    this.filterer.setFilterValue(aName, aValue);
  },

  /**
   * For UI responsiveness purposes, defer the actual initiation of the search
   * until after the button click handling has completed and had the ability
   * to paint such.
   */
  deferredUpdateSearch() {
    clearTimeout(this.searchTimeoutID);
    this.searchTimeoutID = setTimeout(() => this.updateSearch());
  },

  /**
   * Update the user terms part of the search definition to reflect the active
   * filterer's current state.
   */
  updateSearch() {
    if (!this._filterer || !gViewWrapper?.search) {
      return;
    }

    this.filterer.displayedFolder = gFolder;

    const [terms, listeners] = this.filterer.createSearchTerms(
      gViewWrapper.search.session
    );

    for (const [listener, filterDef] of listeners) {
      // it registers itself with the search session.
      new QuickFilterSearchListener(
        gViewWrapper,
        this.filterer,
        filterDef,
        listener,
        quickFilterBar
      );
    }

    gViewWrapper.search.userTerms = terms;
    // Uncomment to know what the search state is when we (try and) update it.
    // dump(tab.folderDisplay.view.search.prettyString());
  },

  /**
   * Shows and hides quick filter bar, and sets the XUL Store value for the
   * quick filter bar status.
   *
   * @param {boolean} show - Filter Status.
   * @param {boolean} [init=false] - Initial Function Call.
   */
  _showFilterBar(show, init = false) {
    this.filterer.visible = show;
    // Clear all filters if the QFB is hidden.
    if (!show) {
      this.filterer.clear();
    }

    // Update the UI of toggled filters.
    this.reflectPersistedFilters();
    this.reflectFiltererState();
    XULStoreUtils.setValue("messenger", "quickFilterBar", "visible", show);

    // Update the message list to reflect the filters status.
    this.updateSearch();
    // Cannot call the below function when threadTree hasn't been initialized yet.
    if (!init) {
      threadTree.table.body.focus();
    }
  },

  /**
   * Called by the view wrapper so we can update the results count.
   */
  onMessagesChanged() {
    const filtering = gViewWrapper?.search?.userTerms != null;
    const newCount = filtering ? gDBView.numMsgsInView : null;
    this.filterer.setFilterValue("results", newCount, true);

    // - postFilterProcess everyone who cares
    // This may need to be converted into an asynchronous process at some point.
    for (const filterDef of QuickFilterManager.filterDefs) {
      if ("postFilterProcess" in filterDef) {
        const preState =
          filterDef.name in this.filterer.filterValues
            ? this.filterer.filterValues[filterDef.name]
            : null;
        const [newState, update, treatAsUserAction] =
          filterDef.postFilterProcess(preState, gViewWrapper, filtering);
        this.filterer.setFilterValue(
          filterDef.name,
          newState,
          !treatAsUserAction
        );
        if (update) {
          const domNode = document.getElementById(filterDef.domId);
          // We are passing update as a super-secret data propagation channel
          //  exclusively for one-off cases like the text filter gloda upsell.
          filterDef.reflectInDOM(domNode, newState, document, this, update);
        }
      }
    }

    // - Update match status.
    this.reflectFiltererState();
  },

  /**
   * The displayed folder changed. Reset or reapply the filter, depending on
   * the sticky state.
   */
  onFolderChanged() {
    this.filterer = new QuickFilterState(this.filterer);
    this.reflectFiltererState();
    if (this._filterer?.filterValues.sticky) {
      this.updateSearch();
    }
  },

  /**
   * Completely reset the state of the quick filter bar. This is necessary
   * when applying a special view, as well as for testing purposes.
   */
  _resetFilterState() {
    if (!this._filterer) {
      return;
    }
    // Unset sticky value.
    if (this._filterer?.filterValues.sticky) {
      XULStoreUtils.setValue(
        "messenger",
        "quickFilterBarSticky",
        "enabled",
        "false"
      );
    }
    this._filterer = new QuickFilterState();
    this.updateSearch();
    this.reflectFiltererState();
  },
};
ChromeUtils.defineLazyGetter(quickFilterBar, "domNode", () =>
  document.getElementById("quick-filter-bar")
);
