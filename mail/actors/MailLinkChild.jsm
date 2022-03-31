/* vim: set ts=2 sw=2 et tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const EXPORTED_SYMBOLS = ["MailLinkChild"];

const PREFIXES = ["mailto:", "mid:"];

class MailLinkChild extends JSWindowActorChild {
  handleEvent(event) {
    let href = event.target.href;
    if (
      !href ||
      // Do nothing if not the main button clicked.
      event.button > 0 ||
      // Do nothing if in the compose window.
      this.document.location.href == "about:blank?compose"
    ) {
      return;
    }

    for (let prefix of PREFIXES) {
      if (href.startsWith(prefix)) {
        this.sendAsyncMessage(prefix, href);
        event.preventDefault();
        return;
      }
    }
  }
}
