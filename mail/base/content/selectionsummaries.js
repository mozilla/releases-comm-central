/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals gSummaryFrameManager */ // From messenger.js

/**
 * Summarize a set of selected messages.  This can either be a single thread or
 * multiple threads.
 *
 * @param aMessageDisplay The MessageDisplayWidget object responsible for
 *                         showing messages.
 */
function summarizeSelection(aMessageDisplay) {
  // Figure out if we're looking at one thread or more than one thread. We want
  // the view's version of threading, not the database's version, in order to
  // thread together cross-folder messages. XXX: This falls apart for group by
  // sort; what we really want is a way to specify only the cross-folder view.
  const folderDisplay = aMessageDisplay.folderDisplay;
  const selectedIndices = folderDisplay.selectedIndices;
  const dbView = folderDisplay.view.dbView;

  const getThreadId = function (index) {
    return dbView.getThreadContainingIndex(index).getRootHdr().messageKey;
  };

  const firstThreadId = getThreadId(selectedIndices[0]);
  let oneThread = true;
  for (let i = 1; i < selectedIndices.length; i++) {
    if (getThreadId(selectedIndices[i]) != firstThreadId) {
      oneThread = false;
      break;
    }
  }

  const selectedMessages = folderDisplay.selectedMessages;
  if (oneThread) {
    summarizeThread(selectedMessages, aMessageDisplay);
  } else {
    summarizeMultipleSelection(selectedMessages, aMessageDisplay);
  }
}

/**
 * Given an array of messages which are all in the same thread, summarize them.
 *
 * @param aSelectedMessages Array of message headers.
 * @param aMessageDisplay   The MessageDisplayWidget object responsible for
 *                          showing messages.
 */
function summarizeThread(aSelectedMessages, aMessageDisplay) {
  const kSummaryURL = "chrome://messenger/content/multimessageview.xhtml";

  aMessageDisplay.singleMessageDisplay = false;
  gSummaryFrameManager.loadAndCallback(kSummaryURL, function () {
    const childWindow = gSummaryFrameManager.iframe.contentWindow;
    try {
      childWindow.gMessageSummary.summarize(
        "thread",
        aSelectedMessages,
        aMessageDisplay.folderDisplay.view.dbView,
        aMessageDisplay.folderDisplay.selectMessages.bind(
          aMessageDisplay.folderDisplay
        ),
        aMessageDisplay
      );
    } catch (e) {
      console.error(e);
      throw e;
    }
  });
}

/**
 * Given an array of message URIs, cause the message panel to display a summary
 * of them.
 *
 * @param aSelectedMessages Array of message headers.
 * @param aMessageDisplay   The MessageDisplayWidget object responsible for
 *                          showing messages.
 */
function summarizeMultipleSelection(aSelectedMessages, aMessageDisplay) {
  const kSummaryURL = "chrome://messenger/content/multimessageview.xhtml";

  aMessageDisplay.singleMessageDisplay = false;
  gSummaryFrameManager.loadAndCallback(kSummaryURL, function () {
    const childWindow = gSummaryFrameManager.iframe.contentWindow;
    try {
      childWindow.gMessageSummary.summarize(
        "multipleselection",
        aSelectedMessages,
        aMessageDisplay.folderDisplay.view.dbView,
        aMessageDisplay.folderDisplay.selectMessages.bind(
          aMessageDisplay.folderDisplay
        ),
        aMessageDisplay
      );
    } catch (e) {
      console.error(e);
      throw e;
    }
  });
}
