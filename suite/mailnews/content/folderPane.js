/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { folderUtils } =
  ChromeUtils.import("resource:///modules/folderUtils.jsm");
var { Services } =
  ChromeUtils.import("resource://gre/modules/Services.jsm");

// Implements a tree of folders. It shows icons depending on folder type
// and other fancy styling.
// This is used in the main folder pane, but also some dialogs that need
// to show a nice list of folders.

/**
 * This handles the invocation of most commands dealing with folders, based off
 * of the current selection, or a passed in folder.
 */
var gFolderTreeController = {
  /**
   * Opens the dialog to create a new sub-folder, and creates it if the user
   * accepts
   *
   * @param aParent (optional)  the parent for the new subfolder
   */
  newFolder(aParent) {
    let folder = aParent || GetSelectedMsgFolders()[0];

    // Make sure we actually can create subfolders.
    if (!folder.canCreateSubfolders) {
      // Check if we can create them at the root.
      let rootMsgFolder = folder.server.rootMsgFolder;
      if (rootMsgFolder.canCreateSubfolders)
        folder = rootMsgFolder;
      else // just use the default account
        folder = GetDefaultAccountRootFolder();
    }

    let dualUseFolders = true;
    if (folder.server instanceof Ci.nsIImapIncomingServer)
      dualUseFolders = folder.server.dualUseFolders;

    function newFolderCallback(aName, aFolder) {
      // createSubfolder can throw an exception, causing the newFolder dialog
      // to not close and wait for another input.
      // TODO: Rewrite this logic and move the opening of alert dialogs from
      // nsMsgLocalMailFolder::CreateSubfolderInternal to here (bug 831190#c16).
      if (aName)
        aFolder.createSubfolder(aName, msgWindow);
    }

    window.openDialog("chrome://messenger/content/newFolderDialog.xul",
                      "",
                      "chrome,modal,centerscreen",
                      {folder: folder,
                       dualUseFolders: dualUseFolders,
                       okCallback: newFolderCallback});
  },

  /**
   * Opens the dialog to edit the properties for a folder
   *
   * @param aTabID  (optional) the tab to show in the dialog
   * @param aFolder (optional) the folder to edit, if not the selected one
   */
  editFolder(aTabID, aFolder) {
    let folder = aFolder || GetSelectedMsgFolders()[0];

    // If a server is selected, view settings for that account.
    if (folder.isServer) {
      MsgAccountManager(null, folder.server);
      return;
    }

    if (folder.getFlag(Ci.nsMsgFolderFlags.Virtual)) {
      // virtual folders get their own property dialog that contains all of the
      // search information related to the virtual folder.
      this.editVirtualFolder(folder);
      return;
    }

    let title = gMessengerBundle.getString("folderProperties");

    function editFolderCallback(aNewName, aOldName, aUri) {
      if (aNewName != aOldName)
        folder.rename(aNewName, msgWindow);
    }

    function rebuildSummary(msgFolder) {
      if (msgFolder.locked) {
        msgFolder.throwAlertMsg("operationFailedFolderBusy", msgWindow);
        return;
      }
      if (msgFolder.supportsOffline) {
        // Remove the offline store, if any.
        let offlineStore = msgFolder.filePath;
        if (offlineStore.exists())
          offlineStore.remove(false);
      }
      msgFolder.msgDatabase.summaryValid = false;

      try {
        msgFolder.closeAndBackupFolderDB("");
      }
      catch(e) {
        // In a failure, proceed anyway since we're dealing with problems
        msgFolder.ForceDBClosed();
      }
      // these two lines will cause the thread pane to get reloaded
      // when the download/reparse is finished. Only do this
      // if the selected folder is loaded (i.e., not thru the
      // context menu on a non-loaded folder).
      if (msgFolder == GetLoadedMsgFolder()) {
        gRerootOnFolderLoad = true;
        gCurrentFolderToReroot = msgFolder.URI;
      }
      msgFolder.updateFolder(msgWindow);
    }

    window.openDialog("chrome://messenger/content/folderProps.xul",
                      "", "chrome,modal,centerscreen",
                      {folder: folder, serverType: folder.server.type,
                       msgWindow: msgWindow, title: title,
                       okCallback: editFolderCallback, tabID: aTabID,
                       name: folder.prettyName,
                       rebuildSummaryCallback: rebuildSummary});
  },

 /**
   * Opens the dialog to rename a particular folder, and does the renaming if
   * the user clicks OK in that dialog
   *
   * @param aFolder (optional)  the folder to rename, if different than the
   *                            currently selected one
   */
  renameFolder(aFolder) {
    let folder = aFolder || GetSelectedMsgFolders()[0];

    let controller = this;
    function renameCallback(aName, aUri) {
      if (aUri != folder.URI)
        Cu.reportError("got back a different folder to rename!");

      controller._resetThreadPane();
      let folderTree = document.getElementById("folderTree");
      folderTree.view.selection.clearSelection();

      folder.rename(aName, msgWindow);
    }

    window.openDialog("chrome://messenger/content/renameFolderDialog.xul",
                      "", "chrome,modal,centerscreen",
                      {preselectedURI: folder.URI,
                       okCallback: renameCallback, name: folder.prettyName});
  },

  /**
   * Deletes a folder from its parent. Also handles unsubscribe from newsgroups
   * if the selected folder/s happen to be nntp.
   *
   * @param aFolder (optional) the folder to delete, if not the selected one
   */
  deleteFolder(aFolder) {
    let folders = aFolder ? [aFolder] : GetSelectedMsgFolders();
    let prompt = Services.prompt;
    for (let folder of folders) {
      // For newsgroups, "delete" means "unsubscribe".
      if (folder.server.type == "nntp" &&
          !folder.getFlag(Ci.nsMsgFolderFlags.Virtual)) {
        MsgUnsubscribe([folder]);
        continue;
      }

      let canDelete = folder.isSpecialFolder(Ci.nsMsgFolderFlags.Junk, false) ?
        CanRenameDeleteJunkMail(folder.URI) : folder.deletable;
      if (!canDelete)
        continue;

      if (folder.getFlag(Ci.nsMsgFolderFlags.Virtual)) {
        let confirmation = gMessengerBundle.getString("confirmSavedSearchDeleteMessage");
        let title = gMessengerBundle.getString("confirmSavedSearchDeleteTitle");
        let buttonTitle = gMessengerBundle.getString("confirmSavedSearchDeleteButton");
        let buttonFlags = prompt.BUTTON_TITLE_IS_STRING * prompt.BUTTON_POS_0 +
                          prompt.BUTTON_TITLE_CANCEL * prompt.BUTTON_POS_1;
        if (prompt.confirmEx(window, title, confirmation, buttonFlags, buttonTitle,
                             "", "", "", {}) != 0) /* the yes button is in position 0 */
          continue;
        if (gCurrentVirtualFolderUri == folder.URI)
          gCurrentVirtualFolderUri = null;
      }

      // We can delete this folder.
      try {
        folder.deleteSelf(msgWindow);
      }
      // Ignore known errors from canceled warning dialogs.
      catch (ex) {
        const NS_MSG_ERROR_COPY_FOLDER_ABORTED = 0x8055001a;
        if (ex.result != NS_MSG_ERROR_COPY_FOLDER_ABORTED) {
          throw ex;
        }
      }
    }
  },

  /**
   * Prompts the user to confirm and empties the trash for the selected folder.
   * The folder and its children are only emptied if it has the proper Trash
   * flag.
   *
   * @param aFolder (optional)  The trash folder to empty. If unspecified or not
   *                            a trash folder, the currently selected server's
   *                            trash folder is used.
   */
  emptyTrash(aFolder) {
    let folder = aFolder || GetSelectedMsgFolders()[0];
    if (!folder.getFlag(Ci.nsMsgFolderFlags.Trash))
      folder = folder.rootFolder.getFolderWithFlags(Ci.nsMsgFolderFlags.Trash);
    if (!folder)
      return;

    if (this._checkConfirmationPrompt("emptyTrash"))
      folder.emptyTrash(msgWindow, null);
  },

  /**
   * Deletes everything (folders and messages) in the selected folder.
   * The folder is only emptied if it has the proper Junk flag.
   *
   * @param aFolder (optional)  The folder to empty. If unspecified, the
   *                            currently selected folder is used, if it
   *                            is junk.
   */
  emptyJunk(aFolder) {
    let folder = aFolder || GetSelectedMsgFolders()[0];

    if (!folder || !folder.getFlag(Ci.nsMsgFolderFlags.Junk))
      return;

    if (!this._checkConfirmationPrompt("emptyJunk"))
      return;

    // Delete any sub-folders this folder might have.
    for (let f of folder.subFolders) {
      folder.propagateDelete(f, true, msgWindow);
    }

    // Now delete the messages.
    folder.deleteMessages([...folder.messages], msgWindow, true, false, null, false);
  },

  /**
   * Compacts either particular folder/s, or selected folders.
   *
   * @param aFolders (optional) the folders to compact, if different than the
   *                            currently selected ones
   */
  compactFolders(aFolders) {
    let folders = aFolders || GetSelectedMsgFolders();
    for (let folder of folders) {
      let isImapFolder = folder.server.type == "imap";
      // Can't compact folders that have just been compacted
      if (!isImapFolder && !folder.expungedBytes)
        return;

      // Reset thread pane for non-imap folders.
      if (!isImapFolder && gDBView && gDBView.msgFolder == folder) {
        this._resetThreadPane();
      }

      folder.compact(null, msgWindow);
    }
  },
  /**
   * Compacts all folders for accounts that the given folders belong
   * to, or all folders for accounts of the currently selected folders.
   *
   * @param aFolders (optional) the folders for whose accounts we should compact
   *                            all folders, if different than the currently
   *                            selected ones
   */
  compactAllFoldersForAccount(aFolders) {
    let folders = aFolders || GetSelectedMsgFolders();
    for (let folder of folders) {
      let isImapFolder = folder.server.type == "imap";
      folder.compactAll(null, msgWindow, isImapFolder ||
                                         folder.server.type == "nntp");
      // Reset thread pane for non-imap folders.
      if (gDBView && !isImapFolder)
        this._resetThreadPane();
    }
  },

  /**
   * Opens the dialog to create a new virtual folder
   *
   * @param aName - the default name for the new folder
   * @param aSearchTerms - the search terms associated with the folder
   * @param aParent - the folder to run the search terms on
   */
  newVirtualFolder(aName, aSearchTerms, aParent) {
    let folder = aParent || GetSelectedMsgFolders()[0];
    if (!folder)
      folder = GetDefaultAccountRootFolder();

    let name = folder.prettyName;
    if (aName)
      name += "-" + aName;

    window.openDialog("chrome://messenger/content/virtualFolderProperties.xul",
                      "", "chrome,modal,centerscreen",
                      {folder: folder, searchTerms: aSearchTems,
                       newFolderName: name});
  },

  /**
   * Opens the dialog to edit the properties for a virtual folder
   *
   * @param aFolder (optional) the folder to edit, if not the selected one
   */
  editVirtualFolder(aFolder) {
    let folder = aFolder || GetSelectedMsgFolders()[0];

    function editVirtualCallback(aURI) {
      // we need to reload the folder if it is the currently loaded folder...
      if (gMsgFolderSelected && aURI == gMsgFolderSelected.URI) {
        // force the folder pane to reload the virtual folder
        gMsgFolderSelected = null;
        FolderPaneSelectionChange();
      }
    }
    window.openDialog("chrome://messenger/content/virtualFolderProperties.xul",
                      "", "chrome,modal,centerscreen",
                      {folder: folder, editExistingFolder: true,
                       onOKCallback: editVirtualCallback,
                       msgWindow:msgWindow});
  },

  /**
   * Opens a search window with the given folder, or the selected one if none
   * is given.
   *
   * @param [aFolder] the folder to open the search window for, if different
   *                  from the selected one
   */
  searchMessages(aFolder) {
    MsgSearchMessages(aFolder || GetSelectedMsgFolders()[0]);
  },

  /**
   * For certain folder commands, the thread pane needs to be invalidated, this
   * takes care of doing so.
   */
  _resetThreadPane() {
    if (gDBView)
      gCurrentlyDisplayedMessage = gDBView.currentlyDisplayedMessage;

    ClearThreadPaneSelection();
    ClearThreadPane();
    ClearMessagePane();
  },

  /**
   * Prompts for confirmation, if the user hasn't already chosen the "don't ask
   * again" option.
   *
   * @param aCommand - the command to prompt for
   */
  _checkConfirmationPrompt(aCommand) {
    const kDontAskAgainPref = "mailnews." + aCommand + ".dontAskAgain";
    // default to ask user if the pref is not set
    if (!Services.prefs.getBoolPref(kDontAskAgainPref, false)) {
      let checkbox = {value: false};
      let choice = Services.prompt.confirmEx(
                     window,
                     gMessengerBundle.getString(aCommand + "Title"),
                     gMessengerBundle.getString(aCommand + "Message"),
                     Services.prompt.STD_YES_NO_BUTTONS,
                     null, null, null,
                     gMessengerBundle.getString(aCommand + "DontAsk"),
                     checkbox);
      if (checkbox.value)
        Services.prefs.setBoolPref(kDontAskAgainPref, true);

      if (choice != 0)
        return false;
    }
    return true;
  },
}
