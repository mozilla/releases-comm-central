/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsMorkFactory.h"

NS_IMPL_ISUPPORTS(nsMorkFactoryService, nsIMdbFactoryService)

NS_IMETHODIMP nsMorkFactoryService::GetMdbFactory(nsIMdbFactory** aFactory) {
  if (!mMdbFactory) mMdbFactory = MakeMdbFactory();
  NS_IF_ADDREF(*aFactory = mMdbFactory);
  return *aFactory ? NS_OK : NS_ERROR_OUT_OF_MEMORY;
}
