/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef _nsMsgMdnGenerator_H_
#define _nsMsgMdnGenerator_H_

#include "nsIMsgMdnGenerator.h"
#include "nsCOMPtr.h"
#include "nsIMsgOutgoingServer.h"
#include "nsIRequestObserver.h"
#include "nsIMsgIncomingServer.h"
#include "nsIOutputStream.h"
#include "nsIFile.h"
#include "nsIMsgIdentity.h"
#include "nsIMsgWindow.h"
#include "nsIMimeHeaders.h"
#include "MailNewsTypes2.h"

#define eNeverSendOp ((int32_t)0)
#define eAutoSendOp ((int32_t)1)
#define eAskMeOp ((int32_t)2)
#define eDeniedOp ((int32_t)3)

class nsMsgMdnGenerator : public nsIMsgMdnGenerator,
                          public nsIMsgOutgoingListener {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSIMSGMDNGENERATOR
  NS_DECL_NSIMSGOUTGOINGLISTENER

  nsMsgMdnGenerator();

 private:
  virtual ~nsMsgMdnGenerator();

  // Sanity Check methods
  bool ProcessSendMode();  // must called prior ValidateReturnPath
  bool ValidateReturnPath();
  bool NotInToOrCc();
  bool MailAddrMatch(const char* addr1, const char* addr2);

  nsresult StoreMDNSentFlag(nsIMsgFolder* folder, nsMsgKey key);
  nsresult ClearMDNNeededFlag(nsIMsgFolder* folder, nsMsgKey key);
  nsresult NoteMDNRequestHandled();

  nsresult CreateMdnMsg();
  nsresult CreateFirstPart();
  nsresult CreateSecondPart();
  nsresult CreateThirdPart();
  nsresult SendMdnMsg();

  // string bundle helper methods
  nsresult GetStringFromName(const char* aName, nsAString& aResultString);
  nsresult FormatStringFromName(const char* aName, const nsString& aString,
                                nsAString& aResultString);

  // other helper methods
  nsresult InitAndProcess(bool* needToAskUser);
  nsresult OutputAllHeaders();
  nsresult WriteString(const char* str);

 private:
  EDisposeType m_disposeType;
  nsCOMPtr<nsIMsgWindow> m_window;
  nsCOMPtr<nsIOutputStream> m_outputStream;
  nsCOMPtr<nsIFile> m_file;
  nsCOMPtr<nsIMsgIdentity> m_identity;
  nsMsgKey m_key;
  nsCString m_email;
  nsCString m_mimeSeparator;
  // The Message-ID of the MDN reply.
  nsCString m_messageId;
  // The Message-ID of the message the MDN reply is for.
  nsCString m_originalMessageId;
  nsCOMPtr<nsIMsgFolder> m_folder;
  nsCOMPtr<nsIMsgIncomingServer> m_server;
  nsCOMPtr<nsIMimeHeaders> m_headers;
  nsCString m_dntRrt;
  int32_t m_notInToCcOp;
  int32_t m_outsideDomainOp;
  int32_t m_otherOp;
  bool m_reallySendMdn;
  bool m_autoSend;
  bool m_autoAction;
  bool m_mdnEnabled;
};

#endif  // _nsMsgMdnGenerator_H_
