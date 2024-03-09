/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * This object provides you a way to have a synthetic nsIMsgDBView for a single
 * message header.
 */

/**
 * Create a synthetic view suitable for passing to |FolderDisplayWidget.show|.
 * You must pass a single message header in.
 *
 * @param aMsgHdr The message header to create the synthetic view for.
 */
export function MsgHdrSyntheticView(aMsgHdr) {
  this.msgHdr = aMsgHdr;

  this.customColumns = [];
}

MsgHdrSyntheticView.prototype = {
  defaultSort: [
    [Ci.nsMsgViewSortType.byDate, Ci.nsMsgViewSortOrder.descending],
  ],

  /**
   * Request the search be performed and notifications provided to
   * aSearchListener. Since we already have the result with us, this is
   * synchronous.
   */
  search(aSearchListener, aCompletionCallback) {
    this.searchListener = aSearchListener;
    this.completionCallback = aCompletionCallback;
    aSearchListener.onNewSearch();
    aSearchListener.onSearchHit(this.msgHdr, this.msgHdr.folder);
    // we're not really aborting, but it closes things out nicely
    this.abortSearch();
  },

  /**
   * Aborts or completes the search -- we do not make a distinction.
   */
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

  /**
   * Helper function used by |DBViewWrapper.getMsgHdrForMessageID|.
   */
  getMsgHdrForMessageID(aMessageId) {
    if (this.msgHdr.messageId == aMessageId) {
      return this.msgHdr;
    }

    return null;
  },
};
