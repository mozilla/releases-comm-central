/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsImapHostSessionList.h"
#include "nsImapNamespace.h"
#include "nsIImapIncomingServer.h"
#include "nsCOMPtr.h"
#include "nsIMsgIncomingServer.h"
#include "nsIObserverService.h"
#include "mozilla/Services.h"
#include "nsString.h"
#include "plstr.h"

nsIMAPHostInfo::nsIMAPHostInfo(const char* serverKey,
                               nsIImapIncomingServer* server) {
  fServerKey = serverKey;
  NS_ASSERTION(server, "*** Fatal null imap incoming server...");
  server->GetServerDirectory(fOnlineDir);
  fNextHost = NULL;
  fCapabilityFlags = kCapabilityUndefined;
  fHierarchyDelimiters = NULL;
#ifdef DEBUG_bienvenu1
  fHaveWeEverDiscoveredFolders =
      true;  // try this, see what bad happens - we'll need to
             // figure out a way to make new accounts have it be false
#else
  fHaveWeEverDiscoveredFolders = false;  // try this, see what bad happens
#endif
  fDiscoveryForHostInProgress = false;
  fCanonicalOnlineSubDir = NULL;
  fNamespaceList = nsImapNamespaceList::CreatensImapNamespaceList();
  fUsingSubscription = true;
  server->GetUsingSubscription(&fUsingSubscription);
  fOnlineTrashFolderExists = false;
  fShouldAlwaysListInbox = true;
  fPasswordVerifiedOnline = false;
  fDeleteIsMoveToTrash = true;
  fShowDeletedMessages = false;
  fGotNamespaces = false;
  fHaveAdminURL = false;
  fNamespacesOverridable = true;
  server->GetOverrideNamespaces(&fNamespacesOverridable);
  fTempNamespaceList = nsImapNamespaceList::CreatensImapNamespaceList();
}

nsIMAPHostInfo::~nsIMAPHostInfo() {
  PR_Free(fHierarchyDelimiters);
  delete fNamespaceList;
  delete fTempNamespaceList;
}

NS_IMPL_ISUPPORTS(nsImapHostSessionList, nsIImapHostSessionList, nsIObserver,
                  nsISupportsWeakReference)

nsImapHostSessionList::nsImapHostSessionList() {
  gCachedHostInfoMonitor = PR_NewMonitor(/* "accessing-hostlist-monitor"*/);
  fHostInfoList = nullptr;
}

nsImapHostSessionList::~nsImapHostSessionList() {
  ResetAll();
  PR_DestroyMonitor(gCachedHostInfoMonitor);
}

nsresult nsImapHostSessionList::Init() {
  nsCOMPtr<nsIObserverService> observerService =
      mozilla::services::GetObserverService();
  NS_ENSURE_TRUE(observerService, NS_ERROR_UNEXPECTED);
  observerService->AddObserver(this, "profile-before-change", true);
  observerService->AddObserver(this, NS_XPCOM_SHUTDOWN_OBSERVER_ID, true);
  return NS_OK;
}

NS_IMETHODIMP nsImapHostSessionList::Observe(nsISupports* aSubject,
                                             const char* aTopic,
                                             const char16_t* someData) {
  if (!strcmp(aTopic, "profile-before-change"))
    ResetAll();
  else if (!strcmp(aTopic, NS_XPCOM_SHUTDOWN_OBSERVER_ID)) {
    nsCOMPtr<nsIObserverService> observerService =
        mozilla::services::GetObserverService();
    NS_ENSURE_TRUE(observerService, NS_ERROR_UNEXPECTED);
    observerService->RemoveObserver(this, NS_XPCOM_SHUTDOWN_OBSERVER_ID);
    observerService->RemoveObserver(this, "profile-before-change");
  }
  return NS_OK;
}

nsIMAPHostInfo* nsImapHostSessionList::FindHost(const char* serverKey) {
  nsIMAPHostInfo* host;

  // ### should also check userName here, if NON NULL
  for (host = fHostInfoList; host; host = host->fNextHost) {
    if (host->fServerKey.Equals(serverKey, nsCaseInsensitiveCStringComparator))
      return host;
  }
  return host;
}

// reset any cached connection info - delete the lot of 'em
NS_IMETHODIMP nsImapHostSessionList::ResetAll() {
  PR_EnterMonitor(gCachedHostInfoMonitor);
  nsIMAPHostInfo* nextHost = NULL;
  for (nsIMAPHostInfo* host = fHostInfoList; host; host = nextHost) {
    nextHost = host->fNextHost;
    delete host;
  }
  fHostInfoList = NULL;
  PR_ExitMonitor(gCachedHostInfoMonitor);
  return NS_OK;
}

NS_IMETHODIMP
nsImapHostSessionList::AddHostToList(const char* serverKey,
                                     nsIImapIncomingServer* server) {
  nsIMAPHostInfo* newHost = NULL;
  PR_EnterMonitor(gCachedHostInfoMonitor);
  if (!FindHost(serverKey)) {
    // stick it on the front
    newHost = new nsIMAPHostInfo(serverKey, server);
    if (newHost) {
      newHost->fNextHost = fHostInfoList;
      fHostInfoList = newHost;
    }
  }
  PR_ExitMonitor(gCachedHostInfoMonitor);
  return (newHost == NULL) ? NS_ERROR_ILLEGAL_VALUE : NS_OK;
}

NS_IMETHODIMP nsImapHostSessionList::GetPasswordForHost(const char* serverKey,
                                                        nsString& result) {
  PR_EnterMonitor(gCachedHostInfoMonitor);
  nsIMAPHostInfo* host = FindHost(serverKey);
  if (host) result = host->fCachedPassword;
  PR_ExitMonitor(gCachedHostInfoMonitor);
  return (host == NULL) ? NS_ERROR_ILLEGAL_VALUE : NS_OK;
}

NS_IMETHODIMP nsImapHostSessionList::SetPasswordForHost(
    const char* serverKey, const nsAString& password) {
  PR_EnterMonitor(gCachedHostInfoMonitor);
  nsIMAPHostInfo* host = FindHost(serverKey);
  if (host) host->fCachedPassword = password;
  PR_ExitMonitor(gCachedHostInfoMonitor);
  return (host == NULL) ? NS_ERROR_ILLEGAL_VALUE : NS_OK;
}

NS_IMETHODIMP nsImapHostSessionList::SetPasswordVerifiedOnline(
    const char* serverKey) {
  PR_EnterMonitor(gCachedHostInfoMonitor);
  nsIMAPHostInfo* host = FindHost(serverKey);
  if (host) host->fPasswordVerifiedOnline = true;
  PR_ExitMonitor(gCachedHostInfoMonitor);
  return (host == NULL) ? NS_ERROR_ILLEGAL_VALUE : NS_OK;
}

NS_IMETHODIMP nsImapHostSessionList::GetPasswordVerifiedOnline(
    const char* serverKey, bool& result) {
  PR_EnterMonitor(gCachedHostInfoMonitor);
  nsIMAPHostInfo* host = FindHost(serverKey);
  if (host) result = host->fPasswordVerifiedOnline;
  PR_ExitMonitor(gCachedHostInfoMonitor);
  return (host == NULL) ? NS_ERROR_ILLEGAL_VALUE : NS_OK;
}

NS_IMETHODIMP nsImapHostSessionList::GetOnlineDirForHost(const char* serverKey,
                                                         nsString& result) {
  PR_EnterMonitor(gCachedHostInfoMonitor);
  nsIMAPHostInfo* host = FindHost(serverKey);
  if (host) CopyASCIItoUTF16(host->fOnlineDir, result);
  PR_ExitMonitor(gCachedHostInfoMonitor);
  return (host == NULL) ? NS_ERROR_ILLEGAL_VALUE : NS_OK;
}

NS_IMETHODIMP nsImapHostSessionList::SetOnlineDirForHost(
    const char* serverKey, const char* onlineDir) {
  PR_EnterMonitor(gCachedHostInfoMonitor);
  nsIMAPHostInfo* host = FindHost(serverKey);
  if (host) {
    if (onlineDir) host->fOnlineDir = onlineDir;
  }
  PR_ExitMonitor(gCachedHostInfoMonitor);
  return (host == NULL) ? NS_ERROR_ILLEGAL_VALUE : NS_OK;
}

NS_IMETHODIMP nsImapHostSessionList::GetDeleteIsMoveToTrashForHost(
    const char* serverKey, bool& result) {
  PR_EnterMonitor(gCachedHostInfoMonitor);
  nsIMAPHostInfo* host = FindHost(serverKey);
  if (host) result = host->fDeleteIsMoveToTrash;
  PR_ExitMonitor(gCachedHostInfoMonitor);
  return (host == NULL) ? NS_ERROR_ILLEGAL_VALUE : NS_OK;
}

NS_IMETHODIMP nsImapHostSessionList::GetShowDeletedMessagesForHost(
    const char* serverKey, bool& result) {
  PR_EnterMonitor(gCachedHostInfoMonitor);
  nsIMAPHostInfo* host = FindHost(serverKey);
  if (host) result = host->fShowDeletedMessages;
  PR_ExitMonitor(gCachedHostInfoMonitor);
  return (host == NULL) ? NS_ERROR_ILLEGAL_VALUE : NS_OK;
}

NS_IMETHODIMP nsImapHostSessionList::SetDeleteIsMoveToTrashForHost(
    const char* serverKey, bool isMoveToTrash) {
  PR_EnterMonitor(gCachedHostInfoMonitor);
  nsIMAPHostInfo* host = FindHost(serverKey);
  if (host) host->fDeleteIsMoveToTrash = isMoveToTrash;
  PR_ExitMonitor(gCachedHostInfoMonitor);
  return (host == NULL) ? NS_ERROR_ILLEGAL_VALUE : NS_OK;
}

NS_IMETHODIMP nsImapHostSessionList::SetShowDeletedMessagesForHost(
    const char* serverKey, bool showDeletedMessages) {
  PR_EnterMonitor(gCachedHostInfoMonitor);
  nsIMAPHostInfo* host = FindHost(serverKey);
  if (host) host->fShowDeletedMessages = showDeletedMessages;
  PR_ExitMonitor(gCachedHostInfoMonitor);
  return (host == NULL) ? NS_ERROR_ILLEGAL_VALUE : NS_OK;
}

NS_IMETHODIMP nsImapHostSessionList::GetGotNamespacesForHost(
    const char* serverKey, bool& result) {
  PR_EnterMonitor(gCachedHostInfoMonitor);
  nsIMAPHostInfo* host = FindHost(serverKey);
  if (host) result = host->fGotNamespaces;
  PR_ExitMonitor(gCachedHostInfoMonitor);
  return (host == NULL) ? NS_ERROR_ILLEGAL_VALUE : NS_OK;
}

NS_IMETHODIMP nsImapHostSessionList::SetGotNamespacesForHost(
    const char* serverKey, bool gotNamespaces) {
  PR_EnterMonitor(gCachedHostInfoMonitor);
  nsIMAPHostInfo* host = FindHost(serverKey);
  if (host) host->fGotNamespaces = gotNamespaces;
  PR_ExitMonitor(gCachedHostInfoMonitor);
  return (host == NULL) ? NS_ERROR_ILLEGAL_VALUE : NS_OK;
}

NS_IMETHODIMP nsImapHostSessionList::GetHostIsUsingSubscription(
    const char* serverKey, bool& result) {
  PR_EnterMonitor(gCachedHostInfoMonitor);
  nsIMAPHostInfo* host = FindHost(serverKey);
  if (host) result = host->fUsingSubscription;
  PR_ExitMonitor(gCachedHostInfoMonitor);
  return (host == NULL) ? NS_ERROR_ILLEGAL_VALUE : NS_OK;
}

NS_IMETHODIMP nsImapHostSessionList::SetHostIsUsingSubscription(
    const char* serverKey, bool usingSubscription) {
  PR_EnterMonitor(gCachedHostInfoMonitor);
  nsIMAPHostInfo* host = FindHost(serverKey);
  if (host) host->fUsingSubscription = usingSubscription;
  PR_ExitMonitor(gCachedHostInfoMonitor);
  return (host == NULL) ? NS_ERROR_ILLEGAL_VALUE : NS_OK;
}

NS_IMETHODIMP nsImapHostSessionList::GetHostHasAdminURL(const char* serverKey,
                                                        bool& result) {
  PR_EnterMonitor(gCachedHostInfoMonitor);
  nsIMAPHostInfo* host = FindHost(serverKey);
  if (host) result = host->fHaveAdminURL;
  PR_ExitMonitor(gCachedHostInfoMonitor);
  return (host == NULL) ? NS_ERROR_ILLEGAL_VALUE : NS_OK;
}

NS_IMETHODIMP nsImapHostSessionList::SetHostHasAdminURL(const char* serverKey,
                                                        bool haveAdminURL) {
  PR_EnterMonitor(gCachedHostInfoMonitor);
  nsIMAPHostInfo* host = FindHost(serverKey);
  if (host) host->fHaveAdminURL = haveAdminURL;
  PR_ExitMonitor(gCachedHostInfoMonitor);
  return (host == NULL) ? NS_ERROR_ILLEGAL_VALUE : NS_OK;
}

NS_IMETHODIMP nsImapHostSessionList::GetHaveWeEverDiscoveredFoldersForHost(
    const char* serverKey, bool& result) {
  PR_EnterMonitor(gCachedHostInfoMonitor);
  nsIMAPHostInfo* host = FindHost(serverKey);
  if (host) result = host->fHaveWeEverDiscoveredFolders;
  PR_ExitMonitor(gCachedHostInfoMonitor);
  return (host == NULL) ? NS_ERROR_ILLEGAL_VALUE : NS_OK;
}

NS_IMETHODIMP nsImapHostSessionList::SetHaveWeEverDiscoveredFoldersForHost(
    const char* serverKey, bool discovered) {
  PR_EnterMonitor(gCachedHostInfoMonitor);
  nsIMAPHostInfo* host = FindHost(serverKey);
  if (host) host->fHaveWeEverDiscoveredFolders = discovered;
  PR_ExitMonitor(gCachedHostInfoMonitor);
  return (host == NULL) ? NS_ERROR_ILLEGAL_VALUE : NS_OK;
}

NS_IMETHODIMP nsImapHostSessionList::GetDiscoveryForHostInProgress(
    const char* serverKey, bool& result) {
  PR_EnterMonitor(gCachedHostInfoMonitor);
  nsIMAPHostInfo* host = FindHost(serverKey);
  if (host)
    result = host->fDiscoveryForHostInProgress;
  else
    result = false;
  PR_ExitMonitor(gCachedHostInfoMonitor);
  return (host == NULL) ? NS_ERROR_ILLEGAL_VALUE : NS_OK;
}

NS_IMETHODIMP nsImapHostSessionList::SetDiscoveryForHostInProgress(
    const char* serverKey, bool inProgress) {
  PR_EnterMonitor(gCachedHostInfoMonitor);
  nsIMAPHostInfo* host = FindHost(serverKey);
  if (host) host->fDiscoveryForHostInProgress = inProgress;
  PR_ExitMonitor(gCachedHostInfoMonitor);
  return (host == NULL) ? NS_ERROR_ILLEGAL_VALUE : NS_OK;
}

NS_IMETHODIMP nsImapHostSessionList::SetOnlineTrashFolderExistsForHost(
    const char* serverKey, bool exists) {
  PR_EnterMonitor(gCachedHostInfoMonitor);
  nsIMAPHostInfo* host = FindHost(serverKey);
  if (host) host->fOnlineTrashFolderExists = exists;
  PR_ExitMonitor(gCachedHostInfoMonitor);
  return (host == NULL) ? NS_ERROR_ILLEGAL_VALUE : NS_OK;
}

NS_IMETHODIMP nsImapHostSessionList::GetOnlineTrashFolderExistsForHost(
    const char* serverKey, bool& result) {
  PR_EnterMonitor(gCachedHostInfoMonitor);
  nsIMAPHostInfo* host = FindHost(serverKey);
  if (host) result = host->fOnlineTrashFolderExists;
  PR_ExitMonitor(gCachedHostInfoMonitor);
  return (host == NULL) ? NS_ERROR_ILLEGAL_VALUE : NS_OK;
}

NS_IMETHODIMP nsImapHostSessionList::AddNewNamespaceForHost(
    const char* serverKey, nsImapNamespace* ns) {
  PR_EnterMonitor(gCachedHostInfoMonitor);
  nsIMAPHostInfo* host = FindHost(serverKey);
  if (host) host->fNamespaceList->AddNewNamespace(ns);
  PR_ExitMonitor(gCachedHostInfoMonitor);
  return (host == NULL) ? NS_ERROR_ILLEGAL_VALUE : NS_OK;
}

NS_IMETHODIMP nsImapHostSessionList::SetNamespaceFromPrefForHost(
    const char* serverKey, const char* namespacePref,
    EIMAPNamespaceType nstype) {
  PR_EnterMonitor(gCachedHostInfoMonitor);
  nsIMAPHostInfo* host = FindHost(serverKey);
  if (host) {
    if (namespacePref) {
      int numNamespaces = host->fNamespaceList->UnserializeNamespaces(
          namespacePref, nullptr, 0);
      char** prefixes = (char**)PR_CALLOC(numNamespaces * sizeof(char*));
      if (prefixes) {
        int len = host->fNamespaceList->UnserializeNamespaces(
            namespacePref, prefixes, numNamespaces);
        for (int i = 0; i < len; i++) {
          char* thisns = prefixes[i];
          char delimiter = '/';  // a guess
          if (PL_strlen(thisns) >= 1) delimiter = thisns[PL_strlen(thisns) - 1];
          nsImapNamespace* ns =
              new nsImapNamespace(nstype, thisns, delimiter, true);
          if (ns) host->fNamespaceList->AddNewNamespace(ns);
          PR_FREEIF(thisns);
        }
        PR_Free(prefixes);
      }
    }
  }
  PR_ExitMonitor(gCachedHostInfoMonitor);
  return (host == NULL) ? NS_ERROR_ILLEGAL_VALUE : NS_OK;
}

NS_IMETHODIMP nsImapHostSessionList::GetNamespaceForMailboxForHost(
    const char* serverKey, const char* mailbox_name, nsImapNamespace*& result) {
  PR_EnterMonitor(gCachedHostInfoMonitor);
  nsIMAPHostInfo* host = FindHost(serverKey);
  if (host) result = host->fNamespaceList->GetNamespaceForMailbox(mailbox_name);
  PR_ExitMonitor(gCachedHostInfoMonitor);
  return (host == NULL) ? NS_ERROR_ILLEGAL_VALUE : NS_OK;
}

NS_IMETHODIMP nsImapHostSessionList::ClearPrefsNamespacesForHost(
    const char* serverKey) {
  PR_EnterMonitor(gCachedHostInfoMonitor);
  nsIMAPHostInfo* host = FindHost(serverKey);
  if (host) host->fNamespaceList->ClearNamespaces(true, false, true);
  PR_ExitMonitor(gCachedHostInfoMonitor);
  return (host == NULL) ? NS_ERROR_ILLEGAL_VALUE : NS_OK;
}

NS_IMETHODIMP nsImapHostSessionList::ClearServerAdvertisedNamespacesForHost(
    const char* serverKey) {
  PR_EnterMonitor(gCachedHostInfoMonitor);
  nsIMAPHostInfo* host = FindHost(serverKey);
  if (host) host->fNamespaceList->ClearNamespaces(false, true, true);
  PR_ExitMonitor(gCachedHostInfoMonitor);
  return (host == NULL) ? NS_ERROR_ILLEGAL_VALUE : NS_OK;
}

NS_IMETHODIMP nsImapHostSessionList::GetDefaultNamespaceOfTypeForHost(
    const char* serverKey, EIMAPNamespaceType type, nsImapNamespace*& result) {
  PR_EnterMonitor(gCachedHostInfoMonitor);
  nsIMAPHostInfo* host = FindHost(serverKey);
  if (host) result = host->fNamespaceList->GetDefaultNamespaceOfType(type);
  PR_ExitMonitor(gCachedHostInfoMonitor);
  return (host == NULL) ? NS_ERROR_ILLEGAL_VALUE : NS_OK;
}

NS_IMETHODIMP nsImapHostSessionList::GetNamespacesOverridableForHost(
    const char* serverKey, bool& result) {
  PR_EnterMonitor(gCachedHostInfoMonitor);
  nsIMAPHostInfo* host = FindHost(serverKey);
  if (host) result = host->fNamespacesOverridable;
  PR_ExitMonitor(gCachedHostInfoMonitor);
  return (host == NULL) ? NS_ERROR_ILLEGAL_VALUE : NS_OK;
}

NS_IMETHODIMP nsImapHostSessionList::SetNamespacesOverridableForHost(
    const char* serverKey, bool overridable) {
  PR_EnterMonitor(gCachedHostInfoMonitor);
  nsIMAPHostInfo* host = FindHost(serverKey);
  if (host) host->fNamespacesOverridable = overridable;
  PR_ExitMonitor(gCachedHostInfoMonitor);
  return (host == NULL) ? NS_ERROR_ILLEGAL_VALUE : NS_OK;
}

NS_IMETHODIMP nsImapHostSessionList::GetNumberOfNamespacesForHost(
    const char* serverKey, uint32_t& result) {
  int32_t intResult = 0;

  PR_EnterMonitor(gCachedHostInfoMonitor);
  nsIMAPHostInfo* host = FindHost(serverKey);
  if (host) intResult = host->fNamespaceList->GetNumberOfNamespaces();
  PR_ExitMonitor(gCachedHostInfoMonitor);
  NS_ASSERTION(intResult >= 0, "negative number of namespaces");
  result = (uint32_t)intResult;
  return (host == NULL) ? NS_ERROR_ILLEGAL_VALUE : NS_OK;
}

NS_IMETHODIMP nsImapHostSessionList::GetNamespaceNumberForHost(
    const char* serverKey, int32_t n, nsImapNamespace*& result) {
  PR_EnterMonitor(gCachedHostInfoMonitor);
  nsIMAPHostInfo* host = FindHost(serverKey);
  if (host) result = host->fNamespaceList->GetNamespaceNumber(n);
  PR_ExitMonitor(gCachedHostInfoMonitor);
  return (host == NULL) ? NS_ERROR_ILLEGAL_VALUE : NS_OK;
}

nsresult nsImapHostSessionList::SetNamespacesPrefForHost(
    nsIImapIncomingServer* aHost, EIMAPNamespaceType type, const char* pref) {
  if (type == kPersonalNamespace)
    aHost->SetPersonalNamespace(nsDependentCString(pref));
  else if (type == kPublicNamespace)
    aHost->SetPublicNamespace(nsDependentCString(pref));
  else if (type == kOtherUsersNamespace)
    aHost->SetOtherUsersNamespace(nsDependentCString(pref));
  else
    NS_ASSERTION(false, "bogus namespace type");
  return NS_OK;
}
// do we need this? What should we do about the master thing?
// Make sure this is running in the Mozilla thread when called
NS_IMETHODIMP nsImapHostSessionList::CommitNamespacesForHost(
    nsIImapIncomingServer* aHost) {
  NS_ENSURE_ARG_POINTER(aHost);
  nsCString serverKey;
  nsCOMPtr<nsIMsgIncomingServer> incomingServer = do_QueryInterface(aHost);
  if (!incomingServer) return NS_ERROR_NULL_POINTER;

  nsresult rv = incomingServer->GetKey(serverKey);
  NS_ENSURE_SUCCESS(rv, rv);

  PR_EnterMonitor(gCachedHostInfoMonitor);
  nsIMAPHostInfo* host = FindHost(serverKey.get());
  if (host) {
    host->fGotNamespaces =
        true;  // so we only issue NAMESPACE once per host per session.
    EIMAPNamespaceType type = kPersonalNamespace;
    for (int i = 1; i <= 3; i++) {
      switch (i) {
        case 1:
          type = kPersonalNamespace;
          break;
        case 2:
          type = kPublicNamespace;
          break;
        case 3:
          type = kOtherUsersNamespace;
          break;
        default:
          type = kPersonalNamespace;
          break;
      }

      int32_t numInNS = host->fNamespaceList->GetNumberOfNamespaces(type);
      if (numInNS == 0)
        SetNamespacesPrefForHost(aHost, type, "");
      else if (numInNS >= 1) {
        char* pref = PR_smprintf("");
        for (int count = 1; count <= numInNS; count++) {
          nsImapNamespace* ns =
              host->fNamespaceList->GetNamespaceNumber(count, type);
          if (ns) {
            if (count > 1) {
              // append the comma
              char* tempPref = PR_smprintf("%s,", pref);
              PR_FREEIF(pref);
              pref = tempPref;
            }
            char* tempPref = PR_smprintf("%s\"%s\"", pref, ns->GetPrefix());
            PR_FREEIF(pref);
            pref = tempPref;
          }
        }
        if (pref) {
          SetNamespacesPrefForHost(aHost, type, pref);
          PR_Free(pref);
        }
      }
    }
    // clear, but don't delete the entries in, the temp namespace list
    host->fTempNamespaceList->ClearNamespaces(true, true, false);

    // Now reset all of libmsg's namespace references.
    // Did I mention this needs to be running in the mozilla thread?
    aHost->ResetNamespaceReferences();
  }
  PR_ExitMonitor(gCachedHostInfoMonitor);
  return (host == NULL) ? NS_ERROR_ILLEGAL_VALUE : NS_OK;
}

NS_IMETHODIMP nsImapHostSessionList::FlushUncommittedNamespacesForHost(
    const char* serverKey, bool& result) {
  PR_EnterMonitor(gCachedHostInfoMonitor);
  nsIMAPHostInfo* host = FindHost(serverKey);
  if (host) host->fTempNamespaceList->ClearNamespaces(true, true, true);
  PR_ExitMonitor(gCachedHostInfoMonitor);
  return (host == NULL) ? NS_ERROR_ILLEGAL_VALUE : NS_OK;
}

// Returns NULL if there is no personal namespace on the given host
NS_IMETHODIMP nsImapHostSessionList::GetOnlineInboxPathForHost(
    const char* serverKey, nsString& result) {
  PR_EnterMonitor(gCachedHostInfoMonitor);
  nsIMAPHostInfo* host = FindHost(serverKey);
  if (host) {
    nsImapNamespace* ns = NULL;
    ns = host->fNamespaceList->GetDefaultNamespaceOfType(kPersonalNamespace);
    if (ns) {
      CopyASCIItoUTF16(nsDependentCString(ns->GetPrefix()), result);
      result.AppendLiteral("INBOX");
    }
  } else
    result.Truncate();
  PR_ExitMonitor(gCachedHostInfoMonitor);
  return (host == NULL) ? NS_ERROR_ILLEGAL_VALUE : NS_OK;
}

NS_IMETHODIMP nsImapHostSessionList::GetShouldAlwaysListInboxForHost(
    const char* /*serverKey*/, bool& result) {
  result = true;

  /*
  PR_EnterMonitor(gCachedHostInfoMonitor);
  nsIMAPHostInfo *host = FindHost(serverKey);
  if (host)
    ret = host->fShouldAlwaysListInbox;
  PR_ExitMonitor(gCachedHostInfoMonitor);
  */
  return NS_OK;
}

NS_IMETHODIMP nsImapHostSessionList::SetShouldAlwaysListInboxForHost(
    const char* serverKey, bool shouldList) {
  PR_EnterMonitor(gCachedHostInfoMonitor);
  nsIMAPHostInfo* host = FindHost(serverKey);
  if (host) host->fShouldAlwaysListInbox = shouldList;
  PR_ExitMonitor(gCachedHostInfoMonitor);
  return (host == NULL) ? NS_ERROR_ILLEGAL_VALUE : NS_OK;
}

NS_IMETHODIMP
nsImapHostSessionList::SetNamespaceHierarchyDelimiterFromMailboxForHost(
    const char* serverKey, const char* boxName, char delimiter) {
  PR_EnterMonitor(gCachedHostInfoMonitor);
  nsIMAPHostInfo* host = FindHost(serverKey);
  if (host) {
    nsImapNamespace* ns = host->fNamespaceList->GetNamespaceForMailbox(boxName);
    if (ns && !ns->GetIsDelimiterFilledIn()) ns->SetDelimiter(delimiter, true);
  }
  PR_ExitMonitor(gCachedHostInfoMonitor);
  return (host) ? NS_OK : NS_ERROR_ILLEGAL_VALUE;
}
