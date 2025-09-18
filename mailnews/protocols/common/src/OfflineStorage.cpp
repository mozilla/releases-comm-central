/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "OfflineStorage.h"

#include "mozilla/Components.h"
#include "mozilla/Preferences.h"
#include "msgCore.h"
#include "nsIChannel.h"
#include "nsIInputStream.h"
#include "nsIInputStreamPump.h"
#include "nsIMsgDatabase.h"
#include "nsIMsgFolder.h"
#include "nsIMsgFolderNotificationService.h"
#include "nsIMsgHdr.h"
#include "nsIMsgPluggableStore.h"
#include "nsIStreamConverterService.h"
#include "nsIStreamListener.h"
#include "nsMimeTypes.h"
#include "nsMsgMessageFlags.h"
#include "nsMsgUtils.h"
#include "nsNetUtil.h"

using mozilla::Preferences;

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
  if (NS_FAILED(status) &&
      Preferences::GetBool("mail.discard_offline_msg_on_failure", true)) {
    // The streaming failed, discard the offline copy of the message so it can
    // be downloaded again later.
    mFolder->DiscardOfflineMsg(mMsgKey);
  }
  // We no longer need the channel. Clean it up so both it and this listener can
  // be collected.
  mChannel = nullptr;
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

  // Wrap the listener to:
  // a) provide srcChannel as the request, instead of the pump.
  // b) remove the message from the offline store if anything goes
  //    wrong (the idea being that it'll force a re-download from
  //    the server so next time it'll work).
  nsCOMPtr<nsIStreamListener> listenerWrapper = new OfflineMessageReadListener(
      streamListener, srcChannel, msgKey, folder);

  // Set up a stream converter if required.
  nsCOMPtr<nsIStreamListener> consumerListener = listenerWrapper;
  if (convertData) {
    nsCOMPtr<nsIStreamConverterService> streamConverterService =
        mozilla::components::StreamConverter::Service();

    nsCOMPtr<nsIStreamListener> convertedListener;
    nsresult rv = streamConverterService->AsyncConvertData(
        MESSAGE_RFC822, ANY_WILDCARD, listenerWrapper, srcChannel,
        getter_AddRefs(consumerListener));
    NS_ENSURE_SUCCESS(rv, rv);
  }

  MOZ_TRY(pump->AsyncRead(consumerListener));

  // TODO: should we set the pump LoadFlags() and LoadGroup() here, using
  // the values on the original request?
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
  // already a folder with the requested name.
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
  nsCOMPtr<nsIMsgFolderNotificationService> notifier =
      mozilla::components::FolderNotification::Service();
  nsCOMPtr<nsIMsgFolder> newFolder;
  MOZ_TRY(newParentFolder->GetChildNamed(name, getter_AddRefs(newFolder)));

  if (!name.Equals(currentName)) {
    notifier->NotifyFolderRenamed(sourceFolder, newFolder);
  }

  if (currentParent != newParentFolder) {
    notifier->NotifyFolderMoveCopyCompleted(true, sourceFolder,
                                            newParentFolder);
  }

  return NS_OK;
}

nsresult LocalDeleteMessages(
    nsIMsgFolder* folder, const nsTArray<RefPtr<nsIMsgDBHdr>>& messageHeaders) {
  nsresult rv;

  nsTArray<RefPtr<nsIMsgDBHdr>> offlineMessages;
  nsTArray<nsMsgKey> msgKeys;

  // Collect keys for messages which need deletion from our message listing.
  // We also collect a list of messages for which we have a full local copy
  // which needs deletion.
  for (auto&& message : messageHeaders) {
    nsMsgKey msgKey;
    rv = message->GetMessageKey(&msgKey);
    NS_ENSURE_SUCCESS(rv, rv);

    msgKeys.AppendElement(msgKey);

    bool hasOffline;
    rv = folder->HasMsgOffline(msgKey, &hasOffline);
    NS_ENSURE_SUCCESS(rv, rv);

    if (hasOffline) {
      offlineMessages.AppendElement(message);
    }
  }

  // Delete any locally-stored message from the store.
  if (offlineMessages.Length()) {
    nsCOMPtr<nsIMsgPluggableStore> store;
    rv = folder->GetMsgStore(getter_AddRefs(store));
    NS_ENSURE_SUCCESS(rv, rv);

    rv = store->DeleteMessages(offlineMessages);
    NS_ENSURE_SUCCESS(rv, rv);
  }

  // Delete the message headers from the database. If a key in the array is
  // unknown to the database, it's simply ignored.
  nsCOMPtr<nsIMsgDatabase> db;
  rv = folder->GetMsgDatabase(getter_AddRefs(db));
  NS_ENSURE_SUCCESS(rv, rv);

  MOZ_TRY(db->DeleteMessages(msgKeys, nullptr));

  nsCOMPtr<nsIMsgFolderNotificationService> notifier =
      mozilla::components::FolderNotification::Service();
  notifier->NotifyMsgsDeleted(messageHeaders);

  return NS_OK;
}

nsresult LocalCopyMessages(nsIMsgFolder* sourceFolder,
                           nsIMsgFolder* destinationFolder,
                           const nsTArray<RefPtr<nsIMsgDBHdr>>& sourceHeaders,
                           nsTArray<RefPtr<nsIMsgDBHdr>>& newHeaders) {
  nsCOMPtr<nsIMsgPluggableStore> store;
  nsresult rv = sourceFolder->GetMsgStore(getter_AddRefs(store));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgDatabase> database;
  rv = destinationFolder->GetMsgDatabase(getter_AddRefs(database));
  NS_ENSURE_SUCCESS(rv, rv);

  for (auto&& header : sourceHeaders) {
    RefPtr<nsIMsgDBHdr> newHeader;
    rv = LocalCreateHeader(destinationFolder, getter_AddRefs(newHeader));
    NS_ENSURE_SUCCESS(rv, rv);
    nsAutoCString storeToken;
    rv = header->GetStoreToken(storeToken);
    NS_ENSURE_SUCCESS(rv, rv);

    // Copy offline message content if we have it.
    if (!storeToken.IsEmpty()) {
      uint32_t messageSize;
      rv = header->GetOfflineMessageSize(&messageSize);
      NS_ENSURE_SUCCESS(rv, rv);

      nsCOMPtr<nsIInputStream> inputStream;
      rv = store->GetMsgInputStream(sourceFolder, storeToken, messageSize,
                                    getter_AddRefs(inputStream));
      NS_ENSURE_SUCCESS(rv, rv);

      rv = LocalCopyOfflineMessageContent(destinationFolder, inputStream,
                                          newHeader);
      NS_ENSURE_SUCCESS(rv, rv);
    }

    rv = LocalCopyHeaders(header, newHeader, {}, false);
    NS_ENSURE_SUCCESS(rv, rv);

    rv = database->AddNewHdrToDB(newHeader, true);
    NS_ENSURE_SUCCESS(rv, rv);

    rv = database->Commit(nsMsgDBCommitType::kLargeCommit);
    NS_ENSURE_SUCCESS(rv, rv);

    newHeaders.AppendElement(newHeader);
  }

  return NS_OK;
}

nsresult LocalCreateHeader(nsIMsgFolder* destinationFolder,
                           nsIMsgDBHdr** newHeader) {
  // Create a new `nsIMsgDBHdr` in the database for this message.
  nsCOMPtr<nsIMsgDatabase> msgDB;
  nsresult rv = destinationFolder->GetMsgDatabase(getter_AddRefs(msgDB));
  NS_ENSURE_SUCCESS(rv, rv);
  nsCOMPtr<nsIMsgDBHdr> hdr;
  rv = msgDB->CreateNewHdr(nsMsgKey_None, getter_AddRefs(hdr));
  NS_ENSURE_SUCCESS(rv, rv);

  hdr.forget(newHeader);

  return NS_OK;
}

nsresult LocalCopyOfflineMessageContent(nsIMsgFolder* destinationFolder,
                                        nsIInputStream* msgInputStream,
                                        nsIMsgDBHdr* messageHeader) {
  nsCOMPtr<nsIMsgPluggableStore> store;
  nsresult rv = destinationFolder->GetMsgStore(getter_AddRefs(store));
  NS_ENSURE_SUCCESS(rv, rv);

  // Create a new output stream to the folder's message store.
  nsCOMPtr<nsIOutputStream> outStream;
  rv = store->GetNewMsgOutputStream(destinationFolder,
                                    getter_AddRefs(outStream));
  NS_ENSURE_SUCCESS(rv, rv);

  auto outGuard = mozilla::MakeScopeExit(
      [&] { store->DiscardNewMessage(destinationFolder, outStream); });

  uint64_t bytesCopied;
  rv = SyncCopyStream(msgInputStream, outStream, bytesCopied);
  NS_ENSURE_SUCCESS(rv, rv);

  nsAutoCString storeToken;
  rv = store->FinishNewMessage(destinationFolder, outStream, storeToken);
  NS_ENSURE_SUCCESS(rv, rv);
  outGuard.release();

  rv = messageHeader->SetStoreToken(storeToken);
  NS_ENSURE_SUCCESS(rv, rv);

  // Update some of the header's metadata, such as the size, the offline flag
  // and the EWS ID.
  rv = messageHeader->SetMessageSize(bytesCopied);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = messageHeader->SetOfflineMessageSize(bytesCopied);
  NS_ENSURE_SUCCESS(rv, rv);

  uint32_t unused;
  rv = messageHeader->OrFlags(nsMsgMessageFlags::Offline, &unused);
  NS_ENSURE_SUCCESS(rv, rv);
  return NS_OK;
}

nsresult LocalCopyMessage(nsIMsgFolder* destinationFolder,
                          nsIInputStream* msgInputStream,
                          nsIMsgDBHdr** newHeader) {
  nsCOMPtr<nsIMsgDBHdr> hdr;
  nsresult rv = LocalCreateHeader(destinationFolder, getter_AddRefs(hdr));
  NS_ENSURE_SUCCESS(rv, rv);

  rv = LocalCopyOfflineMessageContent(destinationFolder, msgInputStream, hdr);
  NS_ENSURE_SUCCESS(rv, rv);

  // Return the newly-created header so that the consumer can update it with
  // metadata from the message headers before adding it to the message database.
  hdr.forget(newHeader);

  return NS_OK;
}

nsresult LocalCopyHeaders(nsIMsgDBHdr* sourceHeader,
                          nsIMsgDBHdr* destinationHeader,
                          const nsTArray<nsCString>& excludeProperties,
                          bool isMove) {
  // These preferences exist so that extensions can control which properties
  // are preserved in the database when a message is moved or copied. All
  // properties are preserved except those listed in these preferences.
  nsCString dontPreserve;
  if (isMove) {
    Preferences::GetCString("mailnews.database.summary.dontPreserveOnMove",
                            dontPreserve);
  } else {
    Preferences::GetCString("mailnews.database.summary.dontPreserveOnCopy",
                            dontPreserve);
  }

  // We'll add spaces at beginning and end so we can search for
  // space-name-space, in order to avoid accidental partial matches.
  nsCString dontPreserveEx(" "_ns);
  dontPreserveEx.Append(dontPreserve);
  dontPreserveEx.Append(' ');

  // Never preserve the store properties, since message stores are per-folder
  // currently.
  dontPreserveEx.Append(" storeToken msgOffset ");

  for (auto&& excludeProperty : excludeProperties) {
    dontPreserveEx.Append(' ');
    dontPreserveEx.Append(excludeProperty);
    dontPreserveEx.Append(' ');
  }

  nsTArray<nsCString> properties;
  MOZ_TRY(sourceHeader->GetProperties(properties));

  for (const auto& property : properties) {
    nsAutoCString propertyEx(" "_ns);
    propertyEx.Append(property);
    propertyEx.Append(' ');
    if (dontPreserveEx.Find(propertyEx) != kNotFound) {
      continue;
    }

    nsCString propertyValue;
    MOZ_TRY(sourceHeader->GetStringProperty(property.get(), propertyValue));
    MOZ_TRY(
        destinationHeader->SetStringProperty(property.get(), propertyValue));
  }

  uint32_t oldFlags, newFlags;
  MOZ_TRY(sourceHeader->GetFlags(&oldFlags));
  MOZ_TRY(destinationHeader->GetFlags(&newFlags));

  // Regardless of whether flags have been copied to the new header, we want to
  // ensure the values for some of them are carried over from the old one.
  uint32_t carryOver = nsMsgMessageFlags::New | nsMsgMessageFlags::Read |
                       nsMsgMessageFlags::HasRe;

  // The first half of this OR operation represents the values of the flags that
  // are *not* part of `carryOver`, which `parseMsgState` has identified and we
  // want to preserve. The second half represents the values of the flags
  // defined by `carryOver` in the original message, which we want to, well,
  // carry over onto the new header (and overwrite any value the parser has
  // found for them).
  destinationHeader->SetFlags((newFlags & ~carryOver) | (oldFlags & carryOver));

  return NS_OK;
}

nsresult FoldersOnSameServer(nsIMsgFolder* folder1, nsIMsgFolder* folder2,
                             bool* isSameServer) {
  NS_ENSURE_ARG_POINTER(isSameServer);

  nsCOMPtr<nsIMsgIncomingServer> server1;
  nsresult rv = folder1->GetServer(getter_AddRefs(server1));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgIncomingServer> server2;
  rv = folder2->GetServer(getter_AddRefs(server2));
  NS_ENSURE_SUCCESS(rv, rv);

  *isSameServer = server1 == server2;

  return NS_OK;
}
