/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_PROTOCOLS_EWS_SRC_EWSLANGUAGEINTEROPFACTORY_H_
#define COMM_MAILNEWS_PROTOCOLS_EWS_SRC_EWSLANGUAGEINTEROPFACTORY_H_

#include "IEwsLanguageInteropFactory.h"

/**
 * Factory implementation for creating instances of EWS interfaces to span
 * language boundaries.
 */
class EwsLanguageInteropFactory : public IEwsLanguageInteropFactory {
 public:
  NS_DECL_IEWSLANGUAGEINTEROPFACTORY
  NS_DECL_ISUPPORTS

  EwsLanguageInteropFactory() = default;

 protected:
  virtual ~EwsLanguageInteropFactory() = default;

 private:
};

#endif  // COMM_MAILNEWS_PROTOCOLS_EWS_SRC_EWSLANGUAGEINTEROPFACTORY_H_
