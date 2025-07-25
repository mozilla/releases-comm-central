/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_COMPOSE_SRC_NSMSGCOMPOSEPARAMS_H_
#define COMM_MAILNEWS_COMPOSE_SRC_NSMSGCOMPOSEPARAMS_H_

#include "nsIMsgComposeParams.h"
#include "nsString.h"
#include "nsIMsgHdr.h"
#include "nsCOMPtr.h"
class nsMsgComposeParams : public nsIMsgComposeParams {
 public:
  nsMsgComposeParams();

  NS_DECL_ISUPPORTS
  NS_DECL_NSIMSGCOMPOSEPARAMS

 private:
  virtual ~nsMsgComposeParams();
  MSG_ComposeType mType;
  MSG_ComposeFormat mFormat;
  nsCString mOriginalMsgUri;
  nsCOMPtr<nsIMsgIdentity> mIdentity;
  nsCOMPtr<nsIMsgCompFields> mComposeFields;
  bool mBodyIsLink;
  nsCOMPtr<nsIMsgSendListener> mSendListener;
  nsString mSMTPPassword;
  nsCOMPtr<nsIMsgDBHdr> mOrigMsgHdr;
  bool mAutodetectCharset;
  nsCString mHtmlToQuote;
};

#endif  // COMM_MAILNEWS_COMPOSE_SRC_NSMSGCOMPOSEPARAMS_H_
