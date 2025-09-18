/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "EwsFolder.h"

#include "EwsFolderCopyHandler.h"
#include "EwsListeners.h"
#include "EwsMessageCopyHandler.h"
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
#include "nscore.h"
#include "OfflineStorage.h"
#include "mozilla/Components.h"

#define kEWSRootURI "ews:/"
#define kEWSMessageRootURI "ews-message:/"

#define SYNC_STATE_PROPERTY "ewsSyncStateToken"

using namespace mozilla;

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

EwsFolder::EwsFolder() : mHasLoadedSubfolders(false) {}

EwsFolder::~EwsFolder() = default;

nsresult EwsFolder::CreateBaseMessageURI(const nsACString& aURI) {
  nsAutoCString tailURI(aURI);

  // Remove the scheme and the following `:/'.
  if (tailURI.Find(kEWSRootURI) == 0) {
    tailURI.Cut(0, PL_strlen(kEWSRootURI));
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
  rv = GetEwsClient(getter_AddRefs(client));
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

NS_IMETHODIMP EwsFolder::GetIncomingServerType(nsACString& aServerType) {
  aServerType.AssignLiteral("ews");

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
  // The first time we ask for a list of subfolders, this folder has no idea
  // what they are. Use the message store to get a list, which we cache in this
  // folder's memory. (Keeping it up-to-date is managed by the `AddSubfolder`
  // and `CreateSubfolder`, where appropriate.)
  if (!mHasLoadedSubfolders) {
    // If we fail this time, we're unlikely to succeed later, so we set this
    // first thing.
    mHasLoadedSubfolders = true;

    nsCOMPtr<nsIMsgIncomingServer> server;
    nsresult rv = GetServer(getter_AddRefs(server));
    NS_ENSURE_SUCCESS(rv, rv);

    nsCOMPtr<nsIMsgPluggableStore> msgStore;
    rv = server->GetMsgStore(getter_AddRefs(msgStore));
    NS_ENSURE_SUCCESS(rv, rv);

    // Running discovery on the message store will populate the subfolder list.
    rv = msgStore->DiscoverSubFolders(this, true);
    NS_ENSURE_SUCCESS(rv, rv);
  }

  return nsMsgDBFolder::GetSubFolders(aSubFolders);
}

NS_IMETHODIMP EwsFolder::RenameSubFolders(nsIMsgWindow* msgWindow,
                                          nsIMsgFolder* oldFolder) {
  NS_WARNING("RenameSubFolders");
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP EwsFolder::MarkMessagesRead(
    const nsTArray<RefPtr<nsIMsgDBHdr>>& messages, bool markRead) {
  nsCOMPtr<IEwsClient> client;
  nsresult rv = GetEwsClient(getter_AddRefs(client));
  NS_ENSURE_SUCCESS(rv, rv);

  // Mark the messages as read in the local database.
  rv = nsMsgDBFolder::MarkMessagesRead(messages, markRead);
  NS_ENSURE_SUCCESS(rv, rv);

  nsTArray<nsCString> ewsMessageIds;

  // Get a list of the EWS IDs for the messages to be modified.
  for (const auto& msg : messages) {
    nsAutoCString itemId;
    rv = msg->GetStringProperty(kEwsIdProperty, itemId);
    NS_ENSURE_SUCCESS(rv, rv);
    ewsMessageIds.AppendElement(itemId);
  }

  rv = client->ChangeReadStatus(ewsMessageIds, markRead);
  NS_ENSURE_SUCCESS(rv, rv);

  // Commit the changes to the local database to make sure they are persisted.
  rv = GetDatabase();
  if (NS_SUCCEEDED(rv)) {
    mDatabase->Commit(nsMsgDBCommitType::kLargeCommit);
  }

  return rv;
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
  rv = GetEwsClient(getter_AddRefs(client));
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
  rv = GetEwsClient(getter_AddRefs(client));
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
    MOZ_TRY(GetEwsClient(getter_AddRefs(client)));

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

  const RefPtr<EwsSimpleFailibleMessageListener> listener =
      new EwsSimpleFailibleMessageListener(
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
  MOZ_TRY(GetEwsClient(getter_AddRefs(client)));

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
  MOZ_TRY(GetEwsClient(getter_AddRefs(client)));

  bool isSameServer;
  rv = FoldersOnSameServer(aSrcFolder, this, &isSameServer);
  NS_ENSURE_SUCCESS(rv, rv);

  if (isSameServer) {
    // Same server move or copy.
    nsAutoCString sourceEwsId;
    rv = aSrcFolder->GetStringProperty(kEwsIdProperty, sourceEwsId);
    NS_ENSURE_SUCCESS(rv, rv);
    if (sourceEwsId.IsEmpty()) {
      NS_ERROR("Expected EWS folder for server but folder has no EWS ID.");
      return NS_ERROR_UNEXPECTED;
    }

    nsAutoCString destinationEwsId;
    rv = GetEwsId(destinationEwsId);
    NS_ENSURE_SUCCESS(rv, rv);

    const nsCOMPtr<nsIMsgFolder> srcFolder = aSrcFolder;
    const nsCOMPtr<nsIMsgWindow> msgWindow = aMsgWindow;
    const nsCOMPtr<nsIMsgCopyServiceListener> copyListener = aCopyListener;

    RefPtr<EwsSimpleFailibleListener> listener = new EwsSimpleFailibleListener(
        [self = RefPtr(this), srcFolder, copyListener, msgWindow,
         aIsMoveFolder](const nsTArray<nsCString>& ids,
                        bool useLegacyFallback) {
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

    if (aIsMoveFolder) {
      client->MoveFolders(listener, destinationEwsId, {sourceEwsId});
    } else {
      client->CopyFolders(listener, destinationEwsId, {sourceEwsId});
    }
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

NS_IMETHODIMP EwsFolder::DeleteMessages(
    nsTArray<RefPtr<nsIMsgDBHdr>> const& aMsgHeaders, nsIMsgWindow* aMsgWindow,
    bool aDeleteStorage, bool aIsMove, nsIMsgCopyServiceListener* aCopyListener,
    bool aAllowUndo) {
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

  // If we're performing a "hard" delete, or if we're deleting from the trash
  // folder, perform a "real" deletion (i.e. delete the messages from both the
  // storage and the server).
  if (aDeleteStorage || isTrashFolder ||
      deleteModel == DeleteModel::PERMANENTLY_DELETE) {
    nsCOMPtr<nsIMsgStatusFeedback> feedback = nullptr;
    if (aMsgWindow) {
      // Format the message we'll show the user while we wait for the remote
      // operation to complete.
      RefPtr<intl::Localization> l10n = intl::Localization::Create(
          {"messenger/activityFeedback.ftl"_ns}, true);

      auto l10nArgs = dom::Optional<intl::L10nArgs>();
      l10nArgs.Construct();

      nsCString folderName;
      rv = GetLocalizedName(folderName);
      NS_ENSURE_SUCCESS(rv, rv);

      auto numberArg = l10nArgs.Value().Entries().AppendElement();
      numberArg->mKey = "number"_ns;
      numberArg->mValue.SetValue().SetAsUTF8String().Assign(
          nsPrintfCString("%zu", aMsgHeaders.Length()));

      auto folderArg = l10nArgs.Value().Entries().AppendElement();
      folderArg->mKey = "folderName"_ns;
      folderArg->mValue.SetValue().SetAsUTF8String().Assign(folderName);

      ErrorResult error;
      nsCString message;
      l10n->FormatValueSync("deleting-messages"_ns, l10nArgs, message, error);

      // Show the formatted message in the status bar.
      rv = aMsgWindow->GetStatusFeedback(getter_AddRefs(feedback));
      NS_ENSURE_SUCCESS(rv, rv);

      rv = feedback->ShowStatusString(NS_ConvertUTF8toUTF16(message));
      NS_ENSURE_SUCCESS(rv, rv);
      rv = feedback->StartMeteors();
      NS_ENSURE_SUCCESS(rv, rv);
    }

    // Define the listener with a success lambda callback, and start the remote
    // operation.
    const nsCOMPtr<nsIMsgCopyServiceListener> copyListener = aCopyListener;
    RefPtr<EwsSimpleMessageListener> listener = new EwsSimpleMessageListener(
        aMsgHeaders,
        [self = RefPtr(this), copyListener, feedback](
            const nsTArray<RefPtr<nsIMsgDBHdr>>& srcHdrs,
            const nsTArray<nsCString>& ids, bool useLegacyFallback) {
          nsresult rv = NS_OK;
          auto listenerExitGuard = GuardCopyServiceListener(copyListener, rv);

          rv = LocalDeleteMessages(self, srcHdrs);
          NS_ENSURE_SUCCESS(rv, rv);

          if (feedback) {
            // Reset the status bar.
            return feedback->StopMeteors();
          }

          return NS_OK;
        });

    nsCOMPtr<IEwsClient> client;
    rv = GetEwsClient(getter_AddRefs(client));
    NS_ENSURE_SUCCESS(rv, rv);

    nsTArray<nsCString> ewsIds;
    MOZ_TRY(GetEwsIdsForMessageHeaders(aMsgHeaders, ewsIds));

    return client->DeleteMessages(listener, ewsIds);
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

  return ewsTrashFolder->CopyItemsOnSameServer(
      this, aMsgHeaders, true, aMsgWindow, aCopyListener, true,
      nsIMessenger::eDeleteMsg, nullptr);
}

NS_IMETHODIMP EwsFolder::DeleteSelf(nsIMsgWindow* aWindow) {
  bool deletable = false;
  nsresult rv = GetDeletable(&deletable);
  NS_ENSURE_SUCCESS(rv, rv);

  if (!deletable) {
    return NS_ERROR_UNEXPECTED;
  }

  nsCOMPtr<IEwsClient> client;
  rv = GetEwsClient(getter_AddRefs(client));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCString folderId;
  rv = GetEwsId(folderId);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgWindow> window = aWindow;

  RefPtr<EwsSimpleListener> listener = new EwsSimpleListener(
      [self = RefPtr(this), window](const nsTArray<nsCString>& ids,
                                    bool useLegacyFallback) {
        return self->nsMsgDBFolder::DeleteSelf(window);
      });

  return client->DeleteFolder(listener, folderId);
}

NS_IMETHODIMP EwsFolder::GetDeletable(bool* deletable) {
  NS_ENSURE_ARG_POINTER(deletable);

  bool isServer;
  nsresult rv = GetIsServer(&isServer);
  NS_ENSURE_SUCCESS(rv, rv);

  *deletable = !(isServer || (mFlags & nsMsgFolderFlags::SpecialUse));
  return NS_OK;
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

nsresult EwsFolder::GetEwsClient(IEwsClient** ewsClient) {
  nsCOMPtr<nsIMsgIncomingServer> server;
  nsresult rv = GetServer(getter_AddRefs(server));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<IEwsIncomingServer> ewsServer(do_QueryInterface(server));

  return ewsServer->GetEwsClient(ewsClient);
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
  // EWS provides us an opaque value which specifies the last version of
  // upstream messages we received. Provide that to simplify sync.
  nsCString syncStateToken;
  nsresult rv = GetStringProperty(SYNC_STATE_PROPERTY, syncStateToken);
  if (NS_FAILED(rv)) {
    syncStateToken = EmptyCString();
  }

  nsCOMPtr<nsIMsgStatusFeedback> feedback = nullptr;
  if (window) {
    // Format the message we'll show the user while we wait for the remote
    // operation to complete.
    RefPtr<intl::Localization> l10n =
        intl::Localization::Create({"messenger/activityFeedback.ftl"_ns}, true);

    auto l10nArgs = dom::Optional<intl::L10nArgs>();
    l10nArgs.Construct();

    nsCString folderName;
    rv = GetLocalizedName(folderName);
    NS_ENSURE_SUCCESS(rv, rv);

    auto idArg = l10nArgs.Value().Entries().AppendElement();
    idArg->mKey = "folderName"_ns;
    idArg->mValue.SetValue().SetAsUTF8String().Assign(folderName);

    ErrorResult error;
    nsCString message;
    l10n->FormatValueSync("looking-for-messages-folder"_ns, l10nArgs, message,
                          error);

    // Show the message in the status bar.
    rv = window->GetStatusFeedback(getter_AddRefs(feedback));
    NS_ENSURE_SUCCESS(rv, rv);

    // The window might not be attached to an `nsIMsgStatusFeedback`. This
    // typically happens with new profiles, because the `nsIMsgStatusFeedback`
    // is only added after the first account is added. Technically this should
    // also run after the account is added, but we're might be racing against
    // the `nsIMsgStatusFeedback` being added to the message window, in which
    // case it might still be null by the time this runs.
    if (feedback) {
      rv = feedback->ShowStatusString(NS_ConvertUTF8toUTF16(message));
      NS_ENSURE_SUCCESS(rv, rv);
      rv = feedback->StartMeteors();
      NS_ENSURE_SUCCESS(rv, rv);
    }
  }

  // Define the callbacks for the EWS operation.
  auto onMessageCreated = [self = RefPtr(this)](const nsACString& ewsId,
                                                nsIMsgDBHdr** newHdr) {
    // Check if a header already exists for this EWS ID. `GetHeaderForItem`
    // returns `NS_ERROR_NOT_AVAILABLE` when no header exists, so we only want
    // to move forward with creating one in this case.
    RefPtr<nsIMsgDBHdr> existingHeader;
    nsresult rv = self->GetHdrForEwsId(ewsId, getter_AddRefs(existingHeader));

    // If we could retrieve a header for this item, error immediately.
    if (NS_SUCCEEDED(rv)) {
      return NS_ERROR_ILLEGAL_VALUE;
    }

    // We already know that `rv` is a failure at this point, so we just need to
    // check it's not the one failure we want.
    if (rv != NS_ERROR_NOT_AVAILABLE) {
      return rv;
    }

    nsCOMPtr<nsIMsgDatabase> db;
    rv = self->GetMsgDatabase(getter_AddRefs(db));
    NS_ENSURE_SUCCESS(rv, rv);

    nsCOMPtr<nsIMsgDBHdr> newHeader;
    rv = db->CreateNewHdr(nsMsgKey_None, getter_AddRefs(newHeader));
    NS_ENSURE_SUCCESS(rv, rv);

    rv = newHeader->SetStringProperty(kEwsIdProperty, ewsId);
    NS_ENSURE_SUCCESS(rv, rv);

    newHeader.forget(newHdr);
    return NS_OK;
  };

  auto onMessageDeleted = [self = RefPtr(this)](const nsACString& ewsId) {
    // Delete the message headers from the database.
    nsCOMPtr<nsIMsgDatabase> db;
    nsresult rv = self->GetMsgDatabase(getter_AddRefs(db));
    NS_ENSURE_SUCCESS(rv, rv);

    RefPtr<nsIMsgDBHdr> existingHeader;
    rv = db->GetMsgHdrForEwsItemID(ewsId, getter_AddRefs(existingHeader));
    NS_ENSURE_SUCCESS(rv, rv);

    if (!existingHeader) {
      // If we don't have a header for this message ID, it means we have already
      // deleted it locally. This can happen in legitimate situations, e.g. when
      // syncing the message list after deleting a message from Thunderbird (in
      // which case, the server's sync response will include a `Delete` change
      // for the message we've just deleted).
      return NS_OK;
    }

    return LocalDeleteMessages(self, {existingHeader});
  };

  auto onMessageUpdated = [self = RefPtr(this)](const nsACString& ewsId,
                                                nsIMsgDBHdr** hdr) {
    RefPtr<nsIMsgDBHdr> existingHdr;
    nsresult rv = self->GetHdrForEwsId(ewsId, getter_AddRefs(existingHdr));
    NS_ENSURE_SUCCESS(rv, rv);

    // The message content might have changed (e.g. if a draft was updated), and
    // there's no way for us to know for sure without re-downloading it. So
    // let's delete its content from the message store so it can be
    // re-downloaded later.
    uint32_t flags;
    rv = existingHdr->GetFlags(&flags);
    NS_ENSURE_SUCCESS(rv, rv);

    if (!(flags & nsMsgMessageFlags::Offline)) {
      // Bail early if there's nothing to remove.
      return NS_OK;
    }

    // Delete the message content from the local store.
    nsCOMPtr<nsIMsgPluggableStore> store;
    rv = self->GetMsgStore(getter_AddRefs(store));
    NS_ENSURE_SUCCESS(rv, rv);

    rv = store->DeleteMessages({existingHdr});
    NS_ENSURE_SUCCESS(rv, rv);

    // Update the flags on the database entry to reflect its content is *not*
    // stored offline anymore. We don't commit right now, but the expectation is
    // that the consumer will call `CommitChanges()` once it's done processing
    // the current change.
    uint32_t unused;
    rv = existingHdr->AndFlags(~nsMsgMessageFlags::Offline, &unused);
    NS_ENSURE_SUCCESS(rv, rv);

    existingHdr.forget(hdr);

    return NS_OK;
  };

  auto onReadStatusChanged = [self = RefPtr(this)](const nsACString& ewsId,
                                                   bool is_read) {
    // Get the header for the message with ewsId and update its read flag in the
    // database.
    RefPtr<nsIMsgDBHdr> existingHeader;
    nsresult rv = self->GetHdrForEwsId(ewsId, getter_AddRefs(existingHeader));
    NS_ENSURE_SUCCESS(rv, rv);

    return existingHeader->MarkRead(is_read);
  };

  auto onDetachedHdrPopulated =
      [self = RefPtr(this)](nsIMsgDBHdr* hdr,
                            nsTArray<RefPtr<nsIMsgDBHdr>>& newMessages) {
        nsCOMPtr<nsIMsgDatabase> db;
        nsresult rv = self->GetMsgDatabase(getter_AddRefs(db));
        NS_ENSURE_SUCCESS(rv, rv);

        // If New flag is not set, it won't be added to the databases list of
        // new messages (and so won't be filtered/classified). But we'll treat
        // read messages as old.
        uint32_t flags;
        rv = hdr->GetFlags(&flags);
        NS_ENSURE_SUCCESS(rv, rv);

        if (!(flags & nsMsgMessageFlags::Read)) {
          flags |= nsMsgMessageFlags::New;
          hdr->SetFlags(flags);
          newMessages.AppendElement(hdr);
        }

        nsCOMPtr<nsIMsgDBHdr> liveHdr;
        rv = db->AttachHdr(hdr, true, getter_AddRefs(liveHdr));
        NS_ENSURE_SUCCESS(rv, rv);

        nsCOMPtr<nsIMsgFolderNotificationService> notifier =
            mozilla::components::FolderNotification::Service();

        // Remember message for filtering at end of sync operation.
        notifier->NotifyMsgAdded(liveHdr);

        return NS_OK;
      };

  auto onExistingHdrChanged = [self = RefPtr(this)]() {
    RefPtr<nsIMsgDatabase> db;
    nsresult rv = self->GetMsgDatabase(getter_AddRefs(db));
    NS_ENSURE_SUCCESS(rv, rv);

    return db->Commit(nsMsgDBCommitType::kLargeCommit);
  };

  auto onSyncStateTokenChanged =
      [self = RefPtr(this)](const nsACString& syncStateToken) {
        return self->SetStringProperty(SYNC_STATE_PROPERTY, syncStateToken);
      };

  // This lambda will be called whenever the sync terminates, regardless of the
  // outcome. This means it will both be called at the end of `onSyncComplete`,
  // and used as the listener's `OnOperationFailure` callback.
  nsCOMPtr<nsIUrlListener> syncUrlListener = urlListener;
  auto onSyncStop = [self = RefPtr(this), syncUrlListener,
                     feedback](nsresult status) {
    if (syncUrlListener) {
      nsCOMPtr<nsIURI> folderUri;
      nsresult rv = FolderUri(self, getter_AddRefs(folderUri));
      NS_ENSURE_SUCCESS(rv, rv);
      syncUrlListener->OnStopRunningUrl(folderUri, rv);
    }

    if (feedback) {
      // Reset the status bar.
      return feedback->StopMeteors();
    }

    return NS_OK;
  };

  auto onSyncComplete = [self = RefPtr(this), onSyncStop](
                            const nsTArray<RefPtr<nsIMsgDBHdr>>& newMessages) {
    // Trigger notifications for new messages.
    if (!newMessages.IsEmpty()) {
      self->SetHasNewMessages(true);
      self->SetNumNewMessages(static_cast<int32_t>(newMessages.Length()));
      self->SetBiffState(nsIMsgFolder::nsMsgBiffState_NewMail);
    }

    // If some new messages arrived, apply filters to them now.
    if (!newMessages.IsEmpty()) {
      self->ApplyFilters(newMessages);

      // Tell the AutoSyncState about the newly-added messages,
      // to queue them for potential offline download.
      {
        nsTArray<nsMsgKey> keys(newMessages.Length());
        for (nsIMsgDBHdr* hdr : newMessages) {
          nsMsgKey key;
          hdr->GetMessageKey(&key);
          MOZ_ASSERT(key != nsMsgKey_None);
          keys.AppendElement(key);
        }
        self->AutoSyncState()->OnNewHeaderFetchCompleted(keys);
      }
    }
    onSyncStop(NS_OK);
    self->NotifyFolderEvent(kFolderLoaded);

    return NS_OK;
  };

  RefPtr<EwsMessageSyncListener> listener = new EwsMessageSyncListener(
      onMessageCreated, onMessageDeleted, onMessageUpdated,
      onDetachedHdrPopulated, onExistingHdrChanged, onSyncStateTokenChanged,
      onSyncComplete, onReadStatusChanged, onSyncStop);

  if (urlListener) {
    nsCOMPtr<nsIURI> folderUri;
    rv = FolderUri(this, getter_AddRefs(folderUri));
    NS_ENSURE_SUCCESS(rv, rv);
    rv = urlListener->OnStartRunningUrl(folderUri);
    NS_ENSURE_SUCCESS(rv, rv);
  }

  // Sync the message list for the current folder.
  nsCString ewsId;
  MOZ_TRY(GetEwsId(ewsId));

  nsCOMPtr<IEwsClient> client;
  MOZ_TRY(GetEwsClient(getter_AddRefs(client)));

  return client->SyncMessagesForFolder(listener, ewsId, syncStateToken);
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

nsresult EwsFolder::ApplyFilters(
    const nsTArray<RefPtr<nsIMsgDBHdr>>& newMessages) {
  nsCOMPtr<nsIMsgFilterService> filterService(
      mozilla::components::Filter::Service());

  nsCOMPtr<nsIMsgFilterList> filterList;
  nsresult rv = GetFilterList(nullptr, getter_AddRefs(filterList));
  NS_ENSURE_SUCCESS(rv, rv);

  // Can we run the filters? Or will they require the full message
  // first?
  bool incomingFiltersRequireBody;
  rv = filterList->DoFiltersNeedMessageBody(nsMsgFilterType::Incoming,
                                            &incomingFiltersRequireBody);
  NS_ENSURE_SUCCESS(rv, rv);

  if (!incomingFiltersRequireBody) {
    // Once the filtering is complete, `doneFunc` will run.
    auto doneFunc =
        [self = RefPtr(this)](
            nsresult status,
            const nsTArray<RefPtr<nsIMsgDBHdr>>& newMessages) -> nsresult {
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

    // Run the filters upon the new messages. Note, by this time, the
    // messages have already been added to the folders database.
    // This means we can use ApplyFilters, which handles all the filter
    // actions - it uses the protocol-agnostic code, as if the filters
    // had been manually triggered ("run filters now"). This is in
    // contrast to POP3 and IMAP, which run the filters _before_ adding
    // the messages to the database, but then have to implement all
    // their own filter actions.
    rv = filterService->ApplyFilters(
        nsMsgFilterType::Inbox, newMessages, this, nullptr /*window*/,
        new MsgOperationListener(newMessages, doneFunc));
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
    if (NS_SUCCEEDED(rv) && setNewFoldersForOffline)
      flags |= nsMsgFolderFlags::Offline;
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
    rv = GetEwsClient(getter_AddRefs(client));
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

  // This implementation currently only provides preview content if we have an
  // offline copy of the message. See
  // https://bugzilla.mozilla.org/show_bug.cgi?id=1985878 for fetching remote
  // content for notification previews.
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
      rv = GetLocalMsgStream(header, getter_AddRefs(inputStream));
      NS_ENSURE_SUCCESS(rv, rv);
      rv = GetMsgPreviewTextFromStream(header, inputStream);
      NS_ENSURE_SUCCESS(rv, rv);
    }
  }
  return NS_OK;
}
