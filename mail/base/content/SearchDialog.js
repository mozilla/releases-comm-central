/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from ../../../mailnews/extensions/newsblog/newsblogOverlay.js */
/* import-globals-from ../../../mailnews/search/content/searchTerm.js */
/* import-globals-from globalOverlay.js */

/* globals validateFileName */ // From utilityOverlay.js
/* globals messageFlavorDataProvider */ // From messenger.js

"use strict";

ChromeUtils.importESModule("chrome://messenger/content/treecol-image.mjs", {
  global: "current",
});
ChromeUtils.defineESModuleGetters(this, {
  DBViewWrapper: "resource:///modules/DBViewWrapper.sys.mjs",
  MailUtils: "resource:///modules/MailUtils.sys.mjs",
  PluralForm: "resource:///modules/PluralForm.sys.mjs",
  TagUtils: "resource:///modules/TagUtils.sys.mjs",
  ThreadPaneColumns: "chrome://messenger/content/ThreadPaneColumns.mjs",
  TreeSelection: "chrome://messenger/content/TreeSelection.mjs",
  UIFontSize: "resource:///modules/UIFontSize.sys.mjs",
});

var gDBView;
var nsMsgKey_None = 0xffffffff;
var nsMsgViewIndex_None = 0xffffffff;

var messenger;
var msgWindow;

var gCurrentFolder;

var gFolderDisplay;

var gFolderPicker;
var gStatusText;

var gSearchBundle;

var gSearchStopButton;
var gClearButton;

// Should we try to search online?
var gSearchOnline = false;

window.addEventListener("load", searchOnLoad);
window.addEventListener("unload", () => {
  onSearchStop();
  searchOnUnload();
});
window.addEventListener("load", ThreadPaneOnLoad, true);

/**
 * Abstraction for a widget that (roughly speaking) displays the contents of
 *  folders.  The widget belongs to a tab and has a lifetime as long as the tab
 *  that contains it.  This class is strictly concerned with the UI aspects of
 *  this; the DBViewWrapper class handles the view details (and is exposed on
 *  the 'view' attribute.)
 *
 * The search window subclasses this into the SearchFolderDisplayWidget rather
 *  than us attempting to generalize everything excessively.  This is because
 *  we hate the search window and don't want to clutter up this code for it.
 * The standalone message display window also subclasses us; we do not hate it,
 *  but it's not invited to our birthday party either.
 * For reasons of simplicity and the original order of implementation, this
 *  class does alter its behavior slightly for the benefit of the standalone
 *  message window.  If no tab info is provided, we avoid touching tabmail
 *  (which is good, because it won't exist!)  And now we guard against treeBox
 *  manipulations...
 */
function FolderDisplayWidget() {
  this.view = new DBViewWrapper(this);

  /**
   * The XUL tree node, as retrieved by getDocumentElementById.  The caller is
   *  responsible for setting this.
   */
  this.tree = null;

  /**
   * The nsIMsgWindow corresponding to the window that holds us.  There is only
   *  one of these per tab.  The caller is responsible for setting this.
   */
  this.msgWindow = null;
  /**
   * The nsIMessenger instance that corresponds to our tab/window.  We do not
   *  use this ourselves, but are responsible for using it to update the
   *  global |messenger| object so that our tab maintains its own undo and
   *  navigation history.  At some point we might touch it for those reasons.
   */
  this.messenger = null;

  /**
   * Flag to expose whether all messages are loaded or not.  Set by
   *  onMessagesLoaded() when aAll is true.
   */
  this._allMessagesLoaded = false;

  /** the next view index to select once the delete completes */
  this._nextViewIndexAfterDelete = null;
}
FolderDisplayWidget.prototype = {
  /**
   * @returns {boolean} true if the selection should be summarized for this folder. This
   *   is based on the mail.operate_on_msgs_in_collapsed_threads pref and
   *   if we are in a newsgroup folder. XXX When bug 478167 is fixed, this
   *   should be limited to being disabled for newsgroups that are not stored
   *   offline.
   */
  get summarizeSelectionInFolder() {
    return (
      Services.prefs.getBoolPref("mail.operate_on_msgs_in_collapsed_threads") &&
      !(this.view.displayedFolder instanceof Ci.nsIMsgNewsFolder)
    );
  },

  /**
   * @returns {nsITreeSelection} the nsITreeSelection object for our tree view.  This exists for
   *     the benefit of message tabs that haven't been switched to yet.
   *     We provide a fake tree selection in those cases.
   * @protected
   */
  get treeSelection() {
    // If we haven't switched to this tab yet, dbView will exist but
    // dbView.selection won't, so use the fake tree selection instead.
    if (this.view.dbView) {
      return this.view.dbView.selection;
    }
    return null;
  },

  /**
   * @name Columns
   * @protected
   */
  // @{

  /**
   * A Map of all stock sortable columns, mapping their column ids and their
   * sortType. Since it only includes built-in columns, this can be cached.
   *
   * @type {Map<string, string>}
   */
  BUILTIN_SORT_COLUMNS: new Map(
    ThreadPaneColumns.getDefaultColumns()
      .filter(c => !c.custom && c.sortKey)
      .map(c => [c.id, c.sortKey])
  ),

  /**
   * A Set of all stock unsortable columns. Since it only includes built-in
   * columns, this can be cached.
   *
   * @type {Set<string>}
   */
  BUILTIN_NOSORT_COLUMNS: new Set(
    ThreadPaneColumns.getDefaultColumns()
      .filter(c => !c.custom && !c.sortKey)
      .map(c => c.id)
  ),

  // @}

  /**
   * Close resources associated with the currently displayed folder because you
   *  no longer care about this FolderDisplayWidget.
   */
  close() {
    this.view.close();
    this.messenger.setWindow(null, null);
    this.messenger = null;
  },

  /*   ===============================   */
  /* ===== IDBViewWrapper Listener ===== */
  /*   ===============================   */

  /**
   * @name IDBViewWrapperListener Interface
   * @private
   */
  // @{

  /**
   * @returns {boolean} true if the mail view picker is visible.  This affects whether the
   *     DBViewWrapper will actually use the persisted mail view or not.
   */
  get shouldUseMailViews() {
    return false;
  },

  /**
   * Let the viewWrapper know if we should defer message display because we
   *  want the user to connect to the server first so password authentication
   *  can occur.
   *
   * @returns {boolean} true if the folder should be shown immediately, false if we should
   *     wait for updateFolder to complete.
   */
  get shouldDeferMessageDisplayUntilAfterServerConnect() {
    let passwordPromptRequired = false;

    if (Services.prefs.getBoolPref("mail.password_protect_local_cache")) {
      passwordPromptRequired =
        this.view.displayedFolder.server.passwordPromptRequired;
    }

    return passwordPromptRequired;
  },

  /**
   * The view wrapper tells us when it starts loading a folder, and we set the
   *  cursor busy.  Setting the cursor busy on a per-tab basis is us being
   *  nice to the future. Loading a folder is a blocking operation that is going
   *  to make us unresponsive and accordingly make it very hard for the user to
   *  change tabs.
   */
  onFolderLoading() {},

  /**
   * The view wrapper tells us when a search is active, and we mark the tab as
   *  thinking so the user knows something is happening.  'Searching' in this
   *  case is more than just a user-initiated search.  Virtual folders / saved
   *  searches, mail views, plus the more obvious quick search are all based off
   *  of searches and we will receive a notification for them.
   */
  onSearching() {},

  /**
   * Things we do on creating a view:
   * - notify the observer service so that custom column handler providers can
   *   add their custom columns to our view.
   */
  onCreatedView() {
    // All of our messages are not displayed if the view was just created.  We
    //  will get an onMessagesLoaded(true) nearly immediately if this is a local
    //  folder where view creation is synonymous with having all messages.
    this._allMessagesLoaded = false;

    gDBView = this.view.dbView;

    // A change in view may result in changes to sorts, the view menu, etc.
    // Do this before we 'reroot' the dbview.
    this._updateThreadDisplay();

    // this creates a new selection object for the view.
    if (this.tree) {
      this.tree.view = this.view.dbView;
    }

    // The data payload used to be viewType + ":" + viewFlags.  We no longer
    //  do this because we already have the implied contract that gDBView is
    //  valid at the time we generate the notification.  In such a case, you
    //  can easily get that information from the gDBView.  (The documentation
    //  on creating a custom column assumes gDBView.)
    Services.obs.notifyObservers(this.view.displayedFolder, "MsgCreateDBView");
  },

  /**
   * If our view is being destroyed and it is coming back, we want to save the
   *  current selection so we can restore it when the view comes back.
   */
  onDestroyingView() {
    gDBView = null;

    // if we have no view, no messages could be loaded.
    this._allMessagesLoaded = false;

    // but the actual tree view selection (based on view indices) is a goner no
    //  matter what, make everyone forget.
    this.view.dbView.selection = null;
    this._nextViewIndexAfterDelete = null;
  },

  /**
   * Restore persisted information about what columns to display for the folder.
   *  If we have no persisted information, we leave/set _savedColumnStates null.
   *  The column states will be set to default values in onDisplayingFolder in
   *  that case.
   */
  onLoadingFolder() {},

  /**
   * We are entering the folder for display:
   * - set the header cache size.
   * - Setup the columns if we did not already depersist in |onLoadingFolder|.
   */
  onDisplayingFolder() {},

  /**
   * Notification from DBViewWrapper that it is closing the folder.  This can
   *  happen for reasons other than our own 'close' method closing the view.
   *  For example, user deletion of the folder or underlying folder closes it.
   */
  onLeavingFolder() {},

  /**
   * Indicates whether we are done loading the messages that should be in this
   *  folder.  This is being surfaced for testing purposes, but could be useful
   *  to other code as well.  But don't poll this property; ask for an event
   *  that you can hook.
   */
  get allMessagesLoaded() {
    return this._allMessagesLoaded;
  },

  /**
   * Things to do once some or all the messages that should show up in a folder
   *  have shown up.  For a real folder, this happens when the folder is
   *  entered. For a virtual folder, this happens when the search completes.
   *
   * What we do:
   * - Any scrolling required!
   */
  onMessagesLoaded(aAll) {
    this._allMessagesLoaded = aAll;

    // - if something's already selected (e.g. in a message tab), scroll to the
    //   first selected message and get out
    if (this.view.dbView.numSelected > 0) {
      this.ensureRowIsVisible(this.view.dbView.viewIndexForFirstSelectedMsg);
      return;
    }

    // - new messages
    // if configured to scroll to new messages, try that
    if (
      Services.prefs.getBoolPref("mailnews.scroll_to_new_message") &&
      this.navigate(Ci.nsMsgNavigationType.firstNew, /* select */ false)
    ) {
      return;
    }

    // - towards the newest messages, but don't select
    if (
      this.view.isSortedAscending &&
      this.view.sortImpliesTemporalOrdering &&
      this.navigate(Ci.nsMsgNavigationType.lastMessage, /* select */ false)
    ) {
      return;
    }

    // - to the top, the coliseum
    this.ensureRowIsVisible(0);
  },

  /**
   * Just the sort or threading was changed, without changing other things.  We
   *  will not get this notification if the view was re-created, for example.
   */
  onSortChanged() {
    UpdateSortIndicators(
      this.view.primarySortColumnId,
      this.view.primarySortOrder
    );
  },

  /**
   * Messages (that may have been displayed) have been removed; this may impact
   * our message selection. We might know it's coming; if we do then
   * this._nextViewIndexAfterDelete should know what view index to select next.
   * For the imap mark-as-deleted we won't know beforehand.
   */
  onMessagesRemoved() {
    // - we saw this coming
    const rowCount = this.view.dbView.rowCount;
    if (this._nextViewIndexAfterDelete != null) {
      // adjust the index if it is after the last row...
      // (this can happen if the "mail.delete_matches_sort_order" pref is not
      //  set and the message is the last message in the view.)
      if (this._nextViewIndexAfterDelete >= rowCount) {
        this._nextViewIndexAfterDelete = rowCount - 1;
      }
      // just select the index and get on with our lives
      this.selectViewIndex(this._nextViewIndexAfterDelete);
      this._nextViewIndexAfterDelete = null;
      return;
    }

    // - we didn't see it coming

    // A deletion happened to our folder.
    const treeSelection = this.treeSelection;
    // we can't fix the selection if we have no selection
    if (!treeSelection) {
      return;
    }

    // For reasons unknown (but theoretically knowable), sometimes the selection
    //  object will be invalid.  At least, I've reliably seen a selection of
    //  [0, 0] with 0 rows.  If that happens, we need to fix up the selection
    //  here.
    if (rowCount == 0 && treeSelection.count) {
      // nsTreeSelection doesn't generate an event if we use clearRange, so use
      //  that to avoid spurious events, given that we are going to definitely
      //  trigger a change notification below.
      treeSelection.clearRange(0, 0);
    }

    // Tell the view that things have changed so it can update itself suitably.
    if (this.view.dbView) {
      this.view.dbView.selectionChanged();
    }
  },

  /**
   * Messages were not actually removed, but we were expecting that they would
   *  be.  Clean-up what onMessagesRemoved would have cleaned up, namely the
   *  next view index to select.
   */
  onMessageRemovalFailed() {
    this._nextViewIndexAfterDelete = null;
  },

  /**
   * Update the status bar to reflect our exciting message counts.
   */
  onMessageCountsChanged() {},
  // @}
  /* ===== End IDBViewWrapperListener ===== */

  /* ===== Hints from the command infrastructure ===== */
  /**
   * @name Command Infrastructure Hints
   * @protected
   */
  // @{

  /**
   * doCommand helps us out by telling us when it is telling the view to delete
   *  some messages.  Ideally it should go through us / the DB View Wrapper to
   *  kick off the delete in the first place, but that's a thread I don't want
   *  to pull on right now.
   * We use this hint to figure out the next message to display once the
   *  deletion completes.  We do this before the deletion happens because the
   *  selection is probably going away (except in the IMAP delete model), and it
   *  might be too late to figure this out after the deletion happens.
   * Our automated complement (that calls us) is updateNextMessageAfterDelete.
   */
  hintAboutToDeleteMessages() {
    // save the value, even if it is nsMsgViewIndex_None.
    this._nextViewIndexAfterDelete = this.view.dbView.msgToSelectAfterDelete;
  },
  // @}
  /* ===== End hints from the command infrastructure ==== */

  _updateThreadDisplay() {
    if (this.view.dbView) {
      UpdateSortIndicators(
        this.view.primarySortColumnId,
        this.view.primarySortOrder
      );
      SetNewsFolderColumns();
      UpdateSelectCol();
    }
  },

  /**
   * @name Command Support
   */
  // @{

  /**
   * @returns {boolean} true if there is a db view and the command is enabled on the view.
   *  This function hides some of the XPCOM-odditities of the getCommandStatus
   *  call.
   */
  getCommandStatus(aCommandType) {
    // no view means not enabled
    if (!this.view.dbView) {
      return false;
    }
    const enabledObj = {},
      checkStatusObj = {};
    this.view.dbView.getCommandStatus(aCommandType, enabledObj, checkStatusObj);
    return enabledObj.value;
  },

  /**
   * Make code cleaner by allowing peoples to call doCommand on us rather than
   *  having to do folderDisplayWidget.view.dbView.doCommand.
   *
   * @param {string} aCommandName - The command name to invoke.
   */
  doCommand(aCommandName) {
    return this.view.dbView && this.view.dbView.doCommand(aCommandName);
  },

  /**
   * Make code cleaner by allowing peoples to call doCommandWithFolder on us
   *  rather than having to do:
   *  folderDisplayWidget.view.dbView.doCommandWithFolder.
   *
   * @param {string} aCommandName - The command name to invoke.
   * @param {nsIMsgFolder} aFolder - The folder context for the command.
   */
  doCommandWithFolder(aCommandName, aFolder) {
    return (
      this.view.dbView &&
      this.view.dbView.doCommandWithFolder(aCommandName, aFolder)
    );
  },
  // @}

  /**
   * @name Navigation
   * @protected
   */
  // @{

  /**
   * Navigate using nsMsgNavigationType rules and ensuring the resulting row is
   *  visible.  This is trickier than it used to be because we now support
   *  treating collapsed threads as the set of all the messages in the collapsed
   *  thread rather than just the root message in that thread.
   *
   * @param {nsMsgNavigationType} aNavType navigation command.
   * @param {boolean} [aSelect=true] should we select the message if we find
   *     one?
   * @returns {boolean} true if the navigation constraint matched anything, false if not.
   *     We will have navigated if true, we will have done nothing if false.
   */
  navigate(aNavType, aSelect) {
    if (aSelect === undefined) {
      aSelect = true;
    }
    const resultKeyObj = {},
      resultIndexObj = {},
      threadIndexObj = {};

    const summarizeSelection = this.summarizeSelectionInFolder;

    const treeSelection = this.treeSelection; // potentially magic getter
    const currentIndex = treeSelection ? treeSelection.currentIndex : 0;

    let viewIndex;
    // if we're doing next unread, and a collapsed thread is selected, and
    // the top level message is unread, just set the result manually to
    // the top level message, without using viewNavigate.
    if (
      summarizeSelection &&
      aNavType == Ci.nsMsgNavigationType.nextUnreadMessage &&
      currentIndex != -1 &&
      this.view.isCollapsedThreadAtIndex(currentIndex) &&
      !(this.view.dbView.getFlagsAt(currentIndex) & Ci.nsMsgMessageFlags.Read)
    ) {
      viewIndex = currentIndex;
    } else {
      // always 'wrap' because the start index is relative to the selection.
      // (keep in mind that many forms of navigation do not care about the
      //  starting position or 'wrap' at all; for example, firstNew just finds
      //  the first new message.)
      // allegedly this does tree-expansion for us.
      this.view.dbView.viewNavigate(
        aNavType,
        resultKeyObj,
        resultIndexObj,
        threadIndexObj,
        true
      );
      viewIndex = resultIndexObj.value;
    }

    if (viewIndex == nsMsgViewIndex_None) {
      return false;
    }

    // - Expand if required.
    // (The nsMsgDBView isn't really aware of the varying semantics of
    //  collapsed threads, so viewNavigate might tell us about the root message
    //  and leave it collapsed, not realizing that it needs to be expanded.)
    if (summarizeSelection && this.view.isCollapsedThreadAtIndex(viewIndex)) {
      this.view.dbView.toggleOpenState(viewIndex);
    }

    if (aSelect) {
      this.selectViewIndex(viewIndex);
    } else {
      this.ensureRowIsVisible(viewIndex);
    }
    return true;
  },
  // @}

  /**
   * @name Selection
   */
  // @{

  /**
   * @returns {?nsIMsgDBHdr} the message header for the first selected message,
   *   or null if there is no selected message.
   *
   * If the user has right-clicked on a message, this method will return that
   *  message and not the 'current index' (the dude with the dotted selection
   *  rectangle around him.)  If you instead always want the currently
   *  displayed message (which is not impacted by right-clicking), then you
   *  would want to access the displayedMessage property on the
   *  MessageDisplayWidget.  You can get to that via the messageDisplay
   *  attribute on this object or (potentially) via the gMessageDisplay object.
   */
  get selectedMessage() {
    // there are inconsistencies in hdrForFirstSelectedMessage between
    //  nsMsgDBView and nsMsgSearchDBView in whether they use currentIndex,
    //  do it ourselves.  (nsMsgDBView does not use currentIndex, search does.)
    const treeSelection = this.treeSelection;
    if (!treeSelection || !treeSelection.count) {
      return null;
    }
    const minObj = {},
      maxObj = {};
    treeSelection.getRangeAt(0, minObj, maxObj);
    return this.view.dbView.getMsgHdrAt(minObj.value);
  },

  /**
   * @returns {boolean} true if there is a selected message and it's an RSS feed message;
   *  a feed message does not have to be in an rss account folder if stored in
   *  Tb15 and later.
   */
  get selectedMessageIsFeed() {
    return FeedUtils.isFeedMessage(this.selectedMessage);
  },

  /**
   * @returns {integer} the number of selected messages.
   *  If summarizeSelectionInFolder is
   *  true, then any collapsed thread roots that are selected will also
   *  conceptually have all of the messages in that thread selected.
   */
  get selectedCount() {
    return this.selectedMessages.length;
  },

  /**
   * Provides a list of the view indices that are selected which is *not* the
   *  same as the rows of the selected messages.  When
   *  summarizeSelectionInFolder is true, messages may be selected but not
   *  visible (because the thread root is selected.)
   * You probably want to use the |selectedMessages| attribute instead of this
   *  one.  (Or selectedMessageUris in some rare cases.)
   *
   * If the user has right-clicked on a message, this will return that message
   *  and not the selection prior to the right-click.
   *
   * @returns {number[]} a list of the view indices that are currently selected
   */
  get selectedIndices() {
    if (!this.view.dbView) {
      return [];
    }

    return this.view.dbView.getIndicesForSelection();
  },

  /**
   * Provides a list of the message headers for the currently selected messages.
   *  If summarizeSelectionInFolder is true, then any collapsed thread roots
   *  that are selected will also (conceptually) have all of the messages in
   *  that thread selected and they will be included in the returned list.
   *
   * If the user has right-clicked on a message, this will return that message
   *  (and any collapsed children if so enabled) and not the selection prior to
   *  the right-click.
   *
   * @returns {nsIMsgDBHdr} a list of the message headers for the currently
   *   selected messages. If there are no selected messages, the result is
   *   an empty list.
   */
  get selectedMessages() {
    if (!this.view.dbView) {
      return [];
    }
    return this.view.dbView.getSelectedMsgHdrs();
  },

  /**
   * @returns {?string[]} a list of the URIs for the currently selected messages
   *   or null (instead of a list) if there are no selected messages. Do not
   *    pass around URIs unless you have a good reason. Legacy code is an
   *    ok reason.
   *
   * If the user has right-clicked on a message, this will return that message's
   *  URI and not the selection prior to the right-click.
   */
  get selectedMessageUris() {
    if (!this.view.dbView) {
      return null;
    }

    const messageArray = this.view.dbView.getURIsForSelection();
    return messageArray.length ? messageArray : null;
  },

  /**
   * Select the message at view index.
   *
   * @param {number} aViewIndex - The view index to select. This will be
   *   bounds-checked and if it is outside the bounds, we will clear the
   *   selection and bail.
   */
  selectViewIndex(aViewIndex) {
    const treeSelection = this.treeSelection;
    // if we have no selection, we can't select something
    if (!treeSelection) {
      return;
    }
    const rowCount = this.view.dbView.rowCount;
    if (
      aViewIndex == nsMsgViewIndex_None ||
      aViewIndex < 0 ||
      aViewIndex >= rowCount
    ) {
      treeSelection.clearSelection();
      return;
    }

    // Check whether the index is already selected/current.  This can be the
    //  case when we are here as the result of a deletion.  Assuming
    //  nsMsgDBView::NoteChange ran and was not suppressing change
    //  notifications, then it's very possible the selection is already where
    //  we want it to go.  However, in that case, nsMsgDBView::SelectionChanged
    //  bailed without doing anything because m_deletingRows...
    // So we want to generate a change notification if that is the case. (And
    //  we still want to call ensureRowIsVisible, as there may be padding
    //  required.)
    if (
      treeSelection.count == 1 &&
      (treeSelection.currentIndex == aViewIndex ||
        treeSelection.isSelected(aViewIndex))
    ) {
      // Make sure the index we just selected is also the current index.
      //  This can happen when the tree selection adjusts itself as a result of
      //  changes to the tree as a result of deletion.  This will not trigger
      //  a notification.
      treeSelection.select(aViewIndex);
      this.view.dbView.selectionChanged();
    } else {
      // Previous code was concerned about avoiding updating commands on the
      //  assumption that only the selection count mattered.  We no longer
      //  make this assumption.
      // Things that may surprise you about the call to treeSelection.select:
      // 1) This ends up calling the onselect method defined on the XUL 'tree'
      //    tag.  For the 3pane this is the ThreadPaneSelectionChanged method in
      //    That code checks a global to see if it is dealing
      //    with a right-click, and ignores it if so.
      treeSelection.select(aViewIndex);
    }

    this.ensureRowIsVisible(aViewIndex);
  },

  // @}

  /**
   * @name Ensure Visibility
   */
  // @{

  /**
   * Minimum number of lines to display between the 'focused' message and the
   *  top / bottom of the thread pane.
   */
  get visibleRowPadding() {
    let topPadding, bottomPadding;

    // If we can get the height of the folder pane, treat the values as
    //  percentages of that.
    if (this.tree) {
      const topPercentPadding = Services.prefs.getIntPref(
        "mail.threadpane.padding.top_percent"
      );
      const bottomPercentPadding = Services.prefs.getIntPref(
        "mail.threadpane.padding.bottom_percent"
      );

      // Assume the bottom row is half-visible and should generally be ignored.
      // (We could actually do the legwork to see if there is a partial one...)
      const paneHeight = this.tree.getPageLength() - 1;

      // Convert from percentages to absolute row counts.
      topPadding = Math.ceil((topPercentPadding / 100) * paneHeight);
      bottomPadding = Math.ceil((bottomPercentPadding / 100) * paneHeight);

      // We need one visible row not counted in either padding, for the actual
      //  target message. Also helps correct for rounding errors.
      if (topPadding + bottomPadding > paneHeight) {
        if (topPadding > bottomPadding) {
          topPadding--;
        } else {
          bottomPadding--;
        }
      }
    } else {
      // Something's gone wrong elsewhere, and we likely have bigger problems.
      topPadding = 0;
      bottomPadding = 0;
      console.error("Unable to get height of folder pane (treeBox is null)");
    }

    return [topPadding, bottomPadding];
  },

  /**
   * Ensure the given view index is visible, optionally with some padding.
   * By padding, we mean that the index will not be the first or last message
   *  displayed, but rather have messages on either side.
   * We have the concept of a 'lip' when we are at the end of the message
   *  display.  If we are near the end of the display, we want to show an
   *  empty row (at the bottom) so the user knows they are at the end.  Also,
   *  if a message shows up that is new and things are sorted ascending, this
   *  turns out to be useful.
   */
  ensureRowIsVisible(aViewIndex, aBounced) {
    // Dealing with the tree view layout is a nightmare, let's just always make
    //  sure we re-schedule ourselves.  The most particular rationale here is
    //  that the message pane may be toggling its state and it's much simpler
    //  and reliable if we ensure that all of FolderDisplayWidget's state
    //  change logic gets to run to completion before we run ourselves.
    if (!aBounced) {
      const dis = this;
      window.setTimeout(function () {
        dis.ensureRowIsVisible(aViewIndex, true);
      }, 0);
    }

    const tree = this.tree;
    if (!tree || !tree.view) {
      return;
    }

    // try and trigger a reflow...
    tree.getBoundingClientRect();

    const maxIndex = tree.view.rowCount - 1;

    const first = tree.getFirstVisibleRow();
    // Assume the bottom row is half-visible and should generally be ignored.
    // (We could actually do the legwork to see if there is a partial one...)
    const halfVisible = 1;
    const last = tree.getLastVisibleRow() - halfVisible;
    const span = tree.getPageLength() - halfVisible;
    const [topPadding, bottomPadding] = this.visibleRowPadding;

    let target;
    if (aViewIndex >= last - bottomPadding) {
      // The index is after the last visible guy (with padding),
      // move down so that the target index is padded in 1 from the bottom.
      target = Math.min(maxIndex, aViewIndex + bottomPadding) - span;
    } else if (aViewIndex <= first + topPadding) {
      // The index is before the first visible guy (with padding), move up.
      target = Math.max(0, aViewIndex - topPadding);
    } else {
      // It is already visible.
      return;
    }

    // this sets the first visible row
    tree.scrollToRow(target);
  },
  // @}
};

function SetNewsFolderColumns() {
  var sizeColumn = document.getElementById("sizeCol");
  var bundle = document.getElementById("bundle_messenger");

  if (gDBView.usingLines) {
    sizeColumn.setAttribute("label", bundle.getString("linesColumnHeader"));
    sizeColumn.setAttribute(
      "tooltiptext",
      bundle.getString("linesColumnTooltip2")
    );
  } else {
    sizeColumn.setAttribute("label", bundle.getString("sizeColumnHeader"));
    sizeColumn.setAttribute(
      "tooltiptext",
      bundle.getString("sizeColumnTooltip2")
    );
  }
}

// Controller object for search results thread pane
var nsSearchResultsController = {
  supportsCommand(command) {
    switch (command) {
      case "cmd_delete":
      case "cmd_shiftDelete":
      case "button_delete":
      case "cmd_open":
      case "file_message_button":
      case "open_in_folder_button":
      case "saveas_vf_button":
      case "cmd_selectAll":
        return true;
      default:
        return false;
    }
  },

  // this controller only handles commands
  // that rely on items being selected in
  // the search results pane.
  isCommandEnabled(command) {
    var enabled = true;

    switch (command) {
      case "open_in_folder_button":
        if (gFolderDisplay.selectedCount != 1) {
          enabled = false;
        }
        break;
      case "cmd_delete":
      case "cmd_shiftDelete":
      case "button_delete":
        // this assumes that advanced searches don't cross accounts
        if (gFolderDisplay.selectedCount <= 0) {
          enabled = false;
        }
        break;
      case "saveas_vf_button":
        // need someway to see if there are any search criteria...
        return true;
      case "cmd_selectAll":
        return true;
      default:
        if (gFolderDisplay.selectedCount <= 0) {
          enabled = false;
        }
        break;
    }

    return enabled;
  },

  doCommand(command) {
    switch (command) {
      case "cmd_open":
        MsgOpenSelectedMessages();
        return true;

      case "cmd_delete":
      case "button_delete":
        MsgDeleteSelectedMessages(Ci.nsMsgViewCommandType.deleteMsg);
        return true;

      case "cmd_shiftDelete":
        MsgDeleteSelectedMessages(Ci.nsMsgViewCommandType.deleteNoTrash);
        return true;

      case "open_in_folder_button":
        OpenInFolder();
        return true;

      case "saveas_vf_button":
        saveAsVirtualFolder();
        return true;

      case "cmd_selectAll":
        // move the focus to the search results pane
        document.getElementById("threadTree").focus();
        gFolderDisplay.doCommand(Ci.nsMsgViewCommandType.selectAll);
        return true;

      default:
        return false;
    }
  },

  onEvent() {},
};

function UpdateMailSearch() {
  document.commandDispatcher.updateCommands("mail-search");
}

/**
 * Subclass the FolderDisplayWidget to deal with UI specific to the search
 *  window.
 */
function SearchFolderDisplayWidget() {
  FolderDisplayWidget.call(this);
}

SearchFolderDisplayWidget.prototype = {
  __proto__: FolderDisplayWidget.prototype,

  // folder display will want to show the thread pane; we need do nothing
  _showThreadPane() {},

  onSearching(aIsSearching) {
    const progressBar = document.getElementById("statusbar-icon");
    const progressBarContainer = document.getElementById(
      "statusbar-progresspanel"
    );
    gClearButton.disabled = aIsSearching;
    progressBarContainer.hidden = !aIsSearching;
    if (aIsSearching) {
      // Search button becomes the "stop" button
      gSearchStopButton.setAttribute(
        "label",
        gSearchBundle.GetStringFromName("labelForStopButton")
      );
      gSearchStopButton.setAttribute(
        "accesskey",
        gSearchBundle.GetStringFromName("labelForStopButton.accesskey")
      );

      // update our toolbar equivalent
      UpdateMailSearch("new-search");
      // Set progress indicator to indeterminate state.
      progressBar.removeAttribute("value");
      // Tell the user that we're searching.
      gStatusText.setAttribute(
        "value",
        gSearchBundle.GetStringFromName("searchingMessage")
      );
    } else {
      // Stop button resumes being the "search" button
      gSearchStopButton.setAttribute(
        "label",
        gSearchBundle.GetStringFromName("labelForSearchButton")
      );
      gSearchStopButton.setAttribute(
        "accesskey",
        gSearchBundle.GetStringFromName("labelForSearchButton.accesskey")
      );

      // update our toolbar equivalent
      UpdateMailSearch("done-search");
      // Reset progress indicator.
      progressBar.value = 0;
      // Show the result of the search.
      this.updateStatusResultText();
    }
  },

  /**
   * If messages were removed, we might have lost some search results and so
   *  should update our search result text.  Also, defer to our super-class.
   */
  onMessagesRemoved() {
    // result text is only for when we are not searching
    if (!this.view.searching) {
      this.updateStatusResultText();
    }
    this.__proto__.__proto__.onMessagesRemoved.call(this);
  },

  updateStatusResultText() {
    const rowCount = this.view.dbView.rowCount;
    let statusMsg;

    if (rowCount == 0) {
      statusMsg = gSearchBundle.GetStringFromName("noMatchesFound");
    } else {
      statusMsg = PluralForm.get(
        rowCount,
        gSearchBundle.GetStringFromName("matchesFound")
      );
      statusMsg = statusMsg.replace("#1", rowCount);
    }

    gStatusText.setAttribute("value", statusMsg);
  },
};

function searchOnLoad() {
  UIFontSize.registerWindow(window);
  TagUtils.loadTagsIntoCSS(document);
  initializeSearchWidgets();
  initializeSearchWindowWidgets();

  messenger = Cc["@mozilla.org/messenger;1"].createInstance(Ci.nsIMessenger);

  gSearchBundle = Services.strings.createBundle(
    "chrome://messenger/locale/search.properties"
  );
  gSearchStopButton.setAttribute(
    "label",
    gSearchBundle.GetStringFromName("labelForSearchButton")
  );
  gSearchStopButton.setAttribute(
    "accesskey",
    gSearchBundle.GetStringFromName("labelForSearchButton.accesskey")
  );

  gFolderDisplay = new SearchFolderDisplayWidget();
  gFolderDisplay.messenger = messenger;
  gFolderDisplay.msgWindow = msgWindow;
  gFolderDisplay.tree = document.getElementById("threadTree");

  // The view is initially unsorted; get the persisted sortDirection column
  // and set up the user's desired sort. This synthetic view is not backed by
  // a db, so secondary sorts and custom columns are not supported here.
  const sortCol = gFolderDisplay.tree.querySelector("[sortDirection]");
  let isSortable, sortOrder;
  if (sortCol) {
    isSortable = gFolderDisplay.BUILTIN_SORT_COLUMNS.has(sortCol.id);
    sortOrder =
      sortCol.getAttribute("sortDirection") == "descending"
        ? Ci.nsMsgViewSortOrder.descending
        : Ci.nsMsgViewSortOrder.ascending;
  }

  gFolderDisplay.view.openSearchView();

  if (isSortable) {
    gFolderDisplay.view.sort(sortCol.id, sortOrder);
  }

  if (window.arguments && window.arguments[0]) {
    updateSearchFolderPicker(window.arguments[0].folder);
  }

  // Trigger searchTerm.js to create the first criterion.
  onMore(null);
  // Make sure all the buttons are configured.
  UpdateMailSearch("onload");
}

function searchOnUnload() {
  gFolderDisplay.close();
  top.controllers.removeController(nsSearchResultsController);

  msgWindow.closeWindow();
}

function initializeSearchWindowWidgets() {
  gFolderPicker = document.getElementById("searchableFolders");
  gSearchStopButton = document.getElementById("search-button");
  gClearButton = document.getElementById("clear-button");
  hideMatchAllItem();

  msgWindow = Cc["@mozilla.org/messenger/msgwindow;1"].createInstance(
    Ci.nsIMsgWindow
  );
  msgWindow.domWindow = window;

  gStatusText = document.getElementById("statusText");

  // functionality to enable/disable buttons using nsSearchResultsController
  // depending of whether items are selected in the search results thread pane.
  top.controllers.insertControllerAt(0, nsSearchResultsController);
}

/**
 * Handle click on the gSearchStopButton button (when that's labeled "Stop").
 */
function onSearchStop() {
  gFolderDisplay.view.search.session.interruptSearch();
}

function onResetSearch(event) {
  onReset(event);
  gFolderDisplay.view.search.clear();

  gStatusText.setAttribute("value", "");
}

function updateSearchFolderPicker(folder) {
  gCurrentFolder = folder;
  gFolderPicker.menupopup.selectFolder(folder);

  var searchOnline = document.getElementById("checkSearchOnline");
  // We will hide and disable the search online checkbox if we are offline, or
  // if the folder does not support online search.

  // Any offlineSupportLevel > 0 is an online server like IMAP or news.
  if (gCurrentFolder?.server.offlineSupportLevel && !Services.io.offline) {
    searchOnline.hidden = false;
    searchOnline.disabled = false;
  } else {
    searchOnline.hidden = true;
    searchOnline.disabled = true;
  }
  if (gCurrentFolder) {
    setSearchScope(GetScopeForFolder(gCurrentFolder));
  }
}

function updateSearchLocalSystem() {
  setSearchScope(GetScopeForFolder(gCurrentFolder));
}

function UpdateAfterCustomHeaderChange() {
  updateSearchAttributes();
}

function onEnterInSearchTerm() {
  // on enter
  // if not searching, start the search
  // if searching, stop and then start again
  if (
    gSearchStopButton.getAttribute("label") ==
    gSearchBundle.GetStringFromName("labelForSearchButton")
  ) {
    onSearch();
  } else {
    onSearchStop();
    onSearch();
  }
}

function onSearch() {
  const viewWrapper = gFolderDisplay.view;
  const searchTerms = getSearchTerms();

  viewWrapper.beginViewUpdate();
  viewWrapper.search.userTerms = searchTerms.length ? searchTerms : null;
  viewWrapper.search.onlineSearch = gSearchOnline;
  viewWrapper.searchFolders = getSearchFolders();
  viewWrapper.endViewUpdate();
}

/**
 * Get the current set of search terms, returning them as a list.  We filter out
 *  dangerous and insane predicates.
 */
function getSearchTerms() {
  const termCreator = gFolderDisplay.view.search.session;

  const searchTerms = [];
  // searchTerm.js stores wrapper objects in its gSearchTerms array.  Pluck
  //  them.
  for (let iTerm = 0; iTerm < gSearchTerms.length; iTerm++) {
    const termWrapper = gSearchTerms[iTerm].obj;
    const realTerm = termCreator.createTerm();
    termWrapper.saveTo(realTerm);
    // A header search of "" is illegal for IMAP and will cause us to
    //  explode.  You don't want that and I don't want that.  So let's check
    //  if the bloody term is a subject search on a blank string, and if it
    //  is, let's secretly not add the term.  Everyone wins!
    if (
      realTerm.attrib != Ci.nsMsgSearchAttrib.Subject ||
      realTerm.value.str != ""
    ) {
      searchTerms.push(realTerm);
    }
  }

  return searchTerms;
}

/**
 * @returns {nsIMsgFolder[]} the list of folders the search should cover.
 */
function getSearchFolders() {
  const searchFolders = [];

  if (!gCurrentFolder.isServer && !gCurrentFolder.noSelect) {
    searchFolders.push(gCurrentFolder);
  }

  var searchSubfolders = document.getElementById(
    "checkSearchSubFolders"
  ).checked;
  if (
    gCurrentFolder &&
    (searchSubfolders || gCurrentFolder.isServer || gCurrentFolder.noSelect)
  ) {
    AddSubFolders(gCurrentFolder, searchFolders);
  }

  return searchFolders;
}

function AddSubFolders(folder, outFolders) {
  for (const nextFolder of folder.subFolders) {
    if (!(nextFolder.flags & Ci.nsMsgFolderFlags.Virtual)) {
      if (!nextFolder.noSelect) {
        outFolders.push(nextFolder);
      }

      AddSubFolders(nextFolder, outFolders);
    }
  }
}

function AddSubFoldersToURI(folder) {
  var returnString = "";

  for (const nextFolder of folder.subFolders) {
    if (!(nextFolder.flags & Ci.nsMsgFolderFlags.Virtual)) {
      if (!nextFolder.noSelect && !nextFolder.isServer) {
        if (returnString.length > 0) {
          returnString += "|";
        }
        returnString += nextFolder.URI;
      }
      var subFoldersString = AddSubFoldersToURI(nextFolder);
      if (subFoldersString.length > 0) {
        if (returnString.length > 0) {
          returnString += "|";
        }
        returnString += subFoldersString;
      }
    }
  }
  return returnString;
}

/**
 * Determine the proper search scope to use for a folder, so that the user is
 *  presented with a correct list of search capabilities. The user may manually
 *  request on online search for certain server types. To determine if the
 *  folder body may be searched, we ignore whether autosync is enabled,
 *  figuring that after the user manually syncs, they would still expect that
 *  body searches would work.
 *
 * The available search capabilities also depend on whether the user is
 *  currently online or offline. Although that is also checked by the server,
 *  we do it ourselves because we have a more complex response to offline
 *  than the server's searchScope attribute provides.
 *
 * This method only works for real folders.
 */
function GetScopeForFolder(folder) {
  const searchOnline = document.getElementById("checkSearchOnline");
  if (!searchOnline.disabled && searchOnline.checked) {
    gSearchOnline = true;
    return folder.server.searchScope;
  }
  gSearchOnline = false;

  // We are going to search offline. The proper search scope may depend on
  // whether we have the body and/or junk available or not.
  let localType;
  try {
    localType = folder.server.localStoreType;
  } catch (e) {} // On error, we'll just assume the default mailbox type

  let hasBody = folder.getFlag(Ci.nsMsgFolderFlags.Offline);
  switch (localType) {
    case "news": {
      // News has four offline scopes, depending on whether junk and body
      // are available.
      const hasJunk =
        folder.getInheritedStringProperty(
          "dobayes.mailnews@mozilla.org#junk"
        ) == "true";
      if (hasJunk && hasBody) {
        return Ci.nsMsgSearchScope.localNewsJunkBody;
      }
      if (hasJunk) {
        // and no body
        return Ci.nsMsgSearchScope.localNewsJunk;
      }
      if (hasBody) {
        // and no junk
        return Ci.nsMsgSearchScope.localNewsBody;
      }
      // We don't have offline message bodies or junk processing.
      return Ci.nsMsgSearchScope.localNews;
    }
    case "imap": {
      // Junk is always enabled for imap, so the offline scope only depends on
      // whether the body is available.

      // If we are the root folder, use the server property for body rather
      // than the folder property.
      if (folder.isServer) {
        const imapServer = folder.server.QueryInterface(
          Ci.nsIImapIncomingServer
        );
        if (imapServer && imapServer.offlineDownload) {
          hasBody = true;
        }
      }

      if (!hasBody) {
        return Ci.nsMsgSearchScope.onlineManual;
      }
    }
    // fall through to default
    default:
      return Ci.nsMsgSearchScope.offlineMail;
  }
}

function goUpdateSearchItems(commandset) {
  for (var i = 0; i < commandset.children.length; i++) {
    var commandID = commandset.children[i].getAttribute("id");
    if (commandID) {
      goUpdateCommand(commandID);
    }
  }
}

// used to toggle functionality for Search/Stop button.
function onSearchButton(event) {
  if (
    event.target.label ==
    gSearchBundle.GetStringFromName("labelForSearchButton")
  ) {
    onSearch();
  } else {
    onSearchStop();
  }
}

function MsgDeleteSelectedMessages(aCommandType) {
  if (
    !MailUtils.confirmDelete(
      aCommandType == Ci.nsMsgViewCommandType.deleteNoTrash,
      gDBView
    )
  ) {
    return;
  }
  gFolderDisplay.hintAboutToDeleteMessages();
  gFolderDisplay.doCommand(aCommandType);
}

/**
 * Move selected messages to the destination folder
 *
 * @param {nsIMsgFolder} destFolder - Destination folder.
 */
function MoveMessageInSearch(destFolder) {
  gFolderDisplay.hintAboutToDeleteMessages();
  gFolderDisplay.doCommandWithFolder(
    Ci.nsMsgViewCommandType.moveMessages,
    destFolder
  );
}

function OpenInFolder() {
  MailUtils.displayMessageInFolderTab(gFolderDisplay.selectedMessage);
}

function saveAsVirtualFolder() {
  var searchFolderURIs = gCurrentFolder.URI;

  var searchSubfolders = document.getElementById(
    "checkSearchSubFolders"
  ).checked;
  if (
    gCurrentFolder &&
    (searchSubfolders || gCurrentFolder.isServer || gCurrentFolder.noSelect)
  ) {
    var subFolderURIs = AddSubFoldersToURI(gCurrentFolder);
    if (subFolderURIs.length > 0) {
      searchFolderURIs += "|" + subFolderURIs;
    }
  }

  var searchOnline = document.getElementById("checkSearchOnline");
  var doOnlineSearch = searchOnline.checked && !searchOnline.disabled;

  window.openDialog(
    "chrome://messenger/content/virtualFolderProperties.xhtml",
    "",
    "chrome,titlebar,modal,centerscreen,resizable=yes",
    {
      folder: window.arguments[0].folder,
      searchTerms: getSearchTerms(),
      searchFolderURIs,
      searchOnline: doOnlineSearch,
    }
  );
}

function MsgOpenSelectedMessages() {
  // Toggle message body (feed summary) and content-base url in message pane or
  // load in browser, per pref, otherwise open summary or web page in new window
  // or tab, per that pref.
  if (
    gFolderDisplay.treeSelection &&
    gFolderDisplay.treeSelection.count == 1 &&
    gFolderDisplay.selectedMessageIsFeed
  ) {
    const msgHdr = gFolderDisplay.selectedMessage;
    if (
      document.documentElement.getAttribute("windowtype") == "mail:3pane" &&
      FeedMessageHandler.onOpenPref ==
        FeedMessageHandler.kOpenToggleInMessagePane
    ) {
      const showSummary = FeedMessageHandler.shouldShowSummary(msgHdr, true);
      FeedMessageHandler.setContent(msgHdr, showSummary);
      return;
    }
    if (
      FeedMessageHandler.onOpenPref == FeedMessageHandler.kOpenLoadInBrowser
    ) {
      setTimeout(FeedMessageHandler.loadWebPage, 20, msgHdr, { browser: true });
      return;
    }
  }

  // This is somewhat evil. If we're in a 3pane window, we'd have a tabmail
  // element and would pass it in here, ensuring that if we open tabs, we use
  // this tabmail to open them. If we aren't, then we wouldn't, so
  // displayMessages would look for a 3pane window and open tabs there.
  MailUtils.displayMessages(
    gFolderDisplay.selectedMessages,
    gFolderDisplay.view,
    document.getElementById("tabmail")
  );
}

// This code is used when dragging a message from a "Search Messages" panel.
function ThreadPaneOnDragStart(aEvent) {
  if (aEvent.target.localName != "treechildren") {
    return;
  }

  const messageUris = gFolderDisplay.selectedMessageUris;
  if (!messageUris) {
    return;
  }

  gFolderDisplay.hintAboutToDeleteMessages();
  const messengerBundle = document.getElementById("bundle_messenger");
  let noSubjectString = messengerBundle.getString(
    "defaultSaveMessageAsFileName"
  );
  if (noSubjectString.endsWith(".eml")) {
    noSubjectString = noSubjectString.slice(0, -4);
  }
  const longSubjectTruncator = messengerBundle.getString(
    "longMsgSubjectTruncator"
  );
  // Clip the subject string to 124 chars to avoid problems on Windows,
  // see NS_MAX_FILEDESCRIPTOR in m-c/widget/windows/nsDataObj.cpp .
  const maxUncutNameLength = 124;
  const maxCutNameLength = maxUncutNameLength - longSubjectTruncator.length;
  const messages = new Map();
  for (const [index, msgUri] of messageUris.entries()) {
    const msgService = MailServices.messageServiceFromURI(msgUri);
    const msgHdr = msgService.messageURIToMsgHdr(msgUri);
    let subject = msgHdr.mime2DecodedSubject || "";
    if (msgHdr.flags & Ci.nsMsgMessageFlags.HasRe) {
      subject = "Re: " + subject;
    }

    let uniqueFileName;
    // If there is no subject, use a default name.
    // If subject needs to be truncated, add a truncation character to indicate it.
    if (!subject) {
      uniqueFileName = noSubjectString;
    } else {
      uniqueFileName =
        subject.length <= maxUncutNameLength
          ? subject
          : subject.substr(0, maxCutNameLength) + longSubjectTruncator;
    }
    let msgFileName = validateFileName(uniqueFileName);
    let msgFileNameLowerCase = msgFileName.toLocaleLowerCase();

    while (true) {
      if (!messages[msgFileNameLowerCase]) {
        messages[msgFileNameLowerCase] = 1;
        break;
      } else {
        const postfix = "-" + messages[msgFileNameLowerCase];
        messages[msgFileNameLowerCase]++;
        msgFileName = msgFileName + postfix;
        msgFileNameLowerCase = msgFileNameLowerCase + postfix;
      }
    }

    msgFileName = msgFileName + ".eml";

    // When dragging messages to the filesystem:
    // - Windows fetches application/x-moz-file-promise-url and writes it to
    //     a file.
    // - Linux uses the flavor data provider, if a single message is dragged.
    //     If multiple messages are dragged AND text/x-moz-url exists, it
    //     fetches application/x-moz-file-promise-url and writes it to a file.
    // - MacOS always uses the flavor data provider.

    // text/plain should be unnecessary, but getFlavorData can't get at
    // text/x-moz-message for some reason.
    aEvent.dataTransfer.mozSetDataAt("text/plain", msgUri, index);
    aEvent.dataTransfer.mozSetDataAt("text/x-moz-message", msgUri, index);
    const msgUrlSpec = msgService.getUrlForUri(msgUri).spec;
    aEvent.dataTransfer.mozSetDataAt("text/x-moz-url", msgUrlSpec, index);
    aEvent.dataTransfer.mozSetDataAt(
      "application/x-moz-file-promise-url",
      msgUrlSpec,
      index
    );
    aEvent.dataTransfer.mozSetDataAt(
      "application/x-moz-file-promise",
      new messageFlavorDataProvider(),
      index
    );
    aEvent.dataTransfer.mozSetDataAt(
      "application/x-moz-file-promise-dest-filename",
      msgFileName.replace(/(.{74}).*(.{10})$/u, "$1...$2"),
      index
    );
  }
  aEvent.dataTransfer.effectAllowed = "copyMove";
  aEvent.dataTransfer.addElement(aEvent.target);
}

function ThreadPaneOnClick(event) {
  // We only care about button 0 (left click) events.
  if (event.button != 0) {
    event.stopPropagation();
    return;
  }

  // We already handle marking as read/flagged/junk cyclers in nsMsgDBView.cpp
  // so all we need to worry about here is doubleclicks and column header. We
  // get here for clicks on the "treecol" (headers) and the "scrollbarbutton"
  // (scrollbar buttons) and don't want those events to cause a doubleclick.

  const t = event.target;
  if (t.closest("treecol")) {
    HandleColumnClick(t.closest("treecol").id);
    return;
  }

  if (t.localName != "treechildren") {
    return;
  }

  const tree = document.getElementById("threadTree");
  // Figure out what cell the click was in.
  const treeCellInfo = tree.getCellAt(event.clientX, event.clientY);
  if (treeCellInfo.row == -1) {
    return;
  }

  if (treeCellInfo.col.id == "selectCol") {
    HandleSelectColClick(event, treeCellInfo.row);
    return;
  }

  if (treeCellInfo.col.id == "deleteCol") {
    handleDeleteColClick(event);
    return;
  }

  // Cyclers and twisties respond to single clicks, not double clicks.
  if (
    event.detail == 2 &&
    !treeCellInfo.col.cycler &&
    treeCellInfo.childElt != "twisty"
  ) {
    MsgOpenSelectedMessages();
  }
}

function HandleColumnClick(columnID) {
  if (columnID == "selectCol") {
    const treeView = gFolderDisplay.tree.view;
    const selection = treeView.selection;
    if (!selection) {
      return;
    }
    if (selection.count > 0) {
      selection.clearSelection();
    } else {
      selection.selectAll();
    }
    return;
  }

  if (gFolderDisplay.BUILTIN_NOSORT_COLUMNS.has(columnID)) {
    return;
  }

  if (!gFolderDisplay.BUILTIN_SORT_COLUMNS.has(columnID)) {
    // This must be a custom column, check if it exists and is sortable.
    const customColumn = ThreadPaneColumns.getCustomColumns().find(
      c => c.id == columnID
    );
    if (!customColumn) {
      dump(
        `HandleColumnClick: No custom column handler registered for columnID: ${columnID}\n`
      );
      return;
    }
    if (!customColumn.sortKey) {
      return;
    }
  }

  if (gFolderDisplay.view.primarySortColumnId == columnID) {
    MsgReverseSortThreadPane();
  } else {
    MsgSortThreadPane(columnID);
  }
}

function HandleSelectColClick(event, row) {
  // User wants to multiselect using the old way.
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
    return;
  }
  const tree = gFolderDisplay.tree;
  const selection = tree.view.selection;
  if (event.detail == 1) {
    selection.toggleSelect(row);
  }
}

/**
 * Delete a message without selecting it or loading its content.
 *
 * @param {DOMEvent} event - The DOM Event.
 */
function handleDeleteColClick(event) {
  // Prevent deletion if any of the modifier keys was pressed.
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
    return;
  }

  // Simulate a right click on the message row to inherit all the validations
  // and alerts coming from the "cmd_delete" command.
  const tree = gFolderDisplay.tree;
  const realSelection = tree.view.selection;
  let transientSelection = {};
  const row = tree.getRowAt(event.clientX, event.clientY);

  // Check if the row is exactly the existing selection. In that case there
  // is no need to create a bogus selection.
  const haveTransientSelection =
    row >= 0 && !(realSelection.count == 1 && realSelection.isSelected(row));
  if (haveTransientSelection) {
    transientSelection = new TreeSelection(tree);
    // Tell it to log calls to adjustSelection.
    transientSelection.logAdjustSelectionForReplay();
    // Attach it to the view.
    tree.view.selection = transientSelection;
    // Don't generate any selection events! (We never set this to false,
    // because that would generate an event, and we never need one of those
    // from this selection object.
    transientSelection.selectEventsSuppressed = true;
    transientSelection.select(row);
    transientSelection.currentIndex = realSelection.currentIndex;
    tree.ensureRowIsVisible(row);
  }
  event.stopPropagation();

  // Trigger the message deletion.
  goDoCommand("cmd_delete");

  if (haveTransientSelection) {
    // Restore the selection.
    tree.view.selection = realSelection;
    // Replay any calls to adjustSelection, this handles suppression.
    transientSelection.replayAdjustSelectionLog(realSelection);
  }
}

function ThreadPaneKeyDown(event) {
  if (event.keyCode != KeyEvent.DOM_VK_RETURN) {
    return;
  }

  // Prevent any thread that happens to be last selected (currentIndex) in a
  // single or multi selection from toggling in tree.js.
  event.stopImmediatePropagation();

  MsgOpenSelectedMessages();
}

function MsgSortThreadPane(columnId) {
  gFolderDisplay.view._threadExpandAll = Boolean(
    gFolderDisplay.view._viewFlags & Ci.nsMsgViewFlagsType.kExpandAll
  );

  gFolderDisplay.view.sort(columnId, Ci.nsMsgViewSortOrder.ascending);
}

function MsgReverseSortThreadPane() {
  gFolderDisplay.view._threadExpandAll = Boolean(
    gFolderDisplay.view._viewFlags & Ci.nsMsgViewFlagsType.kExpandAll
  );

  if (gFolderDisplay.view.isSortedAscending) {
    gFolderDisplay.view.sortDescending();
  } else {
    gFolderDisplay.view.sortAscending();
  }
}

function ThreadPaneOnLoad() {
  const tree = document.getElementById("threadTree");
  tree.addEventListener("click", ThreadPaneOnClick, true);
  tree.addEventListener(
    "dblclick",
    event => {
      // The tree.js dblclick event handler is handling editing and toggling
      // open state of the cell. We don't use editing, and we want to handle
      // the toggling through the click handler (also for double click), so
      // capture the dblclick event before it bubbles up and causes the
      // tree.js dblclick handler to toggle open state.
      event.stopPropagation();
    },
    true
  );
}

function ThreadPaneSelectionChanged() {
  document.getElementById("threadTree").view.selectionChanged();
  UpdateSelectCol();
  UpdateMailSearch();
}

function UpdateSelectCol() {
  const selectCol = document.getElementById("selectCol");
  if (!selectCol) {
    return;
  }
  const treeView = gFolderDisplay.tree.view;
  const selection = treeView.selection;
  if (selection && selection.count > 0) {
    if (treeView.rowCount == selection.count) {
      selectCol.classList.remove("someselected");
      selectCol.classList.add("allselected");
    } else {
      selectCol.classList.remove("allselected");
      selectCol.classList.add("someselected");
    }
  } else {
    selectCol.classList.remove("allselected");
    selectCol.classList.remove("someselected");
  }
}

function UpdateSortIndicators(colID, sortOrder) {
  // Remove the sort indicator from all the columns
  const treeColumns = document.getElementById("threadCols").children;
  for (let i = 0; i < treeColumns.length; i++) {
    treeColumns[i].removeAttribute("sortDirection");
  }

  let sortedColumn;
  // set the sort indicator on the column we are sorted by
  if (colID) {
    sortedColumn = document.getElementById(colID);
  }

  if (sortedColumn) {
    sortedColumn.setAttribute(
      "sortDirection",
      sortOrder == Ci.nsMsgViewSortOrder.ascending ? "ascending" : "descending"
    );
  }
}
