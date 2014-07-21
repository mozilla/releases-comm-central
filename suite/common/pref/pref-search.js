/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

Components.utils.import("resource://gre/modules/Services.jsm");

function Startup() {
  MakeList();
  SearchObserver.init();
}

var SearchObserver = {
  init: function searchEngineListObserver_init() {
    Services.obs.addObserver(this, "browser-search-engine-modified", false);
    window.addEventListener("unload", this, false);
  },

  observe: function searchEngineListObj_observe(aEngine, aTopic, aVerb) {
    if (aTopic != "browser-search-engine-modified")
      return;
    MakeList();
    var pref = document.getElementById("browser.search.defaultenginename");
    if (pref)
      pref.updateElements();
  },

  handleEvent: function searchEngineListEvent(aEvent) {
    if (aEvent.type == "unload") {
      window.removeEventListener("unload", this, false);
      Services.obs.removeObserver(this, "browser-search-engine-modified");
    }
  }
};

function MakeList() {
  var menulist = document.getElementById("engineList");
  while (menulist.hasChildNodes())
    menulist.lastChild.remove();

  var engines = Services.search.getVisibleEngines();
  for (let i = 0; i < engines.length; i++) {
    let name = engines[i].name;
    let menuitem = menulist.appendItem(name, name);
    menuitem.setAttribute("class", "menuitem-iconic");
    if (engines[i].iconURI)
      menuitem.setAttribute("image", engines[i].iconURI.spec);
    menuitem.engine = engines[i];
  }
}
