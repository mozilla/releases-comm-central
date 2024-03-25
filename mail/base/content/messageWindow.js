/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* This is where functions related to the standalone message window are kept */

/* import-globals-from ../../../../toolkit/content/viewZoomOverlay.js */
/* import-globals-from ../../../mailnews/base/prefs/content/accountUtils.js */
/* import-globals-from ../../components/customizableui/content/panelUI.js */
/* import-globals-from mail-offline.js */
/* import-globals-from mailCommands.js */
/* import-globals-from mailCore.js */
/* import-globals-from mailWindowOverlay.js */
/* import-globals-from messenger-customization.js */
/* import-globals-from toolbarIconColor.js */

/* globals messenger, CreateMailWindowGlobals, InitMsgWindow, OnMailWindowUnload */ // From mailWindow.js

var { AppConstants } = ChromeUtils.importESModule(
  "resource://gre/modules/AppConstants.sys.mjs"
);

ChromeUtils.defineESModuleGetters(this, {
  BondOpenPGP: "chrome://openpgp/content/BondOpenPGP.sys.mjs",
  UIDensity: "resource:///modules/UIDensity.sys.mjs",
  UIFontSize: "resource:///modules/UIFontSize.sys.mjs",
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
  messageBrowser.addEventListener("messageURIChanged", () => {
    // Update toolbar buttons.
    goUpdateCommand("cmd_getNewMessages");
    goUpdateCommand("cmd_print");
    goUpdateCommand("cmd_delete");
    document.commandDispatcher.updateCommands("create-menu-go");
    document.commandDispatcher.updateCommands("create-menu-message");
  });
  messageBrowser.addEventListener(
    "load",
    () => (messageBrowser.contentWindow.tabOrWindow = window),
    true
  );
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
    const defaultHeight = screen.availHeight;
    const defaultWidth = screen.availWidth >= 860 ? 860 : screen.availWidth;

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
  BondOpenPGP.init();
  PanelUI.init();
  gExtensionsNotifications.init();

  setTimeout(delayedOnLoadMessageWindow, 0); // when debugging, set this to 5000, so you can see what happens after the window comes up.

  messageBrowser.addEventListener("DOMTitleChanged", () => {
    if (messageBrowser.contentTitle) {
      if (AppConstants.platform == "macosx") {
        document.title = messageBrowser.contentTitle;
      } else {
        document.title =
          messageBrowser.contentTitle +
          document.documentElement.getAttribute("titlemenuseparator") +
          document.documentElement.getAttribute("titlemodifier");
      }
    } else {
      document.title = document.documentElement.getAttribute("titlemodifier");
    }
  });

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

  // initialize the customizeDone method on the customizeable toolbar
  var toolbox = document.getElementById("mail-toolbox");
  toolbox.customizeDone = function (aEvent) {
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
    const contentWindow = messageBrowser.contentWindow;
    if (window.arguments[0] instanceof Ci.nsIURI) {
      contentWindow.displayMessage(window.arguments[0].spec);
      return;
    }

    let msgHdr, viewWrapperToClone;
    // message header as an object?
    if ("wrappedJSObject" in window.arguments[0]) {
      const hdrObject = window.arguments[0].wrappedJSObject;
      ({ msgHdr, viewWrapperToClone } = hdrObject);
    } else if (window.arguments[0] instanceof Ci.nsIMsgDBHdr) {
      // message header as a separate param?
      msgHdr = window.arguments[0];
      viewWrapperToClone = window.arguments[1];
    }

    contentWindow.displayMessage(
      msgHdr.folder.getUriForMsg(msgHdr),
      viewWrapperToClone
    );
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
  const contentWindow = messageBrowser.contentWindow;
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

  const paneViewSeparator = document.getElementById(
    "appmenu_paneViewSeparator"
  );
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

  var viewMessagesMenuSeparator = document.getElementById(
    "viewMessagesMenuSeparator"
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

  const trashSeparator = document.getElementById("trashMenuSeparator");
  if (trashSeparator) {
    trashSeparator.setAttribute("hidden", "true");
  }

  const goStartPageSeparator = document.getElementById("goNextSeparator");
  if (goStartPageSeparator) {
    goStartPageSeparator.hidden = true;
  }

  const goRecentlyClosedTabsSeparator = document.getElementById(
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

  const goStartPage = document.getElementById("goStartPage");
  if (goStartPage) {
    goStartPage.hidden = true;
  }

  const quickFilterBar = document.getElementById("appmenu_quickFilterBar");
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

// MessageWindowController object (handles commands when one of the trees does not have focus)
var MessageWindowController = {
  supportsCommand(command) {
    switch (command) {
      case "cmd_undo":
      case "cmd_redo":
      case "cmd_getMsgsForAuthAccounts":
      case "cmd_newMessage":
      case "cmd_getNextNMessages":
      case "cmd_find":
      case "cmd_findAgain":
      case "cmd_findPrevious":
      case "cmd_reload":
      case "cmd_getNewMessages":
      case "cmd_settingsOffline":
      case "cmd_fullZoomReduce":
      case "cmd_fullZoomEnlarge":
      case "cmd_fullZoomReset":
      case "cmd_fullZoomToggle":
      case "cmd_viewAllHeader":
      case "cmd_viewNormalHeader":
      case "cmd_stop":
      case "cmd_chat":
      case "cmd_newCard":
        return true;
      case "cmd_synchronizeOffline":
        return MailOfflineMgr.isOnline();
      default:
        return false;
    }
  },

  isCommandEnabled(command) {
    switch (command) {
      case "cmd_newMessage":
        return MailServices.accounts.allIdentities.length > 0;
      case "cmd_reload":
      case "cmd_find":
      case "cmd_stop":
        return false;
      case "cmd_getNewMessages":
      case "cmd_getMsgsForAuthAccounts":
        return IsGetNewMessagesEnabled();
      case "cmd_getNextNMessages":
        return IsGetNextNMessagesEnabled();
      case "cmd_synchronizeOffline":
        return MailOfflineMgr.isOnline();
      case "cmd_settingsOffline":
        return IsAccountOfflineEnabled();
      case "cmd_findAgain":
      case "cmd_findPrevious":
      case "cmd_fullZoomReduce":
      case "cmd_fullZoomEnlarge":
      case "cmd_fullZoomReset":
      case "cmd_fullZoomToggle":
      case "cmd_viewAllHeader":
      case "cmd_viewNormalHeader":
      case "cmd_newCard":
        return true;
      case "cmd_undo":
      case "cmd_redo":
        return SetupUndoRedoCommand(command);
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
      case "cmd_viewAllHeader":
        MsgViewAllHeaders();
        return;
      case "cmd_viewNormalHeader":
        MsgViewNormalHeaders();
        return;
      case "cmd_synchronizeOffline":
        MsgSynchronizeOffline();
        return;
      case "cmd_settingsOffline":
        MailOfflineMgr.openOfflineAccountSettings();
        return;
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
      case "cmd_stop":
        msgWindow.StopUrls();
        break;
      case "cmd_chat": {
        const win = Services.wm.getMostRecentWindow("mail:3pane");
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
      case "cmd_newCard":
        openNewCardDialog();
        break;
    }
  },

  onEvent() {},
};

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

/**
 * Message history popup implementation from mail-go-button ported for the old
 * mail toolbar.
 *
 * @param {XULPopupElement} popup
 */
function messageHistoryMenu_init(popup) {
  const { messageHistory } = messageBrowser.contentWindow;
  const { entries, currentIndex } = messageHistory.getHistory();

  // For populating the back menu, we want the most recently visited
  // messages first in the menu. So we go backward from curPos to 0.
  // For the forward menu, we want to go forward from curPos to the end.
  const items = [];
  const relativePositionBase = entries.length - 1 - currentIndex;
  for (const [index, entry] of entries.reverse().entries()) {
    const folder = MailServices.folderLookup.getFolderForURL(entry.folderURI);
    if (!folder) {
      // Where did the folder go?
      continue;
    }

    let menuText = "";
    let msgHdr;
    try {
      msgHdr = MailServices.messageServiceFromURI(
        entry.messageURI
      ).messageURIToMsgHdr(entry.messageURI);
    } catch (ex) {
      // Let's just ignore this history entry.
      continue;
    }
    const messageSubject = msgHdr.mime2DecodedSubject;
    const messageAuthor = msgHdr.mime2DecodedAuthor;

    if (!messageAuthor && !messageSubject) {
      // Avoid empty entries in the menu. The message was most likely (re)moved.
      continue;
    }

    // If the message was not being displayed via the current folder, prepend
    // the folder name.  We do not need to check underlying folders for
    // virtual folders because 'folder' is the display folder, not the
    // underlying one.
    if (folder != messageBrowser.contentWindow.gFolder) {
      menuText = folder.prettyName + " - ";
    }

    let subject = "";
    if (msgHdr.flags & Ci.nsMsgMessageFlags.HasRe) {
      subject = "Re: ";
    }
    if (messageSubject) {
      subject += messageSubject;
    }
    if (subject) {
      menuText += subject + " - ";
    }

    menuText += messageAuthor;
    const newMenuItem = document.createXULElement("menuitem");
    newMenuItem.setAttribute("label", menuText);
    const relativePosition = relativePositionBase - index;
    newMenuItem.setAttribute("value", relativePosition);
    newMenuItem.addEventListener("command", commandEvent => {
      navigateToUri(commandEvent.target);
      commandEvent.stopPropagation();
    });
    if (relativePosition === 0 && !messageHistory.canPop(0)) {
      newMenuItem.setAttribute("checked", true);
      newMenuItem.setAttribute("type", "radio");
    }
    items.push(newMenuItem);
  }
  popup.replaceChildren(...items);
}

/**
 * Select the message in the appropriate folder for the history popup entry.
 * Finds the message based on the value of the item, which is the relative
 * index of the item in the message history.
 *
 * @param {Element} target
 */
function navigateToUri(target) {
  const nsMsgViewIndex_None = 0xffffffff;
  const historyIndex = Number.parseInt(target.getAttribute("value"), 10);
  const currentWindow = messageBrowser.contentWindow;
  const { messageHistory } = currentWindow;
  if (!messageHistory || !messageHistory.canPop(historyIndex)) {
    return;
  }
  const item = messageHistory.pop(historyIndex);

  if (
    currentWindow.displayFolder &&
    currentWindow.gFolder?.URI !== item.folderURI
  ) {
    const folder = MailServices.folderLookup.getFolderForURL(item.folderURI);
    currentWindow.displayFolder(folder);
  }
  const msgHdr = MailServices.messageServiceFromURI(
    item.messageURI
  ).messageURIToMsgHdr(item.messageURI);
  const index = currentWindow.gDBView.findIndexOfMsgHdr(msgHdr, true);
  if (index != nsMsgViewIndex_None) {
    currentWindow.gViewWrapper.dbView.selection.select(index);
    currentWindow.displayMessage(
      currentWindow.gViewWrapper.dbView.URIForFirstSelectedMessage,
      currentWindow.gViewWrapper
    );
  }
}

function backToolbarMenu_init(popup) {
  messageHistoryMenu_init(popup);
}

function forwardToolbarMenu_init(popup) {
  messageHistoryMenu_init(popup);
}

function GetSelectedMsgFolders() {
  return messageBrowser.contentWindow.gFolder
    ? [messageBrowser.contentWindow.gFolder]
    : [];
}
