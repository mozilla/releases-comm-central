/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsImapIncomingServer.h"

#include "msgCore.h"
#include "netCore.h"
#include "../public/nsIImapHostSessionList.h"
#include "nsIMsgAccountManager.h"
#include "nsIMsgIdentity.h"
#include "nsIImapUrl.h"
#include "nsIUrlListener.h"
#include "nsThreadUtils.h"
#include "nsImapProtocol.h"
#include "nsCOMPtr.h"
#include "nsMsgFolderFlags.h"
#include "prmem.h"
#include "plstr.h"
#include "nsIMsgFolder.h"
#include "nsIMsgWindow.h"
#include "nsImapMailFolder.h"
#include "nsIMsgMailNewsUrl.h"
#include "nsIImapService.h"
#include "nsMsgI18N.h"
#include "nsIImapMockChannel.h"
// for the memory cache...
#include "nsICacheEntry.h"
#include "nsImapUrl.h"
#include "nsIMsgMailSession.h"
#include "nsImapNamespace.h"
#include "nsMsgUtils.h"
#include "nsServiceManagerUtils.h"
#include "nsComponentManagerUtils.h"
#include "mozilla/Components.h"
#include "nsNetUtil.h"
#include "nsIPrompt.h"
#include "nsEmbedCID.h"
#include "nsIPromptService.h"
#include "mozilla/Utf8.h"
#include "mozilla/LoadInfo.h"
#include "nsNSSComponent.h"

using namespace mozilla;
using mozilla::net::LoadInfo;

// Despite its name, this contains a folder path, for example INBOX/Trash.
#define PREF_TRASH_FOLDER_PATH "trash_folder_name"
#define DEFAULT_TRASH_FOLDER_PATH "Trash"  // XXX Is this a useful default?

NS_IMPL_ADDREF_INHERITED(nsImapIncomingServer, nsMsgIncomingServer)
NS_IMPL_RELEASE_INHERITED(nsImapIncomingServer, nsMsgIncomingServer)

NS_INTERFACE_MAP_BEGIN(nsImapIncomingServer)
  NS_INTERFACE_MAP_ENTRY(nsIImapServerSink)
  NS_INTERFACE_MAP_ENTRY(nsIImapIncomingServer)
  NS_INTERFACE_MAP_ENTRY(nsISubscribableServer)
  NS_INTERFACE_MAP_ENTRY(nsIUrlListener)
NS_INTERFACE_MAP_END_INHERITING(nsMsgIncomingServer)

LazyLogModule IMAP_DC("IMAP_DC");  // For imap folder discovery

nsImapIncomingServer::nsImapIncomingServer()
    : mLock("nsImapIncomingServer.mLock"),
      mLogonMonitor("nsImapIncomingServer.mLogonMonitor") {
  m_capability = kCapabilityUndefined;
  mDoingSubscribeDialog = false;
  mDoingLsub = false;
  m_canHaveFilters = true;
  m_userAuthenticated = false;
  m_shuttingDown = false;
  mUtf8AcceptEnabled = false;
}

nsImapIncomingServer::~nsImapIncomingServer() {
  mozilla::DebugOnly<nsresult> rv = ClearInner();
  NS_ASSERTION(NS_SUCCEEDED(rv), "ClearInner failed");
  CloseCachedConnections();
}

NS_IMETHODIMP nsImapIncomingServer::SetKey(
    const nsACString& aKey)  // override nsMsgIncomingServer's implementation...
{
  nsMsgIncomingServer::SetKey(aKey);

  // okay now that the key has been set, we need to add ourselves to the
  // host session list...

  // every time we create an imap incoming server, we need to add it to the
  // host session list!!

  nsresult rv;
  nsCOMPtr<nsIImapHostSessionList> hostSession =
      do_GetService("@mozilla.org/messenger/imaphostsessionlist;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCString key(aKey);
  hostSession->AddHostToList(key.get(), this);
  nsMsgImapDeleteModel deleteModel =
      nsMsgImapDeleteModels::MoveToTrash;  // default to trash
  GetDeleteModel(&deleteModel);
  hostSession->SetDeleteIsMoveToTrashForHost(
      key.get(), deleteModel == nsMsgImapDeleteModels::MoveToTrash);
  hostSession->SetShowDeletedMessagesForHost(
      key.get(), deleteModel == nsMsgImapDeleteModels::IMAPDelete);

  nsAutoCString onlineDir;
  rv = GetServerDirectory(onlineDir);
  NS_ENSURE_SUCCESS(rv, rv);
  if (!onlineDir.IsEmpty())
    hostSession->SetOnlineDirForHost(key.get(), onlineDir.get());

  nsCString personalNamespace;
  nsCString publicNamespace;
  nsCString otherUsersNamespace;

  rv = GetPersonalNamespace(personalNamespace);
  NS_ENSURE_SUCCESS(rv, rv);
  rv = GetPublicNamespace(publicNamespace);
  NS_ENSURE_SUCCESS(rv, rv);
  rv = GetOtherUsersNamespace(otherUsersNamespace);
  NS_ENSURE_SUCCESS(rv, rv);

  if (personalNamespace.IsEmpty() && publicNamespace.IsEmpty() &&
      otherUsersNamespace.IsEmpty())
    personalNamespace.AssignLiteral("\"\"");

  hostSession->SetNamespaceFromPrefForHost(key.get(), personalNamespace.get(),
                                           kPersonalNamespace);

  if (!publicNamespace.IsEmpty())
    hostSession->SetNamespaceFromPrefForHost(key.get(), publicNamespace.get(),
                                             kPublicNamespace);

  if (!otherUsersNamespace.IsEmpty())
    hostSession->SetNamespaceFromPrefForHost(
        key.get(), otherUsersNamespace.get(), kOtherUsersNamespace);
  return rv;
}

// construct the pretty name to show to the user if they haven't
// specified one. This should be overridden for news and mail.
NS_IMETHODIMP
nsImapIncomingServer::GetConstructedPrettyName(nsACString& retval) {
  nsAutoCString username;
  nsAutoCString hostName;
  nsresult rv;

  nsCOMPtr<nsIMsgAccountManager> accountManager =
      mozilla::components::AccountManager::Service();
  nsCOMPtr<nsIMsgIdentity> identity;
  rv =
      accountManager->GetFirstIdentityForServer(this, getter_AddRefs(identity));
  NS_ENSURE_SUCCESS(rv, rv);

  nsAutoString emailAddress;

  if (NS_SUCCEEDED(rv) && identity) {
    nsCString identityEmailAddress;
    identity->GetEmail(identityEmailAddress);
    CopyASCIItoUTF16(identityEmailAddress, emailAddress);
  } else {
    rv = GetUsername(username);
    NS_ENSURE_SUCCESS(rv, rv);
    rv = GetHostName(hostName);
    NS_ENSURE_SUCCESS(rv, rv);
    if (!username.IsEmpty() && !hostName.IsEmpty()) {
      CopyASCIItoUTF16(username, emailAddress);
      emailAddress.Append('@');
      emailAddress.Append(NS_ConvertASCIItoUTF16(hostName));
    }
  }

  nsAutoString prettyName;
  rv = GetFormattedStringFromName(emailAddress, "imapDefaultAccountName",
                                  prettyName);
  NS_ENSURE_SUCCESS(rv, rv);
  retval.Assign(NS_ConvertUTF16toUTF8(prettyName));
  return NS_OK;
}

NS_IMETHODIMP nsImapIncomingServer::GetLocalStoreType(nsACString& type) {
  type.AssignLiteral("imap");
  return NS_OK;
}

NS_IMETHODIMP nsImapIncomingServer::GetLocalDatabaseType(nsACString& type) {
  type.AssignLiteral("imap");
  return NS_OK;
}

NS_IMETHODIMP
nsImapIncomingServer::GetServerDirectory(nsACString& serverDirectory) {
  return GetStringValue("server_sub_directory", serverDirectory);
}

NS_IMETHODIMP
nsImapIncomingServer::SetServerDirectory(const nsACString& serverDirectory) {
  nsCString serverKey;
  nsresult rv = GetKey(serverKey);
  if (NS_SUCCEEDED(rv)) {
    nsCOMPtr<nsIImapHostSessionList> hostSession =
        do_GetService("@mozilla.org/messenger/imaphostsessionlist;1", &rv);
    if (NS_SUCCEEDED(rv))
      hostSession->SetOnlineDirForHost(
          serverKey.get(), PromiseFlatCString(serverDirectory).get());
  }
  return SetStringValue("server_sub_directory", serverDirectory);
}

NS_IMETHODIMP
nsImapIncomingServer::GetOverrideNamespaces(bool* bVal) {
  return GetBoolValue("override_namespaces", bVal);
}

NS_IMETHODIMP
nsImapIncomingServer::SetOverrideNamespaces(bool bVal) {
  nsCString serverKey;
  GetKey(serverKey);
  if (!serverKey.IsEmpty()) {
    nsresult rv;
    nsCOMPtr<nsIImapHostSessionList> hostSession =
        do_GetService("@mozilla.org/messenger/imaphostsessionlist;1", &rv);
    if (NS_SUCCEEDED(rv))
      hostSession->SetNamespacesOverridableForHost(serverKey.get(), bVal);
  }
  return SetBoolValue("override_namespaces", bVal);
}

NS_IMETHODIMP
nsImapIncomingServer::GetUsingSubscription(bool* bVal) {
  return GetBoolValue("using_subscription", bVal);
}

NS_IMETHODIMP
nsImapIncomingServer::SetUsingSubscription(bool bVal) {
  nsCString serverKey;
  GetKey(serverKey);
  if (!serverKey.IsEmpty()) {
    nsresult rv;
    nsCOMPtr<nsIImapHostSessionList> hostSession =
        do_GetService("@mozilla.org/messenger/imaphostsessionlist;1", &rv);
    if (NS_SUCCEEDED(rv))
      hostSession->SetHostIsUsingSubscription(serverKey.get(), bVal);
  }
  return SetBoolValue("using_subscription", bVal);
}

NS_IMETHODIMP
nsImapIncomingServer::GetMaximumConnectionsNumber(int32_t* aMaxConnections) {
  NS_ENSURE_ARG_POINTER(aMaxConnections);

  nsresult rv = GetIntValue("max_cached_connections", aMaxConnections);
  // Get our maximum connection count. We need at least 1. If the value is 0,
  // we use the default of 5. If it's negative, we treat that as 1.
  if (NS_SUCCEEDED(rv) && *aMaxConnections > 0) return NS_OK;

  *aMaxConnections = (NS_FAILED(rv) || (*aMaxConnections == 0)) ? 5 : 1;
  (void)SetMaximumConnectionsNumber(*aMaxConnections);

  return NS_OK;
}

NS_IMETHODIMP
nsImapIncomingServer::SetMaximumConnectionsNumber(int32_t aMaxConnections) {
  return SetIntValue("max_cached_connections", aMaxConnections);
}

NS_IMPL_SERVERPREF_BOOL(nsImapIncomingServer, ForceSelect, "force_select_imap")

NS_IMPL_SERVERPREF_BOOL(nsImapIncomingServer, DualUseFolders,
                        "dual_use_folders")

NS_IMPL_SERVERPREF_STR(nsImapIncomingServer, AdminUrl, "admin_url")

NS_IMPL_SERVERPREF_BOOL(nsImapIncomingServer, CleanupInboxOnExit,
                        "cleanup_inbox_on_exit")

NS_IMPL_SERVERPREF_BOOL(nsImapIncomingServer, OfflineDownload,
                        "offline_download")

NS_IMPL_SERVERPREF_BOOL(nsImapIncomingServer, DownloadBodiesOnGetNewMail,
                        "download_bodies_on_get_new_mail")

NS_IMPL_SERVERPREF_BOOL(nsImapIncomingServer, AutoSyncOfflineStores,
                        "autosync_offline_stores")

NS_IMPL_SERVERPREF_BOOL(nsImapIncomingServer, UseIdle, "use_idle")

NS_IMPL_SERVERPREF_BOOL(nsImapIncomingServer, CheckAllFoldersForNew,
                        "check_all_folders_for_new")

NS_IMPL_SERVERPREF_BOOL(nsImapIncomingServer, UseCondStore, "use_condstore")

NS_IMPL_SERVERPREF_BOOL(nsImapIncomingServer, IsGMailServer, "is_gmail")

NS_IMPL_SERVERPREF_BOOL(nsImapIncomingServer, UseCompressDeflate,
                        "use_compress_deflate")

NS_IMPL_SERVERPREF_INT(nsImapIncomingServer, AutoSyncMaxAgeDays,
                       "autosync_max_age_days")

NS_IMPL_SERVERPREF_BOOL(nsImapIncomingServer, AllowUTF8Accept,
                        "allow_utf8_accept")

NS_IMETHODIMP
nsImapIncomingServer::GetShuttingDown(bool* retval) {
  NS_ENSURE_ARG_POINTER(retval);
  *retval = m_shuttingDown;
  return NS_OK;
}

NS_IMETHODIMP
nsImapIncomingServer::SetShuttingDown(bool val) {
  m_shuttingDown = val;
  return NS_OK;
}

NS_IMETHODIMP
nsImapIncomingServer::GetDeleteModel(int32_t* retval) {
  NS_ENSURE_ARG(retval);
  return GetIntValue("delete_model", retval);
}

NS_IMETHODIMP
nsImapIncomingServer::SetDeleteModel(int32_t ivalue) {
  nsresult rv = SetIntValue("delete_model", ivalue);
  if (NS_SUCCEEDED(rv)) {
    nsCOMPtr<nsIImapHostSessionList> hostSession =
        do_GetService("@mozilla.org/messenger/imaphostsessionlist;1", &rv);
    NS_ENSURE_SUCCESS(rv, rv);
    hostSession->SetDeleteIsMoveToTrashForHost(
        m_serverKey.get(), ivalue == nsMsgImapDeleteModels::MoveToTrash);
    hostSession->SetShowDeletedMessagesForHost(
        m_serverKey.get(), ivalue == nsMsgImapDeleteModels::IMAPDelete);

    // Despite its name, this returns the trash folder path, for example
    // INBOX/Trash.
    nsAutoCString trashFolderName;
    nsresult rv = GetTrashFolderName(trashFolderName);
    if (NS_SUCCEEDED(rv)) {
      nsAutoCString trashFolderNameUtf7or8;
      bool useUTF8 = false;
      GetUtf8AcceptEnabled(&useUTF8);
      if (useUTF8) {
        trashFolderNameUtf7or8 = trashFolderName;
      } else {
        CopyUTF16toMUTF7(NS_ConvertUTF8toUTF16(trashFolderName),
                         trashFolderNameUtf7or8);
      }
      nsCOMPtr<nsIMsgFolder> trashFolder;
      // 'trashFolderName' being a path here works well since this is appended
      // to the server's root folder in GetFolder().
      rv = GetFolder(trashFolderNameUtf7or8, getter_AddRefs(trashFolder));
      NS_ENSURE_SUCCESS(rv, rv);
      nsCString trashURI;
      trashFolder->GetURI(trashURI);
      nsCOMPtr<nsIMsgFolder> trashMsgFolder;
      rv = GetMsgFolderFromURI(trashFolder, trashURI,
                               getter_AddRefs(trashMsgFolder));
      if (NS_SUCCEEDED(rv) && trashMsgFolder) {
        // If the trash folder is used, set the flag, otherwise clear it.
        if (ivalue == nsMsgImapDeleteModels::MoveToTrash) {
          trashMsgFolder->SetFlag(nsMsgFolderFlags::Trash);
        } else {
          trashMsgFolder->ClearFlag(nsMsgFolderFlags::Trash);
        }
      }
    }
  }
  return rv;
}

NS_IMPL_SERVERPREF_INT(nsImapIncomingServer, TimeOutLimits, "timeout")

NS_IMPL_SERVERPREF_STR(nsImapIncomingServer, ServerIDPref, "serverIDResponse")

NS_IMPL_SERVERPREF_STR(nsImapIncomingServer, PersonalNamespace,
                       "namespace.personal")

NS_IMPL_SERVERPREF_STR(nsImapIncomingServer, PublicNamespace,
                       "namespace.public")

NS_IMPL_SERVERPREF_STR(nsImapIncomingServer, OtherUsersNamespace,
                       "namespace.other_users")

NS_IMPL_SERVERPREF_BOOL(nsImapIncomingServer, FetchByChunks, "fetch_by_chunks")

NS_IMPL_SERVERPREF_BOOL(nsImapIncomingServer, SendID, "send_client_info")

NS_IMETHODIMP
nsImapIncomingServer::GetImapConnectionAndLoadUrl(nsIImapUrl* aImapUrl,
                                                  nsISupports* aConsumer) {
  nsCOMPtr<nsIImapProtocol> aProtocol;

  nsresult rv = GetImapConnection(aImapUrl, getter_AddRefs(aProtocol));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgMailNewsUrl> mailnewsurl = do_QueryInterface(aImapUrl, &rv);
  if (aProtocol) {
    rv = aProtocol->LoadImapUrl(mailnewsurl, aConsumer);
    // *** jt - in case of the time out situation or the connection gets
    // terminated by some unforeseen problems let's give it a second chance
    // to run the url
    if (NS_FAILED(rv) && rv != NS_ERROR_ILLEGAL_VALUE) {
      rv = aProtocol->LoadImapUrl(mailnewsurl, aConsumer);
    }
  } else {  // unable to get an imap connection to run the url; add to the url
            // queue
    nsImapProtocol::LogImapUrl("queuing url", aImapUrl);
    PR_CEnterMonitor(this);
    m_urlQueue.AppendObject(aImapUrl);
    m_urlConsumers.AppendElement(aConsumer);
    NS_IF_ADDREF(aConsumer);
    PR_CExitMonitor(this);
    // let's try running it now - maybe the connection is free now.
    bool urlRun;
    rv = LoadNextQueuedUrl(nullptr, &urlRun);
  }
  return rv;
}

NS_IMETHODIMP
nsImapIncomingServer::PrepareToRetryUrl(nsIImapUrl* aImapUrl,
                                        nsIImapMockChannel** aChannel) {
  NS_ENSURE_ARG_POINTER(aChannel);
  NS_ENSURE_ARG_POINTER(aImapUrl);
  // maybe there's more we could do here, but this is all we need now.
  return aImapUrl->GetMockChannel(aChannel);
}

NS_IMETHODIMP
nsImapIncomingServer::SuspendUrl(nsIImapUrl* aImapUrl) {
  NS_ENSURE_ARG_POINTER(aImapUrl);
  nsImapProtocol::LogImapUrl("suspending url", aImapUrl);
  PR_CEnterMonitor(this);
  m_urlQueue.AppendObject(aImapUrl);
  m_urlConsumers.AppendElement(nullptr);
  PR_CExitMonitor(this);
  return NS_OK;
}

NS_IMETHODIMP
nsImapIncomingServer::RetryUrl(nsIImapUrl* aImapUrl,
                               nsIImapMockChannel* aChannel) {
  nsresult rv;
  // Get current thread event queue
  aImapUrl->SetMockChannel(aChannel);
  nsCOMPtr<nsIImapProtocol> protocolInstance;
  nsImapProtocol::LogImapUrl("creating protocol instance to retry queued url",
                             aImapUrl);
  nsCOMPtr<nsIThread> thread(do_GetCurrentThread());
  rv = GetImapConnection(aImapUrl, getter_AddRefs(protocolInstance));
  if (NS_SUCCEEDED(rv) && protocolInstance) {
    nsCOMPtr<nsIURI> url = do_QueryInterface(aImapUrl, &rv);
    if (NS_SUCCEEDED(rv) && url) {
      nsImapProtocol::LogImapUrl("retrying  url", aImapUrl);
      rv = protocolInstance->LoadImapUrl(
          url, nullptr);  // ### need to save the display consumer.
    }
  }
  return rv;
}

// checks to see if there are any queued urls on this incoming server,
// and if so, tries to run the oldest one. Returns true if the url is run
// on the passed in protocol connection.
NS_IMETHODIMP
nsImapIncomingServer::LoadNextQueuedUrl(nsIImapProtocol* aProtocol,
                                        bool* aResult) {
  if (m_hasShutDown) return NS_ERROR_FAILURE;
  if (WeAreOffline()) return NS_MSG_ERROR_OFFLINE;

  nsresult rv = NS_OK;
  bool urlRun = false;
  bool keepGoing = true;
  nsCOMPtr<nsIImapProtocol> protocolInstance;

  MutexAutoLock mon(mLock);
  int32_t cnt = m_urlQueue.Count();

  while (cnt > 0 && !urlRun && keepGoing) {
    nsCOMPtr<nsIImapUrl> aImapUrl(m_urlQueue[0]);

    bool removeUrlFromQueue = false;
    if (aImapUrl) {
      nsImapProtocol::LogImapUrl("considering playing queued url", aImapUrl);
      rv = DoomUrlIfChannelHasError(aImapUrl, &removeUrlFromQueue);
      NS_ENSURE_SUCCESS(rv, rv);
      // if we didn't doom the url, lets run it.
      if (!removeUrlFromQueue) {
        nsISupports* aConsumer = m_urlConsumers.ElementAt(0);
        NS_IF_ADDREF(aConsumer);

        nsImapProtocol::LogImapUrl(
            "creating protocol instance to play queued url", aImapUrl);
        rv = GetImapConnection(aImapUrl, getter_AddRefs(protocolInstance));
        if (NS_SUCCEEDED(rv) && protocolInstance) {
          nsCOMPtr<nsIURI> url = do_QueryInterface(aImapUrl, &rv);
          if (NS_SUCCEEDED(rv) && url) {
            nsImapProtocol::LogImapUrl("playing queued url", aImapUrl);
            rv = protocolInstance->LoadImapUrl(url, aConsumer);
            if (NS_SUCCEEDED(rv)) {
              bool isInbox;
              protocolInstance->IsBusy(&urlRun, &isInbox);
              if (!urlRun)
                nsImapProtocol::LogImapUrl("didn't need to run", aImapUrl);
              removeUrlFromQueue = true;
            } else {
              nsImapProtocol::LogImapUrl("playing queued url failed", aImapUrl);
            }
          }
        } else {
          nsImapProtocol::LogImapUrl(
              "failed creating protocol instance to play queued url", aImapUrl);
          keepGoing = false;
        }
        NS_IF_RELEASE(aConsumer);
      }
      if (removeUrlFromQueue) {
        m_urlQueue.RemoveObjectAt(0);
        m_urlConsumers.RemoveElementAt(0);
      }
    }
    cnt = m_urlQueue.Count();
  }
  if (aResult) *aResult = urlRun && aProtocol && aProtocol == protocolInstance;

  return rv;
}

NS_IMETHODIMP
nsImapIncomingServer::AbortQueuedUrls() {
  nsresult rv = NS_OK;

  MutexAutoLock mon(mLock);
  int32_t cnt = m_urlQueue.Count();

  while (cnt > 0) {
    nsCOMPtr<nsIImapUrl> aImapUrl(m_urlQueue[cnt - 1]);
    bool removeUrlFromQueue = false;

    if (aImapUrl) {
      rv = DoomUrlIfChannelHasError(aImapUrl, &removeUrlFromQueue);
      NS_ENSURE_SUCCESS(rv, rv);
      if (removeUrlFromQueue) {
        m_urlQueue.RemoveObjectAt(cnt - 1);
        m_urlConsumers.RemoveElementAt(cnt - 1);
      }
    }
    cnt--;
  }

  return rv;
}

// if this url has a channel with an error, doom it and its mem cache entries,
// and notify url listeners.
nsresult nsImapIncomingServer::DoomUrlIfChannelHasError(nsIImapUrl* aImapUrl,
                                                        bool* urlDoomed) {
  nsresult rv = NS_OK;

  nsCOMPtr<nsIMsgMailNewsUrl> aMailNewsUrl(do_QueryInterface(aImapUrl, &rv));

  if (aMailNewsUrl && aImapUrl) {
    nsCOMPtr<nsIImapMockChannel> mockChannel;

    if (NS_SUCCEEDED(aImapUrl->GetMockChannel(getter_AddRefs(mockChannel))) &&
        mockChannel) {
      nsresult requestStatus;
      mockChannel->GetStatus(&requestStatus);
      if (NS_FAILED(requestStatus)) {
        nsresult res;
        *urlDoomed = true;
        nsImapProtocol::LogImapUrl("dooming url", aImapUrl);

        mockChannel
            ->Close();  // try closing it to get channel listener nulled out.

        if (aMailNewsUrl) {
          nsCOMPtr<nsICacheEntry> cacheEntry;
          res = aMailNewsUrl->GetMemCacheEntry(getter_AddRefs(cacheEntry));
          if (NS_SUCCEEDED(res) && cacheEntry) cacheEntry->AsyncDoom(nullptr);
          // we're aborting this url - tell listeners
          aMailNewsUrl->SetUrlState(false, NS_MSG_ERROR_URL_ABORTED);
        }
      }
    }
  }
  return rv;
}

NS_IMETHODIMP
nsImapIncomingServer::RemoveConnection(nsIImapProtocol* aImapConnection) {
  PR_CEnterMonitor(this);
  if (aImapConnection) m_connectionCache.RemoveObject(aImapConnection);

  PR_CExitMonitor(this);
  return NS_OK;
}

bool nsImapIncomingServer::ConnectionTimeOut(nsIImapProtocol* aConnection) {
  bool retVal = false;
  if (!aConnection) return retVal;
  nsresult rv;

  int32_t timeoutInMinutes = 0;
  rv = GetTimeOutLimits(&timeoutInMinutes);
  if (NS_FAILED(rv) || timeoutInMinutes <= 0 || timeoutInMinutes > 29) {
    timeoutInMinutes = 29;
    SetTimeOutLimits(timeoutInMinutes);
  }

  PRTime cacheTimeoutLimits = timeoutInMinutes * 60 * PR_USEC_PER_SEC;
  PRTime lastActiveTimeStamp;
  rv = aConnection->GetLastActiveTimeStamp(&lastActiveTimeStamp);

  if (PR_Now() - lastActiveTimeStamp >= cacheTimeoutLimits) {
    RemoveConnection(aConnection);
    aConnection->TellThreadToDie(false);
    retVal = true;
  }
  return retVal;
}

nsresult nsImapIncomingServer::GetImapConnection(
    nsIImapUrl* aImapUrl, nsIImapProtocol** aImapConnection) {
  NS_ENSURE_ARG_POINTER(aImapUrl);

  nsresult rv = NS_OK;
  bool canRunUrlImmediately = false;
  bool canRunButBusy = false;
  nsCOMPtr<nsIImapProtocol> connection;
  nsCOMPtr<nsIImapProtocol> freeConnection;
  bool isBusy = false;
  bool isInboxConnection = false;

  PR_CEnterMonitor(this);

  int32_t maxConnections;
  (void)GetMaximumConnectionsNumber(&maxConnections);

  int32_t cnt = m_connectionCache.Count();
  *aImapConnection = nullptr;

  // iterate through the connection cache for a connection that can handle this
  // url.
  // loop until we find a connection that can run the url, or doesn't have to
  // wait?
  for (int32_t i = cnt - 1; i >= 0 && !canRunUrlImmediately && !canRunButBusy;
       i--) {
    connection = m_connectionCache[i];
    if (connection) {
      bool badConnection = ConnectionTimeOut(connection);
      if (!badConnection) {
        badConnection = NS_FAILED(connection->CanHandleUrl(
            aImapUrl, &canRunUrlImmediately, &canRunButBusy));
      }
      if (badConnection) {
        connection = nullptr;
        continue;
      }
    }

    // if this connection is wrong, but it's not busy, check if we should
    // designate it as the free connection.
    if (!canRunUrlImmediately && !canRunButBusy && connection) {
      rv = connection->IsBusy(&isBusy, &isInboxConnection);
      if (NS_FAILED(rv)) continue;
      // if max connections is <= 1, we have to reuse the inbox connection.
      if (!isBusy && (!isInboxConnection || maxConnections <= 1)) {
        if (!freeConnection)
          freeConnection = connection;
        else  // check which is the better free connection to use.
        {     // We prefer one not in the selected state.
          nsAutoCString selectedFolderName;
          connection->GetSelectedMailboxName(getter_Copies(selectedFolderName));
          if (selectedFolderName.IsEmpty()) freeConnection = connection;
        }
      }
    }
    // don't leave this loop with connection set if we can't use it!
    if (!canRunButBusy && !canRunUrlImmediately) connection = nullptr;
  }

  nsImapState requiredState;
  aImapUrl->GetRequiredImapState(&requiredState);
  // refresh cnt in case we killed one or more dead connections. This
  // will prevent us from not spinning up a new connection when all
  // connections were dead.
  cnt = m_connectionCache.Count();
  // if we got here and we have a connection, then we should return it!
  if (canRunUrlImmediately && connection) {
    connection.forget(aImapConnection);
  } else if (canRunButBusy) {
    // do nothing; return NS_OK; for queuing
  }
  // CanHandleUrl will pretend that some types of urls require a selected state
  // url (e.g., a folder delete or msg append) but we shouldn't create new
  // connections for these types of urls if we have a free connection. So we
  // check the actual required state here.
  else if (cnt < maxConnections &&
           (!freeConnection ||
            requiredState == nsIImapUrl::nsImapSelectedState)) {
    rv = CreateProtocolInstance(aImapConnection);
  } else if (freeConnection) {
    freeConnection.forget(aImapConnection);
  } else {
    if (cnt >= maxConnections)
      nsImapProtocol::LogImapUrl("exceeded connection cache limit", aImapUrl);
    // caller will queue the url
  }

  PR_CExitMonitor(this);
  return rv;
}

nsresult nsImapIncomingServer::CreateProtocolInstance(
    nsIImapProtocol** aImapConnection) {
  // create a new connection and add it to the connection cache
  // we may need to flag the protocol connection as busy so we don't get
  // a race condition where someone else goes through this code

  int32_t authMethod;
  GetAuthMethod(&authMethod);
  nsresult rv;
  // pre-flight that we have nss - on the ui thread - for MD5 etc.
  switch (authMethod) {
    case nsMsgAuthMethod::passwordEncrypted:
    case nsMsgAuthMethod::secure:
    case nsMsgAuthMethod::anything:
      NS_ENSURE_TRUE(EnsureNSSInitializedChromeOrContent(),
                     NS_ERROR_NOT_AVAILABLE);
      break;
    default:
      break;
  }
  nsCOMPtr<nsIImapHostSessionList> hostSession =
      do_GetService("@mozilla.org/messenger/imaphostsessionlist;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);
  RefPtr<nsImapProtocol> protocolInstance(new nsImapProtocol());
  rv = protocolInstance->Initialize(hostSession, this);
  NS_ENSURE_SUCCESS(rv, rv);
  // It implements nsIChannel, and all channels require loadInfo.
  nsCOMPtr<nsILoadInfo> loadInfo = MOZ_TRY(
      LoadInfo::Create(nsContentUtils::GetSystemPrincipal(), nullptr, nullptr,
                       nsILoadInfo::SEC_ALLOW_CROSS_ORIGIN_SEC_CONTEXT_IS_NULL,
                       nsIContentPolicy::TYPE_OTHER));
  protocolInstance->SetLoadInfo(loadInfo);

  // take the protocol instance and add it to the connectionCache
  m_connectionCache.AppendObject(protocolInstance);
  protocolInstance.forget(aImapConnection);
  return rv;
}

NS_IMETHODIMP nsImapIncomingServer::CloseConnectionForFolder(
    nsIMsgFolder* aMsgFolder) {
  nsresult rv = NS_OK;
  nsCOMPtr<nsIImapProtocol> connection;
  bool isBusy = false, isInbox = false;
  nsCString inFolderName;
  nsCString connectionFolderName;
  nsCOMPtr<nsIMsgImapMailFolder> imapFolder = do_QueryInterface(aMsgFolder);

  if (!imapFolder) return NS_ERROR_NULL_POINTER;

  int32_t cnt = m_connectionCache.Count();
  NS_ENSURE_SUCCESS(rv, rv);

  imapFolder->GetOnlineName(inFolderName);
  PR_CEnterMonitor(this);

  for (int32_t i = 0; i < cnt; ++i) {
    connection = m_connectionCache[i];
    if (connection) {
      rv = connection->GetSelectedMailboxName(
          getter_Copies(connectionFolderName));
      if (connectionFolderName.Equals(inFolderName)) {
        rv = connection->IsBusy(&isBusy, &isInbox);
        if (!isBusy) rv = connection->TellThreadToDie(true);
        break;  // found it, end of the loop
      }
    }
  }

  PR_CExitMonitor(this);
  return rv;
}

NS_IMETHODIMP nsImapIncomingServer::ResetConnection(
    const nsACString& folderName) {
  nsresult rv = NS_OK;
  nsCOMPtr<nsIImapProtocol> connection;
  bool isBusy = false, isInbox = false;
  nsCString curFolderName;

  int32_t cnt = m_connectionCache.Count();

  PR_CEnterMonitor(this);

  for (int32_t i = 0; i < cnt; ++i) {
    connection = m_connectionCache[i];
    if (connection) {
      rv = connection->GetSelectedMailboxName(getter_Copies(curFolderName));
      if (curFolderName.Equals(folderName)) {
        rv = connection->IsBusy(&isBusy, &isInbox);
        if (!isBusy) rv = connection->ResetToAuthenticatedState();
        break;  // found it, end of the loop
      }
    }
  }

  PR_CExitMonitor(this);
  return rv;
}

NS_IMETHODIMP
nsImapIncomingServer::PerformExpand(nsIMsgWindow* aMsgWindow) {
  nsString password;
  nsresult rv;
  rv = GetPassword(password);
  NS_ENSURE_SUCCESS(rv, rv);

  if (password.IsEmpty()) {
    // Check if this is due to oauth2 showing empty password. If so, keep going.
    int32_t authMethod = 0;
    GetAuthMethod(&authMethod);
    if (authMethod != nsMsgAuthMethod::OAuth2) return NS_OK;
  }

  rv = ResetFoldersToUnverified(nullptr);

  nsCOMPtr<nsIMsgFolder> rootMsgFolder;
  rv = GetRootFolder(getter_AddRefs(rootMsgFolder));
  NS_ENSURE_SUCCESS(rv, rv);

  if (!rootMsgFolder) return NS_ERROR_FAILURE;

  nsCOMPtr<nsIImapService> imapService = mozilla::components::Imap::Service();
  nsCOMPtr<nsIThread> thread(do_GetCurrentThread());
  rv = imapService->DiscoverAllFolders(rootMsgFolder, this, aMsgWindow);
  NS_ENSURE_SUCCESS(rv, rv);
  nsCOMPtr<nsIImapHostSessionList> hostSessionList =
      do_GetService("@mozilla.org/messenger/imaphostsessionlist;1", &rv);
  if (NS_SUCCEEDED(rv)) {
    nsAutoCString serverKey;
    rv = GetKey(serverKey);
    if (!serverKey.IsEmpty())
      hostSessionList->SetDiscoveryForHostInProgress(serverKey.get(), true);
  }
  return rv;
}

NS_IMETHODIMP
nsImapIncomingServer::VerifyLogon(nsIUrlListener* aUrlListener,
                                  nsIMsgWindow* aMsgWindow, nsIURI** aURL) {
  nsresult rv;

  nsCOMPtr<nsIImapService> imapService = mozilla::components::Imap::Service();
  nsCOMPtr<nsIMsgFolder> rootFolder;
  // this will create the resource if it doesn't exist, but it shouldn't
  // do anything on disk.
  rv = GetRootFolder(getter_AddRefs(rootFolder));
  NS_ENSURE_SUCCESS(rv, rv);
  return imapService->VerifyLogon(rootFolder, aUrlListener, aMsgWindow, aURL);
}

NS_IMETHODIMP nsImapIncomingServer::PerformBiff(nsIMsgWindow* aMsgWindow) {
  nsCOMPtr<nsIMsgFolder> rootMsgFolder;
  nsresult rv = GetRootMsgFolder(getter_AddRefs(rootMsgFolder));
  if (NS_SUCCEEDED(rv)) {
    SetPerformingBiff(true);
    rv = rootMsgFolder->GetNewMessages(aMsgWindow, nullptr);
  }
  return rv;
}

NS_IMETHODIMP
nsImapIncomingServer::CloseCachedConnections() {
  nsCOMPtr<nsIImapProtocol> connection;
  PR_CEnterMonitor(this);

  // iterate through the connection cache closing open connections.
  int32_t cnt = m_connectionCache.Count();

  for (int32_t i = cnt; i > 0; --i) {
    connection = m_connectionCache[i - 1];
    if (connection) connection->TellThreadToDie(true);
  }

  PR_CExitMonitor(this);
  return NS_OK;
}

// nsIImapServerSink impl
// aNewFolder will not be set if we're listing for the subscribe UI, since
// that's the way 4.x worked.
NS_IMETHODIMP nsImapIncomingServer::PossibleImapMailbox(
    const nsACString& folderPath, char hierarchyDelimiter, int32_t boxFlags,
    bool* aNewFolder) {
  NS_ENSURE_ARG_POINTER(aNewFolder);
  NS_ENSURE_TRUE(!folderPath.IsEmpty(), NS_ERROR_FAILURE);

  // folderPath is in canonical format, i.e., hierarchy separator has been
  // replaced with '/'
  nsresult rv;
  bool found = false;
  bool haveParent = false;
  nsCOMPtr<nsIMsgImapMailFolder> hostFolder;
  nsCOMPtr<nsIMsgFolder> aFolder;
  bool explicitlyVerify = false;

  *aNewFolder = false;
  nsCOMPtr<nsIMsgFolder> rootFolder;
  rv = GetRootFolder(getter_AddRefs(rootFolder));

  if (NS_FAILED(rv)) return rv;

  nsAutoCString dupFolderPath(folderPath);
  if (dupFolderPath.Last() == '/') {
    dupFolderPath.SetLength(dupFolderPath.Length() - 1);
    if (dupFolderPath.IsEmpty()) return NS_ERROR_FAILURE;
    // *** this is what we did in 4.x in order to list uw folder only
    // mailbox in order to get the \NoSelect flag
    explicitlyVerify = !(boxFlags & kNameSpace);
  }
  if (mDoingSubscribeDialog) {
    // Make sure the imapmailfolder object has the right delimiter because the
    // unsubscribed folders (those not in the 'lsub' list) have the delimiter
    // set to the default ('^').
    if (rootFolder && !dupFolderPath.IsEmpty()) {
      nsCOMPtr<nsIMsgFolder> msgFolder;
      bool isNamespace = false;
      bool noSelect = false;

      rv = rootFolder->FindSubFolder(dupFolderPath, getter_AddRefs(msgFolder));
      NS_ENSURE_SUCCESS(rv, rv);
      m_subscribeFolders.AppendObject(msgFolder);
      noSelect = (boxFlags & kNoselect) != 0;
      nsCOMPtr<nsIMsgImapMailFolder> imapFolder =
          do_QueryInterface(msgFolder, &rv);
      NS_ENSURE_SUCCESS(rv, rv);
      imapFolder->SetHierarchyDelimiter(hierarchyDelimiter);
      isNamespace = (boxFlags & kNameSpace) != 0;
      if (!isNamespace)
        rv = AddTo(dupFolderPath,
                   mDoingLsub && !noSelect /* add as subscribed */, !noSelect,
                   mDoingLsub /* change if exists */);
      NS_ENSURE_SUCCESS(rv, rv);
      return rv;
    }
  }

  hostFolder = do_QueryInterface(rootFolder, &rv);
  if (NS_FAILED(rv)) return rv;

  nsAutoCString tempFolderName(dupFolderPath);
  nsAutoCString tokenStr, remStr, changedStr;
  int32_t slashPos = tempFolderName.FindChar('/');
  if (slashPos > 0) {
    tokenStr = StringHead(tempFolderName, slashPos);
    remStr = Substring(tempFolderName, slashPos);
  } else
    tokenStr.Assign(tempFolderName);

  if ((int32_t(PL_strcasecmp(tokenStr.get(), "INBOX")) == 0) &&
      (strcmp(tokenStr.get(), "INBOX") != 0))
    changedStr.AppendLiteral("INBOX");
  else
    changedStr.Append(tokenStr);

  if (slashPos > 0) changedStr.Append(remStr);

  dupFolderPath.Assign(changedStr);
  nsAutoCString folderName(dupFolderPath);

  nsAutoCString uri;
  nsCString serverUri;
  GetServerURI(serverUri);
  uri.Assign(serverUri);
  int32_t leafPos = folderName.RFindChar('/');
  nsAutoCString parentName(folderName);
  nsAutoCString parentUri(uri);

  if (leafPos > 0) {
    // If there is a hierarchy, there is a parent.
    // Don't strip off slash if it's the first character
    parentName.SetLength(leafPos);
    folderName.Cut(0, leafPos + 1);  // get rid of the parent name
    haveParent = true;
    parentUri.Append('/');
    parentUri.Append(parentName);
  }
  if (folderPath.LowerCaseEqualsLiteral("inbox") &&
      hierarchyDelimiter == kOnlineHierarchySeparatorNil) {
    hierarchyDelimiter = '/';  // set to default in this case (as in 4.x)
    hostFolder->SetHierarchyDelimiter(hierarchyDelimiter);
  }

  nsCOMPtr<nsIMsgFolder> child;

  // nsCString possibleName(aSpec->allocatedPathName);
  uri.Append('/');
  uri.Append(dupFolderPath);
  bool caseInsensitive = dupFolderPath.LowerCaseEqualsLiteral("inbox");
  rootFolder->GetChildWithURI(uri, true, caseInsensitive,
                              getter_AddRefs(child));
  // if we couldn't find this folder by URI, tell the imap code it's a new
  // folder to us
  *aNewFolder = !child;
  if (child) found = true;
  if (!found) {
    // trying to find/discover the parent
    if (haveParent) {
      nsCOMPtr<nsIMsgFolder> parent;
      bool parentIsNew;
      caseInsensitive = parentName.LowerCaseEqualsLiteral("inbox");
      rootFolder->GetChildWithURI(parentUri, true, caseInsensitive,
                                  getter_AddRefs(parent));
      if (!parent /* || parentFolder->GetFolderNeedsAdded()*/) {
        PossibleImapMailbox(
            parentName, hierarchyDelimiter,
            kNoselect |       // be defensive
                ((boxFlags &  // only inherit certain flags from the child
                  (kPublicMailbox | kOtherUsersMailbox | kPersonalMailbox))),
            &parentIsNew);
      }
    }
    rv = hostFolder->CreateClientSubfolderInfo(
        dupFolderPath, hierarchyDelimiter, boxFlags, false);
    NS_ENSURE_SUCCESS(rv, rv);
    caseInsensitive = dupFolderPath.LowerCaseEqualsLiteral("inbox");
    rootFolder->GetChildWithURI(uri, true, caseInsensitive,
                                getter_AddRefs(child));
  }
  if (child) {
    nsCOMPtr<nsIMsgImapMailFolder> imapFolder = do_QueryInterface(child);
    if (imapFolder) {
      nsAutoCString onlineName;
      nsAutoString unicodeName;
      imapFolder->SetVerifiedAsOnlineFolder(true);
      imapFolder->SetHierarchyDelimiter(hierarchyDelimiter);
      if (boxFlags & kImapTrash) {
        int32_t deleteModel;
        GetDeleteModel(&deleteModel);
        if (deleteModel == nsMsgImapDeleteModels::MoveToTrash) {
          child->SetFlag(nsMsgFolderFlags::Trash);
        }
      }

      imapFolder->SetBoxFlags(boxFlags);
      imapFolder->SetExplicitlyVerify(explicitlyVerify);
      imapFolder->GetOnlineName(onlineName);

      // online name needs to use the correct hierarchy delimiter (I think...)
      // or the canonical path - one or the other, but be consistent.
      dupFolderPath.ReplaceChar('/', hierarchyDelimiter);
      if (hierarchyDelimiter != '/') {
        nsImapUrl::UnescapeSlashes(dupFolderPath);
      }

      // GMail gives us a localized name for the inbox but doesn't let
      // us select that localized name.
      if (boxFlags & kImapInbox)
        imapFolder->SetOnlineName("INBOX"_ns);
      else if (onlineName.IsEmpty() || !onlineName.Equals(dupFolderPath))
        imapFolder->SetOnlineName(dupFolderPath);

      if (hierarchyDelimiter != '/') {
        nsImapUrl::UnescapeSlashes(folderName);
      }
      if (NS_SUCCEEDED(CopyFolderNameToUTF16(folderName, unicodeName)))
        child->SetName(NS_ConvertUTF16toUTF8(unicodeName));
    }
  }
  if (!found && child)
    child->SetMsgDatabase(nullptr);  // close the db, so we don't hold open all
                                     // the .msf files for new folders
  return NS_OK;
}

NS_IMETHODIMP nsImapIncomingServer::AddFolderRights(
    const nsACString& mailboxName, const nsACString& userName,
    const nsACString& rights) {
  nsCOMPtr<nsIMsgFolder> rootFolder;
  nsresult rv = GetRootFolder(getter_AddRefs(rootFolder));
  if (NS_SUCCEEDED(rv) && rootFolder) {
    nsCOMPtr<nsIMsgImapMailFolder> imapRoot = do_QueryInterface(rootFolder);
    if (imapRoot) {
      nsCOMPtr<nsIMsgImapMailFolder> foundFolder;
      rv = imapRoot->FindOnlineSubFolder(mailboxName,
                                         getter_AddRefs(foundFolder));
      if (NS_SUCCEEDED(rv) && foundFolder)
        return foundFolder->AddFolderRights(userName, rights);
    }
  }
  return rv;
}

NS_IMETHODIMP nsImapIncomingServer::FolderNeedsACLInitialized(
    const nsACString& folderPath, bool* aNeedsACLInitialized) {
  NS_ENSURE_ARG_POINTER(aNeedsACLInitialized);
  nsCOMPtr<nsIMsgFolder> rootFolder;
  nsresult rv = GetRootFolder(getter_AddRefs(rootFolder));
  if (NS_SUCCEEDED(rv) && rootFolder) {
    nsCOMPtr<nsIMsgImapMailFolder> imapRoot = do_QueryInterface(rootFolder);
    if (imapRoot) {
      nsCOMPtr<nsIMsgImapMailFolder> foundFolder;
      rv = imapRoot->FindOnlineSubFolder(folderPath,
                                         getter_AddRefs(foundFolder));
      if (NS_SUCCEEDED(rv) && foundFolder) {
        nsCOMPtr<nsIImapMailFolderSink> folderSink =
            do_QueryInterface(foundFolder);
        if (folderSink)
          return folderSink->GetFolderNeedsACLListed(aNeedsACLInitialized);
      }
    }
  }
  *aNeedsACLInitialized = false;  // maybe we want to say TRUE here...
  return NS_OK;
}

NS_IMETHODIMP nsImapIncomingServer::RefreshFolderRights(
    const nsACString& folderPath) {
  nsCOMPtr<nsIMsgFolder> rootFolder;
  nsresult rv = GetRootFolder(getter_AddRefs(rootFolder));
  if (NS_SUCCEEDED(rv) && rootFolder) {
    nsCOMPtr<nsIMsgImapMailFolder> imapRoot = do_QueryInterface(rootFolder);
    if (imapRoot) {
      nsCOMPtr<nsIMsgImapMailFolder> foundFolder;
      rv = imapRoot->FindOnlineSubFolder(folderPath,
                                         getter_AddRefs(foundFolder));
      if (NS_SUCCEEDED(rv) && foundFolder)
        return foundFolder->RefreshFolderRights();
    }
  }
  return rv;
}

nsresult nsImapIncomingServer::GetFolder(const nsACString& name,
                                         nsIMsgFolder** pFolder) {
  NS_ENSURE_ARG_POINTER(pFolder);
  NS_ENSURE_TRUE(!name.IsEmpty(), NS_ERROR_FAILURE);
  nsresult rv;
  *pFolder = nullptr;

  nsCOMPtr<nsIMsgFolder> rootFolder;
  rv = GetRootFolder(getter_AddRefs(rootFolder));
  if (NS_SUCCEEDED(rv) && rootFolder) {
    nsCString uri;
    rv = rootFolder->GetURI(uri);
    if (NS_SUCCEEDED(rv) && !uri.IsEmpty()) {
      nsAutoCString uriString(uri);
      uriString.Append('/');
      uriString.Append(name);
      rv = GetOrCreateFolder(uriString, pFolder);
    }
  }
  return rv;
}

NS_IMETHODIMP nsImapIncomingServer::OnlineFolderDelete(
    const nsACString& aFolderName) {
  return NS_OK;
}

NS_IMETHODIMP nsImapIncomingServer::OnlineFolderCreateFailed(
    const nsACString& aFolderName) {
  return NS_OK;
}

NS_IMETHODIMP nsImapIncomingServer::OnlineFolderRename(
    nsIMsgWindow* msgWindow, const nsACString& oldName,
    const nsACString& newName) {
  nsresult rv = NS_ERROR_FAILURE;
  if (!newName.IsEmpty()) {
    nsCOMPtr<nsIMsgFolder> me;
    rv = GetFolder(oldName, getter_AddRefs(me));
    if (NS_FAILED(rv)) return rv;

    nsCOMPtr<nsIMsgFolder> parent;
    nsCString tmpNewName(newName);
    int32_t folderStart = tmpNewName.RFindChar('/');
    if (folderStart > 0) {
      rv = GetFolder(StringHead(tmpNewName, folderStart),
                     getter_AddRefs(parent));
    } else  // root is the parent
      rv = GetRootFolder(getter_AddRefs(parent));
    if (NS_SUCCEEDED(rv) && parent) {
      nsCOMPtr<nsIMsgImapMailFolder> folder;
      folder = do_QueryInterface(me, &rv);
      if (NS_SUCCEEDED(rv)) {
        folder->RenameLocal(tmpNewName, parent);
        nsCOMPtr<nsIMsgImapMailFolder> parentImapFolder =
            do_QueryInterface(parent);

        if (parentImapFolder)
          parentImapFolder->RenameClient(msgWindow, me, oldName, tmpNewName);

        nsCOMPtr<nsIMsgFolder> newFolder;
        nsString unicodeNewName;
        // `tmpNewName` is in MUTF-7 or UTF-8. It needs to be convert to UTF-8.
        CopyFolderNameToUTF16(tmpNewName, unicodeNewName);
        CopyUTF16toUTF8(unicodeNewName, tmpNewName);
        rv = GetFolder(tmpNewName, getter_AddRefs(newFolder));
        if (NS_SUCCEEDED(rv)) {
          newFolder->NotifyFolderEvent(kRenameCompleted);
        }
      }
    }
  }
  return rv;
}

NS_IMETHODIMP nsImapIncomingServer::FolderIsNoSelect(
    const nsACString& aFolderName, bool* result) {
  NS_ENSURE_ARG_POINTER(result);
  nsCOMPtr<nsIMsgFolder> msgFolder;
  nsresult rv = GetFolder(aFolderName, getter_AddRefs(msgFolder));
  if (NS_SUCCEEDED(rv) && msgFolder) {
    uint32_t flags;
    msgFolder->GetFlags(&flags);
    *result = ((flags & nsMsgFolderFlags::ImapNoselect) != 0);
  } else
    *result = false;
  return NS_OK;
}

NS_IMETHODIMP nsImapIncomingServer::SetFolderAdminURL(
    const nsACString& aFolderName, const nsACString& aFolderAdminUrl) {
  nsCOMPtr<nsIMsgFolder> rootFolder;
  nsresult rv = GetRootFolder(getter_AddRefs(rootFolder));
  if (NS_SUCCEEDED(rv) && rootFolder) {
    nsCOMPtr<nsIMsgImapMailFolder> imapRoot = do_QueryInterface(rootFolder);
    if (imapRoot) {
      nsCOMPtr<nsIMsgImapMailFolder> foundFolder;
      rv = imapRoot->FindOnlineSubFolder(aFolderName,
                                         getter_AddRefs(foundFolder));
      if (NS_SUCCEEDED(rv) && foundFolder)
        return foundFolder->SetAdminUrl(aFolderAdminUrl);
    }
  }
  return rv;
}

NS_IMETHODIMP nsImapIncomingServer::FolderVerifiedOnline(
    const nsACString& folderName, bool* aResult) {
  NS_ENSURE_ARG_POINTER(aResult);
  *aResult = false;
  nsCOMPtr<nsIMsgFolder> rootFolder;
  nsresult rv = GetRootFolder(getter_AddRefs(rootFolder));
  if (NS_SUCCEEDED(rv) && rootFolder) {
    nsCOMPtr<nsIMsgFolder> folder;
    rv = rootFolder->FindSubFolder(folderName, getter_AddRefs(folder));
    if (NS_SUCCEEDED(rv) && folder) {
      nsCOMPtr<nsIMsgImapMailFolder> imapFolder = do_QueryInterface(folder);
      if (imapFolder) imapFolder->GetVerifiedAsOnlineFolder(aResult);
    }
  }
  return rv;
}

/*
 * Define a function to obtain the imap (short) path of a folder.
 * Currently used only in nsImapIncomingServer::DiscoveryDone for folder(s)
 * flagged as Trash.
 */
/*static*/
nsresult nsImapIncomingServer::PathFromFolder(nsIMsgFolder* folder,
                                              nsACString& shortPath) {
  return FolderPathInServer(folder, shortPath);
}

NS_IMETHODIMP nsImapIncomingServer::DiscoveryDone() {
  if (mDoingSubscribeDialog) return NS_OK;

  nsCOMPtr<nsIMsgFolder> rootMsgFolder;
  nsresult rv = GetRootFolder(getter_AddRefs(rootMsgFolder));
  if (NS_SUCCEEDED(rv) && rootMsgFolder) {
    // GetResource() may return a node which is not in the folder
    // tree hierarchy but in the rdf cache in case of the non-existing default
    // Sent, Drafts, and Templates folders. The resource will be eventually
    // released when the rdf service shuts down. When we create the default
    // folders later on in the imap server, the subsequent GetResource() of the
    // same uri will get us the cached rdf resource which should have the folder
    // flag set appropriately.

    nsCOMPtr<nsIMsgAccountManager> accountMgr =
        mozilla::components::AccountManager::Service();
    nsCOMPtr<nsIMsgIdentity> identity;
    rv = accountMgr->GetFirstIdentityForServer(this, getter_AddRefs(identity));
    if (NS_SUCCEEDED(rv) && identity) {
      nsCString folderUri;
      identity->GetFccFolderURI(folderUri);
      nsCString existingUri;

      if (CheckSpecialFolder(folderUri, nsMsgFolderFlags::SentMail,
                             existingUri)) {
        identity->SetFccFolderURI(existingUri);
        identity->SetFccFolderPickerMode("1"_ns);
      }
      identity->GetDraftsFolderURI(folderUri);
      if (CheckSpecialFolder(folderUri, nsMsgFolderFlags::Drafts,
                             existingUri)) {
        identity->SetDraftsFolderURI(existingUri);
        identity->SetDraftsFolderPickerMode("1"_ns);
      }
      bool archiveEnabled;
      identity->GetArchiveEnabled(&archiveEnabled);
      if (archiveEnabled) {
        identity->GetArchivesFolderURI(folderUri);
        if (CheckSpecialFolder(folderUri, nsMsgFolderFlags::Archive,
                               existingUri)) {
          identity->SetArchivesFolderURI(existingUri);
          identity->SetArchivesFolderPickerMode("1"_ns);
        }
      }
      identity->GetTemplatesFolderURI(folderUri);
      if (!folderUri.IsEmpty()) {
        nsCOMPtr<nsIMsgFolder> folder;
        rv = GetOrCreateFolder(folderUri, getter_AddRefs(folder));
        if (NS_SUCCEEDED(rv)) rv = folder->SetFlag(nsMsgFolderFlags::Templates);
      }
    }

    nsCOMPtr<nsISpamSettings> spamSettings;
    rv = GetSpamSettings(getter_AddRefs(spamSettings));
    if (NS_SUCCEEDED(rv) && spamSettings) {
      nsCString spamFolderUri, existingUri;
      spamSettings->GetSpamFolderURI(spamFolderUri);
      if (CheckSpecialFolder(spamFolderUri, nsMsgFolderFlags::Junk,
                             existingUri)) {
        // This only sets the cached values in the spam settings object.
        spamSettings->SetActionTargetFolder(existingUri);
        spamSettings->SetMoveTargetMode(
            nsISpamSettings::MOVE_TARGET_MODE_FOLDER);
        // Set the preferences too so that the values persist.
        SetStringValue("spamActionTargetFolder", existingUri);
        SetIntValue("moveTargetMode", nsISpamSettings::MOVE_TARGET_MODE_FOLDER);
      }
    }
  }

  // Un-verify ALL subfolders when ignoring subs. Needed to ensure that new
  // folders are discovered at all levels, including under Inbox. Note: At
  // account creation, all folders are new.
  bool usingSubscription = true;
  GetUsingSubscription(&usingSubscription);
  if (!usingSubscription && rootMsgFolder) {
    ResetFoldersToUnverified(rootMsgFolder);
  }

  nsCOMArray<nsIMsgImapMailFolder> unverifiedFolders;
  GetUnverifiedFolders(unverifiedFolders);

  // Need to do this BEFORE trash folder checks and adjustments so if trash
  // folder is deleted it is no longer present in the trashFolders array. Array
  // obtained below.
  int32_t count = unverifiedFolders.Count();
  MOZ_LOG(IMAP_DC, mozilla::LogLevel::Debug,
          ("DiscoveryDone, unverified folder count = %" PRIu32, count));
  for (int32_t k = 0; k < count; ++k) {
    bool explicitlyVerify = false;
    bool hasSubFolders = false;
    uint32_t folderFlags;
    nsCOMPtr<nsIMsgImapMailFolder> currentImapFolder(unverifiedFolders[k]);
    nsCOMPtr<nsIMsgFolder> currentFolder(
        do_QueryInterface(currentImapFolder, &rv));
    if (NS_FAILED(rv)) continue;

    currentFolder->GetFlags(&folderFlags);
    if (folderFlags &
        nsMsgFolderFlags::Virtual)  // don't remove virtual folders
      continue;

    if ((!usingSubscription ||
         (NS_SUCCEEDED(
              currentImapFolder->GetExplicitlyVerify(&explicitlyVerify)) &&
          explicitlyVerify)) ||
        ((NS_SUCCEEDED(currentFolder->GetHasSubFolders(&hasSubFolders)) &&
          hasSubFolders) &&
         !NoDescendantsAreVerified(currentFolder))) {
      bool isNamespace;
      currentImapFolder->GetIsNamespace(&isNamespace);
      if (!isNamespace)  // don't list namespaces explicitly
      {
        // If there are no subfolders and this is unverified, we don't want to
        // run url listfolder. That is, we want to undiscover the folder.
        // If there are subfolders and no descendants are verified, we want to
        // undiscover all of the folders.
        // Only if there are subfolders and at least one of them is verified
        // do we want to refresh that folder's flags, because it won't be going
        // away.
        currentImapFolder->SetExplicitlyVerify(false);
        currentImapFolder->List();  // Run listfolder url
        // If subscriptions are ignored, trigger a discoverchildren url so that
        // any new folders are discovered. PerformExpand starts the url.
        if (!usingSubscription) {
          MOZ_LOG(IMAP_DC, mozilla::LogLevel::Debug,
                  ("DiscoveryDone: run discoverchildren with PerformExpand"));
          currentImapFolder->PerformExpand(nullptr);
        }
      }
    } else {
      nsCOMPtr<nsIMsgFolder> parent;
      currentFolder->GetParent(getter_AddRefs(parent));
      if (parent) {
        MOZ_LOG(IMAP_DC, mozilla::LogLevel::Debug,
                ("DiscoveryDone: folder is gone so remove it"));
        currentImapFolder->RemoveLocalSelf();
      }
    }
  }

  if (rootMsgFolder) {
    // Ensure there is at most one folder flagged as trash. Another might be
    // flagged if the trash name has been changed. Also try to make sure that
    // the trash folder pref is set to the path of the folder flagged as trash.
    // First obtain array of folders flagged as trash.
    nsTArray<RefPtr<nsIMsgFolder>> trashFolders;
    rv = rootMsgFolder->GetFoldersWithFlags(nsMsgFolderFlags::Trash,
                                            trashFolders);
    NS_WARNING_ASSERTION(trashFolders.Length() <= 2,
                         "why more than 2 folders flagged as trash?");
    if (NS_SUCCEEDED(rv) && trashFolders.Length()) {
      // See if there is a pref set for trash folder. Only check the "raw" value
      // since here we don't want to see the default "Trash" string returned by
      // GetTrashFolderName() when the pref is really empty.
      nsAutoCString prefPath;
      rv = GetStringValue(PREF_TRASH_FOLDER_PATH, prefPath);
      if (!prefPath.IsEmpty()) {
        // Go through the trashFolders and un-flag as `trash` ones that don't
        // match prefPath.
        for (auto trashFolder : trashFolders) {
          nsAutoCString trashFolderPathUtf7or8;
          if (NS_SUCCEEDED(
                  PathFromFolder(trashFolder, trashFolderPathUtf7or8))) {
            // The value for trashFolderPathUtf7or8 comes from the server, which
            // for non UTF-8 servers will be encoded as MUTF-7. The preference
            // is stored in UTF-8, so we need to convert if this is not a UTF-8
            // server to compare the preference value to the server value.
            bool isUtf8;
            GetUtf8AcceptEnabled(&isUtf8);
            nsAutoCString trashFolderPathUtf8;
            if (isUtf8) {
              trashFolderPathUtf8 = trashFolderPathUtf7or8;
            } else {
              nsAutoString trashFolderPathUtf16;
              CopyMUTF7toUTF16(trashFolderPathUtf7or8, trashFolderPathUtf16);
              CopyUTF16toUTF8(trashFolderPathUtf16, trashFolderPathUtf8);
            }
            if (!prefPath.Equals(trashFolderPathUtf8)) {
              // We clear the trash folder flag if the trash folder path doesn't
              // match mail.server.serverX.trash_folder_name.
              trashFolder->ClearFlag(nsMsgFolderFlags::Trash);
            }
          }
        }
      } else {
        // Trash pref is not set. Go through the trashFolders and set the trash
        // pref for the folder with possible boxFlag kImapXListTrash (discovered
        // as \trash special-use) and keep the Trash flag. If kImapXListTrash
        // boxFlag is not set, remove the trash flag unless the folder name is
        // the default name "Trash".

        // First, look for folder with special-use \trash flag.
        nsCOMPtr<nsIMsgFolder> specialUseFolder;
        for (auto trashFolder : trashFolders) {
          nsCOMPtr<nsIMsgImapMailFolder> imapFolder(
              do_QueryInterface(trashFolder));
          int32_t boxFlags;
          imapFolder->GetBoxFlags(&boxFlags);
          if (boxFlags & kImapXListTrash) {
            // Found one. Deal with it below.
            specialUseFolder = trashFolder;
            break;
          }
        }

        // No trash pref set, so get the default if needed.
        nsAutoCString defaultTrashName;
        if (!specialUseFolder) GetTrashFolderName(defaultTrashName);
        for (auto trashFolder : trashFolders) {
          if (specialUseFolder) {
            // Clear trash flag on folders w/o special-use kImapXListTrash flag.
            nsCOMPtr<nsIMsgImapMailFolder> imapFolder(
                do_QueryInterface(trashFolder));
            int32_t boxFlags;
            imapFolder->GetBoxFlags(&boxFlags);
            if (!(boxFlags & kImapXListTrash)) {
              trashFolder->ClearFlag(nsMsgFolderFlags::Trash);
            } else {
              // Set pref to the path of the discovered special-use trash
              // folder.
              nsAutoCString specialUseFolderPath;
              rv = PathFromFolder(specialUseFolder, specialUseFolderPath);
              if (NS_SUCCEEDED(rv)) {
                SetStringValue(PREF_TRASH_FOLDER_PATH, specialUseFolderPath);
              }
            }
          } else {
            // No special-use trash found.
            // Clear the trash flag unless folder has the default name "Trash",
            // ignoring case. If folder matches default name, set that folder's
            // name as the pref.
            nsAutoCString trashFolderPath;
            rv = PathFromFolder(trashFolder, trashFolderPath);
            if (NS_SUCCEEDED(rv)) {
              if (!defaultTrashName.Equals(
                      trashFolderPath, nsCaseInsensitiveUTF8StringComparator)) {
                trashFolder->ClearFlag(nsMsgFolderFlags::Trash);
              } else {
                // Set the pref to the server's trashFolderPath
                SetStringValue(PREF_TRASH_FOLDER_PATH, trashFolderPath);
              }
            }
          }
        }
      }
    } else {
      SetStringValue(PREF_TRASH_FOLDER_PATH, ""_ns);
    }
  }
  return rv;
}

// Check if the special folder corresponding to the uri exists. If not, check
// if there already exists a folder with the special folder flag (the server may
// have told us about a folder to use through XLIST). If so, return the uri of
// the existing special folder. If not, set the special flag on the folder so
// it will be there if and when the folder is created.
// Return true if we found an existing special folder different than
// the one specified in prefs, and the one specified by prefs doesn't exist.
bool nsImapIncomingServer::CheckSpecialFolder(nsCString& folderUri,
                                              uint32_t folderFlag,
                                              nsCString& existingUri) {
  nsCOMPtr<nsIMsgFolder> folder;
  nsCOMPtr<nsIMsgFolder> rootMsgFolder;
  nsresult rv = GetRootFolder(getter_AddRefs(rootMsgFolder));
  NS_ENSURE_SUCCESS(rv, false);
  nsCOMPtr<nsIMsgFolder> existingFolder;
  rootMsgFolder->GetFolderWithFlags(folderFlag, getter_AddRefs(existingFolder));

  if (!folderUri.IsEmpty() &&
      NS_SUCCEEDED(GetOrCreateFolder(folderUri, getter_AddRefs(folder)))) {
    nsCOMPtr<nsIMsgFolder> parent;
    folder->GetParent(getter_AddRefs(parent));
    if (parent) {
      existingFolder = nullptr;
    }
    if (!existingFolder) {
      folder->SetFlag(folderFlag);
    }
  }

  if (existingFolder) {
    existingFolder->GetURI(existingUri);
    return true;
  }

  return false;
}

bool nsImapIncomingServer::NoDescendantsAreVerified(
    nsIMsgFolder* parentFolder) {
  nsTArray<RefPtr<nsIMsgFolder>> subFolders;
  nsresult rv = parentFolder->GetSubFolders(subFolders);
  if (NS_SUCCEEDED(rv)) {
    for (nsIMsgFolder* child : subFolders) {
      nsCOMPtr<nsIMsgImapMailFolder> childImapFolder =
          do_QueryInterface(child, &rv);
      if (NS_SUCCEEDED(rv) && childImapFolder) {
        bool childVerified = false;
        rv = childImapFolder->GetVerifiedAsOnlineFolder(&childVerified);
        if (NS_SUCCEEDED(rv) && childVerified) {
          return false;
        }
        if (!NoDescendantsAreVerified(child)) {
          return false;
        }
      }
    }
  }
  // If we get this far we didn't find any verified.
  return true;
}

bool nsImapIncomingServer::AllDescendantsAreNoSelect(
    nsIMsgFolder* parentFolder) {
  nsTArray<RefPtr<nsIMsgFolder>> subFolders;
  nsresult rv = parentFolder->GetSubFolders(subFolders);
  if (NS_SUCCEEDED(rv)) {
    for (nsIMsgFolder* child : subFolders) {
      nsCOMPtr<nsIMsgImapMailFolder> childImapFolder =
          do_QueryInterface(child, &rv);
      if (NS_SUCCEEDED(rv) && childImapFolder) {
        uint32_t flags;
        rv = child->GetFlags(&flags);
        bool isNoSelect =
            NS_SUCCEEDED(rv) && (flags & nsMsgFolderFlags::ImapNoselect);
        if (!isNoSelect) {
          return false;
        }
        if (!AllDescendantsAreNoSelect(child)) {
          return false;
        }
      }
    }
  }
  // If we get this far we found none without the Noselect flag.
  return true;
}

/** Prompt upon failed login. */
NS_IMETHODIMP
nsImapIncomingServer::PromptLoginFailed(nsIMsgWindow* aMsgWindow,
                                        int32_t* aResult) {
  nsAutoCString hostName;
  GetHostName(hostName);

  nsAutoCString userName;
  GetUsername(userName);

  nsAutoCString accountName;
  GetPrettyName(accountName);

  nsCOMPtr<mozIDOMWindowProxy> domWindow;
  if (aMsgWindow) {
    aMsgWindow->GetDomWindow(getter_AddRefs(domWindow));
  }

  nsresult rv;
  nsCOMPtr<nsIPromptService> dlgService(
      do_GetService(NS_PROMPTSERVICE_CONTRACTID, &rv));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIStringBundleService> bundleSvc =
      mozilla::components::StringBundle::Service();
  NS_ENSURE_TRUE(bundleSvc, NS_ERROR_UNEXPECTED);

  nsCOMPtr<nsIStringBundle> bundle;
  rv = bundleSvc->CreateBundle("chrome://messenger/locale/messenger.properties",
                               getter_AddRefs(bundle));
  NS_ENSURE_SUCCESS(rv, rv);

  nsString message;
  AutoTArray<nsString, 2> formatStrings2;
  CopyUTF8toUTF16(hostName, *formatStrings2.AppendElement());
  CopyUTF8toUTF16(userName, *formatStrings2.AppendElement());
  rv = bundle->FormatStringFromName("mailServerLoginFailed2", formatStrings2,
                                    message);
  NS_ENSURE_SUCCESS(rv, rv);

  nsString title;
  AutoTArray<nsString, 1> formatStrings = {NS_ConvertUTF8toUTF16(accountName)};
  rv = bundle->FormatStringFromName("mailServerLoginFailedTitleWithAccount",
                                    formatStrings, title);
  NS_ENSURE_SUCCESS(rv, rv);

  nsString button0;
  rv = bundle->GetStringFromName("mailServerLoginFailedRetryButton", button0);
  NS_ENSURE_SUCCESS(rv, rv);

  nsString button2;
  rv = bundle->GetStringFromName("mailServerLoginFailedEnterNewPasswordButton",
                                 button2);
  NS_ENSURE_SUCCESS(rv, rv);

  bool dummyValue = false;
  return dlgService->ConfirmEx(
      domWindow, title.get(), message.get(),
      (nsIPrompt::BUTTON_TITLE_IS_STRING * nsIPrompt::BUTTON_POS_0) +
          (nsIPrompt::BUTTON_TITLE_CANCEL * nsIPrompt::BUTTON_POS_1) +
          (nsIPrompt::BUTTON_TITLE_IS_STRING * nsIPrompt::BUTTON_POS_2),
      button0.get(), nullptr, button2.get(), nullptr, &dummyValue, aResult);
}

NS_IMETHODIMP
nsImapIncomingServer::FEAlert(const nsAString& aAlertString,
                              nsIMsgMailNewsUrl* aUrl) {
  GetStringBundle();

  if (m_stringBundle) {
    nsAutoCString hostName;
    nsresult rv = GetPrettyName(hostName);
    if (NS_SUCCEEDED(rv)) {
      nsString message;
      nsString tempString(aAlertString);
      AutoTArray<nsString, 2> params = {NS_ConvertUTF8toUTF16(hostName),
                                        tempString};

      rv = m_stringBundle->FormatStringFromName("imapServerAlert", params,
                                                message);
      if (NS_SUCCEEDED(rv)) {
        aUrl->SetErrorCode("imap-server-alert"_ns);
        aUrl->SetErrorMessage(message);

        return AlertUser(message, aUrl);
      }
    }
  }
  return AlertUser(aAlertString, aUrl);
}

nsresult nsImapIncomingServer::AlertUser(const nsAString& aString,
                                         nsIMsgMailNewsUrl* aUrl) {
  nsCOMPtr<nsIMsgMailSession> mailSession =
      mozilla::components::MailSession::Service();

  // If there's a message window on the URI, then we should alert the user.
  // Otherwise (i.e. if the getter for `msgWindow` raised
  // `NS_ERROR_NULL_POINTER`), this is a background operation and we should tell
  // the mail session to only call the listeners but not alert.
  bool silent = false;
  nsCOMPtr<nsIMsgWindow> dummy;
  nsresult rv = aUrl->GetMsgWindow(getter_AddRefs(dummy));
  if (rv == NS_ERROR_NULL_POINTER) {
    silent = true;
  } else {
    NS_ENSURE_SUCCESS(rv, rv);
  }

  return mailSession->AlertUser(aString, aUrl, silent);
}

NS_IMETHODIMP
nsImapIncomingServer::FEAlertWithName(const char* aMsgName,
                                      nsIMsgMailNewsUrl* aUrl) {
  // don't bother the user if we're shutting down.
  if (m_shuttingDown) return NS_OK;

  GetStringBundle();

  nsString message;

  if (m_stringBundle) {
    nsAutoCString hostName;
    nsresult rv = GetHostName(hostName);
    if (NS_SUCCEEDED(rv)) {
      AutoTArray<nsString, 1> params;
      CopyUTF8toUTF16(hostName, *params.AppendElement());
      rv = m_stringBundle->FormatStringFromName(aMsgName, params, message);
      if (NS_SUCCEEDED(rv)) {
        aUrl->SetErrorCode(nsDependentCString(aMsgName));
        aUrl->SetErrorMessage(message);

        return AlertUser(message, aUrl);
      }
    }
  }

  // Error condition
  message.AssignLiteral("String Name ");
  message.AppendASCII(aMsgName);
  FEAlert(message, aUrl);
  return NS_OK;
}

NS_IMETHODIMP nsImapIncomingServer::FEAlertFromServer(
    const nsACString& aServerString, nsIMsgMailNewsUrl* aUrl, bool forBye) {
  NS_ENSURE_TRUE(!aServerString.IsEmpty(), NS_OK);

  nsCString message(aServerString);
  message.Trim(" \t\b\r\n");
  NS_ENSURE_TRUE(!message.IsEmpty(), NS_OK);

  // Ensure a period at end and skip over the first two words (the command tag
  // and "NO"). But keep it all as-is if this is for an untagged BYE which can
  // occur in place of a correct greeting response while imap server connection
  // is is attempting to be made; e.g., print "* BYE no can do" in the alert.
  if (!forBye) {
    if (message.Last() != '.') message.Append('.');

    // Find the first word break.
    int32_t pos = message.FindChar(' ');

    // Find the second word break.
    if (pos != -1) pos = message.FindChar(' ', pos + 1);

    // Adjust the message.
    if (pos != -1) message = Substring(message, pos + 1);
  } else {
    // For untagged BYE greeting show the string on a new line.
    message.Insert("\r\n", 0);
  }
  nsAutoCString hostName;
  GetPrettyName(hostName);

  AutoTArray<nsString, 3> formatStrings = {NS_ConvertUTF8toUTF16(hostName)};

  const char* msgName;
  nsString fullMessage;
  nsCOMPtr<nsIImapUrl> imapUrl = do_QueryInterface(aUrl);
  NS_ENSURE_TRUE(imapUrl, NS_ERROR_INVALID_ARG);

  nsImapState imapState;
  nsImapAction imapAction;

  imapUrl->GetRequiredImapState(&imapState);
  imapUrl->GetImapAction(&imapAction);

  NS_ConvertUTF8toUTF16 unicodeMsg(message);

  aUrl->SetErrorCode("imap-server-error"_ns);
  aUrl->SetErrorMessage(unicodeMsg);

  nsCOMPtr<nsIMsgFolder> folder;
  if (imapState == nsIImapUrl::nsImapSelectedState ||
      imapAction == nsIImapUrl::nsImapFolderStatus) {
    aUrl->GetFolder(getter_AddRefs(folder));
    nsAutoString folderName;
    if (folder) folder->GetLocalizedName(folderName);
    msgName = "imapFolderCommandFailed";
    formatStrings.AppendElement(folderName);
  } else {
    msgName = "imapServerCommandFailed";
  }

  formatStrings.AppendElement(unicodeMsg);

  nsresult rv = GetStringBundle();
  NS_ENSURE_SUCCESS(rv, rv);
  if (m_stringBundle) {
    rv = m_stringBundle->FormatStringFromName(msgName, formatStrings,
                                              fullMessage);
    NS_ENSURE_SUCCESS(rv, rv);
  }

  return AlertUser(fullMessage, aUrl);
}

NS_IMETHODIMP nsImapIncomingServer::FEAlertCertError(
    nsITransportSecurityInfo* securityInfo, nsIMsgMailNewsUrl* url) {
  nsCOMPtr<nsIMsgMailSession> mailSession =
      mozilla::components::MailSession::Service();
  mailSession->AlertCertError(securityInfo, url);
  return NS_OK;
}

#define IMAP_MSGS_URL "chrome://messenger/locale/imapMsgs.properties"

nsresult nsImapIncomingServer::GetStringBundle() {
  if (m_stringBundle) return NS_OK;

  nsCOMPtr<nsIStringBundleService> sBundleService =
      mozilla::components::StringBundle::Service();
  NS_ENSURE_TRUE(sBundleService, NS_ERROR_UNEXPECTED);
  return sBundleService->CreateBundle(IMAP_MSGS_URL,
                                      getter_AddRefs(m_stringBundle));
}

NS_IMETHODIMP
nsImapIncomingServer::GetImapStringByName(const char* msgName,
                                          nsAString& aString) {
  nsresult rv = NS_OK;
  GetStringBundle();
  if (m_stringBundle) {
    nsString res_str;
    rv = m_stringBundle->GetStringFromName(msgName, res_str);
    aString.Assign(res_str);
    if (NS_SUCCEEDED(rv)) return rv;
  }
  aString.AssignLiteral("String Name ");
  // mscott: FIX ME
  aString.AppendASCII(msgName);
  return NS_OK;
}

nsresult nsImapIncomingServer::ResetFoldersToUnverified(
    nsIMsgFolder* parentFolder) {
  nsresult rv = NS_OK;
  if (!parentFolder) {
    nsCOMPtr<nsIMsgFolder> rootFolder;
    rv = GetRootFolder(getter_AddRefs(rootFolder));
    NS_ENSURE_SUCCESS(rv, rv);
    return ResetFoldersToUnverified(rootFolder);
  }

  nsCOMPtr<nsIMsgImapMailFolder> imapFolder =
      do_QueryInterface(parentFolder, &rv);
  NS_ENSURE_SUCCESS(rv, rv);
  rv = imapFolder->SetVerifiedAsOnlineFolder(false);
  nsTArray<RefPtr<nsIMsgFolder>> subFolders;
  rv = parentFolder->GetSubFolders(subFolders);
  NS_ENSURE_SUCCESS(rv, rv);

  for (nsIMsgFolder* child : subFolders) {
    rv = ResetFoldersToUnverified(child);
    NS_ENSURE_SUCCESS(rv, rv);
  }

  return rv;
}

void nsImapIncomingServer::GetUnverifiedFolders(
    nsCOMArray<nsIMsgImapMailFolder>& aFoldersArray) {
  nsCOMPtr<nsIMsgFolder> rootFolder;
  if (NS_FAILED(GetRootFolder(getter_AddRefs(rootFolder))) || !rootFolder)
    return;

  nsCOMPtr<nsIMsgImapMailFolder> imapRoot(do_QueryInterface(rootFolder));
  // don't need to verify the root.
  if (imapRoot) imapRoot->SetVerifiedAsOnlineFolder(true);

  GetUnverifiedSubFolders(rootFolder, aFoldersArray);
}

void nsImapIncomingServer::GetUnverifiedSubFolders(
    nsIMsgFolder* parentFolder,
    nsCOMArray<nsIMsgImapMailFolder>& aFoldersArray) {
  nsCOMPtr<nsIMsgImapMailFolder> imapFolder(do_QueryInterface(parentFolder));

  bool verified = false, explicitlyVerify = false;
  if (imapFolder) {
    nsresult rv = imapFolder->GetVerifiedAsOnlineFolder(&verified);
    if (NS_SUCCEEDED(rv))
      rv = imapFolder->GetExplicitlyVerify(&explicitlyVerify);

    if (NS_SUCCEEDED(rv) && (!verified || explicitlyVerify))
      aFoldersArray.AppendObject(imapFolder);
  }

  nsTArray<RefPtr<nsIMsgFolder>> subFolders;
  if (NS_SUCCEEDED(parentFolder->GetSubFolders(subFolders))) {
    for (nsIMsgFolder* child : subFolders) {
      GetUnverifiedSubFolders(child, aFoldersArray);
    }
  }
}

NS_IMETHODIMP nsImapIncomingServer::ForgetSessionPassword(bool modifyLogin) {
  bool usingOauth2 = false;
  if (modifyLogin) {
    // Only need to check for oauth2 if modifyLogin is true.
    int32_t authMethod = 0;
    GetAuthMethod(&authMethod);
    usingOauth2 = (authMethod == nsMsgAuthMethod::OAuth2);
  }

  // Clear the cached password if not using Oauth2 or if modifyLogin is false.
  if (!usingOauth2 || !modifyLogin) {
    nsresult rv = nsMsgIncomingServer::ForgetSessionPassword(modifyLogin);
    NS_ENSURE_SUCCESS(rv, rv);

    // fix for bugscape bug #15485
    // if we use turbo, and we logout, we need to make sure
    // the server doesn't think it's authenticated.
    // the biff timer continues to fire when you use turbo
    // (see #143848).  if we exited, we've set the password to null
    // but if we're authenticated, and the biff timer goes off
    // we'll still perform biff, because we use m_userAuthenticated
    // to determine if we require a password for biff.
    // (if authenticated, we don't require a password
    // see nsMsgBiffManager::PerformBiff())
    // performing biff without a password will pop up the prompt dialog
    // which is pretty wacky, when it happens after you quit the application
    m_userAuthenticated = false;
  }
  return NS_OK;
}

NS_IMETHODIMP nsImapIncomingServer::GetServerRequiresPasswordForBiff(
    bool* aServerRequiresPasswordForBiff) {
  NS_ENSURE_ARG_POINTER(aServerRequiresPasswordForBiff);
  // if the user has already been authenticated, we've got the password
  *aServerRequiresPasswordForBiff = !m_userAuthenticated;
  return NS_OK;
}

NS_IMETHODIMP nsImapIncomingServer::ForgetPassword() {
  return nsMsgIncomingServer::ForgetPassword();
}

NS_IMETHODIMP
nsImapIncomingServer::AsyncGetPassword(nsIImapProtocol* aProtocol,
                                       bool aNewPasswordRequested,
                                       nsAString& aPassword) {
  if (m_password.IsEmpty()) {
    // We're now going to need to do something that will end up with us either
    // poking login manager or prompting the user. We need to ensure we only
    // do one prompt at a time (and login manager could cause a master password
    // prompt), so we need to use the async prompter.
    nsresult rv;
    nsCOMPtr<nsIMsgAsyncPrompter> asyncPrompter =
        do_GetService("@mozilla.org/messenger/msgAsyncPrompter;1", &rv);
    NS_ENSURE_SUCCESS(rv, rv);
    nsCOMPtr<nsIMsgAsyncPromptListener> promptListener(
        do_QueryInterface(aProtocol));
    rv = asyncPrompter->QueueAsyncAuthPrompt(m_serverKey, aNewPasswordRequested,
                                             promptListener);
    // Explicit NS_ENSURE_SUCCESS for debug purposes as errors tend to get
    // hidden.
    NS_ENSURE_SUCCESS(rv, rv);
  }
  if (!m_password.IsEmpty()) aPassword = m_password;
  return NS_OK;
}

// Get password already stored in login manager. This won't trigger a prompt
// if no password string is present.
NS_IMETHODIMP
nsImapIncomingServer::SyncGetPassword(nsAString& aPassword) {
  nsresult rv = NS_OK;
  if (NS_SUCCEEDED(GetPasswordWithoutUI()) && !m_password.IsEmpty())
    aPassword = m_password;
  else
    rv = NS_ERROR_NOT_AVAILABLE;
  return rv;
}

NS_IMETHODIMP
nsImapIncomingServer::PromptPassword(nsIMsgWindow* aMsgWindow,
                                     nsAString& aPassword) {
  nsAutoCString userName;
  GetUsername(userName);

  nsAutoCString hostName;
  GetHostName(hostName);

  nsresult rv = GetStringBundle();
  NS_ENSURE_SUCCESS(rv, rv);

  AutoTArray<nsString, 1> formatStrings;
  CopyUTF8toUTF16(userName, *formatStrings.AppendElement());

  nsString passwordTitle;
  rv = m_stringBundle->FormatStringFromName(
      "imapEnterPasswordPromptTitleWithUsername", formatStrings, passwordTitle);
  NS_ENSURE_SUCCESS(rv, rv);

  AutoTArray<nsString, 2> formatStrings2;
  CopyUTF8toUTF16(userName, *formatStrings2.AppendElement());
  CopyUTF8toUTF16(hostName, *formatStrings2.AppendElement());

  nsString passwordText;
  rv = m_stringBundle->FormatStringFromName("imapEnterServerPasswordPrompt",
                                            formatStrings2, passwordText);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = GetPasswordWithUI(passwordText, passwordTitle, aPassword);
  if (NS_SUCCEEDED(rv)) m_password = aPassword;
  return rv;
}

// for the nsIImapServerSink interface
NS_IMETHODIMP nsImapIncomingServer::SetCapability(
    eIMAPCapabilityFlags capability) {
  m_capability = capability;
  SetIsGMailServer((capability & kGmailImapCapability) != 0);
  return NS_OK;
}

NS_IMETHODIMP
nsImapIncomingServer::GetCapability(eIMAPCapabilityFlags* capability) {
  NS_ENSURE_ARG_POINTER(capability);
  *capability = m_capability;
  return NS_OK;
}

NS_IMETHODIMP nsImapIncomingServer::SetServerID(const nsACString& aServerID) {
  return SetServerIDPref(aServerID);
}

NS_IMETHODIMP nsImapIncomingServer::CommitNamespaces() {
  nsresult rv;
  nsCOMPtr<nsIImapHostSessionList> hostSession =
      do_GetService("@mozilla.org/messenger/imaphostsessionlist;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);
  return hostSession->CommitNamespacesForHost(this);
}

NS_IMETHODIMP nsImapIncomingServer::PseudoInterruptMsgLoad(
    nsIMsgFolder* aImapFolder, nsIMsgWindow* aMsgWindow, bool* interrupted) {
  nsresult rv = NS_OK;
  nsCOMPtr<nsIImapProtocol> connection;
  PR_CEnterMonitor(this);
  // iterate through the connection cache for a connection that is loading
  // a message in this folder and should be pseudo-interrupted.
  int32_t cnt = m_connectionCache.Count();

  for (int32_t i = 0; i < cnt; ++i) {
    connection = m_connectionCache[i];
    if (connection)
      rv = connection->PseudoInterruptMsgLoad(aImapFolder, aMsgWindow,
                                              interrupted);
  }

  PR_CExitMonitor(this);
  return rv;
}

NS_IMETHODIMP nsImapIncomingServer::ResetNamespaceReferences() {
  nsCOMPtr<nsIMsgFolder> rootFolder;
  nsresult rv = GetRootFolder(getter_AddRefs(rootFolder));
  if (NS_SUCCEEDED(rv) && rootFolder) {
    nsCOMPtr<nsIMsgImapMailFolder> imapFolder = do_QueryInterface(rootFolder);
    if (imapFolder) rv = imapFolder->ResetNamespaceReferences();
  }
  return rv;
}

NS_IMETHODIMP nsImapIncomingServer::SetUserAuthenticated(
    bool aUserAuthenticated) {
  m_userAuthenticated = aUserAuthenticated;
  if (aUserAuthenticated) {
    nsCOMPtr<nsIMsgAccountManager> accountManager =
        mozilla::components::AccountManager::Service();
    accountManager->SetUserNeedsToAuthenticate(false);
  }
  return NS_OK;
}

NS_IMETHODIMP nsImapIncomingServer::GetUserAuthenticated(
    bool* aUserAuthenticated) {
  NS_ENSURE_ARG_POINTER(aUserAuthenticated);
  *aUserAuthenticated = m_userAuthenticated;
  return NS_OK;
}

/* void SetMailServerUrls (in string manageMailAccount, in string manageLists,
 * in string manageFilters); */
NS_IMETHODIMP nsImapIncomingServer::SetMailServerUrls(
    const nsACString& manageMailAccount, const nsACString& manageLists,
    const nsACString& manageFilters) {
  return SetManageMailAccountUrl(manageMailAccount);
}

NS_IMETHODIMP nsImapIncomingServer::SetManageMailAccountUrl(
    const nsACString& manageMailAccountUrl) {
  m_manageMailAccountUrl = manageMailAccountUrl;
  return NS_OK;
}

NS_IMETHODIMP nsImapIncomingServer::GetManageMailAccountUrl(
    nsACString& manageMailAccountUrl) {
  manageMailAccountUrl = m_manageMailAccountUrl;
  return NS_OK;
}

NS_IMETHODIMP
nsImapIncomingServer::StartPopulatingWithUri(nsIMsgWindow* aMsgWindow,
                                             bool aForceToServer /*ignored*/,
                                             const nsACString& uri) {
  nsresult rv;
  mDoingSubscribeDialog = true;

  rv = EnsureInner();
  NS_ENSURE_SUCCESS(rv, rv);
  rv = mInner->StartPopulatingWithUri(aMsgWindow, aForceToServer, uri);
  NS_ENSURE_SUCCESS(rv, rv);

  // imap always uses the canonical delimiter form of paths for subscribe ui.
  rv = SetDelimiter('/');
  NS_ENSURE_SUCCESS(rv, rv);

  rv = SetShowFullName(false);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCString serverUri;
  rv = GetServerURI(serverUri);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIImapService> imapService = mozilla::components::Imap::Service();
  // If uri = imap://user@host/foo/bar, the serverUri is imap://user@host
  // to get path from uri, skip over imap://user@host + 1 (for the /).
  return imapService->GetListOfFoldersWithPath(
      this, aMsgWindow, Substring(uri, serverUri.Length() + 1));
}

NS_IMETHODIMP
nsImapIncomingServer::StartPopulating(nsIMsgWindow* aMsgWindow,
                                      bool aForceToServer /*ignored*/,
                                      bool aGetOnlyNew) {
  nsresult rv;
  mDoingSubscribeDialog = true;

  rv = EnsureInner();
  NS_ENSURE_SUCCESS(rv, rv);
  rv = mInner->StartPopulating(aMsgWindow, aForceToServer, aGetOnlyNew);
  NS_ENSURE_SUCCESS(rv, rv);

  // imap always uses the canonical delimiter form of paths for subscribe ui.
  rv = SetDelimiter('/');
  NS_ENSURE_SUCCESS(rv, rv);

  rv = SetShowFullName(false);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIImapService> imapService = mozilla::components::Imap::Service();
  return imapService->GetListOfFoldersOnServer(this, aMsgWindow);
}

NS_IMETHODIMP
nsImapIncomingServer::OnStartRunningUrl(nsIURI* url) { return NS_OK; }

NS_IMETHODIMP
nsImapIncomingServer::OnStopRunningUrl(nsIURI* url, nsresult exitCode) {
  nsresult rv = exitCode;

  // xxx todo get msgWindow from url
  nsCOMPtr<nsIMsgWindow> msgWindow;
  nsCOMPtr<nsIImapUrl> imapUrl = do_QueryInterface(url);
  if (imapUrl) {
    nsImapAction imapAction = nsIImapUrl::nsImapTest;
    imapUrl->GetImapAction(&imapAction);
    switch (imapAction) {
      case nsIImapUrl::nsImapDiscoverAllAndSubscribedBoxesUrl:
      case nsIImapUrl::nsImapDiscoverChildrenUrl:
        rv = UpdateSubscribed();
        NS_ENSURE_SUCCESS(rv, rv);
        mDoingSubscribeDialog = false;
        rv = StopPopulating(msgWindow);
        NS_ENSURE_SUCCESS(rv, rv);
        break;
      case nsIImapUrl::nsImapDiscoverAllBoxesUrl:
        if (NS_SUCCEEDED(exitCode)) DiscoveryDone();
        break;
      case nsIImapUrl::nsImapSelectFolder:
      case nsIImapUrl::nsImapFolderStatus: {
        // These occur after doing GetNewMessagesForNonInboxFolders().
        nsCOMPtr<nsIMsgFolder> msgFolder;
        nsCOMPtr<nsIMsgMailNewsUrl> mailUrl = do_QueryInterface(imapUrl);
        mailUrl->GetFolder(getter_AddRefs(msgFolder));
        if (msgFolder) {
          // These URLs caused the folder DB to be opened, so close it.
          // Note: If folder is in view in window or tab, closing the db seems
          // to causes no problem.
          msgFolder->SetMsgDatabase(nullptr);
          if (imapAction == nsIImapUrl::nsImapSelectFolder) break;
          // Below here, only do for folderstatus URL.
          nsCOMPtr<nsIMsgImapMailFolder> imapFolder =
              do_QueryInterface(msgFolder);
          m_foldersToStat.RemoveObject(imapFolder);
        }
        // If we get an error running the url, it's better not to run the
        // remaining URLs in the chain.
        if (NS_FAILED(exitCode) && exitCode != NS_MSG_ERROR_IMAP_COMMAND_FAILED)
          m_foldersToStat.Clear();
        if (m_foldersToStat.Count() > 0) {
          m_foldersToStat[0]->UpdateStatus(this, nullptr);
        }
        break;
      }
      default:
        break;
    }
  }
  return NS_OK;
}

NS_IMETHODIMP
nsImapIncomingServer::SetIncomingServer(nsIMsgIncomingServer* aServer) {
  nsresult rv = EnsureInner();
  NS_ENSURE_SUCCESS(rv, rv);
  return mInner->SetIncomingServer(aServer);
}

NS_IMETHODIMP
nsImapIncomingServer::SetShowFullName(bool showFullName) {
  nsresult rv = EnsureInner();
  NS_ENSURE_SUCCESS(rv, rv);
  return mInner->SetShowFullName(showFullName);
}

NS_IMETHODIMP
nsImapIncomingServer::GetDelimiter(char* aDelimiter) {
  nsresult rv = EnsureInner();
  NS_ENSURE_SUCCESS(rv, rv);
  return mInner->GetDelimiter(aDelimiter);
}

NS_IMETHODIMP
nsImapIncomingServer::SetDelimiter(char aDelimiter) {
  nsresult rv = EnsureInner();
  NS_ENSURE_SUCCESS(rv, rv);
  return mInner->SetDelimiter(aDelimiter);
}

NS_IMETHODIMP
nsImapIncomingServer::SetAsSubscribed(const nsACString& path) {
  nsresult rv = EnsureInner();
  NS_ENSURE_SUCCESS(rv, rv);
  return mInner->SetAsSubscribed(path);
}

NS_IMETHODIMP
nsImapIncomingServer::UpdateSubscribed() { return NS_OK; }

NS_IMETHODIMP
nsImapIncomingServer::AddTo(const nsACString& aName, bool addAsSubscribed,
                            bool aSubscribable, bool changeIfExists) {
  nsresult rv = EnsureInner();
  NS_ENSURE_SUCCESS(rv, rv);

  // RFC 3501 allows UTF-8 in addition to MUTF-7.
  // If it's not UTF-8, it's not 7bit-ASCII and cannot be MUTF-7 either.
  // We just ignore it.
  if (!mozilla::IsUtf8(aName)) return NS_OK;
  // Now handle subscription folder names as UTF-8 so don't convert to MUTF-7.
  return mInner->AddTo(aName, addAsSubscribed, aSubscribable, changeIfExists);
}

NS_IMETHODIMP
nsImapIncomingServer::StopPopulating(nsIMsgWindow* aMsgWindow) {
  nsresult rv = EnsureInner();
  NS_ENSURE_SUCCESS(rv, rv);
  return mInner->StopPopulating(aMsgWindow);
}

NS_IMETHODIMP
nsImapIncomingServer::SubscribeCleanup() {
  m_subscribeFolders.Clear();
  return ClearInner();
}

NS_IMETHODIMP
nsImapIncomingServer::SetSubscribeListener(nsISubscribeListener* aListener) {
  nsresult rv = EnsureInner();
  NS_ENSURE_SUCCESS(rv, rv);
  return mInner->SetSubscribeListener(aListener);
}

NS_IMETHODIMP
nsImapIncomingServer::GetSubscribeListener(nsISubscribeListener** aListener) {
  nsresult rv = EnsureInner();
  NS_ENSURE_SUCCESS(rv, rv);
  return mInner->GetSubscribeListener(aListener);
}

NS_IMETHODIMP
nsImapIncomingServer::Subscribe(const nsACString& aName) {
  return SubscribeToFolder(aName, true, nullptr);
}

NS_IMETHODIMP
nsImapIncomingServer::Unsubscribe(const nsACString& aName) {
  return SubscribeToFolder(aName, false, nullptr);
}

NS_IMETHODIMP
nsImapIncomingServer::SubscribeToFolder(const nsACString& aName, bool subscribe,
                                        nsIURI** aUri) {
  nsresult rv;
  nsCOMPtr<nsIImapService> imapService = mozilla::components::Imap::Service();
  nsCOMPtr<nsIMsgFolder> rootMsgFolder;
  rv = GetRootFolder(getter_AddRefs(rootMsgFolder));
  NS_ENSURE_SUCCESS(rv, rv);

  // Locate the folder so that the correct hierarchical delimiter is used in the
  // folder pathnames, otherwise root's (ie, '^') is used and this is wrong.

  // aName is not a genuine UTF-16 but just a zero-padded MUTF-7.
  nsCOMPtr<nsIMsgFolder> msgFolder;
  if (rootMsgFolder && !aName.IsEmpty())
    rv = rootMsgFolder->FindSubFolder(aName, getter_AddRefs(msgFolder));

  nsCOMPtr<nsIThread> thread(do_GetCurrentThread());

  if (subscribe)
    rv = imapService->SubscribeFolder(msgFolder, aName, nullptr, aUri);
  else
    rv = imapService->UnsubscribeFolder(msgFolder, aName, nullptr, nullptr);

  return rv;
}

NS_IMETHODIMP
nsImapIncomingServer::SetDoingLsub(bool doingLsub) {
  mDoingLsub = doingLsub;
  return NS_OK;
}

NS_IMETHODIMP
nsImapIncomingServer::GetDoingLsub(bool* doingLsub) {
  NS_ENSURE_ARG_POINTER(doingLsub);
  *doingLsub = mDoingLsub;
  return NS_OK;
}

NS_IMETHODIMP
nsImapIncomingServer::SetUtf8AcceptEnabled(bool enabled) {
  mUtf8AcceptEnabled = enabled;
  return NS_OK;
}

NS_IMETHODIMP
nsImapIncomingServer::GetUtf8AcceptEnabled(bool* enabled) {
  NS_ENSURE_ARG_POINTER(enabled);
  *enabled = mUtf8AcceptEnabled;
  return NS_OK;
}

NS_IMETHODIMP
nsImapIncomingServer::ReDiscoverAllFolders() { return PerformExpand(nullptr); }

NS_IMETHODIMP
nsImapIncomingServer::SetState(const nsACString& path, bool state,
                               bool* stateChanged) {
  nsresult rv = EnsureInner();
  NS_ENSURE_SUCCESS(rv, rv);
  return mInner->SetState(path, state, stateChanged);
}

NS_IMETHODIMP
nsImapIncomingServer::HasChildren(const nsACString& path, bool* aHasChildren) {
  nsresult rv = EnsureInner();
  NS_ENSURE_SUCCESS(rv, rv);
  return mInner->HasChildren(path, aHasChildren);
}

NS_IMETHODIMP
nsImapIncomingServer::IsSubscribed(const nsACString& path,
                                   bool* aIsSubscribed) {
  nsresult rv = EnsureInner();
  NS_ENSURE_SUCCESS(rv, rv);
  return mInner->IsSubscribed(path, aIsSubscribed);
}

NS_IMETHODIMP
nsImapIncomingServer::IsSubscribable(const nsACString& path,
                                     bool* aIsSubscribable) {
  nsresult rv = EnsureInner();
  NS_ENSURE_SUCCESS(rv, rv);
  return mInner->IsSubscribable(path, aIsSubscribable);
}

NS_IMETHODIMP
nsImapIncomingServer::GetLeafName(const nsACString& path,
                                  nsAString& aLeafName) {
  nsresult rv = EnsureInner();
  NS_ENSURE_SUCCESS(rv, rv);
  return mInner->GetLeafName(path, aLeafName);
}

NS_IMETHODIMP
nsImapIncomingServer::GetFirstChildURI(const nsACString& path,
                                       nsACString& aResult) {
  nsresult rv = EnsureInner();
  NS_ENSURE_SUCCESS(rv, rv);
  return mInner->GetFirstChildURI(path, aResult);
}

NS_IMETHODIMP
nsImapIncomingServer::GetChildURIs(const nsACString& aPath,
                                   nsTArray<nsCString>& aResult) {
  nsresult rv = EnsureInner();
  NS_ENSURE_SUCCESS(rv, rv);
  return mInner->GetChildURIs(aPath, aResult);
}

nsresult nsImapIncomingServer::EnsureInner() {
  nsresult rv = NS_OK;

  if (mInner) return NS_OK;

  mInner =
      do_CreateInstance("@mozilla.org/messenger/subscribableserver;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);
  return SetIncomingServer(this);
}

nsresult nsImapIncomingServer::ClearInner() {
  nsresult rv = NS_OK;
  if (mInner) {
    rv = mInner->SetSubscribeListener(nullptr);
    NS_ENSURE_SUCCESS(rv, rv);
    rv = mInner->SetIncomingServer(nullptr);
    NS_ENSURE_SUCCESS(rv, rv);
    mInner = nullptr;
  }
  return NS_OK;
}

NS_IMETHODIMP
nsImapIncomingServer::CommitSubscribeChanges() {
  return ReDiscoverAllFolders();
}

NS_IMETHODIMP
nsImapIncomingServer::GetCanBeDefaultServer(bool* canBeDefaultServer) {
  NS_ENSURE_ARG_POINTER(canBeDefaultServer);
  *canBeDefaultServer = true;
  return NS_OK;
}

NS_IMETHODIMP
nsImapIncomingServer::GetCanSearchMessages(bool* canSearchMessages) {
  NS_ENSURE_ARG_POINTER(canSearchMessages);
  // Initialize canSearchMessages true, a default value for IMAP
  *canSearchMessages = true;
  GetPrefForServerAttribute("canSearchMessages", canSearchMessages);
  return NS_OK;
}

nsresult nsImapIncomingServer::CreateHostSpecificPrefName(
    const char* prefPrefix, nsAutoCString& prefName) {
  NS_ENSURE_ARG_POINTER(prefPrefix);

  nsCString hostName;
  nsresult rv = GetHostName(hostName);
  NS_ENSURE_SUCCESS(rv, rv);

  prefName = prefPrefix;
  prefName.Append('.');
  prefName.Append(hostName);
  return NS_OK;
}

NS_IMETHODIMP
nsImapIncomingServer::GetSupportsDiskSpace(bool* aSupportsDiskSpace) {
  NS_ENSURE_ARG_POINTER(aSupportsDiskSpace);
  nsAutoCString prefName;
  nsresult rv =
      CreateHostSpecificPrefName("default_supports_diskspace", prefName);
  NS_ENSURE_SUCCESS(rv, rv);

  *aSupportsDiskSpace = true;
  Preferences::GetBool(prefName.get(), aSupportsDiskSpace);

  return NS_OK;
}

// Check whether all connections in the cache are idle.
NS_IMETHODIMP
nsImapIncomingServer::GetAllConnectionsIdle(bool* aAllIdle) {
  NS_ENSURE_ARG_POINTER(aAllIdle);
  *aAllIdle = true;

  nsresult rv;
  bool isBusy;
  bool isInboxConnection;

  PR_CEnterMonitor(this);
  for (nsCOMPtr<nsIImapProtocol> connection : m_connectionCache) {
    rv = connection->IsBusy(&isBusy, &isInboxConnection);
    if (NS_FAILED(rv) || isBusy) {
      *aAllIdle = false;
      break;
    }
  }
  PR_CExitMonitor(this);

  return NS_OK;
}

/**
 * Get the preference that tells us whether the imap server in question allows
 * us to create subfolders. Some ISPs might not want users to create any folders
 * besides the existing ones.
 * We do want to identify all those servers that don't allow creation of
 * subfolders and take them out of the account picker in the Copies and Folder
 * panel.
 */
NS_IMETHODIMP
nsImapIncomingServer::GetCanCreateFoldersOnServer(
    bool* aCanCreateFoldersOnServer) {
  NS_ENSURE_ARG_POINTER(aCanCreateFoldersOnServer);
  // Initialize aCanCreateFoldersOnServer true, a default value for IMAP
  *aCanCreateFoldersOnServer = true;
  GetPrefForServerAttribute("canCreateFolders", aCanCreateFoldersOnServer);
  return NS_OK;
}

NS_IMETHODIMP
nsImapIncomingServer::GetOfflineSupportLevel(int32_t* aSupportLevel) {
  NS_ENSURE_ARG_POINTER(aSupportLevel);
  nsresult rv = NS_OK;

  rv = GetIntValue("offline_support_level", aSupportLevel);
  if (*aSupportLevel != OFFLINE_SUPPORT_LEVEL_UNDEFINED) return rv;

  nsAutoCString prefName;
  rv = CreateHostSpecificPrefName("default_offline_support_level", prefName);
  NS_ENSURE_SUCCESS(rv, rv);

  *aSupportLevel =
      Preferences::GetInt(prefName.get(), OFFLINE_SUPPORT_LEVEL_REGULAR);

  return NS_OK;
}

nsresult nsImapIncomingServer::GetFormattedStringFromName(
    const nsAString& aValue, const char* aName, nsAString& aResult) {
  nsresult rv = GetStringBundle();
  if (m_stringBundle) {
    nsString tmpVal(aValue);
    AutoTArray<nsString, 1> formatStrings = {tmpVal};

    nsString result;
    rv = m_stringBundle->FormatStringFromName(aName, formatStrings, result);
    aResult.Assign(result);
  }
  return rv;
}

nsresult nsImapIncomingServer::GetPrefForServerAttribute(const char* prefSuffix,
                                                         bool* prefValue) {
  // Any caller of this function must initialize prefValue with a default value
  // as this code will not set prefValue when the pref does not exist and return
  // NS_OK anyway

  if (!mPrefBranch) return NS_ERROR_NOT_INITIALIZED;

  NS_ENSURE_ARG_POINTER(prefValue);

  if (NS_FAILED(mPrefBranch->GetBoolPref(prefSuffix, prefValue)))
    mDefPrefBranch->GetBoolPref(prefSuffix, prefValue);

  return NS_OK;
}

NS_IMETHODIMP
nsImapIncomingServer::GetCanFileMessagesOnServer(
    bool* aCanFileMessagesOnServer) {
  NS_ENSURE_ARG_POINTER(aCanFileMessagesOnServer);
  // Initialize aCanFileMessagesOnServer true, a default value for IMAP
  *aCanFileMessagesOnServer = true;
  GetPrefForServerAttribute("canFileMessages", aCanFileMessagesOnServer);
  return NS_OK;
}

NS_IMETHODIMP
nsImapIncomingServer::SetSearchValue(const nsAString& searchValue) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP
nsImapIncomingServer::GetSupportsSubscribeSearch(bool* retVal) {
  NS_ENSURE_ARG_POINTER(retVal);
  *retVal = false;
  return NS_OK;
}

NS_IMETHODIMP
nsImapIncomingServer::GetFolderView(nsITreeView** aView) {
  nsresult rv = EnsureInner();
  NS_ENSURE_SUCCESS(rv, rv);
  return mInner->GetFolderView(aView);
}

NS_IMETHODIMP
nsImapIncomingServer::GetFilterScope(nsMsgSearchScopeValue* filterScope) {
  NS_ENSURE_ARG_POINTER(filterScope);
  // If the inbox is enabled for offline use, then use the offline filter
  // scope, else use the online filter scope.
  //
  // XXX We use the same scope for all folders with the same incoming server,
  // yet it is possible to set the offline flag separately for each folder.
  // Manual filters could perhaps check the offline status of each folder,
  // though it's hard to see how to make that work since we only store filters
  // per server.
  //
  nsCOMPtr<nsIMsgFolder> rootMsgFolder;
  nsresult rv = GetRootMsgFolder(getter_AddRefs(rootMsgFolder));
  NS_ENSURE_SUCCESS(rv, rv);
  nsCOMPtr<nsIMsgFolder> offlineInboxMsgFolder;
  rv = rootMsgFolder->GetFolderWithFlags(
      nsMsgFolderFlags::Inbox | nsMsgFolderFlags::Offline,
      getter_AddRefs(offlineInboxMsgFolder));

  *filterScope = offlineInboxMsgFolder ? nsMsgSearchScope::offlineMailFilter
                                       : nsMsgSearchScope::onlineMailFilter;
  return NS_OK;
}

NS_IMETHODIMP
nsImapIncomingServer::GetSearchScope(nsMsgSearchScopeValue* searchScope) {
  NS_ENSURE_ARG_POINTER(searchScope);
  *searchScope = WeAreOffline() ? nsMsgSearchScope::offlineMail
                                : nsMsgSearchScope::onlineMail;
  return NS_OK;
}

// This is a recursive function with initial call for the root folder (root
// never has messages). It calls itself recursively for all message folders and
// checks for new messages for every non-special folder if forceAllFolders is
// true or just folders with ::CheckNew flag set if forceAllFolders is false.
// Note: forceAllFolders is based on pref
// mail.server.default.check_all_folders_for_new or on "legacy" pref
// mail.check_all_imap_folders_for_new. These prefs default to false.
NS_IMETHODIMP
nsImapIncomingServer::GetNewMessagesForNonInboxFolders(nsIMsgFolder* aFolder,
                                                       nsIMsgWindow* aWindow,
                                                       bool forceAllFolders,
                                                       bool performingBiff) {
  NS_ENSURE_ARG_POINTER(aFolder);
  static bool gGotStatusPref = false;
  static bool gUseStatus = false;

  bool isRootFolder;
  (void)aFolder->GetIsServer(&isRootFolder);
  // Check this folder for new messages if it is marked to be checked
  // or if we are forced to check all folders
  uint32_t flags = 0;
  aFolder->GetFlags(&flags);
  nsresult rv;
  nsCOMPtr<nsIMsgImapMailFolder> imapFolder = do_QueryInterface(aFolder, &rv);
  NS_ENSURE_SUCCESS(rv, rv);
  bool canOpen;
  imapFolder->GetCanOpenFolder(&canOpen);
  if (!isRootFolder && canOpen &&
      ((forceAllFolders &&
        !(flags & (nsMsgFolderFlags::Inbox | nsMsgFolderFlags::Trash |
                   nsMsgFolderFlags::Virtual))) ||
       flags & nsMsgFolderFlags::CheckNew)) {
    // Get new messages for this folder.
    aFolder->SetGettingNewMessages(true);
    if (performingBiff) imapFolder->SetPerformingBiff(true);

    // eventually, the gGotStatusPref should go away, once we work out the kinks
    // from using STATUS.
    if (!gGotStatusPref) {
      Preferences::GetBool("mail.imap.use_status_for_biff", &gUseStatus);
      gGotStatusPref = true;
    }

    if (gUseStatus) {
      if (m_foldersToStat.IndexOf(imapFolder) == -1) {
        // Prepare to do folderstatus URL. If folder not imap SELECTed, this
        // results in imap STATUS sent. If SELECTed, this result in imap NOOP.
        // This just adds the folder to the list (just once) to run the URL
        // sequentially.
        m_foldersToStat.AppendObject(imapFolder);
      }
    } else {
      // This ONLY occurs when use_status_for_biff is false.
      // Do select URL for folder now.
      imapFolder->UpdateFolderWithListener(aWindow, this);
    }
  }

  // Loop through all subfolders to get new messages for them.
  nsTArray<RefPtr<nsIMsgFolder>> subFolders;
  rv = aFolder->GetSubFolders(subFolders);
  NS_ENSURE_SUCCESS(rv, rv);
  for (nsIMsgFolder* msgFolder : subFolders) {
    GetNewMessagesForNonInboxFolders(msgFolder, aWindow, forceAllFolders,
                                     performingBiff);
  }
  if (isRootFolder && m_foldersToStat.Count() > 0) {
    // This occurs only on 1st call (for root folder) when list (which never
    // contains root folder) is not empty. UpdateStatus() for remaining folders
    // occurs sequentially in listener onStopRunningUrl().
    m_foldersToStat[0]->UpdateStatus(this, nullptr);
  }
  return NS_OK;
}

NS_IMETHODIMP
nsImapIncomingServer::GetArbitraryHeaders(nsACString& aResult) {
  nsCOMPtr<nsIMsgFilterList> filterList;
  nsresult rv = GetFilterList(nullptr, getter_AddRefs(filterList));
  NS_ENSURE_SUCCESS(rv, rv);
  return filterList->GetArbitraryHeaders(aResult);
}

NS_IMETHODIMP
nsImapIncomingServer::GetShowAttachmentsInline(bool* aResult) {
  NS_ENSURE_ARG_POINTER(aResult);
  *aResult = true;  // true per default
  Preferences::GetBool("mail.inline_attachments", aResult);
  return NS_OK;  // In case this pref is not set we need to return NS_OK.
}

NS_IMETHODIMP nsImapIncomingServer::SetSocketType(int32_t aSocketType) {
  int32_t oldSocketType;
  nsresult rv = GetSocketType(&oldSocketType);
  if (NS_SUCCEEDED(rv) && oldSocketType != aSocketType)
    CloseCachedConnections();
  return nsMsgIncomingServer::SetSocketType(aSocketType);
}

// use canonical format in originalUri & convertedUri
NS_IMETHODIMP
nsImapIncomingServer::GetUriWithNamespacePrefixIfNecessary(
    int32_t namespaceType, const nsACString& originalUri,
    nsACString& convertedUri) {
  nsresult rv = NS_OK;
  nsAutoCString serverKey;
  rv = GetKey(serverKey);
  NS_ENSURE_SUCCESS(rv, rv);
  nsCOMPtr<nsIImapHostSessionList> hostSessionList =
      do_GetService("@mozilla.org/messenger/imaphostsessionlist;1", &rv);
  nsImapNamespace* ns = nullptr;
  rv = hostSessionList->GetDefaultNamespaceOfTypeForHost(
      serverKey.get(), (EIMAPNamespaceType)namespaceType, ns);
  if (ns) {
    nsAutoCString namespacePrefix(ns->GetPrefix());
    if (!namespacePrefix.IsEmpty()) {
      // check if namespacePrefix is the same as the online directory; if so,
      // ignore it.
      nsAutoCString onlineDir;
      rv = GetServerDirectory(onlineDir);
      NS_ENSURE_SUCCESS(rv, rv);
      if (!onlineDir.IsEmpty()) {
        char delimiter = ns->GetDelimiter();
        if (onlineDir.Last() != delimiter) onlineDir += delimiter;
        if (onlineDir.Equals(namespacePrefix)) return NS_OK;
      }

      namespacePrefix.ReplaceChar(ns->GetDelimiter(),
                                  '/');  // use canonical format
      nsCString uri(originalUri);
      int32_t index = uri.Find("//");        // find scheme
      index = uri.FindChar('/', index + 2);  // find '/' after scheme
      // it may be the case that this is the INBOX uri, in which case
      // we don't want to prepend the namespace. In that case, the uri ends with
      // "INBOX", but the namespace is "INBOX/", so they don't match.
      if (uri.Find(namespacePrefix, index + 1) != index + 1 &&
          !Substring(uri, index + 1).LowerCaseEqualsLiteral("inbox"))
        uri.Insert(namespacePrefix, index + 1);  // insert namespace prefix
      convertedUri = uri;
    }
  }
  return rv;
}

NS_IMETHODIMP nsImapIncomingServer::GetTrashFolderName(nsACString& retval) {
  // Despite its name, this returns a path, for example INBOX/Trash.
  nsresult rv = GetStringValue(PREF_TRASH_FOLDER_PATH, retval);
  if (NS_FAILED(rv)) return rv;
  if (retval.IsEmpty()) retval = nsCString(DEFAULT_TRASH_FOLDER_PATH);
  return NS_OK;
}

NS_IMETHODIMP nsImapIncomingServer::SetTrashFolderName(
    const nsACString& chvalue) {
  // Clear trash flag from the old pref.
  // Despite its name, this returns the trash folder path, for example
  // INBOX/Trash.
  bool useUTF8 = false;
  GetUtf8AcceptEnabled(&useUTF8);
  nsAutoCString oldTrashName;
  nsresult rv = GetTrashFolderName(oldTrashName);
  if (NS_SUCCEEDED(rv)) {
    nsAutoCString oldTrashNameUtf7or8;
    nsCOMPtr<nsIMsgFolder> oldFolder;
    // 'trashFolderName' being a path here works well since this is appended
    // to the server's root folder in GetFolder().
    if (useUTF8) {
      oldTrashNameUtf7or8 = oldTrashName;
    } else {
      CopyUTF16toMUTF7(NS_ConvertUTF8toUTF16(oldTrashName),
                       oldTrashNameUtf7or8);
    }
    rv = GetFolder(oldTrashNameUtf7or8, getter_AddRefs(oldFolder));
    if (NS_SUCCEEDED(rv) && oldFolder)
      oldFolder->ClearFlag(nsMsgFolderFlags::Trash);
  }

  // If the user configured delete mode (model) is currently "move to trash",
  // mark the newly designated trash folder name as the active trash
  // destination folder.
  int32_t deleteModel;
  rv = GetDeleteModel(&deleteModel);
  if (NS_SUCCEEDED(rv) && (deleteModel == nsMsgImapDeleteModels::MoveToTrash)) {
    nsAutoCString newTrashNameUtf7or8;
    if (useUTF8) {
      newTrashNameUtf7or8 = chvalue;
    } else {
      CopyUTF16toMUTF7(NS_ConvertUTF8toUTF16(chvalue), newTrashNameUtf7or8);
    }
    nsCOMPtr<nsIMsgFolder> newTrashFolder;
    rv = GetFolder(newTrashNameUtf7or8, getter_AddRefs(newTrashFolder));
    if (NS_SUCCEEDED(rv) && newTrashFolder) {
      newTrashFolder->SetFlag(nsMsgFolderFlags::Trash);
    }
  }

  return SetStringValue(PREF_TRASH_FOLDER_PATH, chvalue);
}

NS_IMETHODIMP
nsImapIncomingServer::GetMsgFolderFromURI(nsIMsgFolder* aFolderResource,
                                          const nsACString& aURI,
                                          nsIMsgFolder** aFolder) {
  nsCOMPtr<nsIMsgFolder> msgFolder;
  bool namespacePrefixAdded = false;
  nsCString folderUriWithNamespace;

  // clang-format off
  // Check if the folder exists as is...
  nsresult rv = GetExistingMsgFolder(aURI, folderUriWithNamespace,
                                     namespacePrefixAdded, false,
                                     getter_AddRefs(msgFolder));

  // Or try again with a case-insensitive lookup
  if (NS_FAILED(rv) || !msgFolder)
    rv = GetExistingMsgFolder(aURI, folderUriWithNamespace,
                              namespacePrefixAdded, true,
                              getter_AddRefs(msgFolder));
  // clang-format on

  if (NS_FAILED(rv) || !msgFolder) {
    // we didn't find the folder so we will have to create a new one.
    if (namespacePrefixAdded) {
      nsCOMPtr<nsIMsgFolder> folder;
      rv = GetOrCreateFolder(folderUriWithNamespace, getter_AddRefs(folder));
      NS_ENSURE_SUCCESS(rv, rv);
      msgFolder = folder;
    } else {
      msgFolder = aFolderResource;
    }
  }

  msgFolder.forget(aFolder);
  return NS_OK;
}

nsresult nsImapIncomingServer::GetExistingMsgFolder(
    const nsACString& aURI, nsACString& aFolderUriWithNamespace,
    bool& aNamespacePrefixAdded, bool aCaseInsensitive,
    nsIMsgFolder** aFolder) {
  nsCOMPtr<nsIMsgFolder> rootMsgFolder;
  nsresult rv = GetRootMsgFolder(getter_AddRefs(rootMsgFolder));
  NS_ENSURE_SUCCESS(rv, rv);

  aNamespacePrefixAdded = false;
  // Check if the folder exists as is...Even if we have a personal namespace,
  // it might be in another namespace (e.g., shared) and this will catch that.
  rv = rootMsgFolder->GetChildWithURI(aURI, true, aCaseInsensitive, aFolder);

  // If we couldn't find the folder as is, check if we need to prepend the
  // personal namespace
  if (!*aFolder) {
    GetUriWithNamespacePrefixIfNecessary(kPersonalNamespace, aURI,
                                         aFolderUriWithNamespace);
    if (!aFolderUriWithNamespace.IsEmpty()) {
      aNamespacePrefixAdded = true;
      rv = rootMsgFolder->GetChildWithURI(aFolderUriWithNamespace, true,
                                          aCaseInsensitive, aFolder);
    }
  }
  return rv;
}

NS_IMETHODIMP
nsImapIncomingServer::CramMD5Hash(const char* decodedChallenge, const char* key,
                                  char** result) {
  NS_ENSURE_ARG_POINTER(decodedChallenge);
  NS_ENSURE_ARG_POINTER(key);

  unsigned char resultDigest[DIGEST_LENGTH];
  nsresult rv = MSGCramMD5(decodedChallenge, strlen(decodedChallenge), key,
                           strlen(key), resultDigest);
  NS_ENSURE_SUCCESS(rv, rv);
  *result = (char*)malloc(DIGEST_LENGTH);
  if (*result) memcpy(*result, resultDigest, DIGEST_LENGTH);
  return (*result) ? NS_OK : NS_ERROR_OUT_OF_MEMORY;
}

NS_IMETHODIMP
nsImapIncomingServer::GetLoginUsername(nsACString& aLoginUsername) {
  return GetUsername(aLoginUsername);
}

NS_IMETHODIMP
nsImapIncomingServer::GetOriginalUsername(nsACString& aUsername) {
  return GetUsername(aUsername);
}

NS_IMETHODIMP
nsImapIncomingServer::GetServerKey(nsACString& aServerKey) {
  return GetKey(aServerKey);
}

NS_IMETHODIMP
nsImapIncomingServer::GetServerPassword(nsAString& aPassword) {
  return GetPassword(aPassword);
}

NS_IMETHODIMP
nsImapIncomingServer::RemoveServerConnection(nsIImapProtocol* aProtocol) {
  return RemoveConnection(aProtocol);
}

NS_IMETHODIMP
nsImapIncomingServer::GetServerShuttingDown(bool* aShuttingDown) {
  return GetShuttingDown(aShuttingDown);
}

NS_IMETHODIMP
nsImapIncomingServer::ResetServerConnection(const nsACString& aFolderName) {
  return ResetConnection(aFolderName);
}

NS_IMETHODIMP
nsImapIncomingServer::SetServerDoingLsub(bool aDoingLsub) {
  return SetDoingLsub(aDoingLsub);
}

NS_IMETHODIMP
nsImapIncomingServer::SetServerUtf8AcceptEnabled(bool enabled) {
  return SetUtf8AcceptEnabled(enabled);
}

// Run a callback under the protection of the Logon lock.
NS_IMETHODIMP
nsImapIncomingServer::RunLogonExclusive(nsIRunnable* callback) {
  mozilla::MonitorAutoLock lock(mLogonMonitor);
  return callback->Run();
}
