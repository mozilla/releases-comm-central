/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { MailUtils } = ChromeUtils.importESModule(
  "resource:///modules/MailUtils.sys.mjs"
);
var { UIFontSize } = ChromeUtils.importESModule(
  "resource:///modules/UIFontSize.sys.mjs"
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

  UIFontSize.registerWindow(window);
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

function GetFolderResource(aTree, aIndex) {
  return aTree.view.getResourceAtIndex(aIndex);
}
