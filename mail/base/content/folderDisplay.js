/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from SearchDialog.js */

/* globals ViewPickerBinding */ // From msgViewPickerOverlay.js

var { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);

ChromeUtils.defineESModuleGetters(this, {
  DBViewWrapper: "resource:///modules/DBViewWrapper.sys.mjs",
});

var gDBView;
var nsMsgKey_None = 0xffffffff;
var nsMsgViewIndex_None = 0xffffffff;

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
  // If the folder does not get handled by the DBViewWrapper, stash it here.
  //  ex: when isServer is true.
  this._nonViewFolder = null;

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
  this.threadPaneCommandUpdater = this;

  /**
   * Flag to expose whether all messages are loaded or not.  Set by
   *  onMessagesLoaded() when aAll is true.
   */
  this._allMessagesLoaded = false;

  /**
   * Save the top row displayed when we go inactive, restore when we go active,
   *  nuke it when we destroy the view.
   */
  this._savedFirstVisibleRow = null;
  /** the next view index to select once the delete completes */
  this._nextViewIndexAfterDelete = null;
  /**
   * Track when a message is being deleted so we can respond appropriately.
   */
  this._deleteInProgress = false;

  this._mostRecentSelectionCounts = [];
  this._mostRecentCurrentIndices = [];
}
FolderDisplayWidget.prototype = {
  /**
   * @returns the currently displayed folder.  This is just proxied from the
   *     view wrapper.
   * @groupName Displayed
   */
  get displayedFolder() {
    return this._nonViewFolder || this.view.displayedFolder;
  },

  /**
   * @returns true if the selection should be summarized for this folder. This
   *     is based on the mail.operate_on_msgs_in_collapsed_threads pref and
   *     if we are in a newsgroup folder. XXX When bug 478167 is fixed, this
   *     should be limited to being disabled for newsgroups that are not stored
   *     offline.
   */
  get summarizeSelectionInFolder() {
    return (
      Services.prefs.getBoolPref("mail.operate_on_msgs_in_collapsed_threads") &&
      !(this.displayedFolder instanceof Ci.nsIMsgNewsFolder)
    );
  },

  /**
   * @returns the nsITreeSelection object for our tree view.  This exists for
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
   * Number of headers to tell the message database to cache when we enter a
   *  folder.  This value is being propagated from legacy code which provided
   *  no explanation for its choice.
   *
   * We definitely want the header cache size to be larger than the number of
   *  rows that can be displayed on screen simultaneously.
   *
   * @private
   */
  PERF_HEADER_CACHE_SIZE: 100,

  /**
   * @name Columns
   * @protected
   */
  // @{

  /**
   * The map of all stock sortable columns and their sortType. The key must
   * match the column's xul <treecol> id.
   */
  COLUMNS_MAP: new Map([
    ["accountCol", "byAccount"],
    ["attachmentCol", "byAttachments"],
    ["senderCol", "byAuthor"],
    ["correspondentCol", "byCorrespondent"],
    ["dateCol", "byDate"],
    ["flaggedCol", "byFlagged"],
    ["idCol", "byId"],
    ["junkStatusCol", "byJunkStatus"],
    ["locationCol", "byLocation"],
    ["priorityCol", "byPriority"],
    ["receivedCol", "byReceived"],
    ["recipientCol", "byRecipient"],
    ["sizeCol", "bySize"],
    ["statusCol", "byStatus"],
    ["subjectCol", "bySubject"],
    ["tagsCol", "byTags"],
    ["threadCol", "byThread"],
    ["unreadButtonColHeader", "byUnread"],
  ]),

  /**
   * The map of stock non-sortable columns. The key must match the column's
   *  xul <treecol> id.
   */
  COLUMNS_MAP_NOSORT: new Set([
    "selectCol",
    "totalCol",
    "unreadCol",
    "deleteCol",
  ]),

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
   * @returns true if the mail view picker is visible.  This affects whether the
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
   * @returns true if the folder should be shown immediately, false if we should
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

    gDBView = this.view.dbView; // eslint-disable-line no-global-assign

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
    Services.obs.notifyObservers(this.displayedFolder, "MsgCreateDBView");
  },

  /**
   * If our view is being destroyed and it is coming back, we want to save the
   *  current selection so we can restore it when the view comes back.
   */
  onDestroyingView() {
    gDBView = null; // eslint-disable-line no-global-assign

    // if we have no view, no messages could be loaded.
    this._allMessagesLoaded = false;

    // but the actual tree view selection (based on view indices) is a goner no
    //  matter what, make everyone forget.
    this.view.dbView.selection = null;
    this._savedFirstVisibleRow = null;
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
    UpdateSortIndicators(this.view.primarySortType, this.view.primarySortOrder);
  },

  /**
   * Messages (that may have been displayed) have been removed; this may impact
   * our message selection. We might know it's coming; if we do then
   * this._nextViewIndexAfterDelete should know what view index to select next.
   * For the imap mark-as-deleted we won't know beforehand.
   */
  onMessagesRemoved() {
    this._deleteInProgress = false;

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

    // Check if we now no longer have a selection, but we had exactly one
    //  message selected previously.  If we did, then try and do some
    //  'persistence of having a thing selected'.
    if (
      treeSelection.count == 0 &&
      this._mostRecentSelectionCounts.length > 1 &&
      this._mostRecentSelectionCounts[1] == 1 &&
      this._mostRecentCurrentIndices[1] != -1
    ) {
      let targetIndex = this._mostRecentCurrentIndices[1];
      if (targetIndex >= rowCount) {
        targetIndex = rowCount - 1;
      }
      this.selectViewIndex(targetIndex);
      return;
    }

    // Otherwise, just tell the view that things have changed so it can update
    //  itself to the new state of things.
    // tell the view that things have changed so it can update itself suitably.
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

  /*   ==================================   */
  /* ===== nsIMsgDBViewCommandUpdater ===== */
  /*   ==================================   */

  /**
   * @name nsIMsgDBViewCommandUpdater Interface
   * @private
   */
  // @{

  /**
   * This gets called when the selection changes AND !suppressCommandUpdating
   *  AND (we're not removing a row OR we are now out of rows).
   * In response, we update the toolbar.
   */
  updateCommandStatus() {},

  /**
   * This gets called by nsMsgDBView::UpdateDisplayMessage following a call
   *  to nsIMessenger.OpenURL to kick off message display OR (UDM gets called)
   *  by nsMsgDBView::SelectionChanged in lieu of loading the message because
   *  mSupressMsgDisplay.
   * In other words, we get notified immediately after the process of displaying
   *  a message triggered by the nsMsgDBView happens.  We get some arguments
   *  that are display optimizations for historical reasons (as usual).
   *
   * Things this makes us want to do:
   * - Set the tab title, perhaps.  (If we are a message display.)
   * - Update message counts, because things might have changed, why not.
   * - Update some toolbar buttons, why not.
   *
   * @param aFolder The display/view folder, as opposed to the backing folder.
   * @param aSubject The subject with "Re: " if it's got one, which makes it
   *     notably different from just directly accessing the message header's
   *     subject.
   * @param aKeywords The keywords, which roughly translates to message tags.
   */
  displayMessageChanged() {},

  /**
   * This gets called as a hint that the currently selected message is junk and
   *  said junked message is going to be moved out of the current folder, or
   *  right before a header is removed from the db view.  The legacy behaviour
   *  is to retrieve the msgToSelectAfterDelete attribute off the db view,
   *  stashing it for benefit of the code that gets called when a message
   *  move/deletion is completed so that we can trigger its display.
   */
  updateNextMessageAfterDelete() {
    this.hintAboutToDeleteMessages();
  },

  /**
   * The most recent currentIndexes on the selection (from the last time
   *  summarizeSelection got called).  We use this in onMessagesRemoved if
   *  we get an unexpected notification.
   * We keep a maximum of 2 entries in this list.
   */
  _mostRecentCurrentIndices: undefined, // initialized in constructor
  /**
   * The most recent counts on the selection (from the last time
   *  summarizeSelection got called).  We use this in onMessagesRemoved if
   *  we get an unexpected notification.
   * We keep a maximum of 2 entries in this list.
   */
  _mostRecentSelectionCounts: undefined, // initialized in constructor

  /**
   * Always called by the db view when the selection changes in
   *  SelectionChanged.  This event will come after the notification to
   *  displayMessageChanged (if one happens), and before the notification to
   *  updateCommandStatus (if one happens).
   */
  summarizeSelection() {
    // save the current index off in case the selection gets deleted out from
    //  under us and we want to have persistence of actually-having-something
    //  selected.
    const treeSelection = this.treeSelection;
    if (treeSelection) {
      this._mostRecentCurrentIndices.unshift(treeSelection.currentIndex);
      this._mostRecentCurrentIndices.splice(2);
      this._mostRecentSelectionCounts.unshift(treeSelection.count);
      this._mostRecentSelectionCounts.splice(2);
    }
  },
  // @}
  /* ===== End nsIMsgDBViewCommandUpdater ===== */

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
    this._deleteInProgress = true;
    // save the value, even if it is nsMsgViewIndex_None.
    this._nextViewIndexAfterDelete = this.view.dbView.msgToSelectAfterDelete;
  },
  // @}
  /* ===== End hints from the command infrastructure ==== */

  _updateThreadDisplay() {
    if (this.view.dbView) {
      UpdateSortIndicators(
        this.view.dbView.sortType,
        this.view.dbView.sortOrder
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
   * @returns true if there is a db view and the command is enabled on the view.
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
   * @param aCommandName The command name to invoke.
   */
  doCommand(aCommandName) {
    return this.view.dbView && this.view.dbView.doCommand(aCommandName);
  },

  /**
   * Make code cleaner by allowing peoples to call doCommandWithFolder on us
   *  rather than having to do:
   *  folderDisplayWidget.view.dbView.doCommandWithFolder.
   *
   * @param aCommandName The command name to invoke.
   * @param aFolder The folder context for the command.
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
   *
   * @returns true if the navigation constraint matched anything, false if not.
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
   * @returns the message header for the first selected message, or null if
   *  there is no selected message.
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
   * @returns true if there is a selected message and it's an RSS feed message;
   *  a feed message does not have to be in an rss account folder if stored in
   *  Tb15 and later.
   */
  get selectedMessageIsFeed() {
    return FeedUtils.isFeedMessage(this.selectedMessage);
  },

  /**
   * @returns the number of selected messages.  If summarizeSelectionInFolder is
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
   * @returns a list of the view indices that are currently selected
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
   * @returns a list of the message headers for the currently selected messages.
   *     If there are no selected messages, the result is an empty list.
   */
  get selectedMessages() {
    if (!this.view.dbView) {
      return [];
    }
    return this.view.dbView.getSelectedMsgHdrs();
  },

  /**
   * @returns a list of the URIs for the currently selected messages or null
   *     (instead of a list) if there are no selected messages.  Do not
   *     pass around URIs unless you have a good reason.  Legacy code is an
   *     ok reason.
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
   * @param aViewIndex The view index to select.  This will be bounds-checked
   *     and if it is outside the bounds, we will clear the selection and
   *     bail.
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
      this.clearSelection();
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
      //    threadPane.js.  That code checks a global to see if it is dealing
      //    with a right-click, and ignores it if so.
      treeSelection.select(aViewIndex);
    }

    this.ensureRowIsVisible(aViewIndex);

    // The saved selection is invalidated, since we've got something newer
    this._savedSelection = null;
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
