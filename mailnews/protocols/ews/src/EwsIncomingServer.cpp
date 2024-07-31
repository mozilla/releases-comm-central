/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "EwsIncomingServer.h"

#include "nsIMsgWindow.h"
#include "nsNetUtil.h"
#include "nsPrintfCString.h"
#include "plbase64.h"

#define ID_PROPERTY "ewsId"
#define SYNC_STATE_PROPERTY "ewsSyncStateToken"

class FolderSyncListener : public IEwsFolderCallbacks {
 public:
  NS_DECL_THREADSAFE_ISUPPORTS
  NS_DECL_IEWSFOLDERCALLBACKS

  FolderSyncListener(RefPtr<EwsIncomingServer> server,
                     RefPtr<nsIMsgWindow> window)
      : mServer(std::move(server)), mWindow(std::move(window)) {}

 protected:
  virtual ~FolderSyncListener() = default;

 private:
  RefPtr<EwsIncomingServer> mServer;
  RefPtr<nsIMsgWindow> mWindow;
};

NS_IMPL_ISUPPORTS(FolderSyncListener, IEwsFolderCallbacks)

NS_IMETHODIMP FolderSyncListener::RecordRootFolder(const nsACString& id) {
  RefPtr<nsIMsgFolder> root;
  nsresult rv = mServer->GetRootFolder(getter_AddRefs(root));
  NS_ENSURE_SUCCESS(rv, rv);

  return root->SetStringProperty(ID_PROPERTY, id);
}

NS_IMETHODIMP FolderSyncListener::Create(const nsACString& id,
                                         const nsACString& parentId,
                                         const nsAString& name,
                                         uint32_t flags) {
  return mServer->CreateFolderWithDetails(id, parentId, name, flags);
}

NS_IMETHODIMP FolderSyncListener::Update(const nsACString& id,
                                         const nsACString& name) {
  NS_WARNING(nsPrintfCString("Trying to update folder %s with name %s",
                             id.Data(), name.Data())
                 .get());

  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP FolderSyncListener::Delete(const nsACString& id) {
  NS_WARNING(
      nsPrintfCString("Received delete change for folder with id %s", id.Data())
          .get());

  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP FolderSyncListener::UpdateSyncState(
    const nsACString& syncStateToken) {
  return mServer->SetCharValue(SYNC_STATE_PROPERTY, syncStateToken);
}

NS_IMETHODIMP FolderSyncListener::OnError(IEwsClient::Error err,
                                          const nsACString& desc) {
  NS_ERROR("Error occurred while syncing EWS folders");

  return NS_OK;
}

NS_IMPL_ADDREF_INHERITED(EwsIncomingServer, nsMsgIncomingServer)
NS_IMPL_RELEASE_INHERITED(EwsIncomingServer, nsMsgIncomingServer)
NS_IMPL_QUERY_HEAD(EwsIncomingServer)
NS_IMPL_QUERY_BODY(IEwsIncomingServer)
NS_IMPL_QUERY_TAIL_INHERITING(nsMsgIncomingServer)

EwsIncomingServer::EwsIncomingServer() = default;

EwsIncomingServer::~EwsIncomingServer() {}

/**
 * Creates a new folder with the specified parent, name, and flags.
 */
nsresult EwsIncomingServer::CreateFolderWithDetails(const nsACString& id,
                                                    const nsACString& parentId,
                                                    const nsAString& name,
                                                    uint32_t flags) {
  RefPtr<nsIMsgFolder> parent;
  nsresult rv = FindFolderWithId(parentId, getter_AddRefs(parent));
  NS_ENSURE_SUCCESS(rv, rv);

  // In order to persist the folder, we need to create new storage for it with
  // the message store. This will also take care of adding it as a subfolder of
  // the parent.
  RefPtr<nsIMsgPluggableStore> msgStore;
  rv = GetMsgStore(getter_AddRefs(msgStore));
  NS_ENSURE_SUCCESS(rv, rv);

  RefPtr<nsIMsgFolder> newFolder;
  rv = msgStore->CreateFolder(parent, name, getter_AddRefs(newFolder));
  NS_ENSURE_SUCCESS(rv, rv);

  // Record the EWS ID of the folder so that we can translate between local path
  // and remote ID when needed.
  rv = newFolder->SetStringProperty(ID_PROPERTY, id);
  NS_ENSURE_SUCCESS(rv, rv);

  // The flags we get from the XPCOM code indicate whether this is a well-known
  // folder, such as Inbox, Sent Mail, Trash, etc.
  rv = newFolder->SetFlags(flags);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = newFolder->SetPrettyName(name);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = parent->NotifyFolderAdded(newFolder);
  NS_ENSURE_SUCCESS(rv, rv);

  return NS_OK;
}

/**
 * Locates the folder associated with this server which has the remote (EWS)
 * ID specified, if any.
 */
nsresult EwsIncomingServer::FindFolderWithId(const nsACString& id,
                                             nsIMsgFolder** _retval) {
  // Fail by default; only return success if we actually find the folder we're
  // looking for.
  nsresult failureStatus{NS_ERROR_FAILURE};

  // We do a breadth-first search on subfolders of the root.
  RefPtr<nsIMsgFolder> root;
  nsresult rv = GetRootFolder(getter_AddRefs(root));
  NS_ENSURE_SUCCESS(rv, rv);

  nsTArray<RefPtr<nsIMsgFolder>> foldersToScan;
  foldersToScan.AppendElement(root);

  while (foldersToScan.Length() != 0) {
    nsTArray<RefPtr<nsIMsgFolder>> nextFoldersToScan;

    for (auto folder : foldersToScan) {
      // EWS folder ID is stored as a custom property in the folder store.
      nsCString folderId;
      rv = folder->GetStringProperty(ID_PROPERTY, folderId);

      if (NS_SUCCEEDED(rv) && folderId.Equals(id)) {
        folder.forget(_retval);

        return NS_OK;
      }

      if (NS_FAILED(rv)) {
        // Every EWS folder should have an EWS ID, so we've hit a bug either in
        // recording the IDs on folder creation or in retrieving them from
        // storage.

        // Retrieve the folder's URI as an identifier for logging.
        nsCString uri;
        rv = folder->GetURI(uri);
        if (NS_FAILED(rv)) {
          // If we can't get the URI either, something is seriously wrong.
          NS_ERROR("failed to get ewsId property or URI for folder");
        }

        NS_WARNING(nsPrintfCString("failed to get ewsId property for folder %s",
                                   uri.get())
                       .get());

        // We don't want to fail now in case a properly-constructed subfolder
        // matches the requested ID. Note the failure in case we don't find a
        // match, then continue the search.
        failureStatus = rv;
      }

      // This folder didn't match the ID we want. We'll check any subfolders
      // after we've finished checking everything at the current depth.
      nsTArray<RefPtr<nsIMsgFolder>> subfolders;
      rv = folder->GetSubFolders(subfolders);
      if (NS_SUCCEEDED(rv)) {
        nextFoldersToScan.AppendElements(subfolders);
      } else {
        NS_WARNING("failed to get subfolders for folder");
        failureStatus = rv;
      }
    }

    foldersToScan = std::move(nextFoldersToScan);
  }

  return failureStatus;
}

NS_IMETHODIMP EwsIncomingServer::GetLocalStoreType(
    nsACString& aLocalStoreType) {
  aLocalStoreType.AssignLiteral("ews");

  return NS_OK;
}

NS_IMETHODIMP EwsIncomingServer::GetLocalDatabaseType(
    nsACString& aLocalDatabaseType) {
  aLocalDatabaseType.AssignLiteral("mailbox");

  return NS_OK;
}

NS_IMETHODIMP EwsIncomingServer::GetNewMessages(nsIMsgFolder* aFolder,
                                                nsIMsgWindow* aMsgWindow,
                                                nsIUrlListener* aUrlListener) {
  // Current UX dictates that we ignore the selected folder when getting new
  // messages.

  RefPtr<IEwsClient> client;
  nsresult rv = GetEwsClient(getter_AddRefs(client));
  NS_ENSURE_SUCCESS(rv, rv);

  // EWS provides us an opaque value which specifies the last version of
  // upstream folders we received. Provide that to simplify sync.
  nsCString syncStateToken;
  rv = GetCharValue(SYNC_STATE_PROPERTY, syncStateToken);
  if (NS_FAILED(rv)) {
    syncStateToken = EmptyCString();
  }

  auto listener = RefPtr(new FolderSyncListener(this, RefPtr(aMsgWindow)));
  rv = client->SyncFolderHierarchy(listener, syncStateToken);

  // TODO: Fetch message headers for all folders.

  return rv;
}

NS_IMETHODIMP
EwsIncomingServer::PerformBiff(nsIMsgWindow* aMsgWindow) {
  NS_WARNING("PerformBiff");
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP EwsIncomingServer::PerformExpand(nsIMsgWindow* aMsgWindow) {
  NS_WARNING("PerformExpand");
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP
EwsIncomingServer::VerifyLogon(nsIUrlListener* aUrlListener,
                               nsIMsgWindow* aMsgWindow, nsIURI** _retval) {
  // TODO: Actually verify that logging in works.

  // At this point, consumers are pretty lax about what expected from this
  // method. The URI is returned solely so that consumers can make some minor
  // changes to its in-flight behavior. For EWS, we don't use URLs with side
  // effects, so that's all useless and we can give back whatever we feel like.
  nsCString hostname;
  nsresult rv = GetHostName(hostname);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCString spec;
  spec.AssignLiteral("ews://");
  spec.Append(hostname);

  RefPtr<nsIURI> uri;
  rv = NS_NewURI(getter_AddRefs(uri), spec);
  NS_ENSURE_SUCCESS(rv, rv);

  // Notify the caller that verification has succeeded. This is the one thing we
  // actually need to do to fulfill our contract.
  aUrlListener->OnStopRunningUrl(uri, NS_OK);

  uri.forget(_retval);

  return NS_OK;
}

/**
 * Gets or creates an instance of the EWS client interface, allowing us to
 * perform operations against the relevant EWS instance.
 */
NS_IMETHODIMP EwsIncomingServer::GetEwsClient(IEwsClient** ewsClient) {
  NS_ENSURE_ARG_POINTER(ewsClient);

  nsresult rv;
  nsCOMPtr<IEwsClient> client =
      do_CreateInstance("@mozilla.org/messenger/ews-client;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  // EWS uses an HTTP(S) endpoint for calls rather than a simple hostname. This
  // is stored as a pref against this server.
  nsCString endpoint;
  rv = GetCharValue("ews_url", endpoint);
  NS_ENSURE_SUCCESS(rv, rv);

  // Set up the client object with access details.
  client->Initialize(endpoint, this);
  NS_ENSURE_SUCCESS(rv, rv);

  client.forget(ewsClient);

  return NS_OK;
}
