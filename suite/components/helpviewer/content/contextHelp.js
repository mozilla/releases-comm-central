/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { AppConstants } =
  ChromeUtils.import("resource://gre/modules/AppConstants.jsm");

// Set the default content pack to the Mozilla content pack. Use the
// setHelpFileURI function to set this value.
var helpFileURI;

// openHelp - Opens up the Mozilla Help Viewer with the specified
//    topic and content pack.
// see http://www.mozilla.org/projects/help-viewer/content_packs.html
function openHelp(topic, contentPack)
{
  // helpFileURI is the content pack to use in this function. If contentPack is defined,
  // use that and set the helpFileURI to that value so that it will be the default.
  helpFileURI = contentPack || helpFileURI;

  // Try to find previously opened help.
  var topWindow = locateHelpWindow(helpFileURI);

  if ( topWindow ) {
    // Open topic in existing window.
    topWindow.focus();
    topWindow.displayTopic(topic);
  } else {
    // Open topic in new window.
    const params = Cc["@mozilla.org/embedcomp/dialogparam;1"]
                     .createInstance(Ci.nsIDialogParamBlock);
    params.SetNumberStrings(2);
    params.SetString(0, helpFileURI);
    params.SetString(1, topic);

    let openFeatures = "chrome,all,dialog=no";

    if (AppConstants.platform == "win") {
      openFeatures += ",alwaysRaised";
    }
    Services.ww.openWindow(null, "chrome://help/content/help.xul", "_blank",
                           openFeatures, params);
  }
}

// setHelpFileURI - Sets the default content pack to use in the Help Viewer
function setHelpFileURI(rdfURI)
{
  helpFileURI = rdfURI;
}

// Locate existing help window for this content pack.
function locateHelpWindow(contentPack) {
    const iterator = Services.wm.getEnumerator("suite:help");
    var topWindow = null;
    var aWindow;

    // Loop through help windows looking for one with selected content
    // pack.
    while (iterator.hasMoreElements()) {
        aWindow = iterator.getNext();
        if (!aWindow.closed && aWindow.getHelpFileURI() == contentPack) {
            topWindow = aWindow;
        }
    }
    return topWindow;
}
