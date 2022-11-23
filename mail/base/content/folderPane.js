/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Implements a tree of folders. It shows icons depending on folder type
// and other fancy styling.
// This is used in the main folder pane, but also some dialogs that need
// to show a nice list of folders.

/* import-globals-from ../../../mailnews/base/prefs/content/accountUtils.js */
/* import-globals-from commandglue.js */
/* import-globals-from mailWindowOverlay.js */

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

ChromeUtils.defineModuleGetter(
  this,
  "FolderUtils",
  "resource:///modules/FolderUtils.jsm"
);

/**
 * This handles the invocation of most commands dealing with folders, based off
 * of the current selection, or a passed in folder.
 */
var gFolderTreeController = {
  get messengerBundle() {
    delete this.messengerBundle;
    this.messengerBundle = document.getElementById("bundle_messenger");
    return this.messengerBundle;
  },

  /**
   * Opens the dialog to create a new sub-folder, and creates it if the user
   * accepts.
   *
   * @param {?nsIMsgFolder} aParent - The parent for the new subfolder.
   */
  newFolder(aParent) {
    let folder = aParent;

    // Make sure we actually can create subfolders.
    if (!folder.canCreateSubfolders) {
      // Check if we can create them at the root, otherwise use the default
      // account as root folder.
      let rootMsgFolder = folder.server.rootMsgFolder;
      folder = rootMsgFolder.canCreateSubfolders
        ? rootMsgFolder
        : GetDefaultAccountRootFolder();
    }

    if (!folder) {
      return;
    }

    let dualUseFolders = true;
    if (folder.server instanceof Ci.nsIImapIncomingServer) {
      dualUseFolders = folder.server.dualUseFolders;
    }

    function newFolderCallback(aName, aFolder) {
      // createSubfolder can throw an exception, causing the newFolder dialog
      // to not close and wait for another input.
      // TODO: Rewrite this logic and also move the opening of alert dialogs from
      // nsMsgLocalMailFolder::CreateSubfolderInternal to here (bug 831190#c16).
      if (!aName) {
        return;
      }
      aFolder.createSubfolder(aName, msgWindow);
      // Don't call the rebuildAfterChange() here as we'll need to wait for the
      // new folder to be properly created before rebuilding the tree.
    }

    window.openDialog(
      "chrome://messenger/content/newFolderDialog.xhtml",
      "",
      "chrome,modal,resizable=no,centerscreen",
      { folder, dualUseFolders, okCallback: newFolderCallback }
    );
  },

  /**
   * Opens the dialog to edit the properties for a folder
   *
   * @param aFolder (optional) the folder to edit, if not the selected one
   */
  editFolder(aFolder) {
    let folder = aFolder;

    // If this is actually a server, send it off to that controller
    if (folder.isServer) {
      MsgAccountManager(null, folder.server);
      return;
    }

    if (folder.getFlag(Ci.nsMsgFolderFlags.Virtual)) {
      this.editVirtualFolder(folder);
      return;
    }
    let title = this.messengerBundle.getString("folderProperties");

    // xxx useless param
    function editFolderCallback(aNewName, aOldName, aUri) {
      if (aNewName != aOldName) {
        folder.rename(aNewName, msgWindow);
      }
    }

    async function rebuildSummary() {
      if (folder.locked) {
        folder.throwAlertMsg("operationFailedFolderBusy", msgWindow);
        return;
      }
      if (folder.supportsOffline) {
        // Remove the offline store, if any.
        await IOUtils.remove(folder.filePath.path, { recursive: true }).catch(
          Cu.reportError
        );
      }

      // We may be rebuilding a folder that is not the displayed one.
      // TODO: Close any open views of this folder.

      // Send a notification that we are triggering a database rebuild.
      MailServices.mfn.notifyFolderReindexTriggered(folder);

      folder.msgDatabase.summaryValid = false;

      var msgDB = folder.msgDatabase;
      msgDB.summaryValid = false;
      try {
        folder.closeAndBackupFolderDB("");
      } catch (e) {
        // In a failure, proceed anyway since we're dealing with problems
        folder.ForceDBClosed();
      }
      folder.updateFolder(msgWindow);
      // TODO: Reopen closed views.
    }

    window.openDialog(
      "chrome://messenger/content/folderProps.xhtml",
      "",
      "chrome,modal,centerscreen",
      {
        folder,
        serverType: folder.server.type,
        msgWindow,
        title,
        okCallback: editFolderCallback,
        name: folder.prettyName,
        rebuildSummaryCallback: rebuildSummary,
        previewSelectedColorCallback() {},
        clearFolderSelectionCallback() {},
        selectFolderCallback() {},
        updateColorCallback() {},
      }
    );
  },

  /**
   * Opens the dialog to rename a particular folder, and does the renaming if
   * the user clicks OK in that dialog
   *
   * @param aFolder (optional) - the folder to rename, if different than the
   *                            currently selected one
   */
  renameFolder(aFolder) {
    let folder = aFolder;

    function renameCallback(aName, aUri) {
      if (aUri != folder.URI) {
        Cu.reportError("got back a different folder to rename!");
      }

      // Actually do the rename.
      folder.rename(aName, msgWindow);
    }
    window.openDialog(
      "chrome://messenger/content/renameFolderDialog.xhtml",
      "",
      "chrome,modal,centerscreen",
      {
        preselectedURI: folder.URI,
        okCallback: renameCallback,
        name: folder.prettyName,
      }
    );
  },

  /**
   * Deletes a folder from its parent. Also handles unsubscribe from newsgroups
   * if the selected folder/s happen to be nntp.
   *
   * @param aFolder (optional) the folder to delete, if not the selected one
   */
  deleteFolder(aFolder) {
    let folders = [aFolder];
    let folder = folders[0];

    // For newsgroups, "delete" means "unsubscribe".
    if (
      folder.server.type == "nntp" &&
      !folder.getFlag(Ci.nsMsgFolderFlags.Virtual)
    ) {
      MsgUnsubscribe(folders);
      return;
    }

    var canDelete = folder.isSpecialFolder(Ci.nsMsgFolderFlags.Junk, false)
      ? FolderUtils.canRenameDeleteJunkMail(folder.URI)
      : folder.deletable;

    if (!canDelete) {
      throw new Error("Can't delete folder: " + folder.name);
    }

    if (folder.getFlag(Ci.nsMsgFolderFlags.Virtual)) {
      let confirmation = this.messengerBundle.getString(
        "confirmSavedSearchDeleteMessage"
      );
      let title = this.messengerBundle.getString("confirmSavedSearchTitle");
      if (
        Services.prompt.confirmEx(
          window,
          title,
          confirmation,
          Services.prompt.STD_YES_NO_BUTTONS +
            Services.prompt.BUTTON_POS_1_DEFAULT,
          "",
          "",
          "",
          "",
          {}
        ) != 0
      ) {
        /* the yes button is in position 0 */
        return;
      }
    }

    try {
      folder.deleteSelf(msgWindow);
    } catch (ex) {
      // Ignore known errors from canceled warning dialogs.
      const NS_MSG_ERROR_COPY_FOLDER_ABORTED = 0x8055001a;
      if (ex.result != NS_MSG_ERROR_COPY_FOLDER_ABORTED) {
        throw ex;
      }
    }
  },

  /**
   * Prompts the user to confirm and empties the trash for the selected folder.
   * The folder and its children are only emptied if it has the proper Trash flag.
   *
   * @param aFolder (optional) - The trash folder to empty. If unspecified or not
   *                            a trash folder, the currently selected server's
   *                            trash folder is used.
   */
  emptyTrash(aFolder) {
    let folder = aFolder;
    if (!folder.getFlag(Ci.nsMsgFolderFlags.Trash)) {
      folder = folder.rootFolder.getFolderWithFlags(Ci.nsMsgFolderFlags.Trash);
    }
    if (!folder) {
      return;
    }

    if (!this._checkConfirmationPrompt("emptyTrash", folder)) {
      return;
    }

    // Check if this is a top-level smart folder. If so, we're going
    // to empty all the trash folders.
    if (folder.server.hostName == "smart mailboxes" && folder.parent.isServer) {
      for (let server of MailServices.accounts.allServers) {
        for (let trash of server.rootFolder.getFoldersWithFlags(
          Ci.nsMsgFolderFlags.Trash
        )) {
          trash.emptyTrash(msgWindow, null);
        }
      }
    } else {
      folder.emptyTrash(msgWindow, null);
    }
  },

  /**
   * Deletes everything (folders and messages) in the selected folder.
   * The folder is only emptied if it has the proper Junk flag.
   *
   * @param aFolder (optional) - The folder to empty. If unspecified, the currently
   *                            selected folder is used, if it is junk.
   */
  emptyJunk(aFolder) {
    let folder = aFolder;

    if (!folder || !folder.getFlag(Ci.nsMsgFolderFlags.Junk)) {
      return;
    }

    if (!this._checkConfirmationPrompt("emptyJunk", folder)) {
      return;
    }

    // Delete any subfolders this folder might have
    for (let subFolder of folder.subFolders) {
      folder.propagateDelete(subFolder, true, msgWindow);
    }

    // Now delete the messages
    folder.deleteMessages(
      [...folder.messages],
      msgWindow,
      true,
      false,
      null,
      false
    );
  },

  /**
   * Compacts either particular folder/s, or selected folders.
   *
   * @param aFolders (optional) the folders to compact, if different than the
   *                            currently selected ones
   */
  compactFolders(aFolders) {
    let folders = aFolders;
    for (let i = 0; i < folders.length; i++) {
      // Can't compact folders that have just been compacted.
      if (folders[i].server.type != "imap" && !folders[i].expungedBytes) {
        continue;
      }

      folders[i].compact(null, msgWindow);
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
    let folders = aFolders;
    for (let i = 0; i < folders.length; i++) {
      folders[i].compactAll(null, msgWindow);
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
    let folder = aParent || GetDefaultAccountRootFolder();
    if (!folder) {
      return;
    }

    let name = folder.prettyName;
    if (aName) {
      name += "-" + aName;
    }

    window.openDialog(
      "chrome://messenger/content/virtualFolderProperties.xhtml",
      "",
      "chrome,modal,centerscreen",
      {
        folder,
        searchTerms: aSearchTerms,
        newFolderName: name,
      }
    );
  },

  editVirtualFolder(aFolder) {
    let folder = aFolder;

    // xxx should pass the folder object
    function editVirtualCallback(aURI) {
      // TODO: we need to reload the folder if it is the currently loaded folder...
    }
    window.openDialog(
      "chrome://messenger/content/virtualFolderProperties.xhtml",
      "",
      "chrome,modal,centerscreen",
      {
        folder,
        editExistingFolder: true,
        onOKCallback: editVirtualCallback,
        msgWindow,
        previewSelectedColorCallback() {},
        clearFolderSelectionCallback() {},
        selectFolderCallback() {},
        updateColorCallback() {},
      }
    );
  },

  /**
   * Opens a search window with the given folder, or the selected one if none
   * is given.
   *
   * @param [aFolder] the folder to open the search window for, if different
   *                  from the selected one
   */
  searchMessages(aFolder) {
    MsgSearchMessages(aFolder);
  },

  /**
   * Prompts for confirmation, if the user hasn't already chosen the "don't ask
   * again" option.
   *
   * @param aCommand  the command to prompt for
   * @param aFolder   The folder for which the confirmation is requested.
   */
  _checkConfirmationPrompt(aCommand, aFolder) {
    // If no folder was specified, reject the operation.
    if (!aFolder) {
      return false;
    }

    let showPrompt = !Services.prefs.getBoolPref(
      "mailnews." + aCommand + ".dontAskAgain",
      false
    );

    if (showPrompt) {
      let checkbox = { value: false };
      let title = this.messengerBundle.getFormattedString(
        aCommand + "FolderTitle",
        [aFolder.prettyName]
      );
      let msg = this.messengerBundle.getString(aCommand + "FolderMessage");
      let ok =
        Services.prompt.confirmEx(
          window,
          title,
          msg,
          Services.prompt.STD_YES_NO_BUTTONS,
          null,
          null,
          null,
          this.messengerBundle.getString(aCommand + "DontAsk"),
          checkbox
        ) == 0;
      if (checkbox.value) {
        Services.prefs.setBoolPref(
          "mailnews." + aCommand + ".dontAskAgain",
          true
        );
      }
      if (!ok) {
        return false;
      }
    }
    return true;
  },
};
