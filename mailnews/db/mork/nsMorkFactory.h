/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef nsMorkFactory_h__
#define nsMorkFactory_h__

#include "mozilla/ModuleUtils.h"
#include "nsCOMPtr.h"
#include "nsIMdbFactoryFactory.h"
#include "mdb.h"

class nsMorkFactoryService final : public nsIMdbFactoryService {
 public:
  nsMorkFactoryService() {};
  // nsISupports methods
  NS_DECL_ISUPPORTS

  NS_IMETHOD GetMdbFactory(nsIMdbFactory** aFactory) override;

 protected:
  ~nsMorkFactoryService() {}
  nsCOMPtr<nsIMdbFactory> mMdbFactory;
};

#endif
