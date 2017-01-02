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
  var currentEngineName = Services.search.currentEngine.name;

  // Make sure the popup is empty.
  menulist.removeAllItems();

  var engines = Services.search.getVisibleEngines();
  for (let engine of engines) {
    let name = engine.name;
    let menuitem = menulist.appendItem(name, name);
    menuitem.setAttribute("class", "menuitem-iconic");
    if (engine.iconURI)
      menuitem.setAttribute("image", engine.iconURI.spec);
    menuitem.engine = engine;
    if (engine.name == currentEngineName) {
      // Set selection to the current default engine.
      menulist.selectedItem = menuitem;
    }
  }
  // If the current engine isn't in the list any more, select the first item.
  if (menulist.selectedIndex < 0)
    menulist.selectedIndex = 0;
}

function UpdateDefaultEngine(selectedItem) {
  Services.search.currentEngine = selectedItem.engine;
  Services.obs.notifyObservers(null, "browser-search-engine-modified", "engine-current");
}
