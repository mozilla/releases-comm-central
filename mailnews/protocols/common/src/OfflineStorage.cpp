/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "OfflineStorage.h"

#include "msgCore.h"
#include "nsIChannel.h"
#include "nsIInputStream.h"
#include "nsIInputStreamPump.h"
#include "nsIMsgFolder.h"
#include "nsIMsgFolderNotificationService.h"
#include "nsIMsgHdr.h"
#include "nsIMsgPluggableStore.h"
#include "nsIStreamConverterService.h"
#include "nsIStreamListener.h"
#include "nsMimeTypes.h"
#include "nsNetUtil.h"

NS_IMPL_ISUPPORTS(OfflineMessageReadListener, nsIStreamListener)

OfflineMessageReadListener::~OfflineMessageReadListener() = default;

NS_IMETHODIMP OfflineMessageReadListener::OnStartRequest(nsIRequest* request) {
  if (mShouldStart) {
    mShouldStart = false;
    return mDestination->OnStartRequest(mChannel);
  }

  return NS_OK;
}

NS_IMETHODIMP OfflineMessageReadListener::OnStopRequest(nsIRequest* request,
                                                        nsresult status) {
  nsresult rv = mDestination->OnStopRequest(mChannel, status);
  if (NS_FAILED(status)) {
    // The streaming failed, discard the offline copy of the message so it can
    // be downloaded again later.
    mFolder->DiscardOfflineMsg(mMsgKey);
  }
  return rv;
}
NS_IMETHODIMP OfflineMessageReadListener::OnDataAvailable(
    nsIRequest* request, nsIInputStream* aInStream, uint64_t aSourceOffset,
    uint32_t aCount) {
  return mDestination->OnDataAvailable(mChannel, aInStream, aSourceOffset,
                                       aCount);
}

// The public-facing helper function.
nsresult AsyncReadMessageFromStore(nsIMsgDBHdr* message,
                                   nsIStreamListener* streamListener,
                                   bool convertData, nsIChannel* srcChannel,
                                   nsIRequest** readRequest) {
  NS_ENSURE_ARG_POINTER(message);
  NS_ENSURE_ARG_POINTER(streamListener);
  NS_ENSURE_ARG_POINTER(srcChannel);

  nsCOMPtr<nsIMsgFolder> folder;
  MOZ_TRY(message->GetFolder(getter_AddRefs(folder)));

  // Make sure the message exists in the offline store.
  nsMsgKey msgKey;
  MOZ_TRY(message->GetMessageKey(&msgKey));

  bool hasOffline;
  MOZ_TRY(folder->HasMsgOffline(msgKey, &hasOffline));

  if (!hasOffline) {
    return NS_ERROR_NOT_AVAILABLE;
  }

  // Stream the message from the store into the stream listener.
  nsCOMPtr<nsIInputStream> msgStream;
  MOZ_TRY(folder->GetMsgInputStream(message, getter_AddRefs(msgStream)));

  nsCOMPtr<nsIInputStreamPump> pump;
  MOZ_TRY(NS_NewInputStreamPump(getter_AddRefs(pump), msgStream.forget()));

  // Set up a stream converter if required.
  nsCOMPtr<nsIStreamListener> consumerListener = streamListener;
  if (convertData) {
    nsCOMPtr<nsIStreamConverterService> streamConverterService =
        do_GetService("@mozilla.org/streamConverters;1");

    nsCOMPtr<nsIStreamListener> convertedListener;
    nsresult rv = streamConverterService->AsyncConvertData(
        MESSAGE_RFC822, ANY_WILDCARD, streamListener, srcChannel,
        getter_AddRefs(consumerListener));
    NS_ENSURE_SUCCESS(rv, rv);
  }

  MOZ_TRY(pump->AsyncRead(consumerListener));

  pump.forget(readRequest);
  return NS_OK;
}

static nsresult MoveFolderRecurse(nsIMsgFolder* sourceFolder,
                                  nsIMsgFolder* newParentFolder,
                                  const nsACString& name,
                                  nsIMsgWindow* msgWindow,
                                  nsIMsgPluggableStore* store) {
  // Do a depth-first traversal of the folder tree to ensure each parent exists
  // before we copy the contents of its children into it, but don't delete until
  // we've copied all children (and their descendents). We start by copying the
  // root folder in the source tree. We don't rely entirely on `CopyFolder`
  // because it doesn't copy subfolders that don't implement the
  // `nsIMsgLocalMailFolder` interface.
  MOZ_TRY(store->CopyFolder(sourceFolder, newParentFolder, false, msgWindow,
                            nullptr, name));

  nsCOMPtr<nsIMsgFolder> newRootFolder;
  MOZ_TRY(newParentFolder->GetChildNamed(name, getter_AddRefs(newRootFolder)));

  newParentFolder->NotifyFolderAdded(newRootFolder);

  // Copy all of the subfolders of the root folder of the source hierarchy.
  nsTArray<RefPtr<nsIMsgFolder>> subFolders;
  sourceFolder->GetSubFolders(subFolders);
  for (auto&& subFolder : subFolders) {
    nsAutoCString subFolderName;
    MOZ_TRY(subFolder->GetName(subFolderName));
    nsCOMPtr<nsIMsgFolder> tmpDestSubfolder;

    // `CopyFolder` for the root of this hierarchy does an incomplete job.  In
    // particular, it copies the folder itself, its data, and its metadata
    // (which includes information about subfolders), but it is not guaranteed
    // to copy the content of the subfolders themselves. Therefore, we delete
    // the subfolder information from the destination hierarchy so we can
    // explicitly copy all of the required data into the correct location.
    // Addressing https://bugzilla.mozilla.org/show_bug.cgi?id=1965379 may
    // change the behavior of `CopyFolder`, in which case this will need to be
    // updated.
    MOZ_TRY(newRootFolder->GetChildNamed(subFolderName,
                                         getter_AddRefs(tmpDestSubfolder)));
    newRootFolder->PropagateDelete(tmpDestSubfolder, true);

    // Now recurse into the subfolder.
    MOZ_TRY(MoveFolderRecurse(subFolder, newRootFolder, subFolderName,
                              msgWindow, store));
    nsCOMPtr<nsIMsgFolder> newSubFolder;
    MOZ_TRY(newRootFolder->GetChildNamed(subFolderName,
                                         getter_AddRefs(newSubFolder)));
    newRootFolder->NotifyFolderAdded(newSubFolder);
  }

  // Now that all of the children (and their descendents) are guaranteed to have
  // been copied, it's safe to delete the original source folder, thus
  // completing the move operation.
  nsCOMPtr<nsIMsgFolder> oldParentFolder;
  MOZ_TRY(sourceFolder->GetParent(getter_AddRefs(oldParentFolder)));
  MOZ_TRY(oldParentFolder->PropagateDelete(sourceFolder, true));

  return NS_OK;
}

nsresult LocalRenameOrReparentFolder(nsIMsgFolder* sourceFolder,
                                     nsIMsgFolder* newParentFolder,
                                     const nsACString& name,
                                     nsIMsgWindow* msgWindow) {
  nsAutoCString currentName;
  nsresult rv = sourceFolder->GetName(currentName);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgFolder> currentParent;
  rv = sourceFolder->GetParent(getter_AddRefs(currentParent));
  NS_ENSURE_SUCCESS(rv, rv);

  // Check if this is a no-op and return success if so.
  if (name.Equals(currentName) && currentParent == newParentFolder) {
    return NS_OK;
  }

  // There will be a conflict if the new parent folder contains a folder
  // with the requested name.
  bool potentialNameConflict;
  MOZ_TRY(newParentFolder->ContainsChildNamed(name, &potentialNameConflict));

  // If we are not moving to a new parent, we need to check that there isn't
  // already a folder with the requested name. The early return checking for a
  // no-op ensures currentName != name in this case.
  if (currentParent == newParentFolder && potentialNameConflict) {
    return NS_MSG_FOLDER_EXISTS;
  }

  // If we are moving to a new parent, we need to check that there isn't
  // alredy a folder with the requested name.
  if ((currentParent != newParentFolder) && potentialNameConflict) {
    return NS_MSG_FOLDER_EXISTS;
  }

  nsCOMPtr<nsIMsgPluggableStore> msgStore;
  rv = sourceFolder->GetMsgStore(getter_AddRefs(msgStore));
  NS_ENSURE_SUCCESS(rv, rv);

  MOZ_TRY(MoveFolderRecurse(sourceFolder, newParentFolder, name, msgWindow,
                            msgStore));

  // Notify listeners of the operation. If the folder was both renamed and moved
  // at the same time, we send a notification for each half of that operation.
  nsCOMPtr<nsIMsgFolderNotificationService> notifier(
      do_GetService("@mozilla.org/messenger/msgnotificationservice;1"));
  if (notifier) {
    nsCOMPtr<nsIMsgFolder> newFolder;
    MOZ_TRY(newParentFolder->GetChildNamed(name, getter_AddRefs(newFolder)));

    if (!name.Equals(currentName)) {
      notifier->NotifyFolderRenamed(sourceFolder, newFolder);
    }

    if (currentParent != newParentFolder) {
      notifier->NotifyFolderMoveCopyCompleted(true, sourceFolder,
                                              newParentFolder);
    }
  }

  return NS_OK;
}
