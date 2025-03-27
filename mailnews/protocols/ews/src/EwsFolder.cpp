/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "EwsFolder.h"

#include "IEwsClient.h"
#include "IEwsIncomingServer.h"
#include "EwsMessageCopyHandler.h"

#include "ErrorList.h"
#include "FolderCompactor.h"
#include "MailNewsTypes.h"
#include "nsIMsgCopyService.h"
#include "nsIMsgDatabase.h"
#include "nsIMsgPluggableStore.h"
#include "nsString.h"
#include "nsMsgFolderFlags.h"
#include "nsIMsgCopyService.h"
#include "nsIMsgWindow.h"
#include "nsMsgUtils.h"
#include "nsNetUtil.h"
#include "nsPrintfCString.h"
#include "nscore.h"

#define kEWSRootURI "ews:/"
#define kEWSMessageRootURI "ews-message:/"

#define ID_PROPERTY "ewsId"
#define SYNC_STATE_PROPERTY "ewsSyncStateToken"

class FolderCreateCallbacks : public IEwsFolderCreateCallbacks {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_IEWSFOLDERCREATECALLBACKS

  FolderCreateCallbacks(EwsFolder* parentFolder, const nsACString& folderName)
      : mParentFolder(parentFolder), mFolderName(folderName) {}

 protected:
  virtual ~FolderCreateCallbacks() = default;

 private:
  RefPtr<EwsFolder> mParentFolder;
  const nsCString mFolderName;
};

NS_IMPL_ISUPPORTS(FolderCreateCallbacks, IEwsFolderCreateCallbacks)

NS_IMETHODIMP FolderCreateCallbacks::OnSuccess(const nsACString& id) {
  nsCOMPtr<nsIMsgPluggableStore> msgStore;
  nsresult rv = mParentFolder->GetMsgStore(getter_AddRefs(msgStore));
  NS_ENSURE_SUCCESS(rv, rv);

  // Initialize storage and memory for the new folder and register it with the
  // parent folder.
  nsCOMPtr<nsIMsgFolder> newFolder;
  rv = msgStore->CreateFolder(mParentFolder, mFolderName,
                              getter_AddRefs(newFolder));
  NS_ENSURE_SUCCESS(rv, rv);

  rv = newFolder->SetStringProperty(ID_PROPERTY, id);
  NS_ENSURE_SUCCESS(rv, rv);

  // Notify any consumers listening for updates on the parent folder that we've
  // added the new folder.
  return mParentFolder->NotifyFolderAdded(newFolder);
}

NS_IMETHODIMP FolderCreateCallbacks::OnError(IEwsClient::Error err,
                                             const nsACString& desc) {
  NS_ERROR("Error occurred while creating EWS folder");

  return NS_OK;
}

class MessageDeletionCallbacks : public IEwsMessageDeleteCallbacks {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_IEWSMESSAGEDELETECALLBACKS

  MessageDeletionCallbacks(EwsFolder* folder,
                           const nsTArray<RefPtr<nsIMsgDBHdr>>& headers)
      : mFolder(folder), mHeaders(headers.Clone()) {}

 protected:
  virtual ~MessageDeletionCallbacks() = default;

 private:
  // The folder to delete messages from.
  RefPtr<EwsFolder> mFolder;

  // The headers of the messages for which deletion has been requested. At this
  // point, we don't know if all of these messages are stored locally.
  nsTArray<RefPtr<nsIMsgDBHdr>> mHeaders;
};

NS_IMPL_ISUPPORTS(MessageDeletionCallbacks, IEwsMessageDeleteCallbacks)

NS_IMETHODIMP MessageDeletionCallbacks::OnRemoteDeleteSuccessful() {
  return mFolder->LocalDeleteMessages(mHeaders);
}

NS_IMETHODIMP MessageDeletionCallbacks::OnError(IEwsClient::Error err,
                                                const nsACString& desc) {
  NS_ERROR("Error occurred while deleting EWS messages");

  return NS_OK;
}

class MessageOperationCallbacks : public IEwsMessageCallbacks {
 public:
  NS_DECL_THREADSAFE_ISUPPORTS
  NS_DECL_IEWSMESSAGECALLBACKS

  MessageOperationCallbacks(EwsFolder* folder, nsIMsgWindow* window)
      : mFolder(folder), mWindow(window) {}

 protected:
  virtual ~MessageOperationCallbacks() = default;

 private:
  RefPtr<EwsFolder> mFolder;
  RefPtr<nsIMsgWindow> mWindow;
};

NS_IMPL_ISUPPORTS(MessageOperationCallbacks, IEwsMessageCallbacks)

NS_IMETHODIMP MessageOperationCallbacks::SaveNewHeader(nsIMsgDBHdr* hdr) {
  RefPtr<nsIMsgDatabase> db;
  nsresult rv = mFolder->GetMsgDatabase(getter_AddRefs(db));
  NS_ENSURE_SUCCESS(rv, rv);

  return db->AddNewHdrToDB(hdr, true);
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

  MOZ_TRY(newHeader->SetStringProperty(ID_PROPERTY, ewsId));

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

  return mFolder->LocalDeleteMessages({existingHeader});
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
  rv = GetHeaderForItem(ewsId, getter_AddRefs(existingHeader));
  NS_ENSURE_SUCCESS(rv, rv);

  return existingHeader->MarkRead(is_read);
}

NS_IMETHODIMP MessageOperationCallbacks::UpdateSyncState(
    const nsACString& syncStateToken) {
  return mFolder->SetStringProperty(SYNC_STATE_PROPERTY, syncStateToken);
}

NS_IMETHODIMP MessageOperationCallbacks::OnError(IEwsClient::Error err,
                                                 const nsACString& desc) {
  NS_ERROR("Error occurred while syncing EWS messages");

  return NS_OK;
}

class DeleteFolderCallbacks : public IEwsFolderDeleteCallbacks {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_IEWSFOLDERDELETECALLBACKS

  DeleteFolderCallbacks(EwsFolder* folder, nsIMsgWindow* window)
      : mFolder(folder), mWindow(window) {}

 protected:
  virtual ~DeleteFolderCallbacks() = default;

 private:
  RefPtr<EwsFolder> mFolder;
  RefPtr<nsIMsgWindow> mWindow;
};

NS_IMPL_ISUPPORTS(DeleteFolderCallbacks, IEwsFolderDeleteCallbacks)

NS_IMETHODIMP DeleteFolderCallbacks::OnRemoteDeleteFolderSuccessful() {
  return mFolder->nsMsgDBFolder::DeleteSelf(mWindow);
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

NS_IMETHODIMP EwsFolder::CreateSubfolder(const nsACString& folderName,
                                         nsIMsgWindow* msgWindow) {
  nsCString ewsId;
  nsresult rv = GetEwsId(ewsId);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<IEwsClient> client;
  rv = GetEwsClient(getter_AddRefs(client));
  NS_ENSURE_SUCCESS(rv, rv);

  RefPtr<FolderCreateCallbacks> callbacks =
      new FolderCreateCallbacks(this, folderName);

  return client->CreateFolder(ewsId, folderName, callbacks);
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
  // Delegate folder sync/message fetching to the incoming server. We have no
  // need for divergent behavior.
  nsCOMPtr<nsIMsgIncomingServer> server;
  nsresult rv = GetServer(getter_AddRefs(server));
  NS_ENSURE_SUCCESS(rv, rv);

  return server->GetNewMessages(this, aWindow, aListener);
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
    rv = msg->GetStringProperty(ID_PROPERTY, itemId);
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
  nsCOMPtr<IEwsClient> client;
  nsresult rv = GetEwsClient(getter_AddRefs(client));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCString ewsId;
  rv = GetEwsId(ewsId);
  NS_ENSURE_SUCCESS(rv, rv);

  // EWS provides us an opaque value which specifies the last version of
  // upstream messages we received. Provide that to simplify sync.
  nsCString syncStateToken;
  rv = GetStringProperty(SYNC_STATE_PROPERTY, syncStateToken);
  if (NS_FAILED(rv)) {
    syncStateToken = EmptyCString();
  }

  auto listener = RefPtr(new MessageOperationCallbacks(this, aWindow));
  return client->SyncMessagesForFolder(listener, ewsId, syncStateToken);
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
    nsIMsgFolder* srcFolder, nsTArray<RefPtr<nsIMsgDBHdr>> const& srcHdrs,
    bool isMove, nsIMsgWindow* msgWindow, nsIMsgCopyServiceListener* listener,
    bool isFolder, bool allowUndo) {
  NS_ENSURE_ARG_POINTER(srcFolder);

  // Instantiate a `MessageCopyHandler` for this operation.
  nsCString ewsId;
  nsresult rv = GetEwsId(ewsId);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<IEwsClient> client;
  MOZ_TRY(GetEwsClient(getter_AddRefs(client)));

  RefPtr<MessageCopyHandler> handler = new MessageCopyHandler(
      srcFolder, this, srcHdrs, isMove, msgWindow, ewsId, client, listener);

  // `isFolder` indicates we're moving/copying the whole folder.
  if (isFolder) {
    NS_ERROR("Move/Copy of whole folders is not supported yet");
    return handler->OnCopyCompleted(NS_ERROR_NOT_IMPLEMENTED);
  }

  // Make sure we're not moving/copying to the root folder for the server, since
  // it cannot hold messages.
  bool isServer;
  MOZ_TRY(GetIsServer(&isServer));
  if (isServer) {
    NS_ERROR("Destination is the root folder. Cannot move/copy here");
    return handler->OnCopyCompleted(NS_ERROR_FAILURE);
  }

  // Start the copy for the first message. Once this copy has finished, the
  // `MessageCopyHandler` will automatically start the copy for the next message
  // in line, and so on until every message in `srcHdrs` have been copied.
  rv = handler->StartCopyingNextMessage();
  if (NS_FAILED(rv)) {
    // If setting up the operation has failed, send the relevant notifications
    // before exiting.
    handler->OnCopyCompleted(rv);
  }

  return rv;
}

NS_IMETHODIMP EwsFolder::DeleteMessages(
    nsTArray<RefPtr<nsIMsgDBHdr>> const& msgHeaders, nsIMsgWindow* msgWindow,
    bool deleteStorage, bool isMove, nsIMsgCopyServiceListener* listener,
    bool allowUndo) {
  nsresult rv;

  bool isTrashFolder = mFlags & nsMsgFolderFlags::Trash;

  // If we're performing a "hard" delete, or if we're deleting from the trash
  // folder, perform a "real" deletion (i.e. delete the messages from both the
  // storage and the server).
  if (deleteStorage || isTrashFolder) {
    // Iterate through the message headers to get the EWS IDs to delete.
    nsTArray<nsCString> ewsIds;
    for (const auto& header : msgHeaders) {
      nsCString ewsId;
      rv = header->GetStringProperty(ID_PROPERTY, ewsId);
      NS_ENSURE_SUCCESS(rv, rv);

      if (ewsId.IsEmpty()) {
        NS_WARNING("Skipping header without EWS ID");
        continue;
      }

      ewsIds.AppendElement(ewsId);
    }

    RefPtr<MessageDeletionCallbacks> ewsMsgListener =
        new MessageDeletionCallbacks(this, msgHeaders);

    nsCOMPtr<IEwsClient> client;
    rv = GetEwsClient(getter_AddRefs(client));
    NS_ENSURE_SUCCESS(rv, rv);

    return client->DeleteMessages(ewsIds, ewsMsgListener);
  }

  // We're moving the messages to trash folder. Start by kicking off a copy.
  nsCOMPtr<nsIMsgFolder> trashFolder;
  MOZ_TRY(GetTrashFolder(getter_AddRefs(trashFolder)));

  nsCOMPtr<nsIMsgCopyService> copyService =
      do_GetService("@mozilla.org/messenger/messagecopyservice;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  // When the copy completes, DeleteMessages() will be called again (with
  // `isMove` and `deleteStorage` set to `true`) to perform the actual delete.
  return copyService->CopyMessages(this, msgHeaders, trashFolder, true,
                                   listener, msgWindow, allowUndo);
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

  RefPtr<DeleteFolderCallbacks> ewsFolderListener =
      new DeleteFolderCallbacks(this, aWindow);

  return client->DeleteFolder(ewsFolderListener, folderId);
}

NS_IMETHODIMP EwsFolder::GetDeletable(bool* deletable) {
  NS_ENSURE_ARG_POINTER(deletable);

  bool isServer;
  nsresult rv = GetIsServer(&isServer);
  NS_ENSURE_SUCCESS(rv, rv);

  *deletable = !(isServer || (mFlags & nsMsgFolderFlags::SpecialUse));
  return NS_OK;
}

nsresult EwsFolder::LocalDeleteMessages(
    const nsTArray<RefPtr<nsIMsgDBHdr>>& messages) {
  nsresult rv;

  nsTArray<RefPtr<nsIMsgDBHdr>> offlineMessages;
  nsTArray<nsMsgKey> msgKeys;

  // Collect keys for messages which need deletion from our message listing.
  // We also collect a list of messages for which we have a full local copy
  // which needs deletion.
  for (const auto& message : messages) {
    nsMsgKey msgKey;
    rv = message->GetMessageKey(&msgKey);
    NS_ENSURE_SUCCESS(rv, rv);

    msgKeys.AppendElement(msgKey);

    bool hasOffline;
    rv = HasMsgOffline(msgKey, &hasOffline);
    NS_ENSURE_SUCCESS(rv, rv);

    if (hasOffline) {
      offlineMessages.AppendElement(message);
    }
  }

  // Delete any locally-stored message from the store.
  if (offlineMessages.Length()) {
    nsCOMPtr<nsIMsgPluggableStore> store;
    rv = GetMsgStore(getter_AddRefs(store));
    NS_ENSURE_SUCCESS(rv, rv);

    rv = store->DeleteMessages(offlineMessages);
    NS_ENSURE_SUCCESS(rv, rv);
  }

  // Delete the message headers from the database. If a key in the array is
  // unknown to the database, it's simply ignored.
  nsCOMPtr<nsIMsgDatabase> db;
  rv = GetMsgDatabase(getter_AddRefs(db));
  NS_ENSURE_SUCCESS(rv, rv);

  return db->DeleteMessages(msgKeys, nullptr);
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
      // change the expungedBytes count (via Expunge flag in X-Mozilla-Status).
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
  nsresult rv = GetStringProperty(ID_PROPERTY, ewsId);
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
