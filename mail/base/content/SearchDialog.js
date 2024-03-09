/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from ../../../mailnews/extensions/newsblog/newsblogOverlay.js */
/* import-globals-from ../../../mailnews/search/content/searchTerm.js */
/* import-globals-from folderDisplay.js */
/* import-globals-from globalOverlay.js */
/* import-globals-from threadPane.js */

/* globals nsMsgStatusFeedback */ // From mailWindow.js

"use strict";

var { MailUtils } = ChromeUtils.importESModule(
  "resource:///modules/MailUtils.sys.mjs"
);
var { PluralForm } = ChromeUtils.importESModule(
  "resource:///modules/PluralForm.sys.mjs"
);
var { TagUtils } = ChromeUtils.importESModule(
  "resource:///modules/TagUtils.sys.mjs"
);

var messenger;
var msgWindow;

var gCurrentFolder;

var gFolderDisplay;

var gFolderPicker;
var gStatusFeedback;
var gSearchBundle;

// Datasource search listener -- made global as it has to be registered
// and unregistered in different functions.
var gDataSourceSearchListener;
var gViewSearchListener;

var gSearchStopButton;

// Should we try to search online?
var gSearchOnline = false;

window.addEventListener("load", searchOnLoad);
window.addEventListener("unload", event => {
  onSearchStop();
  searchOnUnload();
});

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
        GetThreadTree().focus();
        gFolderDisplay.doCommand(Ci.nsMsgViewCommandType.selectAll);
        return true;

      default:
        return false;
    }
  },

  onEvent(event) {},
};

function UpdateMailSearch(caller) {
  document.commandDispatcher.updateCommands("mail-search");
}

function SetAdvancedSearchStatusText(aNumHits) {}

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
      // spin the meteors
      gStatusFeedback._startMeteors();
      // tell the user that we're searching
      gStatusFeedback.showStatusString(
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
      // stop spining the meteors
      gStatusFeedback._stopMeteors();
      // set the result test
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

    gStatusFeedback.showStatusString(statusMsg);
  },
};

function searchOnLoad() {
  TagUtils.loadTagsIntoCSS(document);
  initializeSearchWidgets();
  initializeSearchWindowWidgets();
  // eslint-disable-next-line no-global-assign
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

  // eslint-disable-next-line no-global-assign
  gFolderDisplay = new SearchFolderDisplayWidget();
  gFolderDisplay.messenger = messenger;
  gFolderDisplay.msgWindow = msgWindow;
  gFolderDisplay.tree = document.getElementById("threadTree");

  // The view is initially unsorted; get the persisted sortDirection column
  // and set up the user's desired sort. This synthetic view is not backed by
  // a db, so secondary sorts and custom columns are not supported here.
  const sortCol = gFolderDisplay.tree.querySelector("[sortDirection]");
  let sortType, sortOrder;
  if (sortCol) {
    sortType = Ci.nsMsgViewSortType[gFolderDisplay.COLUMNS_MAP.get(sortCol.id)];
    sortOrder =
      sortCol.getAttribute("sortDirection") == "descending"
        ? Ci.nsMsgViewSortOrder.descending
        : Ci.nsMsgViewSortOrder.ascending;
  }

  gFolderDisplay.view.openSearchView();

  if (sortType) {
    gFolderDisplay.view.sort(sortType, sortOrder);
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
  hideMatchAllItem();

  // eslint-disable-next-line no-global-assign
  msgWindow = Cc["@mozilla.org/messenger/msgwindow;1"].createInstance(
    Ci.nsIMsgWindow
  );
  msgWindow.domWindow = window;

  gStatusFeedback = new nsMsgStatusFeedback();
  msgWindow.statusFeedback = gStatusFeedback;

  // functionality to enable/disable buttons using nsSearchResultsController
  // depending of whether items are selected in the search results thread pane.
  top.controllers.insertControllerAt(0, nsSearchResultsController);
}

function onSearchStop() {
  gFolderDisplay.view.search.session.interruptSearch();
}

function onResetSearch(event) {
  onReset(event);
  gFolderDisplay.view.search.clear();

  gStatusFeedback.showStatusString("");
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
 * @returns the list of folders the search should cover.
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
  const nsMsgSearchScope = Ci.nsMsgSearchScope;
  switch (localType) {
    case "news": {
      // News has four offline scopes, depending on whether junk and body
      // are available.
      const hasJunk =
        folder.getInheritedStringProperty(
          "dobayes.mailnews@mozilla.org#junk"
        ) == "true";
      if (hasJunk && hasBody) {
        return nsMsgSearchScope.localNewsJunkBody;
      }
      if (hasJunk) {
        // and no body
        return nsMsgSearchScope.localNewsJunk;
      }
      if (hasBody) {
        // and no junk
        return nsMsgSearchScope.localNewsBody;
      }
      // We don't have offline message bodies or junk processing.
      return nsMsgSearchScope.localNews;
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
        return nsMsgSearchScope.onlineManual;
      }
    }
    // fall through to default
    default:
      return nsMsgSearchScope.offlineMail;
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
  gFolderDisplay.hintAboutToDeleteMessages();
  gFolderDisplay.doCommand(aCommandType);
}

/**
 * Move selected messages to the destination folder
 *
 * @param destFolder {nsIMsgFolder} - destination folder
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
