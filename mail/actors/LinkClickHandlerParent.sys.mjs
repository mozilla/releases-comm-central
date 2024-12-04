/* vim: set ts=2 sw=2 et tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  openLinkExternally,
  openLinkInNewTab,
} from "resource:///modules/LinkHelper.sys.mjs";
import { TabManager } from "chrome://remote/content/shared/TabManager.sys.mjs";

export class LinkClickHandlerParent extends JSWindowActorParent {
  receiveMessage({ name, data }) {
    switch (name) {
      case "openLinkExternally":
        openLinkExternally(data);
        break;
      case "openLinkInNewTab":
        {
          const browsingContext = TabManager.getBrowsingContextById(
            data.refererTopBrowsingContextId
          );
          const browser = browsingContext?.embedderElement;
          openLinkInNewTab(data.url, {
            initialBrowsingContextGroupId: browser?.getAttribute(
              "initialBrowsingContextGroupId"
            ),
            linkHandler:
              browser?.getAttribute("messagemanagergroup") || "browsers",
            userContextId: browsingContext?.originAttributes.userContextId,
            triggeringPrincipal: this.manager.documentPrincipal,
            csp: browser?.csp,
          });
        }
        break;
    }
  }
}

export class StrictLinkClickHandlerParent extends LinkClickHandlerParent {}
