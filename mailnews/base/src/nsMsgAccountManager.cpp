/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * The account manager service - manages all accounts, servers, and identities
 */

#include "nsCOMPtr.h"
#include "nsISupports.h"
#include "nsIThread.h"
#include "nscore.h"
#include "mozilla/RefPtr.h"
#include "nsIComponentManager.h"
#include "nsMsgAccountManager.h"
#include "prmem.h"
#include "prcmon.h"
#include "prthread.h"
#include "plstr.h"
#include "nsString.h"
#include "nscore.h"
#include "prprf.h"
#include "nsIMsgFolderCache.h"
#include "nsMsgFolderCache.h"
#include "nsMsgUtils.h"
#include "nsMsgDBFolder.h"
#include "nsIFile.h"
#include "nsIURL.h"
#include "nsNetCID.h"
#include "nsIPrefService.h"
#include "nsIPrefBranch.h"
#include "nsIMsgOutgoingServerService.h"
#include "nsIMsgBiffManager.h"
#include "nsIMsgPurgeService.h"
#include "nsIObserverService.h"
#include "nsINoIncomingServer.h"
#include "nsIMsgMailSession.h"
#include "nsIDirectoryService.h"
#include "nsAppDirectoryServiceDefs.h"
#include "nsMailDirServiceDefs.h"
#include "nsMsgFolderFlags.h"
#include "nsIMsgFolderNotificationService.h"
#include "nsIImapIncomingServer.h"
#include "nsIImapUrl.h"
#include "nsIURIMutator.h"
#include "nsICategoryManager.h"
#include "nsISupportsPrimitives.h"
#include "nsIMsgFilterService.h"
#include "nsIMsgFilter.h"
#include "nsIMsgSearchSession.h"
#include "nsIMsgSearchTerm.h"
#include "nsIDBFolderInfo.h"
#include "nsIMsgHdr.h"
#include "nsILineInputStream.h"
#include "nsThreadUtils.h"
#include "nsNetUtil.h"
#include "nsIStringBundle.h"
#include "nsMsgMessageFlags.h"
#include "nsIMsgFilterList.h"
#include "nsDirectoryServiceUtils.h"
#include "mozilla/Components.h"
#include "mozilla/Services.h"
#include "nsIFileStreams.h"
#include "nsIOutputStream.h"
#include "nsISafeOutputStream.h"
#include "nsXULAppAPI.h"
#include "nsICacheStorageService.h"
#include "UrlListener.h"
#include "nsIIDNService.h"

#define PREF_MAIL_ACCOUNTMANAGER_ACCOUNTS "mail.accountmanager.accounts"
#define PREF_MAIL_ACCOUNTMANAGER_DEFAULTACCOUNT \
  "mail.accountmanager.defaultaccount"
#define PREF_MAIL_ACCOUNTMANAGER_LOCALFOLDERSSERVER \
  "mail.accountmanager.localfoldersserver"
#define PREF_MAIL_SERVER_PREFIX "mail.server."
#define ACCOUNT_PREFIX "account"
#define SERVER_PREFIX "server"
#define ID_PREFIX "id"
#define ABOUT_TO_GO_OFFLINE_TOPIC "network:offline-about-to-go-offline"
#define ACCOUNT_DELIMITER ','
#define APPEND_ACCOUNTS_VERSION_PREF_NAME "append_preconfig_accounts.version"
#define MAILNEWS_ROOT_PREF "mailnews."
#define PREF_MAIL_ACCOUNTMANAGER_APPEND_ACCOUNTS \
  "mail.accountmanager.appendaccounts"

#define NS_MSGACCOUNT_CID                          \
  {                                                \
    0x68b25510, 0xe641, 0x11d2, {                  \
      0xb7, 0xfc, 0x0, 0x80, 0x5f, 0x5, 0xff, 0xa5 \
    }                                              \
  }
static NS_DEFINE_CID(kMsgAccountCID, NS_MSGACCOUNT_CID);

#define SEARCH_FOLDER_FLAG "searchFolderFlag"
#define SEARCH_FOLDER_FLAG_LEN (sizeof(SEARCH_FOLDER_FLAG) - 1)

const char* kSearchFolderUriProp = "searchFolderUri";

bool nsMsgAccountManager::m_haveShutdown = false;
bool nsMsgAccountManager::m_shutdownInProgress = false;

NS_IMPL_ISUPPORTS(nsMsgAccountManager, nsIMsgAccountManager, nsIObserver,
                  nsISupportsWeakReference, nsIFolderListener,
                  nsIAsyncShutdownBlocker)

nsMsgAccountManager::nsMsgAccountManager()
    : m_accountsLoaded(false),
      m_emptyTrashInProgress(false),
      m_cleanupInboxInProgress(false),
      m_userAuthenticated(false),
      m_loadingVirtualFolders(false),
      m_virtualFoldersLoaded(false),
      m_lastFindServerPort(0),
      m_lastUniqueServerKey(1) {}

nsMsgAccountManager::~nsMsgAccountManager() {
  if (!m_haveShutdown) {
    // Don't remove from Observer service in Shutdown because Shutdown also gets
    // called from xpcom shutdown observer.  And we don't want to remove from
    // the service in that case.
    nsCOMPtr<nsIObserverService> observerService =
        mozilla::services::GetObserverService();
    if (observerService) {
      observerService->RemoveObserver(this, "search-folders-changed");
      observerService->RemoveObserver(this, ABOUT_TO_GO_OFFLINE_TOPIC);
      observerService->RemoveObserver(this, "sleep_notification");
    }
  }
}

static nsCOMPtr<nsIAsyncShutdownService> GetShutdownService() {
  MOZ_ASSERT(NS_IsMainThread());
  nsCOMPtr<nsIAsyncShutdownService> service =
      mozilla::services::GetAsyncShutdownService();
  MOZ_RELEASE_ASSERT(service);
  return service;
}

static nsCOMPtr<nsIAsyncShutdownClient> GetQuitApplicationGranted() {
  nsCOMPtr<nsIAsyncShutdownClient> barrier;
  nsresult rv =
      GetShutdownService()->GetQuitApplicationGranted(getter_AddRefs(barrier));
  MOZ_RELEASE_ASSERT(NS_SUCCEEDED(rv));
  MOZ_RELEASE_ASSERT(barrier);
  return barrier;
}

static nsCOMPtr<nsIAsyncShutdownClient> GetProfileBeforeChange() {
  nsCOMPtr<nsIAsyncShutdownClient> barrier;
  nsresult rv =
      GetShutdownService()->GetProfileBeforeChange(getter_AddRefs(barrier));
  MOZ_RELEASE_ASSERT(NS_SUCCEEDED(rv));
  MOZ_RELEASE_ASSERT(barrier);
  return barrier;
}

nsresult nsMsgAccountManager::Init() {
  if (!XRE_IsParentProcess()) {
    return NS_ERROR_NOT_AVAILABLE;
  }

  nsresult rv;

  m_prefs = do_GetService(NS_PREFSERVICE_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIObserverService> observerService =
      mozilla::services::GetObserverService();
  if (observerService) {
    observerService->AddObserver(this, "search-folders-changed", true);
    observerService->AddObserver(this, ABOUT_TO_GO_OFFLINE_TOPIC, true);
    observerService->AddObserver(this, "sleep_notification", true);
  }

  GetQuitApplicationGranted()->AddBlocker(
      this, NS_LITERAL_STRING_FROM_CSTRING(__FILE__), __LINE__,
      u"nsMsgAccountManager cleanup on exit"_ns);
  GetProfileBeforeChange()->AddBlocker(
      this, NS_LITERAL_STRING_FROM_CSTRING(__FILE__), __LINE__,
      u"nsMsgAccountManager shutdown"_ns);

  // Make sure PSM gets initialized before any accounts use certificates.
  net_EnsurePSMInit();

  return NS_OK;
}

nsresult nsMsgAccountManager::Shutdown() {
  if (m_haveShutdown)  // do not shutdown twice
    return NS_OK;

  nsresult rv;

  SaveVirtualFolders();

  if (m_dbService) {
    nsTObserverArray<RefPtr<VirtualFolderChangeListener>>::ForwardIterator iter(
        m_virtualFolderListeners);
    RefPtr<VirtualFolderChangeListener> listener;

    while (iter.HasMore()) {
      listener = iter.GetNext();
      m_dbService->UnregisterPendingListener(listener);
    }

    m_dbService = nullptr;
  }
  m_virtualFolders.Clear();
  if (m_msgFolderCache) WriteToFolderCache(m_msgFolderCache);
  (void)ShutdownServers();
  (void)UnloadAccounts();

  // shutdown removes nsIIncomingServer listener from biff manager, so do it
  // after accounts have been unloaded
  nsCOMPtr<nsIMsgBiffManager> biffService =
      do_GetService("@mozilla.org/messenger/biffManager;1", &rv);
  if (NS_SUCCEEDED(rv) && biffService) biffService->Shutdown();

  // shutdown removes nsIIncomingServer listener from purge service, so do it
  // after accounts have been unloaded
  nsCOMPtr<nsIMsgPurgeService> purgeService =
      do_GetService("@mozilla.org/messenger/purgeService;1", &rv);
  if (NS_SUCCEEDED(rv) && purgeService) purgeService->Shutdown();

  if (m_msgFolderCache) {
    // The DTOR is meant to do the flushing, but observed behaviour is
    // that it doesn't always get called. So flush explicitly.
    m_msgFolderCache->Flush();
    m_msgFolderCache = nullptr;
  }

  m_haveShutdown = true;
  GetProfileBeforeChange()->RemoveBlocker(this);
  return NS_OK;
}

NS_IMETHODIMP
nsMsgAccountManager::GetShutdownInProgress(bool* _retval) {
  NS_ENSURE_ARG_POINTER(_retval);
  *_retval = m_shutdownInProgress;
  return NS_OK;
}

NS_IMETHODIMP
nsMsgAccountManager::GetUserNeedsToAuthenticate(bool* aRetval) {
  NS_ENSURE_ARG_POINTER(aRetval);
  if (!m_userAuthenticated)
    return m_prefs->GetBoolPref("mail.password_protect_local_cache", aRetval);
  *aRetval = !m_userAuthenticated;
  return NS_OK;
}

NS_IMETHODIMP
nsMsgAccountManager::SetUserNeedsToAuthenticate(bool aUserNeedsToAuthenticate) {
  m_userAuthenticated = !aUserNeedsToAuthenticate;
  return NS_OK;
}

NS_IMETHODIMP nsMsgAccountManager::Observe(nsISupports* aSubject,
                                           const char* aTopic,
                                           const char16_t* someData) {
  if (!strcmp(aTopic, "search-folders-changed")) {
    nsCOMPtr<nsIMsgFolder> virtualFolder = do_QueryInterface(aSubject);
    nsCOMPtr<nsIMsgDatabase> db;
    nsCOMPtr<nsIDBFolderInfo> dbFolderInfo;
    virtualFolder->GetDBFolderInfoAndDB(getter_AddRefs(dbFolderInfo),
                                        getter_AddRefs(db));
    nsCString srchFolderUris;
    dbFolderInfo->GetCharProperty(kSearchFolderUriProp, srchFolderUris);
    AddVFListenersForVF(virtualFolder, srchFolderUris);
    return NS_OK;
  }
  if (!strcmp(aTopic, ABOUT_TO_GO_OFFLINE_TOPIC)) {
    nsAutoString dataString(u"offline"_ns);
    if (someData) {
      nsAutoString someDataString(someData);
      if (dataString.Equals(someDataString)) CloseCachedConnections();
    }
    return NS_OK;
  }
  if (!strcmp(aTopic, "sleep_notification")) return CloseCachedConnections();

  return NS_OK;
}

NS_IMETHODIMP
nsMsgAccountManager::GetUniqueAccountKey(nsACString& aResult) {
  int32_t lastKey = 0;
  nsresult rv;
  nsCOMPtr<nsIPrefService> prefservice(
      do_GetService(NS_PREFSERVICE_CONTRACTID, &rv));
  if (NS_SUCCEEDED(rv)) {
    nsCOMPtr<nsIPrefBranch> prefBranch;
    prefservice->GetBranch("", getter_AddRefs(prefBranch));

    rv = prefBranch->GetIntPref("mail.account.lastKey", &lastKey);
    if (NS_FAILED(rv) || lastKey == 0) {
      // If lastKey pref does not contain a valid value, loop over existing
      // pref names mail.account.* .
      nsCOMPtr<nsIPrefBranch> prefBranchAccount;
      rv = prefservice->GetBranch("mail.account.",
                                  getter_AddRefs(prefBranchAccount));
      if (NS_SUCCEEDED(rv)) {
        nsTArray<nsCString> prefList;
        rv = prefBranchAccount->GetChildList("", prefList);
        if (NS_SUCCEEDED(rv)) {
          // Pref names are of the format accountX.
          // Find the maximum value of 'X' used so far.
          for (auto& prefName : prefList) {
            if (StringBeginsWith(prefName, nsLiteralCString(ACCOUNT_PREFIX))) {
              int32_t dotPos = prefName.FindChar('.');
              if (dotPos != kNotFound) {
                nsCString keyString(Substring(prefName, strlen(ACCOUNT_PREFIX),
                                              dotPos - strlen(ACCOUNT_PREFIX)));
                int32_t thisKey = keyString.ToInteger(&rv);
                if (NS_SUCCEEDED(rv)) lastKey = std::max(lastKey, thisKey);
              }
            }
          }
        }
      }
    }

    // Use next available key and store the value in the pref.
    aResult.Assign(ACCOUNT_PREFIX);
    aResult.AppendInt(++lastKey);
    rv = prefBranch->SetIntPref("mail.account.lastKey", lastKey);
  } else {
    // If pref service is not working, try to find a free accountX key
    // by checking which keys exist.
    int32_t i = 1;
    nsCOMPtr<nsIMsgAccount> account;

    do {
      aResult = ACCOUNT_PREFIX;
      aResult.AppendInt(i++);
      GetAccount(aResult, getter_AddRefs(account));
    } while (account);
  }
  return NS_OK;
}

NS_IMETHODIMP
nsMsgAccountManager::GetUniqueServerKey(nsACString& aResult) {
  nsAutoCString prefResult;
  nsCOMPtr<nsIPrefService> prefService = mozilla::Preferences::GetService();

  // Loop over existing pref names mail.server.server(lastKey).type
  nsCOMPtr<nsIPrefBranch> prefBranchServer;
  nsresult rv = prefService->GetBranch(PREF_MAIL_SERVER_PREFIX,
                                       getter_AddRefs(prefBranchServer));
  NS_ENSURE_SUCCESS(rv, rv);

  nsAutoCString type;
  nsAutoCString typeKey;
  for (;; m_lastUniqueServerKey++) {
    aResult.AssignLiteral(SERVER_PREFIX);
    aResult.AppendInt(m_lastUniqueServerKey);
    typeKey.Assign(aResult);
    typeKey.AppendLiteral(".type");
    prefBranchServer->GetCharPref(typeKey.get(), type);
    if (type.IsEmpty())  // a server slot with no type is considered empty
      return NS_OK;
  }
}

nsresult nsMsgAccountManager::CreateIdentity(nsIMsgIdentity** _retval) {
  NS_ENSURE_ARG_POINTER(_retval);
  nsresult rv;
  nsAutoCString key;
  nsCOMPtr<nsIMsgIdentity> identity;
  int32_t i = 1;
  do {
    key.AssignLiteral(ID_PREFIX);
    key.AppendInt(i++);
    m_identities.Get(key, getter_AddRefs(identity));
  } while (identity);

  rv = createKeyedIdentity(key, _retval);
  return rv;
}

NS_IMETHODIMP
nsMsgAccountManager::GetIdentity(const nsACString& key,
                                 nsIMsgIdentity** _retval) {
  NS_ENSURE_ARG_POINTER(_retval);
  nsresult rv = NS_OK;
  *_retval = nullptr;

  if (!key.IsEmpty()) {
    nsCOMPtr<nsIMsgIdentity> identity;
    m_identities.Get(key, getter_AddRefs(identity));
    if (identity)
      identity.forget(_retval);
    else  // identity doesn't exist. create it.
      rv = createKeyedIdentity(key, _retval);
  }

  return rv;
}

/*
 * the shared identity-creation code
 * create an identity and add it to the accountmanager's list.
 */
nsresult nsMsgAccountManager::createKeyedIdentity(const nsACString& key,
                                                  nsIMsgIdentity** aIdentity) {
  nsresult rv;
  nsCOMPtr<nsIMsgIdentity> identity =
      do_CreateInstance("@mozilla.org/messenger/identity;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  identity->SetKey(key);
  m_identities.InsertOrUpdate(key, identity);
  identity.forget(aIdentity);
  return NS_OK;
}

NS_IMETHODIMP
nsMsgAccountManager::CreateIncomingServer(const nsACString& username,
                                          const nsACString& hostname,
                                          const nsACString& type,
                                          nsIMsgIncomingServer** _retval) {
  NS_ENSURE_ARG_POINTER(_retval);

  // Make sure the hostname is usable when creating a new incoming server.

  if (hostname.Equals("Local%20Folders") ||
      hostname.Equals("smart%20mailboxes")) {
    return NS_ERROR_MALFORMED_URI;
  }
  if (hostname.Equals("Local Folders") || hostname.Equals("smart mailboxes")) {
    // Allow these special hostnames, but only for "none" servers.
    if (!type.Equals("none")) {
      return NS_ERROR_MALFORMED_URI;
    }
  } else {
    nsAutoCString unused;
    nsresult rv = NS_DomainToASCII(hostname, unused);
    NS_ENSURE_SUCCESS(rv, NS_ERROR_MALFORMED_URI);
    nsCOMPtr<nsIURL> url;
    rv = NS_MutateURI(NS_STANDARDURLMUTATOR_CONTRACTID)
             .SetSpec("imap://"_ns + hostname)
             .Finalize(url);
    NS_ENSURE_SUCCESS(rv, NS_ERROR_MALFORMED_URI);
  }

  nsresult rv = LoadAccounts();
  NS_ENSURE_SUCCESS(rv, rv);

  nsAutoCString key;
  GetUniqueServerKey(key);
  m_lastUniqueServerKey++;  // Make sure the key won't be used again.
  rv = createKeyedServer(key, username, hostname, type, _retval);
  if (*_retval) {
    nsCString defaultStore;
    m_prefs->GetCharPref("mail.serverDefaultStoreContractID", defaultStore);
    (*_retval)->SetCharValue("storeContractID", defaultStore);

    // From when we first create the account until we have created some folders,
    // we can change the store type.
    (*_retval)->SetBoolValue("canChangeStoreType", true);
  }
  return rv;
}

NS_IMETHODIMP
nsMsgAccountManager::GetIncomingServer(const nsACString& key,
                                       nsIMsgIncomingServer** _retval) {
  NS_ENSURE_ARG_POINTER(_retval);
  nsresult rv;

  if (m_incomingServers.Get(key, _retval)) return NS_OK;

  // server doesn't exist, so create it
  // this is really horrible because we are doing our own prefname munging
  // instead of leaving it up to the incoming server.
  // this should be fixed somehow so that we can create the incoming server
  // and then read from the incoming server's attributes

  // in order to create the right kind of server, we have to look
  // at the pref for this server to get the username, hostname, and type
  nsAutoCString serverPrefPrefix(PREF_MAIL_SERVER_PREFIX);
  serverPrefPrefix.Append(key);

  nsCString serverType;
  nsAutoCString serverPref(serverPrefPrefix);
  serverPref.AppendLiteral(".type");
  rv = m_prefs->GetCharPref(serverPref.get(), serverType);
  NS_ENSURE_SUCCESS(rv, NS_ERROR_NOT_INITIALIZED);

  //
  // .userName
  serverPref = serverPrefPrefix;
  serverPref.AppendLiteral(".userName");
  nsCString username;
  rv = m_prefs->GetCharPref(serverPref.get(), username);

  // .hostname
  serverPref = serverPrefPrefix;
  serverPref.AppendLiteral(".hostname");
  nsCString hostname;
  rv = m_prefs->GetCharPref(serverPref.get(), hostname);
  NS_ENSURE_SUCCESS(rv, NS_ERROR_NOT_INITIALIZED);

  return createKeyedServer(key, username, hostname, serverType, _retval);
}

NS_IMETHODIMP
nsMsgAccountManager::RemoveIncomingServer(nsIMsgIncomingServer* aServer,
                                          bool aRemoveFiles) {
  NS_ENSURE_ARG_POINTER(aServer);

  nsCString serverKey;
  nsresult rv = aServer->GetKey(serverKey);
  NS_ENSURE_SUCCESS(rv, rv);

  // close cached connections and forget session password
  LogoutOfServer(aServer);

  // invalidate the FindServer() cache if we are removing the cached server
  if (m_lastFindServerResult == aServer)
    SetLastServerFound(nullptr, EmptyCString(), EmptyCString(), 0,
                       EmptyCString());

  m_incomingServers.Remove(serverKey);

  nsCOMPtr<nsIMsgFolder> rootFolder;
  rv = aServer->GetRootFolder(getter_AddRefs(rootFolder));
  NS_ENSURE_SUCCESS(rv, rv);

  nsTArray<RefPtr<nsIMsgFolder>> allDescendants;
  rv = rootFolder->GetDescendants(allDescendants);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgFolderNotificationService> notifier =
      do_GetService("@mozilla.org/messenger/msgnotificationservice;1");
  nsCOMPtr<nsIFolderListener> mailSession =
      do_GetService("@mozilla.org/messenger/services/session;1");

  for (auto folder : allDescendants) {
    folder->ForceDBClosed();
    if (notifier) notifier->NotifyFolderDeleted(folder);
    if (mailSession) {
      nsCOMPtr<nsIMsgFolder> parentFolder;
      folder->GetParent(getter_AddRefs(parentFolder));
      mailSession->OnFolderRemoved(parentFolder, folder);
    }
  }
  if (notifier) notifier->NotifyFolderDeleted(rootFolder);
  if (mailSession) mailSession->OnFolderRemoved(nullptr, rootFolder);

  removeListenersFromFolder(rootFolder);
  NotifyServerUnloaded(aServer);
  if (aRemoveFiles) {
    rv = aServer->RemoveFiles();
    NS_ENSURE_SUCCESS(rv, rv);
  }

  nsCOMPtr<nsIObserverService> obs = mozilla::services::GetObserverService();
  if (obs) {
    obs->NotifyObservers(aServer, "message-server-removed",
                         NS_ConvertUTF8toUTF16(serverKey).get());
  }

  // now clear out the server once and for all.
  // watch out! could be scary
  aServer->ClearAllValues();
  rootFolder->Shutdown(true);
  return rv;
}

/**
 * Create a server when you know the key and the type
 */
nsresult nsMsgAccountManager::createKeyedServer(
    const nsACString& key, const nsACString& username,
    const nsACString& hostnameIn, const nsACString& type,
    nsIMsgIncomingServer** aServer) {
  nsresult rv;
  *aServer = nullptr;

  nsAutoCString hostname(hostnameIn);
  if (hostname.Equals("Local Folders") || hostname.Equals("smart mailboxes")) {
    // Allow these special hostnames, but only for "none" servers.
    if (type != "none") {
      return NS_ERROR_MALFORMED_URI;
    }
  } else if (hostname.Equals("Local%20Folders") ||
             hostname.Equals("smart%20mailboxes")) {
    // Don't allow these %-encoded special hostnames.
    return NS_ERROR_MALFORMED_URI;
  } else {
    // Check the hostname is valid.
    nsAutoCString unused;
    rv = NS_DomainToASCII(hostname, unused);
    if (NS_SUCCEEDED(rv)) {
      nsCOMPtr<nsIURL> url;
      rv = NS_MutateURI(NS_STANDARDURLMUTATOR_CONTRACTID)
               .SetSpec("imap://"_ns + hostname)
               .Finalize(url);
    }
    if (NS_FAILED(rv)) {
      // In case of failure, use a <key>.invalid hostname instead
      // so that access to the account is not lost.
      hostname = key + ".invalid"_ns;
    }
  }

  // construct the contractid
  nsAutoCString serverContractID("@mozilla.org/messenger/server;1?type=");
  serverContractID += type;

  // finally, create the server
  // (This will fail if type is from an extension that has been removed)
  nsCOMPtr<nsIMsgIncomingServer> server =
      do_CreateInstance(serverContractID.get(), &rv);
  NS_ENSURE_SUCCESS(rv, NS_ERROR_NOT_AVAILABLE);

  int32_t port;
  nsCOMPtr<nsIMsgIncomingServer> existingServer;
  server->SetKey(key);
  server->SetType(type);
  server->SetUsername(username);
  server->SetHostName(hostname);
  server->GetPort(&port);
  FindServer(username, hostname, type, port, getter_AddRefs(existingServer));
  // don't allow duplicate servers.
  if (existingServer) return NS_ERROR_FAILURE;

  m_incomingServers.InsertOrUpdate(key, server);

  // now add all listeners that are supposed to be
  // waiting on root folders
  nsCOMPtr<nsIMsgFolder> rootFolder;
  rv = server->GetRootFolder(getter_AddRefs(rootFolder));
  NS_ENSURE_SUCCESS(rv, rv);

  nsTObserverArray<nsCOMPtr<nsIFolderListener>>::ForwardIterator iter(
      mFolderListeners);
  while (iter.HasMore()) {
    rootFolder->AddFolderListener(iter.GetNext());
  }

  server.forget(aServer);
  return NS_OK;
}

void nsMsgAccountManager::removeListenersFromFolder(nsIMsgFolder* aFolder) {
  nsTObserverArray<nsCOMPtr<nsIFolderListener>>::ForwardIterator iter(
      mFolderListeners);
  while (iter.HasMore()) {
    aFolder->RemoveFolderListener(iter.GetNext());
  }
}

NS_IMETHODIMP
nsMsgAccountManager::RemoveAccount(nsIMsgAccount* aAccount,
                                   bool aRemoveFiles = false) {
  NS_ENSURE_ARG_POINTER(aAccount);
  // Hold account in scope while we tidy up potentially-shared identities.
  nsresult rv = LoadAccounts();
  NS_ENSURE_SUCCESS(rv, rv);

  if (!m_accounts.RemoveElement(aAccount)) {
    return NS_ERROR_INVALID_ARG;
  }

  rv = OutputAccountsPref();
  // If we couldn't write out the pref, restore the account.
  if (NS_FAILED(rv)) {
    m_accounts.AppendElement(aAccount);
    return rv;
  }

  // If it's the default, choose a new default account.
  if (m_defaultAccount == aAccount) AutosetDefaultAccount();

  // XXX - need to figure out if this is the last time this server is
  // being used, and only send notification then.
  // (and only remove from hashtable then too!)
  nsCOMPtr<nsIMsgIncomingServer> server;
  rv = aAccount->GetIncomingServer(getter_AddRefs(server));
  if (NS_SUCCEEDED(rv) && server) RemoveIncomingServer(server, aRemoveFiles);

  nsTArray<RefPtr<nsIMsgIdentity>> identities;
  rv = aAccount->GetIdentities(identities);
  if (NS_SUCCEEDED(rv)) {
    for (auto identity : identities) {
      bool identityStillUsed = false;
      // for each identity, see if any remaining account still uses it,
      // and if not, clear it.
      // Note that we are also searching here accounts with missing servers from
      //  unloaded extension types.
      for (auto account : m_accounts) {
        nsTArray<RefPtr<nsIMsgIdentity>> existingIdentities;
        account->GetIdentities(existingIdentities);
        auto pos = existingIdentities.IndexOf(identity);
        if (pos != existingIdentities.NoIndex) {
          identityStillUsed = true;
          break;
        }
      }
      // clear out all identity information if no other account uses it.
      if (!identityStillUsed) identity->ClearAllValues();
    }
  }

  nsCString accountKey;
  aAccount->GetKey(accountKey);

  // It is not a critical problem if this fails as the account was already
  // removed from the list of accounts so should not ever be referenced.
  // Just print it out for debugging.
  rv = aAccount->ClearAllValues();
  NS_ASSERTION(NS_SUCCEEDED(rv), "removing of account prefs failed");

  nsCOMPtr<nsIObserverService> obs = mozilla::services::GetObserverService();
  if (obs) {
    obs->NotifyObservers(nullptr, "message-account-removed",
                         NS_ConvertUTF8toUTF16(accountKey).get());
  }
  return NS_OK;
}

nsresult nsMsgAccountManager::OutputAccountsPref() {
  nsCString accountKey;
  mAccountKeyList.Truncate();

  for (uint32_t index = 0; index < m_accounts.Length(); index++) {
    m_accounts[index]->GetKey(accountKey);
    if (index) mAccountKeyList.Append(ACCOUNT_DELIMITER);
    mAccountKeyList.Append(accountKey);
  }
  return m_prefs->SetCharPref(PREF_MAIL_ACCOUNTMANAGER_ACCOUNTS,
                              mAccountKeyList);
}

/**
 * Get the default account. If no default account, return null.
 */
NS_IMETHODIMP
nsMsgAccountManager::GetDefaultAccount(nsIMsgAccount** aDefaultAccount) {
  NS_ENSURE_ARG_POINTER(aDefaultAccount);

  nsresult rv = LoadAccounts();
  NS_ENSURE_SUCCESS(rv, rv);

  if (!m_defaultAccount) {
    nsCString defaultKey;
    rv = m_prefs->GetCharPref(PREF_MAIL_ACCOUNTMANAGER_DEFAULTACCOUNT,
                              defaultKey);
    if (NS_SUCCEEDED(rv)) {
      rv = GetAccount(defaultKey, getter_AddRefs(m_defaultAccount));
      if (NS_SUCCEEDED(rv) && m_defaultAccount) {
        bool canBeDefault = false;
        rv = CheckDefaultAccount(m_defaultAccount, canBeDefault);
        if (NS_FAILED(rv) || !canBeDefault) m_defaultAccount = nullptr;
      }
    }
  }

  NS_IF_ADDREF(*aDefaultAccount = m_defaultAccount);
  return NS_OK;
}

/**
 * Check if the given account can be default.
 */
nsresult nsMsgAccountManager::CheckDefaultAccount(nsIMsgAccount* aAccount,
                                                  bool& aCanBeDefault) {
  aCanBeDefault = false;
  nsCOMPtr<nsIMsgIncomingServer> server;
  // Server could be null if created by an unloaded extension.
  nsresult rv = aAccount->GetIncomingServer(getter_AddRefs(server));
  NS_ENSURE_SUCCESS(rv, rv);
  if (server) {
    // Check if server can be default.
    rv = server->GetCanBeDefaultServer(&aCanBeDefault);
  }
  return rv;
}

/**
 * Pick the first account that can be default and make it the default.
 */
nsresult nsMsgAccountManager::AutosetDefaultAccount() {
  for (nsIMsgAccount* account : m_accounts) {
    bool canBeDefault = false;
    nsresult rv = CheckDefaultAccount(account, canBeDefault);
    if (NS_SUCCEEDED(rv) && canBeDefault) {
      return SetDefaultAccount(account);
    }
  }

  // No accounts can be the default. Clear it.
  if (m_defaultAccount) {
    nsCOMPtr<nsIMsgAccount> oldAccount = m_defaultAccount;
    m_defaultAccount = nullptr;
    (void)setDefaultAccountPref(nullptr);
    (void)notifyDefaultServerChange(oldAccount, nullptr);
  }
  return NS_OK;
}

NS_IMETHODIMP
nsMsgAccountManager::SetDefaultAccount(nsIMsgAccount* aDefaultAccount) {
  if (!aDefaultAccount) return NS_ERROR_INVALID_ARG;

  if (m_defaultAccount != aDefaultAccount) {
    bool canBeDefault = false;
    nsresult rv = CheckDefaultAccount(aDefaultAccount, canBeDefault);
    if (NS_FAILED(rv) || !canBeDefault) {
      // Report failure if we were explicitly asked to use an unusable server.
      return NS_ERROR_INVALID_ARG;
    }
    nsCOMPtr<nsIMsgAccount> oldAccount = m_defaultAccount;
    m_defaultAccount = aDefaultAccount;
    (void)setDefaultAccountPref(aDefaultAccount);
    (void)notifyDefaultServerChange(oldAccount, aDefaultAccount);
  }
  return NS_OK;
}

// fire notifications
nsresult nsMsgAccountManager::notifyDefaultServerChange(
    nsIMsgAccount* aOldAccount, nsIMsgAccount* aNewAccount) {
  nsresult rv;

  nsCOMPtr<nsIMsgIncomingServer> server;
  nsCOMPtr<nsIMsgFolder> rootFolder;

  // first tell old server it's no longer the default
  if (aOldAccount) {
    rv = aOldAccount->GetIncomingServer(getter_AddRefs(server));
    if (NS_SUCCEEDED(rv) && server) {
      rv = server->GetRootFolder(getter_AddRefs(rootFolder));
      if (NS_SUCCEEDED(rv) && rootFolder)
        rootFolder->NotifyBoolPropertyChanged(kDefaultServer, true, false);
    }
  }

  // now tell new server it is.
  if (aNewAccount) {
    rv = aNewAccount->GetIncomingServer(getter_AddRefs(server));
    if (NS_SUCCEEDED(rv) && server) {
      rv = server->GetRootFolder(getter_AddRefs(rootFolder));
      if (NS_SUCCEEDED(rv) && rootFolder)
        rootFolder->NotifyBoolPropertyChanged(kDefaultServer, false, true);
    }
  }

  // only notify if the user goes and changes default account
  if (aOldAccount && aNewAccount) {
    nsCOMPtr<nsIObserverService> observerService =
        mozilla::services::GetObserverService();

    if (observerService)
      observerService->NotifyObservers(nullptr, "mailDefaultAccountChanged",
                                       nullptr);
  }

  return NS_OK;
}

nsresult nsMsgAccountManager::setDefaultAccountPref(
    nsIMsgAccount* aDefaultAccount) {
  nsresult rv;

  if (aDefaultAccount) {
    nsCString key;
    rv = aDefaultAccount->GetKey(key);
    NS_ENSURE_SUCCESS(rv, rv);

    rv = m_prefs->SetCharPref(PREF_MAIL_ACCOUNTMANAGER_DEFAULTACCOUNT, key);
    NS_ENSURE_SUCCESS(rv, rv);
  } else
    m_prefs->ClearUserPref(PREF_MAIL_ACCOUNTMANAGER_DEFAULTACCOUNT);

  return NS_OK;
}

void nsMsgAccountManager::LogoutOfServer(nsIMsgIncomingServer* aServer) {
  if (!aServer) return;
  mozilla::DebugOnly<nsresult> rv = aServer->Shutdown();
  NS_ASSERTION(NS_SUCCEEDED(rv), "Shutdown of server failed");
  rv = aServer->ForgetSessionPassword(false);
  NS_ASSERTION(NS_SUCCEEDED(rv),
               "failed to remove the password associated with server");
}

NS_IMETHODIMP nsMsgAccountManager::GetFolderCache(
    nsIMsgFolderCache** aFolderCache) {
  NS_ENSURE_ARG_POINTER(aFolderCache);

  if (m_msgFolderCache) {
    NS_IF_ADDREF(*aFolderCache = m_msgFolderCache);
    return NS_OK;
  }

  // Create the foldercache.
  nsCOMPtr<nsIFile> cacheFile;
  nsresult rv = NS_GetSpecialDirectory(NS_APP_MESSENGER_FOLDER_CACHE_50_FILE,
                                       getter_AddRefs(cacheFile));
  NS_ENSURE_SUCCESS(rv, rv);
  nsCOMPtr<nsIFile> legacyFile;
  rv = NS_GetSpecialDirectory(NS_APP_MESSENGER_LEGACY_FOLDER_CACHE_50_FILE,
                              getter_AddRefs(legacyFile));
  NS_ENSURE_SUCCESS(rv, rv);
  m_msgFolderCache = new nsMsgFolderCache();
  m_msgFolderCache->Init(cacheFile, legacyFile);
  NS_IF_ADDREF(*aFolderCache = m_msgFolderCache);
  return NS_OK;
}

NS_IMETHODIMP
nsMsgAccountManager::GetAccounts(nsTArray<RefPtr<nsIMsgAccount>>& accounts) {
  nsresult rv = LoadAccounts();
  NS_ENSURE_SUCCESS(rv, rv);

  accounts.Clear();
  accounts.SetCapacity(m_accounts.Length());
  for (auto existingAccount : m_accounts) {
    nsCOMPtr<nsIMsgIncomingServer> server;
    existingAccount->GetIncomingServer(getter_AddRefs(server));
    if (!server) continue;
    if (server) {
      bool hidden = false;
      server->GetHidden(&hidden);
      if (hidden) continue;
    }
    accounts.AppendElement(existingAccount);
  }
  return NS_OK;
}

NS_IMETHODIMP
nsMsgAccountManager::GetAllIdentities(
    nsTArray<RefPtr<nsIMsgIdentity>>& result) {
  nsresult rv = LoadAccounts();
  NS_ENSURE_SUCCESS(rv, rv);

  result.Clear();

  for (auto account : m_accounts) {
    nsTArray<RefPtr<nsIMsgIdentity>> identities;
    rv = account->GetIdentities(identities);
    if (NS_FAILED(rv)) continue;

    for (auto identity : identities) {
      // Have we already got this identity?
      nsAutoCString key;
      rv = identity->GetKey(key);
      if (NS_FAILED(rv)) continue;

      bool found = false;
      for (auto thisIdentity : result) {
        nsAutoCString thisKey;
        rv = thisIdentity->GetKey(thisKey);
        if (NS_FAILED(rv)) continue;

        if (key == thisKey) {
          found = true;
          break;
        }
      }

      if (!found) result.AppendElement(identity);
    }
  }
  return rv;
}

NS_IMETHODIMP
nsMsgAccountManager::GetAllServers(
    nsTArray<RefPtr<nsIMsgIncomingServer>>& servers) {
  servers.Clear();
  nsresult rv = LoadAccounts();
  NS_ENSURE_SUCCESS(rv, rv);

  for (auto iter = m_incomingServers.Iter(); !iter.Done(); iter.Next()) {
    nsCOMPtr<nsIMsgIncomingServer>& server = iter.Data();
    if (!server) continue;

    bool hidden = false;
    server->GetHidden(&hidden);
    if (hidden) continue;

    nsCString type;
    if (NS_FAILED(server->GetType(type))) {
      NS_WARNING("server->GetType() failed");
      continue;
    }

    if (!type.EqualsLiteral("im")) {
      servers.AppendElement(server);
    }
  }
  return NS_OK;
}

nsresult nsMsgAccountManager::LoadAccounts() {
  nsresult rv;

  // for now safeguard multiple calls to this function
  if (m_accountsLoaded) return NS_OK;

  // If we have code trying to do things after we've unloaded accounts,
  // ignore it.
  if (m_shutdownInProgress || m_haveShutdown) return NS_ERROR_FAILURE;

  // Make sure correct modules are loaded before creating any server.
  nsCOMPtr<nsIObserver> moduleLoader;
  moduleLoader =
      do_GetService("@mozilla.org/messenger/imap-module-loader;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgMailSession> mailSession =
      do_GetService("@mozilla.org/messenger/services/session;1", &rv);

  if (NS_SUCCEEDED(rv))
    mailSession->AddFolderListener(
        this, nsIFolderListener::added | nsIFolderListener::removed |
                  nsIFolderListener::intPropertyChanged);

  // Ensure biff service has started
  nsCOMPtr<nsIMsgBiffManager> biffService =
      do_GetService("@mozilla.org/messenger/biffManager;1", &rv);

  if (NS_SUCCEEDED(rv)) biffService->Init();

  // Ensure purge service has started
  nsCOMPtr<nsIMsgPurgeService> purgeService =
      do_GetService("@mozilla.org/messenger/purgeService;1", &rv);

  if (NS_SUCCEEDED(rv)) purgeService->Init();

  nsCOMPtr<nsIPrefService> prefservice(
      do_GetService(NS_PREFSERVICE_CONTRACTID, &rv));
  NS_ENSURE_SUCCESS(rv, rv);

  // mail.accountmanager.accounts is the main entry point for all accounts
  nsCString accountList;
  rv = m_prefs->GetCharPref(PREF_MAIL_ACCOUNTMANAGER_ACCOUNTS, accountList);

  /**
   * Check to see if we need to add pre-configured accounts.
   * Following prefs are important to note in understanding the procedure here.
   *
   * 1. pref("mailnews.append_preconfig_accounts.version", version number);
   * This pref registers the current version in the user prefs file. A default
   * value is stored in mailnews.js file. If a given vendor needs to add more
   * preconfigured accounts, the default version number can be increased.
   * Comparing version number from user's prefs file and the default one from
   * mailnews.js, we can add new accounts and any other version level changes
   * that need to be done.
   *
   * 2. pref("mail.accountmanager.appendaccounts", <comma sep. account list>);
   * This pref contains the list of pre-configured accounts that ISP/Vendor
   * wants to add to the existing accounts list.
   */
  nsCOMPtr<nsIPrefBranch> defaultsPrefBranch;
  rv = prefservice->GetDefaultBranch(MAILNEWS_ROOT_PREF,
                                     getter_AddRefs(defaultsPrefBranch));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIPrefBranch> prefBranch;
  rv = prefservice->GetBranch(MAILNEWS_ROOT_PREF, getter_AddRefs(prefBranch));
  NS_ENSURE_SUCCESS(rv, rv);

  int32_t appendAccountsCurrentVersion = 0;
  int32_t appendAccountsDefaultVersion = 0;
  rv = prefBranch->GetIntPref(APPEND_ACCOUNTS_VERSION_PREF_NAME,
                              &appendAccountsCurrentVersion);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = defaultsPrefBranch->GetIntPref(APPEND_ACCOUNTS_VERSION_PREF_NAME,
                                      &appendAccountsDefaultVersion);
  NS_ENSURE_SUCCESS(rv, rv);

  // Update the account list if needed
  if ((appendAccountsCurrentVersion <= appendAccountsDefaultVersion)) {
    // Get a list of pre-configured accounts
    nsCString appendAccountList;
    rv = m_prefs->GetCharPref(PREF_MAIL_ACCOUNTMANAGER_APPEND_ACCOUNTS,
                              appendAccountList);
    appendAccountList.StripWhitespace();

    // If there are pre-configured accounts, we need to add them to the
    // existing list.
    if (!appendAccountList.IsEmpty()) {
      if (!accountList.IsEmpty()) {
        // Tokenize the data and add each account
        // in the user's current mailnews account list
        nsTArray<nsCString> accountsArray;
        ParseString(accountList, ACCOUNT_DELIMITER, accountsArray);
        uint32_t i = accountsArray.Length();

        // Append each account in the pre-configured account list
        ParseString(appendAccountList, ACCOUNT_DELIMITER, accountsArray);

        // Now add each account that does not already appear in the list
        for (; i < accountsArray.Length(); i++) {
          if (accountsArray.IndexOf(accountsArray[i]) == i) {
            accountList.Append(ACCOUNT_DELIMITER);
            accountList.Append(accountsArray[i]);
          }
        }
      } else {
        accountList = appendAccountList;
      }
      // Increase the version number so that updates will happen as and when
      // needed
      rv = prefBranch->SetIntPref(APPEND_ACCOUNTS_VERSION_PREF_NAME,
                                  appendAccountsCurrentVersion + 1);
    }
  }

  // It is ok to return null accounts like when we create new profile.
  m_accountsLoaded = true;
  m_haveShutdown = false;

  if (accountList.IsEmpty()) return NS_OK;

  /* parse accountList and run loadAccount on each string, comma-separated */
  nsCOMPtr<nsIMsgAccount> account;
  // Tokenize the data and add each account
  // in the user's current mailnews account list
  nsTArray<nsCString> accountsArray;
  ParseString(accountList, ACCOUNT_DELIMITER, accountsArray);

  // These are the duplicate accounts we found. We keep track of these
  // because if any other server defers to one of these accounts, we need
  // to defer to the correct account.
  nsCOMArray<nsIMsgAccount> dupAccounts;

  // Now add each account that does not already appear in the list
  for (uint32_t i = 0; i < accountsArray.Length(); i++) {
    // if we've already seen this exact account, advance to the next account.
    // After the loop, we'll notice that we don't have as many actual accounts
    // as there were accounts in the pref, and rewrite the pref.
    if (accountsArray.IndexOf(accountsArray[i]) != i) continue;

    // get the "server" pref to see if we already have an account with this
    // server. If we do, we ignore this account.
    nsAutoCString serverKeyPref("mail.account.");
    serverKeyPref += accountsArray[i];

    nsCOMPtr<nsIPrefBranch> accountPrefBranch;
    rv = prefservice->GetBranch(serverKeyPref.get(),
                                getter_AddRefs(accountPrefBranch));
    NS_ENSURE_SUCCESS(rv, rv);

    serverKeyPref += ".server";
    nsCString serverKey;
    rv = m_prefs->GetCharPref(serverKeyPref.get(), serverKey);
    if (NS_FAILED(rv)) continue;

    nsCOMPtr<nsIMsgAccount> serverAccount;
    findAccountByServerKey(serverKey, getter_AddRefs(serverAccount));
    // If we have an existing account with the same server, ignore this account
    if (serverAccount) continue;

    if (NS_FAILED(createKeyedAccount(accountsArray[i], true,
                                     getter_AddRefs(account))) ||
        !account) {
      NS_WARNING("unexpected entry in account list; prefs corrupt?");
      continue;
    }

    // See nsIMsgAccount.idl for a description of the secondsToLeaveUnavailable
    //  and timeFoundUnavailable preferences
    nsAutoCString toLeavePref(PREF_MAIL_SERVER_PREFIX);
    toLeavePref.Append(serverKey);
    nsAutoCString unavailablePref(
        toLeavePref);  // this is the server-specific prefix
    unavailablePref.AppendLiteral(".timeFoundUnavailable");
    toLeavePref.AppendLiteral(".secondsToLeaveUnavailable");
    int32_t secondsToLeave = 0;
    int32_t timeUnavailable = 0;

    m_prefs->GetIntPref(toLeavePref.get(), &secondsToLeave);

    // force load of accounts (need to find a better way to do this)
    nsTArray<RefPtr<nsIMsgIdentity>> unused;
    account->GetIdentities(unused);

    rv = account->CreateServer();
    bool deleteAccount = NS_FAILED(rv);

    if (secondsToLeave) {    // we need to process timeUnavailable
      if (NS_SUCCEEDED(rv))  // clear the time if server is available
      {
        m_prefs->ClearUserPref(unavailablePref.get());
      }
      // NS_ERROR_NOT_AVAILABLE signifies a server that could not be
      // instantiated, presumably because of an invalid type.
      else if (rv == NS_ERROR_NOT_AVAILABLE) {
        m_prefs->GetIntPref(unavailablePref.get(), &timeUnavailable);
        if (!timeUnavailable) {  // we need to set it, this must be the first
                                 // time unavailable
          uint32_t nowSeconds;
          PRTime2Seconds(PR_Now(), &nowSeconds);
          m_prefs->SetIntPref(unavailablePref.get(), nowSeconds);
          deleteAccount = false;
        }
      }
    }

    // Our server is still unavailable. Have we timed out yet?
    if (rv == NS_ERROR_NOT_AVAILABLE && timeUnavailable != 0) {
      uint32_t nowSeconds;
      PRTime2Seconds(PR_Now(), &nowSeconds);
      if ((int32_t)nowSeconds < timeUnavailable + secondsToLeave)
        deleteAccount = false;
    }

    if (deleteAccount) {
      dupAccounts.AppendObject(account);
      m_accounts.RemoveElement(account);
    }
  }

  // Check if we removed one or more of the accounts in the pref string.
  // If so, rewrite the pref string.
  if (accountsArray.Length() != m_accounts.Length()) OutputAccountsPref();

  int32_t cnt = dupAccounts.Count();
  nsCOMPtr<nsIMsgAccount> dupAccount;

  // Go through the accounts seeing if any existing server is deferred to
  // an account we removed. If so, fix the deferral. Then clean up the prefs
  // for the removed account.
  for (int32_t i = 0; i < cnt; i++) {
    dupAccount = dupAccounts[i];
    for (auto iter = m_incomingServers.Iter(); !iter.Done(); iter.Next()) {
      /*
       * This loop gets run for every incoming server, and is passed a
       * duplicate account. It checks that the server is not deferred to the
       * duplicate account. If it is, then it looks up the information for the
       * duplicate account's server (username, hostName, type), and finds an
       * account with a server with the same username, hostname, and type, and
       * if it finds one, defers to that account instead. Generally, this will
       * be a Local Folders account, since 2.0 has a bug where duplicate Local
       * Folders accounts are created.
       */
      nsCOMPtr<nsIMsgIncomingServer>& server = iter.Data();
      nsCString type;
      server->GetType(type);
      if (type.EqualsLiteral("pop3")) {
        nsCString deferredToAccount;
        // Get the pref directly, because the GetDeferredToAccount accessor
        // attempts to fix broken deferrals, but we know more about what the
        // deferred to account was.
        server->GetCharValue("deferred_to_account", deferredToAccount);
        if (!deferredToAccount.IsEmpty()) {
          nsCString dupAccountKey;
          dupAccount->GetKey(dupAccountKey);
          if (deferredToAccount.Equals(dupAccountKey)) {
            nsresult rv;
            nsCString accountPref("mail.account.");
            nsCString dupAccountServerKey;
            accountPref.Append(dupAccountKey);
            accountPref.AppendLiteral(".server");
            nsCOMPtr<nsIPrefService> prefservice(
                do_GetService(NS_PREFSERVICE_CONTRACTID, &rv));
            if (NS_FAILED(rv)) {
              continue;
            }
            nsCOMPtr<nsIPrefBranch> prefBranch(
                do_GetService(NS_PREFSERVICE_CONTRACTID, &rv));
            if (NS_FAILED(rv)) {
              continue;
            }
            rv =
                prefBranch->GetCharPref(accountPref.get(), dupAccountServerKey);
            if (NS_FAILED(rv)) {
              continue;
            }
            nsCOMPtr<nsIPrefBranch> serverPrefBranch;
            nsCString serverKeyPref(PREF_MAIL_SERVER_PREFIX);
            serverKeyPref.Append(dupAccountServerKey);
            serverKeyPref.Append('.');
            rv = prefservice->GetBranch(serverKeyPref.get(),
                                        getter_AddRefs(serverPrefBranch));
            if (NS_FAILED(rv)) {
              continue;
            }
            nsCString userName;
            nsCString hostName;
            nsCString type;
            serverPrefBranch->GetCharPref("userName", userName);
            serverPrefBranch->GetCharPref("hostname", hostName);
            serverPrefBranch->GetCharPref("type", type);
            // Find a server with the same info.
            nsCOMPtr<nsIMsgAccountManager> accountManager =
                do_GetService("@mozilla.org/messenger/account-manager;1", &rv);
            if (NS_FAILED(rv)) {
              continue;
            }
            nsCOMPtr<nsIMsgIncomingServer> server;
            accountManager->FindServer(userName, hostName, type, 0,
                                       getter_AddRefs(server));
            if (server) {
              nsCOMPtr<nsIMsgAccount> replacement;
              accountManager->FindAccountForServer(server,
                                                   getter_AddRefs(replacement));
              if (replacement) {
                nsCString accountKey;
                replacement->GetKey(accountKey);
                if (!accountKey.IsEmpty())
                  server->SetCharValue("deferred_to_account", accountKey);
              }
            }
          }
        }
      }
    }

    nsAutoCString accountKeyPref("mail.account.");
    nsCString dupAccountKey;
    dupAccount->GetKey(dupAccountKey);
    if (dupAccountKey.IsEmpty()) continue;
    accountKeyPref.Append(dupAccountKey);
    accountKeyPref.Append('.');

    nsCOMPtr<nsIPrefBranch> accountPrefBranch;
    rv = prefservice->GetBranch(accountKeyPref.get(),
                                getter_AddRefs(accountPrefBranch));
    if (accountPrefBranch) {
      nsTArray<nsCString> prefNames;
      nsresult rv = accountPrefBranch->GetChildList("", prefNames);
      NS_ENSURE_SUCCESS(rv, rv);

      for (auto& prefName : prefNames) {
        accountPrefBranch->ClearUserPref(prefName.get());
      }
    }
  }

  // Make sure we have an account that points at the local folders server
  nsCString localFoldersServerKey;
  rv = m_prefs->GetCharPref(PREF_MAIL_ACCOUNTMANAGER_LOCALFOLDERSSERVER,
                            localFoldersServerKey);

  if (!localFoldersServerKey.IsEmpty()) {
    nsCOMPtr<nsIMsgIncomingServer> server;
    rv = GetIncomingServer(localFoldersServerKey, getter_AddRefs(server));
    if (server) {
      nsCOMPtr<nsIMsgAccount> localFoldersAccount;
      findAccountByServerKey(localFoldersServerKey,
                             getter_AddRefs(localFoldersAccount));
      // If we don't have an existing account pointing at the local folders
      // server, we're going to add one.
      if (!localFoldersAccount) {
        nsCOMPtr<nsIMsgAccount> account;
        (void)CreateAccount(getter_AddRefs(account));
        if (account) account->SetIncomingServer(server);
      }
    }
  }
  return NS_OK;
}

NS_IMETHODIMP
nsMsgAccountManager::ReactivateAccounts() {
  for (nsIMsgAccount* account : m_accounts) {
    // This will error out if the account already has its server, or
    // if this isn't the account that the extension is trying to reactivate.
    if (NS_SUCCEEDED(account->CreateServer())) {
      nsCOMPtr<nsIMsgIncomingServer> server;
      account->GetIncomingServer(getter_AddRefs(server));
      // This triggers all of the notifications required by the UI.
      account->SetIncomingServer(server);
    }
  }
  return NS_OK;
}

// this routine goes through all the identities and makes sure
// that the special folders for each identity have the
// correct special folder flags set, e.g, the Sent folder has
// the sent flag set.
//
// it also goes through all the spam settings for each account
// and makes sure the folder flags are set there, too
NS_IMETHODIMP
nsMsgAccountManager::SetSpecialFolders() {
  nsTArray<RefPtr<nsIMsgIdentity>> identities;
  GetAllIdentities(identities);

  for (auto identity : identities) {
    nsresult rv;
    nsCString folderUri;
    nsCOMPtr<nsIMsgFolder> folder;

    identity->GetFccFolder(folderUri);
    if (!folderUri.IsEmpty() &&
        NS_SUCCEEDED(GetOrCreateFolder(folderUri, getter_AddRefs(folder)))) {
      nsCOMPtr<nsIMsgFolder> parent;
      rv = folder->GetParent(getter_AddRefs(parent));
      if (NS_SUCCEEDED(rv) && parent) {
        rv = folder->SetFlag(nsMsgFolderFlags::SentMail);
        NS_ENSURE_SUCCESS(rv, rv);
      }
    }

    identity->GetDraftFolder(folderUri);
    if (!folderUri.IsEmpty() &&
        NS_SUCCEEDED(GetOrCreateFolder(folderUri, getter_AddRefs(folder)))) {
      nsCOMPtr<nsIMsgFolder> parent;
      rv = folder->GetParent(getter_AddRefs(parent));
      if (NS_SUCCEEDED(rv) && parent) {
        rv = folder->SetFlag(nsMsgFolderFlags::Drafts);
        NS_ENSURE_SUCCESS(rv, rv);
      }
    }

    identity->GetArchiveFolder(folderUri);
    if (!folderUri.IsEmpty() &&
        NS_SUCCEEDED(GetOrCreateFolder(folderUri, getter_AddRefs(folder)))) {
      nsCOMPtr<nsIMsgFolder> parent;
      rv = folder->GetParent(getter_AddRefs(parent));
      if (NS_SUCCEEDED(rv) && parent) {
        bool archiveEnabled;
        identity->GetArchiveEnabled(&archiveEnabled);
        if (archiveEnabled)
          rv = folder->SetFlag(nsMsgFolderFlags::Archive);
        else
          rv = folder->ClearFlag(nsMsgFolderFlags::Archive);
        NS_ENSURE_SUCCESS(rv, rv);
      }
    }

    identity->GetStationeryFolder(folderUri);
    if (!folderUri.IsEmpty() &&
        NS_SUCCEEDED(GetOrCreateFolder(folderUri, getter_AddRefs(folder)))) {
      nsCOMPtr<nsIMsgFolder> parent;
      rv = folder->GetParent(getter_AddRefs(parent));
      if (NS_SUCCEEDED(rv) && parent) {
        folder->SetFlag(nsMsgFolderFlags::Templates);
        NS_ENSURE_SUCCESS(rv, rv);
      }
    }
  }

  // XXX todo
  // get all servers
  // get all spam settings for each server
  // set the JUNK folder flag on the spam folders, right?
  return NS_OK;
}

NS_IMETHODIMP
nsMsgAccountManager::UnloadAccounts() {
  // release the default account
  m_defaultAccount = nullptr;
  for (auto iter = m_incomingServers.Iter(); !iter.Done(); iter.Next()) {
    nsCOMPtr<nsIMsgIncomingServer>& server = iter.Data();
    if (!server) continue;
    nsresult rv;
    NotifyServerUnloaded(server);

    nsCOMPtr<nsIMsgFolder> rootFolder;
    rv = server->GetRootFolder(getter_AddRefs(rootFolder));
    if (NS_SUCCEEDED(rv)) {
      removeListenersFromFolder(rootFolder);

      rootFolder->Shutdown(true);
    }
  }

  m_accounts.Clear();  // will release all elements
  m_identities.Clear();
  m_incomingServers.Clear();
  mAccountKeyList.Truncate();
  SetLastServerFound(nullptr, EmptyCString(), EmptyCString(), 0,
                     EmptyCString());

  if (m_accountsLoaded) {
    nsCOMPtr<nsIMsgMailSession> mailSession =
        do_GetService("@mozilla.org/messenger/services/session;1");
    if (mailSession) mailSession->RemoveFolderListener(this);
    m_accountsLoaded = false;
  }

  return NS_OK;
}

NS_IMETHODIMP
nsMsgAccountManager::ShutdownServers() {
  for (auto iter = m_incomingServers.Iter(); !iter.Done(); iter.Next()) {
    nsCOMPtr<nsIMsgIncomingServer>& server = iter.Data();
    if (server) server->Shutdown();
  }
  return NS_OK;
}

NS_IMETHODIMP
nsMsgAccountManager::CloseCachedConnections() {
  for (auto iter = m_incomingServers.Iter(); !iter.Done(); iter.Next()) {
    nsCOMPtr<nsIMsgIncomingServer>& server = iter.Data();
    if (server) server->CloseCachedConnections();
  }
  return NS_OK;
}

nsresult nsMsgAccountManager::CleanupOnExit() {
  // This can get called multiple times, and potentially re-entrantly.
  // So add some protection against that.
  if (m_shutdownInProgress) return NS_OK;

  m_shutdownInProgress = true;

  nsresult rv;
  // If enabled, clear cache on shutdown. This is common to all accounts.
  bool clearCache = false;
  m_prefs->GetBoolPref("privacy.clearOnShutdown.cache", &clearCache);
  if (clearCache) {
    nsCOMPtr<nsICacheStorageService> cacheStorageService =
        do_GetService("@mozilla.org/netwerk/cache-storage-service;1", &rv);
    if (NS_SUCCEEDED(rv)) cacheStorageService->Clear();
  }

  for (auto iter = m_incomingServers.Iter(); !iter.Done(); iter.Next()) {
    nsCOMPtr<nsIMsgIncomingServer>& server = iter.Data();

    bool emptyTrashOnExit = false;
    bool cleanupInboxOnExit = false;

    if (WeAreOffline()) break;

    if (!server) continue;

    server->GetEmptyTrashOnExit(&emptyTrashOnExit);
    nsCOMPtr<nsIImapIncomingServer> imapserver = do_QueryInterface(server);
    if (imapserver) {
      imapserver->GetCleanupInboxOnExit(&cleanupInboxOnExit);
      imapserver->SetShuttingDown(true);
    }
    if (!emptyTrashOnExit && !cleanupInboxOnExit) {
      continue;
    }

    nsCOMPtr<nsIMsgFolder> root;
    server->GetRootFolder(getter_AddRefs(root));
    nsCString type;
    server->GetType(type);
    if (!root) {
      continue;
    }

    nsString passwd;
    int32_t authMethod = 0;
    bool serverRequiresPasswordForAuthentication = true;
    bool isImap = type.EqualsLiteral("imap");
    if (isImap) {
      server->GetServerRequiresPasswordForBiff(
          &serverRequiresPasswordForAuthentication);
      server->GetPassword(passwd);
      server->GetAuthMethod(&authMethod);
    }
    if (!isImap || (isImap && (!serverRequiresPasswordForAuthentication ||
                               !passwd.IsEmpty() ||
                               authMethod == nsMsgAuthMethod::OAuth2))) {
      nsCOMPtr<nsIMsgAccountManager> accountManager =
          do_GetService("@mozilla.org/messenger/account-manager;1", &rv);
      if (NS_FAILED(rv)) continue;

      if (isImap && cleanupInboxOnExit) {
        // Find the inbox.
        nsTArray<RefPtr<nsIMsgFolder>> subFolders;
        rv = root->GetSubFolders(subFolders);
        if (NS_SUCCEEDED(rv)) {
          for (nsIMsgFolder* folder : subFolders) {
            uint32_t flags;
            folder->GetFlags(&flags);
            if (flags & nsMsgFolderFlags::Inbox) {
              // This is inbox, so Compact() it. There's an implied
              // Expunge too, because this is IMAP.
              RefPtr<UrlListener> cleanupListener = new UrlListener();
              RefPtr<nsMsgAccountManager> self = this;
              // This runs when the compaction (+expunge) is complete.
              cleanupListener->mStopFn = [self](nsIURI* url,
                                                nsresult status) -> nsresult {
                if (self->m_folderDoingCleanupInbox) {
                  PR_CEnterMonitor(self->m_folderDoingCleanupInbox);
                  PR_CNotifyAll(self->m_folderDoingCleanupInbox);
                  self->m_cleanupInboxInProgress = false;
                  PR_CExitMonitor(self->m_folderDoingCleanupInbox);
                  self->m_folderDoingCleanupInbox = nullptr;
                }
                return NS_OK;
              };

              rv = folder->Compact(cleanupListener, nullptr);
              if (NS_SUCCEEDED(rv))
                accountManager->SetFolderDoingCleanupInbox(folder);
              break;
            }
          }
        }
      }

      if (emptyTrashOnExit) {
        RefPtr<UrlListener> emptyTrashListener = new UrlListener();
        RefPtr<nsMsgAccountManager> self = this;
        // This runs when the trash-emptying is complete.
        // (It'll be a nsIImapUrl::nsImapDeleteAllMsgs url).
        emptyTrashListener->mStopFn = [self](nsIURI* url,
                                             nsresult status) -> nsresult {
          if (self->m_folderDoingEmptyTrash) {
            PR_CEnterMonitor(self->m_folderDoingEmptyTrash);
            PR_CNotifyAll(self->m_folderDoingEmptyTrash);
            self->m_emptyTrashInProgress = false;
            PR_CExitMonitor(self->m_folderDoingEmptyTrash);
            self->m_folderDoingEmptyTrash = nullptr;
          }
          return NS_OK;
        };

        rv = root->EmptyTrash(emptyTrashListener);
        if (isImap && NS_SUCCEEDED(rv))
          accountManager->SetFolderDoingEmptyTrash(root);
      }

      if (!isImap) {
        continue;
      }

      nsCOMPtr<nsIThread> thread(do_GetCurrentThread());

      // Pause until any possible inbox-compaction and trash-emptying
      // are complete (or time out).
      bool inProgress = false;
      if (cleanupInboxOnExit) {
        int32_t loopCount = 0;  // used to break out after 5 seconds
        accountManager->GetCleanupInboxInProgress(&inProgress);
        while (inProgress && loopCount++ < 5000) {
          accountManager->GetCleanupInboxInProgress(&inProgress);
          PR_CEnterMonitor(root);
          PR_CWait(root, PR_MicrosecondsToInterval(1000UL));
          PR_CExitMonitor(root);
          NS_ProcessPendingEvents(thread, PR_MicrosecondsToInterval(1000UL));
        }
      }
      if (emptyTrashOnExit) {
        accountManager->GetEmptyTrashInProgress(&inProgress);
        int32_t loopCount = 0;
        while (inProgress && loopCount++ < 5000) {
          accountManager->GetEmptyTrashInProgress(&inProgress);
          PR_CEnterMonitor(root);
          PR_CWait(root, PR_MicrosecondsToInterval(1000UL));
          PR_CExitMonitor(root);
          NS_ProcessPendingEvents(thread, PR_MicrosecondsToInterval(1000UL));
        }
      }
    }
  }

  GetQuitApplicationGranted()->RemoveBlocker(this);

  // Try to do this early on in the shutdown process before
  // necko shuts itself down.
  CloseCachedConnections();
  return NS_OK;
}

// nsIAsyncShutdownBlocker implementation
NS_IMETHODIMP
nsMsgAccountManager::GetName(nsAString& aName) {
  aName = u"nsMsgAccountManager: shutdown"_ns;
  return NS_OK;
}

NS_IMETHODIMP
nsMsgAccountManager::GetState(nsIPropertyBag** aState) { return NS_OK; }

NS_IMETHODIMP
nsMsgAccountManager::BlockShutdown(nsIAsyncShutdownClient* aClient) {
  nsAutoString name;
  aClient->GetName(name);
  if (name.Equals(u"quit-application-granted"_ns)) {
    return CleanupOnExit();
  } else {
    // profile-before-change
    return Shutdown();
  }
}

NS_IMETHODIMP
nsMsgAccountManager::WriteToFolderCache(nsIMsgFolderCache* folderCache) {
  for (auto iter = m_incomingServers.Iter(); !iter.Done(); iter.Next()) {
    iter.Data()->WriteToFolderCache(folderCache);
  }
  return NS_OK;
}

nsresult nsMsgAccountManager::createKeyedAccount(const nsCString& key,
                                                 bool forcePositionToEnd,
                                                 nsIMsgAccount** aAccount) {
  nsresult rv;
  nsCOMPtr<nsIMsgAccount> account = do_CreateInstance(kMsgAccountCID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  account->SetKey(key);

  nsCString localFoldersAccountKey;
  nsCString lastFolderAccountKey;
  if (!forcePositionToEnd) {
    nsCOMPtr<nsIMsgIncomingServer> localFoldersServer;
    rv = GetLocalFoldersServer(getter_AddRefs(localFoldersServer));
    if (NS_SUCCEEDED(rv)) {
      for (auto account : m_accounts) {
        nsCOMPtr<nsIMsgIncomingServer> server;
        rv = account->GetIncomingServer(getter_AddRefs(server));
        if (NS_SUCCEEDED(rv) && server == localFoldersServer) {
          account->GetKey(localFoldersAccountKey);
          break;
        }
      }
    }

    // Extracting the account key of the last mail acoount.
    for (int32_t index = m_accounts.Length() - 1; index >= 0; index--) {
      nsCOMPtr<nsIMsgIncomingServer> server;
      rv = m_accounts[index]->GetIncomingServer(getter_AddRefs(server));
      if (NS_SUCCEEDED(rv) && server) {
        nsCString accountType;
        rv = server->GetType(accountType);
        if (NS_SUCCEEDED(rv) && !accountType.EqualsLiteral("im")) {
          m_accounts[index]->GetKey(lastFolderAccountKey);
          break;
        }
      }
    }
  }

  if (!forcePositionToEnd && !localFoldersAccountKey.IsEmpty() &&
      !lastFolderAccountKey.IsEmpty() &&
      lastFolderAccountKey == localFoldersAccountKey) {
    // Insert account before Local Folders if that is the last account.
    m_accounts.InsertElementAt(m_accounts.Length() - 1, account);
  } else {
    m_accounts.AppendElement(account);
  }

  nsCString newAccountKeyList;
  nsCString accountKey;
  for (uint32_t index = 0; index < m_accounts.Length(); index++) {
    m_accounts[index]->GetKey(accountKey);
    if (index) newAccountKeyList.Append(ACCOUNT_DELIMITER);
    newAccountKeyList.Append(accountKey);
  }
  mAccountKeyList = newAccountKeyList;

  m_prefs->SetCharPref(PREF_MAIL_ACCOUNTMANAGER_ACCOUNTS, mAccountKeyList);
  account.forget(aAccount);
  return NS_OK;
}

NS_IMETHODIMP
nsMsgAccountManager::CreateAccount(nsIMsgAccount** _retval) {
  NS_ENSURE_ARG_POINTER(_retval);

  nsAutoCString key;
  GetUniqueAccountKey(key);

  return createKeyedAccount(key, false, _retval);
}

NS_IMETHODIMP
nsMsgAccountManager::GetAccount(const nsACString& aKey,
                                nsIMsgAccount** aAccount) {
  NS_ENSURE_ARG_POINTER(aAccount);
  *aAccount = nullptr;

  nsresult rv = LoadAccounts();
  NS_ENSURE_SUCCESS(rv, rv);

  for (uint32_t i = 0; i < m_accounts.Length(); ++i) {
    nsCOMPtr<nsIMsgAccount> account(m_accounts[i]);
    nsCString key;
    account->GetKey(key);
    if (key.Equals(aKey)) {
      account.forget(aAccount);
      break;
    }
  }

  // If not found, create on demand.
  return NS_OK;
}

NS_IMETHODIMP
nsMsgAccountManager::FindServerIndex(nsIMsgIncomingServer* server,
                                     int32_t* result) {
  NS_ENSURE_ARG_POINTER(server);
  NS_ENSURE_ARG_POINTER(result);

  nsCString key;
  nsresult rv = server->GetKey(key);
  NS_ENSURE_SUCCESS(rv, rv);

  // do this by account because the account list is in order
  uint32_t i;
  for (i = 0; i < m_accounts.Length(); ++i) {
    nsCOMPtr<nsIMsgIncomingServer> server;
    rv = m_accounts[i]->GetIncomingServer(getter_AddRefs(server));
    if (!server || NS_FAILED(rv)) continue;

    nsCString serverKey;
    rv = server->GetKey(serverKey);
    if (NS_FAILED(rv)) continue;

    // stop when found,
    // index will be set to the current index
    if (serverKey.Equals(key)) break;
  }

  // Even if the search failed, we can return index.
  // This means that all servers not in the array return an index higher
  // than all "registered" servers.
  *result = i;
  return NS_OK;
}

NS_IMETHODIMP nsMsgAccountManager::AddIncomingServerListener(
    nsIIncomingServerListener* serverListener) {
  m_incomingServerListeners.AppendObject(serverListener);
  return NS_OK;
}

NS_IMETHODIMP nsMsgAccountManager::RemoveIncomingServerListener(
    nsIIncomingServerListener* serverListener) {
  m_incomingServerListeners.RemoveObject(serverListener);
  return NS_OK;
}

NS_IMETHODIMP nsMsgAccountManager::NotifyServerLoaded(
    nsIMsgIncomingServer* server) {
  int32_t count = m_incomingServerListeners.Count();
  for (int32_t i = 0; i < count; i++) {
    nsIIncomingServerListener* listener = m_incomingServerListeners[i];
    listener->OnServerLoaded(server);
  }

  return NS_OK;
}

NS_IMETHODIMP nsMsgAccountManager::NotifyServerUnloaded(
    nsIMsgIncomingServer* server) {
  NS_ENSURE_ARG_POINTER(server);

  int32_t count = m_incomingServerListeners.Count();
  // Clear this to cut shutdown leaks. We are always passing valid non-null
  // server here.
  server->SetFilterList(nullptr);

  for (int32_t i = 0; i < count; i++) {
    nsIIncomingServerListener* listener = m_incomingServerListeners[i];
    listener->OnServerUnloaded(server);
  }

  return NS_OK;
}

NS_IMETHODIMP nsMsgAccountManager::NotifyServerChanged(
    nsIMsgIncomingServer* server) {
  int32_t count = m_incomingServerListeners.Count();
  for (int32_t i = 0; i < count; i++) {
    nsIIncomingServerListener* listener = m_incomingServerListeners[i];
    listener->OnServerChanged(server);
  }

  return NS_OK;
}

NS_IMETHODIMP
nsMsgAccountManager::FindServerByURI(nsIURI* aURI,
                                     nsIMsgIncomingServer** aResult) {
  NS_ENSURE_ARG_POINTER(aURI);

  nsresult rv = LoadAccounts();
  NS_ENSURE_SUCCESS(rv, rv);

  // Get username and hostname and port so we can get the server
  nsAutoCString username;
  nsAutoCString escapedUsername;
  rv = aURI->GetUserPass(escapedUsername);
  if (NS_SUCCEEDED(rv) && !escapedUsername.IsEmpty())
    MsgUnescapeString(escapedUsername, 0, username);

  nsAutoCString hostname;
  nsAutoCString escapedHostname;
  rv = aURI->GetHost(escapedHostname);
  if (NS_SUCCEEDED(rv) && !escapedHostname.IsEmpty()) {
    MsgUnescapeString(escapedHostname, 0, hostname);
  }

  nsAutoCString type;
  rv = aURI->GetScheme(type);
  if (NS_SUCCEEDED(rv) && !type.IsEmpty()) {
    // Remove "-message" from the scheme in case we get called with
    // "imap-message", "mailbox-message", or friends.
    if (StringEndsWith(type, "-message"_ns)) type.SetLength(type.Length() - 8);
    // now modify type if pop or news
    if (type.EqualsLiteral("pop")) type.AssignLiteral("pop3");
    // we use "nntp" in the server list so translate it here.
    else if (type.EqualsLiteral("news"))
      type.AssignLiteral("nntp");
    // we use "any" as the wildcard type.
    else if (type.EqualsLiteral("any"))
      type.Truncate();
  }

  int32_t port = 0;
  // check the port of the scheme is not 'none' or blank
  if (!(type.EqualsLiteral("none") || type.IsEmpty())) {
    rv = aURI->GetPort(&port);
    // Set the port to zero if we got a -1 (use default)
    if (NS_SUCCEEDED(rv) && (port == -1)) port = 0;
  }

  return findServerInternal(username, hostname, type, port, aResult);
}

nsresult nsMsgAccountManager::findServerInternal(
    const nsACString& username, const nsACString& serverHostname,
    const nsACString& type, int32_t port, nsIMsgIncomingServer** aResult) {
  if ((m_lastFindServerUserName.Equals(username)) &&
      (m_lastFindServerHostName.Equals(serverHostname)) &&
      (m_lastFindServerType.Equals(type)) && (m_lastFindServerPort == port) &&
      m_lastFindServerResult) {
    NS_ADDREF(*aResult = m_lastFindServerResult);
    return NS_OK;
  }
  nsresult rv;
  nsCString hostname;
  nsCOMPtr<nsIIDNService> idnService =
      do_GetService("@mozilla.org/network/idn-service;1");

  rv = idnService->ConvertToDisplayIDN(serverHostname, hostname);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIURL> url;
  rv = NS_MutateURI(NS_STANDARDURLMUTATOR_CONTRACTID)
           .SetSpec("imap://"_ns + hostname)
           .Finalize(url);
  if (NS_SUCCEEDED(rv)) {
    rv = url->GetHost(hostname);
  }

  nsCOMPtr<nsIIOService> ioService = mozilla::components::IO::Service();
  NS_ENSURE_TRUE(ioService, NS_ERROR_UNEXPECTED);

  for (auto iter = m_incomingServers.Iter(); !iter.Done(); iter.Next()) {
    // Find matching server by user+host+type+port.
    nsCOMPtr<nsIMsgIncomingServer>& server = iter.Data();

    if (!server) continue;

    nsCString thisHostname;
    rv = server->GetHostName(thisHostname);
    if (NS_FAILED(rv)) continue;

    // URL mutation expects percent-escaping in the hostname, which
    // `ConvertToDisplayIDN` will do for us.
    nsCString normalizedHostname;
    rv = idnService->ConvertToDisplayIDN(thisHostname, normalizedHostname);
    if (NS_FAILED(rv)) continue;

    // If the hostname will get normalized during URI mutation.
    // E.g. for IP with trailing dot, or hostname that's just a number.
    // We may well be here in findServerInternal to find a server from a folder
    // URI. We need to use the normalized version to find the server.
    // Create an imap url to see what it's normalized to. The normalization
    // is the same for all protocols.
    rv = NS_MutateURI(NS_STANDARDURLMUTATOR_CONTRACTID)
             .SetSpec("imap://"_ns + normalizedHostname)
             .Finalize(url);
    if (NS_SUCCEEDED(rv)) {
      rv = url->GetHost(normalizedHostname);
      if (NS_FAILED(rv)) continue;
    }

    nsCString thisUsername;
    rv = server->GetUsername(thisUsername);
    if (NS_FAILED(rv)) continue;

    nsCString thisType;
    rv = server->GetType(thisType);
    if (NS_FAILED(rv)) continue;

    int32_t thisPort = -1;  // use the default port identifier
    // Don't try and get a port for the 'none' scheme
    if (!thisType.EqualsLiteral("none")) {
      rv = server->GetPort(&thisPort);
      if (NS_FAILED(rv)) {
        continue;
      }
    }

    // treat "" as a wild card, so if the caller passed in "" for the desired
    // attribute treat it as a match
    if ((type.IsEmpty() || thisType.Equals(type)) &&
        (hostname.IsEmpty() ||
         normalizedHostname.Equals(hostname,
                                   nsCaseInsensitiveCStringComparator)) &&
        (!(port != 0) || (port == thisPort)) &&
        (username.IsEmpty() || thisUsername.Equals(username))) {
      // stop on first find; cache for next time
      SetLastServerFound(server, hostname, username, port, type);

      NS_ADDREF(*aResult = server);  // Was populated from member variable.
      return NS_OK;
    }
  }

  return NS_ERROR_UNEXPECTED;
}

// Always return NS_OK;
NS_IMETHODIMP
nsMsgAccountManager::FindServer(const nsACString& username,
                                const nsACString& hostname,
                                const nsACString& type, int32_t port,
                                nsIMsgIncomingServer** aResult) {
  *aResult = nullptr;
  findServerInternal(username, hostname, type, port, aResult);
  return NS_OK;
}

void nsMsgAccountManager::findAccountByServerKey(const nsCString& aKey,
                                                 nsIMsgAccount** aResult) {
  *aResult = nullptr;

  for (uint32_t i = 0; i < m_accounts.Length(); ++i) {
    nsCOMPtr<nsIMsgIncomingServer> server;
    nsresult rv = m_accounts[i]->GetIncomingServer(getter_AddRefs(server));
    if (!server || NS_FAILED(rv)) continue;

    nsCString key;
    rv = server->GetKey(key);
    if (NS_FAILED(rv)) continue;

    // if the keys are equal, the servers are equal
    if (key.Equals(aKey)) {
      NS_ADDREF(*aResult = m_accounts[i]);
      break;  // stop on first found account
    }
  }
}

NS_IMETHODIMP
nsMsgAccountManager::FindAccountForServer(nsIMsgIncomingServer* server,
                                          nsIMsgAccount** aResult) {
  NS_ENSURE_ARG_POINTER(aResult);

  if (!server) {
    (*aResult) = nullptr;
    return NS_OK;
  }

  nsresult rv;

  nsCString key;
  rv = server->GetKey(key);
  NS_ENSURE_SUCCESS(rv, rv);

  findAccountByServerKey(key, aResult);
  return NS_OK;
}

NS_IMETHODIMP
nsMsgAccountManager::GetFirstIdentityForServer(nsIMsgIncomingServer* aServer,
                                               nsIMsgIdentity** aIdentity) {
  NS_ENSURE_ARG_POINTER(aServer);
  NS_ENSURE_ARG_POINTER(aIdentity);

  nsTArray<RefPtr<nsIMsgIdentity>> identities;
  nsresult rv = GetIdentitiesForServer(aServer, identities);
  NS_ENSURE_SUCCESS(rv, rv);

  // not all servers have identities
  // for example, Local Folders
  if (identities.IsEmpty()) {
    *aIdentity = nullptr;
  } else {
    NS_IF_ADDREF(*aIdentity = identities[0]);
  }
  return rv;
}

NS_IMETHODIMP
nsMsgAccountManager::GetIdentitiesForServer(
    nsIMsgIncomingServer* server,
    nsTArray<RefPtr<nsIMsgIdentity>>& identities) {
  NS_ENSURE_ARG_POINTER(server);
  nsresult rv = LoadAccounts();
  NS_ENSURE_SUCCESS(rv, rv);

  identities.Clear();

  nsAutoCString serverKey;
  rv = server->GetKey(serverKey);
  NS_ENSURE_SUCCESS(rv, rv);

  for (auto account : m_accounts) {
    nsCOMPtr<nsIMsgIncomingServer> thisServer;
    rv = account->GetIncomingServer(getter_AddRefs(thisServer));
    if (NS_FAILED(rv) || !thisServer) continue;

    nsAutoCString thisServerKey;
    rv = thisServer->GetKey(thisServerKey);
    if (serverKey.Equals(thisServerKey)) {
      nsTArray<RefPtr<nsIMsgIdentity>> theseIdentities;
      rv = account->GetIdentities(theseIdentities);
      NS_ENSURE_SUCCESS(rv, rv);
      identities.AppendElements(theseIdentities);
    }
  }
  return NS_OK;
}

NS_IMETHODIMP
nsMsgAccountManager::GetServersForIdentity(
    nsIMsgIdentity* aIdentity,
    nsTArray<RefPtr<nsIMsgIncomingServer>>& servers) {
  NS_ENSURE_ARG_POINTER(aIdentity);
  servers.Clear();

  nsresult rv;
  rv = LoadAccounts();
  NS_ENSURE_SUCCESS(rv, rv);

  for (auto account : m_accounts) {
    nsTArray<RefPtr<nsIMsgIdentity>> identities;
    if (NS_FAILED(account->GetIdentities(identities))) continue;

    nsCString identityKey;
    aIdentity->GetKey(identityKey);
    for (auto thisIdentity : identities) {
      nsCString thisIdentityKey;
      rv = thisIdentity->GetKey(thisIdentityKey);

      if (NS_SUCCEEDED(rv) && identityKey.Equals(thisIdentityKey)) {
        nsCOMPtr<nsIMsgIncomingServer> thisServer;
        rv = account->GetIncomingServer(getter_AddRefs(thisServer));
        if (thisServer && NS_SUCCEEDED(rv)) {
          servers.AppendElement(thisServer);
          break;
        }
      }
    }
  }
  return NS_OK;
}

NS_IMETHODIMP
nsMsgAccountManager::AddRootFolderListener(nsIFolderListener* aListener) {
  NS_ENSURE_TRUE(aListener, NS_OK);
  mFolderListeners.AppendElement(aListener);
  for (auto iter = m_incomingServers.Iter(); !iter.Done(); iter.Next()) {
    nsCOMPtr<nsIMsgFolder> rootFolder;
    nsresult rv = iter.Data()->GetRootFolder(getter_AddRefs(rootFolder));
    if (NS_FAILED(rv)) {
      continue;
    }
    rv = rootFolder->AddFolderListener(aListener);
  }
  return NS_OK;
}

NS_IMETHODIMP
nsMsgAccountManager::RemoveRootFolderListener(nsIFolderListener* aListener) {
  NS_ENSURE_TRUE(aListener, NS_OK);
  mFolderListeners.RemoveElement(aListener);
  for (auto iter = m_incomingServers.Iter(); !iter.Done(); iter.Next()) {
    nsCOMPtr<nsIMsgFolder> rootFolder;
    nsresult rv = iter.Data()->GetRootFolder(getter_AddRefs(rootFolder));
    if (NS_FAILED(rv)) {
      continue;
    }
    rv = rootFolder->RemoveFolderListener(aListener);
  }

  return NS_OK;
}

NS_IMETHODIMP nsMsgAccountManager::SetLocalFoldersServer(
    nsIMsgIncomingServer* aServer) {
  NS_ENSURE_ARG_POINTER(aServer);
  nsCString key;
  nsresult rv = aServer->GetKey(key);
  NS_ENSURE_SUCCESS(rv, rv);

  return m_prefs->SetCharPref(PREF_MAIL_ACCOUNTMANAGER_LOCALFOLDERSSERVER, key);
}

NS_IMETHODIMP nsMsgAccountManager::GetLocalFoldersServer(
    nsIMsgIncomingServer** aServer) {
  NS_ENSURE_ARG_POINTER(aServer);

  nsCString serverKey;

  nsresult rv = m_prefs->GetCharPref(
      PREF_MAIL_ACCOUNTMANAGER_LOCALFOLDERSSERVER, serverKey);

  if (NS_SUCCEEDED(rv) && !serverKey.IsEmpty()) {
    rv = GetIncomingServer(serverKey, aServer);
    if (NS_SUCCEEDED(rv)) return rv;
    // otherwise, we're going to fall through to looking for an existing local
    // folders account, because now we fail creating one if one already exists.
  }

  // try ("nobody","Local Folders","none"), and work down to any "none" server.
  rv = findServerInternal("nobody"_ns, "Local Folders"_ns, "none"_ns, 0,
                          aServer);
  if (NS_FAILED(rv) || !*aServer) {
    rv = findServerInternal("nobody"_ns, EmptyCString(), "none"_ns, 0, aServer);
    if (NS_FAILED(rv) || !*aServer) {
      rv = findServerInternal(EmptyCString(), "Local Folders"_ns, "none"_ns, 0,
                              aServer);
      if (NS_FAILED(rv) || !*aServer)
        rv = findServerInternal(EmptyCString(), EmptyCString(), "none"_ns, 0,
                                aServer);
    }
  }

  NS_ENSURE_SUCCESS(rv, rv);
  if (!*aServer) return NS_ERROR_FAILURE;

  // we don't want the Smart Mailboxes server to be the local server.
  bool hidden;
  (*aServer)->GetHidden(&hidden);
  if (hidden) return NS_ERROR_FAILURE;

  rv = SetLocalFoldersServer(*aServer);
  return rv;
}

nsresult nsMsgAccountManager::GetLocalFoldersPrettyName(
    nsString& localFoldersName) {
  // we don't want "nobody at Local Folders" to show up in the
  // folder pane, so we set the pretty name to a localized "Local Folders"
  nsCOMPtr<nsIStringBundle> bundle;
  nsresult rv;
  nsCOMPtr<nsIStringBundleService> sBundleService =
      mozilla::components::StringBundle::Service();
  NS_ENSURE_TRUE(sBundleService, NS_ERROR_UNEXPECTED);

  rv = sBundleService->CreateBundle(
      "chrome://messenger/locale/messenger.properties", getter_AddRefs(bundle));
  NS_ENSURE_SUCCESS(rv, rv);

  return bundle->GetStringFromName("localFolders", localFoldersName);
}

NS_IMETHODIMP
nsMsgAccountManager::CreateLocalMailAccount(nsIMsgAccount** _retval) {
  // create the server
  nsCOMPtr<nsIMsgIncomingServer> server;
  nsresult rv = CreateIncomingServer("nobody"_ns, "Local Folders"_ns, "none"_ns,
                                     getter_AddRefs(server));
  NS_ENSURE_SUCCESS(rv, rv);

  nsString localFoldersName;
  rv = GetLocalFoldersPrettyName(localFoldersName);
  NS_ENSURE_SUCCESS(rv, rv);
  server->SetPrettyName(localFoldersName);

  nsCOMPtr<nsINoIncomingServer> noServer;
  noServer = do_QueryInterface(server, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  // create the directory structure for old 4.x "Local Mail"
  // under <profile dir>/Mail/Local Folders or
  // <"mail.directory" pref>/Local Folders
  nsCOMPtr<nsIFile> mailDir;
  bool dirExists;

  // we want <profile>/Mail
  rv = NS_GetSpecialDirectory(NS_APP_MAIL_50_DIR, getter_AddRefs(mailDir));
  NS_ENSURE_SUCCESS(rv, rv);

  rv = mailDir->Exists(&dirExists);
  if (NS_SUCCEEDED(rv) && !dirExists)
    rv = mailDir->Create(nsIFile::DIRECTORY_TYPE, 0775);
  NS_ENSURE_SUCCESS(rv, rv);

  // set the default local path for "none"
  rv = server->SetDefaultLocalPath(mailDir);
  NS_ENSURE_SUCCESS(rv, rv);

  // Create an account when valid server values are established.
  // This will keep the status of accounts sane by avoiding the addition of
  // incomplete accounts.
  nsCOMPtr<nsIMsgAccount> account;
  rv = CreateAccount(getter_AddRefs(account));
  NS_ENSURE_SUCCESS(rv, rv);

  // notice, no identity for local mail
  // hook the server to the account
  // after we set the server's local path
  // (see bug #66018)
  account->SetIncomingServer(server);

  // remember this as the local folders server
  rv = SetLocalFoldersServer(server);
  NS_ENSURE_SUCCESS(rv, rv);

  if (_retval) {
    account.forget(_retval);
  }
  return NS_OK;
}

NS_IMETHODIMP
nsMsgAccountManager::SetFolderDoingEmptyTrash(nsIMsgFolder* folder) {
  m_folderDoingEmptyTrash = folder;
  m_emptyTrashInProgress = true;
  return NS_OK;
}

NS_IMETHODIMP
nsMsgAccountManager::GetEmptyTrashInProgress(bool* bVal) {
  NS_ENSURE_ARG_POINTER(bVal);
  *bVal = m_emptyTrashInProgress;
  return NS_OK;
}

NS_IMETHODIMP
nsMsgAccountManager::SetFolderDoingCleanupInbox(nsIMsgFolder* folder) {
  m_folderDoingCleanupInbox = folder;
  m_cleanupInboxInProgress = true;
  return NS_OK;
}

NS_IMETHODIMP
nsMsgAccountManager::GetCleanupInboxInProgress(bool* bVal) {
  NS_ENSURE_ARG_POINTER(bVal);
  *bVal = m_cleanupInboxInProgress;
  return NS_OK;
}

void nsMsgAccountManager::SetLastServerFound(nsIMsgIncomingServer* server,
                                             const nsACString& hostname,
                                             const nsACString& username,
                                             const int32_t port,
                                             const nsACString& type) {
  m_lastFindServerResult = server;
  m_lastFindServerHostName = hostname;
  m_lastFindServerUserName = username;
  m_lastFindServerPort = port;
  m_lastFindServerType = type;
}

NS_IMETHODIMP
nsMsgAccountManager::SaveAccountInfo() {
  nsresult rv;
  nsCOMPtr<nsIPrefService> pref(do_GetService(NS_PREFSERVICE_CONTRACTID, &rv));
  NS_ENSURE_SUCCESS(rv, rv);
  return pref->SavePrefFile(nullptr);
}

NS_IMETHODIMP
nsMsgAccountManager::GetChromePackageName(const nsACString& aExtensionName,
                                          nsACString& aChromePackageName) {
  nsresult rv;
  nsCOMPtr<nsICategoryManager> catman =
      do_GetService(NS_CATEGORYMANAGER_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsISimpleEnumerator> e;
  rv = catman->EnumerateCategory(MAILNEWS_ACCOUNTMANAGER_EXTENSIONS,
                                 getter_AddRefs(e));
  if (NS_SUCCEEDED(rv) && e) {
    while (true) {
      nsCOMPtr<nsISupports> supports;
      rv = e->GetNext(getter_AddRefs(supports));
      nsCOMPtr<nsISupportsCString> catEntry = do_QueryInterface(supports);
      if (NS_FAILED(rv) || !catEntry) break;

      nsAutoCString entryString;
      rv = catEntry->GetData(entryString);
      if (NS_FAILED(rv)) break;

      nsCString contractidString;
      rv = catman->GetCategoryEntry(MAILNEWS_ACCOUNTMANAGER_EXTENSIONS,
                                    entryString, contractidString);
      if (NS_FAILED(rv)) break;

      nsCOMPtr<nsIMsgAccountManagerExtension> extension =
          do_GetService(contractidString.get(), &rv);
      if (NS_FAILED(rv) || !extension) break;

      nsCString name;
      rv = extension->GetName(name);
      if (NS_FAILED(rv)) break;

      if (name.Equals(aExtensionName))
        return extension->GetChromePackageName(aChromePackageName);
    }
  }
  return NS_ERROR_UNEXPECTED;
}

class VFChangeListenerEvent : public mozilla::Runnable {
 public:
  VFChangeListenerEvent(VirtualFolderChangeListener* vfChangeListener,
                        nsIMsgFolder* virtFolder, nsIMsgDatabase* virtDB)
      : mozilla::Runnable("VFChangeListenerEvent"),
        mVFChangeListener(vfChangeListener),
        mFolder(virtFolder),
        mDB(virtDB) {}

  NS_IMETHOD Run() {
    if (mVFChangeListener) mVFChangeListener->ProcessUpdateEvent(mFolder, mDB);
    return NS_OK;
  }

 private:
  RefPtr<VirtualFolderChangeListener> mVFChangeListener;
  nsCOMPtr<nsIMsgFolder> mFolder;
  nsCOMPtr<nsIMsgDatabase> mDB;
};

NS_IMPL_ISUPPORTS(VirtualFolderChangeListener, nsIDBChangeListener)

VirtualFolderChangeListener::VirtualFolderChangeListener()
    : m_searchOnMsgStatus(false), m_batchingEvents(false) {}

nsresult VirtualFolderChangeListener::Init() {
  nsCOMPtr<nsIMsgDatabase> msgDB;
  nsCOMPtr<nsIDBFolderInfo> dbFolderInfo;

  nsresult rv = m_virtualFolder->GetDBFolderInfoAndDB(
      getter_AddRefs(dbFolderInfo), getter_AddRefs(msgDB));
  if (NS_SUCCEEDED(rv) && msgDB) {
    nsCString searchTermString;
    dbFolderInfo->GetCharProperty("searchStr", searchTermString);
    nsCOMPtr<nsIMsgFilterService> filterService =
        do_GetService("@mozilla.org/messenger/services/filters;1", &rv);
    nsCOMPtr<nsIMsgFilterList> filterList;
    rv = filterService->GetTempFilterList(m_virtualFolder,
                                          getter_AddRefs(filterList));
    NS_ENSURE_SUCCESS(rv, rv);
    nsCOMPtr<nsIMsgFilter> tempFilter;
    filterList->CreateFilter(u"temp"_ns, getter_AddRefs(tempFilter));
    NS_ENSURE_SUCCESS(rv, rv);
    filterList->ParseCondition(tempFilter, searchTermString.get());
    NS_ENSURE_SUCCESS(rv, rv);
    m_searchSession =
        do_CreateInstance("@mozilla.org/messenger/searchSession;1", &rv);
    NS_ENSURE_SUCCESS(rv, rv);

    nsTArray<RefPtr<nsIMsgSearchTerm>> searchTerms;
    rv = tempFilter->GetSearchTerms(searchTerms);
    NS_ENSURE_SUCCESS(rv, rv);

    // we add the search scope right before we match the header,
    // because we don't want the search scope caching the body input
    // stream, because that holds onto the mailbox file, breaking
    // compaction.

    // add each search term to the search session
    for (nsIMsgSearchTerm* searchTerm : searchTerms) {
      nsMsgSearchAttribValue attrib;
      searchTerm->GetAttrib(&attrib);
      if (attrib == nsMsgSearchAttrib::MsgStatus) m_searchOnMsgStatus = true;
      m_searchSession->AppendTerm(searchTerm);
    }
  }
  return rv;
}

/**
 * nsIDBChangeListener
 */

NS_IMETHODIMP
VirtualFolderChangeListener::OnHdrPropertyChanged(
    nsIMsgDBHdr* aHdrChanged, const nsACString& property, bool aPreChange,
    uint32_t* aStatus, nsIDBChangeListener* aInstigator) {
  const uint32_t kMatch = 0x1;
  const uint32_t kRead = 0x2;
  const uint32_t kNew = 0x4;
  NS_ENSURE_ARG_POINTER(aHdrChanged);
  NS_ENSURE_ARG_POINTER(aStatus);

  uint32_t flags;
  bool match;
  nsCOMPtr<nsIMsgDatabase> msgDB;
  nsresult rv = m_folderWatching->GetMsgDatabase(getter_AddRefs(msgDB));
  NS_ENSURE_SUCCESS(rv, rv);
  // we don't want any early returns from this function, until we've
  // called ClearScopes on the search session.
  m_searchSession->AddScopeTerm(nsMsgSearchScope::offlineMail,
                                m_folderWatching);
  rv = m_searchSession->MatchHdr(aHdrChanged, msgDB, &match);
  m_searchSession->ClearScopes();
  NS_ENSURE_SUCCESS(rv, rv);
  aHdrChanged->GetFlags(&flags);

  if (aPreChange)  // We're looking at the old header, save status
  {
    *aStatus = 0;
    if (match) *aStatus |= kMatch;
    if (flags & nsMsgMessageFlags::Read) *aStatus |= kRead;
    if (flags & nsMsgMessageFlags::New) *aStatus |= kNew;
    return NS_OK;
  }

  // This is the post change section where changes are detected

  bool wasMatch = *aStatus & kMatch;
  if (!match && !wasMatch)  // header not in virtual folder
    return NS_OK;

  int32_t totalDelta = 0, unreadDelta = 0, newDelta = 0;

  if (match) {
    totalDelta++;
    if (!(flags & nsMsgMessageFlags::Read)) unreadDelta++;
    if (flags & nsMsgMessageFlags::New) newDelta++;
  }

  if (wasMatch) {
    totalDelta--;
    if (!(*aStatus & kRead)) unreadDelta--;
    if (*aStatus & kNew) newDelta--;
  }

  if (!(unreadDelta || totalDelta || newDelta)) return NS_OK;

  nsCOMPtr<nsIMsgDatabase> virtDatabase;
  nsCOMPtr<nsIDBFolderInfo> dbFolderInfo;
  rv = m_virtualFolder->GetDBFolderInfoAndDB(getter_AddRefs(dbFolderInfo),
                                             getter_AddRefs(virtDatabase));
  NS_ENSURE_SUCCESS(rv, rv);

  if (unreadDelta) dbFolderInfo->ChangeNumUnreadMessages(unreadDelta);

  if (newDelta) {
    int32_t numNewMessages;
    m_virtualFolder->GetNumNewMessages(false, &numNewMessages);
    m_virtualFolder->SetNumNewMessages(numNewMessages + newDelta);
    m_virtualFolder->SetHasNewMessages(numNewMessages + newDelta > 0);
  }

  if (totalDelta) {
    dbFolderInfo->ChangeNumMessages(totalDelta);
    nsCString searchUri;
    m_virtualFolder->GetURI(searchUri);
    msgDB->UpdateHdrInCache(searchUri, aHdrChanged, totalDelta == 1);
  }

  PostUpdateEvent(m_virtualFolder, virtDatabase);

  return NS_OK;
}

void VirtualFolderChangeListener::DecrementNewMsgCount() {
  int32_t numNewMessages;
  m_virtualFolder->GetNumNewMessages(false, &numNewMessages);
  if (numNewMessages > 0) numNewMessages--;
  m_virtualFolder->SetNumNewMessages(numNewMessages);
  if (!numNewMessages) m_virtualFolder->SetHasNewMessages(false);
}

NS_IMETHODIMP VirtualFolderChangeListener::OnHdrFlagsChanged(
    nsIMsgDBHdr* aHdrChanged, uint32_t aOldFlags, uint32_t aNewFlags,
    nsIDBChangeListener* aInstigator) {
  nsCOMPtr<nsIMsgDatabase> msgDB;

  nsresult rv = m_folderWatching->GetMsgDatabase(getter_AddRefs(msgDB));
  bool oldMatch = false, newMatch = false;
  // we don't want any early returns from this function, until we've
  // called ClearScopes 0n the search session.
  m_searchSession->AddScopeTerm(nsMsgSearchScope::offlineMail,
                                m_folderWatching);
  rv = m_searchSession->MatchHdr(aHdrChanged, msgDB, &newMatch);
  if (NS_SUCCEEDED(rv) && m_searchOnMsgStatus) {
    // if status is a search criteria, check if the header matched before
    // it changed, in order to determine if we need to bump the counts.
    aHdrChanged->SetFlags(aOldFlags);
    rv = m_searchSession->MatchHdr(aHdrChanged, msgDB, &oldMatch);
    // restore new flags even on match failure.
    aHdrChanged->SetFlags(aNewFlags);
  } else
    oldMatch = newMatch;
  m_searchSession->ClearScopes();
  NS_ENSURE_SUCCESS(rv, rv);
  // we don't want to change the total counts if this virtual folder is open in
  // a view, because we won't remove the header from view while it's open. On
  // the other hand, it's hard to fix the count when the user clicks away to
  // another folder, w/o re-running the search, or setting some sort of pending
  // count change. Maybe this needs to be handled in the view code...the view
  // could do the same calculation and also keep track of the counts changed.
  // Then, when the view was closed, if it's a virtual folder, it could update
  // the counts for the db.
  if (oldMatch != newMatch ||
      (oldMatch && (aOldFlags & nsMsgMessageFlags::Read) !=
                       (aNewFlags & nsMsgMessageFlags::Read))) {
    nsCOMPtr<nsIMsgDatabase> virtDatabase;
    nsCOMPtr<nsIDBFolderInfo> dbFolderInfo;

    rv = m_virtualFolder->GetDBFolderInfoAndDB(getter_AddRefs(dbFolderInfo),
                                               getter_AddRefs(virtDatabase));
    NS_ENSURE_SUCCESS(rv, rv);
    int32_t totalDelta = 0, unreadDelta = 0;
    if (oldMatch != newMatch) {
      // bool isOpen = false;
      // nsCOMPtr<nsIMsgMailSession> mailSession =
      //     do_GetService("@mozilla.org/messenger/services/session;1");
      // if (mailSession && aFolder)
      //   mailSession->IsFolderOpenInWindow(m_virtualFolder, &isOpen);
      // we can't remove headers that no longer match - but we might add headers
      // that newly match, someday.
      // if (!isOpen)
      totalDelta = (oldMatch) ? -1 : 1;
    }
    bool msgHdrIsRead;
    aHdrChanged->GetIsRead(&msgHdrIsRead);
    if (oldMatch == newMatch)  // read flag changed state
      unreadDelta = (msgHdrIsRead) ? -1 : 1;
    else if (oldMatch)  // else header should removed
      unreadDelta = (aOldFlags & nsMsgMessageFlags::Read) ? 0 : -1;
    else  // header should be added
      unreadDelta = (aNewFlags & nsMsgMessageFlags::Read) ? 0 : 1;
    if (unreadDelta) dbFolderInfo->ChangeNumUnreadMessages(unreadDelta);
    if (totalDelta) dbFolderInfo->ChangeNumMessages(totalDelta);
    if (unreadDelta == -1 && aOldFlags & nsMsgMessageFlags::New)
      DecrementNewMsgCount();

    if (totalDelta) {
      nsCString searchUri;
      m_virtualFolder->GetURI(searchUri);
      msgDB->UpdateHdrInCache(searchUri, aHdrChanged, totalDelta == 1);
    }

    PostUpdateEvent(m_virtualFolder, virtDatabase);
  } else if (oldMatch && (aOldFlags & nsMsgMessageFlags::New) &&
             !(aNewFlags & nsMsgMessageFlags::New))
    DecrementNewMsgCount();

  return rv;
}

NS_IMETHODIMP VirtualFolderChangeListener::OnHdrDeleted(
    nsIMsgDBHdr* aHdrDeleted, nsMsgKey aParentKey, int32_t aFlags,
    nsIDBChangeListener* aInstigator) {
  nsCOMPtr<nsIMsgDatabase> msgDB;

  nsresult rv = m_folderWatching->GetMsgDatabase(getter_AddRefs(msgDB));
  NS_ENSURE_SUCCESS(rv, rv);
  bool match = false;
  m_searchSession->AddScopeTerm(nsMsgSearchScope::offlineMail,
                                m_folderWatching);
  // Since the notifier went to the trouble of passing in the msg flags,
  // we should use them when doing the match.
  uint32_t msgFlags;
  aHdrDeleted->GetFlags(&msgFlags);
  aHdrDeleted->SetFlags(aFlags);
  rv = m_searchSession->MatchHdr(aHdrDeleted, msgDB, &match);
  aHdrDeleted->SetFlags(msgFlags);
  m_searchSession->ClearScopes();
  if (match) {
    nsCOMPtr<nsIMsgDatabase> virtDatabase;
    nsCOMPtr<nsIDBFolderInfo> dbFolderInfo;

    rv = m_virtualFolder->GetDBFolderInfoAndDB(getter_AddRefs(dbFolderInfo),
                                               getter_AddRefs(virtDatabase));
    NS_ENSURE_SUCCESS(rv, rv);
    bool msgHdrIsRead;
    aHdrDeleted->GetIsRead(&msgHdrIsRead);
    if (!msgHdrIsRead) dbFolderInfo->ChangeNumUnreadMessages(-1);
    dbFolderInfo->ChangeNumMessages(-1);
    if (aFlags & nsMsgMessageFlags::New) {
      int32_t numNewMessages;
      m_virtualFolder->GetNumNewMessages(false, &numNewMessages);
      m_virtualFolder->SetNumNewMessages(numNewMessages - 1);
      if (numNewMessages == 1) m_virtualFolder->SetHasNewMessages(false);
    }

    nsCString searchUri;
    m_virtualFolder->GetURI(searchUri);
    msgDB->UpdateHdrInCache(searchUri, aHdrDeleted, false);

    PostUpdateEvent(m_virtualFolder, virtDatabase);
  }
  return rv;
}

NS_IMETHODIMP VirtualFolderChangeListener::OnHdrAdded(
    nsIMsgDBHdr* aNewHdr, nsMsgKey aParentKey, int32_t aFlags,
    nsIDBChangeListener* aInstigator) {
  nsCOMPtr<nsIMsgDatabase> msgDB;

  nsresult rv = m_folderWatching->GetMsgDatabase(getter_AddRefs(msgDB));
  NS_ENSURE_SUCCESS(rv, rv);
  bool match = false;
  if (!m_searchSession) return NS_ERROR_NULL_POINTER;

  m_searchSession->AddScopeTerm(nsMsgSearchScope::offlineMail,
                                m_folderWatching);
  rv = m_searchSession->MatchHdr(aNewHdr, msgDB, &match);
  m_searchSession->ClearScopes();
  if (match) {
    nsCOMPtr<nsIMsgDatabase> virtDatabase;
    nsCOMPtr<nsIDBFolderInfo> dbFolderInfo;

    rv = m_virtualFolder->GetDBFolderInfoAndDB(getter_AddRefs(dbFolderInfo),
                                               getter_AddRefs(virtDatabase));
    NS_ENSURE_SUCCESS(rv, rv);
    bool msgHdrIsRead;
    uint32_t msgFlags;
    aNewHdr->GetIsRead(&msgHdrIsRead);
    aNewHdr->GetFlags(&msgFlags);
    if (!msgHdrIsRead) dbFolderInfo->ChangeNumUnreadMessages(1);
    if (msgFlags & nsMsgMessageFlags::New) {
      int32_t numNewMessages;
      m_virtualFolder->GetNumNewMessages(false, &numNewMessages);
      m_virtualFolder->SetHasNewMessages(true);
      m_virtualFolder->SetNumNewMessages(numNewMessages + 1);
    }
    nsCString searchUri;
    m_virtualFolder->GetURI(searchUri);
    msgDB->UpdateHdrInCache(searchUri, aNewHdr, true);
    dbFolderInfo->ChangeNumMessages(1);
    PostUpdateEvent(m_virtualFolder, virtDatabase);
  }
  return rv;
}

NS_IMETHODIMP VirtualFolderChangeListener::OnParentChanged(
    nsMsgKey aKeyChanged, nsMsgKey oldParent, nsMsgKey newParent,
    nsIDBChangeListener* aInstigator) {
  return NS_OK;
}

NS_IMETHODIMP VirtualFolderChangeListener::OnAnnouncerGoingAway(
    nsIDBChangeAnnouncer* instigator) {
  nsCOMPtr<nsIMsgDatabase> msgDB = do_QueryInterface(instigator);
  if (msgDB) msgDB->RemoveListener(this);
  return NS_OK;
}

NS_IMETHODIMP
VirtualFolderChangeListener::OnEvent(nsIMsgDatabase* aDB, const char* aEvent) {
  return NS_OK;
}

NS_IMETHODIMP VirtualFolderChangeListener::OnReadChanged(
    nsIDBChangeListener* aInstigator) {
  return NS_OK;
}

NS_IMETHODIMP VirtualFolderChangeListener::OnJunkScoreChanged(
    nsIDBChangeListener* aInstigator) {
  return NS_OK;
}

nsresult VirtualFolderChangeListener::PostUpdateEvent(
    nsIMsgFolder* virtualFolder, nsIMsgDatabase* virtDatabase) {
  if (m_batchingEvents) return NS_OK;
  m_batchingEvents = true;
  nsCOMPtr<nsIRunnable> event =
      new VFChangeListenerEvent(this, virtualFolder, virtDatabase);
  return NS_DispatchToCurrentThread(event);
}

void VirtualFolderChangeListener::ProcessUpdateEvent(nsIMsgFolder* virtFolder,
                                                     nsIMsgDatabase* virtDB) {
  m_batchingEvents = false;
  virtFolder->UpdateSummaryTotals(true);  // force update from db.
  virtDB->Commit(nsMsgDBCommitType::kLargeCommit);
}

nsresult nsMsgAccountManager::GetVirtualFoldersFile(nsCOMPtr<nsIFile>& aFile) {
  nsCOMPtr<nsIFile> profileDir;
  nsresult rv = NS_GetSpecialDirectory(NS_APP_USER_PROFILE_50_DIR,
                                       getter_AddRefs(profileDir));
  NS_ENSURE_SUCCESS(rv, rv);

  rv = profileDir->AppendNative("virtualFolders.dat"_ns);
  if (NS_SUCCEEDED(rv)) aFile = profileDir;
  return rv;
}

NS_IMETHODIMP nsMsgAccountManager::LoadVirtualFolders() {
  nsCOMPtr<nsIFile> file;
  GetVirtualFoldersFile(file);
  if (!file) return NS_ERROR_FAILURE;
  bool exists;
  nsresult rv = file->Exists(&exists);
  NS_ENSURE_SUCCESS(rv, rv);
  if (!exists) {
    m_virtualFoldersLoaded = true;
    return NS_OK;
  }

  if (m_virtualFoldersLoaded) return NS_OK;

  m_loadingVirtualFolders = true;

  // Before loading virtual folders, ensure that all real folders exist.
  // Some may not have been created yet, which would break virtual folders
  // that depend on them.
  nsTArray<RefPtr<nsIMsgIncomingServer>> allServers;
  rv = GetAllServers(allServers);
  NS_ENSURE_SUCCESS(rv, rv);
  for (auto server : allServers) {
    if (server) {
      nsCOMPtr<nsIMsgFolder> rootFolder;
      server->GetRootFolder(getter_AddRefs(rootFolder));
      if (rootFolder) {
        nsTArray<RefPtr<nsIMsgFolder>> dummy;
        rootFolder->GetSubFolders(dummy);
      }
    }
  }

  if (!m_dbService) {
    m_dbService = do_GetService("@mozilla.org/msgDatabase/msgDBService;1", &rv);
    NS_ENSURE_SUCCESS(rv, rv);
  }

  nsCOMPtr<nsIFileInputStream> fileStream =
      do_CreateInstance(NS_LOCALFILEINPUTSTREAM_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = fileStream->Init(file, PR_RDONLY, 0664, false);
  nsCOMPtr<nsILineInputStream> lineInputStream(do_QueryInterface(fileStream));

  bool isMore = true;
  nsAutoCString buffer;
  int32_t version = -1;
  nsCOMPtr<nsIMsgFolder> virtualFolder;
  nsCOMPtr<nsIDBFolderInfo> dbFolderInfo;

  while (isMore && NS_SUCCEEDED(lineInputStream->ReadLine(buffer, &isMore))) {
    if (!buffer.IsEmpty()) {
      if (version == -1) {
        buffer.Cut(0, 8);
        nsresult irv;
        version = buffer.ToInteger(&irv);
        continue;
      }
      if (StringBeginsWith(buffer, "uri="_ns)) {
        buffer.Cut(0, 4);
        dbFolderInfo = nullptr;

        rv = GetOrCreateFolder(buffer, getter_AddRefs(virtualFolder));
        NS_ENSURE_SUCCESS(rv, rv);

        virtualFolder->SetFlag(nsMsgFolderFlags::Virtual);

        nsCOMPtr<nsIMsgFolder> grandParent;
        nsCOMPtr<nsIMsgFolder> oldParent;
        nsCOMPtr<nsIMsgFolder> parentFolder;
        bool isServer;
        // This loop handles creating virtual folders without an existing
        // parent.
        do {
          // need to add the folder as a sub-folder of its parent.
          int32_t lastSlash = buffer.RFindChar('/');
          if (lastSlash == kNotFound) break;
          nsDependentCSubstring parentUri(buffer, 0, lastSlash);
          // hold a reference so it won't get deleted before it's parented.
          oldParent = parentFolder;

          rv = GetOrCreateFolder(parentUri, getter_AddRefs(parentFolder));
          NS_ENSURE_SUCCESS(rv, rv);

          nsAutoString currentFolderNameStr;
          nsAutoCString currentFolderNameCStr;
          MsgUnescapeString(Substring(buffer, lastSlash + 1, buffer.Length()),
                            0, currentFolderNameCStr);
          CopyUTF8toUTF16(currentFolderNameCStr, currentFolderNameStr);
          nsCOMPtr<nsIMsgFolder> childFolder;
          nsCOMPtr<nsIMsgDatabase> db;
          // force db to get created.
          // XXX TODO: is this SetParent() right? Won't it screw up if virtual
          // folder is nested >2 deep? Leave for now, but revisit when getting
          // rid of dangling folders (BenC).
          virtualFolder->SetParent(parentFolder);
          rv = virtualFolder->GetMsgDatabase(getter_AddRefs(db));
          if (rv == NS_MSG_ERROR_FOLDER_SUMMARY_MISSING)
            m_dbService->CreateNewDB(virtualFolder, getter_AddRefs(db));
          if (db)
            rv = db->GetDBFolderInfo(getter_AddRefs(dbFolderInfo));
          else
            break;

          parentFolder->AddSubfolder(currentFolderNameStr,
                                     getter_AddRefs(childFolder));
          if (childFolder) parentFolder->NotifyFolderAdded(childFolder);
          // here we make sure if our parent is rooted - if not, we're
          // going to loop and add our parent as a child of its grandparent
          // and repeat until we get to the server, or a folder that
          // has its parent set.
          parentFolder->GetParent(getter_AddRefs(grandParent));
          parentFolder->GetIsServer(&isServer);
          buffer.SetLength(lastSlash);
        } while (!grandParent && !isServer);
      } else if (dbFolderInfo && StringBeginsWith(buffer, "scope="_ns)) {
        buffer.Cut(0, 6);
        // if this is a cross folder virtual folder, we have a list of folders
        // uris, and we have to add a pending listener for each of them.
        if (!buffer.IsEmpty()) {
          ParseAndVerifyVirtualFolderScope(buffer);
          dbFolderInfo->SetCharProperty(kSearchFolderUriProp, buffer);
          AddVFListenersForVF(virtualFolder, buffer);
        }
      } else if (dbFolderInfo && StringBeginsWith(buffer, "terms="_ns)) {
        buffer.Cut(0, 6);
        dbFolderInfo->SetCharProperty("searchStr", buffer);
      } else if (dbFolderInfo && StringBeginsWith(buffer, "searchOnline="_ns)) {
        buffer.Cut(0, 13);
        dbFolderInfo->SetBooleanProperty("searchOnline",
                                         buffer.EqualsLiteral("true"));
      } else if (dbFolderInfo &&
                 Substring(buffer, 0, SEARCH_FOLDER_FLAG_LEN + 1)
                     .Equals(SEARCH_FOLDER_FLAG "=")) {
        buffer.Cut(0, SEARCH_FOLDER_FLAG_LEN + 1);
        dbFolderInfo->SetCharProperty(SEARCH_FOLDER_FLAG, buffer);
      }
    }
  }

  m_loadingVirtualFolders = false;
  m_virtualFoldersLoaded = true;
  return rv;
}

NS_IMETHODIMP nsMsgAccountManager::SaveVirtualFolders() {
  if (!m_virtualFoldersLoaded) return NS_OK;

  nsCOMPtr<nsIFile> file;
  GetVirtualFoldersFile(file);

  // Open a buffered, safe output stream
  nsCOMPtr<nsIOutputStream> outStream;
  nsresult rv = MsgNewSafeBufferedFileOutputStream(
      getter_AddRefs(outStream), file, PR_CREATE_FILE | PR_WRONLY | PR_TRUNCATE,
      0664);
  NS_ENSURE_SUCCESS(rv, rv);

  WriteLineToOutputStream("version=", "1", outStream);
  for (auto iter = m_incomingServers.Iter(); !iter.Done(); iter.Next()) {
    nsCOMPtr<nsIMsgIncomingServer>& server = iter.Data();
    if (server) {
      nsCOMPtr<nsIMsgFolder> rootFolder;
      server->GetRootFolder(getter_AddRefs(rootFolder));
      if (rootFolder) {
        nsTArray<RefPtr<nsIMsgFolder>> virtualFolders;
        nsresult rv = rootFolder->GetFoldersWithFlags(nsMsgFolderFlags::Virtual,
                                                      virtualFolders);
        if (NS_FAILED(rv)) {
          continue;
        }
        for (auto msgFolder : virtualFolders) {
          nsCOMPtr<nsIMsgDatabase> db;
          nsCOMPtr<nsIDBFolderInfo> dbFolderInfo;
          rv = msgFolder->GetDBFolderInfoAndDB(
              getter_AddRefs(dbFolderInfo),
              getter_AddRefs(db));  // force db to get created.
          if (dbFolderInfo) {
            nsCString srchFolderUri;
            nsCString searchTerms;
            nsCString regexScope;
            nsCString vfFolderFlag;
            bool searchOnline = false;
            dbFolderInfo->GetBooleanProperty("searchOnline", false,
                                             &searchOnline);
            dbFolderInfo->GetCharProperty(kSearchFolderUriProp, srchFolderUri);
            dbFolderInfo->GetCharProperty("searchStr", searchTerms);
            // logically searchFolderFlag is an int, but since we want to
            // write out a string, get it as a string.
            dbFolderInfo->GetCharProperty(SEARCH_FOLDER_FLAG, vfFolderFlag);
            nsCString uri;
            msgFolder->GetURI(uri);
            if (!srchFolderUri.IsEmpty() && !searchTerms.IsEmpty()) {
              WriteLineToOutputStream("uri=", uri.get(), outStream);
              if (!vfFolderFlag.IsEmpty())
                WriteLineToOutputStream(SEARCH_FOLDER_FLAG "=",
                                        vfFolderFlag.get(), outStream);
              WriteLineToOutputStream("scope=", srchFolderUri.get(), outStream);
              WriteLineToOutputStream("terms=", searchTerms.get(), outStream);
              WriteLineToOutputStream(
                  "searchOnline=", searchOnline ? "true" : "false", outStream);
            }
          }
        }
      }
    }
  }

  nsCOMPtr<nsISafeOutputStream> safeStream = do_QueryInterface(outStream, &rv);
  NS_ASSERTION(safeStream, "expected a safe output stream!");
  if (safeStream) {
    rv = safeStream->Finish();
    if (NS_FAILED(rv)) {
      NS_WARNING("failed to save personal dictionary file! possible data loss");
    }
  }
  return rv;
}

nsresult nsMsgAccountManager::WriteLineToOutputStream(
    const char* prefix, const char* line, nsIOutputStream* outputStream) {
  uint32_t writeCount;
  outputStream->Write(prefix, strlen(prefix), &writeCount);
  outputStream->Write(line, strlen(line), &writeCount);
  outputStream->Write("\n", 1, &writeCount);
  return NS_OK;
}

/**
 * Parse the '|' separated folder uri string into individual folders, verify
 * that the folders are real. If we were to add things like wildcards, we
 * could implement the expansion into real folders here.
 *
 * @param buffer On input, list of folder uri's, on output, verified list.
 */
void nsMsgAccountManager::ParseAndVerifyVirtualFolderScope(nsCString& buffer) {
  if (buffer.Equals("*")) {
    // This is a special virtual folder that searches all folders in all
    // accounts. Folders are chosen by the front end at search time.
    return;
  }
  nsCString verifiedFolders;
  nsTArray<nsCString> folderUris;
  ParseString(buffer, '|', folderUris);
  nsCOMPtr<nsIMsgIncomingServer> server;
  nsCOMPtr<nsIMsgFolder> parent;

  for (uint32_t i = 0; i < folderUris.Length(); i++) {
    nsCOMPtr<nsIMsgFolder> realFolder;
    nsresult rv = GetOrCreateFolder(folderUris[i], getter_AddRefs(realFolder));
    if (!NS_SUCCEEDED(rv)) {
      continue;
    }
    realFolder->GetParent(getter_AddRefs(parent));
    if (!parent) continue;
    realFolder->GetServer(getter_AddRefs(server));
    if (!server) continue;
    if (!verifiedFolders.IsEmpty()) verifiedFolders.Append('|');
    verifiedFolders.Append(folderUris[i]);
  }
  buffer.Assign(verifiedFolders);
}

// This conveniently works to add a single folder as well.
nsresult nsMsgAccountManager::AddVFListenersForVF(
    nsIMsgFolder* virtualFolder, const nsCString& srchFolderUris) {
  if (srchFolderUris.Equals("*")) {
    return NS_OK;
  }

  nsresult rv;
  if (!m_dbService) {
    m_dbService = do_GetService("@mozilla.org/msgDatabase/msgDBService;1", &rv);
    NS_ENSURE_SUCCESS(rv, rv);
  }

  // Avoid any possible duplicate listeners for this virtual folder.
  RemoveVFListenerForVF(virtualFolder, nullptr);

  nsTArray<nsCString> folderUris;
  ParseString(srchFolderUris, '|', folderUris);

  for (uint32_t i = 0; i < folderUris.Length(); i++) {
    nsCOMPtr<nsIMsgFolder> realFolder;
    rv = GetOrCreateFolder(folderUris[i], getter_AddRefs(realFolder));
    NS_ENSURE_SUCCESS(rv, rv);
    RefPtr<VirtualFolderChangeListener> dbListener =
        new VirtualFolderChangeListener();
    NS_ENSURE_TRUE(dbListener, NS_ERROR_OUT_OF_MEMORY);
    dbListener->m_virtualFolder = virtualFolder;
    dbListener->m_folderWatching = realFolder;
    if (NS_FAILED(dbListener->Init())) {
      dbListener = nullptr;
      continue;
    }
    m_virtualFolderListeners.AppendElement(dbListener);
    m_dbService->RegisterPendingListener(realFolder, dbListener);
  }
  if (!m_virtualFolders.Contains(virtualFolder)) {
    m_virtualFolders.AppendElement(virtualFolder);
  }
  return NS_OK;
}

// This is called if a folder that's part of the scope of a saved search
// has gone away.
nsresult nsMsgAccountManager::RemoveVFListenerForVF(nsIMsgFolder* virtualFolder,
                                                    nsIMsgFolder* folder) {
  nsresult rv;
  if (!m_dbService) {
    m_dbService = do_GetService("@mozilla.org/msgDatabase/msgDBService;1", &rv);
    NS_ENSURE_SUCCESS(rv, rv);
  }

  nsTObserverArray<RefPtr<VirtualFolderChangeListener>>::ForwardIterator iter(
      m_virtualFolderListeners);
  RefPtr<VirtualFolderChangeListener> listener;

  while (iter.HasMore()) {
    listener = iter.GetNext();
    if (listener->m_virtualFolder == virtualFolder &&
        (!folder || listener->m_folderWatching == folder)) {
      m_dbService->UnregisterPendingListener(listener);
      m_virtualFolderListeners.RemoveElement(listener);
      if (folder) {
        break;
      }
    }
  }
  return NS_OK;
}

NS_IMETHODIMP nsMsgAccountManager::GetAllFolders(
    nsTArray<RefPtr<nsIMsgFolder>>& aAllFolders) {
  aAllFolders.Clear();
  nsTArray<RefPtr<nsIMsgIncomingServer>> allServers;
  nsresult rv = GetAllServers(allServers);
  NS_ENSURE_SUCCESS(rv, rv);

  for (auto server : allServers) {
    if (server) {
      nsCOMPtr<nsIMsgFolder> rootFolder;
      server->GetRootFolder(getter_AddRefs(rootFolder));
      if (rootFolder) {
        nsTArray<RefPtr<nsIMsgFolder>> descendants;
        rootFolder->GetDescendants(descendants);
        aAllFolders.AppendElements(descendants);
      }
    }
  }
  return NS_OK;
}

NS_IMETHODIMP nsMsgAccountManager::OnFolderAdded(nsIMsgFolder* parent,
                                                 nsIMsgFolder* folder) {
  if (!parent) {
    // This method gets called for folders that aren't connected to anything,
    // such as a junk folder that appears when an IMAP account is created. We
    // don't want these added to the virtual folder.
    return NS_OK;
  }

  uint32_t folderFlags;
  folder->GetFlags(&folderFlags);

  bool addToSmartFolders = false;
  folder->IsSpecialFolder(nsMsgFolderFlags::Inbox |
                              nsMsgFolderFlags::Templates |
                              nsMsgFolderFlags::Trash |
                              nsMsgFolderFlags::Drafts | nsMsgFolderFlags::Junk,
                          false, &addToSmartFolders);
  // For Sent/Archives/Trash, we treat sub-folders of those folders as
  // "special", and want to add them the smart folders search scope.
  // So we check if this is a sub-folder of one of those special folders
  // and set the corresponding folderFlag if so.
  if (!addToSmartFolders) {
    bool isSpecial = false;
    folder->IsSpecialFolder(nsMsgFolderFlags::SentMail, true, &isSpecial);
    if (isSpecial) {
      addToSmartFolders = true;
      folderFlags |= nsMsgFolderFlags::SentMail;
    }
    folder->IsSpecialFolder(nsMsgFolderFlags::Archive, true, &isSpecial);
    if (isSpecial) {
      addToSmartFolders = true;
      folderFlags |= nsMsgFolderFlags::Archive;
    }
    folder->IsSpecialFolder(nsMsgFolderFlags::Trash, true, &isSpecial);
    if (isSpecial) {
      addToSmartFolders = true;
      folderFlags |= nsMsgFolderFlags::Trash;
    }
  }
  nsresult rv = NS_OK;
  // if this is a special folder, check if we have a saved search over
  // folders with this flag, and if so, add this folder to the scope.
  if (addToSmartFolders) {
    // quick way to enumerate the saved searches.
    for (nsCOMPtr<nsIMsgFolder> virtualFolder : m_virtualFolders) {
      nsCOMPtr<nsIMsgDatabase> db;
      nsCOMPtr<nsIDBFolderInfo> dbFolderInfo;
      virtualFolder->GetDBFolderInfoAndDB(getter_AddRefs(dbFolderInfo),
                                          getter_AddRefs(db));
      if (dbFolderInfo) {
        uint32_t vfFolderFlag;
        dbFolderInfo->GetUint32Property("searchFolderFlag", 0, &vfFolderFlag);
        // found a saved search over folders w/ the same flag as the new folder.
        if (vfFolderFlag & folderFlags) {
          nsCString searchURI;
          dbFolderInfo->GetCharProperty(kSearchFolderUriProp, searchURI);

          // "normalize" searchURI so we can search for |folderURI|.
          if (!searchURI.IsEmpty()) {
            searchURI.Insert('|', 0);
            searchURI.Append('|');
          }
          nsCString folderURI;
          folder->GetURI(folderURI);
          folderURI.Insert('|', 0);
          folderURI.Append('|');

          int32_t index = searchURI.Find(folderURI);
          if (index == kNotFound) {
            searchURI.Cut(0, 1);
            folderURI.Cut(0, 1);
            folderURI.SetLength(folderURI.Length() - 1);
            searchURI.Append(folderURI);
            dbFolderInfo->SetCharProperty(kSearchFolderUriProp, searchURI);
            nsCOMPtr<nsIObserverService> obs =
                mozilla::services::GetObserverService();
            obs->NotifyObservers(virtualFolder, "search-folders-changed",
                                 nullptr);
          }

          // Add sub-folders to smart folder.
          nsTArray<RefPtr<nsIMsgFolder>> allDescendants;
          rv = folder->GetDescendants(allDescendants);
          NS_ENSURE_SUCCESS(rv, rv);

          nsCOMPtr<nsIMsgFolder> parentFolder;
          for (auto subFolder : allDescendants) {
            subFolder->GetParent(getter_AddRefs(parentFolder));
            OnFolderAdded(parentFolder, subFolder);
          }
        }
      }
    }
  }

  // Find any virtual folders that search `parent`, and add `folder` to them.
  if (!(folderFlags & nsMsgFolderFlags::Virtual)) {
    nsTObserverArray<RefPtr<VirtualFolderChangeListener>>::ForwardIterator iter(
        m_virtualFolderListeners);
    RefPtr<VirtualFolderChangeListener> listener;

    while (iter.HasMore()) {
      listener = iter.GetNext();
      if (listener->m_folderWatching == parent) {
        nsCOMPtr<nsIMsgDatabase> db;
        nsCOMPtr<nsIDBFolderInfo> dbFolderInfo;
        listener->m_virtualFolder->GetDBFolderInfoAndDB(
            getter_AddRefs(dbFolderInfo), getter_AddRefs(db));

        uint32_t vfFolderFlag;
        dbFolderInfo->GetUint32Property("searchFolderFlag", 0, &vfFolderFlag);
        if (addToSmartFolders && vfFolderFlag &&
            !(vfFolderFlag & nsMsgFolderFlags::Trash)) {
          // Don't add folders of one type to the unified folder of another
          // type, unless it's the Trash unified folder.
          continue;
        }
        nsCString searchURI;
        dbFolderInfo->GetCharProperty(kSearchFolderUriProp, searchURI);

        // "normalize" searchURI so we can search for |folderURI|.
        if (!searchURI.IsEmpty()) {
          searchURI.Insert('|', 0);
          searchURI.Append('|');
        }
        nsCString folderURI;
        folder->GetURI(folderURI);

        int32_t index = searchURI.Find(folderURI);
        if (index == kNotFound) {
          searchURI.Cut(0, 1);
          searchURI.Append(folderURI);
          dbFolderInfo->SetCharProperty(kSearchFolderUriProp, searchURI);
          nsCOMPtr<nsIObserverService> obs =
              mozilla::services::GetObserverService();
          obs->NotifyObservers(listener->m_virtualFolder,
                               "search-folders-changed", nullptr);
        }
      }
    }
  }

  // need to make sure this isn't happening during loading of virtualfolders.dat
  if (folderFlags & nsMsgFolderFlags::Virtual && !m_loadingVirtualFolders) {
    // When a new virtual folder is added, need to create a db Listener for it.
    nsCOMPtr<nsIMsgDatabase> virtDatabase;
    nsCOMPtr<nsIDBFolderInfo> dbFolderInfo;
    rv = folder->GetDBFolderInfoAndDB(getter_AddRefs(dbFolderInfo),
                                      getter_AddRefs(virtDatabase));
    NS_ENSURE_SUCCESS(rv, rv);
    nsCString srchFolderUri;
    dbFolderInfo->GetCharProperty(kSearchFolderUriProp, srchFolderUri);
    AddVFListenersForVF(folder, srchFolderUri);
    rv = SaveVirtualFolders();
  }
  return rv;
}

NS_IMETHODIMP nsMsgAccountManager::OnMessageAdded(nsIMsgFolder* parent,
                                                  nsIMsgDBHdr* msg) {
  return NS_OK;
}

NS_IMETHODIMP nsMsgAccountManager::OnFolderRemoved(nsIMsgFolder* parentFolder,
                                                   nsIMsgFolder* folder) {
  nsresult rv = NS_OK;
  uint32_t folderFlags;
  folder->GetFlags(&folderFlags);
  // if we removed a VF, flush VF list to disk.
  if (folderFlags & nsMsgFolderFlags::Virtual) {
    RemoveVFListenerForVF(folder, nullptr);
    m_virtualFolders.RemoveElement(folder);
    rv = SaveVirtualFolders();
    // clear flags on deleted folder if it's a virtual folder, so that creating
    // a new folder with the same name doesn't cause confusion.
    folder->SetFlags(0);
    return rv;
  }
  // need to update the saved searches to check for a few things:
  // 1. Folder removed was in the scope of a saved search - if so, remove the
  //    uri from the scope of the saved search.
  // 2. If the scope is now empty, remove the saved search.

  // build a "normalized" uri that we can do a find on.
  nsCString removedFolderURI;
  folder->GetURI(removedFolderURI);
  removedFolderURI.Insert('|', 0);
  removedFolderURI.Append('|');

  // Enumerate the saved searches.
  nsTObserverArray<RefPtr<VirtualFolderChangeListener>>::ForwardIterator iter(
      m_virtualFolderListeners);
  RefPtr<VirtualFolderChangeListener> listener;

  while (iter.HasMore()) {
    listener = iter.GetNext();
    nsCOMPtr<nsIMsgDatabase> db;
    nsCOMPtr<nsIDBFolderInfo> dbFolderInfo;
    nsCOMPtr<nsIMsgFolder> savedSearch = listener->m_virtualFolder;
    savedSearch->GetDBFolderInfoAndDB(getter_AddRefs(dbFolderInfo),
                                      getter_AddRefs(db));
    if (dbFolderInfo) {
      nsCString searchURI;
      dbFolderInfo->GetCharProperty(kSearchFolderUriProp, searchURI);
      // "normalize" searchURI so we can search for |folderURI|.
      searchURI.Insert('|', 0);
      searchURI.Append('|');
      int32_t index = searchURI.Find(removedFolderURI);
      if (index != kNotFound) {
        RemoveVFListenerForVF(savedSearch, folder);

        // remove |folderURI
        searchURI.Cut(index, removedFolderURI.Length() - 1);
        // remove last '|' we added
        searchURI.SetLength(searchURI.Length() - 1);

        uint32_t vfFolderFlag;
        dbFolderInfo->GetUint32Property("searchFolderFlag", 0, &vfFolderFlag);

        // If saved search is empty now, delete it. But not if it's a smart
        // folder.
        if (searchURI.IsEmpty() && !vfFolderFlag) {
          db = nullptr;
          dbFolderInfo = nullptr;

          nsCOMPtr<nsIMsgFolder> parent;
          rv = savedSearch->GetParent(getter_AddRefs(parent));
          NS_ENSURE_SUCCESS(rv, rv);

          if (!parent) continue;
          parent->PropagateDelete(savedSearch, true);
        } else {
          if (!searchURI.IsEmpty()) {
            // Remove leading '|' we added (or one after |folderURI, if first
            // URI).
            searchURI.Cut(0, 1);
          }
          dbFolderInfo->SetCharProperty(kSearchFolderUriProp, searchURI);
          nsCOMPtr<nsIObserverService> obs =
              mozilla::services::GetObserverService();
          obs->NotifyObservers(savedSearch, "search-folders-changed", nullptr);
        }
      }
    }
  }

  return rv;
}

NS_IMETHODIMP nsMsgAccountManager::OnMessageRemoved(nsIMsgFolder* parent,
                                                    nsIMsgDBHdr* msg) {
  return NS_OK;
}

NS_IMETHODIMP nsMsgAccountManager::OnFolderPropertyChanged(
    nsIMsgFolder* folder, const nsACString& property,
    const nsACString& oldValue, const nsACString& newValue) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP
nsMsgAccountManager::OnFolderIntPropertyChanged(nsIMsgFolder* aFolder,
                                                const nsACString& aProperty,
                                                int64_t oldValue,
                                                int64_t newValue) {
  if (aProperty.Equals(kFolderFlag)) {
    if (newValue & nsMsgFolderFlags::Virtual) {
      // This is a virtual folder, let's get out of here.
      return NS_OK;
    }
    uint32_t smartFlagsChanged =
        (oldValue ^ newValue) &
        (nsMsgFolderFlags::SpecialUse & ~nsMsgFolderFlags::Queue);
    if (smartFlagsChanged) {
      if (smartFlagsChanged & newValue) {
        // if the smart folder flag was set, calling OnFolderAdded will
        // do the right thing.
        nsCOMPtr<nsIMsgFolder> parent;
        aFolder->GetParent(getter_AddRefs(parent));
        nsresult rv = OnFolderAdded(parent, aFolder);
        NS_ENSURE_SUCCESS(rv, rv);

        // This folder has one of the smart folder flags.
        // Remove it from any other smart folders it might've been included in
        // because of the flags of its ancestors.
        RemoveFolderFromSmartFolder(
            aFolder, (nsMsgFolderFlags::SpecialUse & ~nsMsgFolderFlags::Queue) &
                         ~newValue);
        return NS_OK;
      }
      RemoveFolderFromSmartFolder(aFolder, smartFlagsChanged);

      nsTArray<RefPtr<nsIMsgFolder>> allDescendants;
      nsresult rv = aFolder->GetDescendants(allDescendants);
      NS_ENSURE_SUCCESS(rv, rv);
      for (auto subFolder : allDescendants) {
        RemoveFolderFromSmartFolder(subFolder, smartFlagsChanged);
      }
    }
  }
  return NS_OK;
}

nsresult nsMsgAccountManager::RemoveFolderFromSmartFolder(
    nsIMsgFolder* aFolder, uint32_t flagsChanged) {
  nsCString removedFolderURI;
  aFolder->GetURI(removedFolderURI);
  removedFolderURI.Insert('|', 0);
  removedFolderURI.Append('|');
  uint32_t flags;
  aFolder->GetFlags(&flags);
  NS_ASSERTION(!(flags & flagsChanged), "smart folder flag should not be set");
  // Flag was removed. Look for smart folder based on that flag,
  // and remove this folder from its scope.
  for (nsCOMPtr<nsIMsgFolder> virtualFolder : m_virtualFolders) {
    nsCOMPtr<nsIMsgDatabase> db;
    nsCOMPtr<nsIDBFolderInfo> dbFolderInfo;
    virtualFolder->GetDBFolderInfoAndDB(getter_AddRefs(dbFolderInfo),
                                        getter_AddRefs(db));
    if (dbFolderInfo) {
      uint32_t vfFolderFlag;
      dbFolderInfo->GetUint32Property("searchFolderFlag", 0, &vfFolderFlag);
      // found a smart folder over the removed flag
      if (vfFolderFlag & flagsChanged) {
        nsCString searchURI;
        dbFolderInfo->GetCharProperty(kSearchFolderUriProp, searchURI);
        // "normalize" searchURI so we can search for |folderURI|.
        searchURI.Insert('|', 0);
        searchURI.Append('|');
        int32_t index = searchURI.Find(removedFolderURI);
        if (index != kNotFound) {
          RemoveVFListenerForVF(virtualFolder, aFolder);

          // remove |folderURI
          searchURI.Cut(index, removedFolderURI.Length() - 1);
          // remove last '|' we added
          searchURI.SetLength(searchURI.Length() - 1);

          // remove leading '|' we added (or one after |folderURI, if first URI)
          searchURI.Cut(0, 1);
          dbFolderInfo->SetCharProperty(kSearchFolderUriProp, searchURI);
          nsCOMPtr<nsIObserverService> obs =
              mozilla::services::GetObserverService();
          obs->NotifyObservers(virtualFolder, "search-folders-changed",
                               nullptr);
        }
      }
    }
  }
  return NS_OK;
}

NS_IMETHODIMP nsMsgAccountManager::OnFolderBoolPropertyChanged(
    nsIMsgFolder* folder, const nsACString& property, bool oldValue,
    bool newValue) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP nsMsgAccountManager::OnFolderUnicharPropertyChanged(
    nsIMsgFolder* folder, const nsACString& property, const nsAString& oldValue,
    const nsAString& newValue) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP nsMsgAccountManager::OnFolderPropertyFlagChanged(
    nsIMsgDBHdr* msg, const nsACString& property, uint32_t oldFlag,
    uint32_t newFlag) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP nsMsgAccountManager::OnFolderEvent(nsIMsgFolder* aFolder,
                                                 const nsACString& aEvent) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP
nsMsgAccountManager::GetSortOrder(nsIMsgIncomingServer* aServer,
                                  int32_t* aSortOrder) {
  NS_ENSURE_ARG_POINTER(aServer);
  NS_ENSURE_ARG_POINTER(aSortOrder);

  // If the passed in server is the default, return its sort order as 0
  // regardless of its server sort order.

  nsCOMPtr<nsIMsgAccount> defaultAccount;
  nsresult rv = GetDefaultAccount(getter_AddRefs(defaultAccount));
  if (NS_SUCCEEDED(rv) && defaultAccount) {
    nsCOMPtr<nsIMsgIncomingServer> defaultServer;
    rv = m_defaultAccount->GetIncomingServer(getter_AddRefs(defaultServer));
    if (NS_SUCCEEDED(rv) && (aServer == defaultServer)) {
      *aSortOrder = 0;
      return NS_OK;
    }
    // It is OK if there is no default account.
  }

  // This function returns the sort order by querying the server object for its
  // sort order value and then incrementing it by the position of the server in
  // the accounts list. This ensures that even when several accounts have the
  // same sort order value, the returned value is not the same and keeps
  // their relative order in the account list when and unstable sort is run
  // on the returned sort order values.
  int32_t sortOrder;
  int32_t serverIndex;

  rv = aServer->GetSortOrder(&sortOrder);
  if (NS_SUCCEEDED(rv)) rv = FindServerIndex(aServer, &serverIndex);

  if (NS_FAILED(rv)) {
    *aSortOrder = 999999999;
  } else {
    *aSortOrder = sortOrder + serverIndex;
  }

  return NS_OK;
}

NS_IMETHODIMP
nsMsgAccountManager::ReorderAccounts(const nsTArray<nsCString>& newAccounts) {
  nsTArray<nsCString> allNewAccounts = newAccounts.Clone();

  // Add all hidden accounts to the list of new accounts.
  nsresult rv;
  for (auto account : m_accounts) {
    nsCString key;
    account->GetKey(key);
    nsCOMPtr<nsIMsgIncomingServer> server;
    rv = account->GetIncomingServer(getter_AddRefs(server));
    if (NS_SUCCEEDED(rv) && server) {
      bool hidden = false;
      rv = server->GetHidden(&hidden);
      if (NS_SUCCEEDED(rv) && hidden && !allNewAccounts.Contains(key)) {
        allNewAccounts.AppendElement(key);
      }
    }
  }

  // Check that the new account list contains all the existing accounts,
  // just in a different order.
  if (allNewAccounts.Length() != m_accounts.Length())
    return NS_ERROR_INVALID_ARG;

  for (uint32_t i = 0; i < m_accounts.Length(); i++) {
    nsCString accountKey;
    m_accounts[i]->GetKey(accountKey);
    if (!allNewAccounts.Contains(accountKey)) return NS_ERROR_INVALID_ARG;
  }

  // In-place swap the elements in m_accounts to the order defined in
  // newAccounts.
  for (uint32_t i = 0; i < allNewAccounts.Length(); i++) {
    nsCString newKey = allNewAccounts[i];
    for (uint32_t j = i; j < m_accounts.Length(); j++) {
      nsCString oldKey;
      m_accounts[j]->GetKey(oldKey);
      if (newKey.Equals(oldKey)) {
        if (i != j) std::swap(m_accounts[i], m_accounts[j]);
        break;
      }
    }
  }

  return OutputAccountsPref();
}
