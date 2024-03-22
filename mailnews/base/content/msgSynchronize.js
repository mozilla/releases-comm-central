/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { MailUtils } = ChromeUtils.importESModule(
  "resource:///modules/MailUtils.sys.mjs"
);

var gSynchronizeTree = null;
var gParentMsgWindow;
var gMsgWindow;

var gInitialFolderStates = {};

window.addEventListener("DOMContentLoaded", onLoad);

document.addEventListener("dialogaccept", syncOkButton);

function onLoad() {
  gParentMsgWindow = window.arguments?.[0]?.msgWindow;

  document.getElementById("syncMail").checked = Services.prefs.getBoolPref(
    "mailnews.offline_sync_mail"
  );
  document.getElementById("syncNews").checked = Services.prefs.getBoolPref(
    "mailnews.offline_sync_news"
  );
  document.getElementById("sendMessage").checked = Services.prefs.getBoolPref(
    "mailnews.offline_sync_send_unsent"
  );
  document.getElementById("workOffline").checked = Services.prefs.getBoolPref(
    "mailnews.offline_sync_work_offline"
  );
}

function syncOkButton() {
  var syncMail = document.getElementById("syncMail").checked;
  var syncNews = document.getElementById("syncNews").checked;
  var sendMessage = document.getElementById("sendMessage").checked;
  var workOffline = document.getElementById("workOffline").checked;

  Services.prefs.setBoolPref("mailnews.offline_sync_mail", syncMail);
  Services.prefs.setBoolPref("mailnews.offline_sync_news", syncNews);
  Services.prefs.setBoolPref("mailnews.offline_sync_send_unsent", sendMessage);
  Services.prefs.setBoolPref("mailnews.offline_sync_work_offline", workOffline);

  if (syncMail || syncNews || sendMessage || workOffline) {
    var offlineManager = Cc[
      "@mozilla.org/messenger/offline-manager;1"
    ].getService(Ci.nsIMsgOfflineManager);
    if (offlineManager) {
      offlineManager.synchronizeForOffline(
        syncNews,
        syncMail,
        sendMessage,
        workOffline,
        gParentMsgWindow
      );
    }
  }
}

function OnSelect() {
  top.window.openDialog(
    "chrome://messenger/content/msgSelectOfflineFolders.xhtml",
    "",
    "centerscreen,chrome,modal,titlebar,resizable=yes"
  );
  return true;
}

// All the code below is only used by Seamonkey.

function selectOkButton() {
  return true;
}

function selectCancelButton() {
  for (var resourceValue in gInitialFolderStates) {
    const folder = MailUtils.getExistingFolder(resourceValue);
    if (gInitialFolderStates[resourceValue]) {
      folder.setFlag(Ci.nsMsgFolderFlags.Offline);
    } else {
      folder.clearFlag(Ci.nsMsgFolderFlags.Offline);
    }
  }
  return true;
}

function SortSynchronizePane(column, sortKey) {
  var node = FindInWindow(window, column);
  if (!node) {
    dump("Couldn't find sort column\n");
    return;
  }

  node.setAttribute("sort", sortKey);
  node.setAttribute("sortDirection", "natural");
  var col = gSynchronizeTree.columns[column];
  gSynchronizeTree.view.cycleHeader(col);
}

function FindInWindow(currentWindow, id) {
  var item = currentWindow.document.getElementById(id);
  if (item) {
    return item;
  }

  for (var i = 0; i < currentWindow.frames.length; i++) {
    var frameItem = FindInWindow(currentWindow.frames[i], id);
    if (frameItem) {
      return frameItem;
    }
  }

  return null;
}

function onSynchronizeClick(event) {
  // we only care about button 0 (left click) events
  if (event.button != 0) {
    return;
  }

  const treeCellInfo = gSynchronizeTree.getCellAt(event.clientX, event.clientY);
  if (treeCellInfo.row == -1) {
    return;
  }

  if (treeCellInfo.childElt == "twisty") {
    var folderResource = GetFolderResource(gSynchronizeTree, treeCellInfo.row);
    var folder = folderResource.QueryInterface(Ci.nsIMsgFolder);

    if (!gSynchronizeTree.view.isContainerOpen(treeCellInfo.row)) {
      var serverType = folder.server.type;
      // imap is the only server type that does folder discovery
      if (serverType != "imap") {
        return;
      }

      if (folder.isServer) {
        var server = folder.server;
        server.performExpand(gMsgWindow);
      } else {
        var imapFolder = folderResource.QueryInterface(Ci.nsIMsgImapMailFolder);
        if (imapFolder) {
          imapFolder.performExpand(gMsgWindow);
        }
      }
    }
  } else if (treeCellInfo.col.id == "syncCol") {
    UpdateNode(
      GetFolderResource(gSynchronizeTree, treeCellInfo.row),
      treeCellInfo.row
    );
  }
}

function onSynchronizeTreeKeyPress(event) {
  // for now, only do something on space key
  if (event.charCode != KeyEvent.DOM_VK_SPACE) {
    return;
  }

  var treeSelection = gSynchronizeTree.view.selection;
  for (let i = 0; i < treeSelection.getRangeCount(); i++) {
    var start = {},
      end = {};
    treeSelection.getRangeAt(i, start, end);
    for (let k = start.value; k <= end.value; k++) {
      UpdateNode(GetFolderResource(gSynchronizeTree, k), k);
    }
  }
}

function UpdateNode(resource) {
  var folder = resource.QueryInterface(Ci.nsIMsgFolder);

  if (folder.isServer) {
    return;
  }

  if (!(resource.Value in gInitialFolderStates)) {
    gInitialFolderStates[resource.Value] = folder.getFlag(
      Ci.nsMsgFolderFlags.Offline
    );
  }

  folder.toggleFlag(Ci.nsMsgFolderFlags.Offline);
}

function GetFolderResource(aTree, aIndex) {
  return aTree.view.getResourceAtIndex(aIndex);
}
