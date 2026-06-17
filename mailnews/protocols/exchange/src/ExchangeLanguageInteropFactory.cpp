/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "ExchangeLanguageInteropFactory.h"

#include "ExchangeOAuth2CustomDetails.h"

NS_IMPL_ISUPPORTS(ExchangeLanguageInteropFactory,
                  IExchangeLanguageInteropFactory);

NS_IMETHODIMP ExchangeLanguageInteropFactory::CreateOAuth2Details(
    const nsACString& type, const nsACString& identifier,
    IOAuth2CustomDetails** result) {
  NS_ENSURE_ARG_POINTER(result);

  RefPtr<ExchangeOAuth2CustomDetails> details;
  nsresult rv = ExchangeOAuth2CustomDetails::ForTypeAndHostname(
      type, identifier, getter_AddRefs(details));
  NS_ENSURE_SUCCESS(rv, rv);

  details.forget(result);

  return NS_OK;
}
