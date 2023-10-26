/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * This file is charged with providing you a way to have a pretty gloda-backed
 *  nsIMsgDBView.
 */

const EXPORTED_SYMBOLS = ["GlodaSyntheticView"];

/**
 * Create a synthetic view suitable for passing to |FolderDisplayWidget.show|.
 * You must pass a query, collection, or conversation in.
 *
 * @param {GlodaQuery} [aArgs.query] A gloda query to run.
 * @param {GlodaCollection} [aArgs.collection] An already-populated collection
 *     to display.  Do not call getCollection on a query and hand us that.  We
 *     will not register ourselves as a listener and things will not work.
 * @param {GlodaConversation} [aArgs.conversation] A conversation whose messages
 *     you want to display.
 */
function GlodaSyntheticView(aArgs) {
  if ("query" in aArgs) {
    this.query = aArgs.query;
    this.collection = this.query.getCollection(this);
    this.completed = false;
    this.viewType = "global";
  } else if ("collection" in aArgs) {
    this.query = null;
    this.collection = aArgs.collection;
    this.completed = true;
    this.viewType = "global";
  } else if ("conversation" in aArgs) {
    this.collection = aArgs.conversation.getMessagesCollection(this);
    this.query = this.collection.query;
    this.completed = false;
    this.viewType = "conversation";
    this.selectedMessage = aArgs.message.folderMessage;
  } else {
    throw new Error("You need to pass a query or collection");
  }

  this.customColumns = [];
}
GlodaSyntheticView.prototype = {
  defaultSort: [
    [Ci.nsMsgViewSortType.byDate, Ci.nsMsgViewSortOrder.descending],
  ],

  /**
   * Request the search be performed and notification provided to
   *  aSearchListener.  If results are already available, they should
   *  be provided to aSearchListener without re-performing the search.
   */
  search(aSearchListener, aCompletionCallback) {
    this.searchListener = aSearchListener;
    this.completionCallback = aCompletionCallback;

    this.searchListener.onNewSearch();
    if (this.completed) {
      this.reportResults(this.collection.items);
      // we're not really aborting, but it closes things out nicely
      this.abortSearch();
    }
  },

  abortSearch() {
    if (this.searchListener) {
      this.searchListener.onSearchDone(Cr.NS_OK);
    }
    if (this.completionCallback) {
      this.completionCallback();
    }
    this.searchListener = null;
    this.completionCallback = null;
  },

  reportResults(aItems) {
    for (const item of aItems) {
      const hdr = item.folderMessage;
      if (hdr) {
        this.searchListener.onSearchHit(hdr, hdr.folder);
      }
    }
  },

  /**
   * Helper function used by |DBViewWrapper.getMsgHdrForMessageID| since there
   *  are no actual backing folders for it to check.
   */
  getMsgHdrForMessageID(aMessageId) {
    for (const item of this.collection.items) {
      if (item.headerMessageID == aMessageId) {
        const hdr = item.folderMessage;
        if (hdr) {
          return hdr;
        }
      }
    }
    return null;
  },

  /**
   * The default set of columns to show.
   */
  DEFAULT_COLUMN_STATES: {
    threadCol: {
      visible: true,
    },
    flaggedCol: {
      visible: true,
    },
    subjectCol: {
      visible: true,
    },
    correspondentCol: {
      visible: Services.prefs.getBoolPref("mail.threadpane.use_correspondents"),
    },
    senderCol: {
      visible: !Services.prefs.getBoolPref(
        "mail.threadpane.use_correspondents"
      ),
    },
    dateCol: {
      visible: true,
    },
    locationCol: {
      visible: true,
    },
  },

  // --- settings persistence
  getPersistedSetting(aSetting) {
    try {
      return JSON.parse(
        Services.prefs.getCharPref(
          "mailnews.database.global.views." + this.viewType + "." + aSetting
        )
      );
    } catch (e) {
      return this.getDefaultSetting(aSetting);
    }
  },
  setPersistedSetting(aSetting, aValue) {
    Services.prefs.setCharPref(
      "mailnews.database.global.views." + this.viewType + "." + aSetting,
      JSON.stringify(aValue)
    );
  },
  getDefaultSetting(aSetting) {
    if (aSetting == "columns") {
      return this.DEFAULT_COLUMN_STATES;
    }
    return undefined;
  },

  // --- collection listener
  onItemsAdded(aItems, aCollection) {
    if (this.searchListener) {
      this.reportResults(aItems);
    }
  },
  onItemsModified(aItems, aCollection) {},
  onItemsRemoved(aItems, aCollection) {},
  onQueryCompleted(aCollection) {
    this.completed = true;
    if (this.searchListener) {
      this.searchListener.onSearchDone(Cr.NS_OK);
    }
    if (this.completionCallback) {
      this.completionCallback();
    }
  },
};
