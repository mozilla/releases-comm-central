/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* This is where functions related to the 3 pane window are kept */
const { MailUtils } = ChromeUtils.import("resource:///modules/MailUtils.js");
const {msgDBCacheManager} = ChromeUtils.import("resource:///modules/msgDBCacheManager.js");
const {PeriodicFilterManager} = ChromeUtils.import("resource:///modules/PeriodicFilterManager.jsm");

// from MailNewsTypes.h
const nsMsgKey_None = 0xFFFFFFFF;
const nsMsgViewIndex_None = 0xFFFFFFFF;
const kMailCheckOncePrefName = "mail.startup.enabledMailCheckOnce";

var gSearchInput;

var gUnreadCount = null;
var gTotalCount = null;

var gCurrentLoadingFolderURI;
var gCurrentFolderToReroot;
var gCurrentLoadingFolderSortType = 0;
var gCurrentLoadingFolderSortOrder = 0;
var gCurrentLoadingFolderViewType = 0;
var gCurrentLoadingFolderViewFlags = 0;
var gRerootOnFolderLoad = false;
var gCurrentDisplayedMessage = null;
var gNextMessageAfterDelete = null;
var gNextMessageAfterLoad = null;
var gNextMessageViewIndexAfterDelete = -2;
var gCurrentlyDisplayedMessage=nsMsgViewIndex_None;
var gStartMsgKey = nsMsgKey_None;
var gSearchEmailAddress = null;
var gRightMouseButtonDown = false;
// Global var to keep track of which row in the thread pane has been selected
// This is used to make sure that the row with the currentIndex has the selection
// after a Delete or Move of a message that has a row index less than currentIndex.
var gThreadPaneCurrentSelectedIndex = -1;
// Account Wizard can exceptionally override this feature.
var gLoadStartFolder = true;

// Global var to keep track of if the 'Delete Message' or 'Move To' thread pane
// context menu item was triggered.  This helps prevent the tree view from
// not updating on one of those menu item commands.
var gThreadPaneDeleteOrMoveOccurred = false;

//If we've loaded a message, set to true.  Helps us keep the start page around.
var gHaveLoadedMessage;

var gDisplayStartupPage = false;

function SelectAndScrollToKey(aMsgKey)
{
  // select the desired message
  // if the key isn't found, we won't select anything
  if (!gDBView)
    return false;
  gDBView.selectMsgByKey(aMsgKey);

  // is there a selection?
  // if not, bail out.
  var indicies = GetSelectedIndices(gDBView);
  if (!indicies || !indicies.length)
    return false;

  // now scroll to it
  EnsureRowInThreadTreeIsVisible(indicies[0]);
  return true;
}

// A helper routine called after a folder is loaded to make sure
// we select and scroll to the correct message (could be the first new message,
// could be the last displayed message, etc.)
function ScrollToMessageAfterFolderLoad(folder)
{
  var scrolled = Services.prefs.getBoolPref("mailnews.scroll_to_new_message") &&
      ScrollToMessage(nsMsgNavigationType.firstNew, true, false /* selectMessage */);
  if (!scrolled && folder)
  {
    // If we failed to scroll to a new message,
    // reselect the last selected message
    var lastMessageLoaded = folder.lastMessageLoaded;
    if (lastMessageLoaded != nsMsgKey_None)
      scrolled = SelectAndScrollToKey(lastMessageLoaded);
  }

  if (!scrolled)
  {
    // if we still haven't scrolled,
    // scroll to the newest, which might be the top or the bottom
    // depending on our sort order and sort type
    if (gDBView && gDBView.sortOrder == nsMsgViewSortOrder.ascending)
    {
      switch (gDBView.sortType)
      {
        case nsMsgViewSortType.byDate:
        case nsMsgViewSortType.byReceived:
        case nsMsgViewSortType.byId:
        case nsMsgViewSortType.byThread:
         scrolled = ScrollToMessage(nsMsgNavigationType.lastMessage, true, false /* selectMessage */);
         break;
      }
    }

    // if still we haven't scrolled,
    // scroll to the top.
    if (!scrolled)
      EnsureRowInThreadTreeIsVisible(0);
  }
}

// the folderListener object
var folderListener =
{
  onFolderAdded: function(parentFolder, child) {},
  onMessageAdded: function(parentFolder, msg) {},
  onFolderRemoved: function(parentFolder, child) {},
  onMessageRemoved: function(parentFolder, msg) {},

  onFolderPropertyChanged:        function(item, property, oldValue, newValue) {},
  onFolderBoolPropertyChanged:    function(item, property, oldValue, newValue) {},
  onFolderUnicharPropertyChanged: function(item, property, oldValue, newValue) {},
  onFolderPropertyFlagChanged:    function(item, property, oldFlag,  newFlag)  {},

  onFolderIntPropertyChanged: function(item, property, oldValue, newValue)
  {
    // handle the currently visible folder
    if (item == gMsgFolderSelected)
    {
      if (property == "TotalMessages" || property == "TotalUnreadMessages")
      {
        UpdateStatusMessageCounts(gMsgFolderSelected);
      }
    }

    // check folders shown in tabs
    if (item instanceof Ci.nsIMsgFolder)
    {
      // find corresponding tabinfos
      // we may have the folder openened in more than one tab
      let tabmail = GetTabMail();
      for (let i = 0; i < tabmail.tabInfo.length; ++i)
      {
        // if we never switched away from the tab, we only have just one
        let tabFolder = tabmail.tabInfo[i].msgSelectedFolder || gMsgFolderSelected;
        if (tabFolder == item)
        {
          // update tab title incl. any icon styles
          tabmail.setTabTitle(tabmail.tabInfo[i]);
        }
      }
    }
  },

    onFolderEvent: function(folder, event) {
      if (event == "FolderLoaded") {
        if (folder) {
          var scrolled = false;
          var msgFolder = folder.QueryInterface(Ci.nsIMsgFolder);
          var uri = folder.URI;
          var rerootingFolder = (uri == gCurrentFolderToReroot);
          if (rerootingFolder) {
            viewDebug("uri = gCurrentFolderToReroot, setting gQSViewIsDirty\n");
            gQSViewIsDirty = true;
            gCurrentFolderToReroot = null;
            if (msgFolder) {
              msgFolder.endFolderLoading();
              // Suppress command updating when rerooting the folder.
              // When rerooting, we'll be clearing the selection
              // which will cause us to update commands.
              if (gDBView) {
                gDBView.suppressCommandUpdating = true;
                // If the db's view isn't set, something went wrong and we
                // should reroot the folder, which will re-open the view.
                if (!gDBView.db)
                  gRerootOnFolderLoad = true;
              }
              if (gRerootOnFolderLoad)
                RerootFolder(uri, msgFolder, gCurrentLoadingFolderViewType, gCurrentLoadingFolderViewFlags, gCurrentLoadingFolderSortType, gCurrentLoadingFolderSortOrder);

              if (gDBView)
                gDBView.suppressCommandUpdating = false;

              gCurrentLoadingFolderSortType = 0;
              gCurrentLoadingFolderSortOrder = 0;
              gCurrentLoadingFolderViewType = 0;
              gCurrentLoadingFolderViewFlags = 0;

              // Used for rename folder msg loading after folder is loaded.
              scrolled = LoadCurrentlyDisplayedMessage();

              if (gStartMsgKey != nsMsgKey_None) {
                scrolled = SelectAndScrollToKey(gStartMsgKey);
                gStartMsgKey = nsMsgKey_None;
              }

              if (gNextMessageAfterLoad) {
                var type = gNextMessageAfterLoad;
                gNextMessageAfterLoad = null;

                // Scroll to and select the proper message.
                scrolled = ScrollToMessage(type, true, true /* selectMessage */);
              }
            }
          }
          if (uri == gCurrentLoadingFolderURI) {
            viewDebug("uri == current loading folder uri\n");
            gCurrentLoadingFolderURI = "";
            // Scroll to message for virtual folders is done in
            // gSearchNotificationListener.OnSearchDone (see searchBar.js).
            if (!scrolled && gMsgFolderSelected &&
                !(gMsgFolderSelected.flags & Ci.nsMsgFolderFlags.Virtual))
              ScrollToMessageAfterFolderLoad(msgFolder);
            SetBusyCursor(window, false);
          }
          // Folder loading is over,
          // now issue quick search if there is an email address.
          if (gVirtualFolderTerms)
            viewDebug("in folder loaded gVirtualFolderTerms = " +
                      gVirtualFolderTerms + "\n");
          if (gMsgFolderSelected)
            viewDebug("in folder loaded gMsgFolderSelected = " +
                      gMsgFolderSelected.URI + "\n");
          if (rerootingFolder)
          {
            if (gSearchEmailAddress)
            {
              Search(gSearchEmailAddress);
              gSearchEmailAddress = null;
            }
            else if (gVirtualFolderTerms)
            {
              gDefaultSearchViewTerms = null;
              viewDebug("searching gVirtualFolderTerms\n");
              gDBView.viewFolder = gMsgFolderSelected;
              ViewChangeByFolder(gMsgFolderSelected);
            }
            else if (gMsgFolderSelected &&
                     gMsgFolderSelected.flags & Ci.nsMsgFolderFlags.Virtual)
            {
              viewDebug("selected folder is virtual\n");
              gDefaultSearchViewTerms = null;
            }
            else
            {
              // Get the view value from the folder.
              if (msgFolder)
              {
                // If our new view is the same as the old view and we already
                // have the list of search terms built up for the old view,
                // just re-use it.
                var result = GetMailViewForFolder(msgFolder);
                if (GetSearchInput() && gCurrentViewValue == result && gDefaultSearchViewTerms)
                {
                  viewDebug("searching gDefaultSearchViewTerms and rerootingFolder\n");
                  Search("");
                }
                else
                {
                  viewDebug("changing view by value\n");
                  ViewChangeByValue(result);
                }
              }
            }
          }
        }
      }
      else if (event == "ImapHdrDownloaded") {
        if (folder) {
          var imapFolder = folder.QueryInterface(Ci.nsIMsgImapMailFolder);
          if (imapFolder) {
            var hdrParser = imapFolder.hdrParser;
            if (hdrParser) {
              var msgHdr = hdrParser.GetNewMsgHdr();
              if (msgHdr)
              {
                var hdrs = hdrParser.headers;
                if (hdrs && hdrs.includes("X-attachment-size:")) {
                  msgHdr.OrFlags(Ci.nsMsgMessageFlags
                                   .Attachment);
                }
                if (hdrs && hdrs.includes("X-image-size:")) {
                  msgHdr.setStringProperty("imageSize", "1");
                }
              }
            }
          }
        }
      }
      else if (event == "DeleteOrMoveMsgCompleted") {
        HandleDeleteOrMoveMsgCompleted(folder);
      }
      else if (event == "DeleteOrMoveMsgFailed") {
        HandleDeleteOrMoveMsgFailed(folder);
      }
      else if (event == "AboutToCompact") {
        if (gDBView)
          gCurrentlyDisplayedMessage = gDBView.currentlyDisplayedMessage;
      }
      else if (event == "CompactCompleted") {
        HandleCompactCompleted(folder);
      }
      else if (event == "RenameCompleted") {
        // Clear this so we don't try to clear its new messages.
        gMsgFolderSelected = null;
        gFolderTreeView.selectFolder(folder);
      }
      else if (event == "JunkStatusChanged") {
        HandleJunkStatusChanged(folder);
      }
    }
}

function HandleDeleteOrMoveMsgFailed(folder)
{
  gDBView.onDeleteCompleted(false);
  if(IsCurrentLoadedFolder(folder)) {
    if(gNextMessageAfterDelete) {
      gNextMessageAfterDelete = null;
      gNextMessageViewIndexAfterDelete = -2;
    }
  }

  // fix me???
  // ThreadPaneSelectionChange(true);
}

// WARNING
// this is a fragile and complicated function.
// be careful when hacking on it.
// Don't forget about things like different imap
// delete models, multiple views (from multiple thread panes,
// search windows, stand alone message windows)
function HandleDeleteOrMoveMsgCompleted(folder)
{
  // you might not have a db view.  this can happen if
  // biff fires when the 3 pane is set to account central.
  if (!gDBView)
    return;

  gDBView.onDeleteCompleted(true);

  if (!IsCurrentLoadedFolder(folder)) {
    // default value after delete/move/copy is over
    gNextMessageViewIndexAfterDelete = -2;
    return;
  }

  var treeView = gDBView.QueryInterface(Ci.nsITreeView);
  var treeSelection = treeView.selection;

  if (gNextMessageViewIndexAfterDelete == -2) {
    // a move or delete can cause our selection can change underneath us.
    // this can happen when the user
    // deletes message from the stand alone msg window
    // or the search view, or another 3 pane
    if (treeSelection.count == 0) {
      // this can happen if you double clicked a message
      // in the thread pane, and deleted it from the stand alone msg window
      // see bug #172392
      treeSelection.clearSelection();
      setTitleFromFolder(folder, null);
      ClearMessagePane();
      UpdateMailToolbar("delete from another view, 0 rows now selected");
    }
    else if (treeSelection.count == 1) {
      // this can happen if you had two messages selected
      // in the thread pane, and you deleted one of them from another view
      // (like the view in the stand alone msg window)
      // since one item is selected, we should load it.
      var startIndex = {};
      var endIndex = {};
      treeSelection.getRangeAt(0, startIndex, endIndex);

      // select the selected item, so we'll load it
      treeSelection.select(startIndex.value);
      treeView.selectionChanged();

      EnsureRowInThreadTreeIsVisible(startIndex.value);

      UpdateMailToolbar("delete from another view, 1 row now selected");
    }
    else {
      // this can happen if you have more than 2 messages selected
      // in the thread pane, and you deleted one of them from another view
      // (like the view in the stand alone msg window)
      // since multiple messages are still selected, do nothing.
    }
  }
  else {
    if (gNextMessageViewIndexAfterDelete != nsMsgViewIndex_None)
    {
      var viewSize = treeView.rowCount;
      if (gNextMessageViewIndexAfterDelete >= viewSize)
      {
        if (viewSize > 0)
          gNextMessageViewIndexAfterDelete = viewSize - 1;
        else
        {
          gNextMessageViewIndexAfterDelete = nsMsgViewIndex_None;

          // there is nothing to select since viewSize is 0
          treeSelection.clearSelection();
          setTitleFromFolder(folder, null);
          ClearMessagePane();
          UpdateMailToolbar("delete from current view, 0 rows left");
        }
      }
    }

    // if we are about to set the selection with a new element then DON'T clear
    // the selection then add the next message to select. This just generates
    // an extra round of command updating notifications that we are trying to
    // optimize away.
    if (gNextMessageViewIndexAfterDelete != nsMsgViewIndex_None)
    {
      // When deleting a message we don't update the commands
      // when the selection goes to 0
      // (we have a hack in nsMsgDBView which prevents that update)
      // so there is no need to
      // update commands when we select the next message after the delete;
      // the commands already
      // have the right update state...
      gDBView.suppressCommandUpdating = true;

      // This check makes sure that the tree does not perform a
      // selection on a non selected row (row < 0), else assertions will
      // be thrown.
      if (gNextMessageViewIndexAfterDelete >= 0)
        treeSelection.select(gNextMessageViewIndexAfterDelete);

      // If gNextMessageViewIndexAfterDelete has the same value
      // as the last index we had selected, the tree won't generate a
      // selectionChanged notification for the tree view. So force a manual
      // selection changed call.
      // (don't worry it's cheap if we end up calling it twice).
      if (treeView)
        treeView.selectionChanged();

      EnsureRowInThreadTreeIsVisible(gNextMessageViewIndexAfterDelete);
      gDBView.suppressCommandUpdating = false;

      // hook for extra toolbar items
      // XXX TODO
      // I think there is a bug in the suppression code above.
      // What if I have two rows selected, and I hit delete,
      // and so we load the next row.
      // What if I have commands that only enable where
      // exactly one row is selected?
      UpdateMailToolbar("delete from current view, at least one row selected");
    }
  }

  // default value after delete/move/copy is over
  gNextMessageViewIndexAfterDelete = -2;
}

function HandleCompactCompleted(folder)
{
  if (folder && folder.server.type != "imap")
  {
    let msgFolder = msgWindow.openFolder;
    if (msgFolder && folder.URI == msgFolder.URI)
    {
      // pretend the selection changed, to reselect the current folder+view.
      gMsgFolderSelected = null;
      msgWindow.openFolder = null;
      FolderPaneSelectionChange();
      LoadCurrentlyDisplayedMessage();
    }
  }
}

function LoadCurrentlyDisplayedMessage()
{
  var scrolled = (gCurrentlyDisplayedMessage != nsMsgViewIndex_None);
  if (scrolled)
  {
    var treeView = gDBView.QueryInterface(Ci.nsITreeView);
    var treeSelection = treeView.selection;
    treeSelection.select(gCurrentlyDisplayedMessage);
    if (treeView)
      treeView.selectionChanged();
    EnsureRowInThreadTreeIsVisible(gCurrentlyDisplayedMessage);
    SetFocusThreadPane();
    gCurrentlyDisplayedMessage = nsMsgViewIndex_None; //reset
  }
  return scrolled;
}

function IsCurrentLoadedFolder(aFolder)
{
  let msgFolderUri = aFolder.QueryInterface(Ci.nsIMsgFolder)
                            .URI;
  let currentLoadedFolder = GetThreadPaneFolder();

  // If the currently loaded folder is virtual,
  // check if aFolder is one of its searched folders.
  if (currentLoadedFolder.flags & Ci.nsMsgFolderFlags.Virtual)
  {
    return currentLoadedFolder.msgDatabase.dBFolderInfo
                              .getCharProperty("searchFolderUri").split("|")
                              .includes(msgFolderUri);
  }

  // Is aFolder the currently loaded folder?
  return currentLoadedFolder.URI == msgFolderUri;
}

function ServerContainsFolder(server, folder)
{
  if (!folder || !server)
    return false;

  return server.equals(folder.server);
}

function SelectServer(server)
{
  gFolderTreeView.selectFolder(server.rootFolder);
}

// we have this incoming server listener in case we need to
// alter the folder pane selection when a server is removed
// or changed (currently, when the real username or real hostname change)
var gThreePaneIncomingServerListener = {
    onServerLoaded: function(server) {},
    onServerUnloaded: function(server) {
      var selectedFolders = GetSelectedMsgFolders();
      for (var i = 0; i < selectedFolders.length; i++) {
        if (ServerContainsFolder(server, selectedFolders[i])) {
          if (accountManager.defaultAccount)
            SelectServer(accountManager.defaultAccount.incomingServer);
          // we've made a new selection, we're done
          return;
        }
      }

      // if nothing is selected at this point, better go select the default
      // this could happen if nothing was selected when the server was removed
      selectedFolders = GetSelectedMsgFolders();
      if (selectedFolders.length == 0) {
        if (accountManager.defaultAccount)
          SelectServer(accountManager.defaultAccount.incomingServer);
      }
    },
    onServerChanged: function(server) {
      // if the current selected folder is on the server that changed
      // and that server is an imap or news server,
      // we need to update the selection.
      // on those server types, we'll be reconnecting to the server
      // and our currently selected folder will need to be reloaded
      // or worse, be invalid.
      if (server.type != "imap" && server.type !="nntp")
        return;

      var selectedFolders = GetSelectedMsgFolders();
      for (var i = 0; i < selectedFolders.length; i++) {
        // if the selected item is a server, we don't have to update
        // the selection
        if (!(selectedFolders[i].isServer) && ServerContainsFolder(server, selectedFolders[i])) {
          SelectServer(server);
          // we've made a new selection, we're done
          return;
        }
      }
    }
}

function UpdateMailPaneConfig() {
  const dynamicIds = ["messagesBox", "mailContent", "messengerBox"];
  var desiredId = dynamicIds[Services.prefs.getIntPref("mail.pane_config.dynamic")];
  var messagePane = GetMessagePane();
  if (messagePane.parentNode.id != desiredId) {
    ClearAttachmentList();
    var messagePaneSplitter = GetThreadAndMessagePaneSplitter();
    var desiredParent = document.getElementById(desiredId);
    // See Bug 381992. The ctor for the browser element will fire again when we
    // re-insert the messagePaneBox back into the document.
    // But the dtor doesn't fire when the element is removed from the document.
    // Manually call destroy here to avoid a nasty leak.
    getMessageBrowser().destroy();
    desiredParent.appendChild(messagePaneSplitter);
    desiredParent.appendChild(messagePane);
    messagePaneSplitter.orient = desiredParent.orient;
    // Reroot message display
    InvalidateTabDBs();
    let tabmail = GetTabMail();
    tabmail.currentTabInfo = null;
    tabmail.updateCurrentTab();
  }
}

var MailPrefObserver = {
  observe: function observe(subject, topic, prefName) {
    if (topic == "nsPref:changed") {
      if (prefName == "mail.pane_config.dynamic") {
        UpdateMailPaneConfig();
      } else if (prefName == "mail.showCondensedAddresses") {
        let currentDisplayNameVersion =
              Services.prefs.getIntPref("mail.displayname.version");
        Services.prefs.setIntPref("mail.displayname.version",
                                  ++currentDisplayNameVersion);

        // Refresh the thread pane.
        GetThreadTree().treeBoxObject.invalid();
      }
    }
  }
};

/* Functions related to startup */
function OnLoadMessenger()
{
  AddMailOfflineObserver();
  CreateMailWindowGlobals();
  Services.prefs.addObserver("mail.pane_config.dynamic", MailPrefObserver);
  Services.prefs.addObserver("mail.showCondensedAddresses", MailPrefObserver);
  UpdateMailPaneConfig();
  Create3PaneGlobals();
  verifyAccounts(null, false);
  msgDBCacheManager.init();

  // set the messenger default window size relative to the screen size
  // initial default dimensions are 2/3 and 1/2 of the screen dimensions
  if (!document.documentElement.hasAttribute("width")) {
    let screenHeight  = window.screen.availHeight;
    let screenWidth   = window.screen.availWidth;
    let defaultHeight = Math.floor(screenHeight * 2 / 3);
    let defaultWidth  = Math.floor(screenWidth / 2);

    // minimum dimensions are 1024x768 less padding unless restrained by screen
    const minHeight = 768;
    const minWidth = 1024;

    if (defaultHeight < minHeight)
       defaultHeight = Math.min(minHeight, screenHeight);
    if (defaultWidth < minWidth)
       defaultWidth = Math.min(minWidth, screenWidth);

    // keep some distance to the borders, accounting for window decoration
    document.documentElement.setAttribute("height", defaultHeight - 48);
    document.documentElement.setAttribute("width",  defaultWidth  - 24);
  }

  // initialize tabmail system - see tabmail.js and tabmail.xml for details
  let tabmail = GetTabMail();
  tabmail.registerTabType(gMailNewsTabsType);
  tabmail.openFirstTab();
  Services.obs.addObserver(MailWindowIsClosing,
                           "quit-application-requested");

  InitMsgWindow();
  messenger.setWindow(window, msgWindow);

  InitPanes();

  MigrateJunkMailSettings();

  accountManager.setSpecialFolders();
  accountManager.loadVirtualFolders();
  accountManager.addIncomingServerListener(gThreePaneIncomingServerListener);

  AddToSession();

  var startFolderUri = null;
  //need to add to session before trying to load start folder otherwise listeners aren't
  //set up correctly.
  // argument[0] --> folder uri
  // argument[1] --> optional message key
  // argument[2] --> optional email address; // Will come from aim; needs to show msgs from buddy's email address.
  if ("arguments" in window)
  {
    var args = window.arguments;
    // filter our any feed urls that came in as arguments to the new window...
    if (args.length && /^feed:/i.test(args[0]))
    {
      var feedHandler =
        Cc["@mozilla.org/newsblog-feed-downloader;1"]
          .getService(Ci.nsINewsBlogFeedDownloader);
      if (feedHandler)
        feedHandler.subscribeToFeed(args[0], null, msgWindow);
    }
    else
    {
      startFolderUri = (args.length > 0) ? args[0] : null;
    }
    gStartMsgKey = (args.length > 1) ? args[1] : nsMsgKey_None;
    gSearchEmailAddress = (args.length > 2) ? args[2] : null;
  }

  window.setTimeout(loadStartFolder, 0, startFolderUri);

  Services.obs.notifyObservers(window, "mail-startup-done");

  // FIX ME - later we will be able to use onload from the overlay
  OnLoadMsgHeaderPane();

  gHaveLoadedMessage = false;

  //Set focus to the Thread Pane the first time the window is opened.
  SetFocusThreadPane();

  // Before and after callbacks for the customizeToolbar code
  var mailToolbox = getMailToolbox();
  mailToolbox.customizeInit = MailToolboxCustomizeInit;
  mailToolbox.customizeDone = MailToolboxCustomizeDone;
  mailToolbox.customizeChange = MailToolboxCustomizeChange;

  // initialize the sync UI
  // gSyncUI.init();

  window.addEventListener("AppCommand", HandleAppCommandEvent, true);

  // Load the periodic filter timer.
  PeriodicFilterManager.setupFiltering();
}

function HandleAppCommandEvent(evt)
{
  evt.stopPropagation();
  switch (evt.command)
  {
    case "Back":
      goDoCommand('cmd_goBack');
      break;
    case "Forward":
      goDoCommand('cmd_goForward');
      break;
    case "Stop":
      goDoCommand('cmd_stop');
      break;
    case "Search":
      goDoCommand('cmd_search');
      break;
    case "Bookmarks":
      toAddressBook();
      break;
    case "Reload":
      goDoCommand('cmd_reload');
      break;
    case "Home":
      goDoCommand('cmd_goStartPage');
      break;
    default:
      break;
  }
}

function OnUnloadMessenger()
{
  Services.prefs.removeObserver("mail.pane_config.dynamic", MailPrefObserver, false);
  Services.prefs.removeObserver("mail.showCondensedAddresses", MailPrefObserver, false);
  window.removeEventListener("AppCommand", HandleAppCommandEvent, true);
  Services.obs.removeObserver(MailWindowIsClosing,
                              "quit-application-requested");

  OnLeavingFolder(gMsgFolderSelected);  // mark all read in current folder
  accountManager.removeIncomingServerListener(gThreePaneIncomingServerListener);
  GetTabMail().closeTabs();

  // FIX ME - later we will be able to use onload from the overlay
  OnUnloadMsgHeaderPane();
  UnloadPanes();
  OnMailWindowUnload();
}

// we probably want to warn if more than one tab is closed
function MailWindowIsClosing(aCancelQuit, aTopic, aData)
{
  if (aTopic == "quit-application-requested" &&
      aCancelQuit instanceof Ci.nsISupportsPRBool &&
      aCancelQuit.data)
    return false;

  let tabmail = GetTabMail();
  let reallyClose = tabmail.warnAboutClosingTabs(tabmail.closingTabsEnum.ALL);

  if (!reallyClose && aTopic == "quit-application-requested")
    aCancelQuit.data = true;

  return reallyClose;
}

function Create3PaneGlobals()
{
  // Update <mailWindow.js> global variables.
  accountCentralBox = document.getElementById("accountCentralBox");
  gDisableViewsSearch = document.getElementById("mailDisableViewsSearch");

  GetMessagePane().collapsed = true;
}

function loadStartFolder(initialUri)
{
    var defaultServer = null;
    var startFolder;
    var isLoginAtStartUpEnabled = false;

    //First get default account
    if (initialUri) {
        startFolder = MailUtils.getFolderForURI(initialUri);
    } else {
        var defaultAccount = accountManager.defaultAccount;
        if (defaultAccount) {
            defaultServer = defaultAccount.incomingServer;
            var rootMsgFolder = defaultServer.rootMsgFolder;

            startFolder = rootMsgFolder;
            // Enable check new mail once by turning checkmail pref 'on' to bring
            // all users to one plane. This allows all users to go to Inbox. User can
            // always go to server settings panel and turn off "Check for new mail at startup"
            if (!Services.prefs.getBoolPref(kMailCheckOncePrefName))
            {
                Services.prefs.setBoolPref(kMailCheckOncePrefName, true);
                defaultServer.loginAtStartUp = true;
            }

            // Get the user pref to see if the login at startup is enabled for default account
            isLoginAtStartUpEnabled = defaultServer.loginAtStartUp;

            // Get Inbox only if login at startup is enabled.
            if (isLoginAtStartUpEnabled)
            {
                //now find Inbox
                const kInboxFlag = Ci.nsMsgFolderFlags.Inbox;
                var inboxFolder = rootMsgFolder.getFolderWithFlags(kInboxFlag);
                if (inboxFolder)
                  startFolder = inboxFolder;
            }
        } else {
            // If no default account then show account central page.
            ShowAccountCentral();
        }

   }

   if (startFolder) {
        try {
          gFolderTreeView.selectFolder(startFolder);
        } catch(ex) {
          // This means we tried to select a folder that isn't in the current
          // view. Just select the first one in the view then.
          if (gFolderTreeView._rowMap.length)
            gFolderTreeView.selectFolder(gFolderTreeView._rowMap[0]._folder);
        }

        // Perform biff on the server to check for new mail, if:
        // the login at startup is enabled, and
        // this feature is not exceptionally overridden, and
        // the account is not deferred-to or deferred.
        if (isLoginAtStartUpEnabled &&
            gLoadStartFolder &&
            !defaultServer.isDeferredTo &&
            defaultServer.rootFolder == defaultServer.rootMsgFolder)
          defaultServer.performBiff(msgWindow);
    }

    MsgGetMessagesForAllServers(defaultServer);

    if (CheckForUnsentMessages() && !Services.io.offline)
    {
        InitPrompts();
        InitServices();

        var sendUnsentWhenGoingOnlinePref = Services.prefs.getIntPref("offline.send.unsent_messages");
        if (sendUnsentWhenGoingOnlinePref == 0) // pref is "ask"
        {
          var buttonPressed = Services.prompt.confirmEx(window,
                                gOfflinePromptsBundle.getString('sendMessagesOfflineWindowTitle'),
                                gOfflinePromptsBundle.getString('sendMessagesLabel2'),
                                Services.prompt.BUTTON_TITLE_IS_STRING * (Services.prompt.BUTTON_POS_0 +
                                  Services.prompt.BUTTON_POS_1),
                                gOfflinePromptsBundle.getString('sendMessagesSendButtonLabel'),
                                gOfflinePromptsBundle.getString('sendMessagesNoSendButtonLabel'),
                                null, null, {value:0});
          if (buttonPressed == 0)
            SendUnsentMessages();
        }
        else if(sendUnsentWhenGoingOnlinePref == 1) // pref is "yes"
          SendUnsentMessages();
    }
}

function AddToSession()
{
  var nsIFolderListener = Ci.nsIFolderListener;
  var notifyFlags = nsIFolderListener.intPropertyChanged |
                    nsIFolderListener.event;
  MailServices.mailSession.AddFolderListener(folderListener, notifyFlags);
}

function InitPanes()
{
  gFolderTreeView.load(document.getElementById("folderTree"),
                       "folderTree.json");
  var folderTree = document.getElementById("folderTree");
  folderTree.addEventListener("click", FolderPaneOnClick, true);
  folderTree.addEventListener("mousedown", TreeOnMouseDown, true);

  OnLoadThreadPane();
  SetupCommandUpdateHandlers();
}

function UnloadPanes()
{
  var folderTree = document.getElementById("folderTree");
  folderTree.removeEventListener("click", FolderPaneOnClick, true);
  folderTree.removeEventListener("mousedown", TreeOnMouseDown, true);
  gFolderTreeView.unload("folderTree.json");
  UnloadCommandUpdateHandlers();
}

function AddMutationObserver(callback)
{
  new MutationObserver(callback).observe(callback(), {attributes: true, attributeFilter: ["hidden"]});
}

function OnLoadThreadPane()
{
  AddMutationObserver(UpdateAttachmentCol);
}

function UpdateAttachmentCol()
{
  var attachmentCol = document.getElementById("attachmentCol");
  var threadTree = GetThreadTree();
  threadTree.setAttribute("noattachcol", attachmentCol.getAttribute("hidden"));
  threadTree.treeBoxObject.clearStyleAndImageCaches();
  return attachmentCol;
}

function GetSearchInput()
{
  if (!gSearchInput)
    gSearchInput = document.getElementById("searchInput");
  return gSearchInput;
}

function GetMessagePaneFrame()
{
  return window.content;
}

function FindInSidebar(currentWindow, id)
{
  var item = currentWindow.document.getElementById(id);
  if (item)
    return item;

  for (var i = 0; i < currentWindow.frames.length; ++i)
  {
    var frameItem = FindInSidebar(currentWindow.frames[i], id);
    if (frameItem)
      return frameItem;
  }

  return null;
}

function GetUnreadCountElement()
{
  if (!gUnreadCount)
    gUnreadCount = document.getElementById('unreadMessageCount');
  return gUnreadCount;
}

function GetTotalCountElement()
{
  if (!gTotalCount)
    gTotalCount = document.getElementById('totalMessageCount');
  return gTotalCount;
}

function ClearThreadPaneSelection()
{
  try {
    if (gDBView) {
      var treeView = gDBView.QueryInterface(Ci.nsITreeView);
      var treeSelection = treeView.selection;
      if (treeSelection)
        treeSelection.clearSelection();
    }
  }
  catch (ex) {
    dump("ClearThreadPaneSelection: ex = " + ex + "\n");
  }
}

function ClearMessagePane()
{
  if (gHaveLoadedMessage)
  {
    gHaveLoadedMessage = false;
    gCurrentDisplayedMessage = null;
    if (GetMessagePaneFrame().location.href != "about:blank")
      GetMessagePaneFrame().location.href = "about:blank";

    // hide the message header view AND the message pane...
    HideMessageHeaderPane();
    gMessageNotificationBar.clearMsgNotifications();
    ClearPendingReadTimer();
  }
}

// Function to change the highlighted row to where the mouse was clicked
// without loading the contents of the selected row.
// It will also keep the outline/dotted line in the original row.
function ChangeSelectionWithoutContentLoad(event, tree)
{
  // usually, we're only interested in tree content clicks, not scrollbars etc.
  if (event.originalTarget.localName != "treechildren")
    return;

    var treeBoxObj = tree.treeBoxObject;
    var treeSelection = tree.view.selection;

    var row = treeBoxObj.getRowAt(event.clientX, event.clientY);
    // make sure that row.value is valid so that it doesn't mess up
    // the call to ensureRowIsVisible().
    if ((row >= 0) && !treeSelection.isSelected(row))
    {
        var saveCurrentIndex = treeSelection.currentIndex;
        treeSelection.selectEventsSuppressed = true;
        treeSelection.select(row);
        treeSelection.currentIndex = saveCurrentIndex;
        treeBoxObj.ensureRowIsVisible(row);
        treeSelection.selectEventsSuppressed = false;

        // Keep track of which row in the thread pane is currently selected.
        if (tree.id == "threadTree")
          gThreadPaneCurrentSelectedIndex = row;
    }
    event.stopPropagation();
}

function TreeOnMouseDown(event)
{
  // Detect right mouse click and change the highlight to the row
  // where the click happened without loading the message headers in
  // the Folder or Thread Pane.
  // Same for middle click, which will open the folder/message in a tab.
  gRightMouseButtonDown = event.button == kMouseButtonRight;
  if (!gRightMouseButtonDown)
    gRightMouseButtonDown = AllowOpenTabOnMiddleClick() &&
                            event.button == kMouseButtonMiddle;
  if (gRightMouseButtonDown)
    ChangeSelectionWithoutContentLoad(event, event.target.parentNode);
}

function FolderPaneContextMenuNewTab(event) {
  var bgLoad = Services.prefs.getBoolPref("mail.tabs.loadInBackground");
  if (event.shiftKey)
    bgLoad = !bgLoad;
  MsgOpenNewTabForFolder(bgLoad);
}

function FolderPaneOnClick(event)
{
  // usually, we're only interested in tree content clicks, not scrollbars etc.
  if (event.originalTarget.localName != "treechildren")
    return;

  var folderTree = document.getElementById("folderTree");

  // we may want to open the folder in a new tab on middle click
  if (event.button == kMouseButtonMiddle)
  {
    if (AllowOpenTabOnMiddleClick())
    {
      FolderPaneContextMenuNewTab(event);
      RestoreSelectionWithoutContentLoad(folderTree);
      return;
    }
  }

  // otherwise, we only care about left click events
  if (event.button != kMouseButtonLeft)
    return;

  var cell = folderTree.treeBoxObject.getCellAt(event.clientX, event.clientY);
  if (cell.row == -1)
  {
    if (event.originalTarget.localName == "treecol")
    {
      // clicking on the name column in the folder pane should not sort
      event.stopPropagation();
    }
  }
}

function OpenMessageInNewTab(event) {
  var bgLoad = Services.prefs.getBoolPref("mail.tabs.loadInBackground");
  if (event.shiftKey)
    bgLoad = !bgLoad;

  MsgOpenNewTabForMessage(bgLoad);
}

function GetSelectedMsgFolders()
{
  return gFolderTreeView.getSelectedFolders();
}

function GetSelectedIndices(dbView)
{
  try {
    return dbView.getIndicesForSelection();
  }
  catch (ex) {
    dump("ex = " + ex + "\n");
    return null;
  }
}

function GetLoadedMsgFolder()
{
    if (!gDBView) return null;
    return gDBView.msgFolder;
}

function GetLoadedMessage()
{
    try {
        return gDBView.URIForFirstSelectedMessage;
    }
    catch (ex) {
        return null;
    }
}

//Clear everything related to the current message. called after load start page.
function ClearMessageSelection()
{
  ClearThreadPaneSelection();
}

// Figures out how many messages are selected (hilighted - does not necessarily
// have the dotted outline) above a given index row value in the thread pane.
function NumberOfSelectedMessagesAboveCurrentIndex(index)
{
  var numberOfMessages = 0;
  var indicies = GetSelectedIndices(gDBView);

  if (indicies && indicies.length)
  {
    for (var i = 0; i < indicies.length; i++)
    {
      if (indicies[i] < index)
        ++numberOfMessages;
      else
        break;
    }
  }
  return numberOfMessages;
}

function SetNextMessageAfterDelete()
{
  var treeSelection = GetThreadTree().view.selection;

  if (treeSelection.isSelected(treeSelection.currentIndex))
    gNextMessageViewIndexAfterDelete = gDBView.msgToSelectAfterDelete;
  else if(gDBView.removeRowOnMoveOrDelete)
  {
    // Only set gThreadPaneDeleteOrMoveOccurred to true if the message was
    // truly moved to the trash or deleted, as opposed to an IMAP delete
    // (where it is only "marked as deleted".  This will prevent bug 142065.
    //
    // If it's an IMAP delete, then just set gNextMessageViewIndexAfterDelete
    // to treeSelection.currentIndex (where the outline is at) because nothing
    // was moved or deleted from the folder.
    gThreadPaneDeleteOrMoveOccurred = true;
    gNextMessageViewIndexAfterDelete = treeSelection.currentIndex - NumberOfSelectedMessagesAboveCurrentIndex(treeSelection.currentIndex);
  }
  else
    gNextMessageViewIndexAfterDelete = treeSelection.currentIndex;
}

function EnsureFolderIndex(treeView, msgFolder) {
  // Try to get the index of the folder in the tree.
  let index = treeView.getIndexOfFolder(msgFolder);
  if (!index) {
    // If we couldn't find the folder, open the parents.
    let folder = msgFolder;
    while (!index && folder) {
      folder = folder.parent;
      index = EnsureFolderIndex(treeView, folder);
    }
    if (index) {
      treeView.toggleOpenState(index);
      index = treeView.getIndexOfFolder(msgFolder);
    }
  }
  return index;
}

function SelectMsgFolder(msgFolder) {
  gFolderTreeView.selectFolder(msgFolder);
}

function SelectMessage(messageUri)
{
  var msgHdr = messenger.msgHdrFromURI(messageUri);
  if (msgHdr)
    gDBView.selectMsgByKey(msgHdr.messageKey);
}

function ReloadMessage()
{
  gDBView.reloadMessage();
}

function SetBusyCursor(window, enable)
{
    // setCursor() is only available for chrome windows.
    // However one of our frames is the start page which
    // is a non-chrome window, so check if this window has a
    // setCursor method
    if ("setCursor" in window) {
        if (enable)
            window.setCursor("progress");
        else
            window.setCursor("auto");
    }

    var numFrames = window.frames.length;
    for(var i = 0; i < numFrames; i++)
      SetBusyCursor(window.frames[i], enable);
}

function GetDBView()
{
  return gDBView;
}

// Some of the per account junk mail settings have been
// converted to global prefs. Let's try to migrate some
// of those settings from the default account.
function MigrateJunkMailSettings()
{
  var junkMailSettingsVersion = Services.prefs.getIntPref("mail.spam.version");
  if (!junkMailSettingsVersion)
  {
    // Get the default account, check to see if we have values for our
    // globally migrated prefs.
    var defaultAccount = accountManager.defaultAccount;
    if (defaultAccount)
    {
      // we only care about
      var prefix = "mail.server." + defaultAccount.incomingServer.key + ".";
      if (Services.prefs.prefHasUserValue(prefix + "manualMark"))
        Services.prefs.setBoolPref("mail.spam.manualMark", Services.prefs.getBoolPref(prefix + "manualMark"));
      if (Services.prefs.prefHasUserValue(prefix + "manualMarkMode"))
        Services.prefs.setIntPref("mail.spam.manualMarkMode", Services.prefs.getIntPref(prefix + "manualMarkMode"));
      if (Services.prefs.prefHasUserValue(prefix + "spamLoggingEnabled"))
        Services.prefs.setBoolPref("mail.spam.logging.enabled", Services.prefs.getBoolPref(prefix + "spamLoggingEnabled"));
      if (Services.prefs.prefHasUserValue(prefix + "markAsReadOnSpam"))
        Services.prefs.setBoolPref("mail.spam.markAsReadOnSpam", Services.prefs.getBoolPref(prefix + "markAsReadOnSpam"));
    }
    // bump the version so we don't bother doing this again.
    Services.prefs.setIntPref("mail.spam.version", 1);
  }
}
