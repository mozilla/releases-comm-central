/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var gSafeBrowsing = {
  initMenuItems: function initMenuItems() {
    // A blocked page will have a specific about:blocked content documentURI.
    var docURI = content.document.documentURI;

    // "reason" isn't currently used but it's here to make porting
    // from Firefox easier and may also be useful in the future
    // for further testing and setting menu items.
    let reason;

    // Show/hide the appropriate menu item.
    // Initially allow report url and disallow reporting phishing error.
    document.getElementById("reportPhishing").hidden = false;
    document.getElementById("reportPhishingError").hidden = true;

    if (docURI.startsWith("about:blocked")) {
      // It's blocked so don't allow reporting again.
      document.getElementById("reportPhishing").hidden = true;
      // Test for blocked page.
      if (/e=malwareBlocked/.test(docURI)) {
        reason = "malware";
      } else if (/e=unwantedBlocked/.test(docURI)) {
        reason = "unwanted";
      } else if (/e=deceptiveBlocked/.test(docURI)) {
        reason = "phishing";
        document.getElementById("reportPhishingError").hidden = false;
      } else if (/e=forbiddenBlocked/.test(docURI)) {
        reason = "forbidden";
      }
    }

    var broadcaster = document.getElementById("safeBrowsingBroadcaster");
    var uri = getBrowser().currentURI;
    if (uri && (uri.schemeIs("http") || uri.schemeIs("https")))
      broadcaster.removeAttribute("disabled");
    else
      broadcaster.setAttribute("disabled", true);
  },

  /**
   * Used to report a phishing page or a false positive
   * @param   aName
   *          A String One of "Phish", "PhishMistake" or "MalwareMistake".
   * @returns A String containing the report phishing URL.
   */
  getReportURL: function getReportURL(aName) {
    var pageUri = getBrowser().currentURI.cloneIgnoringRef();
    return SafeBrowsing.getReportURL(aName, pageUri);
  },

  initOverlay: function initOverlay(aEvent) {
    var popup = document.getElementById("helpPopup");
    popup.addEventListener("popupshowing", gSafeBrowsing.initMenuItems, false);
  }
}

window.addEventListener("load", gSafeBrowsing.initOverlay, false);
