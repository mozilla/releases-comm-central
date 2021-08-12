/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const EXPORTED_SYMBOLS = ["LinkHandlerParent"];

const { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

class LinkHandlerParent extends JSWindowActorParent {
  receiveMessage(aMsg) {
    let browser = this.browsingContext.top.embedderElement;
    if (!browser) {
      return;
    }

    let win = browser.ownerGlobal;

    let gTabmail = win.document.getElementById("tabmail");

    switch (aMsg.name) {
      case "Link:SetIcon":
        if (!gTabmail) {
          return;
        }

        this.setIconFromLink(gTabmail, browser, aMsg.data);
        break;
    }
  }

  setIconFromLink(gTabmail, browser, { canUseForTab, iconURL }) {
    let tab = gTabmail.getTabForBrowser(browser);
    if (tab?.mode?.type != "contentTab") {
      return;
    }

    let iconURI;
    try {
      iconURI = Services.io.newURI(iconURL);
    } catch (ex) {
      Cu.reportError(ex);
      return;
    }
    if (iconURI.scheme != "data") {
      try {
        Services.scriptSecurityManager.checkLoadURIWithPrincipal(
          browser.contentPrincipal,
          iconURI,
          Services.scriptSecurityManager.ALLOW_CHROME
        );
      } catch (ex) {
        return;
      }
    }

    if (canUseForTab) {
      // Set this property on the browser to stop specialTabs.useDefaultIcon
      // overwriting it.
      browser.mIconURL = iconURL;
      gTabmail.setTabIcon(tab, iconURL);
    }
  }
}
