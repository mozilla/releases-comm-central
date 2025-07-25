/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_IMAP_SRC_NSIMAPSERVICE_H_
#define COMM_MAILNEWS_IMAP_SRC_NSIMAPSERVICE_H_

#include "nsIImapService.h"
#include "nsIMsgMessageService.h"
#include "nsCOMPtr.h"
#include "nsIFile.h"
#include "nsIProtocolHandler.h"
#include "nsIMsgProtocolInfo.h"
#include "nsIContentHandler.h"
#include "nsICacheStorage.h"

class nsIImapUrl;
class nsIMsgFolder;
class nsIMsgIncomingServer;

/**
 * nsImapService implements the IMAP protocol.
 * So, whenever someone opens an "imap://" url, the resultant nsIChannel
 * is created here (via newChannel()).
 *
 * It also provides a bunch of methods to provide more egonomic ways to
 * initiate IMAP operations, rather than manually composing an "imap://..."
 * URL. See nsIImapService for these.
 */
class nsImapService : public nsIImapService,
                      public nsIMsgMessageService,
                      public nsIMsgMessageFetchPartService,
                      public nsIProtocolHandler,
                      public nsIMsgProtocolInfo,
                      public nsIContentHandler {
 public:
  nsImapService();
  static nsresult NewURI(const nsACString& aSpec,
                         const char* aOriginCharset,  // ignored
                         nsIURI* aBaseURI, nsIURI** aRetVal);

  NS_DECL_THREADSAFE_ISUPPORTS
  NS_DECL_NSIMSGPROTOCOLINFO
  NS_DECL_NSIIMAPSERVICE
  NS_DECL_NSIMSGMESSAGESERVICE
  NS_DECL_NSIPROTOCOLHANDLER
  NS_DECL_NSIMSGMESSAGEFETCHPARTSERVICE
  NS_DECL_NSICONTENTHANDLER

 protected:
  virtual ~nsImapService();
  char GetHierarchyDelimiter(nsIMsgFolder* aMsgFolder);

  nsresult FetchMessage(nsIImapUrl* aImapUrl, nsImapAction aImapAction,
                        nsIMsgFolder* aImapMailFolder,
                        nsIImapMessageSink* aImapMessage,
                        nsIMsgWindow* aMsgWindow, nsISupports* aDisplayConsumer,
                        const nsACString& messageIdentifierList,
                        bool aConvertDataToText, nsIURI** aURL);

  nsresult AddImapFetchToUrl(nsIMsgMailNewsUrl* aUrl,
                             nsIMsgFolder* aImapMailFolder,
                             const nsACString& aMessageIdentifierList,
                             const nsACString& aAdditionalHeader);

  nsresult GetFolderName(nsIMsgFolder* aImapFolder, nsACString& aFolderName);

  // This is called by both FetchMessage and StreamMessage
  nsresult GetMessageFromUrl(nsIImapUrl* aImapUrl, nsImapAction aImapAction,
                             nsIMsgFolder* aImapMailFolder,
                             nsIImapMessageSink* aImapMessage,
                             nsIMsgWindow* aMsgWindow,
                             nsISupports* aDisplayConsumer,
                             bool aConvertDataToText, nsIURI** aURL);

  nsresult CreateStartOfImapUrl(
      const nsACString&
          aImapURI,  // a RDF URI for the current message/folder, can be empty
      nsIImapUrl** imapUrl, nsIMsgFolder* aImapFolder,
      nsIUrlListener* aUrlListener, nsACString& urlSpec,
      char& hierarchyDelimiter);

  nsresult GetImapConnectionAndLoadUrl(nsIImapUrl* aImapUrl,
                                       nsISupports* aConsumer, nsIURI** aURL);

  static nsresult SetImapUrlSink(nsIMsgFolder* aMsgFolder,
                                 nsIImapUrl* aImapUrl);

  nsresult FetchMimePartInternal(nsIImapUrl* aImapUrl,
                                 nsIMsgFolder* aImapMailFolder,
                                 nsIImapMessageSink* aImapMessage,
                                 nsIURI** aURL, nsISupports* aDisplayConsumer,
                                 nsMsgKey msgKey, const nsACString& mimePart);

  nsresult FolderCommand(nsIMsgFolder* imapMailFolder,
                         nsIUrlListener* urlListener, const char* aCommand,
                         nsImapAction imapAction, nsIMsgWindow* msgWindow,
                         nsIURI** url);

  nsresult ChangeFolderSubscription(nsIMsgFolder* folder,
                                    const nsACString& folderName,
                                    const char* aCommand,
                                    nsIUrlListener* urlListener, nsIURI** url);

  nsresult DiddleFlags(nsIMsgFolder* aImapMailFolder,
                       nsIUrlListener* aUrlListener, nsIURI** aURL,
                       const nsACString& messageIdentifierList,
                       const char* howToDiddle, imapMessageFlagsType flags,
                       bool messageIdsAreUID);

  nsresult OfflineAppendFromFile(nsIFile* aFile, nsIURI* aUrl,
                                 nsIMsgFolder* aDstFolder,
                                 const nsACString& messageId,  // to be replaced
                                 bool inSelectedState,         // needs to be in
                                 nsIUrlListener* aListener, nsIURI** aURL,
                                 nsISupports* aCopyState);

  static nsresult GetServerFromUrl(nsIImapUrl* aImapUrl,
                                   nsIMsgIncomingServer** aServer);

  // just a little helper method...maybe it should be a macro? which helps break
  // down a imap message uri into the folder and message key equivalents
  nsresult DecomposeImapURI(const nsACString& aMessageURI,
                            nsIMsgFolder** aFolder, nsMsgKey* msgKey);

  nsCOMPtr<nsICacheStorage> mCacheStorage;
};

#endif  // COMM_MAILNEWS_IMAP_SRC_NSIMAPSERVICE_H_
