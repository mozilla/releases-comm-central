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
 * Opens the dialog to create a new sub-folder, and creates it if the user
 * accepts.
 *
 * @param {nsIMsgFolder} folder - The parent for the new subfolder.
 */
function newFolder(folder) {
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
    { folder, dualUseFolders, okCallback: newFolderOkCallback }
  );
}

/**
 * Callback executed when the user selects OK in the create folder dialog.
 *
 * @param {string} subfolderName
 * @param {nsIMsgFolder} parentFolder
 */
async function newFolderOkCallback(subfolderName, parentFolder) {
  // TODO: Rewrite this logic and also move the opening of alert dialogs from
  // nsMsgLocalMailFolder::CreateSubfolderInternal to here (bug 831190#c16).
  if (!subfolderName) {
    return;
  }

  const promiseNewFolder = new Promise(resolve => {
    const listener = {
      folderAdded: addedFolder => {
        if (addedFolder.localizedName == subfolderName) {
          MailServices.mfn.removeListener(listener);
          resolve(addedFolder);
        }
      },
    };
    MailServices.mfn.addListener(
      listener,
      Ci.nsIMsgFolderNotificationService.folderAdded
    );
  });
  parentFolder.createSubfolder(subfolderName, top.msgWindow);
  const folder = await promiseNewFolder;
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
 */
function renameFolder(folder) {
  function renameCallback(newName, uri) {
    if (uri != folder.URI) {
      console.error("got back a different folder to rename!");
    }

    // Actually do the rename.
    folder.rename(newName, top.msgWindow);
  }

  top.openDialog(
    "chrome://messenger/content/renameFolderDialog.xhtml",
    "",
    "chrome,modal,centerscreen",
    {
      preselectedURI: folder.URI,
      okCallback: renameCallback,
      name: folder.localizedName,
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

  function editFolderCallback(newName, oldName) {
    if (newName != oldName) {
      folder.rename(newName, top.msgWindow);
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
      msgWindow: top.msgWindow,
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
      msgWindow: top.msgWindow,
    }
  );
}

async function rebuildFolderSummary(folder) {
  if (folder.locked) {
    folder.throwAlertMsg("operationFailedFolderBusy", top.msgWindow);
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
  folder.updateFolder(top.msgWindow);
}

/**
 * Deletes a folder from its parent. Also handles unsubscribe from newsgroups
 * if the selected folder/s happen to be nntp.
 *
 * @param {nsIMsgFolder} folder - The folder to delete.
 */
function deleteFolder(folder) {
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
  }

  try {
    folder.deleteSelf(top.msgWindow);
  } catch (ex) {
    // Ignore known errors from canceled warning dialogs.
    const NS_MSG_ERROR_COPY_FOLDER_ABORTED = 0x8055001a;
    if (ex.result != NS_MSG_ERROR_COPY_FOLDER_ABORTED) {
      if (ex.result == Cr.NS_ERROR_FILE_NO_DEVICE_SPACE) {
        // folder could not be deleted due to low space
        // outOfDiskSpace message is too restricted to downloading
        // operation so we created a new generic message, outOfDiskSpaceGeneric
        folder.throwAlertMsg("outOfDiskSpaceGeneric", top.msgWindow);
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
  folder.deleteMessages(messages, top.msgWindow, true, false, null, false);
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

  folder.compact(null, top.msgWindow);
}

/**
 * Compacts all folders for the account that the given folder belongs to.
 *
 * @param {nsIMsgFolder} folder
 */
function compactAllFoldersForAccount(folder) {
  folder.rootFolder.compactAll(null, top.msgWindow);
}

export const FolderCommands = {
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
