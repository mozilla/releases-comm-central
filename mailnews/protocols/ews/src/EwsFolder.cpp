/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "EwsFolder.h"

#include "ErrorList.h"
#include "IEwsClient.h"
#include "IEwsIncomingServer.h"
#include "MailNewsTypes.h"
#include "nsIInputStream.h"
#include "nsIMsgWindow.h"
#include "nsNetUtil.h"
#include "nsPrintfCString.h"
#include "nscore.h"

#define kEWSRootURI "ews:/"
#define kEWSMessageRootURI "ews-message:/"

#define ID_PROPERTY "ewsId"
#define SYNC_STATE_PROPERTY "ewsSyncStateToken"

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

  auto ewsMsgListener = RefPtr(new MessageOperationCallbacks(this, msgWindow));
  return client->SaveMessage(ewsId, isDraftOrTemplate, inputStream,
                               copyListener, ewsMsgListener);
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
