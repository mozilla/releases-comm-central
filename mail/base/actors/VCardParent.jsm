/* vim: set ts=2 sw=2 et tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const EXPORTED_SYMBOLS = ["VCardParent"];

const { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

class VCardParent extends JSWindowActorParent {
  receiveMessage({ data, target }) {
    const VCardService = Cc[
      "@mozilla.org/addressbook/msgvcardservice;1"
    ].getService(Ci.nsIMsgVCardService);

    let abCard = VCardService.escapedVCardToAbCard(data);
    if (!abCard) {
      return;
    }

    Services.ww.openWindow(
      target.browsingContext.topChromeWindow,
      "chrome://messenger/content/addressbook/abNewCardDialog.xhtml",
      "",
      "chrome,resizable=no,titlebar,modal,centerscreen",
      abCard
    );
  }
}
