/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* This is where functions related to the standalone message window are kept */

/* import-globals-from ../../../../toolkit/content/viewZoomOverlay.js */
/* import-globals-from ../../../mailnews/base/content/junkCommands.js */
/* import-globals-from ../../../mailnews/base/prefs/content/accountUtils.js */
/* import-globals-from ../../components/customizableui/content/panelUI.js */
/* import-globals-from commandglue.js */
/* import-globals-from mail-offline.js */
/* import-globals-from mailCommands.js */
/* import-globals-from mailCore.js */
/* import-globals-from mailWindow.js */
/* import-globals-from mailWindowOverlay.js */
/* import-globals-from messenger-customization.js */
/* import-globals-from msgViewNavigation.js */
/* import-globals-from toolbarIconColor.js */

var { AppConstants } = ChromeUtils.import(
  "resource://gre/modules/AppConstants.jsm"
);
var { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  UIDensity: "resource:///modules/UIDensity.jsm",
  UIFontSize: "resource:///modules/UIFontSize.jsm",
});

var messageBrowser;

function getBrowser() {
  return document
    .getElementById("messageBrowser")
    .contentDocument.getElementById("messagepane");
}

this.__defineGetter__("browser", getBrowser);

window.addEventListener("DOMContentLoaded", event => {
  if (event.target != document) {
    return;
  }

  messageBrowser = document.getElementById("messageBrowser");
});
window.addEventListener("load", OnLoadMessageWindow);
window.addEventListener("unload", OnUnloadMessageWindow);

// we won't show the window until the onload() handler is finished
// so we do this trick (suggested by hyatt / blaker)
function OnLoadMessageWindow() {
  // Set a sane starting width/height for all resolutions on new profiles.
  // Do this before the window loads.
  if (!document.documentElement.hasAttribute("width")) {
    // Prefer 860xfull height.
    let defaultHeight = screen.availHeight;
    let defaultWidth = screen.availWidth >= 860 ? 860 : screen.availWidth;

    // On small screens, default to maximized state.
    if (defaultHeight <= 600) {
      document.documentElement.setAttribute("sizemode", "maximized");
    }

    document.documentElement.setAttribute("width", defaultWidth);
    document.documentElement.setAttribute("height", defaultHeight);
    // Make sure we're safe at the left/top edge of screen
    document.documentElement.setAttribute("screenX", screen.availLeft);
    document.documentElement.setAttribute("screenY", screen.availTop);
  }

  updateTroubleshootMenuItem();
  ToolbarIconColor.init();
  PanelUI.init();
  gExtensionsNotifications.init();

  setTimeout(delayedOnLoadMessageWindow, 0); // when debugging, set this to 5000, so you can see what happens after the window comes up.

  messageBrowser.addEventListener("pagetitlechanged", () => {
    if (messageBrowser.contentTitle) {
      document.title =
        messageBrowser.contentTitle +
        document.documentElement.getAttribute("titlemenuseparator") +
        document.documentElement.getAttribute("titlemodifier");
    } else {
      document.title = document.documentElement.getAttribute("titlemodifier");
    }
  });
  messageBrowser.addEventListener(
    "DoZoomEnlargeBy10",
    () => {
      ZoomManager.scrollZoomEnlarge(messageBrowser);
    },
    true
  );
  messageBrowser.addEventListener(
    "DoZoomReduceBy10",
    () => {
      ZoomManager.scrollReduceEnlarge(messageBrowser);
    },
    true
  );

  UIDensity.registerWindow(window);
  UIFontSize.registerWindow(window);
}

function delayedOnLoadMessageWindow() {
  HideMenus();
  ShowMenus();
  MailOfflineMgr.init();
  CreateMailWindowGlobals();

  // Run menubar initialization first, to avoid TabsInTitlebar code picking
  // up mutations from it and causing a reflow.
  if (AppConstants.platform != "macosx") {
    AutoHideMenubar.init();
  }

  InitMsgWindow();

  msgWindow.msgHeaderSink = messageBrowser.contentWindow.messageHeaderSink;
  messenger.setWindow(window, msgWindow);

  // initialize the customizeDone method on the customizeable toolbar
  var toolbox = document.getElementById("mail-toolbox");
  toolbox.customizeDone = function(aEvent) {
    MailToolboxCustomizeDone(aEvent, "CustomizeMailToolbar");
  };

  SetupCommandUpdateHandlers();

  setTimeout(actuallyLoadMessage, 0);
}

function actuallyLoadMessage() {
  /*
   * Our actual use cases that drive the arguments we take are:
   * 1) Displaying a message from disk or that was an attachment on a message.
   *    Such messages have no (real) message header and must come in the form of
   *    a URI.  (The message display code creates a 'dummy' header.)
   * 2) Displaying a message that has a header available, either as a result of
   *    the user selecting a message in another window to spawn us or through
   *    some indirection like displaying a message by message-id.  (The
   *    newsgroup UI exposes this, as well as the spotlight/vista indexers.)
   *
   * We clone views when possible for:
   * - Consistency of navigation within the message display.  Users would find
   *   it odd if they showed a message from a cross-folder view but ended up
   *   navigating around the message's actual folder.
   * - Efficiency.  It's faster to clone a view than open a new one.
   *
   * Our argument idioms for the use cases are thus:
   * 1) [{msgHdr: A message header, viewWrapperToClone: (optional) a view
   *    wrapper to clone}]
   * 2) [A Message header, (optional) the origin DBViewWraper]
   * 3) [A Message URI] where the URI is an nsIURL corresponding to a message
   *     on disk or that is an attachment part on another message.
   *
   * Our original set of arguments, in case these get passed in and you're
   *  wondering why we explode, was:
   *   0: A message URI, string or nsIURI.
   *   1: A folder URI.  If arg 0 was an nsIURI, it may have had a folder attribute.
   *   2: The nsIMsgDBView used to open us.
   */
  if (window.arguments && window.arguments.length) {
    let contentWindow = messageBrowser.contentWindow;
    if (window.arguments[0] instanceof Ci.nsIURI) {
      contentWindow.displayExternalMessage(window.arguments[0].spec);
      return;
    }

    let msgHdr = null;
    // message header as an object?
    if ("wrappedJSObject" in window.arguments[0]) {
      let hdrObject = window.arguments[0].wrappedJSObject;
      msgHdr = hdrObject.msgHdr;
    } else if (window.arguments[0] instanceof Ci.nsIMsgDBHdr) {
      // message header as a separate param?
      msgHdr = window.arguments[0];
    }

    contentWindow.displayMessage(msgHdr.folder.getUriForMsg(msgHdr));
  }

  // set focus to the message pane
  window.content.focus();
}

/**
 * Load the given message into this window, and bring it to the front. This is
 * supposed to be called whenever a message is supposed to be displayed in this
 * window.
 *
 * @param aMsgHdr the message to display
 * @param aViewWrapperToClone [optional] a DB view wrapper to clone for the
 *                            message window
 */
function displayMessage(aMsgHdr, aViewWrapperToClone) {
  let contentWindow = messageBrowser.contentWindow;
  contentWindow.displayMessage(
    aMsgHdr.folder.getUriForMsg(aMsgHdr),
    aViewWrapperToClone
  );

  // bring this window to the front
  window.focus();
}

function ShowMenus() {
  var openMail3Pane_menuitem = document.getElementById("tasksMenuMail");
  if (openMail3Pane_menuitem) {
    openMail3Pane_menuitem.removeAttribute("hidden");
  }
}

/* eslint-disable complexity */
function HideMenus() {
  // TODO: Seems to be a lot of repetitive code.
  // Can we just fold this into an array of element IDs and loop over them?
  var message_menuitem = document.getElementById("menu_showMessage");
  if (message_menuitem) {
    message_menuitem.setAttribute("hidden", "true");
  }

  message_menuitem = document.getElementById("appmenu_showMessage");
  if (message_menuitem) {
    message_menuitem.setAttribute("hidden", "true");
  }

  var folderPane_menuitem = document.getElementById("menu_showFolderPane");
  if (folderPane_menuitem) {
    folderPane_menuitem.setAttribute("hidden", "true");
  }

  folderPane_menuitem = document.getElementById("appmenu_showFolderPane");
  if (folderPane_menuitem) {
    folderPane_menuitem.setAttribute("hidden", "true");
  }

  let folderPaneCols_menuitem = document.getElementById(
    "menu_showFolderPaneCols"
  );
  if (folderPaneCols_menuitem) {
    folderPaneCols_menuitem.setAttribute("hidden", "true");
  }

  folderPaneCols_menuitem = document.getElementById(
    "appmenu_showFolderPaneCols"
  );
  if (folderPaneCols_menuitem) {
    folderPaneCols_menuitem.setAttribute("hidden", "true");
  }

  var showSearch_showMessage_Separator = document.getElementById(
    "menu_showSearch_showMessage_Separator"
  );
  if (showSearch_showMessage_Separator) {
    showSearch_showMessage_Separator.setAttribute("hidden", "true");
  }

  var expandOrCollapseMenu = document.getElementById("menu_expandOrCollapse");
  if (expandOrCollapseMenu) {
    expandOrCollapseMenu.setAttribute("hidden", "true");
  }

  var menuDeleteFolder = document.getElementById("menu_deleteFolder");
  if (menuDeleteFolder) {
    menuDeleteFolder.hidden = true;
  }

  var renameFolderMenu = document.getElementById("menu_renameFolder");
  if (renameFolderMenu) {
    renameFolderMenu.setAttribute("hidden", "true");
  }

  var viewLayoutMenu = document.getElementById("menu_MessagePaneLayout");
  if (viewLayoutMenu) {
    viewLayoutMenu.setAttribute("hidden", "true");
  }

  viewLayoutMenu = document.getElementById("appmenu_MessagePaneLayout");
  if (viewLayoutMenu) {
    viewLayoutMenu.setAttribute("hidden", "true");
  }

  let paneViewSeparator = document.getElementById("appmenu_paneViewSeparator");
  if (paneViewSeparator) {
    paneViewSeparator.setAttribute("hidden", "true");
  }

  var viewFolderMenu = document.getElementById("menu_FolderViews");
  if (viewFolderMenu) {
    viewFolderMenu.setAttribute("hidden", "true");
  }

  viewFolderMenu = document.getElementById("appmenu_FolderViews");
  if (viewFolderMenu) {
    viewFolderMenu.setAttribute("hidden", "true");
  }

  var viewMessagesMenu = document.getElementById("viewMessagesMenu");
  if (viewMessagesMenu) {
    viewMessagesMenu.setAttribute("hidden", "true");
  }

  viewMessagesMenu = document.getElementById("appmenu_viewMessagesMenu");
  if (viewMessagesMenu) {
    viewMessagesMenu.setAttribute("hidden", "true");
  }

  var viewMessageViewMenu = document.getElementById("viewMessageViewMenu");
  if (viewMessageViewMenu) {
    viewMessageViewMenu.setAttribute("hidden", "true");
  }

  viewMessageViewMenu = document.getElementById("appmenu_viewMessageViewMenu");
  if (viewMessageViewMenu) {
    viewMessageViewMenu.setAttribute("hidden", "true");
  }

  var viewMessagesMenuSeparator = document.getElementById(
    "viewMessagesMenuSeparator"
  );
  if (viewMessagesMenuSeparator) {
    viewMessagesMenuSeparator.setAttribute("hidden", "true");
  }

  viewMessagesMenuSeparator = document.getElementById(
    "appmenu_viewMessagesMenuSeparator"
  );
  if (viewMessagesMenuSeparator) {
    viewMessagesMenuSeparator.setAttribute("hidden", "true");
  }

  var openMessageMenu = document.getElementById("openMessageWindowMenuitem");
  if (openMessageMenu) {
    openMessageMenu.setAttribute("hidden", "true");
  }

  openMessageMenu = document.getElementById(
    "appmenu_openMessageWindowMenuitem"
  );
  if (openMessageMenu) {
    openMessageMenu.setAttribute("hidden", "true");
  }

  var viewSortMenuSeparator = document.getElementById("viewSortMenuSeparator");
  if (viewSortMenuSeparator) {
    viewSortMenuSeparator.setAttribute("hidden", "true");
  }

  viewSortMenuSeparator = document.getElementById(
    "appmenu_viewAfterThreadsSeparator"
  );
  if (viewSortMenuSeparator) {
    viewSortMenuSeparator.setAttribute("hidden", "true");
  }

  var viewSortMenu = document.getElementById("viewSortMenu");
  if (viewSortMenu) {
    viewSortMenu.setAttribute("hidden", "true");
  }

  viewSortMenu = document.getElementById("appmenu_viewSortMenu");
  if (viewSortMenu) {
    viewSortMenu.setAttribute("hidden", "true");
  }

  var emptryTrashMenu = document.getElementById("menu_emptyTrash");
  if (emptryTrashMenu) {
    emptryTrashMenu.setAttribute("hidden", "true");
  }

  emptryTrashMenu = document.getElementById("appmenu_emptyTrash");
  if (emptryTrashMenu) {
    emptryTrashMenu.setAttribute("hidden", "true");
  }

  var menuPropertiesSeparator = document.getElementById(
    "editPropertiesSeparator"
  );
  if (menuPropertiesSeparator) {
    menuPropertiesSeparator.setAttribute("hidden", "true");
  }

  menuPropertiesSeparator = document.getElementById(
    "appmenu_editPropertiesSeparator"
  );
  if (menuPropertiesSeparator) {
    menuPropertiesSeparator.setAttribute("hidden", "true");
  }

  var menuProperties = document.getElementById("menu_properties");
  if (menuProperties) {
    menuProperties.setAttribute("hidden", "true");
  }

  menuProperties = document.getElementById("appmenu_properties");
  if (menuProperties) {
    menuProperties.setAttribute("hidden", "true");
  }

  var favoriteFolder = document.getElementById("menu_favoriteFolder");
  if (favoriteFolder) {
    favoriteFolder.setAttribute("disabled", "true");
    favoriteFolder.setAttribute("hidden", "true");
  }

  favoriteFolder = document.getElementById("appmenu_favoriteFolder");
  if (favoriteFolder) {
    favoriteFolder.setAttribute("disabled", "true");
    favoriteFolder.setAttribute("hidden", "true");
  }

  var compactFolderMenu = document.getElementById("menu_compactFolder");
  if (compactFolderMenu) {
    compactFolderMenu.setAttribute("hidden", "true");
  }

  let trashSeparator = document.getElementById("trashMenuSeparator");
  if (trashSeparator) {
    trashSeparator.setAttribute("hidden", "true");
  }

  let goStartPageSeparator = document.getElementById("goNextSeparator");
  if (goStartPageSeparator) {
    goStartPageSeparator.hidden = true;
  }

  let goRecentlyClosedTabsSeparator = document.getElementById(
    "goRecentlyClosedTabsSeparator"
  );
  if (goRecentlyClosedTabsSeparator) {
    goRecentlyClosedTabsSeparator.setAttribute("hidden", "true");
  }

  let goFolder = document.getElementById("goFolderMenu");
  if (goFolder) {
    goFolder.hidden = true;
  }

  goFolder = document.getElementById("goFolderSeparator");
  if (goFolder) {
    goFolder.hidden = true;
  }

  let goStartPage = document.getElementById("goStartPage");
  if (goStartPage) {
    goStartPage.hidden = true;
  }

  let quickFilterBar = document.getElementById("appmenu_quickFilterBar");
  if (quickFilterBar) {
    quickFilterBar.hidden = true;
  }

  var menuFileClose = document.getElementById("menu_close");
  var menuFileQuit = document.getElementById("menu_FileQuitItem");
  if (menuFileClose && menuFileQuit) {
    menuFileQuit.parentNode.replaceChild(menuFileClose, menuFileQuit);
  }
}
/* eslint-enable complexity */

function OnUnloadMessageWindow() {
  UnloadCommandUpdateHandlers();
  ToolbarIconColor.uninit();
  PanelUI.uninit();
  OnMailWindowUnload();
}

function ReloadMessage() {
  messageBrowser.contentWindow.ReloadMessage();
}

// MessageWindowController object (handles commands when one of the trees does not have focus)
var MessageWindowController = {
  supportsCommand(command) {
    switch (command) {
      // external messages cannot be deleted, mutated, or subjected to filtering
      case "button_delete":
      case "button_junk":
      case "cmd_tag1":
      case "cmd_tag2":
      case "cmd_tag3":
      case "cmd_tag4":
      case "cmd_tag5":
      case "cmd_tag6":
      case "cmd_tag7":
      case "cmd_tag8":
      case "cmd_tag9":
      case "cmd_applyFiltersToSelection":
      case "cmd_applyFilters":
      case "cmd_runJunkControls":
      case "cmd_deleteJunk":
        return false;
      case "cmd_undo":
      case "cmd_redo":
      case "cmd_saveAsFile":
      case "cmd_saveAsTemplate":
      case "cmd_getMsgsForAuthAccounts":
      case "button_file":
      case "cmd_goForward":
      case "cmd_goBack":
      case "button_goForward":
      case "button_goBack":
        return false;
      case "cmd_newMessage":
      case "button_followup":
      case "cmd_getNextNMessages":
      case "cmd_find":
      case "cmd_findAgain":
      case "cmd_findPrevious":
      case "cmd_search":
      case "cmd_reload":
      case "cmd_getNewMessages":
      case "button_getNewMessages":
      case "button_print":
      case "cmd_print":
      case "cmd_settingsOffline":
      case "cmd_createFilterFromPopup":
      case "cmd_fullZoomReduce":
      case "cmd_fullZoomEnlarge":
      case "cmd_fullZoomReset":
      case "cmd_fullZoomToggle":
      case "cmd_fontSizeReset":
      case "cmd_viewAllHeader":
      case "cmd_viewNormalHeader":
      case "cmd_stop":
      case "cmd_chat":
        return true;
      case "cmd_fontSizeReduce":
        return UIFontSize.size > UIFontSize.MIN_VALUE;
      case "cmd_fontSizeEnlarge":
        return UIFontSize.size < UIFontSize.MAX_VALUE;
      case "cmd_synchronizeOffline":
      case "cmd_downloadFlagged":
      case "cmd_downloadSelected":
        return MailOfflineMgr.isOnline();
      default:
        return false;
    }
  },

  isCommandEnabled(command) {
    let loadedFolder;
    switch (command) {
      case "cmd_createFilterFromPopup":
        loadedFolder = gFolderDisplay.displayedFolder;
        return loadedFolder && loadedFolder.server.canHaveFilters;
      case "button_delete":
        UpdateDeleteToolbarButton();
        return gFolderDisplay.getCommandStatus(
          Ci.nsMsgViewCommandType.deleteMsg
        );
      case "button_junk":
        UpdateJunkToolbarButton();
      // fall through
      case "cmd_newMessage":
      case "button_followup":
        return CanComposeMessages();
      case "cmd_print":
      case "button_print":
      case "cmd_saveAsFile":
      case "cmd_saveAsTemplate":
      case "cmd_reload":
      case "cmd_find":
      case "cmd_tag1":
      case "cmd_tag2":
      case "cmd_tag3":
      case "cmd_tag4":
      case "cmd_tag5":
      case "cmd_tag6":
      case "cmd_tag7":
      case "cmd_tag8":
      case "cmd_tag9":
      case "cmd_viewAllHeader":
      case "cmd_viewNormalHeader":
      case "cmd_stop":
      case "button_file":
        return false;
      case "cmd_getNewMessages":
      case "button_getNewMessages":
      case "cmd_getMsgsForAuthAccounts":
        return IsGetNewMessagesEnabled();
      case "cmd_getNextNMessages":
        return IsGetNextNMessagesEnabled();
      case "cmd_downloadFlagged":
      case "cmd_downloadSelected":
      case "cmd_synchronizeOffline":
        return MailOfflineMgr.isOnline();
      case "cmd_settingsOffline":
        return IsAccountOfflineEnabled();
      case "cmd_findAgain":
      case "cmd_findPrevious":
      case "cmd_applyFiltersToSelection":
      case "cmd_fullZoomReduce":
      case "cmd_fullZoomEnlarge":
      case "cmd_fullZoomReset":
      case "cmd_fullZoomToggle":
      case "cmd_fontSizeReduce":
        return UIFontSize.size > UIFontSize.MIN_VALUE;
      case "cmd_fontSizeEnlarge":
        return UIFontSize.size < UIFontSize.MAX_VALUE;
      case "cmd_fontSizeReset":
        return true;
      case "button_goForward":
      case "button_goBack":
      case "cmd_goForward":
      case "cmd_goBack":
        return false;
      case "cmd_search":
        return false;
      case "cmd_undo":
      case "cmd_redo":
        return SetupUndoRedoCommand(command);
      case "cmd_applyFilters":
      case "cmd_runJunkControls":
      case "cmd_deleteJunk":
        return false;
      case "cmd_chat":
        return true;
      default:
        return false;
    }
  },

  doCommand(command) {
    // If the user invoked a key short cut then it is possible that we got here
    // for a command which is really disabled. Kick out if the command should be disabled.
    if (!this.isCommandEnabled(command)) {
      return;
    }

    switch (command) {
      case "cmd_getNewMessages":
        MsgGetMessage();
        break;
      case "cmd_undo":
        messenger.undo(msgWindow);
        break;
      case "cmd_redo":
        messenger.redo(msgWindow);
        break;
      case "cmd_getMsgsForAuthAccounts":
        MsgGetMessagesForAllAuthenticatedAccounts();
        break;
      case "cmd_getNextNMessages":
        MsgGetNextNMessages();
        break;
      case "cmd_newMessage":
        MsgNewMessage(null);
        break;
      case "cmd_createFilterFromPopup":
        break; // This does nothing because the createfilter is invoked from the popupnode oncommand.
      case "button_delete":
        gFolderDisplay.doCommand(Ci.nsMsgViewCommandType.deleteMsg);
        UpdateDeleteToolbarButton();
        break;
      case "button_junk":
        MsgJunk();
        break;
      case "cmd_print":
        let messagePaneBrowser = document.getElementById("messagepane");
        PrintUtils.startPrintWindow(messagePaneBrowser.browsingContext, {});
        break;
      case "cmd_saveAsFile":
        MsgSaveAsFile();
        break;
      case "cmd_saveAsTemplate":
        MsgSaveAsTemplate();
        break;
      case "cmd_reload":
        ReloadMessage();
        break;
      case "cmd_find":
        document.getElementById("FindToolbar").onFindCommand();
        break;
      case "cmd_findAgain":
        document.getElementById("FindToolbar").onFindAgainCommand(false);
        break;
      case "cmd_findPrevious":
        document.getElementById("FindToolbar").onFindAgainCommand(true);
        break;
      case "cmd_search":
        MsgSearchMessages();
        break;
      case "cmd_tag1":
      case "cmd_tag2":
      case "cmd_tag3":
      case "cmd_tag4":
      case "cmd_tag5":
      case "cmd_tag6":
      case "cmd_tag7":
      case "cmd_tag8":
      case "cmd_tag9":
        var tagNumber = parseInt(command[7]);
        ToggleMessageTagKey(tagNumber);
        return;
      case "cmd_viewAllHeader":
        MsgViewAllHeaders();
        return;
      case "cmd_viewNormalHeader":
        MsgViewNormalHeaders();
        return;
      case "cmd_downloadFlagged":
        gFolderDisplay.doCommand(
          Ci.nsMsgViewCommandType.downloadFlaggedForOffline
        );
        return;
      case "cmd_downloadSelected":
        gFolderDisplay.doCommand(
          Ci.nsMsgViewCommandType.downloadSelectedForOffline
        );
        return;
      case "cmd_synchronizeOffline":
        MsgSynchronizeOffline();
        return;
      case "cmd_settingsOffline":
        MailOfflineMgr.openOfflineAccountSettings();
        return;
      case "cmd_goForward":
        performNavigation(Ci.nsMsgNavigationType.forward);
        break;
      case "cmd_goBack":
        performNavigation(Ci.nsMsgNavigationType.back);
        break;
      case "cmd_applyFiltersToSelection":
        MsgApplyFiltersToSelection();
        break;
      case "cmd_fullZoomReduce":
        ZoomManager.reduce();
        break;
      case "cmd_fullZoomEnlarge":
        ZoomManager.enlarge();
        break;
      case "cmd_fullZoomReset":
        ZoomManager.reset();
        break;
      case "cmd_fullZoomToggle":
        ZoomManager.toggleZoom();
        break;
      case "cmd_fontSizeReduce":
        UIFontSize.reduceSize();
        break;
      case "cmd_fontSizeReset":
        UIFontSize.resetSize();
        break;
      case "cmd_fontSizeEnlarge":
        UIFontSize.increaseSize();
        break;
      case "cmd_stop":
        msgWindow.StopUrls();
        break;
      case "cmd_chat":
        let win = Services.wm.getMostRecentWindow("mail:3pane");
        if (win) {
          win.focus();
          win.showChatTab();
        } else {
          window.openDialog(
            "chrome://messenger/content/messenger.xhtml",
            "_blank",
            "chrome,extrachrome,menubar,resizable,scrollbars,status,toolbar",
            null,
            { tabType: "chat", tabParams: {} }
          );
        }
        break;
    }
  },

  onEvent(event) {},
};

function performNavigation(type) {
  // Try to load a message by navigation type if we can find
  // the message in the same folder.
  if (gFolderDisplay.navigate(type)) {
    return;
  }

  CrossFolderNavigation(type);
}

function SetupCommandUpdateHandlers() {
  top.controllers.insertControllerAt(0, MessageWindowController);
  top.controllers.insertControllerAt(
    0,
    messageBrowser.contentWindow.commandController
  );
}

function UnloadCommandUpdateHandlers() {
  top.controllers.removeController(MessageWindowController);
  top.controllers.removeController(
    messageBrowser.contentWindow.commandController
  );
}
