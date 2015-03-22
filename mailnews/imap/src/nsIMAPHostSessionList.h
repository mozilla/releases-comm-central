/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef _nsIMAPHostSessionList_H_
#define _nsIMAPHostSessionList_H_

#include "mozilla/Attributes.h"
#include "nsImapCore.h"
#include "nsIIMAPHostSessionList.h"
#include "nsIObserver.h"
#include "nsWeakReference.h"
#include "nspr.h"

class nsIMAPNamespaceList;
class nsIImapIncomingServer;

class nsIMAPHostInfo
{
public:
  friend class nsIMAPHostSessionList;

  nsIMAPHostInfo(const char *serverKey, nsIImapIncomingServer *server);
  ~nsIMAPHostInfo();
protected:
  nsCString fServerKey;
  char *fCachedPassword;
  nsCString fOnlineDir;
  nsIMAPHostInfo *fNextHost;
  eIMAPCapabilityFlags fCapabilityFlags;
  char *fHierarchyDelimiters;// string of top-level hierarchy delimiters
  bool fHaveWeEverDiscoveredFolders;
  char *fCanonicalOnlineSubDir;
  nsIMAPNamespaceList *fNamespaceList, *fTempNamespaceList;
  bool fNamespacesOverridable;
  bool fUsingSubscription;
  bool fOnlineTrashFolderExists;
  bool fShouldAlwaysListInbox;
  bool fHaveAdminURL;
  bool fPasswordVerifiedOnline;
  bool fDeleteIsMoveToTrash;
  bool fShowDeletedMessages;
  bool fGotNamespaces;
  nsIMAPBodyShellCache *fShellCache;
};

// this is an interface to a linked list of host info's    
class nsIMAPHostSessionList : public nsIImapHostSessionList, public nsIObserver, public nsSupportsWeakReference
{
public:
  NS_DECL_THREADSAFE_ISUPPORTS
  NS_DECL_NSIOBSERVER  

  nsIMAPHostSessionList();
  nsresult Init();
  // Host List
  NS_IMETHOD AddHostToList(const char *serverKey, 
                            nsIImapIncomingServer *server) override;
  NS_IMETHOD ResetAll() override;

  // Capabilities
  NS_IMETHOD GetHostHasAdminURL(const char *serverKey, bool &result) override;
  NS_IMETHOD SetHostHasAdminURL(const char *serverKey, bool hasAdminUrl) override;
  // Subscription
  NS_IMETHOD GetHostIsUsingSubscription(const char *serverKey, bool &result) override;
  NS_IMETHOD SetHostIsUsingSubscription(const char *serverKey, bool usingSubscription) override;

  // Passwords
  NS_IMETHOD GetPasswordForHost(const char *serverKey, nsString &result) override;
  NS_IMETHOD SetPasswordForHost(const char *serverKey, const char *password) override;
  NS_IMETHOD GetPasswordVerifiedOnline(const char *serverKey, bool &result) override;
  NS_IMETHOD SetPasswordVerifiedOnline(const char *serverKey) override;

  // OnlineDir
  NS_IMETHOD GetOnlineDirForHost(const char *serverKey,
                                 nsString &result) override;
  NS_IMETHOD SetOnlineDirForHost(const char *serverKey,
                                 const char *onlineDir) override;

  // Delete is move to trash folder
  NS_IMETHOD GetDeleteIsMoveToTrashForHost(const char *serverKey, bool &result) override;
  NS_IMETHOD SetDeleteIsMoveToTrashForHost(const char *serverKey, bool isMoveToTrash) override;
  // imap delete model (or not)
  NS_IMETHOD GetShowDeletedMessagesForHost(const char *serverKey, bool &result) override;
  NS_IMETHOD SetShowDeletedMessagesForHost(const char *serverKey, bool showDeletedMessages) override;

  // Get namespaces
  NS_IMETHOD GetGotNamespacesForHost(const char *serverKey, bool &result) override;
  NS_IMETHOD SetGotNamespacesForHost(const char *serverKey, bool gotNamespaces) override;
  // Folders
  NS_IMETHOD SetHaveWeEverDiscoveredFoldersForHost(const char *serverKey, bool discovered) override;
  NS_IMETHOD GetHaveWeEverDiscoveredFoldersForHost(const char *serverKey, bool &result) override;

  // Trash Folder
  NS_IMETHOD SetOnlineTrashFolderExistsForHost(const char *serverKey, bool exists) override;
  NS_IMETHOD GetOnlineTrashFolderExistsForHost(const char *serverKey, bool &result) override;

  // INBOX
  NS_IMETHOD GetOnlineInboxPathForHost(const char *serverKey, nsString &result) override;
  NS_IMETHOD GetShouldAlwaysListInboxForHost(const char *serverKey, bool &result) override;
  NS_IMETHOD SetShouldAlwaysListInboxForHost(const char *serverKey, bool shouldList) override;

  // Namespaces
  NS_IMETHOD GetNamespaceForMailboxForHost(const char *serverKey, const char *mailbox_name, nsIMAPNamespace *&result) override;
  NS_IMETHOD SetNamespaceFromPrefForHost(const char *serverKey, const char *namespacePref, EIMAPNamespaceType type) override;
  NS_IMETHOD AddNewNamespaceForHost(const char *serverKey, nsIMAPNamespace *ns) override;
  NS_IMETHOD ClearServerAdvertisedNamespacesForHost(const char *serverKey) override;
  NS_IMETHOD ClearPrefsNamespacesForHost(const char *serverKey) override;
  NS_IMETHOD GetDefaultNamespaceOfTypeForHost(const char *serverKey, EIMAPNamespaceType type, nsIMAPNamespace *&result) override;
  NS_IMETHOD SetNamespacesOverridableForHost(const char *serverKey, bool overridable) override;
  NS_IMETHOD GetNamespacesOverridableForHost(const char *serverKey,bool &result) override;
  NS_IMETHOD GetNumberOfNamespacesForHost(const char *serverKey, uint32_t &result) override;
  NS_IMETHOD GetNamespaceNumberForHost(const char *serverKey, int32_t n, nsIMAPNamespace * &result) override;
  // ### dmb hoo boy, how are we going to do this?
  NS_IMETHOD CommitNamespacesForHost(nsIImapIncomingServer *host) override;
  NS_IMETHOD FlushUncommittedNamespacesForHost(const char *serverKey, bool &result) override;

  // Hierarchy Delimiters
  NS_IMETHOD SetNamespaceHierarchyDelimiterFromMailboxForHost(const char *serverKey, const char *boxName, char delimiter) override;

  // Message Body Shells
  NS_IMETHOD AddShellToCacheForHost(const char *serverKey, nsIMAPBodyShell *shell) override;
  NS_IMETHOD FindShellInCacheForHost(const char *serverKey, const char *mailboxName, const char *UID, IMAP_ContentModifiedType modType, nsIMAPBodyShell	**result) override;
  NS_IMETHOD ClearShellCacheForHost(const char *serverKey) override;
  PRMonitor *gCachedHostInfoMonitor;
  nsIMAPHostInfo *fHostInfoList;
protected:
  virtual ~nsIMAPHostSessionList();
  nsresult SetNamespacesPrefForHost(nsIImapIncomingServer *aHost,
                                    EIMAPNamespaceType type,
                                    const char *pref);
  nsIMAPHostInfo *FindHost(const char *serverKey);
};
#endif
