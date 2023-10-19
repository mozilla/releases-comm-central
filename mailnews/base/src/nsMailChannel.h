/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef nsMailChannel_h__
#define nsMailChannel_h__

#include "nsIMailChannel.h"
#include "nsIWritablePropertyBag2.h"
#include "nsTArray.h"
#include "nsTString.h"
#include "calIItipItem.h"
#include "nsIWeakReferenceUtils.h"

class nsMailChannel : public nsIMailChannel {
 public:
  NS_DECL_NSIMAILCHANNEL

 protected:
  nsTArray<nsCString> mHeaderNames;
  nsTArray<nsCString> mHeaderValues;
  nsTArray<RefPtr<nsIWritablePropertyBag2>> mAttachments;
  nsCString mMailCharacterSet;
  nsCString mImipMethod;
  nsCOMPtr<calIItipItem> mImipItem;
  nsCOMPtr<nsIMsgSMIMEHeaderSink> mSmimeHeaderSink;
  nsWeakPtr mListener;
};

#endif /* nsMailChannel_h__ */
