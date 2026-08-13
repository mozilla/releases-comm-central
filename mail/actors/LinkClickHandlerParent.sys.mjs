/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  openLinkExternally,
  openLinkInNewTab,
} from "resource:///modules/LinkHelper.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  PhishingDetector: "resource:///modules/PhishingDetector.sys.mjs",
});

export class LinkClickHandlerParent extends JSWindowActorParent {
  receiveMessage({ name, data }) {
    const browser = this.browsingContext?.top.embedderElement;
    if (!browser) {
      return;
    }
    const group = browser.getAttribute("messagemanagergroup");

    switch (name) {
      case "openLinkExternally":
        if (group == "mail-message") {
          const urlPhishCheckResult =
            lazy.PhishingDetector.warnOnSuspiciousLinkClick(
              this.browsingContext.associatedWindow,
              data.href,
              data.linkText
            );
          if (urlPhishCheckResult === 1) {
            // Block request.
            break;
          }
          if (urlPhishCheckResult === 0) {
            // Use linkText instead.
            openLinkExternally(data.linkText);
            break;
          }
        }
        openLinkExternally(data.href);
        break;
      case "openLinkInNewTab":
        openLinkInNewTab(data.href, {
          initialBrowsingContextGroupId: browser.getAttribute(
            "initialBrowsingContextGroupId"
          ),
          linkHandler: group || "browsers",
          userContextId: this.browsingContext.originAttributes.userContextId,
          triggeringPrincipal: this.manager.documentPrincipal,
          csp: browser.csp,
        });
        break;
    }
  }
}
export class RelaxedLinkClickHandlerParent extends LinkClickHandlerParent {}

export class StrictLinkClickHandlerParent extends LinkClickHandlerParent {}
