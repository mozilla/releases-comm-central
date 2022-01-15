/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["ConversationOpener"];

const { Gloda } = ChromeUtils.import("resource:///modules/gloda/Gloda.jsm");
const { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

class ConversationOpener {
  static isMessageIndexed(message) {
    if (
      !Services.prefs.getBoolPref("mailnews.database.global.indexer.enabled")
    ) {
      return false;
    }
    if (!message) {
      return false;
    }
    return Gloda.isMessageIndexed(message);
  }

  constructor(window) {
    this.window = window;
  }
  openConversationForMessages(messages) {
    if (messages.length < 1) {
      return;
    }
    try {
      this._items = [];
      this._msgHdr = messages[0];
      this._queries = [Gloda.getMessageCollectionForHeaders(messages, this)];
    } catch (e) {
      Cu.reportError(e);
    }
  }
  onItemsAdded(items) {}
  onItemsModified(items) {}
  onItemsRemoved(items) {}
  onQueryCompleted(collection) {
    try {
      if (!collection.items.length) {
        Cu.reportError("Couldn't find a collection for msg: " + this._msgHdr);
      } else {
        let message = collection.items[0];
        this.window.browsingContext.topChromeWindow.document
          .getElementById("tabmail")
          .openTab("glodaList", {
            conversation: message.conversation,
            message,
            title: message.conversation.subject,
            background: false,
          });
      }
    } catch (e) {
      Cu.reportError(e);
    }
  }
}
