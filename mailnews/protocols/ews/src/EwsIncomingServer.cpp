/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "EwsIncomingServer.h"

#include <utility>

#include "EwsListeners.h"
#include "IEwsClient.h"
#include "nsIMsgFolderNotificationService.h"
#include "nsIMsgStatusFeedback.h"
#include "nsIMsgWindow.h"
#include "nsIProgressEventSink.h"
#include "nsMsgFolderFlags.h"
#include "nsMsgUtils.h"
#include "nsNetUtil.h"
#include "nsPrintfCString.h"
#include "OfflineStorage.h"
#include "mozilla/Components.h"
#include "mozilla/intl/Localization.h"

using namespace mozilla;

static constexpr auto kDeleteModelPreferenceName = "delete_model";
static constexpr auto kTrashFolderPreferenceName = "trash_folder_path";

constexpr auto kSyncStateTokenProperty = "ewsSyncStateToken";
constexpr auto kEwsIdProperty = "ewsId";

namespace {

class EwsBiffUrlListener : public nsIUrlListener {
 public:
  static nsresult ForFolders(RefPtr<EwsIncomingServer> server,
                             nsTArray<RefPtr<nsIMsgFolder>> folders,
                             EwsBiffUrlListener** newListener) {
    NS_ENSURE_ARG_POINTER(newListener);
    nsresult rv = NS_OK;
    nsTArray<nsCString> uris(folders.Length());
    for (auto&& folder : folders) {
      nsAutoCString folderUri;
      rv = folder->GetURI(folderUri);
      NS_ENSURE_SUCCESS(rv, rv);
      uris.AppendElement(std::move(folderUri));
    }

    RefPtr<EwsBiffUrlListener> listener =
        new EwsBiffUrlListener(std::move(server), std::move(uris));
    listener.forget(newListener);
    return NS_OK;
  }

  NS_DECL_ISUPPORTS;
  NS_DECL_NSIURLLISTENER;

 protected:
  virtual ~EwsBiffUrlListener() = default;

 private:
  EwsBiffUrlListener(RefPtr<EwsIncomingServer> server,
                     nsTArray<nsCString> syncFolderUris)
      : mServer(std::move(server)) {
    for (auto&& folderUri : syncFolderUris) {
      mCompletionStates.InsertOrUpdate(folderUri, false);
    }
  }

  RefPtr<EwsIncomingServer> mServer;
  nsTHashMap<nsCString, bool> mCompletionStates;
};

NS_IMPL_ISUPPORTS(EwsBiffUrlListener, nsIUrlListener);

NS_IMETHODIMP EwsBiffUrlListener::OnStartRunningUrl(nsIURI* uri) {
  return NS_OK;
}

NS_IMETHODIMP EwsBiffUrlListener::OnStopRunningUrl(nsIURI* uri,
                                                   nsresult exitCode) {
  nsAutoCString uriString;
  nsresult rv = uri->GetSpec(uriString);
  NS_ENSURE_SUCCESS(rv, rv);

  if (auto lookup = mCompletionStates.Lookup(uriString); lookup) {
    lookup.Data() = true;
  }

  bool allDone = true;
  for (auto&& entry : mCompletionStates) {
    if (!entry.GetData()) {
      allDone = false;
      break;
    }
  }

  if (allDone) {
    mServer->SetPerformingBiff(false);
  }

  return NS_OK;
}

}  // namespace

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

  if (flags & nsMsgFolderFlags::Trash) {
    nsAutoCString folderPath;
    rv = FolderPathInServer(newFolder, folderPath);
    NS_ENSURE_SUCCESS(rv, rv);
    rv = SetTrashFolderPath(folderPath);
    NS_ENSURE_SUCCESS(rv, rv);
  }

  // Notify any consumers listening for updates regarding the folder's creation.
  nsCOMPtr<nsIMsgFolderNotificationService> notifier =
      mozilla::components::FolderNotification::Service();
  notifier->NotifyFolderAdded(newFolder);

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

NS_IMETHODIMP EwsIncomingServer::GetPort(int32_t* aPort) {
  NS_ENSURE_ARG_POINTER(aPort);

  nsCString ewsURL;
  nsresult rv = GetEwsUrl(ewsURL);
  NS_ENSURE_SUCCESS(rv, rv);

  int32_t port = -1;

  // We might not have a valid URL yet.
  if (!ewsURL.IsEmpty()) {
    nsCOMPtr<nsIURI> uri;
    rv = NS_NewURI(getter_AddRefs(uri), ewsURL);

    // We might have a URL that's invalid (e.g. set by a test).
    if (NS_SUCCEEDED(rv)) {
      rv = uri->GetPort(&port);
      NS_ENSURE_SUCCESS(rv, rv);
    }
  }

  if (port < 0) {
    // If we don't have a valid URL yet, or it doesn't specify a port, default
    // to the relevant one (as per the socket type).
    nsMsgSocketTypeValue socketType;
    rv = GetSocketType(&socketType);
    NS_ENSURE_SUCCESS(rv, rv);

    port = socketType == nsMsgSocketType::SSL ? 443 : 80;
  }

  *aPort = port;
  return NS_OK;
}

NS_IMETHODIMP EwsIncomingServer::SyncFolderHierarchy(
    IEwsSimpleOperationListener* listener, nsIMsgWindow* window) {
  const auto refListener = RefPtr{listener};
  return SyncFolderList(window, [refListener]() {
    return refListener->OnOperationSuccess({}, false);
  });
}

nsresult EwsIncomingServer::SyncFolderList(
    nsIMsgWindow* aMsgWindow, std::function<nsresult()> postSyncCallback) {
  // EWS provides us an opaque value which specifies the last version of
  // upstream folders we received. Provide that to simplify sync.
  nsCString syncStateToken;
  nsresult rv = GetStringValue(kSyncStateTokenProperty, syncStateToken);
  if (NS_FAILED(rv)) {
    syncStateToken = EmptyCString();
  }

  nsCOMPtr<nsIMsgStatusFeedback> feedback = nullptr;
  if (aMsgWindow) {
    // Format the message we'll show the user while we wait for the remote
    // operation to complete.
    //
    // If `postSyncCallback` also involves syncing the message list of each
    // folder, we'll also trigger messages for individual folders, but the
    // status bar implementation ensures messages stay up long enough that they
    // don't "flicker" too quickly. So the resulting UX will be the following
    // messages appearing ~1s apart:
    //  * Looking for new messages for [account name]…
    //  * Looking for new messages in [folder 1 name]…
    //  * Looking for new messages in [folder 2 name]…
    //  * etc.
    RefPtr<intl::Localization> l10n =
        intl::Localization::Create({"messenger/activityFeedback.ftl"_ns}, true);

    auto l10nArgs = dom::Optional<intl::L10nArgs>();
    l10nArgs.Construct();

    nsCString accountName;
    rv = GetPrettyName(accountName);
    NS_ENSURE_SUCCESS(rv, rv);

    auto idArg = l10nArgs.Value().Entries().AppendElement();
    idArg->mKey = "accountName"_ns;
    idArg->mValue.SetValue().SetAsUTF8String().Assign(accountName);

    ErrorResult error;
    nsCString message;
    l10n->FormatValueSync("looking-for-messages-account"_ns, l10nArgs, message,
                          error);

    // Show the message in the status bar.
    rv = aMsgWindow->GetStatusFeedback(getter_AddRefs(feedback));
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

  // Define the listener and its callbacks.
  auto onNewRootFolder = [self = RefPtr(this)](const nsACString& id) {
    RefPtr<nsIMsgFolder> root;
    nsresult rv = self->GetRootFolder(getter_AddRefs(root));
    NS_ENSURE_SUCCESS(rv, rv);

    return root->SetStringProperty(kEwsIdProperty, id);
  };

  auto onFolderCreated = [self = RefPtr(this)](
                             const nsACString& id, const nsACString& parentId,
                             const nsACString& name, uint32_t flags) {
    return self->MaybeCreateFolderWithDetails(id, parentId, name, flags);
  };

  nsCOMPtr<nsIMsgWindow> msgWindow = aMsgWindow;
  auto onFolderUpdated = [self = RefPtr(this), msgWindow](
                             const nsACString& id, const nsACString& parentId,
                             const nsACString& name) {
    return self->UpdateFolderWithDetails(id, parentId, name, msgWindow);
  };

  auto onFolderDeleted = [self = RefPtr(this)](const nsACString& id) {
    return self->DeleteFolderWithId(id);
  };

  auto onSyncStateTokenChanged =
      [self = RefPtr(this)](const nsACString& syncStateToken) {
        return self->SetStringValue(kSyncStateTokenProperty, syncStateToken);
      };

  auto onSuccess = [feedback, postSyncCallback]() {
    if (feedback) {
      // Reset the status bar since the remote operation has finished.
      nsresult rv = feedback->StopMeteors();
      NS_ENSURE_SUCCESS(rv, rv);
    }

    return postSyncCallback();
  };

  auto onError = [feedback](nsresult _status) {
    if (feedback) {
      // Reset the status bar since the remote operation has finished.
      return feedback->StopMeteors();
    }

    return NS_OK;
  };

  RefPtr<EwsFolderSyncListener> listener = new EwsFolderSyncListener(
      onNewRootFolder, onFolderCreated, onFolderUpdated, onFolderDeleted,
      onSyncStateTokenChanged, onSuccess, onError);

  // Sync the folder tree for the whole account.
  RefPtr<IEwsClient> client;
  MOZ_TRY(GetEwsClient(getter_AddRefs(client)));
  return client->SyncFolderHierarchy(listener, syncStateToken);
}

nsresult EwsIncomingServer::SyncFolders(
    const nsTArray<RefPtr<nsIMsgFolder>>& folders, nsIMsgWindow* aMsgWindow,
    nsIUrlListener* urlListener) {
  // TODO: For now, we sync every folder at once, but obviously that's not an
  // amazing solution. In the future, we should probably try to maintain some
  // kind of queue so we can properly batch and sync folders. In the meantime,
  // though, the EWS client should handle any kind of rate limiting well enough,
  // so this improvement can come later.
  for (const auto& folder : folders) {
    nsresult rv = folder->GetNewMessages(aMsgWindow, urlListener);
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

nsresult EwsIncomingServer::SyncAllFolders(nsIMsgWindow* aMsgWindow,
                                           nsIUrlListener* urlListener) {
  nsCOMPtr<nsIMsgFolder> rootFolder;
  MOZ_TRY(GetRootFolder(getter_AddRefs(rootFolder)));

  nsTArray<RefPtr<nsIMsgFolder>> msgFolders;
  MOZ_TRY(rootFolder->GetDescendants(msgFolders));

  return SyncFolders(msgFolders, aMsgWindow, urlListener);
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
          return self->SyncAllFolders(window, urlListener);
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

  nsresult rv = SetPerformingBiff(true);
  NS_ENSURE_SUCCESS(rv, rv);

  // Sync the folder list for the account. Then sync the message list of each
  // folder in the tree.
  return SyncFolderList(aMsgWindow, [self = RefPtr(this), window]() {
    nsCOMPtr<nsIMsgFolder> rootFolder;
    nsresult rv = self->GetRootFolder(getter_AddRefs(rootFolder));
    NS_ENSURE_SUCCESS(rv, rv);

    nsTArray<RefPtr<nsIMsgFolder>> msgFolders;
    rv = rootFolder->GetDescendants(msgFolders);
    NS_ENSURE_SUCCESS(rv, rv);

    RefPtr<EwsBiffUrlListener> listener;
    rv = EwsBiffUrlListener::ForFolders(self, msgFolders.Clone(),
                                        getter_AddRefs(listener));
    NS_ENSURE_SUCCESS(rv, rv);

    return self->SyncFolders(msgFolders, window, listener);
  });
}

NS_IMETHODIMP EwsIncomingServer::PerformExpand(nsIMsgWindow* aMsgWindow) {
  // Sync the folder list; we don't want to do anything after that so we just
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

  nsAutoCString endpoint;
  rv = GetEwsUrl(endpoint);
  NS_ENSURE_SUCCESS(rv, rv);

  bool overrideOAuth;
  rv = GetEwsOverrideOAuthDetails(&overrideOAuth);
  NS_ENSURE_SUCCESS(rv, rv);

  nsAutoCString applicationId, tenantId, redirectUri, endpointHost, oauthScopes;
  if (overrideOAuth) {
    rv = GetEwsApplicationId(applicationId);
    NS_ENSURE_SUCCESS(rv, rv);
    rv = GetEwsTenantId(tenantId);
    NS_ENSURE_SUCCESS(rv, rv);
    rv = GetEwsRedirectUri(redirectUri);
    NS_ENSURE_SUCCESS(rv, rv);
    rv = GetEwsEndpointHost(endpointHost);
    NS_ENSURE_SUCCESS(rv, rv);
    rv = GetEwsOAuthScopes(oauthScopes);
    NS_ENSURE_SUCCESS(rv, rv);
  }

  // Set up the client object with access details.
  rv = client->Initialize(endpoint, this, overrideOAuth, applicationId,
                          tenantId, redirectUri, endpointHost, oauthScopes);
  NS_ENSURE_SUCCESS(rv, rv);

  client.forget(ewsClient);

  return NS_OK;
}

nsresult EwsIncomingServer::GetTrashFolder(nsIMsgFolder** trashFolder) {
  NS_ENSURE_ARG_POINTER(trashFolder);

  *trashFolder = nullptr;

  nsAutoCString trashFolderPath;
  nsresult rv = GetTrashFolderPath(trashFolderPath);
  NS_ENSURE_SUCCESS(rv, rv);

  if (trashFolderPath.IsEmpty()) {
    return NS_OK;
  }

  nsCOMPtr<nsIMsgFolder> rootFolder;
  rv = GetRootFolder(getter_AddRefs(rootFolder));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgFolder> foundTrashFolder;
  rv = GetExistingFolder(rootFolder, trashFolderPath,
                         getter_AddRefs(foundTrashFolder));
  NS_ENSURE_SUCCESS(rv, rv);

  foundTrashFolder.forget(trashFolder);

  return NS_OK;
}

nsresult EwsIncomingServer::UpdateTrashFolder() {
  nsCOMPtr<nsIMsgFolder> trashFolder;
  nsresult rv = GetTrashFolder(getter_AddRefs(trashFolder));
  NS_ENSURE_SUCCESS(rv, rv);

  if (trashFolder) {
    rv = trashFolder->SetFlag(nsMsgFolderFlags::Trash);
    NS_ENSURE_SUCCESS(rv, rv);
  }
  return NS_OK;
}

NS_IMETHODIMP EwsIncomingServer::SetDeleteModel(
    IEwsIncomingServer::DeleteModel value) {
  using DeleteModel = IEwsIncomingServer::DeleteModel;

  if (value != DeleteModel::PERMANENTLY_DELETE &&
      value != DeleteModel::MOVE_TO_TRASH) {
    return NS_ERROR_ILLEGAL_VALUE;
  }

  if (value == DeleteModel::MOVE_TO_TRASH) {
    nsresult rv = UpdateTrashFolder();
    NS_ENSURE_SUCCESS(rv, rv);
  }

  return SetIntValue(kDeleteModelPreferenceName, value);
}

NS_IMETHODIMP EwsIncomingServer::GetDeleteModel(
    IEwsIncomingServer::DeleteModel* returnValue) {
  NS_ENSURE_ARG(returnValue);

  int32_t modelCode;
  nsresult rv = GetIntValue(kDeleteModelPreferenceName, &modelCode);
  NS_ENSURE_SUCCESS(rv, rv);

  if (modelCode != 0 && modelCode != 1) {
    return NS_ERROR_UNEXPECTED;
  }

  *returnValue = static_cast<IEwsIncomingServer::DeleteModel>(modelCode);

  return NS_OK;
}

NS_IMETHODIMP EwsIncomingServer::SetTrashFolderPath(const nsACString& path) {
  if (path.IsEmpty()) {
    return NS_OK;
  }

  // Check that the path exists.
  nsCOMPtr<nsIMsgFolder> rootFolder;
  nsresult rv = GetRootFolder(getter_AddRefs(rootFolder));
  NS_ENSURE_SUCCESS(rv, rv);

  // Make sure that the path to the new trash folder exists.
  nsCOMPtr<nsIMsgFolder> newTrashFolder;
  rv = GetExistingFolder(rootFolder, path, getter_AddRefs(newTrashFolder));
  NS_ENSURE_SUCCESS(rv, rv);

  // Clear the flag on the current trash folder.
  nsCOMPtr<nsIMsgFolder> currentTrashFolder;
  rv = GetTrashFolder(getter_AddRefs(currentTrashFolder));
  NS_ENSURE_SUCCESS(rv, rv);

  if (currentTrashFolder) {
    rv = currentTrashFolder->ClearFlag(nsMsgFolderFlags::Trash);
    NS_ENSURE_SUCCESS(rv, rv);
  }

  rv = SetStringValue(kTrashFolderPreferenceName, path);
  NS_ENSURE_SUCCESS(rv, rv);

  return UpdateTrashFolder();
}

NS_IMETHODIMP EwsIncomingServer::GetTrashFolderPath(nsACString& returnValue) {
  return GetStringValue(kTrashFolderPreferenceName, returnValue);
}

NS_IMETHODIMP EwsIncomingServer::GetEwsOverrideOAuthDetails(bool* value) {
  return GetBoolValue("ews_override_oauth_details", value);
}

NS_IMETHODIMP EwsIncomingServer::SetEwsOverrideOAuthDetails(bool value) {
  return SetBoolValue("ews_override_oauth_details", value);
}

#define DEFINE_PREF_STRING_PROPERTY(PropName, PrefName)                     \
  NS_IMETHODIMP EwsIncomingServer::Get##PropName(nsACString& value) {       \
    return GetStringValue(PrefName, value);                                 \
  }                                                                         \
  NS_IMETHODIMP EwsIncomingServer::Set##PropName(const nsACString& value) { \
    return SetStringValue(PrefName, value);                                 \
  }

// EWS uses an HTTP(S) endpoint for calls rather than a simple hostname. This
// is stored as a pref against this server.
DEFINE_PREF_STRING_PROPERTY(EwsUrl, "ews_url")
DEFINE_PREF_STRING_PROPERTY(EwsApplicationId, "ews_application_id")
DEFINE_PREF_STRING_PROPERTY(EwsTenantId, "ews_tenant_id")
DEFINE_PREF_STRING_PROPERTY(EwsRedirectUri, "ews_redirect_uri")
DEFINE_PREF_STRING_PROPERTY(EwsEndpointHost, "ews_endpoint_host")
DEFINE_PREF_STRING_PROPERTY(EwsOAuthScopes, "ews_oauth_scopes")

#undef DEFINE_PREF_PROPERTY
