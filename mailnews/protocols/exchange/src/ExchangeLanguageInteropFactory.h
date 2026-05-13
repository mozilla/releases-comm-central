/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_PROTOCOLS_EXCHANGE_SRC_EXCHANGELANGUAGEINTEROPFACTORY_H_
#define COMM_MAILNEWS_PROTOCOLS_EXCHANGE_SRC_EXCHANGELANGUAGEINTEROPFACTORY_H_

#include "IExchangeLanguageInteropFactory.h"

/**
 * Factory implementation for creating instances of Exchange interfaces to span
 * language boundaries.
 */
class ExchangeLanguageInteropFactory : public IExchangeLanguageInteropFactory {
 public:
  NS_DECL_IEXCHANGELANGUAGEINTEROPFACTORY
  NS_DECL_ISUPPORTS

  ExchangeLanguageInteropFactory() = default;

 protected:
  virtual ~ExchangeLanguageInteropFactory() = default;

 private:
};

#endif  // COMM_MAILNEWS_PROTOCOLS_EXCHANGE_SRC_EXCHANGELANGUAGEINTEROPFACTORY_H_
