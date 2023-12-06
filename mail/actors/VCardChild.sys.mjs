/* vim: set ts=2 sw=2 et tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

export class VCardChild extends JSWindowActorChild {
  handleEvent(event) {
    // This link comes from VCardMimeConverter.convertToHTML in VCardUtils.jsm.
    if (event.target.classList.contains("moz-vcard-badge")) {
      if (event.button == 0) {
        // The href is a data:text/vcard URL.
        let href = event.target.href;
        href = href.substring(href.indexOf(",") + 1);
        this.sendAsyncMessage("addVCard", href);
      }
      event.preventDefault();
    }
  }
}
