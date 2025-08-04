/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "EwsFolder.h"

#include "EwsFolderCopyHandler.h"
#include "EwsListeners.h"
#include "EwsMessageCopyHandler.h"
#include "IEwsClient.h"
#include "IEwsIncomingServer.h"

#include "ErrorList.h"
#include "FolderCompactor.h"
#include "FolderPopulation.h"
#include "MailNewsTypes.h"
#include "nsIMsgCopyService.h"
#include "nsIMsgDatabase.h"
#include "nsIMsgFolderNotificationService.h"
#include "nsIMsgPluggableStore.h"
#include "nsString.h"
#include "nsMsgFolderFlags.h"
#include "nsIMsgCopyService.h"
#include "nsIMsgWindow.h"
#include "nsMsgUtils.h"
#include "nsNetUtil.h"
#include "nsPrintfCString.h"
#include "nscore.h"
#include "OfflineStorage.h"
#include "mozilla/Components.h"

#define kEWSRootURI "ews:/"
#define kEWSMessageRootURI "ews-message:/"

#define SYNC_STATE_PROPERTY "ewsSyncStateToken"

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
      NS_WARNING("Skipping header without EWS ID");
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

class MessageOperationCallbacks : public IEwsMessageCallbacks,
                                  public IEwsFallibleOperationListener {
 public:
  NS_DECL_THREADSAFE_ISUPPORTS
  NS_DECL_IEWSMESSAGECALLBACKS
  NS_DECL_IEWSFALLIBLEOPERATIONLISTENER

  MessageOperationCallbacks(EwsFolder* folder, nsIMsgWindow* window,
                            nsCOMPtr<nsIUrlListener> urlListener)
      : mFolder(folder),
        mWindow(window),
        mUrlListener(std::move(urlListener)) {}

 protected:
  virtual ~MessageOperationCallbacks() = default;

 private:
  nsresult NotifyListener(nsresult rv);

 private:
  RefPtr<EwsFolder> mFolder;
  RefPtr<nsIMsgWindow> mWindow;
  nsCOMPtr<nsIUrlListener> mUrlListener;
};

NS_IMPL_ISUPPORTS(MessageOperationCallbacks, IEwsMessageCallbacks)

NS_IMETHODIMP MessageOperationCallbacks::SaveNewHeader(nsIMsgDBHdr* hdr) {
  RefPtr<nsIMsgDatabase> db;
  nsresult rv = mFolder->GetMsgDatabase(getter_AddRefs(db));
  NS_ENSURE_SUCCESS(rv, rv);

  MOZ_TRY(db->AddNewHdrToDB(hdr, true));

  nsCOMPtr<nsIMsgFolderNotificationService> notifier =
      mozilla::components::FolderNotification::Service();
  notifier->NotifyMsgAdded(hdr);

  return NS_OK;
}

NS_IMETHODIMP MessageOperationCallbacks::CommitChanges() {
  RefPtr<nsIMsgDatabase> db;
  nsresult rv = mFolder->GetMsgDatabase(getter_AddRefs(db));
  NS_ENSURE_SUCCESS(rv, rv);

  return db->Commit(nsMsgDBCommitType::kLargeCommit);
}

NS_IMETHODIMP MessageOperationCallbacks::CreateNewHeaderForItem(
    const nsACString& ewsId, nsIMsgDBHdr** _retval) {
  // Check if a header already exists for this EWS ID. `GetHeaderForItem`
  // returns `NS_ERROR_NOT_AVAILABLE` when no header exists, so we only want to
  // move forward with creating one in this case.
  RefPtr<nsIMsgDBHdr> existingHeader;
  nsresult rv = GetHeaderForItem(ewsId, getter_AddRefs(existingHeader));

  // If we could retrieve a header for this item, error immediately.
  if (NS_SUCCEEDED(rv)) {
    return NS_ERROR_ILLEGAL_VALUE;
  }

  // We already know that `rv` is a failure at this point, so we just need to
  // check it's not the one failure we want.
  if (rv != NS_ERROR_NOT_AVAILABLE) {
    return rv;
  }

  RefPtr<nsIMsgDatabase> db;
  MOZ_TRY(mFolder->GetMsgDatabase(getter_AddRefs(db)));

  RefPtr<nsIMsgDBHdr> newHeader;
  MOZ_TRY(db->CreateNewHdr(nsMsgKey_None, getter_AddRefs(newHeader)));

  MOZ_TRY(newHeader->SetStringProperty(kEwsIdProperty, ewsId));

  newHeader.forget(_retval);
  return NS_OK;
}

NS_IMETHODIMP MessageOperationCallbacks::GetHeaderForItem(
    const nsACString& ewsId, nsIMsgDBHdr** _retval) {
  RefPtr<nsIMsgDatabase> db;
  MOZ_TRY(mFolder->GetMsgDatabase(getter_AddRefs(db)));

  RefPtr<nsIMsgDBHdr> existingHeader;
  MOZ_TRY(db->GetMsgHdrForEwsItemID(ewsId, getter_AddRefs(existingHeader)));

  // Make sure we managed to get a header from the database.
  if (!existingHeader) {
    return NS_ERROR_NOT_AVAILABLE;
  }

  existingHeader.forget(_retval);

  return NS_OK;
}

NS_IMETHODIMP MessageOperationCallbacks::DeleteHeaderFromDB(
    const nsACString& ewsId) {
  // Delete the message headers from the database.
  RefPtr<nsIMsgDatabase> db;
  nsresult rv = mFolder->GetMsgDatabase(getter_AddRefs(db));
  NS_ENSURE_SUCCESS(rv, rv);

  RefPtr<nsIMsgDBHdr> existingHeader;
  rv = db->GetMsgHdrForEwsItemID(ewsId, getter_AddRefs(existingHeader));
  NS_ENSURE_SUCCESS(rv, rv);

  if (!existingHeader) {
    // If we don't have a header for this message ID, it means we have already
    // deleted it locally. This can happen in legitimate situations, e.g. when
    // syncing the message list after deleting a message from Thunderbird (in
    // which case, the server's sync response will include a `Delete` change for
    // the message we've just deleted).
    return NS_OK;
  }

  return LocalDeleteMessages(mFolder, {existingHeader});
}

NS_IMETHODIMP MessageOperationCallbacks::MaybeDeleteMessageFromStore(
    nsIMsgDBHdr* hdr) {
  NS_ENSURE_ARG_POINTER(hdr);

  uint32_t flags;
  MOZ_TRY(hdr->GetFlags(&flags));

  if (!(flags & nsMsgMessageFlags::Offline)) {
    // Bail early if there's nothing to remove.
    return NS_OK;
  }

  // Delete the message content from the local store.
  nsCOMPtr<nsIMsgPluggableStore> store;
  MOZ_TRY(mFolder->GetMsgStore(getter_AddRefs(store)));
  MOZ_TRY(store->DeleteMessages({hdr}));

  // Update the flags on the database entry to reflect its content is *not*
  // stored offline anymore. We don't commit right now, but the expectation is
  // that the consumer will call `CommitChanges()` once it's done processing the
  // current change.
  uint32_t unused;
  return hdr->AndFlags(~nsMsgMessageFlags::Offline, &unused);
}

NS_IMETHODIMP MessageOperationCallbacks::UpdateReadStatus(
    const nsACString& ewsId, bool is_read) {
  // Get the header for the message with ewsId and update its read flag in the
  // database.
  RefPtr<nsIMsgDBHdr> existingHeader;
  nsresult rv = GetHeaderForItem(ewsId, getter_AddRefs(existingHeader));
  NS_ENSURE_SUCCESS(rv, rv);

  return existingHeader->MarkRead(is_read);
}

NS_IMETHODIMP MessageOperationCallbacks::UpdateSyncState(
    const nsACString& syncStateToken) {
  return mFolder->SetStringProperty(SYNC_STATE_PROPERTY, syncStateToken);
}

nsresult MessageOperationCallbacks::NotifyListener(nsresult rv) {
  if (mUrlListener) {
    nsCOMPtr<nsIURI> folderUri;
    nsresult rv = FolderUri(mFolder, getter_AddRefs(folderUri));
    NS_ENSURE_SUCCESS(rv, rv);
    mUrlListener->OnStopRunningUrl(folderUri, rv);
  }
  return NS_OK;
}

NS_IMETHODIMP MessageOperationCallbacks::OnSyncComplete() {
  NotifyListener(NS_OK);
  mFolder->NotifyFolderEvent(kFolderLoaded);
  return NS_OK;
}

NS_IMETHODIMP MessageOperationCallbacks::OnOperationFailure(nsresult status) {
  NotifyListener(status);
  return NS_OK;
}

NS_IMPL_ADDREF_INHERITED(EwsFolder, nsMsgDBFolder)
NS_IMPL_RELEASE_INHERITED(EwsFolder, nsMsgDBFolder)
NS_IMPL_QUERY_HEAD(EwsFolder)
NS_IMPL_QUERY_TAIL_INHERITING(nsMsgDBFolder)

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
                                        bool resyncNeeded) {
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
                                             bool resyncNeeded) {
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

  nsCOMPtr<IEwsClient> client;
  MOZ_TRY(GetEwsClient(getter_AddRefs(client)));

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
    // Same server copy or move, perform operation remotely.
    nsTArray<nsCString> ewsIds;
    rv = GetEwsIdsForMessageHeaders(aSrcHdrs, ewsIds);
    NS_ENSURE_SUCCESS(rv, rv);

    nsAutoCString destinationFolderId;
    rv = GetEwsId(destinationFolderId);
    NS_ENSURE_SUCCESS(rv, rv);

    const nsCOMPtr<nsIMsgWindow> msgWindow = aMsgWindow;
    const nsCOMPtr<nsIMsgFolder> srcFolder = aSrcFolder;
    const nsCOMPtr<nsIMsgCopyServiceListener> copyListener = aCopyListener;

    const RefPtr<EwsSimpleFailibleMessageListener> listener =
        new EwsSimpleFailibleMessageListener(
            aSrcHdrs,
            [self = RefPtr(this), srcFolder, msgWindow, aIsMove, copyListener](
                const nsTArray<RefPtr<nsIMsgDBHdr>>& srcHdrs,
                const nsTArray<nsCString>& ids, bool resyncNeeded) {
              nsresult rv = NS_OK;

              auto listenerExitGuard =
                  GuardCopyServiceListener(copyListener, rv);

              if (resyncNeeded) {
                rv = self->SyncMessages(msgWindow, nullptr);
                NS_ENSURE_SUCCESS(rv, rv);
              } else {
                // The new IDs were returned from the server. In this case, the
                // order of the new IDs will correspond to the order of the
                // input IDs specified in the initial request.
                NS_ENSURE_TRUE(ids.Length() == srcHdrs.Length(),
                               NS_ERROR_UNEXPECTED);

                /// Copy the messages into the destination folder.
                nsTArray<RefPtr<nsIMsgDBHdr>> newHeaders;
                rv = LocalCopyMessages(srcFolder, self, srcHdrs, newHeaders);
                NS_ENSURE_SUCCESS(rv, rv);
                NS_ENSURE_TRUE(newHeaders.Length() == ids.Length(),
                               NS_ERROR_UNEXPECTED);

                // Set the EWS ID property for each of the new headers.
                for (std::size_t i = 0; i < ids.Length(); ++i) {
                  newHeaders[i]->SetStringProperty(kEwsIdProperty, ids[i]);
                }

                nsCOMPtr<nsIMsgFolderNotificationService> notifier =
                    mozilla::components::FolderNotification::Service();
                rv = notifier->NotifyMsgsMoveCopyCompleted(aIsMove, srcHdrs,
                                                           self, newHeaders);
                NS_ENSURE_SUCCESS(rv, rv);
              }

              // If required, delete the original items from the source folder.
              if (aIsMove) {
                rv = LocalDeleteMessages(srcFolder, srcHdrs);
                NS_ENSURE_SUCCESS(rv, rv);

                srcFolder->NotifyFolderEvent(kDeleteOrMoveMsgCompleted);
              }

              return NotifyMessageCopyServiceComplete(srcFolder, self, NS_OK);
            },
            [self = RefPtr(this), srcFolder, copyListener](nsresult status) {
              if (copyListener) {
                copyListener->OnStopCopy(status);
              }
              return HandleMoveError(srcFolder, self, status);
            });

    if (aIsMove) {
      rv = client->MoveItems(listener, destinationFolderId, ewsIds);
    } else {
      rv = client->CopyItems(listener, destinationFolderId, ewsIds);
    }
    NS_ENSURE_SUCCESS(rv, rv);
  } else {
    // Cross-server copy or move. Instantiate a `MessageCopyHandler` for this
    // operation.
    nsCString ewsId;
    nsresult rv = GetEwsId(ewsId);
    NS_ENSURE_SUCCESS(rv, rv);

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

  if (isSameServer && aIsMoveFolder) {
    // Same server move.
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

    const RefPtr<EwsSimpleFailibleListener> listener =
        new EwsSimpleFailibleListener(
            [self = RefPtr(this), srcFolder, copyListener, msgWindow](
                const nsTArray<nsCString>& ids, bool resyncNeeded) {
              NS_ENSURE_TRUE(ids.Length() == 1, NS_ERROR_UNEXPECTED);

              nsresult rv = NS_OK;

              auto listenerExitGuard =
                  GuardCopyServiceListener(copyListener, rv);

              nsAutoCString name;
              rv = srcFolder->GetName(name);
              NS_ENSURE_SUCCESS(rv, rv);

              LocalRenameOrReparentFolder(srcFolder, self, name, msgWindow);

              nsCOMPtr<nsIMsgFolder> newFolder;
              rv = self->GetChildNamed(name, getter_AddRefs(newFolder));
              NS_ENSURE_SUCCESS(rv, rv);

              if (!newFolder) {
                return rv = NS_ERROR_UNEXPECTED;
              }

              newFolder->SetStringProperty(kEwsIdProperty, ids[0]);

              rv = NotifyMessageCopyServiceComplete(srcFolder, self, NS_OK);
              NS_ENSURE_SUCCESS(rv, rv);

              return NS_OK;
            },
            [self = RefPtr(this), srcFolder, copyListener](nsresult status) {
              if (copyListener) {
                copyListener->OnStopCopy(status);
              }

              return HandleMoveError(srcFolder, self, status);
            });

    client->MoveFolders(listener, destinationEwsId, {sourceEwsId});
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
    nsTArray<nsCString> ewsIds;
    MOZ_TRY(GetEwsIdsForMessageHeaders(aMsgHeaders, ewsIds));

    const nsCOMPtr<nsIMsgCopyServiceListener> copyListener = aCopyListener;

    RefPtr<EwsSimpleMessageListener> listener = new EwsSimpleMessageListener(
        aMsgHeaders, [self = RefPtr(this), copyListener](
                         const nsTArray<RefPtr<nsIMsgDBHdr>>& srcHdrs,
                         const nsTArray<nsCString>& ids, bool resyncNeeded) {
          nsresult rv = NS_OK;
          auto listenerExitGuard = GuardCopyServiceListener(copyListener, rv);
          return LocalDeleteMessages(self, srcHdrs);
        });

    nsCOMPtr<IEwsClient> client;
    rv = GetEwsClient(getter_AddRefs(client));
    NS_ENSURE_SUCCESS(rv, rv);

    return client->DeleteMessages(listener, ewsIds);
  }

  // We're moving the messages to trash folder.
  nsCOMPtr<nsIMsgFolder> trashFolder;
  rv = GetTrashFolder(getter_AddRefs(trashFolder));
  NS_ENSURE_SUCCESS(rv, rv);

  if (!trashFolder) {
    return NS_ERROR_UNEXPECTED;
  }

  return trashFolder->CopyMessages(this, aMsgHeaders, true, aMsgWindow,
                                   aCopyListener, false, false);
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
                                    bool resyncNeeded) {
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

  // Get the EWS ID of the folder to sync (i.e. the current one).
  nsCString ewsId;
  MOZ_TRY(GetEwsId(ewsId));

  // Sync the message list for the current folder.
  nsCOMPtr<IEwsClient> client;
  MOZ_TRY(GetEwsClient(getter_AddRefs(client)));

  auto listener =
      RefPtr(new MessageOperationCallbacks(this, window, urlListener));

  if (urlListener) {
    nsCOMPtr<nsIURI> folderUri;
    rv = FolderUri(this, getter_AddRefs(folderUri));
    NS_ENSURE_SUCCESS(rv, rv);
    rv = urlListener->OnStartRunningUrl(folderUri);
    NS_ENSURE_SUCCESS(rv, rv);
  }
  return client->SyncMessagesForFolder(listener, ewsId, syncStateToken);
}

NS_IMETHODIMP EwsFolder::AddSubfolder(const nsACString& folderName,
                                      nsIMsgFolder** newFolder) {
  NS_ENSURE_ARG_POINTER(newFolder);

  nsresult rv = nsMsgDBFolder::AddSubfolder(folderName, newFolder);
  NS_ENSURE_SUCCESS(rv, rv);

  // When we add a subfolder, we need to make sure the trash folder flags are
  // configured appropriately for the trash folder preference, if it is set.
  if (*newFolder) {
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

    if (trashFolderPath.IsEmpty()) {
      // If we don't have a trash folder preference value set, and this folder
      // has the trash flag set, set the preference value to this folder's path.
      uint32_t flags;
      rv = (*newFolder)->GetFlags(&flags);
      NS_ENSURE_SUCCESS(rv, rv);

      if (flags & nsMsgFolderFlags::Trash) {
        rv = ewsServer->SetTrashFolderPath(folderPath);
        NS_ENSURE_SUCCESS(rv, rv);
      }
    } else if (trashFolderPath.Equals(folderPath)) {
      // If the new folder path matches the trash folder path, ensure the trash
      // folder flag is set for that folder.
      rv = (*newFolder)->SetFlag(nsMsgFolderFlags::Trash);
      NS_ENSURE_SUCCESS(rv, rv);
    } else {
      // The trash folder is set and is not equal to this folder. Clear the
      // trash folder flag.
      rv = (*newFolder)->ClearFlag(nsMsgFolderFlags::Trash);
      NS_ENSURE_SUCCESS(rv, rv);
    }
  }

  return NS_OK;
}
