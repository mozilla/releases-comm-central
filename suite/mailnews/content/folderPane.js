/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { folderUtils } =
  ChromeUtils.import("resource:///modules/folderUtils.jsm");
var { iteratorUtils } =
  ChromeUtils.import("resource:///modules/iteratorUtils.jsm");
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
    var preselectedFolder = aParent || GetFirstSelectedMsgFolder();
    var dualUseFolders = true;
    var server = null;
    var folder = null;

    if (preselectedFolder) {
      try {
        server = preselectedFolder.server;
        if (server) {
         folder = getDestinationFolder(preselectedFolder, server);

          var imapServer = server.QueryInterface(Ci.nsIImapIncomingServer);
          if (imapServer)
            dualUseFolders = imapServer.dualUseFolders;
        }
      } catch (e) {
        dump ("Exception: dualUseFolders = true\n");
      }
    }

    //xxx useless param
    function newFolderCallback(aName, aFolder) {
      if (aName)
        folder.createSubfolder(aName, msgWindow);
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

    if (folder.flags & Ci.nsMsgFolderFlags.Virtual) {
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
      let msgDB = msgFolder.msgDatabase;
      msgDB.summaryValid = false;
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

    function renameCallback(aName, aUri) {
      let folderTree = GetFolderTree();
      if (gDBView)
        gCurrentlyDisplayedMessage = gDBView.currentlyDisplayedMessage;

      ClearThreadPane();
      ClearMessagePane();
      folderTree.view.selection.clearSelection();

      try {
        folder.rename(aName, msgWindow);
      }
      catch(e) {
        SelectFolder(folder.URI);  //restore selection
        throw(e); // so that the dialog does not automatically close
        dump ("Exception : RenameFolder \n");
      }
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
    const NS_MSG_ERROR_COPY_FOLDER_ABORTED = 0x8055001a;
    let prompt = Services.prompt;
    for (let folder of folders) {
      let specialFolder = getSpecialFolderString(folder);
      if (specialFolder == "Inbox" || specialFolder == "Trash")
        continue;

      if (folder.flags & Ci.nsMsgFolderFlags.Virtual) {
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
        let array = Cc["@mozilla.org/array;1"]
                      .createInstance(Ci.nsIMutableArray);
        array.appendElement(folder);
        folder.parent.deleteSubFolders(array, msgWindow);
        continue;
      }

      if (isNewsURI(folder.URI)) {
        let unsubscribe = ConfirmUnsubscribe(folder);
        if (unsubscribe)
          UnSubscribe(folder);
      }
      else if (specialFolder == "Junk" ?
               CanRenameDeleteJunkMail(folder.URI) : folder.deletable) {
        // We can delete this folder.
        let array = Cc["@mozilla.org/array;1"]
                      .createInstance(Ci.nsIMutableArray);
        array.appendElement(folder);
        try {
          folder.parent.deleteSubFolders(array, msgWindow);
        }
        // Ignore known errors from canceled warning dialogs.
        catch (ex if (ex.result == NS_MSG_ERROR_COPY_FOLDER_ABORTED)) {}
      }
    }
  },

  /**
   * Prompts the user to confirm and empties the trash for the selected folder
   *
   * @param aFolder (optional)  the trash folder to empty
   * @note Calling this function on a non-trash folder will result in strange
   *       behavior!
   */
  emptyTrash(aFolder) {
    let folder = aFolder || GetSelectedMsgFolders()[0];
    if (this._checkConfirmationPrompt("emptyTrash"))
      folder.emptyTrash(msgWindow, null);
  },

  /**
   * Deletes everything (folders and messages) in this folder
   *
   * @param aFolder (optional)  the folder to empty
   */
  emptyJunk(aFolder) {
    let folder = aFolder || GetSelectedMsgFolders()[0];

    if (!this._checkConfirmationPrompt("emptyJunk"))
      return;

    // Delete any sub-folders this folder might have.
    let iter = folder.subFolders;
    while (iter.hasMoreElements())
      folder.propagateDelete(iter.getNext(), true, msgWindow);

    let children = Cc["@mozilla.org/array;1"]
                     .createInstance(Ci.nsIMutableArray);

    // Now delete the messages.
    iter = folder.messages;
    while (iter.hasMoreElements()) {
      children.appendElement(iter.getNext());
    }
    folder.deleteMessages(children, msgWindow, true, false, null, false);
    children.clear();
  },

  /**
   * Compacts either a particular folder, or all folders
   *
   * @param aCompactAll - whether we should compact all folders
   * @param aFolder (optional) the folder to compact, if different than the
   *                           currently selected one
   */
  compactFolder(aCompactAll, aFolder) {
    let folder = aFolder || GetSelectedMsgFolders()[0];
    let isImapFolder = folder.server.type == "imap";
    if (!isImapFolder) {
      if (folder.expungedBytes > 0) {
        if (gDBView) {
          gCurrentlyDisplayedMessage = gDBView.currentlyDisplayedMessage;
          if (gDBView.msgFolder == folder || aCompactAll) {
            ClearThreadPaneSelection();
            ClearThreadPane();
            ClearMessagePane();
          }
        }
      }
      else {
        if (!aCompactAll) // you have one local folder with no room to compact
          return;
      }
    }
    if (aCompactAll)
      folder.compactAll(null, msgWindow, isImapFolder || folder.server.type == "nntp");
    else
      folder.compact(null, msgWindow);
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
