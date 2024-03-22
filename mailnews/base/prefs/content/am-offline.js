/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from am-prefs.js */
/* import-globals-from ../../content/retention.js */

var gIncomingServer;
var gServerType;
var gImapIncomingServer;
var gPref = null;
var gLockedPref = {};
var gOfflineMap = null; // map of folder URLs to offline flags
var gOfflineFolders; // initial state of allFoldersOffline checkbox
var gToggleOccurred = false;

function onInit() {
  onLockPreference();

  // init values here
  initServerSettings();
  initRetentionSettings();
  initDownloadSettings();
  initOfflineSettings();

  onCheckItem1("offline.notDownloadMin", "offline.notDownload");
  onCheckItem1("nntp.downloadMsgMin", "nntp.downloadMsg");
  onCheckItem1("nntp.removeBodyMin", "nntp.removeBody");
  onCheckKeepMsg();
}

/**
 * Store initial offline flag for each folder and the allFoldersOffline
 * checkbox. Use to restore the flags and checkbox if edits are canceled.
 */
function initOfflineSettings() {
  gOfflineMap = collectOfflineFolders();
  gOfflineFolders = document.getElementById("offline.folders").checked;
  gToggleOccurred = false;
}

function initServerSettings() {
  document.getElementById("offline.notDownload").checked =
    gIncomingServer.limitOfflineMessageSize;
  document.getElementById("autosyncNotDownload").checked =
    gIncomingServer.limitOfflineMessageSize;
  if (gIncomingServer.maxMessageSize > 0) {
    document.getElementById("offline.notDownloadMin").value =
      gIncomingServer.maxMessageSize;
  } else {
    document.getElementById("offline.notDownloadMin").value = "50";
  }

  if (gServerType == "imap") {
    gImapIncomingServer = gIncomingServer.QueryInterface(
      Ci.nsIImapIncomingServer
    );
    document.getElementById("offline.folders").checked =
      gImapIncomingServer.offlineDownload;
  }
}

function initRetentionSettings() {
  const retentionSettings = gIncomingServer.retentionSettings;
  initCommonRetentionSettings(retentionSettings);

  document.getElementById("nntp.removeBody").checked =
    retentionSettings.cleanupBodiesByDays;
  document.getElementById("nntp.removeBodyMin").value =
    retentionSettings.daysToKeepBodies > 0
      ? retentionSettings.daysToKeepBodies
      : 30;
}

function initDownloadSettings() {
  const downloadSettings = gIncomingServer.downloadSettings;
  document.getElementById("nntp.downloadMsg").checked =
    downloadSettings.downloadByDate;
  document.getElementById("nntp.notDownloadRead").checked =
    downloadSettings.downloadUnreadOnly;
  document.getElementById("nntp.downloadMsgMin").value =
    downloadSettings.ageLimitOfMsgsToDownload > 0
      ? downloadSettings.ageLimitOfMsgsToDownload
      : 30;

  // Figure out what the most natural division of the autosync pref into
  // a value and an interval is.
  const autosyncSelect = document.getElementById("autosyncSelect");
  const autosyncInterval = document.getElementById("autosyncInterval");
  const autosyncValue = document.getElementById("autosyncValue");
  const autosyncPref = document.getElementById("imap.autoSyncMaxAgeDays");
  const autosyncPrefValue =
    autosyncPref.value == "" ? -1 : parseInt(autosyncPref.value, 10);

  // Clear the preference until we're done initializing.
  autosyncPref.value = "";

  if (autosyncPrefValue <= 0) {
    // Special-case values <= 0 to have an interval of "All" and disabled
    // controls for value and interval.
    autosyncSelect.value = 0;
    autosyncInterval.value = 1;
    autosyncInterval.disabled = true;
    autosyncValue.value = 30;
    autosyncValue.disabled = true;
  } else {
    // Otherwise, get the list of possible intervals, in order from
    // largest to smallest.
    const valuesToTest = [];
    for (let i = autosyncInterval.itemCount - 1; i >= 0; i--) {
      valuesToTest.push(autosyncInterval.getItemAtIndex(i).value);
    }

    // and find the first one that divides the preference evenly.
    for (const i in valuesToTest) {
      if (!(autosyncPrefValue % valuesToTest[i])) {
        autosyncSelect.value = 1;
        autosyncInterval.value = valuesToTest[i];
        autosyncValue.value = autosyncPrefValue / autosyncInterval.value;
        break;
      }
    }
    autosyncInterval.disabled = false;
    autosyncValue.disabled = false;
  }
  autosyncPref.value = autosyncPrefValue;
}

function onPreInit(account, accountValues) {
  gServerType = top.getAccountValue(
    account,
    accountValues,
    "server",
    "type",
    null,
    false
  );
  hideShowControls(gServerType);
  gIncomingServer = account.incomingServer;
  gIncomingServer.type = gServerType;

  // 10 is OFFLINE_SUPPORT_LEVEL_REGULAR, see nsIMsgIncomingServer.idl
  // currently, there is no offline without diskspace
  var titleStringID =
    gIncomingServer.offlineSupportLevel >= 10
      ? "prefPanel-synchronization"
      : "prefPanel-diskspace";

  var prefBundle = document.getElementById("bundle_prefs");
  document
    .querySelector("#headertitle > .dialogheader-title")
    .setAttribute("value", prefBundle.getString(titleStringID));
  document.title = prefBundle.getString(titleStringID);

  if (gServerType == "pop3") {
    var pop3Server = gIncomingServer.QueryInterface(Ci.nsIPop3IncomingServer);
    // hide retention settings for deferred accounts
    if (pop3Server.deferredToAccount.length) {
      var retentionRadio = document.getElementById("retention.keepMsg");
      retentionRadio.setAttribute("hidden", "true");
      var retentionLabel = document.getElementById("retentionDescriptionPop");
      retentionLabel.setAttribute("hidden", "true");
      var applyToFlaggedCheckbox = document.getElementById(
        "retention.applyToFlagged"
      );
      applyToFlaggedCheckbox.setAttribute("hidden", "true");
    }
  }
}

function onClickSelect() {
  parent.gSubDialog.open(
    "chrome://messenger/content/msgSelectOfflineFolders.xhtml"
  );
}

/**
 * Handle updates to the Autosync
 */
function onAutosyncChange() {
  const autosyncSelect = document.getElementById("autosyncSelect");
  const autosyncInterval = document.getElementById("autosyncInterval");
  const autosyncValue = document.getElementById("autosyncValue");
  const autosyncPref = document.getElementById("imap.autoSyncMaxAgeDays");

  // If we're not done initializing, don't do anything.
  // (See initDownloadSettings() for more details.)
  if (autosyncPref.value == "") {
    return;
  }

  // If the user selected the All option, disable the autosync and the
  // textbox.
  if (autosyncSelect.value == 0) {
    autosyncPref.value = -1;
    autosyncInterval.disabled = true;
    autosyncValue.disabled = true;
    return;
  }

  const max = 0x7fffffff / (60 * 60 * 24 * autosyncInterval.value);
  autosyncValue.setAttribute("max", max);
  if (autosyncValue.value > max) {
    autosyncValue.value = Math.floor(max);
  }

  autosyncInterval.disabled = false;
  autosyncValue.disabled = false;
  autosyncPref.value = autosyncValue.value * autosyncInterval.value;
}

function onAutosyncNotDownload() {
  // This function is called when the autosync version of offline.notDownload
  // is changed it simply copies the new checkbox value over to the element
  // driving the preference.
  document.getElementById("offline.notDownload").checked =
    document.getElementById("autosyncNotDownload").checked;
  onCheckItem1("offline.notDownloadMin", "offline.notDownload");
}

function onCancel() {
  // restore the offline flags for all folders
  restoreOfflineFolders(gOfflineMap);
  document.getElementById("offline.folders").checked = gOfflineFolders;
}

/**
 * Prompt to avoid unexpected folder sync changes.
 */
function onLeave() {
  let changed = false;
  if (gToggleOccurred) {
    for (const folder of gIncomingServer.rootFolder.descendants) {
      if (
        gOfflineMap[folder.folderURL] !=
        folder.getFlag(Ci.nsMsgFolderFlags.Offline)
      ) {
        // A change to the Offline flag to a folder was made.
        changed = true;
        break;
      }
    }
    gToggleOccurred = false;
  }

  if (changed) {
    // The user changed the "Keep messages in all folders..." checkbox and
    // caused changes in online/offline status for all folders in this
    // account.  Prompt whether to restore the original status.
    const prefBundle = document.getElementById("bundle_prefs");
    const title = prefBundle.getString("confirmSyncChangesTitle");
    const question = prefBundle.getString("confirmSyncChanges");
    const discard = prefBundle.getString("confirmSyncChangesDiscard");
    const result = Services.prompt.confirmEx(
      window,
      title,
      question,
      Services.prompt.BUTTON_TITLE_SAVE * Services.prompt.BUTTON_POS_0 +
        Services.prompt.BUTTON_TITLE_IS_STRING * Services.prompt.BUTTON_POS_1,
      null,
      discard,
      null,
      null,
      { value: 0 }
    );
    if (result == 1) {
      // User clicked Discard button, so restore the online/offline changes for
      // the current account.  Changes made through the "Advanced..." dialog to
      // other accounts will not be restored.
      onCancel();
      return false;
    }
  }
  return true;
}

function onSave() {
  var downloadSettings = Cc[
    "@mozilla.org/msgDatabase/downloadSettings;1"
  ].createInstance(Ci.nsIMsgDownloadSettings);

  gIncomingServer.limitOfflineMessageSize = document.getElementById(
    "offline.notDownload"
  ).checked;
  gIncomingServer.maxMessageSize = document.getElementById(
    "offline.notDownloadMin"
  ).value;

  var retentionSettings = saveCommonRetentionSettings(
    gIncomingServer.retentionSettings
  );

  retentionSettings.daysToKeepBodies =
    document.getElementById("nntp.removeBodyMin").value;
  retentionSettings.cleanupBodiesByDays =
    document.getElementById("nntp.removeBody").checked;

  downloadSettings.downloadByDate =
    document.getElementById("nntp.downloadMsg").checked;
  downloadSettings.downloadUnreadOnly = document.getElementById(
    "nntp.notDownloadRead"
  ).checked;
  downloadSettings.ageLimitOfMsgsToDownload = document.getElementById(
    "nntp.downloadMsgMin"
  ).value;

  gIncomingServer.retentionSettings = retentionSettings;
  gIncomingServer.downloadSettings = downloadSettings;

  if (gImapIncomingServer) {
    // Set the pref on the incomingserver, and set the flag on all folders.
    gImapIncomingServer.offlineDownload =
      document.getElementById("offline.folders").checked;
  }
}

// Does the work of disabling an element given the array which contains xul id/prefstring pairs.
// Also saves the id/locked state in an array so that other areas of the code can avoid
// stomping on the disabled state indiscriminately.
function disableIfLocked(prefstrArray) {
  for (let i = 0; i < prefstrArray.length; i++) {
    var id = prefstrArray[i].id;
    var element = document.getElementById(id);
    if (gPref.prefIsLocked(prefstrArray[i].prefstring)) {
      element.disabled = true;
      gLockedPref[id] = true;
    } else {
      element.removeAttribute("disabled");
      gLockedPref[id] = false;
    }
  }
}

// Disables xul elements that have associated preferences locked.
function onLockPreference() {
  var initPrefString = "mail.server";
  var finalPrefString;

  // This panel does not use the code in AccountManager.js to handle
  // the load/unload/disable.  keep in mind new prefstrings and changes
  // to code in AccountManager, and update these as well.
  var allPrefElements = [
    { prefstring: "limit_offline_message_size", id: "offline.notDownload" },
    { prefstring: "limit_offline_message_size", id: "autosyncNotDownload" },
    { prefstring: "max_size", id: "offline.notDownloadMin" },
    { prefstring: "downloadUnreadOnly", id: "nntp.notDownloadRead" },
    { prefstring: "downloadByDate", id: "nntp.downloadMsg" },
    { prefstring: "ageLimit", id: "nntp.downloadMsgMin" },
    { prefstring: "retainBy", id: "retention.keepMsg" },
    { prefstring: "daysToKeepHdrs", id: "retention.keepOldMsgMin" },
    { prefstring: "numHdrsToKeep", id: "retention.keepNewMsgMin" },
    { prefstring: "daysToKeepBodies", id: "nntp.removeBodyMin" },
    { prefstring: "cleanupBodies", id: "nntp.removeBody" },
    { prefstring: "applyToFlagged", id: "retention.applyToFlagged" },
    { prefstring: "disable_button.selectFolder", id: "selectNewsgroupsButton" },
    {
      prefstring: "disable_button.selectFolder",
      id: "selectImapFoldersButton",
    },
  ];

  finalPrefString = initPrefString + "." + gIncomingServer.key + ".";
  gPref = Services.prefs.getBranch(finalPrefString);

  disableIfLocked(allPrefElements);
}

// XXX TODO: Function should be merged with onCheckItem in bug 755885.
function onCheckItem1(changeElementId, checkElementId) {
  var element = document.getElementById(changeElementId);
  var checked = document.getElementById(checkElementId).checked;
  if (checked && !gLockedPref[checkElementId]) {
    element.removeAttribute("disabled");
  } else {
    element.setAttribute("disabled", "true");
  }
}

function toggleOffline() {
  const offline = document.getElementById("offline.folders").checked;
  for (const folder of gIncomingServer.rootFolder.descendants) {
    if (offline) {
      folder.setFlag(Ci.nsMsgFolderFlags.Offline);
    } else {
      folder.clearFlag(Ci.nsMsgFolderFlags.Offline);
    }
  }
  gToggleOccurred = true;
}

function collectOfflineFolders() {
  const offlineFolderMap = {};
  for (const folder of gIncomingServer.rootFolder.descendants) {
    offlineFolderMap[folder.folderURL] = folder.getFlag(
      Ci.nsMsgFolderFlags.Offline
    );
  }

  return offlineFolderMap;
}

function restoreOfflineFolders(offlineFolderMap) {
  for (const folder of gIncomingServer.rootFolder.descendants) {
    if (offlineFolderMap[folder.folderURL]) {
      folder.setFlag(Ci.nsMsgFolderFlags.Offline);
    } else {
      folder.clearFlag(Ci.nsMsgFolderFlags.Offline);
    }
  }
}

/**
 * Checks if the user selected a permanent removal of messages from a server
 * listed in the confirmfor attribute and warns about it.
 *
 * @param {Element} aRadio - The radiogroup element containing the retention options.
 */
function warnServerRemove(aRadio) {
  const confirmFor = aRadio.getAttribute("confirmfor");

  if (
    confirmFor &&
    confirmFor.split(",").includes(gServerType) &&
    aRadio.value != 1
  ) {
    const prefBundle = document.getElementById("bundle_prefs");
    const title = prefBundle.getString("removeFromServerTitle");
    const question = prefBundle.getString("removeFromServer");
    if (!Services.prompt.confirm(window, title, question)) {
      // If the user doesn't agree, fall back to not deleting anything.
      aRadio.value = 1;
      onCheckKeepMsg();
    }
  }
}
