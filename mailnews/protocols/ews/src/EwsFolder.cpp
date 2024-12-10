/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "EwsFolder.h"

#include "ErrorList.h"
#include "IEwsClient.h"
#include "IEwsIncomingServer.h"
#include "MailNewsTypes.h"
#include "nsIMsgDatabase.h"
#include "nsIMsgPluggableStore.h"
#include "nsString.h"
#include "nsMsgFolderFlags.h"
#include "nsIInputStream.h"
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
  nsresult rv;

  nsTArray<RefPtr<nsIMsgDBHdr>> offlineMessages;
  nsTArray<nsMsgKey> msgKeys;

  // Collect keys for messages which need deletion from our message listing. We
  // also collect a list of messages for which we have a full local copy which
  // needs deletion.
  for (const auto& header : mHeaders) {
    nsMsgKey msgKey;
    rv = header->GetMessageKey(&msgKey);
    NS_ENSURE_SUCCESS(rv, rv);

    msgKeys.AppendElement(msgKey);

    bool hasOffline;
    rv = mFolder->HasMsgOffline(msgKey, &hasOffline);
    NS_ENSURE_SUCCESS(rv, rv);

    if (hasOffline) {
      offlineMessages.AppendElement(header);
    }
  }

  // Delete any locally-stored message from the store.
  if (offlineMessages.Length()) {
    nsCOMPtr<nsIMsgPluggableStore> store;
    rv = mFolder->GetMsgStore(getter_AddRefs(store));
    NS_ENSURE_SUCCESS(rv, rv);

    rv = store->DeleteMessages(offlineMessages);
    NS_ENSURE_SUCCESS(rv, rv);
  }

  // Delete the message headers from the database. If a key in the array is
  // unknown to the database, it's simply ignored.
  nsCOMPtr<nsIMsgDatabase> db;
  rv = mFolder->GetMsgDatabase(getter_AddRefs(db));
  NS_ENSURE_SUCCESS(rv, rv);

  return db->DeleteMessages(msgKeys, nullptr);
}

NS_IMETHODIMP MessageDeletionCallbacks::OnError(IEwsClient::Error err,
                                                const nsACString& desc) {
  NS_ERROR("Error occurred while deleting EWS messages");

  return NS_OK;
}

class MessageCreateCallbacks : public IEWSMessageCreateCallbacks {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_IEWSMESSAGECREATECALLBACKS

  MessageCreateCallbacks(EwsFolder* folder, nsIFile* file,
                         nsIMsgCopyServiceListener* copyListener)
      : mFolder(folder), mFile(file), mCopyListener(copyListener) {}

 protected:
  virtual ~MessageCreateCallbacks() = default;

 private:
  RefPtr<EwsFolder> mFolder;
  nsCOMPtr<nsIFile> mFile;
  nsCOMPtr<nsIMsgCopyServiceListener> mCopyListener;
};

NS_IMPL_ISUPPORTS(MessageCreateCallbacks, IEWSMessageCreateCallbacks)

NS_IMETHODIMP MessageCreateCallbacks::OnRemoteCreateSuccessful(
    const nsACString& ewsId, nsIMsgDBHdr** newHdr) {
  // Open an input stream on the file.
  nsCOMPtr<nsIInputStream> inputStream;
  nsresult rv = NS_NewLocalFileInputStream(getter_AddRefs(inputStream), mFile);
  NS_ENSURE_SUCCESS(rv, rv);

  // Create a new header in the database for this message. We could do it in one
  // go via `nsIMsgPluggableStore::GetNewMsgOutputStream`, but we'll want the
  // message database and store to be more decoupled going forwards.
  nsCOMPtr<nsIMsgDatabase> msgDB;
  rv = mFolder->GetMsgDatabase(getter_AddRefs(msgDB));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgDBHdr> hdr;
  rv = msgDB->CreateNewHdr(nsMsgKey_None, getter_AddRefs(hdr));
  NS_ENSURE_SUCCESS(rv, rv);

  // Create a new output stream to the folder's message store.
  nsCOMPtr<nsIOutputStream> outStream;
  rv = mFolder->GetOfflineStoreOutputStream(hdr, getter_AddRefs(outStream));
  NS_ENSURE_SUCCESS(rv, rv);

  // Stream the message content to the store.
  uint64_t bytesCopied;
  rv = SyncCopyStream(inputStream, outStream, bytesCopied);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgPluggableStore> store;
  rv = mFolder->GetMsgStore(getter_AddRefs(store));
  NS_ENSURE_SUCCESS(rv, rv);

  rv = store->FinishNewMessage(outStream, hdr);
  NS_ENSURE_SUCCESS(rv, rv);

  // Udpate some of the header's metadata, such as the size, the offline flag
  // and the EWS ID.
  rv = hdr->SetMessageSize(bytesCopied);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = hdr->SetOfflineMessageSize(bytesCopied);
  NS_ENSURE_SUCCESS(rv, rv);

  uint32_t unused;
  rv = hdr->OrFlags(nsMsgMessageFlags::Offline, &unused);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = hdr->SetStringProperty(ID_PROPERTY, ewsId);
  NS_ENSURE_SUCCESS(rv, rv);

  // Return the newly-created header so that the consumer can update it with
  // metadata from the message headers before adding it to the message database.
  hdr.forget(newHdr);

  return NS_OK;
}

NS_IMETHODIMP MessageCreateCallbacks::CommitHeader(nsIMsgDBHdr* hdr) {
  nsCOMPtr<nsIMsgDatabase> msgDB;
  nsresult rv = mFolder->GetMsgDatabase(getter_AddRefs(msgDB));
  NS_ENSURE_SUCCESS(rv, rv);

  rv = msgDB->AddNewHdrToDB(hdr, true);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = msgDB->Commit(nsMsgDBCommitType::kLargeCommit);
  NS_ENSURE_SUCCESS(rv, rv);

  return NS_OK;
}

NS_IMETHODIMP MessageCreateCallbacks::OnStartCreate() {
  return mCopyListener->OnStartCopy();
}

NS_IMETHODIMP MessageCreateCallbacks::SetMessageKey(nsMsgKey aKey) {
  return mCopyListener->SetMessageKey(aKey);
}

NS_IMETHODIMP MessageCreateCallbacks::OnStopCreate(nsresult status) {
  nsresult rv = mCopyListener->OnStopCopy(status);
  NS_ENSURE_SUCCESS(rv, rv);

  // Note: at some point this will need to call
  // `nsMsgCopyService::NotifyCompletion` to let the copy service it can dequeue
  // the copy request. There seems to be a trick to it, so we'll take a look at
  // it in a later step, see
  // https://bugzilla.mozilla.org/show_bug.cgi?id=1931599
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

NS_IMETHODIMP MessageOperationCallbacks::CommitHeader(nsIMsgDBHdr* hdr) {
  RefPtr<nsIMsgDatabase> db;
  nsresult rv = mFolder->GetMsgDatabase(getter_AddRefs(db));
  NS_ENSURE_SUCCESS(rv, rv);

  return db->AddNewHdrToDB(hdr, true);
}

NS_IMETHODIMP MessageOperationCallbacks::CreateNewHeaderForItem(
    const nsACString& ewsId, nsIMsgDBHdr** _retval) {
  RefPtr<nsIMsgDatabase> db;
  nsresult rv = mFolder->GetMsgDatabase(getter_AddRefs(db));
  NS_ENSURE_SUCCESS(rv, rv);

  RefPtr<nsIMsgDBHdr> existingHeader;
  rv = db->GetMsgHdrForEwsItemID(ewsId, getter_AddRefs(existingHeader));
  NS_ENSURE_SUCCESS(rv, rv);

  if (existingHeader.get() != nullptr) {
    // If the header already exists, don't create a new one.
    *_retval = nullptr;
    return NS_OK;
  }

  RefPtr<nsIMsgDBHdr> newHeader;
  rv = db->CreateNewHdr(nsMsgKey_None, getter_AddRefs(newHeader));
  NS_ENSURE_SUCCESS(rv, rv);

  rv = newHeader->SetStringProperty(ID_PROPERTY, ewsId);
  NS_ENSURE_SUCCESS(rv, rv);

  newHeader.forget(_retval);
  return NS_OK;
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

class DeleteFolderCallbacks : public IEwsDeleteFolderCallbacks {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_IEWSDELETEFOLDERCALLBACKS

  DeleteFolderCallbacks(EwsFolder* folder, nsIMsgWindow* window)
      : mFolder(folder), mWindow(window) {}

 protected:
  virtual ~DeleteFolderCallbacks() = default;

 private:
  RefPtr<EwsFolder> mFolder;
  RefPtr<nsIMsgWindow> mWindow;
};

NS_IMPL_ISUPPORTS(DeleteFolderCallbacks, IEwsDeleteFolderCallbacks)

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

NS_IMETHODIMP EwsFolder::CreateSubfolder(const nsAString& folderName,
                                         nsIMsgWindow* msgWindow) {
  NS_WARNING("CreateSubfolder");
  return NS_ERROR_NOT_IMPLEMENTED;
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

NS_IMETHODIMP EwsFolder::GetFolderURL(nsACString& aFolderURL) {
  NS_WARNING("GetFolderURL");
  return NS_ERROR_NOT_IMPLEMENTED;
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
  nsCString ewsId;
  nsresult rv = GetEwsId(ewsId);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIInputStream> inputStream;
  rv = NS_NewLocalFileInputStream(getter_AddRefs(inputStream), aFile);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<IEwsClient> client;
  rv = GetEwsClient(getter_AddRefs(client));
  NS_ENSURE_SUCCESS(rv, rv);

  RefPtr<MessageCreateCallbacks> ewsListener =
      new MessageCreateCallbacks(this, aFile, copyListener);
  return client->CreateMessage(ewsId, isDraftOrTemplate, inputStream,
                               ewsListener);
}

NS_IMETHODIMP EwsFolder::DeleteMessages(
    nsTArray<RefPtr<nsIMsgDBHdr>> const& msgHeaders, nsIMsgWindow* msgWindow,
    bool deleteStorage, bool isMove, nsIMsgCopyServiceListener* listener,
    bool allowUndo) {
  nsresult rv;

  if (deleteStorage) {
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

  return NS_OK;
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
