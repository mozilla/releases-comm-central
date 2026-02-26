/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "EwsFolder.h"

#include "EwsFolderCopyHandler.h"
#include "EwsListeners.h"
#include "EwsMessageCopyHandler.h"
#include "EwsMessageSync.h"
#include "EwsCopyMoveTransaction.h"
#include "IEwsClient.h"
#include "IEwsIncomingServer.h"

#include "ErrorList.h"
#include "FolderCompactor.h"
#include "FolderPopulation.h"
#include "MailNewsTypes.h"
#include "MsgOperationListener.h"
#include "nsAutoSyncState.h"
#include "nsIInputStream.h"
#include "nsIMessenger.h"
#include "mozilla/intl/Localization.h"
#include "nsIMsgCopyService.h"
#include "nsIMsgDBView.h"
#include "nsIMsgDatabase.h"
#include "nsIMsgFilterService.h"
#include "nsIMsgFolderCacheElement.h"
#include "nsIMsgFolderNotificationService.h"
#include "nsIMsgPluggableStore.h"
#include "nsIMsgStatusFeedback.h"
#include "nsISpamSettings.h"
#include "nsITransactionManager.h"
#include "nsIMsgWindow.h"
#include "nsString.h"
#include "nsMsgFolderFlags.h"
#include "nsMsgUtils.h"
#include "nsNetUtil.h"
#include "nsPrintfCString.h"
#include "nsTArray.h"
#include "nsTHashSet.h"
#include "nscore.h"
#include "OfflineStorage.h"
#include "mozilla/Components.h"
#include "mozilla/StaticPrefs_mail.h"
#include "UrlListener.h"

#define kEWSMessageRootURI "ews-message:/"

#define SYNC_STATE_PROPERTY "ewsSyncStateToken"

using namespace mozilla;
using namespace mozilla::StaticPrefs;

extern LazyLogModule FILTERLOGMODULE;  // From nsMsgFilterService.

constexpr auto kEwsIdProperty = "ewsId";

nsresult CreateNewLocalEwsFolder(nsIMsgFolder* parent, const nsACString& ewsId,
                                 const nsACString& folderName,
                                 nsIMsgFolder** createdFolder) {
  nsCOMPtr<nsIMsgPluggableStore> msgStore;
  nsresult rv = parent->GetMsgStore(getter_AddRefs(msgStore));
  NS_ENSURE_SUCCESS(rv, rv);

  // Initialize storage and memory for the new folder and register it with
  // the parent folder.
  nsCOMPtr<nsIMsgFolder> newFolder;
  rv = msgStore->CreateFolder(parent, folderName, getter_AddRefs(newFolder));
  NS_ENSURE_SUCCESS(rv, rv);

  // We've already verified that there's exactly one EWS ID in `ids`.
  rv = newFolder->SetStringProperty(kEwsIdProperty, ewsId);
  NS_ENSURE_SUCCESS(rv, rv);

  // Notify any consumers listening for updates regarding the folder's
  // creation.
  nsCOMPtr<nsIMsgFolderNotificationService> notifier =
      mozilla::components::FolderNotification::Service();
  notifier->NotifyFolderAdded(newFolder);

  rv = parent->NotifyFolderAdded(newFolder);
  NS_ENSURE_SUCCESS(rv, rv);

  newFolder.forget(createdFolder);

  return NS_OK;
}

static nsresult GetEwsIdsForMessageHeaders(
    const nsTArray<RefPtr<nsIMsgDBHdr>>& messageHeaders,
    nsTArray<nsCString>& ewsIds) {
  nsresult rv;
  for (const auto& header : messageHeaders) {
    nsCString ewsId;
    rv = header->GetStringProperty(kEwsIdProperty, ewsId);
    NS_ENSURE_SUCCESS(rv, rv);

    if (ewsId.IsEmpty()) {
      nsMsgKey messageKey;
      rv = header->GetMessageKey(&messageKey);
      NS_ENSURE_SUCCESS(rv, rv);
      NS_WARNING(
          nsPrintfCString("Skipping header without EWS ID. messageKey=%d",
                          messageKey)
              .get());
      continue;
    }

    ewsIds.AppendElement(ewsId);
  }

  return NS_OK;
}

static nsresult NotifyMessageCopyServiceComplete(
    nsIMsgFolder* sourceFolder, nsIMsgFolder* destinationFolder,
    nsresult status) {
  nsCOMPtr<nsIMsgCopyService> copyService =
      mozilla::components::Copy::Service();
  return copyService->NotifyCompletion(sourceFolder, destinationFolder, status);
}

static nsresult HandleMoveError(nsIMsgFolder* sourceFolder,
                                nsIMsgFolder* destinationFolder,
                                nsresult status) {
  NS_ERROR(nsPrintfCString("EWS same-server move error: %s",
                           mozilla::GetStaticErrorName(status))
               .get());
  sourceFolder->NotifyFolderEvent(kDeleteOrMoveMsgFailed);

  return NotifyMessageCopyServiceComplete(sourceFolder, destinationFolder,
                                          status);
}

// Return a scope guard that will ensure the copy service is notified of failure
// when the calling scope exits with the specified `nsresult` in a failed state.
[[nodiscard]] static auto GuardCopyServiceExit(nsIMsgFolder* sourceFolder,
                                               nsIMsgFolder* destinationFolder,
                                               const nsresult& rv) {
  return mozilla::MakeScopeExit([sourceFolder, destinationFolder, &rv]() {
    if (NS_FAILED(rv)) {
      sourceFolder->NotifyFolderEvent(kDeleteOrMoveMsgFailed);
      NotifyMessageCopyServiceComplete(sourceFolder, destinationFolder, rv);
    }
  });
}

/// Return a guard that will ensure the specified `listener` is notified when
/// the calling scope exits.
[[nodiscard]] static auto GuardCopyServiceListener(
    nsIMsgCopyServiceListener* listener, const nsresult& rv) {
  if (listener) {
    listener->OnStartCopy();
  }
  return mozilla::MakeScopeExit([&rv, listener]() {
    if (listener) {
      listener->OnStopCopy(rv);
    }
  });
}

NS_IMPL_ISUPPORTS_INHERITED(EwsFolder, nsMsgDBFolder, IEwsFolder);

EwsFolder::EwsFolder() : mHasLoadedSubfolders(false), mExchangeProtocol("") {}

EwsFolder::~EwsFolder() = default;

nsresult EwsFolder::CreateBaseMessageURI(const nsACString& aURI) {
  nsCOMPtr<nsIURI> folderUri;
  nsresult rv = NS_NewURI(getter_AddRefs(folderUri), aURI.Data());
  NS_ENSURE_SUCCESS(rv, rv);

  nsAutoCString scheme;
  rv = folderUri->GetScheme(scheme);
  NS_ENSURE_SUCCESS(rv, rv);

  mExchangeProtocol = scheme;

  nsAutoCString tailURI(aURI);

  // Remove the scheme and the following `:/'.
  nsAutoCString uriRoot(scheme);
  uriRoot.Append(":/");
  if (tailURI.Find(uriRoot) == 0) {
    tailURI.Cut(0, uriRoot.Length());
  }

  mBaseMessageURI = kEWSMessageRootURI;
  mBaseMessageURI += tailURI;

  return NS_OK;
}

nsresult EwsFolder::GetDatabase() {
  // No default implementation of this, even though it seems to be pretty
  // protocol agnostic. Cribbed from `nsImapMailFolder.cpp`.

  if (!mDatabase) {
    nsresult rv;
    nsCOMPtr<nsIMsgDBService> msgDBService =
        do_GetService("@mozilla.org/msgDatabase/msgDBService;1", &rv);
    NS_ENSURE_SUCCESS(rv, rv);

    // Create the database, blowing it away if it needs to be rebuilt.
    rv = msgDBService->OpenFolderDB(this, false, getter_AddRefs(mDatabase));
    if (NS_FAILED(rv)) {
      rv = msgDBService->CreateNewDB(this, getter_AddRefs(mDatabase));
    }
    NS_ENSURE_SUCCESS(rv, rv);

    UpdateNewMessages();

    if (mAddListener) {
      mDatabase->AddListener(this);
    }

    UpdateSummaryTotals(true);
  }

  return NS_OK;
}

NS_IMETHODIMP EwsFolder::CreateStorageIfMissing(nsIUrlListener* urlListener) {
  NS_WARNING("CreateStorageIfMissing");
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP EwsFolder::CreateSubfolder(const nsACString& aFolderName,
                                         nsIMsgWindow* msgWindow) {
  nsCString ewsId;
  nsresult rv = GetEwsId(ewsId);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<IEwsClient> client;
  rv = GetProtocolClient(getter_AddRefs(client));
  NS_ENSURE_SUCCESS(rv, rv);

  const auto folderName = nsCString(aFolderName);

  RefPtr<EwsSimpleListener> listener = new EwsSimpleListener(
      [self = RefPtr(this), folderName](const nsTArray<nsCString>& ids,
                                        bool useLegacyFallback) {
        NS_ENSURE_TRUE(ids.Length() == 1, NS_ERROR_UNEXPECTED);

        nsCOMPtr<nsIMsgFolder> newFolder;
        return CreateNewLocalEwsFolder(self, ids[0], folderName,
                                       getter_AddRefs(newFolder));
      });

  return client->CreateFolder(listener, ewsId, folderName);
}

NS_IMETHODIMP
EwsFolder::GetDBFolderInfoAndDB(nsIDBFolderInfo** folderInfo,
                                nsIMsgDatabase** database) {
  // No default implementation of this, even though it seems to be pretty
  // protocol agnostic. Cribbed from `nsImapMailFolder.cpp`.

  NS_ENSURE_ARG_POINTER(folderInfo);
  NS_ENSURE_ARG_POINTER(database);

  // Ensure that our cached database handle is initialized.
  nsresult rv = GetDatabase();
  NS_ENSURE_SUCCESS(rv, rv);

  NS_ADDREF(*database = mDatabase);

  return (*database)->GetDBFolderInfo(folderInfo);
}

NS_IMETHODIMP
EwsFolder::GetSupportsOffline(bool* supportsOffline) {
  NS_ENSURE_ARG_POINTER(supportsOffline);
  if (mFlags & nsMsgFolderFlags::Virtual) {
    *supportsOffline = false;
  } else {
    // Non-virtual EWS folders support downloading messages for offline use.
    *supportsOffline = true;
  }
  return NS_OK;
}

NS_IMETHODIMP EwsFolder::GetIncomingServerType(nsACString& aServerType) {
  if (StaticPrefs::mail_graph_enabled()) {
    aServerType.Assign(mExchangeProtocol);
  } else {
    aServerType.AssignLiteral("ews");
  }

  return NS_OK;
}

NS_IMETHODIMP EwsFolder::GetNewMessages(nsIMsgWindow* aWindow,
                                        nsIUrlListener* aListener) {
  // Sync the message list. We don't need to sync the folder tree, because the
  // only likely consumer of this method is `EwsIncomingServer`, which does this
  // before asking folders to sync their message lists.
  return SyncMessages(aWindow, aListener);
}

NS_IMETHODIMP EwsFolder::GetSubFolders(
    nsTArray<RefPtr<nsIMsgFolder>>& aSubFolders) {
  // Lazy discovery of child folders. Should do this up front when root folder
  // is created!
  if (!mHasLoadedSubfolders) {
    nsresult rv = CreateChildrenFromStore();
    NS_ENSURE_SUCCESS(rv, rv);
  }
  return nsMsgDBFolder::GetSubFolders(aSubFolders);
}

// Recursively create child folders by asking the msgStore.
// They won't necessarily be up-to-date with the server, but it's a good
// first stab we can do right now without waiting for the server.
nsresult EwsFolder::CreateChildrenFromStore() {
  MOZ_ASSERT(!mHasLoadedSubfolders);  // Should only be called once.

  nsCOMPtr<nsIMsgPluggableStore> msgStore;
  nsresult rv = GetMsgStore(getter_AddRefs(msgStore));
  NS_ENSURE_SUCCESS(rv, rv);

  // Ask the store which children it thinks we have.
  nsTArray<nsCString> childNames;
  rv = msgStore->DiscoverChildFolders(this, childNames);
  NS_ENSURE_SUCCESS(rv, rv);

  // Have to set this NOW, because folder creation via FLS uses GetSubFolders()
  // to search for existing folders!
  mHasLoadedSubfolders = true;

  for (auto& childName : childNames) {
    // For now, use the base AddSubFolder, _not_ the EwsFolder-specific one.
    // (EwsFolder::AddSubFolder() assumes we're creating a new folder and
    // clobbers state restored from the database (e.g. Offline flag)). This is
    // a bit awful, but AddSubfolder should probably be removed entirely, in
    // favour of directly instantiating the concrete class.
    nsCOMPtr<nsIMsgFolder> child;
    rv = nsMsgDBFolder::AddSubfolder(childName, getter_AddRefs(child));
    NS_ENSURE_SUCCESS(rv, rv);
    // mSubFolders will now include the new child.
  }

  // mSubFolders is now valid for this folder.
  mHasLoadedSubfolders = true;

  for (nsIMsgFolder* child : mSubFolders) {
    // Recurse downward (we _know_ it's an EwsFolder).
    rv = static_cast<EwsFolder*>(child)->CreateChildrenFromStore();
    NS_ENSURE_SUCCESS(rv, rv);
  }
  return NS_OK;
}

NS_IMETHODIMP EwsFolder::RenameSubFolders(nsIMsgWindow* msgWindow,
                                          nsIMsgFolder* oldFolder) {
  NS_WARNING("RenameSubFolders");
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP EwsFolder::MarkMessagesRead(
    const nsTArray<RefPtr<nsIMsgDBHdr>>& messages, bool markRead) {
  nsCOMPtr<IEwsClient> client;
  nsresult rv = GetProtocolClient(getter_AddRefs(client));
  NS_ENSURE_SUCCESS(rv, rv);

  CopyableTArray<nsCString> requestedIds(messages.Length());

  // Get a list of the EWS IDs for the messages to be modified.
  for (const auto& msg : messages) {
    nsAutoCString itemId;
    rv = msg->GetStringProperty(kEwsIdProperty, itemId);
    NS_ENSURE_SUCCESS(rv, rv);
    requestedIds.AppendElement(itemId);
  }

  CopyableTArray<RefPtr<nsIMsgDBHdr>> headersCopy(messages.Length());
  headersCopy.AppendElements(messages);

  RefPtr<EwsSimpleListener> listener = new EwsSimpleListener(
      [self = RefPtr(this), headersCopy = std::move(headersCopy), requestedIds,
       markRead](const nsTArray<nsCString>& ids,
                 bool useLegacyFallback) mutable {
        MOZ_ASSERT(headersCopy.Length() == requestedIds.Length());

        CopyableTArray<RefPtr<nsIMsgDBHdr>> foundHeaders;
        if (requestedIds.Length() == ids.Length()) {
          // Assume all the returned ids are the ones we requested.
          foundHeaders = std::move(headersCopy);
        } else {
          // Not all requested messages were succesfully marked.
          // Find the ones that were.
          nsTHashSet<nsCString> returnedIds(ids.Length());
          for (const auto& id : ids) {
            returnedIds.Insert(id);
          }

          foundHeaders.SetCapacity(ids.Length());
          for (size_t i = 0; i < headersCopy.Length(); ++i) {
            if (returnedIds.Contains(requestedIds[i])) {
              foundHeaders.AppendElement(headersCopy[i]);
            }
          }
        }

        nsresult rv =
            self->nsMsgDBFolder::MarkMessagesRead(foundHeaders, markRead);
        NS_ENSURE_SUCCESS(rv, rv);

        rv = self->GetDatabase();
        if (NS_SUCCEEDED(rv)) {
          self->mDatabase->Commit(nsMsgDBCommitType::kLargeCommit);
        }

        return rv;
      });

  return client->ChangeReadStatus(listener, requestedIds, markRead);
}

NS_IMETHODIMP EwsFolder::MarkAllMessagesRead(nsIMsgWindow* aMsgWindow) {
  nsCOMPtr<IEwsClient> client;
  MOZ_TRY(GetProtocolClient(getter_AddRefs(client)));

  nsCString folderId;
  MOZ_TRY(GetEwsId(folderId));

  nsTArray<nsCString> folderIds{{folderId}};

  RefPtr<EwsSimpleListener> listener = new EwsSimpleListener(
      [self = RefPtr(this), window = RefPtr(aMsgWindow)](
          const nsTArray<nsCString>& ids, bool useLegacyFallback) {
        nsresult rv = self->GetDatabase();
        NS_ENSURE_SUCCESS(rv, rv);

        if (!useLegacyFallback) {
          // server marked read on its end, mark as read locally and set up undo
          nsTArray<nsMsgKey> thoseMarked;
          rv = self->EnableNotifications(allMessageCountNotifications, false);
          NS_ENSURE_SUCCESS(rv, rv);
          rv = self->mDatabase->MarkAllRead(thoseMarked);
          nsresult rv2 =
              self->EnableNotifications(allMessageCountNotifications, true);
          NS_ENSURE_SUCCESS(rv, rv);
          NS_ENSURE_SUCCESS(rv2, rv2);

          if (thoseMarked.Length() > 0) {
            rv = self->mDatabase->Commit(nsMsgDBCommitType::kLargeCommit);
            NS_ENSURE_SUCCESS(rv, rv);

            if (window) {
              rv = self->AddMarkAllReadUndoAction(
                  window, thoseMarked.Elements(), thoseMarked.Length());
              NS_ENSURE_SUCCESS(rv, rv);
            }
          }
        } else {
          // server doesn't support marking folders, find unread messages and do
          // it manually
          nsCOMPtr<nsIMsgEnumerator> hdrs;
          rv = self->mDatabase->EnumerateMessages(getter_AddRefs(hdrs));
          NS_ENSURE_SUCCESS(rv, rv);

          nsTArray<RefPtr<nsIMsgDBHdr>> unread;
          bool hasMore = false;
          while (NS_SUCCEEDED(rv = hdrs->HasMoreElements(&hasMore)) &&
                 hasMore) {
            nsCOMPtr<nsIMsgDBHdr> msg;
            rv = hdrs->GetNext(getter_AddRefs(msg));
            NS_ENSURE_SUCCESS(rv, rv);

            bool isRead;
            rv = msg->GetIsRead(&isRead);
            NS_ENSURE_SUCCESS(rv, rv);

            if (!isRead) {
              unread.AppendElement(msg);
            }
          }

          if (unread.Length() > 0) {
            rv = self->MarkMessagesRead(unread, true);
          }
        }

        return rv;
      });

  return client->ChangeReadStatusAll(listener, folderIds, true, true);
}

NS_IMETHODIMP EwsFolder::UpdateFolder(nsIMsgWindow* aWindow) {
  // Sync the message list.
  // TODO: In the future, we might want to sync the folder hierarchy. Since
  // we already keep the local folder list quite in sync with remote operations,
  // and we already sync it in a couple of occurrences (when getting new
  // messages, performing biff, etc.), it's likely fine to leave this as a
  // future improvement.
  return SyncMessages(aWindow, nullptr);
}

NS_IMETHODIMP EwsFolder::Rename(const nsACString& aNewName,
                                nsIMsgWindow* msgWindow) {
  nsAutoCString currentName;
  nsresult rv = GetName(currentName);
  NS_ENSURE_SUCCESS(rv, rv);

  // If the name hasn't changed, then avoid generating network traffic.
  if (aNewName.Equals(currentName)) {
    return NS_OK;
  }

  bool updatable = false;
  rv = GetCanRename(&updatable);
  NS_ENSURE_SUCCESS(rv, rv);

  if (!updatable) {
    return NS_ERROR_UNEXPECTED;
  }

  nsCOMPtr<IEwsClient> client;
  rv = GetProtocolClient(getter_AddRefs(client));
  NS_ENSURE_SUCCESS(rv, rv);

  nsAutoCString folderId;
  rv = GetEwsId(folderId);
  NS_ENSURE_SUCCESS(rv, rv);

  nsAutoCString syncStateToken;
  rv = GetStringProperty(SYNC_STATE_PROPERTY, syncStateToken);
  NS_ENSURE_SUCCESS(rv, rv);

  const nsCOMPtr<nsIMsgWindow> window = msgWindow;
  const auto newName = nsCString(aNewName);

  RefPtr<EwsSimpleListener> listener = new EwsSimpleListener(
      [self = RefPtr(this), newName, window](const nsTArray<nsCString>& ids,
                                             bool useLegacyFallback) {
        nsCOMPtr<nsIMsgFolder> parentFolder;
        nsresult rv = self->GetParent(getter_AddRefs(parentFolder));
        NS_ENSURE_SUCCESS(rv, rv);

        return LocalRenameOrReparentFolder(self, parentFolder, newName, window);
      });

  return client->UpdateFolder(listener, folderId, aNewName);
}

NS_IMETHODIMP EwsFolder::CopyFileMessage(
    nsIFile* aFile, nsIMsgDBHdr* msgToReplace, bool isDraftOrTemplate,
    uint32_t newMsgFlags, const nsACString& aNewMsgKeywords,
    nsIMsgWindow* msgWindow, nsIMsgCopyServiceListener* copyListener) {
  // Ensure both a source file and a listener have been provided.
  NS_ENSURE_ARG_POINTER(aFile);
  NS_ENSURE_ARG_POINTER(copyListener);

  //  Instantiate a `MessageCopyHandler` for this operation.
  nsCString ewsId;
  nsresult rv = GetEwsId(ewsId);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<IEwsClient> client;
  rv = GetProtocolClient(getter_AddRefs(client));
  NS_ENSURE_SUCCESS(rv, rv);

  RefPtr<MessageCopyHandler> handler = new MessageCopyHandler(
      aFile, this, isDraftOrTemplate, msgWindow, ewsId, client, copyListener);

  // Start copying the message. Once it has finished, `MessageCopyHandler` will
  // take care of sending the relevant notifications.
  rv = handler->StartCopyingNextMessage();
  if (NS_FAILED(rv)) {
    // If setting up the operation has failed, send the relevant notifications
    // before exiting.
    handler->OnCopyCompleted(rv);
  }

  return rv;
}

NS_IMETHODIMP EwsFolder::CopyMessages(
    nsIMsgFolder* aSrcFolder, nsTArray<RefPtr<nsIMsgDBHdr>> const& aSrcHdrs,
    bool aIsMove, nsIMsgWindow* aMsgWindow,
    nsIMsgCopyServiceListener* aCopyListener, bool aIsFolder, bool aAllowUndo) {
  NS_ENSURE_ARG_POINTER(aSrcFolder);

  nsresult rv = NS_OK;

  auto notifyFailureOnExit = GuardCopyServiceExit(aSrcFolder, this, rv);

  // Make sure we're not moving/copying to the root folder for the server,
  // since it cannot hold messages.
  bool isServer;
  MOZ_TRY(GetIsServer(&isServer));
  if (isServer) {
    NS_ERROR("Destination is the root folder. Cannot move/copy here");
    return NS_ERROR_FILE_COPY_OR_MOVE_FAILED;
  }

  bool isSameServer = false;
  rv = FoldersOnSameServer(aSrcFolder, this, &isSameServer);
  NS_ENSURE_SUCCESS(rv, rv);

  if (isSameServer) {
    // Since the folders are on the same (EWS) server, the other folder must
    // also be an EWS Folder.
    nsCOMPtr<IEwsFolder> ewsSourceFolder{do_QueryInterface(aSrcFolder, &rv)};
    NS_ENSURE_SUCCESS(rv, rv);
    const auto undoType =
        aIsMove ? nsIMessenger::eMoveMsg : nsIMessenger::eCopyMsg;
    rv = CopyItemsOnSameServer(ewsSourceFolder, aSrcHdrs, aIsMove, aMsgWindow,
                               aCopyListener, aAllowUndo, undoType, nullptr);
    NS_ENSURE_SUCCESS(rv, rv);
  } else {
    // Cross-server copy or move. Instantiate a `MessageCopyHandler` for this
    // operation.
    nsCString ewsId;
    nsresult rv = GetEwsId(ewsId);
    NS_ENSURE_SUCCESS(rv, rv);

    nsCOMPtr<IEwsClient> client;
    MOZ_TRY(GetProtocolClient(getter_AddRefs(client)));

    RefPtr<MessageCopyHandler> handler =
        new MessageCopyHandler(aSrcFolder, this, aSrcHdrs, aIsMove, aMsgWindow,
                               ewsId, client, aCopyListener);

    // Start the copy for the first message. Once this copy has finished, the
    // `MessageCopyHandler` will automatically start the copy for the next
    // message in line, and so on until every message in `srcHdrs` have been
    // copied.
    rv = handler->StartCopyingNextMessage();
    if (NS_FAILED(rv)) {
      // If setting up the operation has failed, send the relevant notifications
      // before exiting.
      handler->OnCopyCompleted(rv);
    }

    NS_ENSURE_SUCCESS(rv, rv);
  }

  return NS_OK;
}

NS_IMETHODIMP EwsFolder::CopyItemsOnSameServer(
    IEwsFolder* aSrcFolder, nsTArray<RefPtr<nsIMsgDBHdr>> const& aSrcHdrs,
    bool aIsMove, nsIMsgWindow* aMsgWindow,
    nsIMsgCopyServiceListener* aCopyListener, bool aAllowUndo,
    int32_t undoOperationType,
    IEwsFolderOperationListener* aOperationListener) {
  // Same server copy or move, perform operation remotely.
  nsTArray<nsCString> ewsIds;
  nsresult rv = GetEwsIdsForMessageHeaders(aSrcHdrs, ewsIds);
  NS_ENSURE_SUCCESS(rv, rv);

  nsAutoCString destinationFolderId;
  rv = GetEwsId(destinationFolderId);
  NS_ENSURE_SUCCESS(rv, rv);

  const nsCOMPtr<nsIMsgWindow> msgWindow = aMsgWindow;
  const nsCOMPtr<IEwsFolder> srcFolder = aSrcFolder;
  const nsCOMPtr<nsIMsgCopyServiceListener> copyListener = aCopyListener;
  const nsCOMPtr<IEwsFolderOperationListener> operationListener =
      aOperationListener;

  const RefPtr<EwsSimpleFallibleMessageListener> listener =
      new EwsSimpleFallibleMessageListener(
          aSrcHdrs,
          [self = RefPtr(this), srcFolder, msgWindow, aIsMove, copyListener,
           aAllowUndo, operationListener, undoOperationType](
              const nsTArray<RefPtr<nsIMsgDBHdr>>& srcHdrs,
              const nsTArray<nsCString>& ids,
              bool useLegacyFallback) MOZ_CAN_RUN_SCRIPT_BOUNDARY_LAMBDA {
            nsresult rv = NS_OK;

            auto listenerExitGuard = GuardCopyServiceListener(copyListener, rv);

            nsCOMPtr<nsIMsgFolder> genericFolder{
                do_QueryInterface(srcFolder, &rv)};
            NS_ENSURE_SUCCESS(rv, rv);

            nsTArray<RefPtr<nsIMsgDBHdr>> newHeaders;
            if (useLegacyFallback) {
              rv = self->SyncMessages(msgWindow, nullptr);
              NS_ENSURE_SUCCESS(rv, rv);
            } else {
              // The new IDs were returned from the server. In this case,
              // the order of the new IDs will correspond to the order of
              // the input IDs specified in the initial request.
              NS_ENSURE_TRUE(ids.Length() == srcHdrs.Length(),
                             NS_ERROR_UNEXPECTED);

              /// Copy the messages into the destination folder.
              rv = LocalCopyMessages(genericFolder, self, srcHdrs, newHeaders);
              NS_ENSURE_SUCCESS(rv, rv);
              NS_ENSURE_TRUE(newHeaders.Length() == ids.Length(),
                             NS_ERROR_UNEXPECTED);

              // Set the EWS ID property for each of the new headers.
              for (std::size_t i = 0; i < ids.Length(); ++i) {
                newHeaders[i]->SetStringProperty(kEwsIdProperty, ids[i]);
              }

              nsCOMPtr<nsIMsgFolderNotificationService> notifier =
                  mozilla::components::FolderNotification::Service();
              rv = notifier->NotifyMsgsMoveCopyCompleted(aIsMove, srcHdrs, self,
                                                         newHeaders);
              NS_ENSURE_SUCCESS(rv, rv);
            }

            // If required, delete the original items from the source
            // folder.
            if (aIsMove) {
              rv = LocalDeleteMessages(genericFolder, srcHdrs);
              NS_ENSURE_SUCCESS(rv, rv);

              genericFolder->NotifyFolderEvent(kDeleteOrMoveMsgCompleted);
            }

            if (aAllowUndo && msgWindow) {
              nsCOMPtr<nsITransactionManager> transactionManager;
              rv = msgWindow->GetTransactionManager(
                  getter_AddRefs(transactionManager));
              NS_ENSURE_SUCCESS(rv, rv);

              RefPtr<EwsCopyMoveTransaction> undoTransaction =
                  aIsMove ? EwsCopyMoveTransaction::ForMove(
                                srcFolder, self.get(), msgWindow,
                                newHeaders.Clone())
                          : EwsCopyMoveTransaction::ForCopy(
                                srcFolder, self.get(), msgWindow,
                                srcHdrs.Clone(), newHeaders.Clone());
              undoTransaction->SetTransactionType(
                  static_cast<uint32_t>(undoOperationType));
              rv = transactionManager->DoTransaction(undoTransaction);
              NS_ENSURE_SUCCESS(rv, rv);
            }

            if (operationListener) {
              rv = operationListener->OnComplete(newHeaders);
              NS_ENSURE_SUCCESS(rv, rv);
            }

            return NotifyMessageCopyServiceComplete(genericFolder, self, NS_OK);
          },
          [self = RefPtr(this), srcFolder, copyListener](nsresult status) {
            if (copyListener) {
              copyListener->OnStopCopy(status);
            }
            nsresult rv;
            nsCOMPtr<nsIMsgFolder> genericFolder{
                do_QueryInterface(srcFolder, &rv)};
            NS_ENSURE_SUCCESS(rv, rv);
            return HandleMoveError(genericFolder, self, status);
          });

  nsCOMPtr<IEwsClient> client;
  MOZ_TRY(GetProtocolClient(getter_AddRefs(client)));

  if (aIsMove) {
    rv = client->MoveItems(listener, destinationFolderId, ewsIds);
  } else {
    rv = client->CopyItems(listener, destinationFolderId, ewsIds);
  }
  NS_ENSURE_SUCCESS(rv, rv);

  return NS_OK;
}

static nsresult CompleteCopyMoveFolderOperation(
    nsIMsgFolder* srcFolder, nsIMsgFolder* destinationFolder,
    nsIMsgCopyServiceListener* copyListener, const nsACString& name,
    const nsCString& newEwsId) {
  nsresult rv = NS_OK;

  auto listenerExitGuard = GuardCopyServiceListener(copyListener, rv);

  nsCOMPtr<nsIMsgFolder> newFolder;
  rv = destinationFolder->GetChildNamed(name, getter_AddRefs(newFolder));
  NS_ENSURE_SUCCESS(rv, rv);

  if (!newFolder) {
    // Ensure the exit error state is set appropriately for the listener exit
    // guard.
    rv = NS_ERROR_UNEXPECTED;
    return rv;
  }

  newFolder->SetStringProperty(kEwsIdProperty, newEwsId);

  return NotifyMessageCopyServiceComplete(srcFolder, destinationFolder, NS_OK);
}

NS_IMETHODIMP EwsFolder::CopyFolder(nsIMsgFolder* aSrcFolder,
                                    bool aIsMoveFolder,
                                    nsIMsgWindow* aMsgWindow,
                                    nsIMsgCopyServiceListener* aCopyListener) {
  NS_ENSURE_ARG_POINTER(aSrcFolder);

  nsresult rv = NS_OK;

  auto notifyFailureOnExit = GuardCopyServiceExit(aSrcFolder, this, rv);

  nsCOMPtr<IEwsClient> client;
  MOZ_TRY(GetProtocolClient(getter_AddRefs(client)));

  bool isSameServer;
  rv = FoldersOnSameServer(aSrcFolder, this, &isSameServer);
  NS_ENSURE_SUCCESS(rv, rv);

  if (isSameServer) {
    // Same server move or copy.
    rv = CopyFolderOnSameServer(aSrcFolder, aIsMoveFolder, aMsgWindow,
                                aCopyListener);
    NS_ENSURE_SUCCESS(rv, rv);
  } else {
    // Cross-server folder move (or copy). Instantiate a `FolderCopyHandler` for
    // this operation.
    RefPtr<FolderCopyHandler> handler = new FolderCopyHandler(
        aSrcFolder, this, aIsMoveFolder, aMsgWindow, client, aCopyListener);

    rv = handler->CopyNextFolder();
    NS_ENSURE_SUCCESS(rv, rv);
  }

  return NS_OK;
}

NS_IMETHODIMP EwsFolder::CopyFolderOnSameServer(
    nsIMsgFolder* aSourceFolder, bool aIsMoveFolder, nsIMsgWindow* aWindow,
    nsIMsgCopyServiceListener* aCopyListener) {
  nsAutoCString sourceEwsId;
  nsresult rv = aSourceFolder->GetStringProperty(kEwsIdProperty, sourceEwsId);
  NS_ENSURE_SUCCESS(rv, rv);
  if (sourceEwsId.IsEmpty()) {
    NS_ERROR("Expected EWS folder for server but folder has no EWS ID.");
    return NS_ERROR_UNEXPECTED;
  }

  nsAutoCString destinationEwsId;
  rv = GetEwsId(destinationEwsId);
  NS_ENSURE_SUCCESS(rv, rv);

  const nsCOMPtr<nsIMsgFolder> srcFolder = aSourceFolder;
  const nsCOMPtr<nsIMsgWindow> msgWindow = aWindow;
  const nsCOMPtr<nsIMsgCopyServiceListener> copyListener = aCopyListener;

  RefPtr<EwsSimpleFallibleListener> listener = new EwsSimpleFallibleListener(
      [self = RefPtr(this), srcFolder, copyListener, msgWindow, aIsMoveFolder](
          const nsTArray<nsCString>& ids, bool useLegacyFallback) {
        NS_ENSURE_TRUE(ids.Length() == 1, NS_ERROR_UNEXPECTED);
        const auto& newEwsId = ids[0];

        nsAutoCString name;
        nsresult rv = srcFolder->GetName(name);
        NS_ENSURE_SUCCESS(rv, rv);

        // For a move, the EWS IDs of any subfolders or items of the moved
        // folder or subfolder are stable (no known documentation, so this is
        // through observation), so we can move in local storage to avoid a
        // sync. When copying, however, new EWS IDs must be created for any
        // subfolders or items of the copied folder or its subfolders, and we
        // have no way to obtain the new IDs other than performing a sync of
        // the folder hierarchy.
        if (aIsMoveFolder) {
          rv = LocalRenameOrReparentFolder(srcFolder, self, name, msgWindow);
          NS_ENSURE_SUCCESS(rv, rv);
          rv = CompleteCopyMoveFolderOperation(srcFolder, self, copyListener,
                                               name, newEwsId);
          return rv;
        }

        nsCOMPtr<nsIMsgIncomingServer> server;
        rv = self->GetServer(getter_AddRefs(server));
        NS_ENSURE_SUCCESS(rv, rv);

        const nsCOMPtr<IEwsIncomingServer> ewsServer{
            do_QueryInterface(server, &rv)};
        NS_ENSURE_SUCCESS(rv, rv);

        // Limiting granularity of the folder hierarchy update to only the
        // destination folder is not possible due to our current strategy of
        // managing the EWS sync token at the server level for folder updates,
        // so we have to sync the entire hierarchy. In addition, for the
        // copied folder messages to appear, an additional message sync will
        // be required for the newly copied folder. However, to limit the
        // complexity of this callback chain, we don't perform that step here,
        // instead relying on external processes (such as folder
        // expansion/selection) to perform that operation in the future.
        // See https://bugzilla.mozilla.org/show_bug.cgi?id=1980963
        // for the enhancement to improve hierarchy update granularity.
        const RefPtr<EwsSimpleListener> listener = new EwsSimpleListener{
            [self, srcFolder, msgWindow, copyListener, newEwsId, name](
                const auto& ids, bool resyncRequired) {
              nsresult rv = NS_OK;
              rv = CompleteCopyMoveFolderOperation(
                  srcFolder, self, copyListener, name, newEwsId);
              return rv;
            }};
        return ewsServer->SyncFolderHierarchy(listener, msgWindow);
      },
      [self = RefPtr(this), srcFolder, copyListener](nsresult status) {
        if (copyListener) {
          copyListener->OnStopCopy(status);
        }

        return HandleMoveError(srcFolder, self, status);
      });

  nsCOMPtr<IEwsClient> client;
  MOZ_TRY(GetProtocolClient(getter_AddRefs(client)));

  if (aIsMoveFolder) {
    rv = client->MoveFolders(listener, destinationEwsId, {sourceEwsId});
  } else {
    rv = client->CopyFolders(listener, destinationEwsId, {sourceEwsId});
  }
  NS_ENSURE_SUCCESS(rv, rv);

  return NS_OK;
}

nsresult EwsFolder::HandleDeleteOperation(
    bool forceHardDelete, std::function<nsresult()>&& onHardDelete,
    std::function<nsresult(IEwsFolder*)>&& onSoftDelete) {
  using DeleteModel = IEwsIncomingServer::DeleteModel;

  nsresult rv;

  bool isTrashFolder = mFlags & nsMsgFolderFlags::Trash;

  // Check the delete model to see if this should be a permanent delete.
  nsCOMPtr<nsIMsgIncomingServer> server;
  rv = GetServer(getter_AddRefs(server));
  NS_ENSURE_SUCCESS(rv, rv);
  nsCOMPtr<IEwsIncomingServer> ewsServer{do_QueryInterface(server, &rv)};
  NS_ENSURE_SUCCESS(rv, rv);

  DeleteModel deleteModel;
  rv = ewsServer->GetDeleteModel(&deleteModel);

  if (forceHardDelete || isTrashFolder ||
      deleteModel == DeleteModel::PERMANENTLY_DELETE) {
    return onHardDelete();
  }

  // We're moving the messages to trash folder.
  nsCOMPtr<nsIMsgFolder> trashFolder;
  rv = GetTrashFolder(getter_AddRefs(trashFolder));
  NS_ENSURE_SUCCESS(rv, rv);

  if (!trashFolder) {
    return NS_ERROR_UNEXPECTED;
  }

  nsCOMPtr<IEwsFolder> ewsTrashFolder = do_QueryInterface(trashFolder, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  return onSoftDelete(ewsTrashFolder);
}

NS_IMETHODIMP EwsFolder::DeleteMessages(
    nsTArray<RefPtr<nsIMsgDBHdr>> const& aMsgHeaders, nsIMsgWindow* aMsgWindow,
    bool aDeleteStorage, bool aIsMove, nsIMsgCopyServiceListener* aCopyListener,
    bool aAllowUndo) {
  // If we're performing a "hard" delete, or if we're deleting from the trash
  // folder, perform a "real" deletion (i.e. delete the messages from both the
  // storage and the server).
  const auto headers = CopyableTArray<RefPtr<nsIMsgDBHdr>>{aMsgHeaders};
  const auto onHardDelete = [self = RefPtr(this), window = RefPtr(aMsgWindow),
                             copyListener = RefPtr(aCopyListener), headers]() {
    nsCOMPtr<nsIMsgStatusFeedback> feedback = nullptr;
    nsresult rv = NS_OK;
    if (window) {
      // Format the message we'll show the user while we wait for the remote
      // operation to complete.
      RefPtr<intl::Localization> l10n = intl::Localization::Create(
          {"messenger/activityFeedback.ftl"_ns}, true);

      auto l10nArgs = dom::Optional<intl::L10nArgs>();
      l10nArgs.Construct();

      nsCString folderName;
      rv = self->GetLocalizedName(folderName);
      NS_ENSURE_SUCCESS(rv, rv);

      auto numberArg = l10nArgs.Value().Entries().AppendElement();
      numberArg->mKey = "number"_ns;
      numberArg->mValue.SetValue().SetAsUTF8String().Assign(
          nsPrintfCString("%zu", headers.Length()));

      auto folderArg = l10nArgs.Value().Entries().AppendElement();
      folderArg->mKey = "folderName"_ns;
      folderArg->mValue.SetValue().SetAsUTF8String().Assign(folderName);

      ErrorResult error;
      nsCString message;
      l10n->FormatValueSync("deleting-message"_ns, l10nArgs, message, error);

      // Show the formatted message in the status bar.
      rv = window->GetStatusFeedback(getter_AddRefs(feedback));
      NS_ENSURE_SUCCESS(rv, rv);

      rv = feedback->ShowStatusString(NS_ConvertUTF8toUTF16(message));
      NS_ENSURE_SUCCESS(rv, rv);
      rv = feedback->StartMeteors();
      NS_ENSURE_SUCCESS(rv, rv);
    }

    // Define the listener with a success lambda callback, and start the
    // remote operation.
    RefPtr<EwsSimpleMessageListener> listener =
        new EwsSimpleFallibleMessageListener(
            headers,
            [self, copyListener, feedback](
                const nsTArray<RefPtr<nsIMsgDBHdr>>& srcHdrs,
                const nsTArray<nsCString>& ids, bool useLegacyFallback) {
              nsresult rv = NS_OK;
              auto listenerExitGuard =
                  GuardCopyServiceListener(copyListener, rv);

              rv = LocalDeleteMessages(self, srcHdrs);

              if (NS_SUCCEEDED(rv)) {
                self->NotifyFolderEvent(kDeleteOrMoveMsgCompleted);
              } else {
                self->NotifyFolderEvent(kDeleteOrMoveMsgFailed);
              }

              if (feedback) {
                // Reset the status bar.
                return feedback->StopMeteors();
              }

              return NS_OK;
            },

            [self, feedback](nsresult rv) {
              self->NotifyFolderEvent(kDeleteOrMoveMsgFailed);

              if (feedback) {
                return feedback->StopMeteors();
              }

              return NS_OK;
            });

    nsCOMPtr<IEwsClient> client;
    rv = self->GetProtocolClient(getter_AddRefs(client));
    NS_ENSURE_SUCCESS(rv, rv);

    nsTArray<nsCString> ewsIds;
    rv = GetEwsIdsForMessageHeaders(headers, ewsIds);
    NS_ENSURE_SUCCESS(rv, rv);

    return client->DeleteMessages(listener, ewsIds);
  };

  // We're moving the messages to trash folder.
  const auto onSoftDelete =
      [self = RefPtr(this), headers, window = RefPtr(aMsgWindow),
       copyListener = RefPtr(aCopyListener)](IEwsFolder* trashFolder) {
        return trashFolder->CopyItemsOnSameServer(
            self, headers, true, window, copyListener, true,
            nsIMessenger::eDeleteMsg, nullptr);
      };

  return HandleDeleteOperation(aDeleteStorage, std::move(onHardDelete),
                               std::move(onSoftDelete));
}

NS_IMETHODIMP EwsFolder::DeleteSelf(nsIMsgWindow* aWindow) {
  bool deletable = false;
  nsresult rv = GetDeletable(&deletable);
  NS_ENSURE_SUCCESS(rv, rv);

  if (!deletable) {
    return NS_ERROR_UNEXPECTED;
  }

  nsCString folderId;
  rv = GetEwsId(folderId);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgWindow> window = aWindow;

  const auto onHardDelete = [self = RefPtr(this), window, folderId]() {
    RefPtr<EwsSimpleListener> listener = new EwsSimpleListener(
        [self, window](const nsTArray<nsCString>& ids, bool useLegacyFallback) {
          return self->nsMsgDBFolder::DeleteSelf(window);
        });

    nsCOMPtr<IEwsClient> client;
    nsresult rv = self->GetProtocolClient(getter_AddRefs(client));
    NS_ENSURE_SUCCESS(rv, rv);
    return client->DeleteFolder(listener, {folderId});
  };

  const auto onSoftDelete =
      [self = RefPtr(this), window = RefPtr(aWindow)](IEwsFolder* trashFolder) {
        return trashFolder->CopyFolderOnSameServer(self, true, window, nullptr);
      };

  return HandleDeleteOperation(false, std::move(onHardDelete),
                               std::move(onSoftDelete));
}

NS_IMETHODIMP EwsFolder::GetDeletable(bool* deletable) {
  NS_ENSURE_ARG_POINTER(deletable);

  bool isServer;
  nsresult rv = GetIsServer(&isServer);
  NS_ENSURE_SUCCESS(rv, rv);

  *deletable = !(isServer || (mFlags & nsMsgFolderFlags::SpecialUse));
  return NS_OK;
}

NS_IMETHODIMP EwsFolder::EmptyTrash(nsIUrlListener* aListener) {
  // collect info about the trash folder...
  nsCOMPtr<nsIMsgFolder> trashFolder;
  nsresult rv = GetTrashFolder(getter_AddRefs(trashFolder));
  NS_ENSURE_SUCCESS(rv, rv);
  nsCString trashEwsId;
  rv = trashFolder->GetStringProperty(kEwsIdProperty, trashEwsId);
  NS_ENSURE_SUCCESS(rv, rv);
  if (trashEwsId.IsEmpty()) {
    NS_ERROR("EWS Trash folder missing its EWS ID");
    return NS_ERROR_UNEXPECTED;
  }
  nsCOMPtr<nsIMsgDatabase> trashDb;
  rv = trashFolder->GetMsgDatabase(getter_AddRefs(trashDb));
  NS_ENSURE_SUCCESS(rv, rv);
  nsCOMPtr<nsIURI> trashUri;
  if (aListener) {
    rv = FolderUri(trashFolder, getter_AddRefs(trashUri));
    NS_ENSURE_SUCCESS(rv, rv);
  }

  // ... its subfolders...
  CopyableTArray<RefPtr<nsIMsgFolder>> subFolders;
  rv = trashFolder->GetSubFolders(subFolders);
  NS_ENSURE_SUCCESS(rv, rv);
  nsTArray<nsCString> subFolderIds(subFolders.Length());
  for (const auto f : subFolders) {
    nsCString ewsId;
    rv = f->GetStringProperty(kEwsIdProperty, ewsId);
    NS_ENSURE_SUCCESS(rv, rv);
    subFolderIds.AppendElement(ewsId);
  }

  // ... and its messages
  nsTArray<nsMsgKey> msgKeys;
  rv = trashDb->ListAllKeys(msgKeys);
  NS_ENSURE_SUCCESS(rv, rv);
  CopyableTArray<RefPtr<nsIMsgDBHdr>> msgHdrs(msgKeys.Length());
  rv = MsgGetHeadersFromKeys(trashDb, msgKeys, msgHdrs);
  NS_ENSURE_SUCCESS(rv, rv);
  nsTArray<nsCString> messageIds(msgKeys.Length());
  rv = GetEwsIdsForMessageHeaders(msgHdrs, messageIds);
  NS_ENSURE_SUCCESS(rv, rv);

  RefPtr<EwsSimpleListener> listener = new EwsSimpleFallibleListener(
      [self = RefPtr(this), trashFolder, trashUri, msgHdrs,
       aListener = nsCOMPtr(aListener)](const nsTArray<nsCString>& ids,
                                        bool useLegacyFallback) {
        // Once we've reached this callback, all messages and subfolders have
        // been remotely deleted, recursively. Now we do the local operations.
        nsresult rv;
        auto scopeExit = mozilla::MakeScopeExit([&rv, trashUri, aListener]() {
          if (aListener) {
            aListener->OnStopRunningUrl(trashUri, rv);
          }
        });

        // Locally delete the subfolders.
        nsTArray<RefPtr<nsIMsgFolder>> subFolders;
        rv = trashFolder->GetSubFolders(subFolders);
        NS_ENSURE_SUCCESS(rv, rv);

        for (const auto f : subFolders) {
          rv = trashFolder->PropagateDelete(f, true);
          NS_ENSURE_SUCCESS(rv, rv);
        }

        // Locally delete the messages.
        rv = LocalDeleteMessages(trashFolder, msgHdrs);

        return rv;
      },
      [trashUri, aListener = nsCOMPtr(aListener)](nsresult rv) {
        if (aListener) {
          return aListener->OnStopRunningUrl(trashUri, rv);
        }
        return NS_OK;
      });

  nsCOMPtr<IEwsClient> client;
  rv = GetProtocolClient(getter_AddRefs(client));
  NS_ENSURE_SUCCESS(rv, rv);

  rv = client->EmptyFolder(listener, {trashEwsId}, subFolderIds, messageIds);
  if (NS_SUCCEEDED(rv) && aListener) {
    rv = aListener->OnStartRunningUrl(trashUri);
    NS_ENSURE_SUCCESS(rv, rv);
  }
  return rv;
}

NS_IMETHODIMP EwsFolder::CompactAll(nsIUrlListener* aListener,
                                    nsIMsgWindow* aMsgWindow) {
  nsresult rv = NS_OK;
  nsCOMPtr<nsIMsgFolder> rootFolder;
  rv = GetRootFolder(getter_AddRefs(rootFolder));
  NS_ENSURE_SUCCESS(rv, rv);
  nsCOMPtr<nsIMsgPluggableStore> msgStore;
  rv = GetMsgStore(getter_AddRefs(msgStore));
  NS_ENSURE_SUCCESS(rv, rv);
  bool storeSupportsCompaction;
  msgStore->GetSupportsCompaction(&storeSupportsCompaction);
  nsTArray<RefPtr<nsIMsgFolder>> folderArray;
  if (storeSupportsCompaction) {
    nsTArray<RefPtr<nsIMsgFolder>> allDescendants;
    rv = rootFolder->GetDescendants(allDescendants);
    NS_ENSURE_SUCCESS(rv, rv);
    int64_t expungedBytes = 0;
    for (auto folder : allDescendants) {
      // If folder doesn't currently have a DB, expungedBytes might be out of
      // whack. Also the compact might do a folder reparse first, which could
      // change the expungedBytes count (via Expunge flag in
      // X-Mozilla-Status).
      bool hasDB;
      folder->GetDatabaseOpen(&hasDB);

      expungedBytes = 0;
      if (folder) rv = folder->GetExpungedBytes(&expungedBytes);

      NS_ENSURE_SUCCESS(rv, rv);

      if (!hasDB || expungedBytes > 0) folderArray.AppendElement(folder);
    }
  }

  return AsyncCompactFolders(folderArray, aListener, aMsgWindow);
}

NS_IMETHODIMP EwsFolder::Compact(nsIUrlListener* aListener,
                                 nsIMsgWindow* aMsgWindow) {
  return AsyncCompactFolders({this}, aListener, aMsgWindow);
}

nsresult EwsFolder::GetEwsId(nsACString& ewsId) {
  nsresult rv = GetStringProperty(kEwsIdProperty, ewsId);
  NS_ENSURE_SUCCESS(rv, rv);

  if (ewsId.IsEmpty()) {
    NS_ERROR(nsPrintfCString(
                 "folder %s initialized as EWS folder, but has no EWS ID",
                 URI().get())
                 .get());
    return NS_ERROR_UNEXPECTED;
  }

  return NS_OK;
}

nsresult EwsFolder::GetProtocolClient(IEwsClient** ewsClient) {
  nsCOMPtr<nsIMsgIncomingServer> server;
  nsresult rv = GetServer(getter_AddRefs(server));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<IEwsIncomingServer> ewsServer(do_QueryInterface(server));

  return ewsServer->GetProtocolClient(ewsClient);
}

nsresult EwsFolder::GetTrashFolder(nsIMsgFolder** result) {
  NS_ENSURE_ARG_POINTER(result);
  nsCOMPtr<nsIMsgFolder> rootFolder;

  nsresult rv = GetRootFolder(getter_AddRefs(rootFolder));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgFolder> trashFolder;
  rootFolder->GetFolderWithFlags(nsMsgFolderFlags::Trash,
                                 getter_AddRefs(trashFolder));

  // `GetFolderWithFlags()` returns NS_OK even if no folder was found, so we
  // need to check whether it returned it returned a valid folder.
  if (!trashFolder) {
    return NS_ERROR_FAILURE;
  }

  trashFolder.forget(result);

  return NS_OK;
}

nsresult EwsFolder::SyncMessages(nsIMsgWindow* window,
                                 nsIUrlListener* urlListener) {
  nsresult rv;
  nsCOMPtr<nsIMsgStatusFeedback> feedback = nullptr;
  if (window) {
    // Get ready to show a message in the status bar.
    rv = window->GetStatusFeedback(getter_AddRefs(feedback));
    NS_ENSURE_SUCCESS(rv, rv);
  }

  nsCOMPtr<nsIUrlListener> syncUrlListener = urlListener;
  nsCOMPtr<nsIURI> folderUri;
  rv = FolderUri(this, getter_AddRefs(folderUri));
  NS_ENSURE_SUCCESS(rv, rv);

  auto onSyncStart = [self = RefPtr(this), syncUrlListener, folderUri,
                      feedback]() {
    if (syncUrlListener) {
      syncUrlListener->OnStartRunningUrl(folderUri);
    }

    // The window might not be attached to an `nsIMsgStatusFeedback`. This
    // typically happens with new profiles, because the `nsIMsgStatusFeedback`
    // is only added after the first account is added. Technically this should
    // also run after the account is added, but we're might be racing against
    // the `nsIMsgStatusFeedback` being added to the message window, in which
    // case it might still be null by the time this runs.
    if (feedback) {
      // Format the message we'll show the user while we wait for the remote
      // operation to complete.
      RefPtr<intl::Localization> l10n = intl::Localization::Create(
          {"messenger/activityFeedback.ftl"_ns}, true);

      auto l10nArgs = dom::Optional<intl::L10nArgs>();
      l10nArgs.Construct();

      nsCString folderName;
      nsresult rv = self->GetLocalizedName(folderName);
      if (NS_SUCCEEDED(rv)) {
        auto idArg = l10nArgs.Value().Entries().AppendElement();
        idArg->mKey = "folderName"_ns;
        idArg->mValue.SetValue().SetAsUTF8String().Assign(folderName);

        ErrorResult error;
        nsCString message;
        l10n->FormatValueSync("looking-for-messages-folder"_ns, l10nArgs,
                              message, error);

        feedback->ShowStatusString(NS_ConvertUTF8toUTF16(message));
        feedback->StartMeteors();
      }
    }
  };

  auto onSyncStop = [self = RefPtr(this), syncUrlListener, folderUri, feedback](
                        nsresult status, nsTArray<nsMsgKey> const& newKeys) {
    // Even if the operation failed, there may be some messages to deal with.
    if (!newKeys.IsEmpty()) {
      self->SetHasNewMessages(true);
      self->SetNumNewMessages(static_cast<int32_t>(newKeys.Length()));
      self->SetBiffState(nsIMsgFolder::nsMsgBiffState_NewMail);

      // Mark them as requiring filtering.
      for (nsMsgKey key : newKeys) {
        static_cast<void>(self->mRequireFiltering.put(key));
      }

      // We might be able to apply filtering right away (if the full message
      // body isn't required).
      self->PerformFiltering();

      // Tell the AutoSyncState about the newly-added messages,
      // to queue them for potential offline download.
      self->AutoSyncState()->OnNewHeaderFetchCompleted(newKeys);
    }

    self->NotifyFolderEvent(kFolderLoaded);

    // Tell the caller how things went.
    if (syncUrlListener) {
      syncUrlListener->OnStopRunningUrl(folderUri, status);
    }

    // Clear up the GUI.
    if (feedback) {
      feedback->StopMeteors();  // Also clears status message.
    }
  };

  return EwsPerformMessageSync(this, onSyncStart, onSyncStop);
}

nsAutoSyncState* EwsFolder::AutoSyncState() {
  if (!mAutoSyncState) {
    // Lazy creation.
    mAutoSyncState = new nsAutoSyncState(this);
  }
  return mAutoSyncState;
}

NS_IMETHODIMP EwsFolder::GetAutoSyncStateObj(
    nsIAutoSyncState** autoSyncStateObj) {
  NS_ENSURE_ARG_POINTER(autoSyncStateObj);
  NS_IF_ADDREF(*autoSyncStateObj = AutoSyncState());
  return NS_OK;
}

NS_IMETHODIMP EwsFolder::HandleDownloadedMessages() {
  // There may be filters that were waiting for the full message.
  PerformFiltering();
  return NS_OK;
}

nsresult EwsFolder::GetHdrForEwsId(const nsACString& ewsId, nsIMsgDBHdr** hdr) {
  nsCOMPtr<nsIMsgDatabase> db;
  nsresult rv = GetMsgDatabase(getter_AddRefs(db));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgDBHdr> existingHdr;
  rv = db->GetMsgHdrForEwsItemID(ewsId, getter_AddRefs(existingHdr));
  NS_ENSURE_SUCCESS(rv, rv);

  // Make sure we managed to get a header from the database.
  if (!existingHdr) {
    return NS_ERROR_NOT_AVAILABLE;
  }

  existingHdr.forget(hdr);

  return NS_OK;
}

// Apply filtering to as many of the mRequireFiltering messages as we can.
nsresult EwsFolder::PerformFiltering() {
  nsresult rv;

  // Do the filters require full message body?
  bool incomingFiltersRequireBody;
  {
    nsCOMPtr<nsIMsgFilterList> filterList;
    rv = GetFilterList(nullptr, getter_AddRefs(filterList));
    NS_ENSURE_SUCCESS(rv, rv);
    rv = filterList->DoFiltersNeedMessageBody(nsMsgFilterType::Incoming,
                                              &incomingFiltersRequireBody);
    NS_ENSURE_SUCCESS(rv, rv);
  }

  // Collect up the messages we can filter now.
  nsTArray<RefPtr<nsIMsgDBHdr>> targetMsgs(mRequireFiltering.count());
  for (auto it = mRequireFiltering.modIter(); !it.done(); it.next()) {
    nsCOMPtr<nsIMsgDBHdr> msg;
    GetMessageHeader(it.get(), getter_AddRefs(msg));
    if (!msg) {
      // The message could have have been manually deleted or something.
      it.remove();
      continue;
    }
    if (incomingFiltersRequireBody) {
      uint32_t flags;
      msg->GetFlags(&flags);
      if (!(flags & nsMsgMessageFlags::Offline)) {
        // We need the full message, but it's not (yet) available.
        // Leave for next time.
        continue;
      }
    }
    targetMsgs.AppendElement(msg);
    it.remove();
  }

  MOZ_LOG_FMT(FILTERLOGMODULE, LogLevel::Info,
              "EWS PerformFiltering(): can filter {} messages now, leaving {} "
              "(incomingFiltersRequireBody={})",
              targetMsgs.Length(), mRequireFiltering.count(),
              incomingFiltersRequireBody);

  if (!targetMsgs.IsEmpty()) {
    // Once the filtering is complete, `doneFunc` will run.
    auto doneFunc = [self = RefPtr(this)](
                        nsresult status,
                        const nsTArray<RefPtr<nsIMsgDBHdr>>& msgs) -> nsresult {
      nsresult rv = self->NotifyFolderEvent(kFiltersApplied);
      NS_ENSURE_SUCCESS(rv, rv);
      // Now run the spam classification.
      // This will invoke OnMessageClassified().
      // TODO:
      // CallFilterPlugins() should take a
      // nsIJunkMailClassificationListener param instead of relying on
      // folder inheritance.
      bool filtersRun;
      rv = self->CallFilterPlugins(nullptr, &filtersRun);
      NS_ENSURE_SUCCESS(rv, rv);

      return NS_OK;
    };

    // Run the filters upon the target messages. Note, by this time, the
    // messages have already been added to the folders database.
    // This means we can use ApplyFilters, which handles all the filter
    // actions - it uses the protocol-agnostic code, as if the filters
    // had been manually triggered ("run filters now"). This is in
    // contrast to POP3 and IMAP, which run the filters _before_ adding
    // the messages to the database, but then have to implement all
    // their own filter actions.
    nsCOMPtr<nsIMsgFilterService> filterService(
        mozilla::components::Filter::Service());
    rv = filterService->ApplyFilters(
        nsMsgFilterType::Inbox, targetMsgs, this, nullptr /*window*/,
        new MsgOperationListener(targetMsgs, doneFunc));
    NS_ENSURE_SUCCESS(rv, rv);
  }

  return NS_OK;
}

NS_IMETHODIMP EwsFolder::AddSubfolder(const nsACString& folderName,
                                      nsIMsgFolder** newFolder) {
  NS_ENSURE_ARG_POINTER(newFolder);

  nsresult rv = nsMsgDBFolder::AddSubfolder(folderName, newFolder);
  NS_ENSURE_SUCCESS(rv, rv);

  // Check to see if we have a trash folder path saved in prefs.
  nsCOMPtr<nsIMsgIncomingServer> server;
  rv = GetServer(getter_AddRefs(server));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<IEwsIncomingServer> ewsServer{do_QueryInterface(server, &rv)};
  NS_ENSURE_SUCCESS(rv, rv);

  nsAutoCString trashFolderPath;
  rv = ewsServer->GetTrashFolderPath(trashFolderPath);
  NS_ENSURE_SUCCESS(rv, rv);

  nsAutoCString folderPath;
  rv = FolderPathInServer(*newFolder, folderPath);
  NS_ENSURE_SUCCESS(rv, rv);

  uint32_t flags;
  rv = (*newFolder)->GetFlags(&flags);
  NS_ENSURE_SUCCESS(rv, rv);

  if (trashFolderPath.IsEmpty()) {
    // If we don't have a trash folder preference value set, and this folder
    // has the trash flag set, set the preference value to this folder's path.
    if (flags & nsMsgFolderFlags::Trash) {
      rv = ewsServer->SetTrashFolderPath(folderPath);
      NS_ENSURE_SUCCESS(rv, rv);
    }
  } else if (trashFolderPath.Equals(folderPath)) {
    // If the new folder path matches the trash folder path, ensure the trash
    // folder flag is set for that folder.
    flags |= nsMsgFolderFlags::Trash;
  } else {
    // The trash folder is set and is not equal to this folder. Clear the
    // trash folder flag.
    flags &= ~nsMsgFolderFlags::Trash;
  }

  // Should this folder download messages for offline?
  {
    bool setNewFoldersForOffline = false;
    rv = server->GetOfflineDownload(&setNewFoldersForOffline);
    if (NS_SUCCEEDED(rv) && setNewFoldersForOffline) {
      flags |= nsMsgFolderFlags::Offline;
    }
  }

  rv = (*newFolder)->SetFlags(flags);
  NS_ENSURE_SUCCESS(rv, rv);

  return NS_OK;
}

// This callback is invoked for spam handling, by CallFilterPlugins().
// Really, CallFilterPlugins should be altered to take a listener rather than
// relying on the folder implementation... but for now, this implementation
// is pure cut&paste from nsLocalMailFolder. The IMAP one is similar, but
// coalesces server move operations.
//
// This function is called once per message, then once again with
// an empty URI to mark the end of the batch.
// It accumulates the messages to move to the junk folder using the
// mSpamKeysToMove array, then performs the move at the end of the batch.
NS_IMETHODIMP EwsFolder::OnMessageClassified(const nsACString& aMsgURI,
                                             nsMsgJunkStatus aClassification,
                                             uint32_t aJunkPercent) {
  nsCOMPtr<nsIMsgIncomingServer> server;
  nsresult rv = GetServer(getter_AddRefs(server));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsISpamSettings> spamSettings;
  rv = server->GetSpamSettings(getter_AddRefs(spamSettings));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCString spamFolderURI;
  rv = spamSettings->GetSpamFolderURI(spamFolderURI);
  NS_ENSURE_SUCCESS(rv, rv);

  // Empty URI indicates end of batch.
  if (!aMsgURI.IsEmpty()) {
    nsCOMPtr<nsIMsgDBHdr> msgHdr;
    rv = GetMsgDBHdrFromURI(aMsgURI, getter_AddRefs(msgHdr));
    NS_ENSURE_SUCCESS(rv, rv);

    nsMsgKey msgKey;
    rv = msgHdr->GetMessageKey(&msgKey);
    NS_ENSURE_SUCCESS(rv, rv);

    // check if this message needs junk classification
    uint32_t processingFlags;
    GetProcessingFlags(msgKey, &processingFlags);

    if (processingFlags & nsMsgProcessingFlags::ClassifyJunk) {
      nsMsgDBFolder::OnMessageClassified(aMsgURI, aClassification,
                                         aJunkPercent);

      if (aClassification == nsIJunkMailPlugin::JUNK) {
        bool willMoveMessage = false;

        // don't do the move when we are opening up
        // the junk mail folder or the trash folder
        // or when manually classifying messages in those folders
        if (!(mFlags & nsMsgFolderFlags::Junk ||
              mFlags & nsMsgFolderFlags::Trash)) {
          bool moveOnSpam = false;
          rv = spamSettings->GetMoveOnSpam(&moveOnSpam);
          NS_ENSURE_SUCCESS(rv, rv);
          if (moveOnSpam) {
            nsCOMPtr<nsIMsgFolder> folder;
            rv = FindFolder(spamFolderURI, getter_AddRefs(folder));
            NS_ENSURE_SUCCESS(rv, rv);
            if (folder) {
              rv = folder->SetFlag(nsMsgFolderFlags::Junk);
              NS_ENSURE_SUCCESS(rv, rv);
              mSpamKeysToMove.AppendElement(msgKey);
              willMoveMessage = true;
            } else {
              // XXX TODO
              // JUNK MAIL RELATED
              // the listener should do
              // rv = folder->SetFlag(nsMsgFolderFlags::Junk);
              // NS_ENSURE_SUCCESS(rv,rv);
              // mSpamKeysToMove.AppendElement(msgKey);
              // willMoveMessage = true;
              rv =
                  GetOrCreateJunkFolder(spamFolderURI, nullptr /* aListener */);
              NS_ASSERTION(NS_SUCCEEDED(rv), "GetOrCreateJunkFolder failed");
            }
          }
        }
        rv = spamSettings->LogJunkHit(msgHdr, willMoveMessage);
        NS_ENSURE_SUCCESS(rv, rv);
      }
    }
  } else {
    // URI is empty, indicating end of batch.

    // Parent will apply post bayes filters.
    nsMsgDBFolder::OnMessageClassified(EmptyCString(),
                                       nsIJunkMailPlugin::UNCLASSIFIED, 0);
    nsTArray<RefPtr<nsIMsgDBHdr>> messages;
    if (!mSpamKeysToMove.IsEmpty()) {
      nsCOMPtr<nsIMsgFolder> folder;
      if (!spamFolderURI.IsEmpty()) {
        rv = FindFolder(spamFolderURI, getter_AddRefs(folder));
        NS_ENSURE_SUCCESS(rv, rv);
      }
      for (uint32_t keyIndex = 0; keyIndex < mSpamKeysToMove.Length();
           keyIndex++) {
        // If an upstream filter moved this message, don't move it here.
        nsMsgKey msgKey = mSpamKeysToMove.ElementAt(keyIndex);
        nsMsgProcessingFlagType processingFlags;
        GetProcessingFlags(msgKey, &processingFlags);
        if (folder && !(processingFlags & nsMsgProcessingFlags::FilterToMove)) {
          nsCOMPtr<nsIMsgDBHdr> mailHdr;
          rv = GetMessageHeader(msgKey, getter_AddRefs(mailHdr));
          if (NS_SUCCEEDED(rv) && mailHdr) messages.AppendElement(mailHdr);
        } else {
          // We don't need the processing flag any more.
          AndProcessingFlags(msgKey, ~nsMsgProcessingFlags::FilterToMove);
        }
      }

      if (folder) {
        nsCOMPtr<nsIMsgCopyService> copySvc =
            mozilla::components::Copy::Service();
        rv = copySvc->CopyMessages(
            this, messages, folder, true,
            /*nsIMsgCopyServiceListener* listener*/ nullptr, nullptr,
            false /*allowUndo*/);
        NS_ASSERTION(NS_SUCCEEDED(rv), "CopyMessages failed");
        if (NS_FAILED(rv)) {
          nsAutoCString logMsg(
              "failed to copy junk messages to junk folder rv = ");
          logMsg.AppendInt(static_cast<uint32_t>(rv), 16);
          spamSettings->LogJunkString(logMsg.get());
        }
      }
    }
    int32_t numNewMessages;
    GetNumNewMessages(false, &numNewMessages);
    SetNumNewMessages(numNewMessages - messages.Length());
    mSpamKeysToMove.Clear();
    // check if this is the inbox first...
    if (mFlags & nsMsgFolderFlags::Inbox) PerformBiffNotifications();
  }

  return NS_OK;
}

NS_IMETHODIMP EwsFolder::HandleViewCommand(
    int32_t command, const nsTArray<nsMsgKey>& messageKeys,
    nsIMsgWindow* window, nsIMsgCopyServiceListener* listener) {
  nsresult rv;
  if (command == nsMsgViewCommandType::junk ||
      command == nsMsgViewCommandType::unjunk) {
    const bool isJunk = command == nsMsgViewCommandType::junk;
    // Get the EWS IDs for the message keys.
    nsTArray<RefPtr<nsIMsgDBHdr>> headers;
    headers.SetCapacity(messageKeys.Length());
    for (auto&& messageKey : messageKeys) {
      nsCOMPtr<nsIMsgDBHdr> header;
      rv = GetMessageHeader(messageKey, getter_AddRefs(header));
      NS_ENSURE_SUCCESS(rv, rv);
      headers.AppendElement(header);
    }

    nsTArray<nsCString> ewsIds;
    rv = GetEwsIdsForMessageHeaders(headers, ewsIds);
    NS_ENSURE_SUCCESS(rv, rv);

    nsCOMPtr<nsIMsgIncomingServer> server;
    rv = GetServer(getter_AddRefs(server));
    NS_ENSURE_SUCCESS(rv, rv);

    nsCOMPtr<nsIMsgFolder> rootFolder;
    rv = server->GetRootFolder(getter_AddRefs(rootFolder));
    NS_ENSURE_SUCCESS(rv, rv);

    // According to the documentation at
    // https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/markasjunk-operation
    // If an item is marked as junk, it is moved from the source
    // folder to the junk folder. If an item is marked as not junk, it
    // is moved from the source folder to the *inbox*.
    nsCOMPtr<nsIMsgFolder> destinationFolder;
    if (isJunk) {
      rv = rootFolder->GetFolderWithFlags(nsMsgFolderFlags::Junk,
                                          getter_AddRefs(destinationFolder));
      NS_ENSURE_SUCCESS(rv, rv);
    } else {
      rv = rootFolder->GetFolderWithFlags(nsMsgFolderFlags::Inbox,
                                          getter_AddRefs(destinationFolder));
      NS_ENSURE_SUCCESS(rv, rv);
    }

    nsAutoCString legacyDestinationEwsId;
    if (destinationFolder) {
      rv = destinationFolder->GetStringProperty(kEwsIdProperty,
                                                legacyDestinationEwsId);
      NS_ENSURE_SUCCESS(rv, rv);
    }

    RefPtr<EwsSimpleMessageListener> operationListener =
        new EwsSimpleMessageListener{
            headers, [self = RefPtr(this), window = RefPtr(window),
                      listener = RefPtr(listener), destinationFolder](
                         const nsTArray<RefPtr<nsIMsgDBHdr>>& headers,
                         const nsTArray<nsCString>& movedItemIds,
                         bool useLegacyFallback) {
              nsresult rv = NS_OK;
              auto notifyCopyServiceOnExit =
                  GuardCopyServiceListener(listener, rv);

              if (useLegacyFallback) {
                // We didn't get new IDs from the operation, so just trigger
                // a sync on the destination folder.
                if (destinationFolder) {
                  // Best we can do is a sync of the supposed destination.
                  rv = destinationFolder->GetNewMessages(window, nullptr);
                  NS_ENSURE_SUCCESS(rv, rv);
                }

                // If we're here, it means we've triggered a server-side move.
                // This means we need to sync the current folder, so we can pick
                // up the removal of the target message(s).
                rv = self->SyncMessages(window, nullptr);
                NS_ENSURE_SUCCESS(rv, rv);

                return NS_OK;
              }

              if (movedItemIds.Length() != headers.Length()) {
                // Make sure the copy service listener is appropriately
                // notified.
                rv = NS_ERROR_UNEXPECTED;
                NS_ENSURE_SUCCESS(rv, rv);
              }

              // Copy the input messages to the destination folder.
              if (destinationFolder) {
                nsTArray<RefPtr<nsIMsgDBHdr>> newHeaders;
                rv = LocalCopyMessages(self, destinationFolder, headers,
                                       newHeaders);
                NS_ENSURE_SUCCESS(rv, rv);
                NS_ENSURE_TRUE(newHeaders.Length() == headers.Length(),
                               NS_ERROR_UNEXPECTED);
                for (auto i = 0u; i < movedItemIds.Length(); ++i) {
                  rv = newHeaders[i]->SetStringProperty(kEwsIdProperty,
                                                        movedItemIds[i]);
                  NS_ENSURE_SUCCESS(rv, rv);
                }
              }

              // Delete the messages from this folder.
              rv = LocalDeleteMessages(self, headers);
              NS_ENSURE_SUCCESS(rv, rv);

              return NS_OK;
            }};

    nsCOMPtr<IEwsClient> client;
    rv = GetProtocolClient(getter_AddRefs(client));
    NS_ENSURE_SUCCESS(rv, rv);

    rv = client->MarkItemsAsJunk(operationListener, ewsIds, isJunk,
                                 legacyDestinationEwsId);
    NS_ENSURE_SUCCESS(rv, rv);
  }

  return NS_OK;
}

NS_IMETHODIMP EwsFolder::FetchMsgPreviewText(
    nsTArray<nsMsgKey> const& aKeysToFetch, nsIUrlListener* aUrlListener,
    bool* aAsyncResults) {
  NS_ENSURE_ARG(aAsyncResults);

  // We request preview content as part of the initial message sync, so there's
  // no need for an async request to obtain a preview.
  *aAsyncResults = false;

  nsresult rv = NS_OK;
  for (auto&& key : aKeysToFetch) {
    nsCOMPtr<nsIMsgDBHdr> header;
    rv = GetMessageHeader(key, getter_AddRefs(header));
    NS_ENSURE_SUCCESS(rv, rv);

    // Check to see if there's already a preview.
    nsCString previewText;
    rv = header->GetStringProperty("preview", previewText);
    if (!previewText.IsEmpty()) {
      continue;
    }

    uint32_t flags;
    rv = header->GetFlags(&flags);
    NS_ENSURE_SUCCESS(rv, rv);
    if (flags & nsMsgMessageFlags::Offline) {
      nsCOMPtr<nsIInputStream> inputStream;
      rv = GetMsgInputStream(header, getter_AddRefs(inputStream));
      NS_ENSURE_SUCCESS(rv, rv);
      rv = GetMsgPreviewTextFromStream(header, inputStream);
      NS_ENSURE_SUCCESS(rv, rv);
    }
  }
  return NS_OK;
}

NS_IMETHODIMP EwsFolder::ReadFromFolderCacheElem(
    nsIMsgFolderCacheElement* element) {
  MOZ_ASSERT(!mail_panorama_enabled_AtStartup());
  if (mail_panorama_enabled_AtStartup()) {
    return NS_ERROR_NOT_IMPLEMENTED;
  }
  NS_ENSURE_ARG_POINTER(element);
  nsresult rv = nsMsgDBFolder::ReadFromFolderCacheElem(element);
  NS_ENSURE_SUCCESS(rv, rv);
  if (!UsesLocalizedName()) {
    return element->GetCachedString("folderName", mName);
  }
  return NS_OK;
}

NS_IMETHODIMP EwsFolder::WriteToFolderCacheElem(
    nsIMsgFolderCacheElement* element) {
  MOZ_ASSERT(!mail_panorama_enabled_AtStartup());
  if (mail_panorama_enabled_AtStartup()) {
    return NS_ERROR_NOT_IMPLEMENTED;
  }
  NS_ENSURE_ARG_POINTER(element);
  nsMsgDBFolder::WriteToFolderCacheElem(element);
  if (!UsesLocalizedName()) {
    return element->SetCachedString("folderName", mName);
  }
  return NS_OK;
}

NS_IMETHODIMP EwsFolder::MarkMessagesFlagged(
    const nsTArray<RefPtr<nsIMsgDBHdr>>& messages, bool markFlagged) {
  nsresult rv = NS_OK;

  nsTArray<nsCString> ewsIds(messages.Length());
  for (auto&& message : messages) {
    nsAutoCString ewsId;
    rv = message->GetStringProperty(kEwsIdProperty, ewsId);
    NS_ENSURE_SUCCESS(rv, rv);
    ewsIds.AppendElement(ewsId);
  }

  CopyableTArray<RefPtr<nsIMsgDBHdr>> headersToChange(messages.Length());
  for (auto&& message : messages) {
    headersToChange.AppendElement(message);
  }
  RefPtr<EwsSimpleListener> listener = new EwsSimpleListener(
      [headersToChange = std::move(headersToChange), markFlagged](
          const nsTArray<nsCString>& ewsIds, bool useLegacyFallback) {
        nsresult rv = NS_OK;
        for (auto&& header : headersToChange) {
          rv = header->MarkFlagged(markFlagged);
          NS_ENSURE_SUCCESS(rv, rv);
        }
        return NS_OK;
      });

  nsCOMPtr<IEwsClient> client;
  rv = GetProtocolClient(getter_AddRefs(client));
  NS_ENSURE_SUCCESS(rv, rv);

  return client->ChangeFlagStatus(listener, ewsIds, markFlagged);
}
