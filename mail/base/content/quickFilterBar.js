/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from about3Pane.js */

var { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);
XPCOMUtils.defineLazyModuleGetters(this, {
  MessageTextFilter: "resource:///modules/QuickFilterManager.jsm",
  SearchSpec: "resource:///modules/SearchSpec.jsm",
  QuickFilterManager: "resource:///modules/QuickFilterManager.jsm",
  QuickFilterSearchListener: "resource:///modules/QuickFilterManager.jsm",
  QuickFilterState: "resource:///modules/QuickFilterManager.jsm",
});

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

  init() {
    this._bindUI();

    // Show the toolbar, unless it has been previously hidden.
    if (
      Services.xulStore.getValue(
        XULSTORE_URL,
        "quickFilterBar",
        "collapsed"
      ) !== "true"
    ) {
      this._showFilterBar(true);
    }

    commandController.registerCallback("cmd_showQuickFilterBar", () => {
      if (!this.filterer.visible) {
        this._showFilterBar(true);
      }
      document.getElementById(QuickFilterManager.textBoxDomId).select();
    });
    commandController.registerCallback("cmd_toggleQuickFilterBar", () => {
      let show = !this.filterer.visible;
      this._showFilterBar(show);
      if (show) {
        document.getElementById(QuickFilterManager.textBoxDomId).select();
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
  },

  get filterer() {
    if (!this._filterer) {
      this._filterer = new QuickFilterState();
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
    for (let filterDef of QuickFilterManager.filterDefs) {
      let domNode = document.getElementById(filterDef.domId);

      let handler;
      if (!("onCommand" in filterDef)) {
        handler = event => {
          try {
            let postValue = domNode.pressed ? true : null;
            this.filterer.setFilterValue(filterDef.name, postValue);
            this.deferredUpdateSearch();
          } catch (ex) {
            console.error(ex);
          }
        };
      } else {
        handler = event => {
          let filterValues = this.filterer.filterValues;
          let preValue =
            filterDef.name in filterValues
              ? filterValues[filterDef.name]
              : null;
          let [postValue, update] = filterDef.onCommand(
            preValue,
            domNode,
            event,
            document
          );
          this.filterer.setFilterValue(filterDef.name, postValue, !update);
          if (update) {
            this.deferredUpdateSearch();
          }
        };
      }
      if (domNode.namespaceURI == document.documentElement.namespaceURI) {
        domNode.addEventListener("click", handler);
      } else {
        domNode.addEventListener("command", handler);
      }

      if ("domBindExtra" in filterDef) {
        filterDef.domBindExtra(document, this, domNode);
      }
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
      let filterValues = this.filterer.filterValues;
      for (let filterDef of QuickFilterManager.filterDefs) {
        // If we only need to update one state, check and skip as appropriate.
        if (aFilterName && filterDef.name != aFilterName) {
          continue;
        }

        let domNode = document.getElementById(filterDef.domId);
        let value =
          filterDef.name in filterValues ? filterValues[filterDef.name] : null;
        if (!("reflectInDOM" in filterDef)) {
          domNode.pressed = value;
        } else {
          filterDef.reflectInDOM(domNode, value, document, this);
        }
      }
    }

    this.reflectFiltererResults();

    this.domNode.hidden = !this.filterer.visible;
  },

  /**
   * Update the UI to reflect the state of the folderDisplay in terms of
   *  filtering.  This is expected to be called by |reflectFiltererState| and
   *  when something happens event-wise in terms of search.
   *
   * We can have one of four states:
   * - No filter is active; no attributes exposed for CSS to do anything.
   * - A filter is active and we are still searching; filterActive=searching.
   * - A filter is active, completed searching, and we have results;
   *   filterActive=matches.
   * - A filter is active, completed searching, and we have no results;
   *   filterActive=nomatches.
   */
  reflectFiltererResults() {
    let threadPane = document.getElementById("threadTree");

    // bail early if the view is in the process of being created
    if (!gDBView) {
      return;
    }

    // no filter active
    if (!gViewWrapper.search || !gViewWrapper.search.userTerms) {
      threadPane.removeAttribute("filterActive");
      this.domNode.removeAttribute("filterActive");
    } else if (gViewWrapper.searching) {
      // filter active, still searching
      // Do not set this immediately; wait a bit and then only set this if we
      //  still are in this same state (and we are still the active tab...)
      setTimeout(() => {
        threadPane.setAttribute("filterActive", "searching");
        this.domNode.setAttribute("filterActive", "searching");
      }, 500);
    } else if (gDBView.numMsgsInView) {
      // filter completed, results
      // some matches
      threadPane.setAttribute("filterActive", "matches");
      this.domNode.setAttribute("filterActive", "matches");
    } else {
      // filter completed, no results
      // no matches! :(
      threadPane.setAttribute("filterActive", "nomatches");
      this.domNode.setAttribute("filterActive", "nomatches");
    }
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
   *  until after the button click handling has completed and had the ability
   *  to paint such.
   */
  deferredUpdateSearch() {
    setTimeout(() => this._deferredInvocUpdateSearch(), 10);
  },

  /**
   * The actual helper function to call updateSearch for deferredUpdateSearch
   *  that makes 'this' relevant.
   */
  _deferredInvocUpdateSearch() {
    this.updateSearch();
  },

  /**
   * Update the user terms part of the search definition to reflect the active
   *  filterer's current state.
   */
  updateSearch() {
    if (!this._filterer || !gViewWrapper?.search) {
      return;
    }

    this.filterer.displayedFolder = gFolder;

    let [terms, listeners] = this.filterer.createSearchTerms(
      gViewWrapper.search.session
    );

    for (let [listener, filterDef] of listeners) {
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

  _showFilterBar(aShow) {
    this.filterer.visible = aShow;
    if (!aShow) {
      this.filterer.clear();
      this.updateSearch();
      threadTree.table.body.focus();
    }
    this.reflectFiltererState();
    Services.xulStore.setValue(
      XULSTORE_URL,
      "quickFilterBar",
      "collapsed",
      !aShow
    );
    window.dispatchEvent(new Event("qfbtoggle"));
  },

  /**
   * Called by the view wrapper so we can update the results count.
   */
  onMessagesChanged() {
    let filtering = gViewWrapper.search?.userTerms != null;
    let newCount = filtering ? gDBView.numMsgsInView : null;
    this.filterer.setFilterValue("results", newCount, true);

    // - postFilterProcess everyone who cares
    // This may need to be converted into an asynchronous process at some point.
    for (let filterDef of QuickFilterManager.filterDefs) {
      if ("postFilterProcess" in filterDef) {
        let preState =
          filterDef.name in this.filterer.filterValues
            ? this.filterer.filterValues[filterDef.name]
            : null;
        let [newState, update, treatAsUserAction] = filterDef.postFilterProcess(
          preState,
          gViewWrapper,
          filtering
        );
        this.filterer.setFilterValue(
          filterDef.name,
          newState,
          !treatAsUserAction
        );
        if (update) {
          let domNode = document.getElementById(filterDef.domId);
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

  _testHelperResetFilterState() {
    if (!this._filterer) {
      return;
    }
    this._filterer = new QuickFilterState();
    this.updateSearch();
    this.reflectFiltererState();
  },
};
XPCOMUtils.defineLazyGetter(quickFilterBar, "domNode", () =>
  document.getElementById("quick-filter-bar")
);
