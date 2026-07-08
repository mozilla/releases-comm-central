/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

ChromeUtils.defineESModuleGetters(this, {
  Gloda: "resource:///modules/gloda/GlodaPublic.sys.mjs",
  GlodaConstants: "resource:///modules/gloda/GlodaConstants.sys.mjs",
  GlodaSyntheticView: "resource:///modules/gloda/GlodaSyntheticView.sys.mjs",
});

/**
 * Tab type that opens Gloda search results directly as a mail3PaneTab list
 * view, bypassing the faceted search interface.
 */
const glodaTableListTabType = {
  name: "glodaTableList",
  perTabPanel: "vbox",
  lastTabId: 0,
  strings: Services.strings.createBundle(
    "chrome://messenger/locale/glodaFacetView.properties"
  ),
  modes: {
    glodaTableList: {
      type: "glodaSearch",
    },
  },
  openTab(aTab, aArgs) {
    aTab.panel.setAttribute("id", "glodaListTab" + this.lastTabId);
    const tabmail = document.getElementById("tabmail");

    // Already-resolved items (e.g. from the facet view's active set button).
    if ("items" in aArgs) {
      tabmail.openTab("mail3PaneTab", {
        folderPaneVisible: false,
        syntheticView: new GlodaSyntheticView({
          collection: Gloda.explicitCollection(
            GlodaConstants.NOUN_MESSAGE,
            aArgs.items
          ),
        }),
        title:
          aArgs.title ||
          this.strings.GetStringFromName("glodaFacetView.tab.query.label"),
      });
      this.lastTabId++;
      tabmail.closeTab(aTab);
      return;
    }

    // Async query/searcher: open once the collection finishes loading.
    let collection, title;
    if ("query" in aArgs) {
      collection = aArgs.query.getCollection();
      title = this.strings.GetStringFromName("glodaFacetView.tab.query.label");
    } else if ("searcher" in aArgs) {
      collection = aArgs.searcher.getCollection();
      title =
        aArgs.searcher.searchString ||
        this.strings.GetStringFromName("glodaFacetView.tab.search.label");
    } else {
      return;
    }
    this.lastTabId++;
    collection.listener = {
      onItemsAdded() {},
      onItemsModified() {},
      onItemsRemoved() {},
      onQueryCompleted() {
        tabmail.openTab("mail3PaneTab", {
          folderPaneVisible: false,
          syntheticView: new GlodaSyntheticView({
            collection: Gloda.explicitCollection(
              GlodaConstants.NOUN_MESSAGE,
              collection.items
            ),
          }),
          title,
        });
        tabmail.closeTab(aTab);
      },
    };
  },
  closeTab() {},
  saveTabState() {},
  showTab() {},
  getBrowser() {
    return null;
  },
};
