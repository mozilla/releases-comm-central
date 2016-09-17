/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// Services = object with smart getters for common XPCOM services
Components.utils.import("resource://gre/modules/Services.jsm");
Components.utils.import("resource://gre/modules/AppConstants.jsm");

function init(aEvent)
{
  if (aEvent.target != document)
    return;

  try {
    var distroId = Services.prefs.getCharPref("distribution.id");
    if (distroId) {
      var distroVersion = Services.prefs.getCharPref("distribution.version");

      var distroIdField = document.getElementById("distributionId");
      distroIdField.value = distroId + " - " + distroVersion;
      distroIdField.style.display = "block";

      try {
        // This is in its own try catch due to bug 895473 and bug 900925.
        var distroAbout = Services.prefs.getComplexValue("distribution.about",
          Components.interfaces.nsISupportsString);
        var distroField = document.getElementById("distribution");
        distroField.value = distroAbout;
        distroField.style.display = "block";
      }
      catch (ex) {
        // Pref is unset
        Components.utils.reportError(ex);
      }
    }
  }
  catch (e) {
    // Pref is unset
  }

  // XXX FIXME
  // Include the build ID and display warning if this is an "a#" (nightly or aurora) build
  let versionField = document.getElementById("version");
  let version = Services.appinfo.version;
  if (/a\d+$/.test(version)) {
    let buildID = Services.appinfo.appBuildID;
    let year = buildID.slice(0, 4);
    let month = buildID.slice(4, 6);
    let day = buildID.slice(6, 8);
    versionField.textContent += ` (${year}-${month}-${day})`;

    document.getElementById("experimental").hidden = false;
    document.getElementById("communityDesc").hidden = true;
  }

  // Append "(32-bit)" or "(64-bit)" build architecture to the version number:
  let bundle = Services.strings.createBundle("chrome://messenger/locale/messenger.properties");
  let archResource = Services.appinfo.is64Bit
                     ? "aboutDialog.architecture.sixtyFourBit"
                     : "aboutDialog.architecture.thirtyTwoBit";
  let arch = bundle.GetStringFromName(archResource);
  versionField.textContent += ` (${arch})`;

  if (AppConstants.MOZ_UPDATER) {
    gAppUpdater = new appUpdater();

    let defaults = Services.prefs.getDefaultBranch("");
    let channelLabel = document.getElementById("currentChannel");
    channelLabel.value = defaults.getCharPref("app.update.channel");
  }

  if (AppConstants.platform == "macosx") {
    // it may not be sized at this point, and we need its width to calculate its position
    window.sizeToContent();
    window.moveTo((screen.availWidth / 2) - (window.outerWidth / 2), screen.availHeight / 5);
  }
}

// This function is used to open about: tabs. The caller should ensure the url
// is only an about: url.
function openAboutTab(url)
{
  let tabmail;
  // Check existing windows
  let mailWindow = Services.wm.getMostRecentWindow("mail:3pane");
  if (mailWindow) {
    mailWindow.focus();
    mailWindow.document.getElementById("tabmail")
              .openTab("contentTab", {contentPage: url,
                                      clickHandler: "specialTabs.aboutClickHandler(event);"});
    return;
  }

  // No existing windows.
  window.openDialog("chrome://messenger/content/", "_blank",
                    "chrome,dialog=no,all", null,
                    { tabType: "contentTab",
                      tabParams: {contentPage: url, clickHandler: "specialTabs.aboutClickHandler(event);"} });
}

function openUILink(url, event)
{
  if (!event.button) {
    let m = ("messenger" in window) ? messenger :
      Components.classes["@mozilla.org/messenger;1"]
                .createInstance(Components.interfaces.nsIMessenger);
    m.launchExternalURL(url);
    event.preventDefault();
  }
}
