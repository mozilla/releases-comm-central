// ***** BEGIN LICENSE BLOCK *****
// Version: MPL 1.1/GPL 2.0/LGPL 2.1
//
// The contents of this file are subject to the Mozilla Public License Version
// 1.1 (the "License"); you may not use this file except in compliance with
// the License. You may obtain a copy of the License at
// http://www.mozilla.org/MPL/
//
// Software distributed under the License is distributed on an "AS IS" basis,
// WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
// for the specific language governing rights and limitations under the
// License.
//
// The Original Code is Mozilla Corporation Code.
//
// The Initial Developer of the Original Code is
// Mikeal Rogers.
// Portions created by the Initial Developer are Copyright (C) 2008
// the Initial Developer. All Rights Reserved.
//
// Contributor(s):
//  Mikeal Rogers <mikeal.rogers@gmail.com>
//  Gary Kwong <nth10sd@gmail.com>
//
// Alternatively, the contents of this file may be used under the terms of
// either the GNU General Public License Version 2 or later (the "GPL"), or
// the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
// in which case the provisions of the GPL or the LGPL are applicable instead
// of those above. If you wish to allow use of your version of this file only
// under the terms of either the GPL or the LGPL, and not to allow others to
// use your version of this file under the terms of the MPL, indicate your
// decision by deleting the provisions above and replace them with the notice
// and other provisions required by the GPL or the LGPL. If you do not delete
// the provisions above, a recipient may use your version of this file under
// the terms of any one of the MPL, the GPL or the LGPL.
//
// ***** END LICENSE BLOCK *****

var EXPORTED_SYMBOLS = ["getMail3PaneController"];

const { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

var controller = ChromeUtils.import(
  "resource://testing-common/mozmill/controller.jsm"
);
var utils = ChromeUtils.import("resource://testing-common/mozmill/utils.jsm");

function getMail3PaneController() {
  var mail3PaneWindow = Services.wm.getMostRecentWindow("mail:3pane");
  if (mail3PaneWindow == null) {
    return new controller.MozMillController(
      utils.getMethodInWindows("toMessengerWindow")()
    );
  }

  return new controller.MozMillController(mail3PaneWindow);
}

/**
 * Attach event listeners
 */
function attachEventListeners(aWindow) {
  aWindow.addEventListener("load", function(event) {
    controller.windowMap.update(utils.getWindowId(aWindow), "loaded", true);

    if ("gBrowser" in aWindow) {
      // Page is ready
      aWindow.gBrowser.addEventListener(
        "load",
        function(event) {
          var doc = event.originalTarget;

          // Only update the flag if we have a document as target
          if ("defaultView" in doc) {
            var id = utils.getWindowId(doc.defaultView);
            controller.windowMap.update(id, "loaded", true);
            // dump("*** load event: " + id + ", " + doc.location + ", baseURI=" + doc.baseURI + "\n");
          }
        },
        true
      );

      // Note: Error pages will never fire a "load" event. For those we
      // have to wait for the "DOMContentLoaded" event. That's the final state.
      // Error pages will always have a baseURI starting with
      // "about:" followed by "error" or "blocked".
      aWindow.gBrowser.addEventListener(
        "DOMContentLoaded",
        function(event) {
          var doc = event.originalTarget;

          var errorRegex = /about:.+(error)|(blocked)\?/;
          if (errorRegex.exec(doc.baseURI)) {
            // Wait about 1s to be sure the DOM is ready
            utils.sleep(1000);

            // Only update the flag if we have a document as target
            if ("defaultView" in doc) {
              var id = utils.getWindowId(doc.defaultView);
              controller.windowMap.update(id, "loaded", true);
              // dump("*** load event: " + id + ", " + doc.location + ", baseURI=" + doc.baseURI + "\n");
            }
          }
        },
        true
      );

      // Page is about to get unloaded
      aWindow.gBrowser.addEventListener(
        "beforeunload",
        function(event) {
          var doc = event.originalTarget;

          // Only update the flag if we have a document as target
          if ("defaultView" in doc) {
            var id = utils.getWindowId(doc.defaultView);
            controller.windowMap.update(id, "loaded", false);
            // dump("*** beforeunload event: " + id + ", " + doc.location + ", baseURI=" + doc.baseURI + "\n");
          }
        },
        true
      );
    }
  });
}

/**
 * Initialize Mozmill
 */
function initialize() {
  // Observer when a new top-level window is ready
  var windowReadyObserver = {
    observe(subject, topic, data) {
      attachEventListeners(subject);
    },
  };

  // Observer when a top-level window is closed
  var windowCloseObserver = {
    observe(subject, topic, data) {
      controller.windowMap.remove(utils.getWindowId(subject));
    },
  };

  // Activate observer for new top level windows
  Services.obs.addObserver(windowReadyObserver, "toplevel-window-ready");
  Services.obs.addObserver(windowCloseObserver, "outer-window-destroyed");

  // Attach event listeners to all open windows
  for (let win of Services.wm.getEnumerator("")) {
    attachEventListeners(win);

    // For windows or dialogs already open we have to explicitly set the property
    // otherwise windows which load really quick on startup never gets the
    // property set and we fail to create the controller
    controller.windowMap.update(utils.getWindowId(win), "loaded", true);
  }
}
initialize();
