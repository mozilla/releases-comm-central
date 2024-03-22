/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import { Gloda } from "resource:///modules/gloda/Gloda.sys.mjs";

import { GlodaSyntheticView } from "resource:///modules/gloda/GlodaSyntheticView.sys.mjs";

export class ConversationOpener {
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
  onItemsAdded() {}
  onItemsModified() {}
  onItemsRemoved() {}
  onQueryCompleted(collection) {
    try {
      if (!collection.items.length) {
        console.error("Couldn't find a collection for msg: " + this._msgHdr);
      } else {
        const message = collection.items[0];
        const tabType = "mail3PaneTab";
        const tabParams = {
          folderPaneVisible: false,
          syntheticView: new GlodaSyntheticView({
            conversation: message.conversation,
            message,
          }),
          title: message.conversation.subject,
          background: false,
        };
        const tabmail =
          this.window.top.document.getElementById("tabmail") ??
          Services.wm
            .getMostRecentWindow("mail:3pane")
            ?.document.getElementById("tabmail");
        if (tabmail) {
          tabmail.openTab(tabType, tabParams);
        } else {
          const win = Services.ww.openWindow(
            null,
            "chrome://messenger/content/messenger.xhtml",
            "_blank",
            "chrome,dialog=no,all",
            Cc["@mozilla.org/supports-string;1"].createInstance(
              Ci.nsISupportsString
            )
          );
          const mailStartupObserver = {
            observe(subject) {
              if (subject == win) {
                win.document
                  .getElementById("tabmail")
                  .openTab(tabType, tabParams);
                Services.obs.removeObserver(this, "mail-startup-done");
              }
            },
          };
          Services.obs.addObserver(mailStartupObserver, "mail-startup-done");
        }
      }
    } catch (e) {
      console.error(e);
    }
  }
}
