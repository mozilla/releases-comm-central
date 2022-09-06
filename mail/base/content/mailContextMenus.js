/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from commandglue.js */
/* import-globals-from folderDisplay.js */
/* import-globals-from mailWindow.js */
/* import-globals-from nsContextMenu.js */

var { PluralForm } = ChromeUtils.import(
  "resource://gre/modules/PluralForm.jsm"
);
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

/**
 * Function to change the highlighted row back to the row that is currently
 * outline/dotted without loading the contents of either rows. This is
 * triggered when the context menu for a given row is hidden/closed
 * (onpopuphiding).
 * @param tree the tree element to restore selection for
 */
function RestoreSelectionWithoutContentLoad(tree) {
  if (gRightMouseButtonSavedSelection) {
    let view = gRightMouseButtonSavedSelection.view;
    // restore the selection
    let transientSelection = gRightMouseButtonSavedSelection.transientSelection;
    let realSelection = gRightMouseButtonSavedSelection.realSelection;
    view.selection = realSelection;
    // replay any calls to adjustSelection, this handles suppression.
    transientSelection.replayAdjustSelectionLog(realSelection);
    // Avoid possible cycle leaks.
    gRightMouseButtonSavedSelection.view = null;
    gRightMouseButtonSavedSelection = null;

    if (tree) {
      tree.invalidate();
    }

    UpdateMailToolbar("RestoreSelectionWithoutContentLoad");
  }
}

/**
 * Function to clear out the global nsContextMenu, and in the case when we
 * were a threadpane context menu, restore the selection so that a right-click
 * on a non-selected row doesn't move the selection.
 * @param event the onpopuphiding event
 */
function mailContextOnPopupHiding(aEvent) {
  // Don't do anything if it's a submenu's onpopuphiding that's just bubbling
  // up to the top.
  if (aEvent.target != aEvent.currentTarget) {
    return;
  }

  let wasInThreadPane = gContextMenu.inThreadPane;
  gContextMenu.hiding();
  gContextMenu = null;
  if (wasInThreadPane && "GetThreadTree" in window) {
    RestoreSelectionWithoutContentLoad(GetThreadTree());
  }
}

function fillMailContextMenu(event) {
  let target = event.target.triggerNode;
  if (target?.localName == "treecol") {
    let treeColPicker = target.parentNode.querySelector("treecolpicker");
    let popup = treeColPicker.querySelector(`menupopup[anonid="popup"]`);
    treeColPicker.buildPopup(popup);
    popup.openPopup(target, "after_start", 0, 0, true);
    return false;
  }

  // If the popupshowing was for a submenu, we don't need to do anything.
  if (event.target != event.currentTarget) {
    return true;
  }

  // No menu on grouped header row currently, any command would be an implied
  // multiselect.
  if (gFolderDisplay?.tree) {
    let row = gFolderDisplay.tree.getRowAt(event.clientX, event.clientY);
    if (gFolderDisplay.view.isGroupedByHeaderAtIndex(row)) {
      RestoreSelectionWithoutContentLoad(gFolderDisplay.tree);
      return false;
    }
  }

  goUpdateCommand("cmd_killThread");
  goUpdateCommand("cmd_killSubthread");
  goUpdateCommand("cmd_watchThread");

  goUpdateCommand("cmd_print");

  updateCheckedStateForIgnoreAndWatchThreadCmds();

  // Show "Edit Draft Message" menus only in a drafts folder; otherwise hide them.
  showCommandInSpecialFolder("cmd_editDraftMsg", Ci.nsMsgFolderFlags.Drafts);
  // Show "New Message from Template" and "Edit Template" menus only in a
  // templates folder; otherwise hide them.
  showCommandInSpecialFolder(
    ["cmd_newMsgFromTemplate", "cmd_editTemplateMsg"],
    Ci.nsMsgFolderFlags.Templates
  );

  gContextMenu = new nsContextMenu(event.target, event.shiftKey);
  return gContextMenu.shouldDisplay;
}

/**
 * Take the message id from the messageIdNode and use the url defined in the
 * hidden pref "mailnews.messageid_browser.url" to open it in a browser window
 * (%mid is replaced by the message id).
 * @param messageId the message id to open
 */
function OpenBrowserWithMessageId(messageId) {
  var browserURL = Services.prefs.getComplexValue(
    "mailnews.messageid_browser.url",
    Ci.nsIPrefLocalizedString
  ).data;
  browserURL = browserURL.replace(/%mid/, messageId);
  try {
    messenger.launchExternalURL(browserURL);
  } catch (ex) {
    Cu.reportError(
      "Failed to open message-id in browser; browserURL=" + browserURL
    );
  }
}

/**
 * Take the message id from the messageIdNode, search for the corresponding
 * message in all folders starting with the current selected folder, then the
 * current account followed by the other accounts and open corresponding
 * message if found.
 * @param messageId the message id to open
 */
function OpenMessageForMessageId(messageId) {
  let startServer = msgWindow.openFolder.server;

  window.setCursor("wait");
  let { MailUtils } = ChromeUtils.import("resource:///modules/MailUtils.jsm");
  let messageHeader = MailUtils.getMsgHdrForMsgId(messageId, startServer);
  window.setCursor("auto");

  // if message id was found open corresponding message
  // else show error message
  if (messageHeader) {
    OpenMessageByHeader(
      messageHeader,
      Services.prefs.getBoolPref("mailnews.messageid.openInNewWindow")
    );
  } else {
    let messageIdStr = "<" + messageId + ">";
    let bundle = document.getElementById("bundle_messenger");
    let errorTitle = bundle.getString("errorOpenMessageForMessageIdTitle");
    let errorMessage = bundle.getFormattedString(
      "errorOpenMessageForMessageIdMessage",
      [messageIdStr]
    );

    Services.prompt.alert(window, errorTitle, errorMessage);
  }
}

function OpenMessageByHeader(messageHeader, openInNewWindow) {
  if (openInNewWindow) {
    window.openDialog(
      "chrome://messenger/content/messageWindow.xhtml",
      "_blank",
      "all,chrome,dialog=no,status,toolbar",
      messageHeader
    );
  } else {
    // TODO: Reimplement this?
  }
}

function folderPaneOnPopupHiding() {
  RestoreSelectionWithoutContentLoad(document.getElementById("folderTree"));
}

function ShowMenuItem(id, showItem) {
  document.getElementById(id).hidden = !showItem;
}

function EnableMenuItem(id, enableItem) {
  document.getElementById(id).disabled = !enableItem;
}

function SetMenuItemLabel(id, label) {
  document.getElementById(id).setAttribute("label", label);
}

// helper function used by shouldShowSeparator
function hasAVisibleNextSibling(aNode) {
  var sibling = aNode.nextElementSibling;
  while (sibling) {
    if (!sibling.hidden && sibling.localName != "menuseparator") {
      return true;
    }
    sibling = sibling.nextElementSibling;
  }
  return false;
}

function IsMenuItemShowing(menuID) {
  var item = document.getElementById(menuID);
  if (item) {
    return item.hidden != "true";
  }
  return false;
}

// message pane context menu helper methods
function addEmail(url = gContextMenu.linkURL) {
  let addresses = getEmail(url);
  toAddressBook({
    action: "create",
    address: addresses,
  });
}

function composeEmailTo(linkURL, identity) {
  let fields = Cc[
    "@mozilla.org/messengercompose/composefields;1"
  ].createInstance(Ci.nsIMsgCompFields);
  let params = Cc[
    "@mozilla.org/messengercompose/composeparams;1"
  ].createInstance(Ci.nsIMsgComposeParams);
  fields.to = getEmail(linkURL);
  params.type = Ci.nsIMsgCompType.New;
  params.format = Ci.nsIMsgCompFormat.Default;
  if (identity) {
    params.identity = identity;
  } else if (gFolderDisplay?.displayedFolder) {
    params.identity = accountManager.getFirstIdentityForServer(
      gFolderDisplay.displayedFolder.server
    );
  }
  params.composeFields = fields;
  MailServices.compose.OpenComposeWindowWithParams(null, params);
}

// Extracts email address from url string
function getEmail(url) {
  var mailtolength = 7;
  var qmark = url.indexOf("?");
  var addresses;

  if (qmark > mailtolength) {
    addresses = url.substring(mailtolength, qmark);
  } else {
    addresses = url.substr(mailtolength);
  }
  // Let's try to unescape it using a character set
  try {
    addresses = Services.textToSubURI.unEscapeURIForUI(addresses);
  } catch (ex) {
    // Do nothing.
  }
  return addresses;
}

function CopyMessageUrl() {
  try {
    var hdr = gDBView.hdrForFirstSelectedMessage;
    var server = hdr.folder.server;

    // TODO let backend construct URL and return as attribute
    var url =
      server.socketType == Ci.nsMsgSocketType.SSL ? "snews://" : "news://";
    url += server.hostName + ":" + server.port + "/" + hdr.messageId;

    var clipboard = Cc["@mozilla.org/widget/clipboardhelper;1"].getService(
      Ci.nsIClipboardHelper
    );
    clipboard.copyString(url);
  } catch (ex) {
    dump("ex=" + ex + "\n");
  }
}
