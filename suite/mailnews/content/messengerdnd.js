/* -*- Mode: Java; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// cache these services
var nsIDragService = Ci.nsIDragService;
var dragService = Cc["@mozilla.org/widget/dragservice;1"]
                    .getService(nsIDragService);

function CanDropOnFolderTree(aIndex, aOrientation)
{
  var dragSession = dragService.getCurrentSession();
  if (!dragSession)
    return false;

  var folderTree = document.getElementById("folderTree");
  var targetFolder = GetFolderResource(folderTree, aIndex)
                       .QueryInterface(Ci.nsIMsgFolder);
  var dt = dragSession.dataTransfer;
  var count = dt.mozItemCount;

  // We only support drag of a single flavor at a time.
  var types = Array.from(dt.mozTypesAt(0));
  if (types.includes("text/x-moz-message"))
  {
    // Only allow dragging onto container.
    if (aOrientation != Ci.nsITreeView.DROP_ON)
      return false;
    // Don't allow drop onto server itself.
    if (targetFolder.isServer)
      return false;
    // Don't allow drop into a folder that cannot take messages.
    if (!targetFolder.canFileMessages)
      return false;
    for (let i = 0; i < count; i++)
    {
      let msgHdr = messenger.msgHdrFromURI(dt.mozGetDataAt("text/x-moz-message", i));
      // Don't allow drop onto original folder.
      if (msgHdr.folder == targetFolder)
        return false;
    }
    return true;
  }
  else if (types.includes("text/x-moz-folder"))
  {
    // Only allow dragging onto container.
    if (aOrientation != Ci.nsITreeView.DROP_ON)
      return false;
    // If cannot create subfolders then don't allow drop here.
    if (!targetFolder.canCreateSubfolders)
      return false;

    for (let i = 0; i < count; i++)
    {
      let folder = dt.mozGetDataAt("text/x-moz-folder", i)
                     .QueryInterface(Ci.nsIMsgFolder);
      // Don't allow to drop on itself.
      if (targetFolder == folder)
        return false;
      // Don't copy within same server.
      if (folder.server == targetFolder.server && dt.dropEffect == "copy")
        return false;
      // Don't allow immediate child to be dropped onto its parent.
      if (targetFolder == folder.parent)
        return false;
      // Don't allow dragging of virtual folders across accounts.
      if ((folder.flags & Ci.nsMsgFolderFlags.Virtual) &&
          folder.server != targetFolder.server)
        return false;
      // Don't allow parent to be dropped on its ancestors.
      if (folder.isAncestorOf(targetFolder))
        return false;
      // If there is a folder that can't be renamed, don't allow it to be
      // dropped if it is not to "Local Folders" or is to the same account.
      if (!folder.canRename && (targetFolder.server.type != "none" ||
                                folder.server == targetFolder.server))
        return false;
    }
    return true;
  }
  else if (types.includes("text/x-moz-newsfolder"))
  {
    // Don't allow dragging onto newsgroup.
    if (aOrientation == Ci.nsITreeView.DROP_ON)
      return false;
    // Don't allow drop onto server itself.
    if (targetFolder.isServer)
      return false;
    for (let i = 0; i < count; i++)
    {
      let folder = dt.mozGetDataAt("text/x-moz-newsfolder", i)
                     .QueryInterface(Ci.nsIMsgFolder);
      // Don't allow dragging newsgroup to other account.
      if (targetFolder.rootFolder != folder.rootFolder)
        return false;
      // Don't allow dragging newsgroup to before/after itself.
      if (targetFolder == folder)
        return false;
      // Don't allow dragging newsgroup to before item after or
      // after item before.
      aIndex += aOrientation;
      if (aIndex < folderTree.view.rowCount) {
        targetFolder = GetFolderResource(folderTree, aIndex)
                         .QueryInterface(Ci.nsIMsgFolder);
        if (targetFolder == folder)
          return false;
      }
    }
    return true;
  }
  else if (types.includes("text/x-moz-url"))
  {
    // Only allow dragging onto container.
    if (aOrientation != Ci.nsITreeView.DROP_ON)
      return false;
    // This is a potential RSS feed to subscribe to
    // and there's only one, so just get the 0th element.
    let url = dt.mozGetDataAt("text/x-moz-url", 0);
    let scheme = Services.io.extractScheme(url);
    if (/^https?$/.test(scheme) && targetFolder.server.type == "rss")
      return true;
  }
  else if (types.includes("application/x-moz-file"))
  {
    // Only allow dragging onto container.
    if (aOrientation != Ci.nsITreeView.DROP_ON)
      return false;
    // Don't allow drop onto server itself.
    if (targetFolder.isServer)
      return false;
    // Don't allow drop into a folder that cannot take messages.
    if (!targetFolder.canFileMessages)
      return false;

    let extFile = dt.mozGetDataAt("application/x-moz-file", 0);
    if (extFile instanceof Ci.nsIFile)
      return extFile.isFile();
  }
  return false;
}

function DropOnFolderTree(aRow, aOrientation)
{
  var dragSession = dragService.getCurrentSession();
  if (!dragSession)
    return;

  var folderTree = document.getElementById("folderTree");
  var targetFolder = GetFolderResource(folderTree, aRow)
                       .QueryInterface(Ci.nsIMsgFolder);
  var dt = dragSession.dataTransfer;
  var count = dt.mozItemCount;

  // We only support drag of a single flavor at a time.
  var types = Array.from(dt.mozTypesAt(0));
  if (types.includes("text/x-moz-folder"))
  {
    const NS_MSG_FOLDER_EXISTS = 0x80550013;
    const NS_MSG_ERROR_COPY_FOLDER_ABORTED = 0x8055001a;

    for (let i = 0; i < count; i++)
    {
      let folder = dt.mozGetDataAt("text/x-moz-folder", i);
      try
      {
        MailServices.copy.copyFolders([folder], targetFolder,
                                      (folder.server == targetFolder.server),
                                      null, msgWindow);
      }
      // Ignore known errors from canceled warning dialogs.
      catch (ex) {
          if (ex.result != NS_MSG_FOLDER_EXISTS &&
              ex.result != NS_MSG_ERROR_COPY_FOLDER_ABORTED) {
              throw ex;
          }
      }
    }
  }
  else if (types.includes("text/x-moz-newsfolder"))
  {
    // Start by getting folders into order.
    let folders = new Array;
    for (let i = 0; i < count; i++) {
      let folder = dt.mozGetDataAt("text/x-moz-newsfolder", i)
                     .QueryInterface(Ci.nsIMsgFolder);
      let folderIndex = EnsureFolderIndex(folderTree.builderView, folder);
      folders[folderIndex] = folder;
    }
    let newsFolder = targetFolder.rootFolder
                                 .QueryInterface(Ci.nsIMsgNewsFolder);
    // When moving down, want to insert last one first.
    // When moving up, want to insert first one first.
    let i = (aOrientation == 1) ? folders.length - 1 : 0;
    while (i >= 0 && i < folders.length) {
      let folder = folders[i];
      if (folder) {
        newsFolder.moveFolder(folder, targetFolder, aOrientation);

        let folderIndex = EnsureFolderIndex(folderTree.builderView, folder);
        folderTree.view.selection.toggleSelect(folderIndex);
        folderTree.treeBoxObject.ensureRowIsVisible(folderIndex);
      }
      i -= aOrientation;
    }
  }
  else if (types.includes("text/x-moz-message"))
  {
    let array = [];
    let sourceFolder;
    for (let i = 0; i < count; i++)
    {
      let msgHdr = messenger.msgHdrFromURI(dt.mozGetDataAt("text/x-moz-message", i));
      if (!sourceFolder)
        sourceFolder = msgHdr.folder;
      array.push(msgHdr);
    }
    let isMove = dragSession.dragAction == nsIDragService.DRAGDROP_ACTION_MOVE;
    if (!sourceFolder.canDeleteMessages)
      isMove = false;

    Services.prefs.setCharPref("mail.last_msg_movecopy_target_uri", targetFolder.URI);
    Services.prefs.setBoolPref("mail.last_msg_movecopy_was_move", isMove);
    // ### ugh, so this won't work with cross-folder views. We would
    // really need to partition the messages by folder.
    MailServices.copy.CopyMessages(sourceFolder, array, targetFolder, isMove,
                                   null, msgWindow, true);
  }
  else if (types.includes("application/x-moz-file"))
  {
    for (let i = 0; i < count; i++)
    {
      let extFile = dt.mozGetDataAt("application/x-moz-file", i)
                      .QueryInterface(Ci.nsIFile);
      if (extFile.isFile() && /\.eml$/i.test(extFile.leafName))
        MailServices.copy.CopyFileMessage(extFile, targetFolder, null, false,
                                          1, "", null, msgWindow);
    }
  }
  else if (types.includes("text/x-moz-url"))
  {
    // This is a potential RSS feed to subscribe to
    // and there's only one, so just get the 0th element.
    let url = dt.mozGetDataAt("text/x-moz-url", 0);
    Cc["@mozilla.org/newsblog-feed-downloader;1"]
      .getService(Ci.nsINewsBlogFeedDownloader)
      .subscribeToFeed(url, targetFolder, msgWindow);
  }
}

function BeginDragFolderTree(aEvent)
{
  if (aEvent.originalTarget.localName != "treechildren")
    return false;

  var folders = GetSelectedMsgFolders();
  folders = folders.filter(function(f) { return !f.isServer; });
  if (!folders.length)
    return false;
  var dataTransfer = aEvent.dataTransfer;
  for (let i in folders) {
    let flavor = folders[i].server.type == "nntp" ? "text/x-moz-newsfolder" :
                                                    "text/x-moz-folder";
    dataTransfer.mozSetDataAt(flavor, folders[i], i);
  }
  dataTransfer.effectAllowed = "copyMove";
  dataTransfer.addElement(aEvent.originalTarget);
  return false;  // don't propagate the event if a drag has begun
}

function BeginDragThreadPane(aEvent)
{
  var messages = gFolderDisplay.selectedMessageUris;
  if (!messages)
    return false;

  // A message can be dragged from one window and dropped on another window.
  // Therefore we setNextMessageAfterDelete() here since there is no major
  // disadvantage, even if it is a copy operation.
  SetNextMessageAfterDelete();
  var fileNames = [];
  var dataTransfer = aEvent.dataTransfer;

  // Dragging multiple messages to desktop does not currently work, pending
  // core fixes for multiple-drop-on-desktop support (bug 513464).
  for (let i = 0; i < messages.length; i++)
  {
    let messageService = messenger.messageServiceFromURI(messages[i]);
    let msgUrls = messageService.getUrlForUri(messages[i]);
    let subject = messageService.messageURIToMsgHdr(messages[i])
                                .mime2DecodedSubject;
    let uniqueFileName = suggestUniqueFileName(subject.substr(0, 120), ".eml",
                                               fileNames);
    fileNames[i] = uniqueFileName;
    dataTransfer.mozSetDataAt("text/x-moz-message", messages[i], i);
    dataTransfer.mozSetDataAt("text/x-moz-url", msgUrls.spec, i);
    dataTransfer.mozSetDataAt("application/x-moz-file-promise-url",
                               msgUrls.spec + "?fileName=" + uniqueFileName, i);
    dataTransfer.mozSetDataAt("application/x-moz-file-promise", null, i);
  }
  aEvent.dataTransfer.effectAllowed = "copyMove";
  aEvent.dataTransfer.addElement(aEvent.originalTarget);

  return false;  // don't propagate the event if a drag has begun
}

function DragOverThreadPane(aEvent)
{
  if (!gMsgFolderSelected.canFileMessages ||
      gMsgFolderSelected.server.type == "rss")
    return;
  let dt = aEvent.dataTransfer;
  dt.effectAllowed = "copy";
  for (let i = 0; i < dt.mozItemCount; i++)
  {
    if (Array.from(dt.mozTypesAt(i)).includes("application/x-moz-file"))
    {
      let extFile = dt.mozGetDataAt("application/x-moz-file", i);
      if (!extFile) {
        return;
      }

      extFile = extFile.QueryInterface(Ci.nsIFile);
      if (extFile.isFile() && /\.eml$/i.test(extFile.leafName))
      {
        aEvent.preventDefault();
        return;
      }
    }
  }
}

function DropOnThreadPane(aEvent)
{
  let dt = aEvent.dataTransfer;
  for (let i = 0; i < dt.mozItemCount; i++)
  {
    let extFile = dt.mozGetDataAt("application/x-moz-file", i);
    if (!extFile) {
      continue;
    }

    extFile = extFile.QueryInterface(Ci.nsIFile);
    if (extFile.isFile() && /\.eml$/i.test(extFile.leafName))
      MailServices.copy.CopyFileMessage(extFile, gMsgFolderSelected, null,
                                        false, 1, "", null, msgWindow);
  }
}
