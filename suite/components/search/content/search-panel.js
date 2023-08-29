/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var {XPCOMUtils} = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");
const {FormHistory} = ChromeUtils.import("resource://gre/modules/FormHistory.jsm");

const kXULNS = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";
const SEARCH_ENGINE_TOPIC = "browser-search-engine-modified";
var isPB, menulist, textbox;

function Startup() {
  menulist = document.getElementById("sidebar-search-engines");
  textbox = document.getElementById("sidebar-search-text");
  isPB = top.gPrivate;
  if (isPB)
    textbox.searchParam += "|private";

  LoadEngineList();
  Services.obs.addObserver(engineObserver, SEARCH_ENGINE_TOPIC, true);
}

function LoadEngineList() {
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

function SelectEngine() {
  if (menulist.selectedItem)
    Services.search.currentEngine = menulist.selectedItem.engine;
  Services.obs.notifyObservers(null, SEARCH_ENGINE_TOPIC, "engine-current");
}

function doSearch() {
  var textValue = textbox.value;

  // Save the current value in the form history (shared with the search bar)
  // except when in Private Browsing mode.

  if (textValue && !isPB) {
    FormHistory.update({
      op: "bump",
      fieldname: "searchbar-history",
      value: textValue
    }, {
      handleError: function(aError) {
        Cu.reportError("Saving search to form history failed: " + aError.message);
      }
    });
  }

  var where = Services.prefs.getBoolPref("browser.search.openintab") ? "tab" : "current";
  var submission = Services.search.currentEngine.getSubmission(textValue);
  openUILinkIn(submission.uri.spec, where, null, submission.postData);
}

var engineObserver = {
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIObserver,
                                         Ci.nsISupportsWeakReference]),

  observe: function(aEngine, aTopic, aVerb) {
    if (aTopic == SEARCH_ENGINE_TOPIC) {
      // Right now, always just rebuild the list after any modification.
      LoadEngineList();
    }
  }
}
