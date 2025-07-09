/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "EwsIncomingServer.h"

#include "IEwsClient.h"
#include "nsIMsgFolderNotificationService.h"
#include "nsIMsgWindow.h"
#include "nsNetUtil.h"
#include "nsPrintfCString.h"
#include "OfflineStorage.h"
#include "plbase64.h"

#define SYNC_STATE_PROPERTY "ewsSyncStateToken"

constexpr auto kEwsIdProperty = "ewsId";

class FolderSyncListener : public IEwsFolderCallbacks {
 public:
  NS_DECL_THREADSAFE_ISUPPORTS
  NS_DECL_IEWSFOLDERCALLBACKS

  FolderSyncListener(RefPtr<EwsIncomingServer> server,
                     RefPtr<nsIMsgWindow> window,
                     std::function<nsresult()> doneCallback)
      : mServer(std::move(server)),
        mWindow(std::move(window)),
        mDoneCallback(std::move(doneCallback)) {}

 protected:
  virtual ~FolderSyncListener() = default;

 private:
  RefPtr<EwsIncomingServer> mServer;
  RefPtr<nsIMsgWindow> mWindow;

  std::function<nsresult()> mDoneCallback;
};

NS_IMPL_ISUPPORTS(FolderSyncListener, IEwsFolderCallbacks)

NS_IMETHODIMP FolderSyncListener::RecordRootFolder(const nsACString& id) {
  RefPtr<nsIMsgFolder> root;
  nsresult rv = mServer->GetRootFolder(getter_AddRefs(root));
  NS_ENSURE_SUCCESS(rv, rv);

  return root->SetStringProperty(kEwsIdProperty, id);
}

NS_IMETHODIMP FolderSyncListener::Create(const nsACString& id,
                                         const nsACString& parentId,
                                         const nsACString& name,
                                         uint32_t flags) {
  return mServer->MaybeCreateFolderWithDetails(id, parentId, name, flags);
}

NS_IMETHODIMP FolderSyncListener::Update(const nsACString& id,
                                         const nsACString& parentId,
                                         const nsACString& name) {
  return mServer->UpdateFolderWithDetails(id, parentId, name, mWindow);
}

NS_IMETHODIMP FolderSyncListener::Delete(const nsACString& id) {
  return mServer->DeleteFolderWithId(id);
}

NS_IMETHODIMP FolderSyncListener::UpdateSyncState(
    const nsACString& syncStateToken) {
  return mServer->SetStringValue(SYNC_STATE_PROPERTY, syncStateToken);
}

NS_IMETHODIMP FolderSyncListener::OnSuccess() { return mDoneCallback(); }

NS_IMETHODIMP FolderSyncListener::OnError(IEwsClient::Error err,
                                          const nsACString& desc) {
  NS_ERROR(nsPrintfCString("Error occurred while syncing EWS folders: %s",
                           PromiseFlatCString(desc).get())
               .get());

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
 *
 * If a folder with the specified EWS ID already exists, then succeed without
 * creating the folder, assuming the folder has already been created locally and
 * we are processing the corresponding EWS message. If a folder with the same
 * name, but a different EWS ID exists, then return an error.
 */
nsresult EwsIncomingServer::MaybeCreateFolderWithDetails(
    const nsACString& id, const nsACString& parentId, const nsACString& name,
    uint32_t flags) {
  // Check to see if a folder with the same id already exists.
  nsCOMPtr<nsIMsgFolder> existingFolder;
  nsresult rv = FindFolderWithId(id, getter_AddRefs(existingFolder));
  if (NS_SUCCEEDED(rv)) {
    // We found the folder with the specified ID, which means it's already been
    // created locally. This can happen during the normal course of operations,
    // including the most common case in which the user uses thunderbird to
    // create a folder and the next sync includes the record of folder creation
    // from EWS.
    return NS_OK;
  }

  nsCOMPtr<nsIMsgFolder> parent;
  rv = FindFolderWithId(parentId, getter_AddRefs(parent));
  NS_ENSURE_SUCCESS(rv, rv);

  // Check that the parent doesn't already contain a folder with the requested
  // name. In the case where we have a folder with a duplicate name, but either
  // a differing or no EWS ID, we can't sync with the server since the server
  // believes that a folder with the requested name should map to the requested
  // EWS ID, so we signal an error.
  bool containsChildWithRequestedName;
  rv = parent->ContainsChildNamed(name, &containsChildWithRequestedName);
  NS_ENSURE_SUCCESS(rv, rv);
  if (containsChildWithRequestedName) {
    return NS_MSG_CANT_CREATE_FOLDER;
  }

  // In order to persist the folder, we need to create new storage for it with
  // the message store. This will also take care of adding it as a subfolder of
  // the parent.
  nsCOMPtr<nsIMsgPluggableStore> msgStore;
  rv = GetMsgStore(getter_AddRefs(msgStore));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgFolder> newFolder;
  rv = msgStore->CreateFolder(parent, name, getter_AddRefs(newFolder));
  NS_ENSURE_SUCCESS(rv, rv);

  // Record the EWS ID of the folder so that we can translate between local path
  // and remote ID when needed.
  rv = newFolder->SetStringProperty(kEwsIdProperty, id);
  NS_ENSURE_SUCCESS(rv, rv);

  // The flags we get from the XPCOM code indicate whether this is a well-known
  // folder, such as Inbox, Sent Mail, Trash, etc.
  rv = newFolder->SetFlags(flags);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = newFolder->SetName(name);
  NS_ENSURE_SUCCESS(rv, rv);

  // Notify any consumers listening for updates regarding the folder's creation.
  nsCOMPtr<nsIMsgFolderNotificationService> notifier(
      do_GetService("@mozilla.org/messenger/msgnotificationservice;1"));
  if (notifier) notifier->NotifyFolderAdded(newFolder);

  rv = parent->NotifyFolderAdded(newFolder);
  NS_ENSURE_SUCCESS(rv, rv);

  return NS_OK;
}

nsresult EwsIncomingServer::UpdateFolderWithDetails(const nsACString& id,
                                                    const nsACString& parentId,
                                                    const nsACString& name,
                                                    nsIMsgWindow* msgWindow) {
  nsCOMPtr<nsIMsgFolder> folder;
  nsresult rv = FindFolderWithId(id, getter_AddRefs(folder));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgFolder> parentFolder;
  rv = folder->GetParent(getter_AddRefs(parentFolder));
  NS_ENSURE_SUCCESS(rv, rv);

  // Only initiate the move operation if either the name or the parent of the
  // updated folder changed.
  nsAutoCString currentName;
  MOZ_TRY(folder->GetName(currentName));
  nsAutoCString currentParentId;
  MOZ_TRY(parentFolder->GetStringProperty(kEwsIdProperty, currentParentId));

  // If either the parent or the name of the folder changed, then we have to
  // initiate a move of the data for the folder, so we rely on the fact that a
  // move and a rename are the same, except for in the case in which a folder
  // is solely renamed, it doesn't need to be reparented. However, there is no
  // performance difference between a rename and a reparent, so we call the
  // general logic that handles both move and rename here for simplicity.
  nsCOMPtr<nsIMsgFolder> newParentFolder;
  rv = FindFolderWithId(parentId, getter_AddRefs(newParentFolder));
  NS_ENSURE_SUCCESS(rv, rv);

  return LocalRenameOrReparentFolder(folder, newParentFolder, name, msgWindow);
}

/**
 * Deletes the folder with the given remote EWS id.
 */
nsresult EwsIncomingServer::DeleteFolderWithId(const nsACString& id) {
  nsCOMPtr<nsIMsgFolder> folder;
  nsresult rv = FindFolderWithId(id, getter_AddRefs(folder));
  // If we found the folder locally, then delete it. Otherwise, assume it's
  // already been deleted locally.
  if (NS_SUCCEEDED(rv)) {
    // We can't use `DeleteSelf` here because the implementation of `EwsFolder`
    // (which we know is the concrete implementation of `nsIMsgFolder` we are
    // using in the EWS case) will trigger a remote delete on the server. Sync
    // is responding to a remote delete, so we have to get the parent and call
    // `PropagateDelete` directly.
    nsCOMPtr<nsIMsgFolder> parentFolder;
    rv = folder->GetParent(getter_AddRefs(parentFolder));
    NS_ENSURE_SUCCESS(rv, rv);

    rv = parentFolder->PropagateDelete(folder, true);
    NS_ENSURE_SUCCESS(rv, rv);
  }

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
      rv = folder->GetStringProperty(kEwsIdProperty, folderId);

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

nsresult EwsIncomingServer::SyncFolderList(
    nsIMsgWindow* aMsgWindow, std::function<nsresult()> postSyncCallback) {
  // EWS provides us an opaque value which specifies the last version of
  // upstream folders we received. Provide that to simplify sync.
  nsCString syncStateToken;
  nsresult rv = GetStringValue(SYNC_STATE_PROPERTY, syncStateToken);
  if (NS_FAILED(rv)) {
    syncStateToken = EmptyCString();
  }

  // Sync the folder tree for the whole account.
  RefPtr<IEwsClient> client;
  MOZ_TRY(GetEwsClient(getter_AddRefs(client)));
  auto listener = RefPtr(new FolderSyncListener(this, RefPtr(aMsgWindow),
                                                std::move(postSyncCallback)));
  return client->SyncFolderHierarchy(listener, syncStateToken);
}

nsresult EwsIncomingServer::SyncAllFolders(nsIMsgWindow* aMsgWindow) {
  nsCOMPtr<nsIMsgFolder> rootFolder;
  MOZ_TRY(GetRootFolder(getter_AddRefs(rootFolder)));

  nsTArray<RefPtr<nsIMsgFolder>> msgFolders;
  MOZ_TRY(rootFolder->GetDescendants(msgFolders));

  // TODO: For now, we sync every folder at once, but obviously that's not an
  // amazing solution. In the future, we should probably try to maintain some
  // kind of queue so we can properly batch and sync folders. In the meantime,
  // though, the EWS client should handle any kind of rate limiting well enough,
  // so this improvement can come later.
  for (const auto& folder : msgFolders) {
    nsresult rv = folder->GetNewMessages(aMsgWindow, nullptr);
    if (NS_FAILED(rv)) {
      // If we encounter an error, just log it rather than fail the whole sync.
      nsCString name;
      folder->GetName(name);
      NS_ERROR(nsPrintfCString("failed to get new messages for folder %s: %s",
                               name.get(), mozilla::GetStaticErrorName(rv))
                   .get());
    }
  }

  return NS_OK;
}

NS_IMETHODIMP EwsIncomingServer::GetPassword(nsAString& password) {
  nsMsgAuthMethodValue authMethod;
  MOZ_TRY(GetAuthMethod(&authMethod));

  // `nsMsgIncomingServer` doesn't read the password at startup, so we want to
  // ensure we have read its value from the logins manager at least once. If it
  // changes, `GetPasswordWithUI` (implemented in `nsMsgIncomingServer` too)
  // takes care of updating `m_password`.
  if (m_password.IsEmpty() &&
      authMethod == nsMsgAuthMethod::passwordCleartext) {
    MOZ_TRY(GetPasswordWithoutUI());
  }

  return nsMsgIncomingServer::GetPassword(password);
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

NS_IMETHODIMP EwsIncomingServer::GetCanBeDefaultServer(
    bool* canBeDefaultServer) {
  NS_ENSURE_ARG_POINTER(canBeDefaultServer);
  *canBeDefaultServer = true;
  return NS_OK;
}

NS_IMETHODIMP EwsIncomingServer::GetNewMessages(nsIMsgFolder* aFolder,
                                                nsIMsgWindow* aMsgWindow,
                                                nsIUrlListener* aUrlListener) {
  // Explicitly make the parameters to the lambda `nsCOMPtr`s, otherwise the
  // clang plugin will think we're trying to bypass the ref counting.
  nsCOMPtr<nsIMsgFolder> folder = aFolder;
  nsCOMPtr<nsIMsgWindow> window = aMsgWindow;
  nsCOMPtr<nsIUrlListener> urlListener = aUrlListener;

  // Sync the folder list for the account, then sync the message list for the
  // specific folder.
  return SyncFolderList(
      aMsgWindow, [self = RefPtr(this), folder, window, urlListener]() {
        // Check if we're getting messages for the whole
        // folder here. If so, the intent is likely that the
        // user wants to synchronize all the folders on the
        // account.
        bool isServer;
        nsresult rv = folder->GetIsServer(&isServer);
        NS_ENSURE_SUCCESS(rv, rv);

        if (isServer) {
          return self->SyncAllFolders(window);
        }

        // Synchronizing the folder list may have invalidated the folder that
        // sync was selected for by moving the folder to a new location. If that
        // is the case, then the EWS ID will be invalidated and we can no longer
        // sync that folder.
        nsAutoCString originalEwsId;
        rv = folder->GetStringProperty(kEwsIdProperty, originalEwsId);
        if (NS_FAILED(rv)) {
          // Assume the original folder moved and return success.
          return NS_OK;
        }

        // If this is not the root folder, synchronize its
        // message list normally.
        return folder->GetNewMessages(window, urlListener);
      });
}

NS_IMETHODIMP EwsIncomingServer::PerformBiff(nsIMsgWindow* aMsgWindow) {
  nsCOMPtr<nsIMsgWindow> window = aMsgWindow;

  // Sync the folder list for the account. Then sync the message list of each
  // folder in the tree.
  return SyncFolderList(aMsgWindow, [self = RefPtr(this), window]() {
    return self->SyncAllFolders(window);
  });
}

NS_IMETHODIMP EwsIncomingServer::PerformExpand(nsIMsgWindow* aMsgWindow) {
  // Sync the folder list; we don't want to do antyhing after that so we just
  // pass a no-op lambda.
  return SyncFolderList(aMsgWindow, []() { return NS_OK; });
}

NS_IMETHODIMP
EwsIncomingServer::VerifyLogon(nsIUrlListener* aUrlListener,
                               nsIMsgWindow* aMsgWindow, nsIURI** _retval) {
  NS_ENSURE_ARG_POINTER(aUrlListener);

  // Perform a connectivity check via an EWS client. Ideally we should set
  // `_retval` to something non-null. But we don't have a good value for it, and
  // the `ConfigVerifier` (which this call very likely originates from) will
  // only be doing `nsIMsgMailNewsUrl`-related operations to it, which doesn't
  // apply to us.
  RefPtr<IEwsClient> client;
  MOZ_TRY(GetEwsClient(getter_AddRefs(client)));
  return client->CheckConnectivity(aUrlListener, _retval);
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
  rv = GetStringValue("ews_url", endpoint);
  NS_ENSURE_SUCCESS(rv, rv);

  // Set up the client object with access details.
  rv = client->Initialize(endpoint, this);
  NS_ENSURE_SUCCESS(rv, rv);

  client.forget(ewsClient);

  return NS_OK;
}
