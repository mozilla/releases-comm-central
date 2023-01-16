/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import { SearchBar } from "chrome://messenger/content/unifiedtoolbar/search-bar.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  GlodaIMSearcher: "resource:///modules/GlodaIMSearcher.sys.mjs",
});
ChromeUtils.defineModuleGetter(
  lazy,
  "GlodaMsgSearcher",
  "resource:///modules/gloda/GlodaMsgSearcher.jsm"
);

/**
 * Unified toolbar global search bar.
 */
class GlobalSearchBar extends SearchBar {
  connectedCallback() {
    if (this.shadowRoot) {
      return;
    }
    // Need to call this after the shadow root test, since this will always set
    // up a shadow root.
    super.connectedCallback();
    this.addEventListener("search", this.#handleSearch);
  }

  #handleSearch = event => {
    let tabmail = document.getElementById("tabmail");
    let searchString = event.detail;
    let args = {
      searcher: new lazy.GlodaMsgSearcher(null, searchString),
    };
    if (Services.prefs.getBoolPref("mail.chat.enabled")) {
      args.IMSearcher = new lazy.GlodaIMSearcher(null, searchString);
    }
    tabmail.openTab("glodaFacet", args);
  };
}
customElements.define("global-search-bar", GlobalSearchBar);
