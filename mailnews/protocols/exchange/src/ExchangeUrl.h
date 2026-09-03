/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
#ifndef COMM_MAILNEWS_PROTOCOLS_EXCHANGE_SRC_EXCHANGEURL_H_
#define COMM_MAILNEWS_PROTOCOLS_EXCHANGE_SRC_EXCHANGEURL_H_

#include "nsMsgMailNewsUrl.h"

/**
 * The internal URL to an Exchange resource.
 *
 * This is needed so that Thunderbird's CSP checks can run in Exchange channels.
 * `nsMsgContentPolicy::ShouldLoad` (which is invoked by
 * `nsContentSecurityManager::doContentSecurityCheck`) has a strong expectation
 * that URLs implement `nsIMsgMessageUrl`.
 */
class ExchangeUrl : public nsMsgMailNewsUrl, public nsIMsgMessageUrl {
 public:
   NS_DECL_ISUPPORTS_INHERITED
   NS_DECL_NSIMSGMESSAGEURL

   ExchangeUrl();

 protected:
   virtual ~ExchangeUrl() = default;

 private:
   nsCOMPtr<nsIFile> mMessageFile;
   bool mCanonicalLineEnding;
};

#endif  // COMM_MAILNEWS_PROTOCOLS_EXCHANGE_SRC_EXCHANGEURL_H_
