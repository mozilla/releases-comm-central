/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef nsPop3URL_h__
#define nsPop3URL_h__

#include "nsIPop3URL.h"
#include "nsMsgMailNewsUrl.h"
#include "nsCOMPtr.h"

class nsPop3URL : public nsIPop3URL, public nsMsgMailNewsUrl {
 public:
  NS_DECL_NSIPOP3URL
  nsPop3URL();
  static nsresult NewURI(const nsACString& aSpec, nsIURI* aBaseURI,
                         nsIURI** _retval);
  NS_DECL_ISUPPORTS_INHERITED

 protected:
  virtual ~nsPop3URL();

  nsCString m_messageUri;

  /* Pop3 specific event sinks */
  nsCOMPtr<nsIPop3Sink> m_pop3Sink;

  // convenience function to make constructing of the pop3 url easier...
  static nsresult BuildPop3Url(const char* urlSpec, nsIMsgFolder* inbox,
                               nsIPop3IncomingServer*,
                               nsIUrlListener* aUrlListener, nsIURI** aUrl,
                               nsIMsgWindow* aMsgWindow);
};

#endif  // nsPop3URL_h__
