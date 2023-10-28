/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

ChromeUtils.defineModuleGetter(
  this,
  "GlodaMsgSearcher",
  "resource:///modules/gloda/GlodaMsgSearcher.jsm"
);

var glodaFacetTabType = {
  name: "glodaFacet",
  perTabPanel: "vbox",
  lastTabId: 0,
  strings: Services.strings.createBundle(
    "chrome://messenger/locale/glodaFacetView.properties"
  ),
  modes: {
    glodaFacet: {
      // this is what get exposed on the tab for icon purposes
      type: "glodaSearch",
    },
  },
  openTab(aTab, aArgs) {
    // If aArgs is empty, default to a blank user search.
    if (!Object.keys(aArgs).length) {
      aArgs = { searcher: new GlodaMsgSearcher(null, "") };
    }
    // we have no browser until our XUL document loads
    aTab.browser = null;

    aTab.tabNode.setIcon(
      "chrome://messenger/skin/icons/new/compact/search.svg"
    );

    // First clone the page and set up the basics.
    const clone = document
      .getElementById("glodaTab")
      .firstElementChild.cloneNode(true);

    aTab.panel.setAttribute("id", "glodaTab" + this.lastTabId);
    aTab.panel.appendChild(clone);
    aTab.iframe = aTab.panel.querySelector("iframe");

    if ("query" in aArgs) {
      aTab.query = aArgs.query;
      aTab.collection = aTab.query.getCollection();

      aTab.title = this.strings.GetStringFromName(
        "glodaFacetView.tab.query.label"
      );
      aTab.searchString = null;
    } else if ("searcher" in aArgs) {
      aTab.searcher = aArgs.searcher;
      aTab.collection = aTab.searcher.getCollection();
      aTab.query = aTab.searcher.query;
      if ("IMSearcher" in aArgs) {
        aTab.IMSearcher = aArgs.IMSearcher;
        aTab.IMCollection = aArgs.IMSearcher.getCollection();
        aTab.IMQuery = aTab.IMSearcher.query;
      }

      const searchString = aTab.searcher.searchString;
      aTab.searchInputValue = aTab.searchString = searchString;
      aTab.title = searchString
        ? searchString
        : this.strings.GetStringFromName("glodaFacetView.tab.search.label");
    } else if ("collection" in aArgs) {
      aTab.collection = aArgs.collection;

      aTab.title = this.strings.GetStringFromName(
        "glodaFacetView.tab.query.label"
      );
      aTab.searchString = null;
    }

    function xulLoadHandler() {
      aTab.iframe.contentWindow.tab = aTab;
      aTab.browser = aTab.iframe.contentDocument.getElementById("browser");
      aTab.browser.setAttribute(
        "src",
        "chrome://messenger/content/glodaFacetView.xhtml"
      );

      // Wire up the search input icon click event
      const searchInput = aTab.panel.querySelector(".remote-gloda-search");
      searchInput.focus();
    }

    aTab.iframe.contentWindow.addEventListener("load", xulLoadHandler, {
      capture: false,
      once: true,
    });
    aTab.iframe.setAttribute(
      "src",
      "chrome://messenger/content/glodaFacetViewWrapper.xhtml"
    );

    this.lastTabId++;
  },
  closeTab(aTab) {},
  saveTabState(aTab) {
    // nothing to do; we are not multiplexed
  },
  showTab(aTab) {
    // nothing to do; we are not multiplexed
  },
  getBrowser(aTab) {
    return aTab.browser;
  },
};
