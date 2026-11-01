/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

const { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  FolderUtils: "resource:///modules/FolderUtils.sys.mjs",
  repairMbox: "resource:///modules/MboxRepair.sys.mjs",
  VirtualFolderHelper: "resource:///modules/VirtualFolderWrapper.sys.mjs",
});
ChromeUtils.defineESModuleGetters(
  lazy,
  {
    SubscribeCommands: "chrome://messenger/content/SubscribeCommands.mjs",
  },
  { global: "current" }
);
ChromeUtils.defineLazyGetter(lazy, "messengerBundle", () =>
  Services.strings.createBundle(
    "chrome://messenger/locale/messenger.properties"
  )
);

/**
 * Whether deleting this folder would move it to the trash rather than destroy
 * it. A folder already inside the trash has nowhere left to go.
 *
 * @param {nsIMsgFolder} folder
 * @returns {boolean}
 */
function deleteMovesToTrash(folder) {
  return (
    !folder.isSpecialFolder(Ci.nsMsgFolderFlags.Trash, true) &&
    serverDeletesToTrash(folder.server)
  );
}

/**
 * Whether this server moves a deleted folder to the trash, rather than
 * destroying it. Only meaningful for a folder that isn't in the trash already.
 *
 * @param {nsIMsgIncomingServer} server
 * @returns {boolean}
 */
function serverDeletesToTrash(server) {
  if (!(server instanceof Ci.nsIImapIncomingServer)) {
    return true;
  }
  if (server.deleteModel != Ci.nsMsgImapDeleteModels.MoveToTrash) {
    return false;
  }
  // The server also has to be willing to keep folders in the trash.
  const trash = server.rootFolder.getFolderWithFlags(Ci.nsMsgFolderFlags.Trash);
  return !!trash?.canCreateSubfolders && server.dualUseFolders;
}

/**
 * Ask the user to confirm deleting a folder, warning them separately if any
 * filters point at it.
 *
 * @param {nsIMsgFolder} folder - The folder about to be deleted.
 * @param {boolean} [movesToTrash] - Whether the folder will end up in the
 *   trash rather than being destroyed. Defaults to asking the folder.
 * @returns {Promise<boolean>} Whether the deletion should go ahead.
 */
async function confirmFolderDeletion(
  folder,
  movesToTrash = deleteMovesToTrash(folder)
) {
  if (folder.isSpecialFolder(Ci.nsMsgFolderFlags.Trash, false)) {
    // Emptying the trash is the user's own doing; don't ask again.
    return true;
  }

  // A folder that is about to be destroyed is always worth confirming. One
  // that only moves to the trash is confirmed unless the user turned that off.
  if (
    !movesToTrash ||
    Services.prefs.getBoolPref("mailnews.confirm.moveFoldersToTrash", true)
  ) {
    const [title, button, message] = await document.l10n.formatValues([
      "folder-delete-title",
      "folder-delete-button",
      {
        id: movesToTrash
          ? "folder-delete-confirm"
          : "folder-delete-no-trash-confirm",
        args: { name: folder.localizedName },
      },
    ]);
    if (
      Services.prompt.confirmEx(
        window.top,
        title,
        message,
        // Default the dialog to "cancel".
        Services.prompt.BUTTON_TITLE_IS_STRING * Services.prompt.BUTTON_POS_0 +
          Services.prompt.BUTTON_TITLE_CANCEL * Services.prompt.BUTTON_POS_1,
        button,
        null,
        null,
        null,
        {}
      )
    ) {
      return false;
    }
  }

  if (folder.matchOrChangeFilterDestination(null, false)) {
    const message = await document.l10n.formatValue(
      "folder-delete-filter-confirm",
      { name: folder.localizedName }
    );
    if (!Services.prompt.confirm(window.top, null, message)) {
      return false;
    }
  }
  return true;
}

/**
 * Tell the user about a folder-level failure, via nsIMsgMailSession so that
 * the front end presents it as a notification. The JS counterpart of the C++
 * AlertFolderError() in nsMsgUtils.
 *
 * @param {nsIMsgFolder} folder - The folder the failure relates to.
 * @param {string} stringName - Name of the messenger.properties string.
 */
function alertFolderError(folder, stringName) {
  MailServices.mailSession.alertUser(
    lazy.messengerBundle.GetStringFromName(stringName),
    folder.server.key,
    false
  );
}

/**
 * Report a failed folder create or rename to the user. The caller is expected
 * to offer its dialog again afterwards, so that the name does not have to be
 * typed a second time.
 *
 * @param {Error} ex - The rejection from createSubfolderAsync/renameAsync.
 * @param {string} fallbackName - Name of the messenger.properties string to
 *   use for failures we have no more specific message for.
 */
function alertFolderNameFailure(ex, fallbackName) {
  console.warn("Folder action FAILED!", ex);
  const stringName =
    ex.result == Cr.NS_MSG_FOLDER_EXISTS ? "folderExists" : fallbackName;
  Services.prompt.alert(
    window.top,
    null,
    lazy.messengerBundle.GetStringFromName(stringName)
  );
}

/**
 * Opens the dialog to create a new sub-folder, and creates it if the user
 * accepts.
 *
 * @param {nsIMsgFolder} folder - The parent for the new subfolder.
 * @param {string} [folderName] - Initial value for the name field. Used to
 *   offer the dialog again after a failure.
 */
function newFolder(folder, folderName = "") {
  // Make sure we actually can create subfolders.
  if (!folder.canCreateSubfolders) {
    // Check if we can create them at the root, otherwise use the default
    // account as root folder.
    const rootMsgFolder = folder.server.rootMsgFolder;
    folder = rootMsgFolder.canCreateSubfolders
      ? rootMsgFolder
      : top.GetDefaultAccountRootFolder();
  }

  let dualUseFolders = true;
  if (folder.server instanceof Ci.nsIImapIncomingServer) {
    dualUseFolders = folder.server.dualUseFolders;
  }

  top.openDialog(
    "chrome://messenger/content/newFolderDialog.xhtml",
    "",
    "chrome,modal,resizable=no,centerscreen",
    {
      folder,
      dualUseFolders,
      name: folderName,
      okCallback: newFolderOkCallback,
    }
  );
}

/**
 * Callback executed when the user selects OK in the create folder dialog.
 *
 * @param {string} subfolderName
 * @param {nsIMsgFolder} parentFolder
 */
async function newFolderOkCallback(subfolderName, parentFolder) {
  if (!subfolderName) {
    return;
  }

  let folder;
  try {
    folder = await parentFolder.createSubfolderAsync(subfolderName);
  } catch (ex) {
    alertFolderNameFailure(ex, "folderCreationFailed");
    newFolder(parentFolder, subfolderName);
    return;
  }

  if (!parentFolder.isServer) {
    // Inherit view/sort/columns from parent folder.
    const parentInfo = parentFolder.msgDatabase.dBFolderInfo;
    const newInfo = folder.msgDatabase.dBFolderInfo;
    newInfo.viewFlags = parentInfo.viewFlags;
    newInfo.sortType = parentInfo.sortType;
    newInfo.sortOrder = parentInfo.sortOrder;
    newInfo.setCharProperty(
      "columnStates",
      parentInfo.getCharProperty("columnStates")
    );
  }
  folder.updateTimestamps(true);
}

/**
 * Opens the dialog to create a new virtual folder
 *
 * @param {string} defaultName - The default name for the new folder.
 * @param {nsIMsgSearchTerm[]} searchTerms - The search terms associated
 *   with the folder.
 * @param {nsIMsgFolder} parentFolder - The folder to run the search terms on.
 */
function newVirtualFolder(defaultName, searchTerms, parentFolder) {
  const folder = parentFolder || top.GetDefaultAccountRootFolder();
  if (!folder) {
    return;
  }

  let newFolderName = folder.localizedName;
  if (defaultName) {
    newFolderName += "-" + defaultName;
  }

  top.openDialog(
    "chrome://messenger/content/virtualFolderProperties.xhtml",
    "",
    "chrome,modal,centerscreen,resizable=yes",
    { folder, searchTerms, newFolderName }
  );
}

/**
 * Opens the dialog to rename a particular folder, and does the renaming if
 * the user clicks OK in that dialog
 *
 * @param {nsIMsgFolder} folder - The folder to rename.
 * @param {string} [folderName] - Initial value for the name field. Used to
 *   offer the dialog again after a failure.
 */
function renameFolder(folder, folderName = folder.localizedName) {
  async function renameCallback(newName, uri) {
    if (uri != folder.URI) {
      console.error("got back a different folder to rename!");
    }

    try {
      await folder.renameAsync(newName);
    } catch (ex) {
      alertFolderNameFailure(ex, "folderRenameFailed");
      renameFolder(folder, newName);
    }
  }

  top.openDialog(
    "chrome://messenger/content/renameFolderDialog.xhtml",
    "",
    "chrome,modal,centerscreen",
    {
      preselectedURI: folder.URI,
      okCallback: renameCallback,
      name: folderName,
    }
  );
}

/**
 * Opens the dialog to edit the properties of a folder.
 *
 * @param {nsIMsgFolder} folder - The folder to edit.
 * @param {string} [tabID] - Id of initial tab to select in the folder
 *   properties dialog.
 */
function editFolder(folder, tabID) {
  if (folder.getFlag(Ci.nsMsgFolderFlags.Virtual)) {
    editVirtualFolder(folder);
    return;
  }

  const title = lazy.messengerBundle.GetStringFromName("folderProperties");

  // If the main window has been closed by the user, make sure that the
  // folder properties dialog is removed as well,
  let folderPropertiesDialog = null;
  const onMainWindowUnload = () => {
    folderPropertiesDialog.close();
  };
  window.addEventListener("unload", onMainWindowUnload);

  // Save the focus and freeze the about3Pane.
  const prevFocusedElement = document.activeElement;
  document.documentElement.setAttribute("inert", "true");

  async function editFolderCallback(newName, oldName) {
    if (newName != oldName) {
      try {
        await folder.renameAsync(newName);
      } catch (ex) {
        alertFolderNameFailure(ex, "folderRenameFailed");
        // Rethrow so the properties dialog stays open for a second attempt.
        throw ex;
      }
    }
  }

  function unloadDialogCallback() {
    // Unfreeze about3Pane and restore focus.
    document.documentElement.removeAttribute("inert");
    prevFocusedElement?.focus();
    window.removeEventListener("unload", onMainWindowUnload);
  }

  folderPropertiesDialog = top.openDialog(
    "chrome://messenger/content/folderProps.xhtml",
    "",
    "chrome,dependent,centerscreen",
    {
      folder,
      serverType: folder.server.type,
      title,
      okCallback: editFolderCallback,
      tabID,
      name: folder.localizedName,
      rebuildSummaryCallback: this.rebuildFolderSummary,
      unloadCallback: unloadDialogCallback,
    }
  );
}

/**
 * Opens the dialog to edit the properties of a folder.
 *
 * @param {nsIMsgFolder} folder
 */
function editVirtualFolder(folder) {
  function editVirtualCallback() {
    if (window.gFolder == folder) {
      window.folderTree.dispatchEvent(new CustomEvent("select"));
    }
  }
  top.openDialog(
    "chrome://messenger/content/virtualFolderProperties.xhtml",
    "",
    "chrome,modal,centerscreen,resizable=yes",
    {
      folder,
      editExistingFolder: true,
      onOKCallback: editVirtualCallback,
    }
  );
}

async function rebuildFolderSummary(folder) {
  if (folder.locked) {
    alertFolderError(folder, "operationFailedFolderBusy");
    return;
  }
  if (folder.supportsOffline) {
    // Remove the offline store, if any.
    await IOUtils.remove(folder.filePath.path, { recursive: true }).catch(
      console.error
    );
  } else if (
    Services.prefs.getCharPref(
      `mail.server.${folder.server.key}.storeContractID`
    ) == "@mozilla.org/msgstore/berkeleystore;1"
  ) {
    // For local mbox, fix classic MacOS line endings.
    try {
      folder.acquireSemaphore(folder, "folderPane.rebuildFolderSummary");
      await lazy.repairMbox(folder.filePath.path);
    } catch (e) {
      console.warn(`Repair mbox FAILED; ${e.message}`);
    } finally {
      folder.releaseSemaphore(folder, "folderPane.rebuildFolderSummary");
    }
  }

  // The following notification causes all DBViewWrappers that include
  // this folder to rebuild their views.
  MailServices.mfn.notifyFolderReindexTriggered(folder);

  folder.msgDatabase.summaryValid = false;
  try {
    let transferInfo = null;
    switch (folder.server.type) {
      case "imap":
        transferInfo = folder.dBTransferInfo.QueryInterface(
          Ci.nsIWritablePropertyBag2
        );
        transferInfo.setPropertyAsACString("numMsgs", "0");
        transferInfo.setPropertyAsACString("numNewMsgs", "0");
        // Reset UID validity so that nsImapMailFolder::UpdateImapMailboxInfo
        // will recognize that a folder repair is in progress.
        transferInfo.setPropertyAsACString("UIDValidity", "-1"); // == kUidUnknown
        break;
      case "ews":
      case "graph":
        // Reset the sync state token so that the next sync will download the
        // message list again.
        folder.setStringProperty("ewsSyncStateToken", "");
        break;
    }

    folder.closeAndBackupFolderDB("");
    if (folder.server.type == "imap" && transferInfo) {
      folder.dBTransferInfo = transferInfo;
    }
  } catch (e) {
    // In a failure, proceed anyway since we're dealing with problems
    folder.ForceDBClosed();
  }
  // The local store was deleted above. It won't be recreated until the user
  // attempts to load a message or the offline sync process creates it.
  // However, folder discovery relies on the existence of the offline store,
  // so to avoid an intermediate state that could cause folder discovery to
  // fail for this folder, we create the local store.
  folder.msgStore.ensureLocalStore(folder);
  folder.updateFolder(true);
}

/**
 * Deletes a folder from its parent. Also handles unsubscribe from newsgroups
 * if the selected folder/s happen to be nntp.
 *
 * @param {nsIMsgFolder} folder - The folder to delete.
 */
async function deleteFolder(folder) {
  // For newsgroups, "delete" means "unsubscribe".
  if (
    folder.server.type == "nntp" &&
    !folder.getFlag(Ci.nsMsgFolderFlags.Virtual)
  ) {
    lazy.SubscribeCommands.MsgUnsubscribe(folder);
    return;
  }

  if (!folder.deletable) {
    throw new Error("Can't delete folder: " + folder.localizedName);
  }

  if (folder.getFlag(Ci.nsMsgFolderFlags.Virtual)) {
    const confirmation = lazy.messengerBundle.GetStringFromName(
      "confirmSavedSearchDeleteMessage"
    );
    const title = lazy.messengerBundle.GetStringFromName(
      "confirmSavedSearchTitle"
    );
    if (
      Services.prompt.confirmEx(
        top,
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
  } else if (!(await confirmFolderDeletion(folder))) {
    return;
  }

  try {
    folder.deleteSelf(true);
  } catch (ex) {
    // Ignore known errors from canceled warning dialogs.
    if (ex.result != Cr.NS_MSG_ERROR_COPY_FOLDER_ABORTED) {
      if (ex.result == Cr.NS_ERROR_FILE_NO_DEVICE_SPACE) {
        // folder could not be deleted due to low space
        // outOfDiskSpace message is too restricted to downloading
        // operation so we created a new generic message, outOfDiskSpaceGeneric
        alertFolderError(folder, "outOfDiskSpaceGeneric");
      } else {
        throw ex;
      }
    }
  }
}

/**
 * Prompts for confirmation, if the user hasn't already chosen the "don't ask
 * again" option.
 *
 * @param {string} aCommand - The command to prompt for.
 * @param {nsIMsgFolder} aFolder - The folder for which the confirmation is requested.
 * @returns {boolean}
 */
async function _checkConfirmationPrompt(aCommand, aFolder) {
  // If no folder was specified, reject the operation.
  if (!aFolder) {
    return false;
  }

  const showPrompt = !Services.prefs.getBoolPref(
    "mailnews." + aCommand + ".dontAskAgain",
    false
  );

  if (!showPrompt) {
    return true;
  }

  const [title, message, check] = await document.l10n.formatValues([
    {
      id: "prompt-empty-folder-title",
      args: { folder: aFolder.localizedName },
    },
    {
      id: "prompt-empty-folder-message",
      args: { folder: aFolder.localizedName },
    },
    { id: "prompt-dont-ask-again" },
  ]);

  const checkbox = { value: false };
  const response =
    Services.prompt.confirmEx(
      top,
      title,
      message,
      Services.prompt.STD_YES_NO_BUTTONS,
      null,
      null,
      null,
      check,
      checkbox
    ) == 0;
  if (checkbox.value) {
    Services.prefs.setBoolPref("mailnews." + aCommand + ".dontAskAgain", true);
  }
  return response;
}

/**
 * Prompts the user to confirm and empties the trash for the selected folder.
 * The folder and its children are only emptied if it has the proper Trash flag.
 *
 * @param {nsIMsgFolder} folder - The trash folder to empty.
 */
async function emptyTrash(folder) {
  if (!folder.getFlag(Ci.nsMsgFolderFlags.Trash)) {
    folder = folder.rootFolder.getFolderWithFlags(Ci.nsMsgFolderFlags.Trash);
  }
  if (!folder) {
    return;
  }

  const confirmEmptyTrash = await _checkConfirmationPrompt(
    "emptyTrash",
    folder
  );
  if (!confirmEmptyTrash) {
    return;
  }

  // Check if this is a top-level smart folder. If so, we're going
  // to empty all the trash folders.
  if (lazy.FolderUtils.isSmartVirtualFolder(folder)) {
    for (const server of MailServices.accounts.allServers) {
      for (const trash of server.rootFolder.getFoldersWithFlags(
        Ci.nsMsgFolderFlags.Trash
      )) {
        trash.emptyTrash(null);
      }
    }
  } else {
    folder.emptyTrash(null);
  }
}

/**
 * Deletes everything (folders and messages) in the selected folder.
 * The folder is only emptied if it has the proper Junk flag.
 *
 * @param {nsIMsgFolder} folder - The folder to empty.
 * @param {boolean} [shouldPrompt=true] - If the user should be prompted.
 */
async function emptyJunk(folder, shouldPrompt = true) {
  if (!folder || !folder.getFlag(Ci.nsMsgFolderFlags.Junk)) {
    return;
  }

  // If prompt is true, ask the user to confirm. Don't want to fire this
  // within recursive calls.
  if (shouldPrompt) {
    const confirmEmptyJunk = await _checkConfirmationPrompt(
      "emptyJunk",
      folder
    );
    if (!confirmEmptyJunk) {
      return;
    }
  }

  if (lazy.FolderUtils.isSmartVirtualFolder(folder)) {
    // Unified junk folder: recurse through each real junk folder without prompting again.
    const wrappedFolder = lazy.VirtualFolderHelper.wrapVirtualFolder(folder);
    for (const searchFolder of wrappedFolder.searchFolders) {
      this.emptyJunk(searchFolder, false);
    }
    return;
  }

  // Delete any subfolders this folder might have
  for (const subFolder of folder.subFolders) {
    folder.propagateDelete(subFolder, true);
  }

  const messages = [...folder.messages];
  if (!messages.length) {
    return;
  }

  // Now delete the messages
  folder.deleteMessages(messages, true, true, false, null, false);
}

/**
 * Compacts the given folder.
 *
 * @param {nsIMsgFolder} folder
 */
function compactFolder(folder) {
  // Can't compact folders that have just been compacted.
  if (folder.server.type != "imap" && !folder.expungedBytes) {
    return;
  }

  folder.compact(null, true);
}

/**
 * Compacts all folders for the account that the given folder belongs to.
 *
 * @param {nsIMsgFolder} folder
 */
function compactAllFoldersForAccount(folder) {
  folder.rootFolder.compactAll(null, true, true);
}

export const FolderCommands = {
  confirmFolderDeletion,
  newFolder,
  newVirtualFolder,
  renameFolder,
  editFolder,
  rebuildFolderSummary,
  deleteFolder,
  emptyTrash,
  emptyJunk,
  compactFolder,
  compactAllFoldersForAccount,
};
