/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from am-smtp.js */

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { MailUtils } = ChromeUtils.import("resource:///modules/MailUtils.jsm");

function BrowseForLocalFolders() {
  var currentFolderTextBox = document.getElementById("server.localPath");
  var fp = Cc["@mozilla.org/filepicker;1"].createInstance(Ci.nsIFilePicker);

  fp.init(
    window.browsingContext,
    document
      .getElementById("browseForLocalFolder")
      .getAttribute("filepickertitle"),
    Ci.nsIFilePicker.modeGetFolder
  );

  var currentFolder = Cc["@mozilla.org/file/local;1"].createInstance(
    Ci.nsIFile
  );
  try {
    currentFolder.initWithPath(currentFolderTextBox.value);
    fp.displayDirectory = currentFolder;
  } catch (e) {
    console.error(
      `Failed to set folder path from value=${currentFolderTextBox.value}\n`
    );
  }

  fp.open(rv => {
    if (rv != Ci.nsIFilePicker.returnOK || !fp.file) {
      return;
    }
    // Retrieve the selected folder.
    const selectedFolder = fp.file;

    // Check if the folder can be used for mail storage.
    if (!top.checkDirectoryIsUsable(selectedFolder)) {
      return;
    }

    currentFolderTextBox.value = selectedFolder.path;
    currentFolderTextBox.dispatchEvent(new CustomEvent("change"));
  });
}

/**
 * Return server/folder name formatted with server name if needed.
 *
 * @param {nsIMsgFolder} aTargetFolder - nsIMsgFolder to format name for
   @returns {string} THe formatted name.
 *   If target.isServer then only its name is returned.
 *   Otherwise return the name as "<foldername> on <servername>".
 */
function prettyFolderName(aTargetFolder) {
  if (aTargetFolder.isServer) {
    return aTargetFolder.prettyName;
  }

  return document
    .getElementById("bundle_messenger")
    .getFormattedString("verboseFolderFormat", [
      aTargetFolder.prettyName,
      aTargetFolder.server.prettyName,
    ]);
}

/**
 * Checks validity of junk target server name and folder.
 *
 * @param {string} aTargetURI - The URI specification to check.
 * @param {boolean} aIsServer - true if the URI specifies only a server
 *   (without folder)
 *
 * @returns {string} the value of aTargetURI if it is valid (usable), otherwise null
 */
function checkJunkTargetFolder(aTargetURI, aIsServer) {
  try {
    // Does the target account exist?
    let targetServer;
    if (aIsServer) {
      targetServer = MailUtils.getOrCreateFolder(aTargetURI + "/Junk").server;
    } else {
      targetServer = MailUtils.getExistingFolder(aTargetURI).server;
    }

    // If the target server has deferred storage, Junk can't be stored into it.
    if (targetServer.rootFolder != targetServer.rootMsgFolder) {
      return null;
    }
  } catch (e) {
    return null;
  }

  return aTargetURI;
}

/**
 * Finds a usable target for storing Junk mail.
 * If the passed in server URI is not usable, choose Local Folders.
 *
 * @param {string} aTargetURI - The URI of a server or folder to try first
 * @param {boolean} aIsServer - true if the URI specifies only a server (without folder)
 *
 * @returns {string} the server/folder URI of a usable target for storing Junk
 */
function chooseJunkTargetFolder(aTargetURI, aIsServer) {
  let server = null;

  if (aTargetURI) {
    server = MailUtils.getOrCreateFolder(aTargetURI).server;
    if (
      !server.canCreateFoldersOnServer ||
      !server.canSearchMessages ||
      server.rootFolder != server.rootMsgFolder
    ) {
      server = null;
    }
  }
  if (!server) {
    server = MailServices.accounts.localFoldersServer;
  }

  return server.serverURI + (!aIsServer ? "/Junk" : "");
}

/**
 * Fixes junk target folders if they point to an invalid/unusable (e.g. deferred)
 * folder/account. Only returns the new safe values. It is up to the caller
 * to push them to the proper elements/prefs.
 *
 * @param {string} aSpamActionTargetAccount - The value of the
 *   server.*.spamActionTargetAccount pref value (URI).
 * @param {string} aSpamActionTargetFolder - The value of the
 *   server.*.spamActionTargetFolder pref value (URI).
 * @param {string} aProposedTarget - The URI of a new target to try.
 * @param {integer} aMoveTargetModeValue - The value of the
 *   server.*.moveTargetMode pref value (0/1).
 * @param {nsISpamSettings} aServerSpamSettings - The nsISpamSettings object
 *    of any server (used just for the MOVE_TARGET_MODE_* constants).
 * @param {boolean} aMoveOnSpam - The server.*.moveOnSpam pref value).
 *
 * @returns {object[]} an array containing:
 *   newTargetAccount new safe junk target account
 *   newTargetAccount new safe junk target folder
 *   newMoveOnSpam    new moveOnSpam value
 */
function sanitizeJunkTargets(
  aSpamActionTargetAccount,
  aSpamActionTargetFolder,
  aProposedTarget,
  aMoveTargetModeValue,
  aServerSpamSettings,
  aMoveOnSpam
) {
  // Check if folder targets are valid.
  aSpamActionTargetAccount = checkJunkTargetFolder(
    aSpamActionTargetAccount,
    true
  );
  if (!aSpamActionTargetAccount) {
    // If aSpamActionTargetAccount is not valid,
    // reset to default behavior to NOT move junk messages...
    if (aMoveTargetModeValue == aServerSpamSettings.MOVE_TARGET_MODE_ACCOUNT) {
      aMoveOnSpam = false;
    }

    // ... and find a good default target.
    aSpamActionTargetAccount = chooseJunkTargetFolder(aProposedTarget, true);
  }

  aSpamActionTargetFolder = checkJunkTargetFolder(
    aSpamActionTargetFolder,
    false
  );
  if (!aSpamActionTargetFolder) {
    // If aSpamActionTargetFolder is not valid,
    // reset to default behavior to NOT move junk messages...
    if (aMoveTargetModeValue == aServerSpamSettings.MOVE_TARGET_MODE_FOLDER) {
      aMoveOnSpam = false;
    }

    // ... and find a good default target.
    aSpamActionTargetFolder = chooseJunkTargetFolder(aProposedTarget, false);
  }

  return [aSpamActionTargetAccount, aSpamActionTargetFolder, aMoveOnSpam];
}

/**
 * Opens Preferences (Options) dialog on the Advanced pane, General tab
 * so that the user sees where the global receipts settings can be found.
 *
 * @param {string} aTBPaneId - Thunderbird pref paneID to open.
 * @param {string} aTBScrollPaneTo - Thunderbird ID of the element to scroll into view.
 * @param {any} aTBOtherArgs - Other arguments to send to the pref tab.
 * @param {string} aSMPaneId - Seamonkey pref pane to open.
 */
function openPrefsFromAccountManager(
  aTBPaneId,
  aTBScrollPaneTo,
  aTBOtherArgs,
  aSMPaneId
) {
  const win =
    Services.wm.getMostRecentWindow("mail:3pane") ||
    Services.wm.getMostRecentWindow("mail:messageWindow") ||
    Services.wm.getMostRecentWindow("msgcompose");
  if (!win) {
    return;
  }

  // If openOptionsDialog() exists, we are in Thunderbird.
  if (typeof win.openOptionsDialog == "function") {
    win.openOptionsDialog(aTBPaneId, aTBScrollPaneTo, aTBOtherArgs);
  }
  // If goPreferences() exists, we are in Seamonkey.
  if (typeof win.goPreferences == "function") {
    win.goPreferences(aSMPaneId);
  }
}

/**
 * Check if the given account name already exists in any account.
 *
 * @param {string} aAccountName - The account name string to look for.
 * @param {string} [aAccountKey] - The key of an account that is skipped when
 *   searching the name. If unset, do not skip any account.
 */
function accountNameExists(aAccountName, aAccountKey) {
  for (const account of MailServices.accounts.accounts) {
    if (
      account.key != aAccountKey &&
      account.incomingServer &&
      aAccountName == account.incomingServer.prettyName
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Open a dialog to edit properties of an SMTP server.
 *
 * @param {nsISmtpServer} aServer - The server to edit.
 * @returns {object} Object with result member to indicate whether 'OK'
 *   was clicked and addSmtpServer with key of newly created server.
 */
function editSMTPServer(aServer) {
  const args = { server: aServer, result: false, addSmtpServer: "" };

  const onCloseSMTPDialog = function () {
    if (args.result) {
      gSmtpServerListWindow.refreshServerList(aServer, true);
    }
  };

  parent.gSubDialog.open(
    "chrome://messenger/content/SmtpServerEdit.xhtml",
    { closingCallback: onCloseSMTPDialog },
    args
  );

  return args;
}
