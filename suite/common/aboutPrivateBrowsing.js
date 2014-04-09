/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

window.onload = function () {
  if (window.QueryInterface(Components.interfaces.nsIInterfaceRequestor)
            .getInterface(Components.interfaces.nsIWebNavigation)
            .QueryInterface(Components.interfaces.nsILoadContext)
            .usePrivateBrowsing) {
    document.getElementById("warningBox").className = "private";
    document.title = document.getElementById("privateTitle").textContent;
  }
  else {
    document.getElementById("warningBox").className = "normal";
    document.title = document.getElementById("normalTitle").textContent;
  }

  document.getElementById("learnMoreButton")
          .addEventListener("command", function() {
    openHelp("private-browsing",
             "chrome://communicator/locale/help/suitehelp.rdf");
  });

  document.getElementById("closeWindowButton")
          .addEventListener("command", function() {
    window.close();
  });

  document.getElementById("privateWindowButton")
          .addEventListener("command", function() {
    openNewPrivateWith(location.href);
  });
}
