/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export class MailMessageParent extends JSWindowActorParent {
  receiveMessage(message) {
    // `win` is the about:message window.
    const win = this.browsingContext.embedderElement?.documentGlobal;
    if (!win?.gMessageURI) {
      return;
    }

    switch (message.name) {
      case "MailMessage:VisibilityChange":
        win.autoMarkAsRead();
        break;
    }
  }
}
