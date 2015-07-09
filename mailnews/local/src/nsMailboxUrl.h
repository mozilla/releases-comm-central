/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef nsMailboxUrl_h__
#define nsMailboxUrl_h__

#include "mozilla/Attributes.h"
#include "nsIMailboxUrl.h"
#include "nsMsgMailNewsUrl.h"
#include "nsIStreamListener.h"
#include "nsIFile.h"
#include "nsCOMPtr.h"
#include "MailNewsTypes.h"
#include "nsTArray.h"

class nsMailboxUrl : public nsIMailboxUrl, public nsMsgMailNewsUrl, public nsIMsgMessageUrl, public nsIMsgI18NUrl
{
public:
  // nsIURI over-ride...
  NS_IMETHOD SetSpec(const nsACString &aSpec) override;
  NS_IMETHOD SetQuery(const nsACString &aQuery) override;

  // from nsIMailboxUrl:
  NS_IMETHOD SetMailboxParser(nsIStreamListener * aConsumer) override;
  NS_IMETHOD GetMailboxParser(nsIStreamListener ** aConsumer) override;
  NS_IMETHOD SetMailboxCopyHandler(nsIStreamListener *  aConsumer) override;
  NS_IMETHOD GetMailboxCopyHandler(nsIStreamListener ** aConsumer) override;

  NS_IMETHOD GetMessageKey(nsMsgKey* aMessageKey) override;
  NS_IMETHOD GetMessageSize(uint32_t *aMessageSize) override;
  NS_IMETHOD SetMessageSize(uint32_t aMessageSize) override;
  NS_IMETHOD GetMailboxAction(nsMailboxAction *result) override
  {
    NS_ENSURE_ARG_POINTER(result);
    *result = m_mailboxAction;
    return NS_OK;
  }
  NS_IMETHOD SetMailboxAction(nsMailboxAction aAction) override
  {
    m_mailboxAction = aAction;
    return NS_OK;
  }
  NS_IMETHOD IsUrlType(uint32_t type, bool *isType);
  NS_IMETHOD SetMoveCopyMsgKeys(nsMsgKey *keysToFlag, int32_t numKeys) override;
  NS_IMETHOD GetMoveCopyMsgHdrForIndex(uint32_t msgIndex, nsIMsgDBHdr **msgHdr) override;
  NS_IMETHOD GetNumMoveCopyMsgs(uint32_t *numMsgs) override;
  NS_IMETHOD GetCurMoveCopyMsgIndex(uint32_t *result) override
  {
    NS_ENSURE_ARG_POINTER(result);
    *result = m_curMsgIndex;
    return NS_OK;
  }
  NS_IMETHOD SetCurMoveCopyMsgIndex(uint32_t aIndex) override
  {
    m_curMsgIndex = aIndex;
    return NS_OK;
  }

  NS_IMETHOD GetFolder(nsIMsgFolder **msgFolder);

  // nsIMsgMailNewsUrl override
  NS_IMETHOD Clone(nsIURI **_retval) override;

  // nsMailboxUrl
  nsMailboxUrl();
  NS_DECL_NSIMSGMESSAGEURL
  NS_DECL_ISUPPORTS_INHERITED
  NS_DECL_NSIMSGI18NURL

protected:
  virtual ~nsMailboxUrl();
  // protocol specific code to parse a url...
  virtual nsresult ParseUrl();
  nsresult GetMsgHdrForKey(nsMsgKey  msgKey, nsIMsgDBHdr ** aMsgHdr);

  // mailboxurl specific state
  nsCOMPtr<nsIStreamListener> m_mailboxParser;
  nsCOMPtr<nsIStreamListener> m_mailboxCopyHandler;

  nsMailboxAction m_mailboxAction; // the action this url represents...parse mailbox, display messages, etc.
  nsCOMPtr <nsIFile>  m_filePath;
  char *m_messageID;
  uint32_t m_messageSize;
  nsMsgKey m_messageKey;
  nsCString m_file;
  // This is currently only set when we're doing something with a .eml file.
  // If that changes, we should change the name of this var.
  nsCOMPtr<nsIMsgDBHdr> m_dummyHdr;

  // used by save message to disk
  nsCOMPtr<nsIFile> m_messageFile;
  bool                  m_addDummyEnvelope;
  bool                  m_canonicalLineEnding;
  nsresult ParseSearchPart();

  // for multiple msg move/copy
  nsTArray<nsMsgKey> m_keys;
  int32_t m_curMsgIndex;

  // truncated message support
  nsCString m_originalSpec;
  nsCString mURI; // the RDF URI associated with this url.
  nsCString mCharsetOverride; // used by nsIMsgI18NUrl...
};

#endif // nsMailboxUrl_h__
