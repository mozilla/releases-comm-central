/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import { SearchBar } from "chrome://messenger/content/search-bar.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  Gloda: "resource:///modules/gloda/GlodaPublic.sys.mjs",
  GlodaConstants: "resource:///modules/gloda/GlodaConstants.sys.mjs",
  GlodaIMSearcher: "resource:///modules/GlodaIMSearcher.sys.mjs",
  GlodaMsgSearcher: "resource:///modules/gloda/GlodaMsgSearcher.sys.mjs",
});
ChromeUtils.defineLazyGetter(
  lazy,
  "glodaCompleter",
  () =>
    Cc["@mozilla.org/autocomplete/search;1?name=gloda"].getService(
      Ci.nsIAutoCompleteSearch
    ).wrappedJSObject
);

/**
 * Unified toolbar global search bar.
 */
class GlobalSearchBar extends SearchBar {
  // Fields required for the auto complete popup to work.

  get popup() {
    return document.getElementById("PopupGlodaAutocomplete");
  }

  controller = {
    matchCount: 0,
    searchString: "",
    stopSearch() {
      lazy.glodaCompleter.stopSearch();
    },
    handleEnter: isAutocomplete => {
      if (!isAutocomplete) {
        return;
      }
      this.#handleSearch({ detail: this.controller.searchString });
      this.reset();
    },
  };

  _focus() {
    this.focus();
  }

  #searchResultListener = {
    onSearchResult: (result, search) => {
      this.controller.matchCount = search.matchCount;
      if (this.controller.matchCount < 1) {
        this.popup.closePopup();
        return;
      }
      if (!this.popup.mPopupOpen) {
        this.popup.openAutocompletePopup(
          this,
          this.shadowRoot.querySelector("input")
        );
        return;
      }
      this.popup.invalidate();
    },
  };

  // Normal custom element stuff

  connectedCallback() {
    if (this.shadowRoot) {
      return;
    }
    if (
      !Services.prefs.getBoolPref(
        "mailnews.database.global.indexer.enabled",
        true
      )
    ) {
      return;
    }
    // Need to call this after the shadow root test, since this will always set
    // up a shadow root.
    super.connectedCallback();
    this.addEventListener("search", this);
    this.addEventListener("autocomplete", this);
    // Capturing to avoid the default cursor movements inside the input.
    this.addEventListener("keydown", this, {
      capture: true,
    });
    this.addEventListener("focus", this);
    this.addEventListener("blur", this);
    this.addEventListener("drop", this, { capture: true });
  }

  #popupWasOpenAtDown = false;

  handleEvent(event) {
    switch (event.type) {
      case "search":
        this.#handleSearch(event);
        break;
      case "autocomplete":
        this.#handleAutocomplete(event);
        break;
      case "keydown":
        this.#handleKeydown(event);
        this.#popupWasOpenAtDown = this.popup.mPopupOpen;
        break;
      case "focus":
        this.#handleFocus(event);
        break;
      case "drop":
        this.#handleDrop(event);
        break;
      case "keyup":
        if (!this.#popupWasOpenAtDown || event.key !== "Escape") {
          super.handleEvent(event);
        }
        break;
      case "blur":
        if (this.popup.mPopupOpen) {
          this.popup.closePopup();
        }
        break;
      default:
        super.handleEvent(event);
    }
  }

  #handleSearch = event => {
    const tabmail = document.getElementById("tabmail");
    let args;
    // Build the query from the autocomplete result.
    const selectedIndex = this.popup.selectedIndex;
    if (selectedIndex > -1) {
      const curResult = lazy.glodaCompleter.curResult;
      if (curResult) {
        const row = curResult.getObjectAt(selectedIndex);
        if (row && !row.fullText && row.nounDef) {
          let query = lazy.Gloda.newQuery(lazy.GlodaConstants.NOUN_MESSAGE);
          switch (row.nounDef.name) {
            case "tag":
              query = query.tags(row.item);
              break;
            case "identity":
              query = query.involves(row.item);
              break;
          }
          query.orderBy("-date");
          args = { query };
        }
      }
    }
    // Or just do a normal full text search.
    if (!args) {
      const searchString = event.detail;
      args = {
        searcher: new lazy.GlodaMsgSearcher(null, searchString),
      };
      if (Services.prefs.getBoolPref("mail.chat.enabled")) {
        args.IMSearcher = new lazy.GlodaIMSearcher(null, searchString);
      }
    }
    tabmail.openTab("glodaFacet", args);
    this.popup.closePopup();
    this.controller.matchCount = 0;
    this.controller.searchString = "";
  };

  #handleAutocomplete = event => {
    this.controller.searchString = event.detail;
    if (!event.detail) {
      this.popup.closePopup();
      this.controller.matchCount = 0;
      return;
    }
    lazy.glodaCompleter.startSearch(
      this.controller.searchString,
      "global",
      null,
      this.#searchResultListener
    );
  };

  #handleKeydown = event => {
    if (event.ctrlKey) {
      return;
    }
    if (event.key == "ArrowDown") {
      if (this.popup.selectedIndex < this.controller.matchCount - 1) {
        ++this.popup.selectedIndex;
        event.preventDefault();
        return;
      }
      this.popup.selectedIndex = -1;
      event.preventDefault();
      return;
    }
    if (event.key == "ArrowUp") {
      if (this.popup.selectedIndex > -1) {
        --this.popup.selectedIndex;
        event.preventDefault();
        return;
      }
      this.popup.selectedIndex = this.controller.matchCount - 1;
      event.preventDefault();
    }
  };

  #handleFocus = () => {
    if (this.controller.searchString && this.controller.matchCount >= 1) {
      this.popup.openAutocompletePopup(
        this,
        this.shadowRoot.querySelector("input")
      );
    }
  };

  #handleDrop = event => {
    if (event.dataTransfer.types.includes("text/x-moz-address")) {
      const searchTerm = event.dataTransfer.getData("text/plain");
      this.#handleSearch({ detail: searchTerm });
    }
    event.stopPropagation();
    event.preventDefault();
  };
}
customElements.define("global-search-bar", GlobalSearchBar);
