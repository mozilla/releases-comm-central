/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["ConversationOpener"];

const { Gloda } = ChromeUtils.import("resource:///modules/gloda/Gloda.jsm");
const { GlodaSyntheticView } = ChromeUtils.import(
  "resource:///modules/gloda/GlodaSyntheticView.jsm"
);

class ConversationOpener {
  static isMessageIndexed(message) {
    if (
      !Services.prefs.getBoolPref("mailnews.database.global.indexer.enabled")
    ) {
      return false;
    }
    if (!message || !message.folder) {
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
      console.error(e);
    }
  }
  onItemsAdded(items) {}
  onItemsModified(items) {}
  onItemsRemoved(items) {}
  onQueryCompleted(collection) {
    try {
      if (!collection.items.length) {
        console.error("Couldn't find a collection for msg: " + this._msgHdr);
      } else {
        const message = collection.items[0];
        let tabmail = this.window.top.document.getElementById("tabmail");
        if (!tabmail) {
          tabmail = Services.wm
            .getMostRecentWindow("mail:3pane")
            .document.getElementById("tabmail");
        }
        tabmail.openTab("mail3PaneTab", {
          folderPaneVisible: false,
          syntheticView: new GlodaSyntheticView({
            conversation: message.conversation,
            message,
          }),
          title: message.conversation.subject,
          background: false,
        });
      }
    } catch (e) {
      console.error(e);
    }
  }
}
