/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* exported cancelClicked, continueClicked, initialize, restartClicked, unload */

ChromeUtils.import("resource://gre/modules/Services.jsm");
ChromeUtils.import("resource://gre/modules/AddonManager.jsm");
ChromeUtils.defineModuleGetter(this, "ExtensionParent", "resource://gre/modules/ExtensionParent.jsm");

var gAddon = null;

// If the user enables the add-on through some other UI close this window
var EnableListener = {
  onEnabled(aAddon) {
    if (aAddon.id == gAddon.id) {
      AddonManager.removeAddonListener(EnableListener);

      let webextension = ExtensionParent.GlobalManager.getExtension(gAddon.id);
      if (webextension && webextension.manifest.legacy) {
        document.getElementById("allow").disabled = true;
        document.getElementById("buttonDeck").selectedPanel = document.getElementById("restartPanel");
      } else {
        window.close();
      }
    }
  }
};
AddonManager.addAddonListener(EnableListener);

function initialize() {
  // About URIs don't implement nsIURL so we have to find the query string
  // manually
  let spec = document.location.href;
  let pos = spec.indexOf("?");
  let query = "";
  if (pos >= 0)
    query = spec.substring(pos + 1);

  // Just assume the query is "id=<id>"
  let id = query.substring(3);
  if (!id) {
    window.location = "about:blank";
    return;
  }

  let bundle = Services.strings.createBundle("chrome://messenger/locale/aboutNewAddon.properties");

  AddonManager.getAddonByID(id).then(function(aAddon) {
    // If the add-on doesn't exist or it is already enabled or it has already
    // been seen or it cannot be enabled then this UI is useless, just close it.
    // This shouldn't normally happen unless session restore restores the tab.
    if (!aAddon || !aAddon.userDisabled || aAddon.seen ||
        !(aAddon.permissions & AddonManager.PERM_CAN_ENABLE)) {
      window.close();
      return;
    }

    gAddon = aAddon;

    document.getElementById("addon-info").setAttribute("type", aAddon.type);

    let icon = document.getElementById("icon");
    if (aAddon.icon64URL)
      icon.src = aAddon.icon64URL;
    else if (aAddon.iconURL)
      icon.src = aAddon.iconURL;

    let name = bundle.formatStringFromName("name", [aAddon.name, aAddon.version],
                                           2);
    document.getElementById("name").value = name;

    if (aAddon.creator) {
      let creator = bundle.formatStringFromName("author", [aAddon.creator], 1);
      document.getElementById("author").value = creator;
    } else {
      document.getElementById("author").hidden = true;
    }

    let uri = "getResourceURI" in aAddon ? aAddon.getResourceURI() : null;
    let locationLabel = document.getElementById("location");
    if (uri instanceof Ci.nsIFileURL) {
      let location = bundle.formatStringFromName("location", [uri.file.path], 1);
      locationLabel.value = location;
      locationLabel.setAttribute("tooltiptext", location);
    } else {
      document.getElementById("location").hidden = true;
    }

    // Only mark the add-on as seen if the page actually gets focus
    if (document.hasFocus()) {
      aAddon.markAsSeen();
    } else {
      document.addEventListener("focus", () => aAddon.markAsSeen());
    }

    var event = document.createEvent("Events");
    event.initEvent("AddonDisplayed", true, true);
    document.dispatchEvent(event);
  });
}

function unload() {
  AddonManager.removeAddonListener(EnableListener);
}

function continueClicked() {
  if (document.getElementById("allow").checked) {
    gAddon.enable();
  } else {
    AddonManager.removeAddonListener(EnableListener);
    window.close();
  }
}

function restartClicked() {
  let cancelQuit = Cc["@mozilla.org/supports-PRBool;1"].
                   createInstance(Ci.nsISupportsPRBool);
  Services.obs.notifyObservers(cancelQuit, "quit-application-requested",
                               "restart");
  if (cancelQuit.data)
    return; // somebody canceled our quit request

  window.close();

  Services.startup.quit(Ci.nsIAppStartup.eAttemptQuit | Ci.nsIAppStartup.eRestart);
}

function cancelClicked() {
  gAddon.disable();
  AddonManager.addAddonListener(EnableListener);

  document.getElementById("allow").disabled = false;
  document.getElementById("buttonDeck").selectedPanel = document.getElementById("continuePanel");
}
