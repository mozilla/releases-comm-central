/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_LOCAL_SRC_NSMAILBOXURL_H_
#define COMM_MAILNEWS_LOCAL_SRC_NSMAILBOXURL_H_

#include "nsMsgMailNewsUrl.h"
#include "nsIStreamListener.h"
#include "nsIFile.h"
#include "nsCOMPtr.h"
#include "nsTArray.h"

enum class MailboxAction : int32_t {
  Invalid = 0,
  FetchMessage = 1,
  CopyMessage = 2,
  MoveMessage = 3,
  SaveMessageToDisk = 4,
  AppendMessageToDisk = 5,
  FetchPart = 6,
};

class nsMailboxUrl : public nsMsgMailNewsUrl,
                     public nsIMsgMessageUrl,
                     public nsIMsgI18NUrl {
 public:
  // nsIMsgMailNewsUrl override
  nsresult SetSpecInternal(const nsACString& aSpec) override;
  nsresult SetQuery(const nsACString& aQuery) override;
  nsresult CreateURL(const nsACString& aSpec, nsIURL** aURL) override;

  nsresult GetMessageKey(nsMsgKey* aMessageKey);
  nsresult GetMessageSize(uint32_t* aMessageSize);
  nsresult SetMessageSize(uint32_t aMessageSize);
  NS_IMETHOD GetMailboxAction(MailboxAction* result) {
    NS_ENSURE_ARG_POINTER(result);
    *result = m_mailboxAction;
    return NS_OK;
  }
  NS_IMETHOD SetMailboxAction(MailboxAction aAction) {
    m_mailboxAction = aAction;
    return NS_OK;
  }
  NS_IMETHOD IsUrlType(uint32_t type, bool* isType) override;
  nsresult SetMoveCopyMsgKeys(const nsTArray<nsMsgKey>& keysToFlag);
  nsresult GetMoveCopyMsgHdrForIndex(uint32_t msgIndex, nsIMsgDBHdr** msgHdr);
  nsresult GetNumMoveCopyMsgs(uint32_t* numMsgs);
  NS_IMETHOD GetCurMoveCopyMsgIndex(uint32_t* result) {
    NS_ENSURE_ARG_POINTER(result);
    *result = m_curMsgIndex;
    return NS_OK;
  }
  NS_IMETHOD SetCurMoveCopyMsgIndex(uint32_t aIndex) {
    m_curMsgIndex = aIndex;
    return NS_OK;
  }

  NS_IMETHOD GetFolder(nsIMsgFolder** msgFolder) override;

  // nsMsgMailNewsUrl override
  nsresult Clone(nsIURI** _retval) override;

  // nsMailboxUrl
  nsMailboxUrl();
  NS_DECL_NSIMSGMESSAGEURL
  NS_DECL_ISUPPORTS_INHERITED
  NS_DECL_NSIMSGI18NURL

  // Mailbox copy handler.
  nsresult SetMailboxCopyHandler(nsIStreamListener* aConsumer);
  nsresult GetMailboxCopyHandler(nsIStreamListener** aConsumer);

 protected:
  virtual ~nsMailboxUrl();
  // protocol specific code to parse a url...
  virtual nsresult ParseUrl();
  nsresult GetMsgHdrForKey(nsMsgKey msgKey, nsIMsgDBHdr** aMsgHdr);

  // mailboxurl specific state
  nsCOMPtr<nsIStreamListener> m_mailboxParser;
  nsCOMPtr<nsIStreamListener> m_mailboxCopyHandler;

  MailboxAction m_mailboxAction;  // the action this url represents...parse
                                  // mailbox, display messages, etc.
  nsCOMPtr<nsIFile> m_filePath;
  char* m_messageID;
  uint32_t m_messageSize;
  nsMsgKey m_messageKey;
  nsCString m_file;

  // used by save message to disk
  nsCOMPtr<nsIFile> m_messageFile;
  bool m_addDummyEnvelope;
  bool m_canonicalLineEnding;
  nsresult ParseSearchPart();

  // for multiple msg move/copy
  nsTArray<nsMsgKey> m_keys;
  int32_t m_curMsgIndex;

  // truncated message support
  nsCString m_originalSpec;
  nsCString mURI;           // the RDF URI associated with this url.
  bool mAutodetectCharset;  // used by nsIMsgI18NUrl...
};

#endif  // COMM_MAILNEWS_LOCAL_SRC_NSMAILBOXURL_H_
