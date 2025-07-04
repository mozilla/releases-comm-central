/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_IMAP_SRC_NSIMAPINCOMINGSERVER_H_
#define COMM_MAILNEWS_IMAP_SRC_NSIMAPINCOMINGSERVER_H_

#include "msgCore.h"
#include "nsImapCore.h"
#include "nsIImapIncomingServer.h"
#include "nsMsgIncomingServer.h"
#include "nsIImapServerSink.h"
#include "nsIStringBundle.h"
#include "nsISubscribableServer.h"
#include "nsIUrlListener.h"
#include "nsIMsgImapMailFolder.h"
#include "nsCOMArray.h"
#include "nsTArray.h"
#include "mozilla/Mutex.h"
#include "mozilla/Monitor.h"

/* get some implementation from nsMsgIncomingServer */
class nsImapIncomingServer : public nsMsgIncomingServer,
                             public nsIImapIncomingServer,
                             public nsIImapServerSink,
                             public nsISubscribableServer,
                             public nsIUrlListener {
 public:
  NS_DECL_ISUPPORTS_INHERITED

  nsImapIncomingServer();

  // overriding nsMsgIncomingServer methods
  NS_IMETHOD SetKey(const nsACString& aKey)
      override;  // override nsMsgIncomingServer's implementation...
  NS_IMETHOD GetLocalStoreType(nsACString& type) override;
  NS_IMETHOD GetLocalDatabaseType(nsACString& type) override;

  NS_DECL_NSIIMAPINCOMINGSERVER
  NS_DECL_NSIIMAPSERVERSINK
  NS_DECL_NSISUBSCRIBABLESERVER
  NS_DECL_NSIURLLISTENER

  NS_IMETHOD PerformBiff(nsIMsgWindow* aMsgWindow) override;
  NS_IMETHOD PerformExpand(nsIMsgWindow* aMsgWindow) override;
  NS_IMETHOD CloseCachedConnections() override;
  NS_IMETHOD GetConstructedPrettyName(nsACString& retval) override;
  NS_IMETHOD GetCanBeDefaultServer(bool* canBeDefaultServer) override;
  NS_IMETHOD GetCanSearchMessages(bool* canSearchMessages) override;
  NS_IMETHOD GetOfflineSupportLevel(int32_t* aSupportLevel) override;
  NS_IMETHOD GetSupportsDiskSpace(bool* aSupportsDiskSpace) override;
  NS_IMETHOD GetCanCreateFoldersOnServer(
      bool* aCanCreateFoldersOnServer) override;
  NS_IMETHOD GetCanFileMessagesOnServer(
      bool* aCanFileMessagesOnServer) override;
  NS_IMETHOD GetFilterScope(nsMsgSearchScopeValue* filterScope) override;
  NS_IMETHOD GetSearchScope(nsMsgSearchScopeValue* searchScope) override;
  NS_IMETHOD GetServerRequiresPasswordForBiff(
      bool* aServerRequiresPasswordForBiff) override;
  NS_IMETHOD ForgetSessionPassword(bool modifyLogin) override;
  NS_IMETHOD GetMsgFolderFromURI(nsIMsgFolder* aFolderResource,
                                 const nsACString& aURI,
                                 nsIMsgFolder** aFolder) override;
  NS_IMETHOD SetSocketType(int32_t aSocketType) override;
  NS_IMETHOD VerifyLogon(nsIUrlListener* aUrlListener, nsIMsgWindow* aMsgWindow,
                         nsIURI** aURL) override;

 protected:
  virtual ~nsImapIncomingServer();
  nsresult GetFolder(const nsACString& name, nsIMsgFolder** pFolder);
  nsresult ResetFoldersToUnverified(nsIMsgFolder* parentFolder);
  void GetUnverifiedSubFolders(nsIMsgFolder* parentFolder,
                               nsCOMArray<nsIMsgImapMailFolder>& aFoldersArray);
  void GetUnverifiedFolders(nsCOMArray<nsIMsgImapMailFolder>& aFolderArray);
  bool NoDescendantsAreVerified(nsIMsgFolder* parentFolder);
  bool AllDescendantsAreNoSelect(nsIMsgFolder* parentFolder);

  nsresult GetStringBundle();
  static nsresult AlertUser(const nsAString& aString, nsIMsgMailNewsUrl* aUrl);

 private:
  nsresult SubscribeToFolder(const char16_t* aName, bool subscribe);
  nsresult GetImapConnection(nsIImapUrl* aImapUrl,
                             nsIImapProtocol** aImapConnection);
  nsresult CreateProtocolInstance(nsIImapProtocol** aImapConnection);
  nsresult CreateHostSpecificPrefName(const char* prefPrefix,
                                      nsAutoCString& prefName);

  nsresult DoomUrlIfChannelHasError(nsIImapUrl* aImapUrl, bool* urlDoomed);
  bool ConnectionTimeOut(nsIImapProtocol* aImapConnection);
  nsresult GetFormattedStringFromName(const nsAString& aValue,
                                      const char* aName, nsAString& aResult);
  nsresult GetPrefForServerAttribute(const char* prefSuffix, bool* prefValue);
  bool CheckSpecialFolder(nsCString& folderUri, uint32_t folderFlag,
                          nsCString& existingUri);

  nsCOMArray<nsIImapProtocol> m_connectionCache;

  /**
   * All requests waiting for a real connection.
   * Each URL object holds a reference to the nsIImapMockChannel that
   * represents the request.
   */
  nsCOMArray<nsIImapUrl> m_urlQueue;

  /**
   * Consumers for the queued urls. The number of elements here should match
   * that of m_urlQueue. So requests with no consumer should have a nullptr
   * entry here.
   */
  nsTArray<nsISupports*> m_urlConsumers;

  nsCOMPtr<nsIStringBundle> m_stringBundle;
  nsCOMArray<nsIMsgFolder>
      m_subscribeFolders;  // used to keep folder resources around while
                           // subscribe UI is up.
  nsCOMArray<nsIMsgImapMailFolder>
      m_foldersToStat;  // folders to check for new mail with Status
  eIMAPCapabilityFlags m_capability;
  nsCString m_manageMailAccountUrl;
  bool m_userAuthenticated;
  bool mDoingSubscribeDialog;
  bool mDoingLsub;
  bool m_shuttingDown;
  bool mUtf8AcceptEnabled;

  // Protect access to Url queue.
  mozilla::Mutex mLock;

  // Only one connection at a time should be a allowed to attempt logon.
  mozilla::Monitor mLogonMonitor;

  // subscribe dialog stuff
  nsresult AddFolderToSubscribeDialog(const char* parentUri, const char* uri,
                                      const char* folderName);
  nsCOMPtr<nsISubscribableServer> mInner;
  nsresult EnsureInner();
  nsresult ClearInner();

  // Utility function for checking folder existence
  nsresult GetExistingMsgFolder(const nsACString& aURI,
                                nsACString& folderUriWithNamespace,
                                bool& namespacePrefixAdded,
                                bool caseInsensitive, nsIMsgFolder** aFolder);

  // Utility function to obtain the imap (short) path for a folder.
  static nsresult PathFromFolder(nsIMsgFolder* folder, nsACString& shortPath);
};

#endif  // COMM_MAILNEWS_IMAP_SRC_NSIMAPINCOMINGSERVER_H_
