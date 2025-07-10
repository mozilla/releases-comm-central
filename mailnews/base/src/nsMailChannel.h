/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_BASE_SRC_NSMAILCHANNEL_H_
#define COMM_MAILNEWS_BASE_SRC_NSMAILCHANNEL_H_

#include "calIItipItem.h"
#include "nsIMailChannel.h"
#include "nsIMimeHeaders.h"
#include "nsIMsgOpenPGPSink.h"
#include "nsIMsgSMIMESink.h"
#include "nsIWeakReferenceUtils.h"
#include "nsIWritablePropertyBag2.h"
#include "nsString.h"
#include "nsTArray.h"

class nsMailChannel : public nsIMailChannel {
 public:
  NS_DECL_NSIMAILCHANNEL

 protected:
  nsTArray<nsCString> mHeaderNames;
  nsTArray<nsCString> mHeaderValues;
  nsCOMPtr<nsIMimeHeaders> mMimeHeaders;
  nsTArray<RefPtr<nsIWritablePropertyBag2>> mAttachments;
  nsCString mMailCharacterSet;
  nsCString mImipMethod;
  nsCOMPtr<calIItipItem> mImipItem;
  nsCOMPtr<nsIMsgOpenPGPSink> mOpenPGPSink;
  nsCOMPtr<nsIMsgSMIMESink> mSmimeSink;
  nsWeakPtr mListener;
};

#endif  // COMM_MAILNEWS_BASE_SRC_NSMAILCHANNEL_H_
