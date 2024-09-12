/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export class LinkHandlerParent extends JSWindowActorParent {
  receiveMessage(msg) {
    const browser = this.browsingContext.top.embedderElement;
    if (!browser) {
      return;
    }

    switch (msg.name) {
      case "Link:SetIcon":
        this.setIconFromLink(browser, msg.data.iconURL, msg.data.isRichIcon);
        break;
    }
  }

  setIconFromLink(browser, iconURL, isRichIcon) {
    const tabmail = browser.ownerDocument.getElementById("tabmail");
    if (!tabmail) {
      return;
    }

    const tab = tabmail.getTabForBrowser(browser);
    if (tab?.mode?.type != "contentTab") {
      return;
    }

    let iconURI;
    try {
      iconURI = Services.io.newURI(iconURL);
    } catch (ex) {
      console.error(ex);
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

    if (!isRichIcon) {
      tabmail.setTabFavIcon(
        tab,
        iconURL,
        "chrome://messenger/skin/icons/new/compact/draft.svg"
      );
    }
  }
}
