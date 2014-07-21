/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var gWebDeveloper = {
  validateThisPage: function() {
    var service = GetLocalizedStringPref("browser.validate.html.service");
    var uri = getBrowser().currentURI;
    var checkURL = service + encodeURIComponent(uri.spec);
    var opentab = Services.prefs.getBoolPref("browser.tabs.opentabfor.middleclick");
    openUILinkIn(checkURL, opentab ? "tabfocused" : "window",
                 { referrerURI: uri, relatedToCurrent: true });
  },

  enableDebugger: function(aItem) {
    var shouldEnable = aItem.getAttribute("checked") == "true";
    Services.prefs.setBoolPref("devtools.debugger.remote-enabled", shouldEnable);
  },

  handleEvent: function(aEvent) {
    switch (aEvent.type) {
      case "load":
        window.removeEventListener("load", gWebDeveloper, false);
        var popup = document.getElementById("toolsPopup");
        popup.addEventListener("popupshowing", gWebDeveloper, false);
        break;
      case "popupshowing":
        this.initMenuItems();
        break;
    }
  },

  initMenuItems: function() {
    var menuitem = document.getElementById("validatePage");
    var uri = getBrowser().currentURI;
    if (uri && (uri.schemeIs("http") || uri.schemeIs("https")))
      menuitem.removeAttribute("disabled");
    else
      menuitem.setAttribute("disabled", true);

    var enabled = Services.prefs
                          .getBoolPref("devtools.debugger.remote-enabled");
    document.getElementById("devtoolsDebugger")
            .setAttribute("checked", enabled);
  },
}

window.addEventListener("load", gWebDeveloper, false);
