/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef nsNntpUrl_h__
#define nsNntpUrl_h__

#include "nsINntpUrl.h"
#include "nsMsgMailNewsUrl.h"
#include "nsINNTPNewsgroupPost.h"
#include "nsIFile.h"

class nsNntpUrl : public nsINntpUrl, public nsMsgMailNewsUrl, public nsIMsgMessageUrl, public nsIMsgI18NUrl
{
public:
  NS_DECL_NSINNTPURL
  NS_DECL_NSIMSGMESSAGEURL
  NS_DECL_NSIMSGI18NURL

  // nsIURI over-ride...
  NS_IMETHOD SetSpec(const nsACString &aSpec) override;

  NS_IMETHOD IsUrlType(uint32_t type, bool *isType) override;

  // nsIMsgMailNewsUrl overrides
  NS_IMETHOD GetServer(nsIMsgIncomingServer **server) override;
  NS_IMETHOD GetFolder(nsIMsgFolder **msgFolder) override;
  NS_IMETHOD CloneInternal(uint32_t aRefHandlingMode,
                           const nsACString& newRef,nsIURI **_retval) override;

  // nsNntpUrl
  nsNntpUrl();

  NS_DECL_ISUPPORTS_INHERITED

private:
  virtual ~nsNntpUrl();
  nsresult DetermineNewsAction();
  nsresult ParseNewsURL();
  nsresult ParseNntpURL();

  nsCOMPtr<nsINNTPNewsgroupPost> m_newsgroupPost;
  nsNewsAction m_newsAction; // the action this url represents...parse mailbox, display messages, etc.

  nsCString mURI; // the RDF URI associated with this url.
  nsCString mCharsetOverride; // used by nsIMsgI18NUrl...

  nsCString mOriginalSpec;
  nsCOMPtr <nsIFile>  m_filePath;

  // used by save message to disk
  nsCOMPtr<nsIFile> m_messageFile;

  bool          m_addDummyEnvelope;
  bool          m_canonicalLineEnding;
  bool          m_getOldMessages;

  nsCString m_group;
  nsCString m_messageID;
  nsMsgKey m_key;
};

#endif // nsNntpUrl_h__
